# HPLC Simulation Parameter Interdependence Guide: Computational Pipeline Architecture

This guide explains how to interpret and execute the **Framework Parameter Interdependence Matrix**. It clarifies the mathematical dataflow of liquid chromatography simulations, addresses common layout misconceptions, and details how primary experimental parameters cascade through the physical equations to generate a chromatogram.

---

## 1. Core Principle: Concurrent Pipeline vs. Decision Tree

### The Short Answer
> **No, the matrix is not an "either/or" decision tree.** You do not choose between Framework 1 and Framework 2, nor do you choose between Framework 3 and Framework 5. 

In chromatography physics, these frameworks describe **complementary phenomena happening simultaneously** inside the column:
* **Framework 1 (Hydrodynamics)** models the bulk flow of the solvent carrier.
* **Framework 2 (Molecular Diffusion)** models the microscopic Brownian motion of solute molecules within that solvent carrier.
* **Framework 3 (Equilibrium Thermodynamics)** determines **where** the solute peak appears in time (retention time, $t_R$).
* **Framework 5 (Rate Theory / Van Deemter)** determines **how wide** that solute peak becomes (variance, $\sigma^2$, or plate count, $N$).
* **Framework 7 (Continuum Transport / 1D ADE)** synthesizes both retention and broadening to output the final detector profile.

Choosing between them would lead to physical impossibilities:
* If you ran **Thermodynamics (3)** without **Rate Theory (5)**, peaks would elute at the correct retention times but would have zero width (an unphysical vertical line / Dirac delta function).
* If you ran **Rate Theory (5)** without **Thermodynamics (3)**, peaks would broaden realistically, but every chemical would elute at the exact same unretained void time ($t_0$), meaning zero separation.

---

## 2. The Directed Acyclic Graph (DAG) Dataflow

Rather than a branching decision tree, the interdependence matrix is a **Directed Acyclic Graph (DAG)** organized into sequential computational stages:

```
                  STAGE 0: PRIMARY EXPERIMENTAL INPUTS
  [ Flow Rate (Fv), Pressure (ΔP), Dimensions (L, dc), Particles (dp), Solutes (LogP, V), Solvent (η, T) ]
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
      STAGE 1A: HYDRODYNAMICS               STAGE 1B: MOLECULAR DIFFUSION
      (Kozeny-Carman / Darcy)                   (Wilke-Chang Theory)
      • Linear Velocity (u)                     • Solute Diffusion (Dm)
      • Column Void Volume (V0)
                   │                                     │
                   ├──────────────────┬──────────────────┤
                   │                  │                  │
                   ▼                  │                  ▼
      STAGE 2A: THERMODYNAMICS        │     STAGE 2B: KINETIC RATE THEORY
      (LSS / HSM / LSER)              │     (Van Deemter / Knox)
      • Retention Factor (k)          │     • Eddy Diffusion (A)
      • Void Time (t0)                │     • Longitudinal Diffusion (B)
      • Retention Time (tR)           │     • Mass-Transfer Resistance (C)
                   │                  │     • Plate Height (H) & Plates (N)
                   │                  │                  │
                   └────────────┬─────┴──────────────────┘
                                │
                                ▼
                   STAGE 3: CONTINUUM MASS TRANSPORT
                   (1D Advection-Dispersion Equation)
                   • Axial Dispersion: DL = (H · u) / 2
                   • Temporal Standard Deviation: σt = tR / √N
                   • Spatial Standard Deviation: σz = L / √N
                                │
                                ▼
                   STAGE 4: DETECTOR CONCENTRATION
                   • Continuous Analytical Gaussian: C(t)
                   • Stochastic Particle Random Walk: (x, y)
```

---

## 3. Stage-by-Stage Execution Breakdown

### Stage 0: System Initialization
The simulator collects raw experimental inputs from the user interface or configuration object:
1. **Column Geometry**: Length ($L$), inner diameter ($d_c$), particle diameter ($d_p$), total porosity ($\epsilon$).
2. **Mobile Phase Conditions**: Volumetric flow rate ($F_v$), temperature ($T$), solvent dynamic viscosity ($\eta$), organic modifier fraction ($\Phi$).
3. **Solute Properties**: Partition coefficient ($\text{Log } P$), 3D molecular molar volume ($V$).

