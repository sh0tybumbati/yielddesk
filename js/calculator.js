// ============================================================
// Semiconductor Yield & Cost Calculator — Core Math
// All formulas are industry-standard. Sources:
//   - Murphy's Law yield model (Seeds, 1988)
//   - SEMI standard wafer sizes
//   - ITRS/IRDS defect density tables
//   - Intel Process node disclosures (IEEE IEDM, Hot Chips)
// ============================================================

export const WAFER_DIAMETERS_MM = {
  '100mm (4")':  100,
  '150mm (6")':  150,
  '200mm (8")':  200,
  '300mm (12")': 300,
  '450mm (18")': 450,
};

// ── Process maturity D₀ multipliers ──────────────────────────
// Applied to the base (HVM) defect density for the selected node.
export const MATURITY_LEVELS = {
  pilot:  { label: 'Pilot',   sublabel: 'Engineering samples',  multiplier: 3.0 },
  ramp:   { label: 'Ramp',    sublabel: 'First 6–12 months',    multiplier: 2.0 },
  hvm:    { label: 'HVM',     sublabel: 'High Volume Mfg',      multiplier: 1.0 },
  mature: { label: 'Mature',  sublabel: '2+ yrs optimized',     multiplier: 0.7 },
};

// ── Defect density (D₀) in defects/cm² by process node ───────
// Values represent HVM (High Volume Manufacturing) baseline.
// Intel nodes use Intel's marketing names; Angstrom nodes denoted with A.
// Sources: ITRS/IRDS roadmaps, IEEE IEDM papers, Intel Architecture Day disclosures.
export const PROCESS_NODES = {
  // ── Micron era ─────────────────────────────────────────────
  '3μm':       { d0: 0.10, year: 1971, label: '3μm  (1971)',         vendor: 'industry' },
  '2μm':       { d0: 0.15, year: 1975, label: '2μm  (1975)',         vendor: 'industry' },
  '1.5μm':     { d0: 0.20, year: 1978, label: '1.5μm (1978)',        vendor: 'industry' },
  '1μm':       { d0: 0.25, year: 1982, label: '1μm  (1982)',         vendor: 'industry' },
  '800nm':     { d0: 0.30, year: 1985, label: '800nm (1985)',        vendor: 'industry' },
  '600nm':     { d0: 0.40, year: 1987, label: '600nm (1987)',        vendor: 'industry' },
  '350nm':     { d0: 0.50, year: 1990, label: '350nm (1990)',        vendor: 'industry' },
  '250nm':     { d0: 0.55, year: 1995, label: '250nm (1995)',        vendor: 'industry' },
  '180nm':     { d0: 0.60, year: 1999, label: '180nm (1999)',        vendor: 'industry' },
  '130nm':     { d0: 0.65, year: 2001, label: '130nm (2001)',        vendor: 'industry' },
  '90nm':      { d0: 0.70, year: 2003, label: '90nm  (2003)',        vendor: 'industry' },
  '65nm':      { d0: 0.75, year: 2005, label: '65nm  (2005)',        vendor: 'industry' },
  '45nm':      { d0: 0.80, year: 2007, label: '45nm  (2007)',        vendor: 'industry' },
  '32nm':      { d0: 0.85, year: 2009, label: '32nm  (2009)',        vendor: 'industry' },
  '22nm':      { d0: 0.90, year: 2012, label: '22nm  (2012)',        vendor: 'industry' },

  // ── FinFET era ─────────────────────────────────────────────
  '14nm':      { d0: 0.10, year: 2014, label: '14nm  (2014)',        vendor: 'industry' },
  '10nm':      { d0: 0.09, year: 2016, label: '10nm  (2016)',        vendor: 'industry' },
  '7nm':       { d0: 0.08, year: 2018, label: '7nm   (2018)',        vendor: 'industry' },
  '5nm':       { d0: 0.07, year: 2020, label: '5nm   (2020)',        vendor: 'industry' },
  '3nm':       { d0: 0.06, year: 2022, label: '3nm   (2022)',        vendor: 'industry' },

  // ── Intel process nodes (Intel branding, post-10nm rename) ─
  'Intel 4':   { d0: 0.07, year: 2022, label: 'Intel 4 (2022)',      vendor: 'intel',
                 note: 'Intel 4 — FinFET, EUV. Used in Meteor Lake. ≈ TSMC 5nm class.' },
  'Intel 3':   { d0: 0.065,year: 2023, label: 'Intel 3 (2023)',      vendor: 'intel',
                 note: 'Intel 3 — enhanced Intel 4 with higher density and performance tiles.' },

  // ── Angstrom era (Intel) ────────────────────────────────────
  '20A':       { d0: 0.055,year: 2024, label: '20A   (Intel, 2024)', vendor: 'intel',
                 note: 'Intel 20A — first Angstrom-class node; introduced RibbonFET GAA and PowerVia backside power delivery. Largely skipped for products; platform used for 18A development.' },
  '18A':       { d0: 0.050,year: 2025, label: '18A   (Intel, 2025)', vendor: 'intel',
                 note: 'Intel 18A — RibbonFET + PowerVia. Intel\'s flagship process for Panther Lake and external foundry customers. Currently in risk production.' },
  '14A':       { d0: 0.040,year: 2026, label: '14A   (Intel, 2026)', vendor: 'intel',
                 note: 'Intel 14A — next Angstrom node; High-NA EUV. Projected ~2026–2027.' },

  // ── Sub-2nm industry nodes ──────────────────────────────────
  '2nm':       { d0: 0.050, year: 2025, label: '2nm   (2025)',        vendor: 'industry',
                 note: 'TSMC N2 / Samsung SF2 — GAA nanosheet. In risk production 2024, HVM 2025.' },
};

