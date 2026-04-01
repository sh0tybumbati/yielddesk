import {
  calculate, yieldCurve, compareNodes, allModelComparison,
  PROCESS_NODES, WAFER_DIAMETERS_MM, WAFER_COSTS, MASK_COSTS, MATURITY_LEVELS, YIELD_MODELS,
} from './calculator.js';

// ── Populate selects ──────────────────────────────────────────
const nodeSelect  = document.getElementById('processNode');
const waferSelect = document.getElementById('waferSize');

const grpIndustry = document.createElement('optgroup');
grpIndustry.label = 'Industry Nodes';
const grpIntel = document.createElement('optgroup');
grpIntel.label = 'Intel Process Nodes';

Object.entries(PROCESS_NODES).forEach(([key, n]) => {
  const opt = document.createElement('option');
  opt.value = key; opt.textContent = n.label;
  if (key === '14nm') opt.selected = true;
  (n.vendor === 'intel' ? grpIntel : grpIndustry).appendChild(opt);
});
nodeSelect.appendChild(grpIndustry);
nodeSelect.appendChild(grpIntel);

Object.keys(WAFER_DIAMETERS_MM).forEach(label => {
  const opt = document.createElement('option');
  opt.value = label; opt.textContent = label;
  if (label === '300mm (12")') opt.selected = true;
  waferSelect.appendChild(opt);
});

// ── State ─────────────────────────────────────────────────────
let selectedMaturity = 'hvm';

// ── Wafer canvas ──────────────────────────────────────────────
const waferCanvas = document.getElementById('waferCanvas');
const wCtx = waferCanvas.getContext('2d');
const WS = 260;
waferCanvas.width = waferCanvas.height = WS;

function seededRand(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function drawWafer(waferDiamMm, dieWidthMm, dieHeightMm, yieldFrac, edgeLossMm, scrX, scrY) {
  wCtx.clearRect(0, 0, WS, WS);
  const cx = WS / 2, cy = WS / 2, r = WS / 2 - 6;

  const grad = wCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, '#1a2232'); grad.addColorStop(1, '#111720');
  wCtx.beginPath(); wCtx.arc(cx, cy, r, 0, Math.PI * 2);
  wCtx.fillStyle = grad; wCtx.fill();
  wCtx.strokeStyle = '#1e2d42'; wCtx.lineWidth = 2; wCtx.stroke();

  const scale       = (r * 2) / waferDiamMm;
  const pitchX      = (dieWidthMm  + scrX) * scale;
  const pitchY      = (dieHeightMm + scrY) * scale;
  const dieWPx      = dieWidthMm  * scale;
  const dieHPx      = dieHeightMm * scale;
  const effectiveRPx = (waferDiamMm / 2 - edgeLossMm) * scale;

  if (dieWPx < 1.5 || dieHPx < 1.5) {
    wCtx.save();
    wCtx.beginPath(); wCtx.arc(cx, cy, effectiveRPx, 0, Math.PI * 2);
    wCtx.fillStyle = `hsla(${yieldFrac * 120}, 80%, 45%, 0.6)`; wCtx.fill();
    wCtx.restore();
    wCtx.font = 'bold 13px monospace'; wCtx.fillStyle = '#fff';
    wCtx.textAlign = 'center'; wCtx.textBaseline = 'middle';
    wCtx.fillText(`${(yieldFrac * 100).toFixed(1)}% yield`, cx, cy - 8);
    wCtx.fillStyle = 'rgba(255,255,255,0.5)'; wCtx.font = '10px monospace';
    wCtx.fillText('(dies too small to render)', cx, cy + 10);
    drawNotch(cx, cy, r); return;
  }

  const numCols = Math.ceil(waferDiamMm / (dieWidthMm  + scrX)) + 2;
  const numRows = Math.ceil(waferDiamMm / (dieHeightMm + scrY)) + 2;
  const startX  = cx - (numCols * pitchX) / 2;
  const startY  = cy - (numRows * pitchY) / 2;
  const rand    = seededRand(Math.round(yieldFrac * 10000));

  wCtx.save();
  wCtx.beginPath(); wCtx.arc(cx, cy, r - 1, 0, Math.PI * 2); wCtx.clip();

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const x = startX + col * pitchX;
      const y = startY + row * pitchY;
      const dcx = x + dieWPx / 2 - cx, dcy = y + dieHPx / 2 - cy;
      if (Math.sqrt(dcx * dcx + dcy * dcy) > effectiveRPx) continue;
      wCtx.fillStyle = rand() < yieldFrac ? 'rgba(0,232,122,0.75)' : 'rgba(255,74,106,0.6)';
      wCtx.fillRect(x + 0.5, y + 0.5, dieWPx - 1, dieHPx - 1);
      if (dieWPx > 5 && dieHPx > 5) {
        wCtx.strokeStyle = 'rgba(0,0,0,0.25)'; wCtx.lineWidth = 0.5;
        wCtx.strokeRect(x + 0.5, y + 0.5, dieWPx - 1, dieHPx - 1);
      }
    }
  }
  wCtx.restore();
  drawNotch(cx, cy, r);
}

