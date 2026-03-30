// ============================================================
// Semiconductor Yield & Cost Calculator — Core Math
// Sources:
//   - Murphy's Law model (Seeds, 1988)
//   - Poisson, Rectangular, Moore, Seeds, Bose-Einstein models
//   - SEMI standard wafer sizes
//   - ITRS/IRDS defect density tables
//   - Intel Architecture Day / IEEE IEDM disclosures
// ============================================================

export const WAFER_DIAMETERS_MM = {
  '100mm (4")':  100,
  '150mm (6")':  150,
  '200mm (8")':  200,
  '300mm (12")': 300,
  '450mm (18")': 450,
};

// ── Process maturity D₀ multipliers ──────────────────────────
export const MATURITY_LEVELS = {
  pilot:  { label: 'Pilot',  sublabel: 'Engineering samples', multiplier: 3.0 },
  ramp:   { label: 'Ramp',   sublabel: 'First 6–12 months',   multiplier: 2.0 },
  hvm:    { label: 'HVM',    sublabel: 'High Volume Mfg',     multiplier: 1.0 },
  mature: { label: 'Mature', sublabel: '2+ yrs optimized',    multiplier: 0.7 },
};

// ── Yield models ──────────────────────────────────────────────
// λ = D₀ × critical_area_cm²
export const YIELD_MODELS = {
  murphy:       { label: "Murphy's Law",  formula: 'Y = [(1−e^(−λ))/λ]²',      fn: (l) => l < 1e-9 ? 1 : Math.pow((1 - Math.exp(-l)) / l, 2) },
  poisson:      { label: 'Poisson',       formula: 'Y = e^(−λ)',                fn: (l) => Math.exp(-l) },
  rectangular:  { label: 'Rectangular',   formula: 'Y = (1−e^(−2λ))/(2λ)',     fn: (l) => l < 1e-9 ? 1 : (1 - Math.exp(-2 * l)) / (2 * l) },
  moore:        { label: 'Moore',         formula: 'Y = e^(−√λ)',               fn: (l) => Math.exp(-Math.sqrt(l)) },
  seeds:        { label: 'Seeds',         formula: 'Y = 1/(1+λ)',               fn: (l) => 1 / (1 + l) },
  bose_einstein:{ label: 'Bose-Einstein', formula: 'Y = (1/(1+λ))^n',          fn: (l, n = 25) => Math.pow(1 / (1 + l), n) },
};

// ── Process nodes ─────────────────────────────────────────────
export const PROCESS_NODES = {
  // Micron era
  '3μm':       { d0: 0.10,  year: 1971, label: '3μm  (1971)',         vendor: 'industry' },
  '2μm':       { d0: 0.15,  year: 1975, label: '2μm  (1975)',         vendor: 'industry' },
  '1.5μm':     { d0: 0.20,  year: 1978, label: '1.5μm (1978)',        vendor: 'industry' },
  '1μm':       { d0: 0.25,  year: 1982, label: '1μm  (1982)',         vendor: 'industry' },
  '800nm':     { d0: 0.30,  year: 1985, label: '800nm (1985)',        vendor: 'industry' },
  '600nm':     { d0: 0.40,  year: 1987, label: '600nm (1987)',        vendor: 'industry' },
  '350nm':     { d0: 0.50,  year: 1990, label: '350nm (1990)',        vendor: 'industry' },
  '250nm':     { d0: 0.55,  year: 1995, label: '250nm (1995)',        vendor: 'industry' },
  '180nm':     { d0: 0.60,  year: 1999, label: '180nm (1999)',        vendor: 'industry' },
  '130nm':     { d0: 0.65,  year: 2001, label: '130nm (2001)',        vendor: 'industry' },
  '90nm':      { d0: 0.70,  year: 2003, label: '90nm  (2003)',        vendor: 'industry' },
  '65nm':      { d0: 0.75,  year: 2005, label: '65nm  (2005)',        vendor: 'industry' },
  '45nm':      { d0: 0.80,  year: 2007, label: '45nm  (2007)',        vendor: 'industry' },
  '32nm':      { d0: 0.85,  year: 2009, label: '32nm  (2009)',        vendor: 'industry' },
  '22nm':      { d0: 0.90,  year: 2012, label: '22nm  (2012)',        vendor: 'industry' },
  // FinFET era
  '14nm':      { d0: 0.10,  year: 2014, label: '14nm  (2014)',        vendor: 'industry' },
  '10nm':      { d0: 0.09,  year: 2016, label: '10nm  (2016)',        vendor: 'industry' },
  '7nm':       { d0: 0.08,  year: 2018, label: '7nm   (2018)',        vendor: 'industry' },
  '5nm':       { d0: 0.07,  year: 2020, label: '5nm   (2020)',        vendor: 'industry' },
  '3nm':       { d0: 0.06,  year: 2022, label: '3nm   (2022)',        vendor: 'industry' },
  '2nm':       { d0: 0.050, year: 2025, label: '2nm   (2025)',        vendor: 'industry',
                 note: 'TSMC N2 / Samsung SF2 — GAA nanosheet. In risk production 2024, HVM 2025.' },
  // Intel nodes
  'Intel 4':   { d0: 0.07,  year: 2022, label: 'Intel 4 (2022)',      vendor: 'intel',
                 note: 'Intel 4 — FinFET, EUV. Used in Meteor Lake. ≈ TSMC 5nm class.' },
  'Intel 3':   { d0: 0.065, year: 2023, label: 'Intel 3 (2023)',      vendor: 'intel',
                 note: 'Intel 3 — enhanced Intel 4, higher density and performance tiles.' },
  // Angstrom era
  '20A':       { d0: 0.055, year: 2024, label: '20A   (Intel, 2024)', vendor: 'intel',
                 note: 'Intel 20A — first Angstrom node; RibbonFET GAA + PowerVia backside power. Largely skipped for products; platform used for 18A development.' },
  '18A':       { d0: 0.050, year: 2025, label: '18A   (Intel, 2025)', vendor: 'intel',
                 note: 'Intel 18A — RibbonFET + PowerVia. Flagship process for Panther Lake and external customers. Currently in risk production.' },
  '14A':       { d0: 0.040, year: 2026, label: '14A   (Intel, 2026)', vendor: 'intel',
                 note: 'Intel 14A — High-NA EUV. Projected ~2026–2027.' },
};