// ── Typical wafer cost by process node ($USD, HVM pricing) ───
export const WAFER_COSTS = {
  '3μm':    500,
  '2μm':    600,
  '1.5μm':  700,
  '1μm':    800,
  '800nm':  900,
  '600nm':  1000,
  '350nm':  1200,
  '250nm':  1500,
  '180nm':  1800,
  '130nm':  2000,
  '90nm':   2200,
  '65nm':   2500,
  '45nm':   2800,
  '32nm':   3200,
  '22nm':   3800,
  '14nm':   4500,
  '10nm':   6000,
  '7nm':    8000,
  '5nm':    12000,
  '3nm':    18000,
  'Intel 4': 13000,
  'Intel 3': 15000,
  '20A':    20000,
  '18A':    22000,
  '14A':    28000,
  '2nm':    25000,
};

// ============================================================
// Core calculations
// ============================================================

/**
 * Dies per wafer (Neter & Scheraga approximation)
 */
export function diesPerWafer(waferDiamMm, dieAreaMm2, edgeLossMm = 3) {
  const effectiveR  = waferDiamMm / 2 - edgeLossMm;
  const waferArea   = Math.PI * effectiveR * effectiveR;
  const edgeCorrection = (Math.PI * effectiveR) / Math.sqrt(2 * dieAreaMm2);
  return Math.floor(waferArea / dieAreaMm2 - edgeCorrection);
}

/**
 * Murphy's Law yield model  Y = [(1 − e^(−D₀·A)) / (D₀·A)]²
 */
export function murphyYield(d0, dieAreaMm2) {
  const x = d0 * (dieAreaMm2 / 100);
  if (x < 0.0001) return 1;
  return Math.pow((1 - Math.exp(-x)) / x, 2);
}

/**
 * Poisson yield model  Y = e^(−D₀·A)
 */
export function poissonYield(d0, dieAreaMm2) {
  return Math.exp(-d0 * (dieAreaMm2 / 100));
}

/**
 * Full calculation result object
 * @param {string} maturity - key from MATURITY_LEVELS ('pilot'|'ramp'|'hvm'|'mature')
 */
export function calculate({ waferDiamMm, dieAreaMm2, processNode, maturity = 'hvm', waferCostOverride, edgeLossMm = 3 }) {
  const node = PROCESS_NODES[processNode];
  if (!node) throw new Error(`Unknown process node: ${processNode}`);

  const maturityLevel = MATURITY_LEVELS[maturity] ?? MATURITY_LEVELS.hvm;
  const d0Effective   = node.d0 * maturityLevel.multiplier;
  const waferCost     = waferCostOverride ?? WAFER_COSTS[processNode] ?? 2000;

  const dpw    = diesPerWafer(waferDiamMm, dieAreaMm2, edgeLossMm);
  const yMurphy  = murphyYield(d0Effective, dieAreaMm2);
  const yPoisson = poissonYield(d0Effective, dieAreaMm2);
  const gdpw   = Math.floor(dpw * yMurphy);
  const cpgd   = gdpw > 0 ? waferCost / gdpw : null;

  return {
    diesPerWafer:       dpw,
    yieldMurphy:        yMurphy,
    yieldPoisson:       yPoisson,
    goodDiesPerWafer:   gdpw,
    costPerGoodDie:     cpgd,
    defectDensityBase:  node.d0,
    defectDensityEffective: d0Effective,
    maturityMultiplier: maturityLevel.multiplier,
    maturityLabel:      maturityLevel.label,
    waferCost,
    processNodeLabel:   node.label,
    nodeNote:           node.note ?? null,
    vendor:             node.vendor,
    dieAreaCm2:         dieAreaMm2 / 100,
  };
}