function drawNotch(cx, cy, r) {
  wCtx.beginPath(); wCtx.arc(cx, cy + r - 3, 4, 0, Math.PI * 2);
  wCtx.fillStyle = '#0a0e14'; wCtx.fill();
}

// ── Sensitivity curve ─────────────────────────────────────────
const curveCanvas = document.getElementById('curveCanvas');
const cCtx = curveCanvas.getContext('2d');

function drawCurve(processNode, maturity, yieldModel, critLayers, currentAreaMm2, currentYield) {
  const dpr = window.devicePixelRatio || 1;
  const rect = curveCanvas.getBoundingClientRect();
  curveCanvas.width  = rect.width  * dpr;
  curveCanvas.height = rect.height * dpr;
  cCtx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const pad = { top: 12, right: 16, bottom: 28, left: 42 };
  const gW = W - pad.left - pad.right;
  const gH = H - pad.top  - pad.bottom;

  cCtx.clearRect(0, 0, W, H);

  const points = yieldCurve({ processNode, maturity, yieldModel, critLayers });
  if (!points.length) return;

  const maxArea = 800;

  // Grid lines + Y labels
  cCtx.strokeStyle = '#1e2d42'; cCtx.lineWidth = 1;
  cCtx.font = `${10 * dpr / dpr}px monospace`; cCtx.fillStyle = '#3d5068';
  cCtx.textAlign = 'right'; cCtx.textBaseline = 'middle';
  [0, 25, 50, 75, 100].forEach(pct => {
    const y = pad.top + gH * (1 - pct / 100);
    cCtx.beginPath(); cCtx.moveTo(pad.left, y); cCtx.lineTo(pad.left + gW, y); cCtx.stroke();
    cCtx.fillText(`${pct}%`, pad.left - 6, y);
  });

  // X labels
  cCtx.textAlign = 'center'; cCtx.textBaseline = 'top';
  [0, 200, 400, 600, 800].forEach(a => {
    const x = pad.left + (a / maxArea) * gW;
    cCtx.fillText(`${a}`, x, pad.top + gH + 4);
  });
  cCtx.fillStyle = '#3d5068';
  cCtx.fillText('Die area (mm²)', pad.left + gW / 2, pad.top + gH + 16);

  // Curve
  cCtx.beginPath();
  points.forEach((p, i) => {
    const x = pad.left + (p.areaMm2 / maxArea) * gW;
    const y = pad.top  + gH * (1 - p.yield);
    i === 0 ? cCtx.moveTo(x, y) : cCtx.lineTo(x, y);
  });
  cCtx.strokeStyle = '#00c8ff'; cCtx.lineWidth = 2; cCtx.stroke();

  // Current die marker
  if (currentAreaMm2 <= maxArea) {
    const mx = pad.left + (currentAreaMm2 / maxArea) * gW;
    const my = pad.top  + gH * (1 - currentYield);
    // Vertical guide
    cCtx.beginPath(); cCtx.setLineDash([3, 3]);
    cCtx.moveTo(mx, pad.top + gH); cCtx.lineTo(mx, my);
    cCtx.strokeStyle = 'rgba(0,200,255,0.3)'; cCtx.lineWidth = 1; cCtx.stroke();
    cCtx.setLineDash([]);
    // Dot
    cCtx.beginPath(); cCtx.arc(mx, my, 5, 0, Math.PI * 2);
    cCtx.fillStyle = '#00c8ff'; cCtx.fill();
    // Label
    const label = `${(currentYield * 100).toFixed(1)}%`;
    cCtx.font = 'bold 11px monospace'; cCtx.fillStyle = '#fff';
    cCtx.textAlign = mx > W - 60 ? 'right' : 'left';
    cCtx.textBaseline = 'bottom';
    cCtx.fillText(label, mx + (mx > W - 60 ? -8 : 8), my - 4);
  }
}

