import { HPLC_CONFIG } from "./simulator-config.js";

/** Displays a Simulation's SI samples and particle positions without advancing it.
 * Constructor receives DOM canvas/container/scroll/shell and the Chart/PIXI libraries;
 * depends on HPLC_CONFIG. */
export class SimulationView {
  constructor({ container, canvas, scroll, shell, Chart, PIXI }) {
    this.container = container;
    this.scroll = scroll;
    this.shell = shell;
    this.PIXI = PIXI;
    this.zoom = 1;
    this.sprites = [];
    this.app = new PIXI.Application({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
    });
    container.appendChild(this.app.view);
    this.particleContainer = new PIXI.ParticleContainer(
      HPLC_CONFIG.maxParticles,
      { position: true },
    );
    this.app.stage.addChild(this.particleContainer);
    const graphics = new PIXI.Graphics();
    graphics.beginFill(0xffffff).drawCircle(0, 0, 3).endFill();
    this.texture = this.app.renderer.generateTexture(graphics);
    graphics.destroy();
    this.chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: HPLC_CONFIG.detectorWindowMinutes,
            title: { display: true, text: "Time (min)" },
          },
          y: {
            min: 0,
            suggestedMax: 10,
            title: { display: true, text: "Signal (mass/s)" },
          },
        },
        plugins: { legend: { position: "top", align: "end" } },
      },
    });
  }

  /** Use this function to discard the previous run's plot and sprites; inputs
   * are the optional next Simulation; depends on chart, particleContainer and PIXI. */
  reset(simulation = null) {
    this.simulation = simulation;
    for (const sprite of this.particleContainer.removeChildren())
      sprite.destroy();
    this.sprites = [];
    this.chart.data.datasets =
      simulation?.solutes.map((solute) => ({
        label: solute.name,
        data: [],
        borderColor: solute.color,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0,
        stepped: simulation.mode === "stochastic" ? "middle" : false,
      })) ?? [];
    if (simulation) {
      for (const index of simulation.soluteIndices) {
        const sprite = new this.PIXI.Sprite(this.texture);
        sprite.tint = simulation.solutes[index].hexColor;
        this.particleContainer.addChild(sprite);
        this.sprites.push(sprite);
      }
    }
    this.updateViewport(0);
    this.scroll.scrollLeft = 0;
    this.chart.update("none");
  }

  /** Use this function to consume new SI detector samples and repaint particles;
   * simulation is the active Simulation, repaint controls chart redraws; depends on chart/app. */
  render(simulation, repaint = true) {
    const samples = simulation.drainSamples();
    samples.forEach((points, index) => {
      for (const point of points) {
        this.chart.data.datasets[index].data.push({
          x: point.time / 60,
          y: point.intensity,
        });
      }
    });
    const height = this.app.screen.height * 0.95;
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      sprite.y =
        (simulation.positions[i] / simulation.system.columnLength) * height;
      // Lateral lanes are display-only; no renderer randomness affects transport.
      sprite.x =
        this.app.screen.width * (0.2 + 0.6 * ((i * 0.61803398875) % 1));
      sprite.visible = sprite.y >= 0 && sprite.y < height;
    }
    if (repaint) {
      this.updateViewport(simulation.time / 60);
      this.chart.update("none");
    }
  }

  /** Use this function to resize the detector viewport for timeMinutes and zoom;
   * depends on HPLC_CONFIG, chart, shell and scroll. */
  updateViewport(timeMinutes) {
    const windows = Math.max(
      1,
      Math.ceil(timeMinutes / HPLC_CONFIG.detectorWindowMinutes),
    );
    const width = Math.max(
      this.scroll.clientWidth || 800,
      windows * HPLC_CONFIG.detectorWindowPixels * this.zoom,
    );
    if (this.shell.style.width !== `${width}px`) {
      this.shell.style.width = `${width}px`;
      this.chart.resize();
    }
    this.chart.options.scales.x.max =
      windows * HPLC_CONFIG.detectorWindowMinutes;
  }

  /** Use this function when a hidden simulation panel becomes visible or changes
   * size; no inputs; depends on app, chart, updateViewport and the current simulation. */
  resize() {
    this.app.resize();
    this.chart.resize();
    this.updateViewport((this.simulation?.time ?? 0) / 60);
    this.chart.update("none");
  }

  /** Use this function to release browser graphics resources on page teardown;
   * no inputs; depends on chart, texture and app. */
  destroy() {
    this.chart.destroy();
    this.app.destroy(true, { children: true });
    this.texture.destroy(true);
  }
}
