In mechanistic chromatography modeling, the **Equilibrium Dispersive Model (EDM)**, **Lumped Pore Model (LPM)**, and **General Rate Model (GRM)** represent a hierarchy of continuous partial differential equation (PDE) systems that balance physical fidelity against computational cost.

---

### Mechanistic Model Hierarchy

| Feature                    | Equilibrium Dispersive Model (EDM)                         | Lumped Pore Model (LPM)                                  | General Rate Model (GRM)                                      |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| **Physical Geometry**      | 1D axial column domain ($z$)                               | 1D column ($z$) + lumped solid phase                     | 1D column ($z$) + 1D radial particle sphere ($r$)             |
| **Mass Transfer Kinetics** | Infinitely fast (instantaneous local equilibrium)          | Finite rate via Linear Driving Force (LDF) approximation | Distributed intra-particle diffusion + external film transfer |
| **Spatial Coordinate(s)**  | $z$ (axial position)                                       | $z$ (axial position)                                     | $z$ (axial column) and $r$ (bead radius)                      |
| **Primary Equations**      | 1 single PDE per component                                 | 2 coupled 1D equations per component (1 PDE + 1 ODE)     | 2 coupled PDEs per component (1 1D PDE + 1 2D PDE)            |
| **Computational Overhead** | Very low (solvable in real-time browser engines)           | Moderate (well-suited for GPU stencils)                  | High (requires stiff DAE/PDE solvers like CVODE)              |
| **Primary Use Case**       | Analytical HPLC/UHPLC of small molecules, linear screening | Preparative chromatography, moderate-sized peptides      | Large biomolecules (mAbs, viruses, plasmids), overloaded runs |

---

### 1. Equilibrium Dispersive Model (EDM)

The EDM assumes that mass transfer between the mobile phase and stationary phase is infinitely fast relative to column transit time, meaning solute in the mobile phase and solid phase are in instantaneous thermodynamic equilibrium everywhere along the bed.

#### Governing Equation

$$\frac{\partial c_i}{\partial t} + F \frac{\partial q_i^*}{\partial t} + u \frac{\partial c_i}{\partial z} = D_{\text{app}, i} \frac{\partial^2 c_i}{\partial z^2}$$

Where:

- $c_i$: Mobile-phase concentration of solute $i$

- $q_i^*$: Stationary-phase concentration strictly in local equilibrium with $c_i$ ($q_i^* = f(c_i)$)

- $F$: Phase ratio ($(1-\epsilon_t)/\epsilon_t$ or $V_s/V_m$)

- $u$: Interstitial mobile-phase velocity

- $D_{\text{app}, i}$: Apparent axial dispersion coefficient

#### Key Mechanism: Apparent Dispersion ($D_{\text{app}}$)

Because the EDM formally sets mass transfer resistance to zero, all physical broadening mechanisms—eddy dispersion ($A$), longitudinal molecular diffusion ($B$), and solid-film mass-transfer resistance ($C$)—must be lumped into a single **apparent dispersion coefficient** derived directly from the Van Deemter plate height $H$:

$$D_{\text{app}} = \frac{H \cdot u}{2} = \frac{u}{2} \left( A + \frac{B}{u} + C \cdot u \right)$$

- **Advantages:** Minimal equations, identical in form to the 1D advection-dispersion equation (ADE).

- **Limitations:** Breaks down when kinetics deviate from equilibrium (e.g., steep gradient profiles, high flow velocities, large proteins with slow intra-pore diffusion, or non-linear multi-component competition).

---

### 2. Lumped Pore Model (LPM)

The LPM separates the mobile phase from the stationary phase and accounts for a finite rate of mass transfer, but it avoids resolving spatial concentration gradients inside the porous bead by "lumping" the internal pore volume into a single average concentration.

#### Governing System of Equations

$$\text{Bulk Fluid (Interstitial):} \quad \frac{\partial c_i}{\partial t} + u \frac{\partial c_i}{\partial z} + F \cdot \frac{\partial \bar{q}_i}{\partial t} = D_L \frac{\partial^2 c_i}{\partial z^2}$$

$$\text{Stationary Phase Kinetic Rate:} \quad \frac{\partial \bar{q}_i}{\partial t} = k_{\text{eff}, i} \left( q_i^* - \bar{q}_i \right)$$

Where:

- $\bar{q}_i$: Spatially averaged solute concentration inside the particle
- $q_i^*$: Solid concentration in local equilibrium with the bulk fluid concentration $c_i$
- $k_{\text{eff}, i}$: Effective mass transfer coefficient ($s^{-1}$)
- $D_L$: True axial dispersion coefficient (representing purely axial mixing and longitudinal diffusion, excluding particle kinetics)

#### Key Mechanism: Linear Driving Force (LDF)

Instead of solving radial diffusion across the bead radius, the flux between bulk fluid and stationary phase is modeled using Glueckauf’s Linear Driving Force (LDF) approximation:

