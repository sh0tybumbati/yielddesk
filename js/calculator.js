// ============================================================
// Semiconductor Yield & Cost Calculator — Core Math
// All formulas are industry-standard. Sources:
//   - Murphy's Law yield model (Seeds, 1988)
//   - SEMI standard wafer sizes
//   - ITRS/IRDS defect density tables
// ============================================================

export const WAFER_DIAMETERS_MM = {
  '100mm (4")':  100,
  '150mm (6")':  150,
  '200mm (8")':  200,
  '300mm (12")': 300,
  '450mm (18")': 450,
};

// Defect density (D0) in defects/cm² by process node
// Based on published industry data / ITRS reports
export const PROCESS_NODES = {
  '3μm':   { d0: 0.10, year: 1971, label: '3μm (1971)' },
  '2μm':   { d0: 0.15, year: 1975, label: '2μm (1975)' },
  '1.5μm': { d0: 0.20, year: 1978, label: '1.5μm (1978)' },
  '1μm':   { d0: 0.25, year: 1982, label: '1μm (1982)' },
  '800nm': { d0: 0.30, year: 1985, label: '800nm (1985)' },
  '600nm': { d0: 0.40, year: 1987, label: '600nm (1987)' },
  '350nm': { d0: 0.50, year: 1990, label: '350nm (1990)' },
  '250nm': { d0: 0.55, year: 1995, label: '250nm (1995)' },
  '180nm': { d0: 0.60, year: 1999, label: '180nm (1999)' },
  '130nm': { d0: 0.65, year: 2001, label: '130nm (2001)' },
  '90nm':  { d0: 0.70, year: 2003, label: '90nm (2003)' },
  '65nm':  { d0: 0.75, year: 2005, label: '65nm (2005)' },
  '45nm':  { d0: 0.80, year: 2007, label: '45nm (2007)' },
  '32nm':  { d0: 0.85, year: 2009, label: '32nm (2009)' },
  '22nm':  { d0: 0.90, year: 2012, label: '22nm (2012)' },
  '14nm':  { d0: 0.10, year: 2014, label: '14nm (2014)' },
  '10nm':  { d0: 0.09, year: 2016, label: '10nm (2016)' },
  '7nm':   { d0: 0.08, year: 2018, label: '7nm (2018)' },
  '5nm':   { d0: 0.07, year: 2020, label: '5nm (2020)' },
  '3nm':   { d0: 0.06, year: 2022, label: '3nm (2022)' },
  '2nm':   { d0: 0.05, year: 2025, label: '2nm (2025)' },
};

// Typical wafer cost by process node ($USD)
export const WAFER_COSTS = {
  '3μm':   500,
  '2μm':   600,
  '1.5μm': 700,
  '1μm':   800,
  '800nm': 900,
  '600nm': 1000,
  '350nm': 1200,
  '250nm': 1500,
  '180nm': 1800,
  '130nm': 2000,
  '90nm':  2200,
  '65nm':  2500,
  '45nm':  2800,
  '32nm':  3200,
  '22nm':  3800,
  '14nm':  4500,
  '10nm':  6000,
  '7nm':   8000,
  '5nm':   12000,
  '3nm':   18000,
  '2nm':   25000,
};

// ============================================================
// Core calculations
// ============================================================

/**
 * Dies per wafer (Neter & Scheraga approximation)
 * @param {number} waferDiamMm - wafer diameter in mm
 * @param {number} dieAreaMm2  - die area in mm²
 * @param {number} edgeLossMm  - edge exclusion in mm (default 3)
 */
export function diesPerWafer(waferDiamMm, dieAreaMm2, edgeLossMm = 3) {
  const r = waferDiamMm / 2;
  const effectiveR = r - edgeLossMm;
  const waferArea = Math.PI * effectiveR * effectiveR;
  const dieSide = Math.sqrt(dieAreaMm2);
  const edgeCorrection = (Math.PI * effectiveR) / (Math.sqrt(2 * dieAreaMm2));
  return Math.floor(waferArea / dieAreaMm2 - edgeCorrection);
}

/**
 * Murphy's Law yield model
 * Y = (1 - e^(-D0 * A)) / (D0 * A)
 * @param {number} d0       - defect density (defects/cm²)
 * @param {number} dieAreaMm2 - die area in mm²
 * @returns {number} yield 0–1
 */
export function murphyYield(d0, dieAreaMm2) {
  const dieAreaCm2 = dieAreaMm2 / 100;
  const x = d0 * dieAreaCm2;
  if (x < 0.0001) return 1;
  return Math.pow((1 - Math.exp(-x)) / x, 2);
}

/**
 * Poisson yield model (simpler, less accurate for large dies)
 * Y = e^(-D0 * A)
 */
export function poissonYield(d0, dieAreaMm2) {
  const dieAreaCm2 = dieAreaMm2 / 100;
  return Math.exp(-d0 * dieAreaCm2);
}

/**
 * Good dies per wafer
 */
export function goodDies(waferDiamMm, dieAreaMm2, d0, edgeLossMm = 3) {
  const dpw = diesPerWafer(waferDiamMm, dieAreaMm2, edgeLossMm);
  const y = murphyYield(d0, dieAreaMm2);
  return Math.floor(dpw * y);
}

/**
 * Cost per good die
 */
export function costPerGoodDie(waferCost, waferDiamMm, dieAreaMm2, d0, edgeLossMm = 3) {
  const gdpw = goodDies(waferDiamMm, dieAreaMm2, d0, edgeLossMm);
  if (gdpw === 0) return Infinity;
  return waferCost / gdpw;
}

/**
 * Full calculation result object
 */
export function calculate({ waferDiamMm, dieAreaMm2, processNode, waferCostOverride, edgeLossMm = 3 }) {
  const node = PROCESS_NODES[processNode];
  if (!node) throw new Error(`Unknown process node: ${processNode}`);

  const d0 = node.d0;
  const waferCost = waferCostOverride ?? WAFER_COSTS[processNode] ?? 2000;

  const dpw      = diesPerWafer(waferDiamMm, dieAreaMm2, edgeLossMm);
  const yMurphy  = murphyYield(d0, dieAreaMm2);
  const yPoisson = poissonYield(d0, dieAreaMm2);
  const gdpw     = Math.floor(dpw * yMurphy);
  const cpgd     = gdpw > 0 ? waferCost / gdpw : null;

  return {
    diesPerWafer:       dpw,
    yieldMurphy:        yMurphy,
    yieldPoisson:       yPoisson,
    goodDiesPerWafer:   gdpw,
    costPerGoodDie:     cpgd,
    defectDensity:      d0,
    waferCost,
    processNodeLabel:   node.label,
    dieAreaCm2:         dieAreaMm2 / 100,
  };
}