// ── Result helpers ────────────────────────────────────────────
function yieldClass(y) { return y >= 0.7 ? 'good' : y >= 0.4 ? 'warn' : 'bad'; }
function fmt(n) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function fmtMoney(n) {
  if (n == null || !isFinite(n)) return '—';
  return n >= 1000 ? `$${fmt(n)}` : `$${n.toFixed(2)}`;
}

// ── Main update ───────────────────────────────────────────────
let lastParams = {};

function updateResults() {
  const waferLabel  = waferSelect.value;
  const waferDiamMm = WAFER_DIAMETERS_MM[waferLabel];
  const dieWidthMm  = parseFloat(document.getElementById('dieWidth').value)  || 10;
  const dieHeightMm = parseFloat(document.getElementById('dieHeight').value) || 10;
  const dieAreaMm2  = dieWidthMm * dieHeightMm;
  const processNode = nodeSelect.value;
  const yieldModel  = document.getElementById('yieldModel').value;
  const critLayers  = parseInt(document.getElementById('critLayers').value) || 25;
  const allCritical = document.getElementById('allCritical').checked;
  const critAreaRaw = parseFloat(document.getElementById('critArea').value);
  const critAreaMm2 = allCritical ? null : (isNaN(critAreaRaw) ? null : critAreaRaw);
  const scrLineX    = parseFloat(document.getElementById('scrLineX').value) || 0;
  const scrLineY    = parseFloat(document.getElementById('scrLineY').value) || 0;
  const waferCount      = parseInt(document.getElementById('waferCount').value) || 100;
  const maskCostRaw     = document.getElementById('maskCost').value;
  const maskCostOverride = maskCostRaw ? parseFloat(maskCostRaw) : undefined;
  const waferCostRaw    = document.getElementById('waferCost').value;
  const waferCostOverride = waferCostRaw ? parseFloat(waferCostRaw) : undefined;
  const edgeLoss        = parseFloat(document.getElementById('edgeLoss').value) || 3;

  document.getElementById('dieAreaDisplay').textContent = dieAreaMm2.toFixed(2) + ' mm²';
  document.getElementById('critLayersGroup').style.display = yieldModel === 'bose_einstein' ? 'block' : 'none';

  const defaultCost = WAFER_COSTS[processNode];
  document.getElementById('waferCost').placeholder = defaultCost ? `$${defaultCost} (default)` : '';
  const defaultMask = MASK_COSTS[processNode];
  document.getElementById('maskCost').placeholder  = defaultMask ? `$${(defaultMask/1e6).toFixed(0)}M (default)` : '';

  let result;
  try {
    result = calculate({
      waferDiamMm, dieWidthMm, dieHeightMm,
      processNode, maturity: selectedMaturity,
      yieldModel, critLayers, critAreaMm2,
      waferCostOverride, maskCostOverride, waferCount,
      edgeLossMm: edgeLoss, scrLineX, scrLineY,
    });
  } catch(e) { console.error(e); return; }

  lastParams = { waferDiamMm, dieWidthMm, dieHeightMm, processNode, yieldModel, critLayers,
    critAreaMm2, scrLineX, scrLineY, waferCostOverride, maskCostOverride, waferCount, edgeLoss,
    maturity: selectedMaturity };

  const yPct = (result.yield * 100).toFixed(1) + '%';

  // Core results
  document.getElementById('res-dpw').textContent   = fmt(result.diesPerWafer);
  document.getElementById('res-yield').textContent = yPct;
  document.getElementById('res-gdpw').textContent  = fmt(result.goodDiesPerWafer);
  document.getElementById('res-yield').className   = 'result-value ' + yieldClass(result.yield);
  document.getElementById('res-gdpw').className    = 'result-value ' + yieldClass(result.yield);

  // Reticle
  const ric = result.reticle;
  const reticleEl = document.getElementById('res-reticle');
  reticleEl.textContent = ric.exceedsField ? 'EXCEEDS' : ric.utilPct.toFixed(1) + '%';
  reticleEl.className   = 'result-value ' + (ric.exceedsField ? 'bad' : ric.nearLimit ? 'warn' : '');

  const warnEl = document.getElementById('reticleWarning');
  if (ric.exceedsField) {
    const dims = [];
    if (ric.exceedsWidth)  dims.push(`width (${dieWidthMm}mm > 26mm)`);
    if (ric.exceedsHeight) dims.push(`height (${dieHeightMm}mm > 33mm)`);
    warnEl.textContent = `⚠ Die exceeds reticle field on ${dims.join(' and ')}. Reticle stitching required — consult your foundry.`;
    warnEl.style.display = 'block';
  } else if (ric.nearLimit) {
    warnEl.textContent = `⚠ Die is using ${ric.utilPct.toFixed(1)}% of the reticle field. Approaching the 26×33mm limit.`;
    warnEl.style.display = 'block';
  } else {
    warnEl.style.display = 'none';
  }

  // Cost breakdown
  document.getElementById('res-wafer-cpd').textContent = fmtMoney(result.waferCostPerDie);
  document.getElementById('res-mask-cpd').textContent  = fmtMoney(result.maskCostPerDie);
  document.getElementById('res-total-cpd').textContent = fmtMoney(result.totalCostPerDie);
  document.getElementById('res-mask-vol').textContent  = `@ ${fmt(waferCount)} wafers`;

  // Yield bar
  const bar = document.getElementById('yieldBarFill');
  bar.style.width      = (result.yield * 100) + '%';
  bar.style.background = result.yield >= 0.7 ? 'var(--green)' : result.yield >= 0.4 ? 'var(--yellow)' : 'var(--red)';
  document.getElementById('yieldBarLabel').textContent = yPct;

  // D₀
  document.getElementById('res-d0-base').textContent = result.defectDensityBase.toFixed(3);
  document.getElementById('res-d0-eff').textContent  = result.defectDensityEffective.toFixed(3);

  // Node note
  const noteEl = document.getElementById('nodeNote');
  if (result.nodeNote) { noteEl.textContent = result.nodeNote; noteEl.style.display = 'block'; }
  else { noteEl.style.display = 'none'; }

  drawWafer(waferDiamMm, dieWidthMm, dieHeightMm, result.yield, edgeLoss, scrLineX, scrLineY);
  drawCurve(processNode, selectedMaturity, yieldModel, critLayers, result.critAreaMm2, result.yield);
  updateShareUrl();
  updateCompareTable();
  updateModelComparison(result);
}

