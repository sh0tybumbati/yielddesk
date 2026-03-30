import {
  calculate,
  PROCESS_NODES,
  WAFER_DIAMETERS_MM,
  WAFER_COSTS,
} from './calculator.js';

// ── Populate selects ──────────────────────────────────────────
const nodeSelect = document.getElementById('processNode');
const waferSelect = document.getElementById('waferSize');

Object.entries(PROCESS_NODES).forEach(([key, n]) => {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = n.label;
  if (key === '14nm') opt.selected = true;
  nodeSelect.appendChild(opt);
});

Object.keys(WAFER_DIAMETERS_MM).forEach(label => {
  const opt = document.createElement('option');
  opt.value = label;
  opt.textContent = label;
  if (label === '300mm (12")') opt.selected = true;
  waferSelect.appendChild(opt);
});

// ── Wafer canvas ──────────────────────────────────────────────
const canvas = document.getElementById('waferCanvas');
const ctx = canvas.getContext('2d');
const CANVAS_SIZE = 240;
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

function drawWafer(waferDiamMm, dieAreaMm2, yieldFrac) {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2;
  const r  = (CANVAS_SIZE / 2) - 6;

  // Wafer background
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, '#1a2232');
  grad.addColorStop(1, '#111720');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#1e2d42';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw dies
  const scale = (CANVAS_SIZE - 12) / waferDiamMm;
  const diePx = Math.sqrt(dieAreaMm2) * scale;
  const diePxClamped = Math.max(diePx, 2);

  let col = Math.floor((waferDiamMm - 6) / Math.sqrt(dieAreaMm2));
  col = Math.min(col, 40);
  const startX = cx - (col * diePxClamped) / 2;
  const startY = cy - (col * diePxClamped) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.clip();

  for (let row = 0; row < col; row++) {
    for (let c = 0; c < col; c++) {
      const x = startX + c * diePxClamped;
      const y = startY + row * diePxClamped;

      // Check if die center is inside wafer
      const dcx = x + diePxClamped / 2 - cx;
      const dcy = y + diePxClamped / 2 - cy;
      if (Math.sqrt(dcx * dcx + dcy * dcy) > r - 3) continue;

      const isGood = Math.random() < yieldFrac;
      ctx.fillStyle = isGood ? 'rgba(0,232,122,0.7)' : 'rgba(255,74,106,0.5)';
      ctx.fillRect(x + 0.5, y + 0.5, diePxClamped - 1, diePxClamped - 1);
      if (diePxClamped > 4) {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, diePxClamped - 1, diePxClamped - 1);
      }
    }
  }
  ctx.restore();

  // Flat / notch
  ctx.beginPath();
  ctx.arc(cx, cy + r - 4, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0e14';
  ctx.fill();
}

// ── Result display ────────────────────────────────────────────
function yieldClass(y) {
  if (y >= 0.7) return 'good';
  if (y >= 0.4) return 'warn';
  return 'bad';
}