export const WAFER_COSTS = {
  '3μm': 500, '2μm': 600, '1.5μm': 700, '1μm': 800, '800nm': 900,
  '600nm': 1000, '350nm': 1200, '250nm': 1500, '180nm': 1800, '130nm': 2000,
  '90nm': 2200, '65nm': 2500, '45nm': 2800, '32nm': 3200, '22nm': 3800,
  '14nm': 4500, '10nm': 6000, '7nm': 8000, '5nm': 12000, '3nm': 18000,
  '2nm': 25000, 'Intel 4': 13000, 'Intel 3': 15000,
  '20A': 20000, '18A': 22000, '14A': 28000,
};

// ── Mask set costs ($USD) ─────────────────────────────────────
// Full mask set cost (all layers) by process node.
// Sources: Gartner, IBS, VLSI Research, industry disclosures.
// Costs reflect HVM pricing; NRE/shuttle runs are higher.
export const MASK_COSTS = {
  '3μm':    75_000,       // g-line contact/proximity
  '2μm':    100_000,
  '1.5μm':  130_000,
  '1μm':    170_000,
  '800nm':  220_000,
  '600nm':  300_000,
  '350nm':  400_000,      // i-line stepper
  '250nm':  600_000,
  '180nm':  900_000,      // 248nm DUV starts
  '130nm':  1_300_000,
  '90nm':   1_800_000,    // 193nm dry
  '65nm':   2_500_000,
  '45nm':   3_500_000,    // 193nm immersion starts
  '32nm':   5_000_000,
  '22nm':   7_000_000,    // double patterning
  '14nm':   10_000_000,   // multi-patterning intensive
  '10nm':   15_000_000,
  '7nm':    20_000_000,   // EUV starts
  '5nm':    30_000_000,
  '3nm':    45_000_000,
  '2nm':    70_000_000,   // EUV + High-NA ramp
  'Intel 4': 25_000_000,
  'Intel 3': 30_000_000,
  '20A':    50_000_000,
  '18A':    60_000_000,
  '14A':    80_000_000,   // High-NA EUV
};

// Standard ASML scanner reticle field (mm)
export const RETICLE_FIELD = { width: 26, height: 33 };

// ============================================================
// Core calculations
// ============================================================

/**
 * Dies per wafer accounting for scribe lines and edge exclusion.
 * Scribe lines add to the die pitch, reducing effective packing density.
 */
export function diesPerWafer(waferDiamMm, dieWidthMm, dieHeightMm, edgeLossMm = 3, scrLineX = 0.1, scrLineY = 0.1) {
  const effectiveR = waferDiamMm / 2 - edgeLossMm;
  const waferArea  = Math.PI * effectiveR * effectiveR;
  const pitchX     = dieWidthMm  + scrLineX;
  const pitchY     = dieHeightMm + scrLineY;
  const pitchArea  = pitchX * pitchY;
  const edgeCorrection = (Math.PI * effectiveR) / Math.sqrt(2 * pitchArea);
  return Math.max(0, Math.floor(waferArea / pitchArea - edgeCorrection));
}

/**
 * Yield for any model given λ = D₀ × critical_area_cm²
 * @param {string} model  - key of YIELD_MODELS
 * @param {number} d0     - effective defect density (defects/cm²)
 * @param {number} critAreaMm2 - critical area in mm²
 * @param {number} critLayers  - for Bose-Einstein only
 */
