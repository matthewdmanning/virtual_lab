For client-side web simulations hosted on static providers like GitHub Pages, selecting an appropriate model requires balancing physical transport fidelity against browser execution constraints (JavaScript main thread, WebAssembly background workers, or WebGPU compute pipelines) to maintain a smooth 30–60 FPS rendering loop.

---

### Model Complexity Tiers & Browser Viability

The computational overhead of transport simulations is determined by the number of spatial dimensions, the coupling of kinetic phases, and system stiffness.

```
Low Cost (Real-Time 60 FPS)              Moderate Cost (Interactive)             Prohibitive (Batch / Pre-Calculated)
┌───────────────────────────────┐        ┌───────────────────────────────┐        ┌───────────────────────────────┐
│ • Analytical Gaussian / LSS   │  ───>  │ • Equilibrium Dispersive (EDM)│  ───>  │ • General Rate Model (GRM)    │
│ • Stochastic Random Walk      │        │ • Lumped Pore Model (LPM)     │        │ • 3D Pore-Scale LBM / CFD     │
└───────────────────────────────┘        └───────────────────────────────┘        └───────────────────────────────┘
  (Main-Thread JS / WebGL)                 (Web Workers Wasm / WebGPU)              (Requires Server / Native Solvers)

```

1. **Analytical & Empirical Models (Instantaneous)**

- **Examples:** Linear Solvent Strength (LSS) Gaussian profiles, continuous peak-variance equations ($t_R = t_0(1+k)$, $\sigma = t_R / \sqrt{N}$).

- **Compute Footprint:** Closed-form mathematical evaluations requiring minimal CPU arithmetic per frame ($O(1)$ complexity per component).

- **Visual Performance:** Rock-solid 60 FPS with Chart.js or HTML5 Canvas.

- **Trade-off:** Assumes ideal symmetric peak shapes and linear equilibrium; cannot capture non-linear competitive column overloading or steep mobile-phase gradients.

2. **Stochastic Particle Models (Moderate CPU / Low GPU)**

- **Examples:** Monte Carlo random-walk advection-dispersion simulators.

- **Compute Footprint:** $O(N_p)$ coordinate updates per frame ($1{,}000$ to $50{,}000$ particles).

- **Visual Performance:** Runs at 60 FPS when using `Float32Array` buffers rendered via PixiJS `ParticleContainer` or raw WebGL/WebGPU instancing. Main-thread Canvas 2D stalls when particle counts exceed 2,000.

- **Trade-off:** High visual appeal for educational animations, but introduces statistical noise into the detector signal and requires high particle densities for quantitative concentration profiles.

3. **1D Continuum PDE Models (EDM & LPM)**

- **Examples:** Equilibrium Dispersive Model (1 PDE per solute) and Lumped Pore Model (1 PDE + 1 ODE per solute).

- **Compute Footprint:** Discrete 1D grids ($N_z \approx 100\text{--}500$ cells) solved via explicit or semi-implicit finite difference stencils (e.g., upwind advection + central dispersion).

- **Visual Performance:** Highly responsive (30–60 FPS) when executed in a WebGPU compute shader or in a Web Worker using WebAssembly (Wasm).

- **Trade-off:** Ideal sweet spot for scientific accuracy on GitHub Pages; accurately simulates band broadening, non-linear isotherms, and elution profiles without bogging down the browser.

4. **Multi-Scale Stiff PDE & 3D Microstructure Models (GRM & LBM)**

- **Examples:** General Rate Model (coupled 1D column + 2D intra-particle radial diffusion), 3D Lattice Boltzmann CFD.

- **Compute Footprint:** Discretizing bead interiors produces thousands of state variables per component ($N_z \times N_r \approx 2{,}000\text{--}10{,}000$ nodes), yielding stiff differential-algebraic equation (DAE) systems that require implicit solvers like SUNDIALS CVODE.

- **Visual Performance:** Unsuitable for real-time interactive rendering in static client-side browsers without aggressive spatial coarsening or operator splitting.

- **Trade-off:** Maximum physical fidelity, but will cause frame stutter or require "Run & Wait" progress bars rather than live visual manipulation.

---

### Decision Matrix: Model Suitability vs. Web Stack

| Model Formulation | Mathematical Scale | Recommended Browser Engine | Peak Visual FPS | Static Host Compatibility |
| ----------------- | ------------------ | -------------------------- | --------------- | ------------------------- |

