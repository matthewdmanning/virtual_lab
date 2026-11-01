# Chromatography Analysis

Chromatographic outputs from high-performance liquid chromatography (HPLC) are evaluated across three primary dimensions: analyte identification and quantification, peak shape and column separation efficiency, and instrumental setup health.

---

## Analyte Identification & Quantification Metrics

- **Retention Time ($t_R$):** The time elapsed between sample injection and the maximum apex of the analyte elution peak. It serves as the primary parameter for qualitative compound identification by comparison against reference standards.

- **Retention Factor ($k$):** A dimensionless thermodynamic descriptor representing the ratio of time the solute spends in the stationary phase relative to the mobile phase:

$$k = \frac{t_R - t_0}{t_0}$$

Values between $2 \le k \le 10$ are typically targeted for reliable separations.

- **Peak Area & Peak Height:** The integrated area beneath the peak curve directly correlates with analyte mass or concentration via detector calibration curves. Peak height measures the signal distance from the baseline to the apex.
- **Selectivity / Separation Factor ($\alpha$):** The thermodynamic ability of the column chemistry and mobile phase to differentiate between two adjacent analytes:

$$\alpha = \frac{k_2}{k_1}$$

An $\alpha > 1.0$ is a strict prerequisite for separation.

- **Limit of Detection (LOD) & Limit of Quantitation (LOQ):** The lowest analyte concentrations producing a signal distinguishable from baseline noise, typically defined at signal-to-noise ratios ($S/N$) of $3:1$ for LOD and $10:1$ for LOQ.

---

## Peak Shape & Separation Efficiency Metrics

- **Theoretical Plate Count ($N$):** An index of column efficiency reflecting band-broadening resistance. It is calculated from retention time and temporal peak standard deviation or width:

$$N = \left(\frac{t_R}{\sigma}\right)^2 = 5.545 \left(\frac{t_R}{W_{0.5}}\right)^2 = 16 \left(\frac{t_R}{W_{\text{base}}}\right)^2$$

- **Plate Height ($H$ or HETP):** The column length ($L$) divided by theoretical plates ($H = L / N$). Lower plate height indicates narrower peaks and sharper separation, governed by linear velocity ($u$) through the Van Deemter equation ($H = A + B/u + C \cdot u$).

- **Peak Variance ($\sigma$ or $\sigma^2$):** The statistical spread of the analyte band caused by axial dispersion in the column. The peak standard deviation at the detector is modeled as $\sigma = t_R / \sqrt{N}$.

- **USP Tailing Factor ($T_f$) & Peak Asymmetry ($A_s$):** Measures of peak skewness evaluated at $5\%$ or $10\%$ peak height, respectively. A symmetric Gaussian peak has $T_f = 1.0$; values above $1.2\text{--}1.5$ signify peak tailing (often due to active secondary adsorption sites or column voiding), while values below $0.9$ indicate peak fronting (often due to mass overloading).

- **Chromatographic Resolution ($R_s$):** The quantitative degree of separation between two adjacent peaks, combining column efficiency, selectivity, and retention:

$$R_s = \frac{2(t_{R2} - t_{R1})}{W_1 + W_2} \approx \frac{\sqrt{N}}{4} \left( \frac{\alpha - 1}{\alpha} \right) \left( \frac{k_2}{1 + k_2} \right)$$

An $R_s \ge 1.5$ defines complete baseline separation.
