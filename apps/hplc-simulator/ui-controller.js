import {
  HPLC_CONFIG as CONFIG,
  UI_LABELS,
  DEFAULT_SYSTEM,
} from "./simulator-config.js";
import { calculateHydrodynamics, FLOW_MODELS } from "./physics-models.js";
import { Simulation } from "./simulation.js";
import { DEFAULT_COMPOUNDS } from "./compounds.js";
import {
  loadPreloadedCompounds,
  lookupCompound,
  mergeCompounds,
  readSearchedCompounds,
  rememberSearchedCompound,
} from "./pubchem.js";

/** Ids of Settings selectors and model parameter inputs read by getSystemInputs. */
const MODEL_FIELD_IDS = Object.freeze([
  "compressibilityModel",
  "compressibility",
  "retentionModel",
  "pressureRetentionModel",
  "molarVolumeChange",
  "dispersionModel",
  "knoxA",
  "knoxB",
  "knoxC",
  "elutionMode",
  "gradientSolver",
  "gradientFinal",
  "gradientTime",
  "dwellVolume",
  "transportModel",
  "particlePorosity",
  "tortuosity",
  "langmuirB",
  "sampleConcentration",
  "extraColumnModel",
  "tubingDiameter",
  "tubingLength",
  "cellVolume",
  "injectionVolume",
  "hsmH",
  "hsmS",
  "hsmA",
  "hsmB",
  "hsmC",
  "lserC",
  "lserE",
  "lserS",
  "lserA",
  "lserB",
  "lserV",
]);
const HSM_SOLUTE_KEYS = Object.freeze([
  ["eta", "η'"],
  ["sigma", "σ'"],
  ["beta", "β'"],
  ["alpha", "α'"],
  ["kappa", "κ'"],
]);
const LSER_SOLUTE_KEYS = Object.freeze([
  ["E", "E"],
  ["S", "S"],
  ["A", "A"],
  ["B", "B"],
  ["V", "V"],
]);

/** Owns browser controls and animation scheduling around the DOM-free Simulation.
 * Constructor receives SimulationView; depends on config, physics, Simulation,
 * local compound data, and optional PubChem lookup. */
/**
 * Framework pairs whose assumptions are mutually exclusive; the UI greys out the other choice.
 * Gradient LSS needs k(Φ): HSM column parameters and LSER system constants hold for one mobile-phase
 * composition. LSS gradient theory assumes a linear isotherm, which Langmuir overload breaks.
 */
export const FRAMEWORK_EXCLUSIONS = Object.freeze([
  {
    a: ["elutionMode", "gradient"],
    b: ["retentionModel", "hsm"],
    reason:
      "HSM parameters hold for one mobile-phase composition; gradients change it.",
  },
  {
    a: ["elutionMode", "gradient"],
    b: ["retentionModel", "lser"],
    reason:
      "LSER system constants hold for one mobile-phase composition; gradients change it.",
  },
  {
    a: ["elutionMode", "gradient"],
    b: ["transportModel", "langmuir"],
    reason:
      "LSS gradient theory assumes a linear isotherm; Langmuir overload is nonlinear.",
  },
]);

/** Use this function to list options to disable, as { id: { option: reason } }, from current select values. */
export function excludedOptions(values) {
  const excluded = {};
  const block = ([id, option], reason) => {
    (excluded[id] ??= {})[option] = reason;
  };
  for (const { a, b, reason } of FRAMEWORK_EXCLUSIONS) {
    if (values[a[0]] === a[1]) block(b, reason);
    if (values[b[0]] === b[1]) block(a, reason);
  }
  return excluded;
}

export class UIController {
  constructor(view) {
    this.view = view;
    this.simulation = null;
    this.paused = false;
    this.frameId = null;
    this.previousTimestamp = null;
    this.lastPaint = 0;
    this.tick = this.tick.bind(this);
    this.catalog = mergeCompounds(DEFAULT_COMPOUNDS, readSearchedCompounds());
    this.bindElements();
    this.bindTabs();
    this.attachGlobalEvents();
    this.createSoluteRow(0);
    this.createSoluteRow(1);
    this.bindDetectorZoom();
    this.updateVisuals();
    this.loadCatalog();
  }

