// Experimental transport stencil. Ping-pong input/output buffers each step.
@group(0) @binding(0) var<storage, read> input_c: array<f32>;
@group(0) @binding(1) var<storage, read_write> output_c: array<f32>;

struct SimParams {
    u: f32,       // Linear velocity
    D_L: f32,     // Axial dispersion coefficient
    dt: f32,      // Time step
    dz: f32,      // Spatial grid step
    grid_size: u32, // Number of nodes
    _padding0: u32,
    _padding1: u32,
    _padding2: u32,
}
@group(0) @binding(2) var<uniform> params: SimParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    
    // Boundary conditions
    if (i >= params.grid_size) { return; }
    if (i == 0 || i == params.grid_size - 1) {
        output_c[i] = input_c[i];
        return;
    }

    let c = input_c[i];
    let c_prev = input_c[i - 1];
    let c_next = input_c[i + 1];

    // Upwind scheme for Advection: u * (dc/dz)
    let advection = params.u * (params.dt / params.dz) * (c - c_prev);
    
    // Central difference for Dispersion: D_L * (d^2c/dz^2)
    let dispersion = params.D_L * (params.dt / (params.dz * params.dz)) * (c_next - 2.0 * c + c_prev);

    // Calculate new concentration 
    // (Phase equilibrium / retention factor would modify 'u' and 'D_L' to effective values prior to this step)
    output_c[i] = c - advection + dispersion;
}