// ── All-models comparison panel ───────────────────────────────
function updateModelComparison(result) {
  const models = allModelComparison({
    d0Effective: result.defectDensityEffective,
    critAreaMm2: result.critAreaMm2,
    dpw: result.diesPerWafer,
    critLayers: parseInt(document.getElementById('critLayers').value) || 25,
  });

  const activeModel = document.getElementById('yieldModel').value;
  const maxYield    = models[0].yield;
  const container   = document.getElementById('modelCompareList');
  container.innerHTML = '';

  models.forEach(m => {
    const pct      = (m.yield * 100).toFixed(1);
    const barWidth = maxYield > 0 ? (m.yield / maxYield * 100) : 0;
    const isActive = m.key === activeModel;
    const color    = m.yield >= 0.7 ? 'var(--green)' : m.yield >= 0.4 ? 'var(--yellow)' : 'var(--red)';

    const row = document.createElement('div');
    row.style.cssText = `display:grid;grid-template-columns:140px 1fr 60px 60px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(30,45,66,0.5);cursor:pointer;`;
    if (isActive) row.style.background = 'rgba(0,200,255,0.04)';

    row.innerHTML = `
      <div style="font-family:var(--font-mono);font-size:0.72rem;color:${isActive ? 'var(--accent)' : 'var(--text-muted)'};font-weight:${isActive ? '600' : '400'};">
        ${m.label}${isActive ? ' ◀' : ''}
      </div>
      <div style="background:var(--surface2);border-radius:3px;height:6px;overflow:hidden;">
        <div style="width:${barWidth}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
      </div>
      <div style="font-family:var(--font-mono);font-size:0.8rem;color:${color};text-align:right;font-weight:600;">${pct}%</div>
      <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-muted);text-align:right;">${m.gdpw}</div>
    `;

    row.addEventListener('click', () => {
      document.getElementById('yieldModel').value = m.key;
      updateResults();
    });

    container.appendChild(row);
  });

  // Header row
  const header = document.createElement('div');
  header.style.cssText = 'display:grid;grid-template-columns:140px 1fr 60px 60px;gap:8px;margin-bottom:4px;';
  header.innerHTML = `
    <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);letter-spacing:0.08em;">MODEL</div>
    <div></div>
    <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);text-align:right;">YIELD</div>
    <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);text-align:right;">GDPW</div>
  `;
  container.prepend(header);
}

