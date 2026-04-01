# YieldDesk — Feature Development

YieldDesk is a free, open-source semiconductor yield and wafer cost calculator.
Static site, vanilla JS, no build step. Lives at `index.html` + `js/calculator.js` + `js/app.js`.

**Philosophy**: No monetization, no paywalls. The Wikipedia of semiconductor cost modeling.

## Already built (skip these)
- Node comparison table with filter/sort (compareNodes() in calculator.js, table in app.js)
- CSV export of comparison table
- allModelComparison() function

## Build these features in order

### 1. Chiplet / multi-die system yield (HIGHEST PRIORITY)

Add a new collapsible panel below the comparison table: "System Yield (Chiplet / Multi-Die)"

UI: a list of dies. Each row has: name (text), width (mm), height (mm), process node (select), maturity (select), count (integer), bonding yield % (default 99.5).
Buttons: "+ Add Die", "× Remove".

Calculate and display:
- Each die's individual yield (use Murphy model, same D₀ logic as main calc)
- Each die's cost per good die
- System yield = ∏(die_yield_i ^ count_i) × ∏(bonding_yield_i ^ count_i)
- Total system cost = Σ(cost_per_good_die_i × count_i) / system_yield
- Show the breakdown table: each die's contribution

Add `calculateSystemYield(dies)` to calculator.js. Each die in the array: `{ nodeKey, dieWidthMm, dieHeightMm, maturity, count, bondingYieldPct }`.

This is what no other free tool has.

### 2. Monte Carlo uncertainty bands on the sensitivity curve

D₀ is always an estimate. Add uncertainty to the sensitivity curve.

- Add a slider: "D₀ uncertainty ±%" (range 0–50%, default 20%)
- When non-zero, run 200 Monte Carlo samples (fast enough for real-time)
- Use a simple seeded LCG for reproducibility: seed = hash of (node + maturity + model)
- Draw P10/P90 band as a shaded region behind the sensitivity curve
- The P50 line is the existing curve (unchanged)
- Show confidence interval on the main yield number: "42.3% [P10: 28% — P90: 58%]"

Add `yieldCurveMonteCarlo({ processNode, maturity, yieldModel, critLayers, uncertaintyPct, samples, seed })` to calculator.js. Returns `{ p10, p50, p90 }` arrays of `{ areaMm2, yield }`.

### 3. SEO and metadata

In `index.html`:
- Update `<title>` to: "YieldDesk — Free Semiconductor Yield & Cost Calculator"
- Update meta description to mention chiplet/system yield
- Add `<link rel="canonical">` pointing to https://sh0tybumbati.github.io/yielddesk/

Create `sitemap.xml` in the project root:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://sh0tybumbati.github.io/yielddesk/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
```

Create `robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://sh0tybumbati.github.io/yielddesk/sitemap.xml
```

## Rules

- Vanilla JS only. No frameworks, no build step, no npm.
- All math goes in `calculator.js`. UI wiring goes in `app.js`. Markup in `index.html`.
- Don't break existing functionality.
- Commit after each feature with a clear message.
- No monetization, no Pro gates, no user tracking.

## Exit condition

When all 3 features are implemented and committed, write "EXIT_SIGNAL" to `.ralph/done.txt`.