| **Analytical Gaussian**

| 1 equation per peak | Vanilla JS + Chart.js / Canvas

| 60 FPS

| Excellent (zero dependencies)

|
| **Stochastic Random Walk**

| $10^3\text{--}10^5$ particles | JS Worker / PixiJS (WebGL/WebGPU)

| 60 FPS

| Excellent (pure static client)

|
| **Equilibrium Dispersive (EDM)**

| 1 PDE, $N_z \le 500$

| WebGPU Compute (WGSL) or Wasm

| 60 FPS

| Excellent (fallback to Wasm)

|
| **Lumped Pore Model (LPM)**

| 1 PDE + 1 ODE, $N_z \le 500$

| WebGPU Compute (Ping-Pong buffers)

| 45–60 FPS | Excellent (requires zero server backend)

|
| **General Rate Model (GRM)**

| 2 coupled PDEs, $N_z \cdot N_r \ge 2{,}000$

| C++/Rust Wasm in dedicated Web Worker

| < 15 FPS (Interactive), best as Batch | Good (needs `coi-serviceworker` if multi-threaded) |
| **3D Pore-Scale LBM**

| 3D Lattice Stencil ($10^6$ nodes)

| WebGPU Compute Pipelines

| 15–30 FPS | Moderate (high VRAM usage, fails on low-end mobile) |

---

### Evaluation Criteria & Benchmarks for GitHub Pages

Because GitHub Pages serves only static HTML, CSS, JavaScript, and Wasm assets without backend compute runners, use the following criteria to evaluate candidate models:

1. **Main-Thread Frame Budget (< 16.6 ms per frame):**

- If model evaluation takes $> 8\text{ ms}$, the UI thread will drop below 60 FPS when combined with DOM updates and chart rendering.

- _Selection Rule:_ Any numerical model requiring matrix inversions or multi-step loops must be decoupled into a Web Worker or offloaded to WebGPU.

2. **State Variable Thresholds for Real-Time Interaction:**

- **$\le 500$ state variables:** Run comfortably on CPU in a single requestAnimationFrame loop using Typed Arrays.

- **$500\text{ to }50{,}000$ state variables:** Run smoothly in WebGPU compute shaders using 3-point or 5-point stencils and ping-pong buffers.

- **$> 50{,}000$ state variables:** Incompatible with continuous real-time rendering; must run as asynchronous batched background jobs.

3. **Data Transfer Bottlenecks:**

- Transferring large Float32 matrices from CPU to GPU or serializing data through Web Worker `postMessage` creates memory bus stalls.

- _Selection Rule:_ Prefer models whose data can remain on the GPU from simulation step to render step (e.g., using WebGPU storage buffers bound directly as vertex buffers in PixiJS v8 or Three.js).

4. **Browser Portability & Fallbacks:**

- WebGPU compute shaders are universal on modern desktop and high-end mobile browsers, but hardware adapters can fail on older clients.
- _Selection Rule:_ When choosing PDE-level models (such as EDM or LPM), build an automated fallback ladder: **WebGPU Compute $\to$ Wasm Worker $\to$ Simplified Analytical Profile**.

---

### Practical Selection Workflow

1. **For Pure Concept Demonstration or Introductory Education:**
   Select the **Analytical Gaussian / LSS model** paired with a **Stochastic Random Walk**. It gives immediate interactive responsiveness to slider changes, runs on any device without WebGPU requirements, and visualizes retention and band broadening accurately under linear conditions.

2. **For Preparative Runs, Gradient Elution, and Moderate Kinetics:**
   Select the **Equilibrium Dispersive Model (EDM)** or **Lumped Pore Model (LPM)** implemented in a **WebGPU WGSL Compute Shader**. Discretize the column to 200–400 axial nodes. This captures asymmetric peak shapes, competitive Langmuir adsorption, and dynamic gradient profiles while rendering at native 60 FPS.

3. **For Research-Grade Digital Twins (Monoclonal Antibodies, Biomacromolecules):**
   Select a **Dual-Mode Architecture**: use an **EDM / Analytical preview** for real-time slider manipulation, and trigger an asynchronous **Wasm-compiled CADET/GRM solver** in a background worker only when the user clicks "Run Full Kinetic Simulation".