// ── Critical area toggle ──────────────────────────────────────
document.getElementById('allCritical').addEventListener('change', function() {
  document.getElementById('critAreaInput').style.display = this.checked ? 'none' : 'block';
  updateResults();
});

// ── Maturity toggle ───────────────────────────────────────────
document.querySelectorAll('.maturity-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.maturity-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMaturity = btn.dataset.maturity;
    updateResults();
  });
});

// ── Wire inputs ───────────────────────────────────────────────
['processNode', 'waferSize', 'dieWidth', 'dieHeight', 'yieldModel',
 'critLayers', 'critArea', 'scrLineX', 'scrLineY',
 'waferCount', 'maskCost', 'waferCost', 'edgeLoss'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', updateResults);
});

// ── URL sharing ───────────────────────────────────────────────
function updateShareUrl() {
  const p = lastParams;
  const params = new URLSearchParams({
    node:  p.processNode,
    mat:   p.maturity,
    model: p.yieldModel,
    w:     p.dieWidthMm,
    h:     p.dieHeightMm,
    wafer: p.waferDiamMm,
    edge:  p.edgeLoss,
    sx:    p.scrLineX,
    sy:    p.scrLineY,
    vol:   p.waferCount,
    ...(p.critAreaMm2      != null && { crit: p.critAreaMm2 }),
    ...(p.critLayers       !== 25  && { cl:   p.critLayers }),
    ...(p.waferCostOverride        && { wc:   p.waferCostOverride }),
    ...(p.maskCostOverride         && { mc:   p.maskCostOverride }),
  });
  document.getElementById('shareUrl').value = `${location.origin}${location.pathname}?${params}`;
}

document.getElementById('shareBtn').addEventListener('click', () => {
  const url = document.getElementById('shareUrl').value;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('shareBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy Link', 2000);
  });
});