export function yieldFor(model, d0, critAreaMm2, critLayers = 25) {
  const lambda = d0 * (critAreaMm2 / 100);
  const m = YIELD_MODELS[model] ?? YIELD_MODELS.murphy;
  return Math.min(1, Math.max(0, m.fn(lambda, critLayers)));
}

/**
 * Reticle utilization and limit check.
 * Returns { utilPct, exceedsWidth, exceedsHeight, exceedsField }
 */
export function reticleInfo(dieWidthMm, dieHeightMm) {
  const utilPct       = (dieWidthMm * dieHeightMm) / (RETICLE_FIELD.width * RETICLE_FIELD.height) * 100;
  const exceedsWidth  = dieWidthMm  > RETICLE_FIELD.width;
  const exceedsHeight = dieHeightMm > RETICLE_FIELD.height;
  return {
    utilPct,
    exceedsWidth,
    exceedsHeight,
    exceedsField: exceedsWidth || exceedsHeight,
    nearLimit: utilPct > 70 && !exceedsWidth && !exceedsHeight,
  };
}

/**
 * Full calculation result.
 * @param {number} waferCount      - number of wafers ordered (for mask amortization)
 * @param {number} maskCostOverride - override default mask set cost
 */
export function calculate({
  waferDiamMm, dieWidthMm, dieHeightMm,
  processNode, maturity = 'hvm',
  yieldModel = 'murphy', critLayers = 25,
  critAreaMm2 = null,
  waferCostOverride, maskCostOverride,
  waferCount = 100,
  edgeLossMm = 3, scrLineX = 0.1, scrLineY = 0.1,
}) {
  const node = PROCESS_NODES[processNode];
  if (!node) throw new Error(`Unknown process node: ${processNode}`);

  const dieAreaMm2        = dieWidthMm * dieHeightMm;
  const effectiveCritArea = critAreaMm2 ?? dieAreaMm2;
  const maturityLevel     = MATURITY_LEVELS[maturity] ?? MATURITY_LEVELS.hvm;
  const d0Effective       = node.d0 * maturityLevel.multiplier;
  const waferCost         = waferCostOverride ?? WAFER_COSTS[processNode] ?? 2000;
  const maskCost          = maskCostOverride  ?? MASK_COSTS[processNode]  ?? 1_000_000;

  const dpw    = diesPerWafer(waferDiamMm, dieWidthMm, dieHeightMm, edgeLossMm, scrLineX, scrLineY);
  const yMain  = yieldFor(yieldModel, d0Effective, effectiveCritArea, critLayers);
  const yMurphy = yieldFor('murphy', d0Effective, effectiveCritArea);
  const gdpw   = Math.floor(dpw * yMain);

  const waferCostPerDie = gdpw > 0 ? waferCost / gdpw : null;
  const totalGoodDies   = gdpw * waferCount;
  const maskCostPerDie  = totalGoodDies > 0 ? maskCost / totalGoodDies : null;
  const totalCostPerDie = (waferCostPerDie != null && maskCostPerDie != null)
    ? waferCostPerDie + maskCostPerDie : null;

  const reticle = reticleInfo(dieWidthMm, dieHeightMm);

  return {
    diesPerWafer:            dpw,
    yield:                   yMain,
    yieldMurphy:             yMurphy,
    goodDiesPerWafer:        gdpw,
    waferCostPerDie,
    maskCostPerDie,
    totalCostPerDie,
    maskCost,
    defectDensityBase:       node.d0,
    defectDensityEffective:  d0Effective,
    maturityMultiplier:      maturityLevel.multiplier,
    maturityLabel:           maturityLevel.label,
    waferCost,
    waferCount,
    dieAreaMm2,
    critAreaMm2:             effectiveCritArea,
    reticle,
    processNodeLabel:        node.label,
    nodeNote:                node.note ?? null,
    vendor:                  node.vendor,
  };
}

/**
 * Sensitivity curve: yield vs die area at fixed node/maturity/model.
 * Returns array of {areaMm2, yield} points.
 */
export function yieldCurve({ processNode, maturity = 'hvm', yieldModel = 'murphy', critLayers = 25, critFraction = 1.0, points = 80 }) {
  const node = PROCESS_NODES[processNode];
  if (!node) return [];
  const d0 = node.d0 * (MATURITY_LEVELS[maturity]?.multiplier ?? 1);

  // Range: 1mm² to ~800mm² (largest reticle-limited die)
  const result = [];
  for (let i = 0; i <= points; i++) {
    const areaMm2 = 1 + (i / points) * 799;
    const critArea = areaMm2 * critFraction;
    result.push({ areaMm2, yield: yieldFor(yieldModel, d0, critArea, critLayers) });
  }
  return result;
}
