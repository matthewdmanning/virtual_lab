# HPLC Simulation Scientific Glossary: Theoretical Framework Clusters

This glossary organizes chromatographic simulation parameters and governing equations by their theoretical foundations. Rather than presenting an alphabetical index, parameters are clustered into their governing physical, chemical, and mathematical frameworks to show how inputs cascade through simulation calculations.

---

## 1. Hydrodynamic Flow & Column Permeability Mechanics

This framework models the macroscopic physical transport of the mobile-phase fluid through the porous bed under an applied pressure differential. It dictates the base convective velocity driving all downstream kinetic and band-broadening equations.

* **Bed Porosity ($\epsilon$ or $\epsilon_t$)**  
  The dimensionless fraction of total column volume occupied by mobile phase:
  $$\epsilon = \frac{V_m}{V_c}$$
  where $V_m$ is mobile-phase void volume and $V_c$ is geometric column cylinder volume.
* **Particle Diameter ($d_p$)**  
  The mean spherical diameter of the stationary-phase packing particles (units: $\mu\text{m}$ or $\text{m}$). It governs permeability quadratically ($\Delta P \propto 1/d_p^2$) and serves as the primary physical distance scale for intraparticle diffusion.
* **Column Length ($L$) & Inner Diameter ($d_c$)**  
  The macroscopic geometric boundary dimensions of the packed cylinder (units: $\text{mm}$ or $\text{cm}$).
* **Darcy Flow Velocity ($u_{Darcy}$)**  
  A continuum formulation where fluid velocity through a porous matrix is directly proportional to the applied pressure gradient:
  $$u_{Darcy} = \frac{B_0}{\eta} \frac{\Delta P}{L}$$
  where $B_0$ is specific column permeability and $\eta$ is mobile-phase dynamic viscosity.
* **Kozeny-Carman Equation**  
  The semi-empirical hydrodynamic model relating column pressure drop ($\Delta P$) to interstitial linear velocity ($u$) based on particle packing and voidage:
  $$u = \frac{\Delta P \cdot d_p^2 \cdot \epsilon^3}{180 \cdot \eta \cdot L \cdot (1-\epsilon)^2}$$
* **Packing Factor ($\lambda$) & Packing Quality**  
  A dimensionless empirical index reflecting the geometric regularity of the particle bed assembly. Standard values range from $\lambda \approx 0.5$ (densely, homogeneously packed slurry) to $\lambda \ge 1.5$ (poorly packed beds with structural voids).
* **Interstitial Linear Velocity ($u$)**  
  The actual mean linear migration speed of the mobile-phase solvent front through the channels between packing particles:
  $$u = \frac{L}{t_0} = \frac{F_v}{\pi \left(\frac{d_c}{2}\right)^2 \epsilon}$$
  where $F_v$ is volumetric pump flow rate (e.g., $\text{mL/min}$).

---

## 2. Microscopic Molecular Diffusion & Solvation Properties

This framework determines the thermal Brownian motion of solute molecules within the bulk liquid mobile phase. The resulting diffusion coefficient ($D_m$) is the foundational kinetic input for both longitudinal spreading and stationary-phase mass-transfer resistance.

* **Solvent Dynamic Viscosity ($\eta$)**  
  The fluid's internal shear resistance (units: $\text{cP}$ or $\text{Pa}\cdot\text{s}$). It directly impedes molecular diffusion and scales pressure drop.
* **Absolute Temperature ($T$)**  
  Thermodynamic temperature (in Kelvin, $\text{K}$), governing the thermal energy ($k_B T$) available for Brownian motion.
* **Solvent Association Factor ($\Phi_{assoc}$)**  
  A dimensionless parameter accounting for hydrogen-bonding intermolecular networks in the solvent matrix (e.g., $\Phi_{assoc} \approx 2.6$ for pure $\text{H}_2\text{O}$; $1.9$ for methanol; $1.0$ for non-associated solvents).
* **Solvent Molecular Weight ($M$)**  
  The weighted average molar mass of the mobile-phase solvent mixture (units: $\text{g/mol}$).
* **Solute Molar Volume ($V$) & 3D Molecular Volume (`Volume3D`)**  
  The physical volume occupied by one mole of solute molecules (units: $\text{cm}^3/\text{mol}$). In computational chemistry pipelines, it is derived from PubChem spatial coordinates ($\text{\AA}^3$) via:
  $$V \approx \text{Volume3D} \times 10^{-24} \times N_A$$
  where $N_A$ is Avogadro's constant.
* **Wilke-Chang Equation & Diffusion Coefficient ($D_m$)**  
  The empirical correlation predicting solute molecular diffusion in bulk liquid mixtures:
  $$D_m = \frac{7.4 \times 10^{-8} \cdot (\Phi_{assoc} M)^{0.5} \cdot T}{\eta \cdot V^{0.6}}$$
  where $D_m$ is in $\text{cm}^2/\text{s}$.