// ── Load from URL params ──────────────────────────────────────
function loadFromUrl() {
  const p = new URLSearchParams(location.search);
  if (!p.has('node')) return;

  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  setVal('dieWidth',   p.get('w'));
  setVal('dieHeight',  p.get('h'));
  setVal('scrLineX',   p.get('sx'));
  setVal('scrLineY',   p.get('sy'));
  setVal('edgeLoss',   p.get('edge'));
  setVal('yieldModel', p.get('model'));
  setVal('critLayers', p.get('cl'));
  setVal('waferCost',  p.get('wc'));
  setVal('waferCount', p.get('vol'));
  setVal('maskCost',   p.get('mc'));
  if (p.get('crit')) { setVal('critArea', p.get('crit')); document.getElementById('allCritical').checked = false; document.getElementById('critAreaInput').style.display = 'block'; }

  // Set wafer size
  if (p.get('wafer')) {
    const diam = p.get('wafer');
    const match = Object.keys(WAFER_DIAMETERS_MM).find(k => WAFER_DIAMETERS_MM[k] == diam);
    if (match) waferSelect.value = match;
  }

  // Set process node
  if (p.get('node')) {
    [...nodeSelect.options].forEach(o => { if (o.value === p.get('node')) o.selected = true; });
  }

  // Set maturity
  if (p.get('mat')) {
    selectedMaturity = p.get('mat');
    document.querySelectorAll('.maturity-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.maturity === selectedMaturity);
    });
  }
}

// ── Node comparison table ─────────────────────────────────────
let compareFilter = 'all';
let compareSort   = 'cost';

function fmtCompact(n) {
  if (n == null || !isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

function updateCompareTable() {
  const waferDiamMm  = WAFER_DIAMETERS_MM[waferSelect.value];
  const dieWidthMm   = parseFloat(document.getElementById('dieWidth').value)  || 10;
  const dieHeightMm  = parseFloat(document.getElementById('dieHeight').value) || 10;
  const allCritical  = document.getElementById('allCritical').checked;
  const critAreaRaw  = parseFloat(document.getElementById('critArea').value);
  const critAreaMm2  = allCritical ? null : (isNaN(critAreaRaw) ? null : critAreaRaw);
  const yieldModel   = document.getElementById('yieldModel').value;
  const critLayers   = parseInt(document.getElementById('critLayers').value) || 25;
  const waferCount   = parseInt(document.getElementById('waferCount').value) || 100;
  const edgeLoss     = parseFloat(document.getElementById('edgeLoss').value) || 3;
  const scrLineX     = parseFloat(document.getElementById('scrLineX').value) || 0;
  const scrLineY     = parseFloat(document.getElementById('scrLineY').value) || 0;
  const activeNode   = nodeSelect.value;

  let rows = compareNodes({
    waferDiamMm, dieWidthMm, dieHeightMm,
    maturity: selectedMaturity, yieldModel, critLayers, critAreaMm2,
    waferCount, edgeLossMm: edgeLoss, scrLineX, scrLineY,
  });

  // Sort
  if (compareSort === 'yield') {
    rows = [...rows].sort((a, b) => b.yield - a.yield);
  } else if (compareSort === 'year') {
    rows = [...rows].sort((a, b) => PROCESS_NODES[a.nodeKey].year - PROCESS_NODES[b.nodeKey].year);
  }
  // 'cost' is already default sort from compareNodes()

  // Find best cost node (lowest totalCostPerDie with valid yield)
  const bestRow = rows.find(r => r.totalCostPerDie != null && r.yield > 0.01);

  const tbody = document.getElementById('nodeCompareBody');
  tbody.innerHTML = '';

  rows.forEach(row => {
    const node    = PROCESS_NODES[row.nodeKey];
    const isActive = row.nodeKey === activeNode;
    const isBest   = bestRow && row.nodeKey === bestRow.nodeKey;
    const vendor   = node.vendor;

    const hidden = (compareFilter === 'industry' && vendor === 'intel') ||
                   (compareFilter === 'intel'    && vendor !== 'intel');

    const tr = document.createElement('tr');
    if (isActive) tr.classList.add('active-node');
    if (hidden)   tr.classList.add('hidden-row');

    const yPct  = (row.yield * 100).toFixed(1) + '%';
    const yClass = row.yield >= 0.7 ? 'yield-good' : row.yield >= 0.4 ? 'yield-warn' : 'yield-bad';

    tr.innerHTML = `
      <td>
        ${node.label.split('(')[0].trim()}
        ${vendor === 'intel' ? '<span class="node-badge intel">Intel</span>' : ''}
        ${isBest  ? '<span class="node-badge best">best value</span>' : ''}
        ${isActive ? '<span class="node-badge active">selected</span>' : ''}
      </td>
      <td>${node.year}</td>
      <td>${row.defectDensityEffective.toFixed(3)}</td>
      <td>${row.diesPerWafer.toLocaleString()}</td>
      <td class="${yClass}">${yPct}</td>
      <td>${row.goodDiesPerWafer.toLocaleString()}</td>
      <td>${fmtCompact(row.waferCostPerDie)}</td>
      <td>${fmtCompact(row.maskCostPerDie)}</td>
      <td class="${isBest ? 'best-cost' : ''}">${fmtCompact(row.totalCostPerDie)}</td>
    `;

    tr.addEventListener('click', () => {
      [...nodeSelect.options].forEach(o => { o.selected = o.value === row.nodeKey; });
      updateResults();
    });

    tbody.appendChild(tr);
  });
}

// Filter + sort buttons
document.querySelectorAll('.compare-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.compare-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    compareFilter = btn.dataset.filter;
    updateCompareTable();
  });
});

