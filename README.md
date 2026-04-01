# YieldDesk

**Free, open-source semiconductor yield and wafer cost calculator.**

No accounts. No paywalls. No telemetry. Just the tool.

**Live**: https://sh0tybumbati.github.io/yielddesk

---

## What it does

- **6 yield models** — Murphy, Poisson, Rectangular, Moore, Seeds, Bose-Einstein
- **26 process nodes** — 3μm (1971) through Intel 14A (2026), grouped by industry/Intel
- **Process maturity** — Pilot / Ramp / HVM / Mature with D₀ scaling
- **Cost modeling** — wafer cost + mask set cost + amortization by volume
- **Yield sensitivity curve** — yield vs die area at fixed node/maturity (unique feature)
- **Wafer map canvas** — live visualization with scribe-line-aware tiling
- **Reticle utilization** — warns when die approaches 26×33mm field limit
- **URL permalink sharing** — all parameters encoded in query string

## Roadmap

- [ ] Node comparison table — same die, all 26 nodes, sorted by cost/die
- [ ] Chiplet / multi-die system yield — ∏(die yields × bonding yield)
- [ ] Monte Carlo uncertainty bands — yield confidence interval from D₀ uncertainty
- [ ] EUV pass cost modeling — multi-patterning vs EUV tradeoffs
- [ ] Embeddable widget — drop-in `<iframe>` for any site
- [ ] Open node database — `data/nodes.json` with IRDS/ITRS citations, community PRs welcome

## Contributing

PRs welcome, especially:
- Corrections to D₀ or cost data (cite your source)
- New process nodes
- Bug fixes

## Stack

Vanilla JS (ES modules), no build step. Open `index.html` directly or serve with any static host.

## License

MIT