---

### Stage 1: Simultaneous Physical Foundations
Stage 1 executes **both** hydrodynamic and diffusion calculations in parallel. Neither depends on the other, but both are mandatory downstream inputs.

#### Stage 1A: Hydrodynamic Transport (Framework 1)
Using the column dimensions and pump flow rate, the simulator calculates the interstitial mobile-phase linear velocity ($u$) and void volume ($V_0$):
$$u = \frac{F_v}{\pi \left(\frac{d_c}{2}\right)^2 \epsilon}, \quad V_0 = \pi \left(\frac{d_c}{2}\right)^2 L \cdot \epsilon$$
*(Alternatively, if pressure $\Delta P$ is specified instead of flow rate, the Kozeny-Carman equation is solved for $u$.)*

#### Stage 1B: Microscopic Solvation & Diffusion (Framework 2)
Simultaneously, using the Wilke-Chang equation, the simulator calculates the bulk diffusion coefficient of each solute ($D_m$):
$$D_m = \frac{7.4 \times 10^{-8} \cdot (\Phi_{assoc} M)^{0.5} \cdot T}{\eta \cdot V^{0.6}}$$

---

### Stage 2: Coupled Phenomenological Modeling
Once $u$ and $D_m$ are established, the simulator evaluates retention and band broadening concurrently.

#### Stage 2A: Thermodynamic Retention (Framework 3)
Determines the temporal position of the peak:
1. Calculate baseline void transit time:
   $$t_0 = \frac{L}{u}$$
2. Calculate solute retention factor ($k$) via the Linear Solvent Strength (LSS) model:
   $$\log k = \log k_w - S \cdot \Phi \implies k = 10^{\log k_w - S\Phi}$$
3. Calculate mean retention time ($t_R$):
   $$t_R = t_0 (1 + k)$$

#### Stage 2B: Kinetic Band Broadening (Framework 5)
Determines the spatial and temporal spread of the peak by combining inputs from **both** Stage 1A ($u$) and Stage 1B ($D_m$):
1. **Eddy Diffusion ($A$)**: Depends on column packing and particle size:
   $$A = 2 \lambda d_p$$
2. **Longitudinal Diffusion ($B$)**: Depends directly on $D_m$ from Framework 2:
   $$B = 2 \gamma D_m$$
3. **Mass-Transfer Resistance ($C$)**: Depends on both $d_p$ and $D_m$:
   $$C \approx \frac{c_k \cdot d_p^2}{D_m}$$
4. **Plate Height ($H$) & Plate Count ($N$)**: Evaluates the terms at velocity $u$ from Framework 1:
   $$H = A + \frac{B}{u} + C \cdot u, \quad N = \frac{L}{H}$$

---

### Stage 3: Continuum Integration (Framework 7)
Stage 3 brings the thermodynamic output ($t_R$) and the kinetic output ($H, N$) together into the 1D Advection-Dispersion Equation (ADE):
$$\frac{\partial c_i}{\partial t} + F \frac{\partial q_i}{\partial t} + u \frac{\partial c_i}{\partial z} = D_L \frac{\partial^2 c_i}{\partial z^2}$$

The physical transport coefficients in this PDE are directly populated by the upstream stages:
* The convective velocity is $u$ (from Stage 1A).
* The phase equilibrium shift is $k$ (from Stage 2A).
* The axial dispersion coefficient is calculated by coupling velocity with plate height:
  $$D_L = \frac{H \cdot u}{2}$$

---

### Stage 4: Detector Rendering (Output Mode)
Depending on the simulation mode selected in the application, the simulator renders the peaks using one of two formulations:

1. **Continuous Analytical Mode**:
   Evaluates a closed-form Gaussian distribution at the detector position:
   $$\sigma_t = \frac{t_R}{\sqrt{N}}, \quad C(t) = \frac{C_0 V_{inj}}{\sigma_t \sqrt{2\pi}} \exp\left( -\frac{(t - t_R)^2}{2\sigma_t^2} \right)$$
