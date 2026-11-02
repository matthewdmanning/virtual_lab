import { SimulationView } from "./simulation-view.js";
import { UIController } from "./ui-controller.js";

try {
  if (!globalThis.Chart || !globalThis.PIXI) {
    throw new Error(
      "The chart/particle display libraries could not load. Reload the page to retry.",
    );
  }
  const view = new SimulationView({
    container: document.getElementById("pixiContainer"),
    canvas: document.getElementById("chromatogram"),
    scroll: document.getElementById("detectorScroll"),
    shell: document.getElementById("detectorCanvasShell"),
    Chart: globalThis.Chart,
    PIXI: globalThis.PIXI,
  });
  const controller = new UIController(view);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      cancelAnimationFrame(controller.frameId);
      view.destroy();
    }
  });
} catch (error) {
  document.getElementById("physicsStatus").textContent = error.message;
  document.getElementById("injectBtn").disabled = true;
}