$$k_{\text{eff}} \approx \frac{1}{\frac{d_p}{6 k_f} + \frac{d_p^2}{60 D_p}}$$

Where $k_f$ is the external film mass transfer coefficient, $D_p$ is pore diffusion, and $d_p$ is particle diameter.

- **Advantages:** Captures kinetic peak tailing and asymmetry under non-equilibrium conditions without adding extra spatial dimensions.
- **Limitations:** Assumes parabolic concentration profiles within the beads, which underpredicts early breakthrough in fast, high-load preparative runs.

---

### 3. General Rate Model (GRM)

The General Rate Model is the most comprehensive continuum formulation for packed-bed chromatography. It eliminates lumped empirical approximations by treating the column as a two-domain system: **interstitial mobile phase flow** along the column axis ($z$), and **pore fluid/solid surface diffusion** along the internal radial coordinate ($r$) of each spherical particle.

#### Governing System of Equations

**1. Interstitial Mobile Phase (Axial Dimension $z$):**

$$\frac{\partial c_i}{\partial t} + u \frac{\partial c_i}{\partial z} = D_L \frac{\partial^2 c_i}{\partial z^2} - \frac{1 - \epsilon_b}{\epsilon_b} \left( \frac{3 k_{f, i}}{R_p} \right) \left[ c_i - c_{p, i}(r=R_p, z, t) \right]$$

**2. Intra-Particle Mobile & Solid Phases (Radial Dimension $r \in [0, R_p]$):**

$$\epsilon_p \frac{\partial c_{p, i}}{\partial t} + (1 - \epsilon_p) \frac{\partial q_{p, i}}{\partial t} = \frac{1}{r^2} \frac{\partial}{\partial r} \left[ r^2 \left( \epsilon_p D_{p, i} \frac{\partial c_{p, i}}{\partial r} + (1 - \epsilon_p) D_{s, i} \frac{\partial q_{p, i}}{\partial r} \right) \right]$$

Where:

- $\epsilon_b$: Interstitial bed porosity (inter-particle void fraction)
- $\epsilon_p$: Intra-particle porosity (pore void fraction)
- $R_p$: Particle radius ($d_p / 2$)

- $c_{p, i}$: Concentration of solute in the fluid filling the particle pores
- $q_{p, i}$: Concentration of solute adsorbed onto the internal pore walls
- $D_{p, i}$: Pore diffusion coefficient
- $D_{s, i}$: Surface diffusion coefficient (lateral hopping along adsorption sites)
- $k_{f, i}$: External boundary film mass transfer coefficient

#### Boundary Conditions

- **Column Inlet ($z = 0$, Danckwerts boundary):**

$$u \cdot c_{i, \text{feed}}(t) = u \cdot c_i(0, t) - D_L \left. \frac{\partial c_i}{\partial z} \right\vert{}_{z=0}$$

- **Column Outlet ($z = L$):**

$$\left. \frac{\partial c_i}{\partial z} \right\vert{}_{z=L} = 0$$

- **Particle Center ($r = 0$, Symmetry):**

$$\left. \frac{\partial c_{p, i}}{\partial r} \right\vert{}_{r=0} = 0$$

- **Particle Surface ($r = R_p$, Robin boundary / Film Flux Balance):**

$$k_{f, i} \left[ c_i(z, t) - c_{p, i}(R_p, z, t) \right] = \left. \epsilon_p D_{p, i} \frac{\partial c_{p, i}}{\partial r} \right\vert{}_{r=R_p} + \left. (1 - \epsilon_p) D_{s, i} \frac{\partial q_{p, i}}{\partial r} \right\vert{}_{r=R_p}$$

---

### Implementation & Numerical Considerations

1. **Spatial Discretization:**

- **EDM:** Handled via standard 1D finite differences (e.g., Upwind for advection + Central Difference for dispersion).

- **LPM:** Adds a decoupled ordinary differential equation (ODE) per grid cell, requiring an implicit Euler or Runge-Kutta step for the kinetic phase.
- **GRM:** Discretized in 2D space ($N_z$ axial column cells $\times$ $N_r$ radial shell nodes per bead). Orthogonal Collocation on Finite Elements (OCFE) or Finite Volume Methods (FVM) are standard to keep intra-particle node counts minimal (typically 6–12 radial collocation points).

2. **Computational Scale:**

- If an EDM requires $N_z = 200$ grid points, a single-component simulation tracks **200 state variables**.

- An LPM with $N_z = 200$ tracks **400 state variables** ($c_i$ and $\bar{q}_i$).
- A GRM with $N_z = 200$ and $N_r = 10$ tracks **2,200 state variables** ($200 \times 10$ internal pore nodes + $200$ bulk nodes), creating a large, stiff system requiring implicit multi-step ODE integrators (like CVODE in CADET).
