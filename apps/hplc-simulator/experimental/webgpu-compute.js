// Experimental PDE solver; the production Simulation does not require WebGPU.
export class ChromatographyGPU {
  constructor(gridSize = 256, initialConcentration = null) {
    if (!Number.isInteger(gridSize) || gridSize < 2) {
      throw new RangeError("Grid size must be an integer of at least 2.");
    }
    this.gridSize = gridSize;
    this.initialState = initialConcentration
      ? new Float32Array(initialConcentration)
      : new Float32Array(gridSize);

    if (this.initialState.length !== gridSize) {
      throw new RangeError(`Initial concentration must contain ${gridSize} values.`);
    }
    if (Array.from(this.initialState).some((value) => !Number.isFinite(value))) {
      throw new RangeError("Initial concentration must contain finite values.");
    }

    this.isEvenFrame = true;
  }

  async init(wgslCode) {
    if (typeof wgslCode !== "string" || wgslCode.trim() === "") {
      throw new TypeError("A WGSL shader source string is required.");
    }

    if (typeof navigator === "undefined" || !navigator.gpu) {
      throw new Error("WebGPU is not supported by this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter is available.");
    }

    this.device = await adapter.requestDevice();
    if (!this.device) {
      throw new Error("Could not create a WebGPU device.");
    }

    const shaderModule = this.device.createShaderModule({ code: wgslCode });
    await shaderModule.getCompilationInfo?.();
    const bufferSize = this.gridSize * Float32Array.BYTES_PER_ELEMENT;

    this.bufferA = this.createStorageBuffer(bufferSize);
    this.bufferB = this.createStorageBuffer(bufferSize);
    this.device.queue.writeBuffer(this.bufferA, 0, this.initialState);

    this.paramBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" }
    });

    this.bindGroupA = this.createBindGroup(this.bufferA, this.bufferB);
    this.bindGroupB = this.createBindGroup(this.bufferB, this.bufferA);
  }

  createStorageBuffer(size) {
    return this.device.createBuffer({
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });
  }

  createBindGroup(inputBuffer, outputBuffer) {
    return this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
        { binding: 2, resource: { buffer: this.paramBuffer } }
      ]
    });
  }

  updateParams(u, dispersion, dt, dz) {
    const values = [u, dispersion, dt, dz];
    if (values.some((value) => !Number.isFinite(value))) {
      throw new TypeError("Simulation parameters must be finite numbers.");
    }
    if (u <= 0 || dispersion < 0 || dt <= 0 || dz <= 0 ||
        u * dt / dz + 2 * dispersion * dt / (dz * dz) > 1) {
      throw new RangeError("Use positive SI grid steps satisfying u*dt/dz + 2*D*dt/dz² <= 1.");
    }
    if (Array.from(new Float32Array([u, dispersion, dt, dz])).some((value) => !Number.isFinite(value))) {
      throw new RangeError("Simulation parameters must fit in GPU f32 values.");
    }
    if (!this.device) {
      throw new Error("The WebGPU simulation has not been initialized.");
    }

    const params = new ArrayBuffer(32);
    const floats = new Float32Array(params, 0, 4);
    const uints = new Uint32Array(params, 16, 1);

    floats.set([u, dispersion, dt, dz]);
    uints[0] = this.gridSize;
    this.device.queue.writeBuffer(this.paramBuffer, 0, params);
  }

  step() {
    if (!this.device) {
      throw new Error("The WebGPU simulation has not been initialized.");
    }
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.isEvenFrame ? this.bindGroupA : this.bindGroupB);
    pass.dispatchWorkgroups(Math.ceil(this.gridSize / 64));
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.isEvenFrame = !this.isEvenFrame;
  }

  async read() {
    if (!this.device) {
      throw new Error("The WebGPU simulation has not been initialized.");
    }
    const inputBuffer = this.isEvenFrame ? this.bufferA : this.bufferB;
    const encoder = this.device.createCommandEncoder();
    const readBuffer = this.device.createBuffer({
      size: this.gridSize * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    encoder.copyBufferToBuffer(
      inputBuffer,
      0,
      readBuffer,
      0,
      this.gridSize * Float32Array.BYTES_PER_ELEMENT
    );
    this.device.queue.submit([encoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();
    await readBuffer.mapAsync(GPUMapMode.READ);
    const concentration = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    readBuffer.destroy();
    return concentration;
  }

  reset(initialConcentration = this.initialState) {
    if (!this.device) {
      throw new Error("The WebGPU simulation has not been initialized.");
    }
    if (initialConcentration.length !== this.gridSize) {
      throw new RangeError(`Initial concentration must contain ${this.gridSize} values.`);
    }
    const nextState = new Float32Array(initialConcentration);
    if (Array.from(nextState).some((value) => !Number.isFinite(value))) {
      throw new RangeError("Initial concentration must contain finite values.");
    }

    this.initialState = nextState;
    this.device.queue.writeBuffer(this.bufferA, 0, this.initialState);
    this.device.queue.writeBuffer(this.bufferB, 0, new Float32Array(this.gridSize));
    this.isEvenFrame = true;
  }

  destroy() {
    this.bufferA?.destroy();
    this.bufferB?.destroy();
    this.paramBuffer?.destroy();
  }
}