function fmt(n, decimals = 0) {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function fmtMoney(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  if (n >= 1000) return `$${fmt(n)}`;
  return `$${n.toFixed(2)}`;
}

let lastResult = null;

function updateResults() {
  const waferLabel   = waferSelect.value;
  const waferDiamMm  = WAFER_DIAMETERS_MM[waferLabel];
  const dieAreaMm2   = parseFloat(document.getElementById('dieArea').value) || 100;
  const processNode  = nodeSelect.value;
  const waferCostRaw = document.getElementById('waferCost').value;
  const waferCostOverride = waferCostRaw ? parseFloat(waferCostRaw) : undefined;
  const edgeLoss     = parseFloat(document.getElementById('edgeLoss').value) || 3;

  // Update wafer cost placeholder
  const defaultCost = WAFER_COSTS[processNode];
  document.getElementById('waferCost').placeholder = defaultCost ? `$${defaultCost} (default)` : '';

  let result;
  try {
    result = calculate({ waferDiamMm, dieAreaMm2, processNode, waferCostOverride, edgeLossMm: edgeLoss });
  } catch(e) {
    console.error(e);
    return;
  }

  lastResult = result;

  const yPct = (result.yieldMurphy * 100).toFixed(1) + '%';

  // Main result values
  document.getElementById('res-dpw').textContent      = fmt(result.diesPerWafer);
  document.getElementById('res-yield').textContent    = yPct;
  document.getElementById('res-gdpw').textContent     = fmt(result.goodDiesPerWafer);
  document.getElementById('res-cpgd').textContent     = fmtMoney(result.costPerGoodDie);

  document.getElementById('res-yield').className = 'result-value ' + yieldClass(result.yieldMurphy);
  document.getElementById('res-gdpw').className  = 'result-value ' + yieldClass(result.yieldMurphy);

  // Yield bar
  const bar = document.getElementById('yieldBarFill');
  bar.style.width = (result.yieldMurphy * 100) + '%';
  bar.style.background = result.yieldMurphy >= 0.7 ? 'var(--green)' :
                         result.yieldMurphy >= 0.4 ? 'var(--yellow)' : 'var(--red)';

  document.getElementById('yieldBarLabel').textContent = yPct;

  // Wafer canvas
  drawWafer(waferDiamMm, dieAreaMm2, result.yieldMurphy);
}

// ── Wire inputs ───────────────────────────────────────────────
['processNode', 'waferSize', 'dieArea', 'waferCost', 'edgeLoss'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateResults);
});

// ── Export CSV (Pro gate) ─────────────────────────────────────
document.getElementById('exportBtn')?.addEventListener('click', () => {
  if (!isPro()) {
    showProModal();
    return;
  }
  if (!lastResult) return;
  const rows = [
    ['Metric', 'Value'],
    ['Process Node', lastResult.processNodeLabel],
    ['Die Area (mm²)', document.getElementById('dieArea').value],
    ['Wafer Diameter', waferSelect.value],
    ['Dies Per Wafer', lastResult.diesPerWafer],
    ['Murphy Yield', (lastResult.yieldMurphy * 100).toFixed(2) + '%'],
    ['Poisson Yield', (lastResult.yieldPoisson * 100).toFixed(2) + '%'],
    ['Good Dies Per Wafer', lastResult.goodDiesPerWafer],
    ['Wafer Cost', '$' + lastResult.waferCost],
    ['Cost Per Good Die', lastResult.costPerGoodDie?.toFixed(2) ?? 'N/A'],
    ['Defect Density (D0)', lastResult.defectDensity + ' /cm²'],
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'yielddesk-result.csv'; a.click();
  URL.revokeObjectURL(url);
});

// ── Pro status ────────────────────────────────────────────────
function isPro() {
  return localStorage.getItem('yd_pro') === 'true';
}

function showProModal() {
  document.getElementById('proModal').style.display = 'flex';
}

document.getElementById('proModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('proModal'))
    document.getElementById('proModal').style.display = 'none';
});

document.getElementById('closeProModal')?.addEventListener('click', () => {
  document.getElementById('proModal').style.display = 'none';
});

// Check for Stripe success redirect
const params = new URLSearchParams(window.location.search);
if (params.get('payment') === 'success') {
  localStorage.setItem('yd_pro', 'true');
  window.history.replaceState({}, '', window.location.pathname);
  document.getElementById('proSuccessBanner')?.style.setProperty('display', 'flex');
  setTimeout(() => {
    document.getElementById('proSuccessBanner')?.style.setProperty('display', 'none');
  }, 6000);
}

if (isPro()) {
  document.querySelectorAll('.pro-only-hidden').forEach(el => el.style.display = 'block');
  document.querySelectorAll('.upgrade-prompt').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.pro-badge-show').forEach(el => el.style.display = 'inline-flex');
}

// ── Init ──────────────────────────────────────────────────────
updateResults();