---

## 3. Equilibrium Thermodynamics & Isocratic Retention

This framework assumes instantaneous local thermodynamic equilibrium between the stationary and mobile phases, modeling retention factor ($k$) and residence time based on chemical partitioning free energies.

* **Void Time ($t_0$) & Void Volume ($V_0$)**  
  The baseline transit time and volume required for an unretained tracer (e.g., uracil) to traverse the column:
  $$t_0 = \frac{L}{u} = \frac{V_0}{F_v}$$
* **Retention Time ($t_R$)**  
  The total elapsed time from sample injection to the arrival of the analyte peak apex at the detector:
  $$t_R = t_0 (1 + k)$$
* **Retention Factor ($k$)**  
  The dimensionless ratio of the solute mass partitioned into the stationary phase relative to the mobile phase:
  $$k = \frac{t_R - t_0}{t_0} = K_D \cdot F$$
  where $K_D$ is the thermodynamic equilibrium partition coefficient.
* **Phase Ratio ($F$)**  
  The volumetric ratio of stationary phase to mobile phase inside the column bed:
  $$F = \frac{V_s}{V_m} = \frac{1 - \epsilon}{\epsilon}$$
* **Selectivity ($\alpha$)**  
  The thermodynamic separation factor between two neighboring analytes:
  $$\alpha = \frac{k_2}{k_1} \quad (\alpha \ge 1.0)$$
* **Octanol-Water Partition Coefficient ($\text{Log } P$ / $\text{XLogP}$)**  
  The logarithm of the ratio of solute concentrations at equilibrium between 1-octanol and water, establishing the baseline free energy of transfer into alkyl stationary phases.
* **Organic Modifier Fraction ($\Phi$)**  
  The volume fraction ($0.0 \le \Phi \le 1.0$) of the strong organic solvent (e.g., acetonitrile, methanol) in the mobile phase.
* **Linear Solvent Strength (LSS) Model**  
  The fundamental empirical retention relationship for reversed-phase chromatography:
  $$\log k = \log k_w - S \cdot \Phi$$
  * **$k_w$**: Extrapolated retention factor in 100% aqueous mobile phase ($\Phi = 0$).
  * **$S$**: Solvent strength parameter, representing the contact area of the solute displaced at the phase boundary.

---

## 4. Multi-Parameter Chemical Selectivity Models

When basic hydrophobic partitioning ($\text{Log } P$) cannot fully explain retention (such as on phenyl, cyano, or embedded-polar phases), multi-parameter free-energy models calculate effective retention by decomposing solute-column interactions into distinct chemical forces.

### A. Hydrophobic Subtraction Model (HSM / Snyder-Dolan)
Relative retention against ethylbenzene ($k_{EB}$) is calculated using five column properties and five matching solute interaction parameters:
$$\log\left(\frac{k}{k_{EB}}\right) = \eta' H - \sigma' S^* + \beta' A + \alpha' B + \kappa' C$$