  /** Use this function to merge the cached/remote PubChem catalog into the compound menu;
   * no inputs; depends on loadPreloadedCompounds and the search cache. */
  async loadCatalog() {
    const status = document.getElementById("soluteCatalogStatus");
    const remote = await loadPreloadedCompounds({ includeRemote: true });
    this.catalog = mergeCompounds(
      remote,
      DEFAULT_COMPOUNDS,
      readSearchedCompounds(),
      this.catalog,
    );
    const loaded = remote.some((compound) => compound.cid !== null);
    if (status)
      status.textContent = loaded
        ? `${this.catalog.length} compounds available; PubChem search optional`
        : "Local compounds available; PubChem catalog unavailable";
  }

  /** Use this function to bind click and arrow/Home/End keyboard navigation;
   * no inputs; depends on tab DOM buttons and selectTab. */
  bindTabs() {
    this.tabs = Array.from(document.querySelectorAll('[role="tab"][data-tab]'));
    this.tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => this.selectTab(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % this.tabs.length;
        else if (event.key === "ArrowLeft")
          next = (index - 1 + this.tabs.length) % this.tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = this.tabs.length - 1;
        else return;
        event.preventDefault();
        this.selectTab(this.tabs[next].dataset.tab, true);
      });
    });
    this.selectTab(
      this.tabs.find((tab) => tab.getAttribute("aria-selected") === "true")
        ?.dataset.tab ?? "analytes",
    );
  }

  /** Use this function to show a named tab and resize the revealed simulation;
   * inputs are tab name and optional focus flag; depends on tab DOM and SimulationView.resize. */
  selectTab(name, focus = false) {
    const selected = this.tabs.find((tab) => tab.dataset.tab === name);
    if (!selected) throw new RangeError(`Unknown tab: ${name}`);
    for (const tab of this.tabs) {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden =
        !active;
    }
    this.activeTab = name;
    if (focus) selected.focus();
    if (name === "simulation")
      requestAnimationFrame(() => {
        if (this.activeTab === "simulation") this.view.resize();
      });
  }

  bindElements() {
    this.inputs = {
      statPhase: document.getElementById("statPhase"),
      solventSystem: document.getElementById("solventSystem"),
      simMode: document.getElementById("simMode"),
      flowModel: document.getElementById("flowModel"),
      ...Object.fromEntries(
        MODEL_FIELD_IDS.map((id) => [id, document.getElementById(id)]),
      ),
      colLengthSlider: document.getElementById("colLength"),
      colLengthNum: document.getElementById("colLengthNum"),
      organicSlider: document.getElementById("organic"),
      organicNum: document.getElementById("organicNum"),
      pressureSlider: document.getElementById("pressure"),
      pressureNum: document.getElementById("pressureNum"),
      simulationSpeedSlider: document.getElementById("simulationSpeed"),
      simulationSpeedNum: document.getElementById("simulationSpeedNum"),
    };

    this.buttons = {
      inject: document.getElementById("injectBtn"),
      pause: document.getElementById("pauseBtn"),
      flush: document.getElementById("flushBtn"),
      addSolute: document.getElementById("addSoluteBtn"),
    };

    this.panels = {
      control: document.getElementById("controlPanel"),
      soluteContainer: document.getElementById("soluteContainer"),
      pixiContainer: document.getElementById("pixiContainer"),
    };
  }

  attachGlobalEvents() {
    this.sync(
      this.inputs.colLengthSlider,
      this.inputs.colLengthNum,
      true,
      CONFIG.columnLengthsMm,
    );
    this.sync(this.inputs.organicSlider, this.inputs.organicNum);
    this.sync(this.inputs.pressureSlider, this.inputs.pressureNum);
    this.sync(
      this.inputs.simulationSpeedSlider,
      this.inputs.simulationSpeedNum,
    );
    this.inputs.flowModel.addEventListener("change", () =>
      this.updateVisuals(),
    );
    for (const id of MODEL_FIELD_IDS) {
      this.inputs[id].addEventListener("change", () => {
        this.applyConditionalFields();
        this.updateVisuals();
      });
    }
    this.applyConditionalFields();
    this.updateDerivedFlow();

    window.addEventListener("resize", () => {
      this.updateVisuals();
      if (this.activeTab === "simulation") this.view.resize();
    });
    document.addEventListener("visibilitychange", () => {
      if (
        document.hidden &&
        this.simulation &&
        !this.simulation.finished &&
        !this.paused
      ) {
        this.buttons.pause.click();
      }
    });

    this.buttons.addSolute.addEventListener("click", () => {
      const count =
        this.panels.soluteContainer.querySelectorAll(".solute-row").length;
      if (count < CONFIG.maxSolutes) this.createSoluteRow(count);
      else
        alert(UI_LABELS.maximumSolutes.replace("{count}", CONFIG.maxSolutes));
    });

    this.buttons.inject.addEventListener("click", () => this.handleInject());
    this.buttons.pause.addEventListener("click", () => {
      this.paused = !this.paused;
      this.buttons.pause.innerText = this.paused
        ? UI_LABELS.resume
        : UI_LABELS.pause;
      this.previousTimestamp = null;
      if (this.paused) cancelAnimationFrame(this.frameId);
      else this.frameId = requestAnimationFrame(this.tick);
    });
    this.buttons.flush.addEventListener("click", () => {
      cancelAnimationFrame(this.frameId);
      this.simulation = null;
      this.paused = false;
      this.previousTimestamp = null;
      this.view.reset();
      this.setControlsLocked(false);
      this.toggleButtons(true, false, false);
    });
  }

  sync(slider, num, isArray = false, arr = []) {
    slider.addEventListener("input", () => {
      num.value = isArray ? arr[slider.value] : slider.value;
      this.updateVisuals();
    });
    num.addEventListener("input", () => {
      if (!isArray) {
        slider.value = num.value;
        this.updateVisuals();
      }
    });
  }

  updateVisuals() {
    if (this.simulation && !this.simulation.finished) return;

    this.updateDerivedFlow();

    // Adjust height of the vertical column based on slider
    const ratio =
      CONFIG.columnLengthsMm[this.inputs.colLengthSlider.value] / 300;
    this.panels.pixiContainer.style.height = `${ratio * 100}%`;

    // Trigger WebGL resize safely
    if (this.activeTab === "simulation")
      requestAnimationFrame(() => this.view.resize());

    // Adjust solvent color
    const org = parseInt(this.inputs.organicSlider.value);
    const r = Math.floor(219 + (org / 100) * (243 - 219));
    const g = Math.floor(234 + (org / 100) * (244 - 234));
    const b = Math.floor(254 - (org / 100) * (254 - 246));
    this.panels.pixiContainer.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  }

  /** Use this function to translate UI geometry, pressure, and solvent controls
   * into SI pipeline inputs; depends on HPLC_CONFIG and this.inputs. */
  getSystemInputs() {
    const value = (id) => this.inputs[id].value;
    const number = (id) => parseFloat(this.inputs[id].value);
    const system = {
      ...DEFAULT_SYSTEM,
      columnLength: parseFloat(this.inputs.colLengthNum.value) / 1000,
      pressureDrop: parseFloat(this.inputs.pressureNum.value) * 1e5,
      organicFraction: parseFloat(this.inputs.organicNum.value) / 100,
      phaseModifier: parseFloat(this.inputs.statPhase.value),
      solventModifier: parseFloat(this.inputs.solventSystem.value),
      flowModel:
        Object.values(FLOW_MODELS).find(
          (model) => model.id === this.inputs.flowModel.value,
        ) ?? FLOW_MODELS.kozenyCarman,
      compressibility:
        value("compressibilityModel") === "compressible"
          ? number("compressibility") * 1e-9
          : 0,
      retentionModel: value("retentionModel"),
      dispersionModel: value("dispersionModel"),
      transportModel: value("transportModel"),
    };
    if (system.retentionModel === "hsm") {
      system.columnHsm = {
        H: number("hsmH"),
        S: number("hsmS"),
        A: number("hsmA"),
        B: number("hsmB"),
        C: number("hsmC"),
      };
    }
    if (system.retentionModel === "lser") {
      system.lserSystem = {
        c: number("lserC"),
        e: number("lserE"),
        s: number("lserS"),
        a: number("lserA"),
        b: number("lserB"),
        v: number("lserV"),
      };
    }
    if (value("pressureRetentionModel") === "on") {
      system.pressureRetention = {
        molarVolumeChange: number("molarVolumeChange") * 1e-6,
      };
    }
    if (system.dispersionModel === "knox") {
      system.knox = {
        A: number("knoxA"),
        B: number("knoxB"),
        C: number("knoxC"),
      };
    }
    if (system.transportModel === "lpm") {
      system.lumpedPore = {
        particlePorosity: number("particlePorosity"),
        tortuosity: number("tortuosity"),
      };
    }
    // UI units: L/mmol = m³/mol, mmol/L = mol/m³, µL → m³, mL → m³, mm → m, min → s.
    if (system.transportModel === "langmuir") {
      system.langmuir = {
        b: number("langmuirB"),
        sampleConcentration: number("sampleConcentration"),
        injectionVolume: number("injectionVolume") * 1e-9,
      };
    }
    if (value("elutionMode") === "gradient") {
      system.gradient = {
        finalFraction: number("gradientFinal") / 100,
        gradientTime: number("gradientTime") * 60,
        dwellVolume: number("dwellVolume") * 1e-6,
        solver: value("gradientSolver"),
      };
    }
    if (value("extraColumnModel") === "calculated") {
      system.extraColumn = {
        injectionVolume: number("injectionVolume") * 1e-9,
        tubingRadius: (number("tubingDiameter") / 2) * 1e-3,
        tubingLength: number("tubingLength") * 1e-3,
        cellVolume: number("cellVolume") * 1e-9,
      };
    }
    return system;
  }

  /** Use this function to show only the parameter fields of selected models; hidden fields are
   * disabled so browser validation skips them. Depends on [data-show-when="id=a|b"] markup. */
  applyConditionalFields(locked = false) {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    document.querySelectorAll("[data-show-when]").forEach((element) => {
      const [id, options] = element.dataset.showWhen.split("=");
      const visible = options
        .split("|")
        .includes(document.getElementById(id)?.value);
      element.hidden = !visible;
      element
        .querySelectorAll("input, select")
        .forEach((input) => (input.disabled = !visible || locked));
    });
    const ids = [
      ...new Set(FRAMEWORK_EXCLUSIONS.flatMap(({ a, b }) => [a[0], b[0]])),
    ];
    const excluded = excludedOptions(
      Object.fromEntries(
        ids.map((id) => [id, document.getElementById(id)?.value]),
      ),
    );
    for (const id of ids) {
      document
        .getElementById(id)
        ?.querySelectorAll?.("option")
        .forEach((option) => {
          const reason = excluded[id]?.[option.value];
          option.disabled = Boolean(reason);
          option.title = reason ?? "";
        });
    }
  }

  updateDerivedFlow() {
    try {
      const flow = calculateHydrodynamics(this.getSystemInputs());
      document.getElementById("flowOutput").value = (
        (flow.flowRate * 60) /
        1e-6
      ).toFixed(2);
    } catch {
      document.getElementById("flowOutput").value = "—";
    }
  }

  createSoluteRow(index) {
    const initialSolute = DEFAULT_COMPOUNDS[index % DEFAULT_COMPOUNDS.length];
    const rowHTML = `
            <div class="solute-row border p-2 rounded bg-white shadow-sm flex flex-col gap-2">
                <div class="flex justify-between items-center">
                    <span class="font-bold text-sm solute-label ${CONFIG.textColors[index]}">${UI_LABELS.solute} ${String.fromCharCode(65 + index)}</span>
                    <label class="text-xs flex items-center gap-1 cursor-pointer"><input type="checkbox" class="custom-toggle"> ${UI_LABELS.custom}</label>
                </div>
                <div class="relative lookup-shell">
                    <input type="text" aria-label="Compound name" autocomplete="off" placeholder="${UI_LABELS.soluteSearchPlaceholder}" class="lookup-box hidden w-full p-1 border rounded text-sm outline-blue-500">
                    <div class="compound-menu hidden" role="listbox"></div>
                </div>
                <div class="param-grid" data-show-when="retentionModel=hsm">
                    ${HSM_SOLUTE_KEYS.map(([key, label]) => `<label class="param-field">HSM ${label} <input type="number" class="hsm-${key} w-16 text-right border rounded px-1" step="any" required></label>`).join("")}
                </div>
                <div class="param-grid" data-show-when="retentionModel=lser">
                    ${LSER_SOLUTE_KEYS.map(([key, label]) => `<label class="param-field">LSER ${label} <input type="number" class="lser-${key} w-16 text-right border rounded px-1" step="any" required></label>`).join("")}
                </div>
                <div class="params">
                    <label class="flex justify-between text-xs font-semibold text-gray-600">${UI_LABELS.logP} <input type="number" class="logp-num w-16 text-right border rounded px-1" value="2.0" step="any" required></label>
                    <input type="range" class="logp-slider w-full mt-1" min="-2" max="6" step="0.1" value="2.0">
                </div>
            </div>
        `;
    this.panels.soluteContainer.insertAdjacentHTML("beforeend", rowHTML);

    const rows = this.panels.soluteContainer.querySelectorAll(".solute-row");
    const newRow = rows[rows.length - 1];

    const toggle = newRow.querySelector(".custom-toggle");
    const lookup = newRow.querySelector(".lookup-box");
    const params = newRow.querySelector(".params");

    this.sync(
      newRow.querySelector(".logp-slider"),
      newRow.querySelector(".logp-num"),
    );
    this.applyCompound(newRow, initialSolute);
    lookup.classList.remove("hidden");
    params.classList.add("opacity-50", "pointer-events-none");
    this.bindCompoundMenu(newRow);

    toggle.addEventListener("change", () => {
      newRow.dataset.lookupVersion = String(
        Number(newRow.dataset.lookupVersion || 0) + 1,
      );
      lookup.classList.remove("animate-pulse");
      lookup.classList.toggle("hidden", toggle.checked);
      params.classList.toggle("opacity-50", !toggle.checked);
      params.classList.toggle("pointer-events-none", !toggle.checked);
    });

    lookup.addEventListener("change", async (e) =>
      this.handleSoluteSearch(e.target, newRow),
    );
    this.applyConditionalFields(
      Boolean(this.simulation && !this.simulation.finished),
    );
  }

  bindCompoundMenu(row) {
    const input = row.querySelector(".lookup-box");
    const menu = row.querySelector(".compound-menu");

    const renderMatches = () => {
      const query = input.value.trim().toLowerCase();
      const matches = this.catalog
        .filter(
          (compound) => !query || compound.name.toLowerCase().includes(query),
        )
        .slice(0, 60);
      const grouped = new Map();
      for (const compound of matches) {
        const category = compound.category || "Other";
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category).push(compound);
      }

      menu.replaceChildren();
      for (const [category, compounds] of grouped) {
        const heading = document.createElement("div");
        heading.className =
          "sticky top-0 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600";
        heading.textContent = category;
        menu.appendChild(heading);
        for (const compound of compounds) {
          const option = document.createElement("button");
          option.type = "button";
          option.className =
            "block w-full px-3 py-2 text-left text-sm hover:bg-blue-50";
          option.textContent = compound.name;
          option.addEventListener("mousedown", (event) => {
            event.preventDefault();
            input.value = compound.name;
            menu.classList.add("hidden");
            this.applyCompound(row, compound);
          });
          menu.appendChild(option);
        }
      }
      const typed = input.value.trim();
      if (
        typed &&
        !this.catalog.some((compound) => compound.name.toLowerCase() === query)
      ) {
        const search = document.createElement("button");
        search.type = "button";
        search.className =
          "compound-search block w-full px-3 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50";
        search.textContent = `Search PubChem for “${typed}”`;
        search.addEventListener("mousedown", (event) => {
          event.preventDefault();
          menu.classList.add("hidden");
          this.handleSoluteSearch(input, row);
        });
        menu.appendChild(search);
      }
      menu.classList.toggle("hidden", menu.childElementCount === 0);
    };

    input.addEventListener("focus", renderMatches);
    input.addEventListener("input", () => {
      input.classList.remove("animate-pulse");
      row.dataset.lookupVersion = String(
        Number(row.dataset.lookupVersion || 0) + 1,
      );
      delete row.dataset.compoundName;
      delete row.dataset.molarVolume;
      renderMatches();
    });
    input.addEventListener("blur", () =>
      setTimeout(() => menu.classList.add("hidden"), 120),
    );
  }

  /** Use this function to apply one validated local/remote compound to a row;
   * inputs are row DOM and compound data; no project dependencies. */
  applyCompound(row, compound) {
    row.querySelector(".lookup-box").classList.remove("animate-pulse");
    row.querySelector(".logp-slider").value = compound.logP;
    row.querySelector(".logp-num").value = compound.logP;
    row.querySelector(".lookup-box").value = compound.name;
    row.dataset.compoundName = compound.name;
    row.dataset.molarVolume = compound.molarVolume || "";
    row.dataset.lookupVersion = String(
      Number(row.dataset.lookupVersion || 0) + 1,
    );
  }

  async handleSoluteSearch(input, row) {
    const query = input.value.trim();
    const version = Number(row.dataset.lookupVersion || 0) + 1;
    row.dataset.lookupVersion = String(version);
    delete row.dataset.compoundName;
    delete row.dataset.molarVolume;
    if (!query) return;
    const cached = this.catalog.find(
      (solute) => solute.name.toLowerCase() === query.toLowerCase(),
    );
    if (cached) {
      this.applyCompound(row, cached);
      return;
    }
    input.classList.add("animate-pulse");
    try {
      const compound = await lookupCompound(query);
      if (version !== Number(row.dataset.lookupVersion)) return;
      if (!compound)
        throw new Error(`No compound properties found for “${query}”.`);
      const remembered = rememberSearchedCompound(compound) ?? compound;
      this.catalog = mergeCompounds(this.catalog, [remembered]);
      this.applyCompound(row, remembered);
      input.style.borderColor = "#16a34a";
      document.getElementById("soluteCatalogStatus").textContent =
        "PubChem compound loaded";
    } catch (error) {
      if (version === Number(row.dataset.lookupVersion)) {
        input.style.borderColor = "#dc2626";
        document.getElementById("soluteCatalogStatus").textContent =
          `${error.message} Select a local compound or Custom.`;
      }
    } finally {
      if (version === Number(row.dataset.lookupVersion))
        input.classList.remove("animate-pulse");
    }
  }

  /** Use this function to turn every selected control into Simulation inputs;
   * depends on solute rows, getSystemInputs, and Simulation. */
  buildSimulation() {
    const solutes = Array.from(
      this.panels.soluteContainer.querySelectorAll(".solute-row"),
    ).map((row, index) => {
      const custom = row.querySelector(".custom-toggle").checked;
      if (
        !custom &&
        row.dataset.compoundName !==
          row.querySelector(".lookup-box").value.trim()
      ) {
        this.selectTab("analytes");
        row.querySelector(".lookup-box").focus();
        throw new Error(
          "Resolve the compound name or select Custom before injecting.",
        );
      }
      const color = CONFIG.colors[index];
      const descriptors = (prefix, keys) =>
        Object.fromEntries(
          keys.map(([key]) => [
            key,
            parseFloat(row.querySelector(`.${prefix}-${key}`).value),
          ]),
        );
      const model = this.inputs.retentionModel.value;
      return {
        ...(model === "hsm"
          ? { hsm: descriptors("hsm", HSM_SOLUTE_KEYS) }
          : {}),
        ...(model === "lser"
          ? { lser: descriptors("lser", LSER_SOLUTE_KEYS) }
          : {}),
        id: String(index),
        name: custom
          ? `Solute ${String.fromCharCode(65 + index)}`
          : row.dataset.compoundName,
        logP: parseFloat(row.querySelector(".logp-num").value),
        molarVolume:
          (!custom && Number(row.dataset.molarVolume)) ||
          CONFIG.defaultMolarVolumeCm3Mol,
        color,
        hexColor: parseInt(color.slice(1), 16),
      };
    });
    return new Simulation({
      system: this.getSystemInputs(),
      solutes,
      mode: this.inputs.simMode.value,
      particleCount: CONFIG.maxParticles,
    });
  }

  handleInject() {
    try {
      for (const input of this.panels.control.querySelectorAll("input")) {
        if (!input.checkValidity()) {
          const panel = input.closest('[role="tabpanel"]');
          if (panel) this.selectTab(panel.id.replace("panel-", ""));
          input.reportValidity();
          return;
        }
      }
      const speed = parseFloat(this.inputs.simulationSpeedNum.value);
      if (!Number.isFinite(speed) || speed <= 0 || speed > 2)
        throw new RangeError("Speed must be between 0 and 2.");
      const nextSimulation = this.buildSimulation();
      cancelAnimationFrame(this.frameId);
      this.simulation = nextSimulation;
      this.speed = speed;
      this.paused = false;
      this.previousTimestamp = null;
      this.view.reset(this.simulation);
      document.getElementById("physicsStatus").textContent =
        this.simulation.solutes
          .map(
            (solute) =>
              `${solute.name}: tR ${(solute.tr / 60).toFixed(2)} min, H ${(solute.plateHeight * 1e6).toFixed(1)} µm, ` +
              `N ${Math.round(solute.N)}`,
          )
          .join(" | ");
      this.setControlsLocked(true);
      this.toggleButtons(false, true, true);
      this.buttons.pause.innerText = UI_LABELS.pause;
      this.frameId = requestAnimationFrame(this.tick);
    } catch (error) {
      document.getElementById("physicsStatus").textContent = error.message;
    }
  }

  /** Use this function to connect browser timestamp milliseconds to the active
   * Simulation in seconds; depends on Simulation, SimulationView, and UI state. */
  tick(timestamp) {
    if (!this.simulation || this.paused) return;
    try {
      if (this.previousTimestamp !== null) {
        // Ignore long browser stalls; never run unbounded catch-up on the UI thread.
        this.simulation.advance(
          Math.min(
            0.1,
            Math.max(0, (timestamp - this.previousTimestamp) / 1000),
          ) * this.speed,
        );
      }
      this.previousTimestamp = timestamp;
      const repaint =
        timestamp - this.lastPaint >= 100 || this.simulation.finished;
      this.view.render(this.simulation, repaint);
      if (repaint) this.lastPaint = timestamp;
      if (this.simulation.finished) {
        this.setControlsLocked(false);
        this.toggleButtons(true, false, true);
      } else this.frameId = requestAnimationFrame(this.tick);
    } catch (error) {
      this.paused = true;
      this.setControlsLocked(false);
      this.toggleButtons(true, false, true);
      document.getElementById("physicsStatus").textContent = error.message;
    }
  }

  /** Use this function to bind display zoom without changing simulation state;
   * no inputs; depends on SimulationView and detector DOM controls. */
  bindDetectorZoom() {
    const slider = document.getElementById("detectorZoom");
    const output = document.getElementById("detectorZoomOutput");
    slider.addEventListener("input", () => {
      this.view.zoom = parseFloat(slider.value);
      output.value = `${this.view.zoom}x`;
      this.view.updateViewport((this.simulation?.time ?? 0) / 60);
      this.view.chart.update("none");
    });
  }

  setControlsLocked(locked) {
    const inputs = this.panels.control.querySelectorAll(
      "[data-setup-panel] input, [data-setup-panel] select, [data-setup-panel] button",
    );
    inputs.forEach((input) => (input.disabled = locked));
    this.applyConditionalFields(locked);
    this.panels.control
      .querySelectorAll("[data-setup-panel]")
      .forEach((panel) => panel.classList.toggle("opacity-75", locked));
  }

  toggleButtons(inject, pause, flush) {
    this.buttons.inject.classList.toggle("hidden", !inject);
    this.buttons.pause.classList.toggle("hidden", !pause);
    this.buttons.flush.classList.toggle("hidden", !flush);
  }
}
