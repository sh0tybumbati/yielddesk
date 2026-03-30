import {
  calculate,
  PROCESS_NODES,
  WAFER_DIAMETERS_MM,
  WAFER_COSTS,
} from './calculator.js';

// ── Populate selects ──────────────────────────────────────────
const nodeSelect  = document.getElementById('processNode');
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
const ctx    = canvas.getContext('2d');
const CANVAS_SIZE = 260;
canvas.width  = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

// Seeded LCG random — same seed → same die pattern per yield value
function seededRand(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function drawWafer(waferDiamMm, dieWidthMm, dieHeightMm, yieldFrac, edgeLossMm) {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2;
  const r  = CANVAS_SIZE / 2 - 6;

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

  const scale          = (r * 2) / waferDiamMm;       // px per mm
  const dieWPx         = dieWidthMm  * scale;
  const dieHPx         = dieHeightMm * scale;
  const effectiveRPx   = (waferDiamMm / 2 - edgeLossMm) * scale;

  // If dies are too small to render individually, draw a yield heatmap instead
  if (dieWPx < 1.5 || dieHPx < 1.5) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, effectiveRPx, 0, Math.PI * 2);
    const hue = yieldFrac * 120; // 0=red, 120=green
    ctx.fillStyle = `hsla(${hue}, 80%, 45%, 0.6)`;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${(yieldFrac * 100).toFixed(1)}% yield`, cx, cy - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.fillText('(dies too small to render)', cx, cy + 10);
    ctx.restore();

    drawNotch(cx, cy, r);
    return;
  }

  // Tile dies across the full wafer diameter
  const numCols = Math.ceil(waferDiamMm / dieWidthMm)  + 2;
  const numRows = Math.ceil(waferDiamMm / dieHeightMm) + 2;

  // Center the grid on the wafer
  const startX = cx - (numCols * dieWPx) / 2;
  const startY = cy - (numRows * dieHPx) / 2;

  const rand = seededRand(Math.round(yieldFrac * 10000));

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.clip();

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const x = startX + col * dieWPx;
      const y = startY + row * dieHPx;

      // Die center relative to wafer center
      const dcx = x + dieWPx / 2 - cx;
      const dcy = y + dieHPx / 2 - cy;

      // Skip if center is outside effective wafer radius
      if (Math.sqrt(dcx * dcx + dcy * dcy) > effectiveRPx) continue;

      const isGood = rand() < yieldFrac;
      ctx.fillStyle = isGood ? 'rgba(0,232,122,0.75)' : 'rgba(255,74,106,0.6)';
      ctx.fillRect(x + 0.5, y + 0.5, dieWPx - 1, dieHPx - 1);

      if (dieWPx > 5 && dieHPx > 5) {
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, dieWPx - 1, dieHPx - 1);
      }
    }
  }

  ctx.restore();
  drawNotch(cx, cy, r);
}

function drawNotch(cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy + r - 3, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0e14';
  ctx.fill();
}

// ── Result display ────────────────────────────────────────────
function yieldClass(y) {
  if (y >= 0.7) return 'good';
  if (y >= 0.4) return 'warn';
  return 'bad';
}

function fmt(n) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtMoney(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  if (n >= 1000) return `$${fmt(n)}`;
  return `$${n.toFixed(2)}`;
}

function updateResults() {
  const waferLabel      = waferSelect.value;
  const waferDiamMm     = WAFER_DIAMETERS_MM[waferLabel];
  const dieWidthMm      = parseFloat(document.getElementById('dieWidth').value)  || 10;
  const dieHeightMm     = parseFloat(document.getElementById('dieHeight').value) || 10;
  const dieAreaMm2      = dieWidthMm * dieHeightMm;
  const processNode     = nodeSelect.value;
  const waferCostRaw    = document.getElementById('waferCost').value;
  const waferCostOverride = waferCostRaw ? parseFloat(waferCostRaw) : undefined;
  const edgeLoss        = parseFloat(document.getElementById('edgeLoss').value) || 3;

  // Show computed area
  document.getElementById('dieAreaDisplay').textContent = dieAreaMm2.toFixed(2) + ' mm²';

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

  const yPct = (result.yieldMurphy * 100).toFixed(1) + '%';

  document.getElementById('res-dpw').textContent  = fmt(result.diesPerWafer);
  document.getElementById('res-yield').textContent = yPct;
  document.getElementById('res-gdpw').textContent  = fmt(result.goodDiesPerWafer);
  document.getElementById('res-cpgd').textContent  = fmtMoney(result.costPerGoodDie);

  document.getElementById('res-yield').className = 'result-value ' + yieldClass(result.yieldMurphy);
  document.getElementById('res-gdpw').className  = 'result-value ' + yieldClass(result.yieldMurphy);

  const bar = document.getElementById('yieldBarFill');
  bar.style.width      = (result.yieldMurphy * 100) + '%';
  bar.style.background = result.yieldMurphy >= 0.7 ? 'var(--green)' :
                         result.yieldMurphy >= 0.4 ? 'var(--yellow)' : 'var(--red)';

  document.getElementById('yieldBarLabel').textContent = yPct;

  drawWafer(waferDiamMm, dieWidthMm, dieHeightMm, result.yieldMurphy, edgeLoss);
}

// ── Wire inputs ───────────────────────────────────────────────
['processNode', 'waferSize', 'dieWidth', 'dieHeight', 'waferCost', 'edgeLoss'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', updateResults);
});

// ── Init ──────────────────────────────────────────────────────
updateResults();