document.querySelectorAll('.compare-sort').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.compare-sort').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    compareSort = btn.dataset.sort;
    updateCompareTable();
  });
});

// ── CSV Export ───────────────────────────────────────────────
document.getElementById('csvExportBtn').addEventListener('click', () => {
  const waferDiamMm  = WAFER_DIAMETERS_MM[waferSelect.value];
  const dieWidthMm   = parseFloat(document.getElementById('dieWidth').value)  || 10;
  const dieHeightMm  = parseFloat(document.getElementById('dieHeight').value) || 10;
  const allCritical  = document.getElementById('allCritical').checked;
  const critAreaRaw  = parseFloat(document.getElementById('critArea').value);
  const critAreaMm2  = allCritical ? null : (isNaN(critAreaRaw) ? null : critAreaRaw);
  const yieldModel   = document.getElementById('yieldModel').value;
  const critLayers   = parseInt(document.getElementById('critLayers').value) || 25;
  const waferCount   = parseInt(document.getElementById('waferCount').value) || 100;
  const edgeLoss     = parseFloat(document.getElementById('edgeLoss').value) || 3;
  const scrLineX     = parseFloat(document.getElementById('scrLineX').value) || 0;
  const scrLineY     = parseFloat(document.getElementById('scrLineY').value) || 0;

  const rows = compareNodes({
    waferDiamMm, dieWidthMm, dieHeightMm,
    maturity: selectedMaturity, yieldModel, critLayers, critAreaMm2,
    waferCount, edgeLossMm: edgeLoss, scrLineX, scrLineY,
  });

  const headers = ['Node','Year','Vendor','D0_base','D0_effective','DPW','Yield_pct','GDPW','Wafer_cost_per_die','Mask_cost_per_die','Total_cost_per_die','Wafer_cost','Mask_cost'];
  const csvRows = [headers.join(',')];

  rows.forEach(r => {
    const node = PROCESS_NODES[r.nodeKey];
    csvRows.push([
      `"${node.label}"`,
      node.year,
      node.vendor,
      r.defectDensityBase,
      r.defectDensityEffective.toFixed(4),
      r.diesPerWafer,
      (r.yield * 100).toFixed(2),
      r.goodDiesPerWafer,
      r.waferCostPerDie != null ? r.waferCostPerDie.toFixed(4) : '',
      r.maskCostPerDie  != null ? r.maskCostPerDie.toFixed(4)  : '',
      r.totalCostPerDie != null ? r.totalCostPerDie.toFixed(4) : '',
      r.waferCost,
      r.maskCost,
    ].join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `yielddesk_${dieWidthMm}x${dieHeightMm}mm_${selectedMaturity}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Redraw curve on resize ────────────────────────────────────
const ro = new ResizeObserver(() => updateResults());
ro.observe(curveCanvas);

// ── Init ──────────────────────────────────────────────────────
loadFromUrl();
updateResults();