* **Column Hydrophobicity ($H$) & Solute Hydrophobic Footprint ($\eta'$)**  
  Quantifies dispersive London van der Waals interactions between solute alkyl groups and stationary-phase alkyl chains.
* **Steric Resistance ($S^*$) & Solute Bulk Shape ($\sigma'$)**  
  Penalizes bulky, non-planar solutes attempting to penetrate dense, ordered alkyl bonded brushes.
* **Column Hydrogen-Bond Acidity ($A$) & Solute Basicity ($\beta'$)**  
  Evaluates hydrogen bonding between acidic column silanols/ligands and basic solute functional groups.
* **Column Hydrogen-Bond Basicity ($B$) & Solute Acidity ($\alpha'$)**  
  Evaluates interactions between basic column sites and acidic solute hydrogens.
* **Column Ion-Exchange Capacity ($C$) & Solute Charge ($\kappa'$)**  
  Quantifies electrostatic interactions with ionized residual silanol groups ($\text{Si-O}^-$) at pH $\ge 5$.

### B. Abraham Linear Solvation Energy Relationship (LSER)
A general solvation model used for advanced phases containing $\pi$-electron and dipole systems:
$$\log k = c + e E + s S + a A + b B + v V$$

* **Excess Molar Refraction ($E$)**: Polarizability from $n$- and $\pi$-electron pairs (captures $\pi$-$\pi$ interactions on phenyl columns).
* **Dipolarity / Polarizability ($S$)**: Stabilization of electrostatic dipoles.
* **Hydrogen-Bond Acidity ($A$) & Basicity ($B$)**: Total electron-acceptor and electron-donor capacity.
* **McGowan Characteristic Volume ($V$)**: Cavity-formation free-energy penalty in condensed liquids.

---

## 5. Kinetic Band Broadening & Rate Theory (Van Deemter Framework)

This framework describes the non-equilibrium kinetic dispersion mechanisms that broaden an infinitely sharp injection zone into a Gaussian band as it migrates along the column.

* **Plate Height ($H$ or $\text{HETP}$)**  
  Height Equivalent to a Theoretical Plate (units: $\mu\text{m}$ or $\text{m}$), measuring axial band broadening variance per unit column length:
  $$H = \frac{\sigma_z^2}{L}$$
* **Theoretical Plate Count ($N$)**  
  The overall efficiency index of the chromatographic bed:
  $$N = \frac{L}{H} = \left(\frac{t_R}{\sigma_t}\right)^2$$
* **Van Deemter Equation**  
  The three-term kinetic equation relating plate height to mobile-phase linear velocity ($u$):
  $$H = A + \frac{B}{u} + C \cdot u$$
* **Eddy Diffusion ($A$-Term)**  
  Velocity-independent dispersion caused by multiple flow paths through inhomogeneous packing:
  $$A = 2 \lambda d_p$$
* **Longitudinal Diffusion ($B$-Term)**  
  Axial molecular diffusion in the mobile phase:
  $$B = 2 \gamma D_m$$
  where $\gamma$ is the column obstruction/tortuosity factor ($\gamma \approx 0.6 - 0.8$ for packed silica).
* **Mass-Transfer Resistance ($C$-Term)**  
  Non-equilibrium kinetic delays as solute diffuses into and out of stationary-phase pores:
  $$C = C_m + C_s \approx \frac{c_k \cdot d_p^2}{D_m}$$
  where $c_k$ is a kinetic constant dependent on retention factor ($k$) and internal pore structure.
* **Optimal Linear Velocity ($u_{opt}$)**  
  The velocity yielding maximum efficiency (minimum $H$):
  $$u_{opt} = \sqrt{\frac{B}{C}}, \quad H_{min} = A + 2\sqrt{B \cdot C}$$
* **Resolution ($R_s$)**  
  The combined expression integrating thermodynamics ($k, \alpha$) and kinetics ($N$):
  $$R_s = \frac{\sqrt{N}}{4} \left(\frac{\alpha - 1}{\alpha}\right) \left(\frac{k_2}{1 + k_2}\right)$$

---

## 6. Dimensionless Hydrodynamics (Knox Framework)

The Knox framework normalizes the Van Deemter parameters against particle diameter ($d_p$) and diffusion coefficient ($D_m$), allowing performance comparisons across different particle geometries and mobile phases.

* **Reduced Plate Height ($h$)**  
  $$h = \frac{H}{d_p}$$
  In well-packed columns, $h_{min} \approx 2.0 - 2.5$.
* **Reduced Linear Velocity ($\nu$)**  
  The ratio of convective fluid transport over one particle to molecular diffusion across that same distance:
  $$\nu = \frac{u \cdot d_p}{D_m}$$
* **Knox Equation**  
  $$h = A_{knox} \nu^{1/3} + \frac{B_{knox}}{\nu} + C_{knox} \nu$$
  where $A_{knox} \nu^{1/3}$ accounts for boundary layer mixing and channel velocity profiles.
* **Reduced Optimal Velocity ($\nu_{opt}$)**  
  $$\nu_{opt} = \left(\frac{B_{knox}}{2 C_{knox}}\right)^{1/2}$$

---

## 7. Continuum Mass Transport (1D ADE Framework)

This partial differential equation framework mathematically models solute mass balance over continuous space ($z$) and time ($t$) across the column grid.

* **1D Advection-Dispersion Equation (ADE)**  
  $$\frac{\partial c_i}{\partial t} + F \frac{\partial q_i}{\partial t} + u \frac{\partial c_i}{\partial z} = D_L \frac{\partial^2 c_i}{\partial z^2}$$
  where $c_i$ is mobile-phase concentration, $q_i$ is stationary-phase concentration, $u$ is convective velocity, and $F$ is phase ratio.
* **Axial Dispersion Coefficient ($D_L$)**  
  The combined transport coefficient capturing total axial spreading:
  $$D_L = \frac{H \cdot u}{2} = \frac{A \cdot u + B + C \cdot u^2}{2}$$
* **Spatial Variance ($\sigma_z^2$) & Temporal Variance ($\sigma_t^2$)**  
  Statistical second moments representing the width of the concentration band:
  $$\sigma_z = \frac{L}{\sqrt{N}}, \quad \sigma_t = \frac{t_R}{\sqrt{N}}$$
* **Gaussian Elution Profile**  
  The analytical continuous solution for detector signal intensity ($I(t)$):
  $$I(t) = \frac{C_0 \cdot V_{inj}}{\sigma_t \sqrt{2\pi}} \exp\left( -\frac{(t - t_R)^2}{2 \sigma_t^2} \right)$$

---

## 8. Dynamic Non-Isocratic Elution (Gradient LSS Framework)

This framework describes non-steady-state conditions where mobile-phase organic fraction $\Phi(t)$ increases continuously over the run, dynamically accelerating the analyte zone through the bed.

* **Gradient Time ($t_G$) & Gradient Volume ($V_G$)**  
  The programmed duration and delivered mobile-phase volume across the composition ramp:
  $$V_G = t_G \cdot F_v$$
* **System Dwell Volume ($V_D$) & Dwell Time ($t_D$)**  
  The fluidic delay volume between solvent mixers and column inlet:
  $$t_D = \frac{V_D}{F_v}$$
* **Gradient Steepness Parameter ($b$)**  
  The dimensionless rate of change of solvent strength per column void volume:
  $$b = \frac{S \cdot \Delta\Phi \cdot t_0}{t_G} = \frac{S \cdot \Delta\Phi \cdot V_0}{V_G}$$
* **Gradient Retention Factor ($\bar{k}$)**  
  The instantaneous retention factor of the solute band as it reaches the column exit:
  $$\bar{k} \approx \frac{1}{2.303 \cdot b}$$
* **Gradient Retention Time ($t_{R,grad}$)**  
  $$t_{R,grad} = \frac{t_0}{b} \log_{10} \left[ 2.303 b k_0 \left(\frac{t_0 - t_D}{t_0}\right) + 1 \right] + t_0 + t_D$$
* **Gradient Peak Compression Factor ($G$)**  
  Spatial zone narrowing caused by the trailing edge of the band moving faster than the leading edge:
  $$G = \left(\frac{1 + p + \frac{p^2}{3}}{1 + p}\right)^{1/2} \quad \text{where } p = 2.303 \cdot b \cdot k_0$$

---

## 9. Real-World Instrumental Physics & High-Pressure Effects

This framework accounts for physical phenomena that cause departures from idealized chromatography under high pressures (UHPLC) or within external instrument components.

* **Viscous Dissipation / Frictional Heating ($P_{visc}$)**  
  Power dissipated as heat when mobile phase is forced through tightly packed sub-$2\,\mu\text{m}$ particles:
  $$P_{visc} = u \cdot \left(-\frac{dP}{dz}\right)$$
  This produces radial temperature gradients that cause parabolic velocity profiles and thermal band broadening.
* **Pressure-Induced Retention Shifts ($k(P)$)**  
  Thermodynamic equilibrium shifts caused by compression of solute partial molar volume ($\Delta V_m$):
  $$k(P) = k_0 \exp\left(-\frac{\Delta V_m \cdot P}{R \cdot T}\right)$$
* **Mobile-Phase Compressibility ($\chi$)**  
  Fractional volume reduction under pressure, causing linear velocity $u(z)$ to increase nonlinearly toward the column outlet:
  $$\chi = -\frac{1}{V}\left(\frac{\partial V}{\partial P}\right)_T$$
* **Extra-Column Variance ($\sigma_{ext}^2$)**  
  Band spreading originating outside the packed bed:
  $$\sigma_{tot}^2 = \sigma_{col}^2 + \sigma_{inj}^2 + \sigma_{tubing}^2 + \sigma_{cell}^2$$
* **Peak Asymmetry Factor ($A_s$) & USP Tailing ($T_f$)**  
  Metrics quantifying peak skewness from non-linear adsorption isotherms or unpassivated silanol sites:
  $$A_s = \frac{b_{0.1}}{a_{0.1}}, \quad T_f = \frac{W_{0.05}}{2f}$$

---

## Framework Parameter Interdependence Matrix

```
[ User Inputs: P, Flow Rate, T, Column Dimensions, Solute Structure ]
                           │
                           ▼
  1. HYDRODYNAMICS                    2. MOLECULAR DIFFUSION
     (Kozeny-Carman, Darcy)              (Wilke-Chang Theory)
     • Pressure Drop (ΔP)                • Solute Volume (V)
     • Interstitial Velocity (u)         • Bulk Diffusion (Dm)
               │                                   │
               ├─────────────────┬─────────────────┤
               │                 │                 │
               ▼                 ▼                 ▼
  3. EQUILIBRIUM THERMODYNAMICS   5. RATE THEORY (Van Deemter)
     (LSS / HSM / LSER)              • Eddy Diffusion (A)
     • Retention Factor (k)          • Longitudinal Diffusion (B)
     • Void Time (t0)                • Mass Transfer Resistance (C)
     • Retention Time (tR)           • Theoretical Plates (N)
               │                                   │
               ├───────────────────────────────────┘
               ▼
  7. CONTINUUM TRANSPORT (1D ADE)
     • Axial Dispersion (DL = H·u / 2)
     • Peak Variance (σt, σz)
     • Final Chromatographic Peak Output (Gaussian / Asymmetric)
```