2. **Discrete Stochastic Particle Mode**:
   Propagates individual particle coordinates down the column per animation frame ($\Delta t$):
   * Downward advection step: $\Delta y_{adv} = v_y \cdot \Delta t$
   * Stochastic axial dispersion: $\Delta y_{disp} = (\text{random} - 0.5) \cdot \sigma_{step}$
   where $\sigma_{step}$ is calibrated such that total variance at the detector equals $\sigma_z = L / \sqrt{N}$.

---

## 4. How Advanced Modules Plug Into the Pipeline

The other frameworks listed in the glossary serve as advanced modular replacements or corrections within this pipeline:

* **Framework 4 (HSM / LSER Selectivity)**: Plugs directly into **Stage 2A**. Instead of a simple $\text{Log } P$ correlation, it calculates $k$ using multi-parameter solute-column interactions ($\eta'H - \sigma'S^* + \dots$).
* **Framework 6 (Dimensionless Knox Framework)**: Plugs directly into **Stage 2B**. Instead of raw Van Deemter terms ($A, B, C$), it normalizes velocity and plate height into reduced coordinates ($\nu = u \cdot d_p / D_m$, $h = H / d_p$).
* **Framework 8 (Gradient Elution)**: Dynamically loops **Stage 2A** and **Stage 3** over time. Because $\Phi(t)$ increases continuously, $k(t)$ drops as the analyte migrates, compressing band variance ($G$).
* **Framework 9 (UHPLC & Extra-Column Physics)**: Applies perturbation layers across the stages:
  * Adds extra-column variance to Stage 3: $\sigma_{tot}^2 = \sigma_{col}^2 + \sigma_{ext}^2$.
  * Adds viscous frictional heating to Stage 1A: modifying local viscosity $\eta(z)$ along the column axis.

---

## 5. End-to-End Numerical Trace Example

To see how values pass through the pipeline in practice, consider a simulation run with Caffeine:

| Parameter Stage | Input / Calculation | Result |
| :--- | :--- | :--- |
| **0. Inputs** | Column: $150\text{ mm} \times 4.6\text{ mm}$, $d_p = 5\,\mu\text{m}$, Flow: $1.0\text{ mL/min}$, Caffeine ($\text{Log } P = -0.07$, $V = 140\text{ cm}^3/\text{mol}$) | Raw configuration |
| **1A. Hydrodynamics** | $u = \frac{F_v}{\pi r^2 \epsilon}$ | $u \approx 1.67\text{ mm/s}$ |
| **1B. Diffusion** | $D_m = \text{Wilke-Chang}(V=140, \eta=1.0\text{ cP}, T=298\text{ K})$ | $D_m \approx 7.2 \times 10^{-6}\text{ cm}^2/\text{s}$ |
| **2A. Retention** | $t_0 = 150 / 1.67 = 90\text{ s}$; $k = \text{LSS}(-0.07, 50\%) = 1.25$ | $t_R = 90 \times (1 + 1.25) = 202.5\text{ s}$ ($3.38\text{ min}$) |
| **2B. Kinetics** | $A = 2(0.8)(5\,\mu\text{m}) = 8\,\mu\text{m}$; $B = 2(0.7)D_m$; $C = 0.1 d_p^2 / D_m$ | $H \approx 25\,\mu\text{m} \implies N = \frac{150\text{ mm}}{0.025\text{ mm}} = 6000$ |
| **3. Continuum Transport** | $D_L = \frac{H \cdot u}{2} = \frac{0.025 \times 1.67}{2}$ | $D_L \approx 0.021\text{ mm}^2/\text{s}$ |
| **4. Peak Synthesis** | $\sigma_t = \frac{t_R}{\sqrt{N}} = \frac{202.5}{\sqrt{6000}}$ | $\sigma_t = 2.61\text{ s} \implies$ Gaussian peak drawn at $t_R = 3.38\text{ min}$ with width $W = 4\sigma_t = 10.4\text{ s}$ |