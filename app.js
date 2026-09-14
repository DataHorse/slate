(() => {
'use strict';

/* ============================== Constants ============================== */

const STORAGE_KEY = 'slate.state.v1';

const PEN_COLORS = ['auto', '#4F46E5', '#E1483F', '#1E9E6B', '#E8A33D', '#8B5CF6', '#1596A9', '#5B6472'];
const HIGHLIGHTER_COLORS = ['#FFD84D', '#6EE7B7', '#FDA4C0', '#BEF264'];
const LASER_COLORS = ['#FF3B30', '#22C55E', '#3B82F6'];

const TOOL_NAMES = { pen: 'Pen', highlighter: 'Marker', eraser: 'Eraser', laser: 'Laser' };

const SIZE_RANGES = {
  pen: [1, 20],
  highlighter: [6, 40],
  eraser: [8, 70],
  laser: [4, 20]
};

const LASER_TTL = 1100; // ms a laser trail segment stays visible

/* ============================== State ============================== */

function defaultToolSettings() {
  return {
    pen: { color: 'auto', size: 4 },
    highlighter: { color: '#F4D35E', size: 18 },
    eraser: { size: 26 },
    laser: { color: '#FF3B30', size: 10 }
  };
}

function defaultTab(n) {
  return { id: uid(), name: `Page ${n}`, bg: 'plain', strokes: [], redo: [] };
}

function defaultState() {
  return {
    theme: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
    palmRejection: false,
    activeTool: 'pen',
    toolSettings: defaultToolSettings(),
    activeTabId: null,
    tabs: []
  };
}

let state = loadState();
if (!TOOL_NAMES[state.activeTool]) state.activeTool = 'pen';
if (!state.tabs || !state.tabs.length) {
  const t = defaultTab(1);
  state.tabs = [t];
  state.activeTabId = t.id;
}
if (!state.activeTabId || !state.tabs.find(t => t.id === state.activeTabId)) {
  state.activeTabId = state.tabs[0].id;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      theme: parsed.theme || base.theme,
      palmRejection: !!parsed.palmRejection,
      activeTool: parsed.activeTool || base.activeTool,
      toolSettings: Object.assign(defaultToolSettings(), parsed.toolSettings || {}),
      activeTabId: parsed.activeTabId || null,
      tabs: Array.isArray(parsed.tabs) && parsed.tabs.length ? parsed.tabs.map(sanitizeTab) : []
    };
  } catch (err) {
    console.warn('Slate: could not read saved data, starting fresh.', err);
    return defaultState();
  }
}

function sanitizeTab(t) {
  return {
    id: t.id || uid(),
    name: typeof t.name === 'string' && t.name.trim() ? t.name : 'Page',
    bg: ['plain', 'lines', 'grid', 'dots', 'handwriting'].includes(t.bg) ? t.bg : 'plain',
    strokes: Array.isArray(t.strokes) ? t.strokes : [],
    redo: []
  };
}

let saveTimer = null;
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    const toSave = {
      theme: state.theme,
      palmRejection: state.palmRejection,
      activeTool: state.activeTool,
      toolSettings: state.toolSettings,
      activeTabId: state.activeTabId,
      tabs: state.tabs.map(t => ({ id: t.id, name: t.name, bg: t.bg, strokes: t.strokes }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.warn('Slate: save failed', err);
    showToast("Couldn't save — device storage may be full");
  }
}

function activeTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0];
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ============================== DOM refs ============================== */

const drawCanvas = document.getElementById('drawCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const paperCanvas = document.getElementById('paperCanvas');
const drawCtx = drawCanvas.getContext('2d');
const overlayCtx = overlayCanvas.getContext('2d');
const paperCtx = paperCanvas.getContext('2d');
const canvasWrap = document.getElementById('canvasWrap');

const tabsList = document.getElementById('tabsList');
const addTabBtn = document.getElementById('addTabBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const helpBtn = document.getElementById('helpBtn');

const toolButtons = document.querySelectorAll('.tool-btn');
const styleChipBtn = document.getElementById('styleChipBtn');
const styleChipDot = document.getElementById('styleChipDot');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const pageSettingsBtn = document.getElementById('pageSettingsBtn');const palmToggleBtn = document.getElementById('palmToggleBtn');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const moreBtn = document.getElementById('moreBtn');
const morePopover = document.getElementById('morePopover');
const moreSettingsBtn = document.getElementById('moreSettingsBtn');
const moreClearBtn = document.getElementById('moreClearBtn');
const moreExportBtn = document.getElementById('moreExportBtn');

const stylePopover = document.getElementById('stylePopover');
const colorSection = document.getElementById('colorSection');
const swatchesEl = document.getElementById('swatches');
const thicknessSlider = document.getElementById('thicknessSlider');
const thicknessDot = document.getElementById('thicknessDot');

const pageSettingsPopover = document.getElementById('pageSettingsPopover');
const pageNameInput = document.getElementById('pageNameInput');
const bgOptions = document.getElementById('bgOptions');
const palmSwitch2 = document.getElementById('palmSwitch2');
const deleteTabBtn = document.getElementById('deleteTabBtn');

const confirmOverlay = document.getElementById('confirmOverlay');
const confirmTitle = document.getElementById('confirmTitle');
const confirmBody = document.getElementById('confirmBody');
const confirmOk = document.getElementById('confirmOk');
const confirmCancel = document.getElementById('confirmCancel');

const helpOverlay = document.getElementById('helpOverlay');
const helpCloseBtn = document.getElementById('helpCloseBtn');

const toastEl = document.getElementById('toast');

/* ============================== Theme ============================== */

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function resolveColor(c) {
  return c === 'auto' ? getCSSVar('--ink') : c;
}

function effectiveTheme() {
  return state.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme() {
  const eff = effectiveTheme();
  document.documentElement.setAttribute('data-theme', eff);
  themeIcon.innerHTML = eff === 'dark'
    ? '<path d="M20 14.2A8.5 8.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2z"/>'
    : '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/>';
  renderPaperLayer();
  renderActiveTab();
}

themeToggleBtn.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  showToast('Theme: ' + (state.theme === 'dark' ? 'Dark' : 'Light'));
  persist();
});

/* ============================== Canvas sizing ============================== */

let canvasSize = { w: 0, h: 0 };

function canvasMargin() {
  return window.innerWidth <= 700 ? 3 : 4;
}

function fitCanvas() {
  const rect = canvasWrap.getBoundingClientRect();
  const margin = canvasMargin();
  const w = Math.max(50, rect.width - margin * 2);
  const h = Math.max(50, rect.height - margin * 2);
  canvasSize = { w, h };
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  [paperCanvas, drawCanvas, overlayCanvas].forEach(cvs => {
    cvs.style.left = margin + 'px';
    cvs.style.top = margin + 'px';
    cvs.style.width = w + 'px';
    cvs.style.height = h + 'px';
    cvs.width = Math.max(1, Math.round(w * dpr));
    cvs.height = Math.max(1, Math.round(h * dpr));
    const ctx = cvs.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  renderPaperLayer();
  renderActiveTab();
}

let ro = new ResizeObserver(debounce(fitCanvas, 80));
ro.observe(canvasWrap);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 200));

function dims() {
  return canvasSize;
}

/* ============================== Rendering ============================== */

function drawPaperBackground(ctx, w, h, bg) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = getCSSVar('--paper');
  ctx.fillRect(0, 0, w, h);
  const lineColor = getCSSVar('--paper-line');
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = lineColor;
  ctx.lineWidth = 1;
  if (bg === 'lines') {
    const step = 34;
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
  } else if (bg === 'grid') {
    const step = 28;
    for (let x = step; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
    }
    for (let y = step; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
    }
  } else if (bg === 'dots') {
    const step = 24;
    for (let x = step; x < w; x += step) {
      for (let y = step; y < h; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (bg === 'handwriting') {
    // Handwriting practice paper, matched to a classic kids' tracing
    // worksheet: a solid top guide, a dashed midline (x-height for
    // lowercase), and a solid baseline — repeating down the page, with
    // extra clearance below each baseline so descenders (g, j, p, q, y)
    // have room to hang without a line cutting through them.
    const unit = 26;     // top-line to midline, and midline to baseline
    const groupGap = 38; // baseline to the next group's top line
    const cycle = unit * 2 + groupGap;
    let topY = 40;
    while (topY < h) {
      const midY = topY + unit;
      const baseY = midY + unit;

      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(0, topY + 0.5); ctx.lineTo(w, topY + 0.5); ctx.stroke();

      ctx.setLineDash([5, 5]);
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(0, midY + 0.5); ctx.lineTo(w, midY + 0.5); ctx.stroke();

      ctx.setLineDash([]);
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(0, baseY + 0.5); ctx.lineTo(w, baseY + 0.5); ctx.stroke();

      topY += cycle;
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function strokeWidth(stroke) {
  if (stroke.pointerType === 'pen' && stroke.tool !== 'eraser') {
    const pressures = stroke.points.map(p => (p.p === undefined || p.p === 0) ? 0.5 : p.p);
    const avg = pressures.reduce((a, b) => a + b, 0) / pressures.length;
    return stroke.size * (0.6 + avg * 0.9);
  }
  return stroke.size;
}

function renderFullStroke(ctx, stroke, w, h) {
  const pts = stroke.points.map(p => ({ x: p.x * w, y: p.y * h }));
  if (!pts.length) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = stroke.opacity != null ? stroke.opacity : 1;
  ctx.globalCompositeOperation = stroke.composite || 'source-over';
  const color = stroke.tool === 'eraser' ? '#000' : resolveColor(stroke.color);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidth(stroke);

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Single continuous path for the whole stroke, so translucent/blend-mode
  // tools never show seams where separately-stroked segments overlap.
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }
  ctx.stroke();
  ctx.restore();
}

function renderPaperLayer() {
  const { w, h } = dims();
  const tab = activeTab();
  paperCtx.clearRect(0, 0, w, h);
  drawPaperBackground(paperCtx, w, h, tab.bg);
}

function renderActiveTab() {
  const { w, h } = dims();
  const tab = activeTab();
  drawCtx.clearRect(0, 0, w, h);
  for (const stroke of tab.strokes) renderFullStroke(drawCtx, stroke, w, h);
}

function clearOverlay() {
  const { w, h } = dims();
  overlayCtx.clearRect(0, 0, w, h);
}

/* ============================== Drawing input ============================== */

let activePointerId = null;
let currentStroke = null;

function getNormPos(e) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    p: e.pressure
  };
}

function renderLive() {
  clearOverlay();
  const { w, h } = dims();
  renderFullStroke(overlayCtx, currentStroke, w, h);
}

// Eraser feedback must be visible while dragging, not just on release, so it
// erases directly on the ink layer in real time instead of previewing on the
// (separate, currently-empty) overlay layer.
function eraseLiveIncrement(stroke) {
  const { w, h } = dims();
  const pts = stroke.points;
  const n = pts.length;
  drawCtx.save();
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  drawCtx.globalCompositeOperation = 'destination-out';
  drawCtx.globalAlpha = 1;
  const width = strokeWidth(stroke);
  drawCtx.lineWidth = width;
  drawCtx.fillStyle = '#000';
  if (n === 1) {
    const p = pts[0];
    drawCtx.beginPath();
    drawCtx.arc(p.x * w, p.y * h, width / 2, 0, Math.PI * 2);
    drawCtx.fill();
  } else {
    const a = pts[n - 2], b = pts[n - 1];
    drawCtx.beginPath();
    drawCtx.moveTo(a.x * w, a.y * h);
    drawCtx.lineTo(b.x * w, b.y * h);
    drawCtx.stroke();
  }
  drawCtx.restore();
}

function onPointerDown(e) {
  if (state.palmRejection && e.pointerType === 'touch') return;
  if (activePointerId !== null) return;
  activePointerId = e.pointerId;
  try { drawCanvas.setPointerCapture(e.pointerId); } catch (err) {}
  const pos = getNormPos(e);

  if (state.activeTool === 'laser') {
    laserAddPoint(pos, true);
  } else {
    const tool = state.activeTool;
    const settings = state.toolSettings[tool];
    currentStroke = {
      tool,
      pointerType: e.pointerType,
      color: tool === 'eraser' ? null : settings.color,
      size: settings.size,
      opacity: tool === 'highlighter' ? 0.4 : 1,
      composite: tool === 'eraser' ? 'destination-out' : (tool === 'highlighter' ? 'multiply' : 'source-over'),
      points: [pos]
    };
    if (tool === 'eraser') eraseLiveIncrement(currentStroke);
    else renderLive();
  }
  e.preventDefault();
}

function onPointerMove(e) {
  if (e.pointerId !== activePointerId) return;
  const pos = getNormPos(e);
  if (state.activeTool === 'laser') {
    laserAddPoint(pos, false);
  } else if (currentStroke) {
    currentStroke.points.push(pos);
    if (currentStroke.tool === 'eraser') eraseLiveIncrement(currentStroke);
    else renderLive();
  }
  e.preventDefault();
}

function onPointerUp(e) {
  if (e.pointerId !== activePointerId) return;
  activePointerId = null;
  try { drawCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
  if (state.activeTool !== 'laser' && currentStroke) {
    clearOverlay();
    const tab = activeTab();
    tab.strokes.push(currentStroke);
    tab.redo = [];
    currentStroke = null;
    updateUndoRedoButtons();
    renderActiveTab();
    persist();
  }
}

drawCanvas.addEventListener('pointerdown', onPointerDown);
drawCanvas.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
drawCanvas.addEventListener('contextmenu', e => e.preventDefault());

/* ============================== Laser pointer ============================== */

let laserPoints = [];
let laserRAF = null;

function laserAddPoint(pos, isStart) {
  laserPoints.push({ x: pos.x, y: pos.y, t: performance.now() });
  if (!laserRAF) laserRAF = requestAnimationFrame(laserTick);
}

function laserTick() {
  const now = performance.now();
  laserPoints = laserPoints.filter(p => now - p.t < LASER_TTL);
  const { w, h } = dims();
  overlayCtx.clearRect(0, 0, w, h);

  if (laserPoints.length) {
    const color = state.toolSettings.laser.color;
    const size = state.toolSettings.laser.size;
    overlayCtx.lineCap = 'round';
    overlayCtx.lineJoin = 'round';
    for (let i = 1; i < laserPoints.length; i++) {
      const a = laserPoints[i - 1], b = laserPoints[i];
      const age = now - b.t;
      const alpha = Math.max(0, 1 - age / LASER_TTL);
      overlayCtx.strokeStyle = color;
      overlayCtx.globalAlpha = alpha * 0.9;
      overlayCtx.lineWidth = size * (0.45 + 0.55 * alpha);
      overlayCtx.shadowColor = color;
      overlayCtx.shadowBlur = 10 * alpha + 3;
      overlayCtx.beginPath();
      overlayCtx.moveTo(a.x * w, a.y * h);
      overlayCtx.lineTo(b.x * w, b.y * h);
      overlayCtx.stroke();
    }
    const last = laserPoints[laserPoints.length - 1];
    const lastAlpha = Math.max(0, 1 - (now - last.t) / LASER_TTL);
    overlayCtx.globalAlpha = lastAlpha;
    overlayCtx.shadowBlur = 14;
    overlayCtx.shadowColor = color;
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.beginPath();
    overlayCtx.arc(last.x * w, last.y * h, size * 0.5, 0, Math.PI * 2);
    overlayCtx.fill();
    overlayCtx.globalAlpha = 1;
    overlayCtx.shadowBlur = 0;
    laserRAF = requestAnimationFrame(laserTick);
  } else {
    laserRAF = null;
  }
}

/* ============================== Tool selection & style popover ============================== */

function setActiveTool(tool) {
  state.activeTool = tool;
  toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  updateStyleChip();
  if (!stylePopover.hidden) renderStyleContent();
  persist();
}

toolButtons.forEach(btn => {
  btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
});

function updateStyleChip() {
  const tool = state.activeTool;
  const settings = state.toolSettings[tool];
  const size = Math.min(18, Math.max(6, settings.size ? settings.size * 0.7 : 10));
  styleChipDot.style.width = size + 'px';
  styleChipDot.style.height = size + 'px';
  styleChipDot.style.background = tool === 'eraser' ? 'transparent' : resolveColor(settings.color);
  styleChipDot.style.border = tool === 'eraser' ? '2px solid ' + getCSSVar('--ink-soft') : 'none';
}

function renderStyleContent() {
  const tool = state.activeTool;
  const settings = state.toolSettings[tool];
  document.getElementById('stylePopoverTitle').textContent = TOOL_NAMES[tool] || tool;
  colorSection.style.display = tool === 'eraser' ? 'none' : '';
  swatchesEl.innerHTML = '';
  if (tool !== 'eraser') {
    const colors = tool === 'highlighter' ? HIGHLIGHTER_COLORS : (tool === 'laser' ? LASER_COLORS : PEN_COLORS);
    colors.forEach(c => {
      const sw = document.createElement('button');
      sw.className = 'swatch' + (settings.color === c ? ' selected' : '');
      sw.style.background = c === 'auto' ? 'linear-gradient(135deg, #1c2024 50%, #f4f4f0 50%)' : c;
      sw.setAttribute('aria-label', c === 'auto' ? 'Ink (matches theme)' : c);
      sw.addEventListener('click', () => {
        settings.color = c;
        renderStyleContent();
        updateStyleChip();
        persist();
      });
      swatchesEl.appendChild(sw);
    });
  }
  const [mn, mx] = SIZE_RANGES[tool];
  thicknessSlider.min = mn;
  thicknessSlider.max = mx;
  thicknessSlider.value = settings.size;
  updateThicknessPreview();
}

function updateThicknessPreview() {
  const tool = state.activeTool;
  const settings = state.toolSettings[tool];
  const d = Math.min(30, Math.max(3, settings.size));
  thicknessDot.style.width = d + 'px';
  thicknessDot.style.height = d + 'px';
  thicknessDot.style.background = tool === 'eraser' ? getCSSVar('--ink-soft') : resolveColor(settings.color);
}

thicknessSlider.addEventListener('input', () => {
  const settings = state.toolSettings[state.activeTool];
  settings.size = Number(thicknessSlider.value);
  updateThicknessPreview();
  updateStyleChip();
  persist();
});

/* ============================== Popover helpers ============================== */

let openPopoverEl = null;

function openPopover(pop, anchor) {
  closePopovers();
  pop.hidden = false;
  pop.style.visibility = 'hidden';
  requestAnimationFrame(() => {
    positionPopoverNear(pop, anchor);
    pop.style.visibility = 'visible';
  });
  openPopoverEl = pop;
}

function closePopovers() {
  [stylePopover, pageSettingsPopover, morePopover].forEach(p => { p.hidden = true; });
  openPopoverEl = null;
}

function positionPopoverNear(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  const isMobile = window.innerWidth <= 700;
  const popW = pop.offsetWidth || 236;
  const popH = pop.offsetHeight || 260;
  let left, top;
  if (isMobile) {
    left = Math.min(window.innerWidth - popW - 10, Math.max(10, r.left));
    top = r.top - popH - 10;
  } else {
    left = r.right + 10;
    top = Math.min(window.innerHeight - popH - 10, Math.max(10, r.top - 30));
  }
  pop.style.left = Math.max(10, left) + 'px';
  pop.style.top = Math.max(10, top) + 'px';
}

document.addEventListener('pointerdown', (e) => {
  if (!openPopoverEl) return;
  const anchors = [styleChipBtn, pageSettingsBtn];
  if (openPopoverEl.contains(e.target)) return;
  if (anchors.some(a => a.contains(e.target))) return;
  closePopovers();
});

document.addEventListener('pointerdown', (e) => {
  if (!openPopoverEl) return;
  const anchors = [styleChipBtn, pageSettingsBtn, moreBtn];
  if (openPopoverEl.contains(e.target)) return;
  if (anchors.some(a => a.contains(e.target))) return;
  closePopovers();
});

styleChipBtn.addEventListener('click', () => {
  if (openPopoverEl === stylePopover) { closePopovers(); return; }
  renderStyleContent();
  openPopover(stylePopover, styleChipBtn);
});

function openPageSettings(anchor) {
  populatePageSettings();
  openPopover(pageSettingsPopover, anchor);
}

pageSettingsBtn.addEventListener('click', () => {
  if (openPopoverEl === pageSettingsPopover) { closePopovers(); return; }
  openPageSettings(pageSettingsBtn);
});

moreBtn.addEventListener('click', () => {
  if (openPopoverEl === morePopover) { closePopovers(); return; }
  openPopover(morePopover, moreBtn);
});
moreSettingsBtn.addEventListener('click', () => openPageSettings(moreBtn));
moreClearBtn.addEventListener('click', () => { closePopovers(); doClearPage(); });
moreExportBtn.addEventListener('click', () => { closePopovers(); doExportImage(); });

function populatePageSettings() {
  const tab = activeTab();
  pageNameInput.value = tab.name;
  bgOptions.querySelectorAll('.bg-opt').forEach(b => {
    b.classList.toggle('selected', b.dataset.bg === tab.bg);
  });
  palmSwitch2.classList.toggle('on', state.palmRejection);
}

pageNameInput.addEventListener('change', () => {
  const tab = activeTab();
  const val = pageNameInput.value.trim();
  tab.name = val || tab.name;
  pageNameInput.value = tab.name;
  renderTabs();
  persist();
});

bgOptions.querySelectorAll('.bg-opt').forEach(btn => {
  const bg = btn.dataset.bg;
  const preview = document.createElement('div');
  preview.style.position = 'absolute';
  preview.style.inset = '0';
  btn.appendChild(preview);
  if (bg === 'lines') preview.style.background = 'repeating-linear-gradient(to bottom, transparent 0, transparent 9px, var(--paper-line) 9px, var(--paper-line) 10px)';
  if (bg === 'grid') preview.style.background = 'repeating-linear-gradient(to bottom, transparent 0, transparent 7px, var(--paper-line) 7px, var(--paper-line) 8px), repeating-linear-gradient(to right, transparent 0, transparent 7px, var(--paper-line) 7px, var(--paper-line) 8px)';
  if (bg === 'dots') preview.style.background = 'radial-gradient(var(--paper-line) 1px, transparent 1.4px) 0 0/9px 9px';
  if (bg === 'handwriting') preview.style.background = 'repeating-linear-gradient(to bottom, var(--paper-line) 0, var(--paper-line) 1px, transparent 1px, transparent 4px, transparent 5px, transparent 8px, var(--paper-line) 8px, var(--paper-line) 9px, transparent 9px, transparent 16px)';
  btn.addEventListener('click', () => {
    const tab = activeTab();
    tab.bg = bg;
    bgOptions.querySelectorAll('.bg-opt').forEach(b => b.classList.toggle('selected', b === btn));
    renderPaperLayer();
    persist();
  });
});

function togglePalmRejection() {
  state.palmRejection = !state.palmRejection;
  palmToggleBtn.classList.toggle('toggled', state.palmRejection);
  palmSwitch2.classList.toggle('on', state.palmRejection);
  showToast('Palm rejection ' + (state.palmRejection ? 'on — stylus only' : 'off'));
  persist();
}
palmToggleBtn.addEventListener('click', togglePalmRejection);
palmSwitch2.addEventListener('click', togglePalmRejection);

deleteTabBtn.addEventListener('click', () => {
  closePopovers();
  requestDeleteTab(activeTab().id);
});

/* ============================== Tabs ============================== */

function renderTabs() {
  tabsList.innerHTML = '';
  state.tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '');
    el.setAttribute('role', 'tab');
    el.dataset.id = tab.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = tab.name;
    el.appendChild(nameSpan);

    if (state.tabs.length > 1) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '\u00D7';
      closeBtn.setAttribute('aria-label', 'Delete page');
      closeBtn.addEventListener('click', (e) => { e.stopPropagation(); requestDeleteTab(tab.id); });
      el.appendChild(closeBtn);
    }

    el.addEventListener('click', () => switchTab(tab.id));
    el.addEventListener('dblclick', () => startRenameTab(tab, nameSpan));
    tabsList.appendChild(el);
  });
  const activeEl = tabsList.querySelector('.tab.active');
  if (activeEl) activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function startRenameTab(tab, nameSpan) {
  nameSpan.contentEditable = 'true';
  nameSpan.focus();
  document.execCommand('selectAll', false, null);
  function commit() {
    nameSpan.contentEditable = 'false';
    const val = nameSpan.textContent.trim();
    tab.name = val || tab.name;
    nameSpan.textContent = tab.name;
    nameSpan.removeEventListener('blur', commit);
    nameSpan.removeEventListener('keydown', onKey);
    persist();
  }
  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
    if (e.key === 'Escape') { nameSpan.textContent = tab.name; nameSpan.blur(); }
  }
  nameSpan.addEventListener('blur', commit);
  nameSpan.addEventListener('keydown', onKey);
}

function switchTab(id) {
  if (id === state.activeTabId) return;
  state.activeTabId = id;
  closePopovers();
  renderTabs();
  fitCanvas();
  updateUndoRedoButtons();
  persist();
}

function addTab() {
  const t = defaultTab(state.tabs.length + 1);
  state.tabs.push(t);
  state.activeTabId = t.id;
  renderTabs();
  fitCanvas();
  updateUndoRedoButtons();
  persist();
}
addTabBtn.addEventListener('click', addTab);

function requestDeleteTab(id) {
  if (state.tabs.length <= 1) return;
  const tab = state.tabs.find(t => t.id === id);
  showConfirm('Delete "' + tab.name + '"?', "This page and everything on it will be removed. This can't be undone.", () => {
    const idx = state.tabs.findIndex(t => t.id === id);
    state.tabs.splice(idx, 1);
    if (state.activeTabId === id) {
      const next = state.tabs[Math.max(0, idx - 1)];
      state.activeTabId = next.id;
    }
    renderTabs();
    fitCanvas();
    updateUndoRedoButtons();
    persist();
  });
}

/* ============================== Undo / redo / clear ============================== */

function undo() {
  const tab = activeTab();
  if (!tab.strokes.length) return;
  const s = tab.strokes.pop();
  tab.redo.push(s);
  renderActiveTab();
  updateUndoRedoButtons();
  persist();
}
function redo() {
  const tab = activeTab();
  if (!tab.redo.length) return;
  const s = tab.redo.pop();
  tab.strokes.push(s);
  renderActiveTab();
  updateUndoRedoButtons();
  persist();
}
function updateUndoRedoButtons() {
  const tab = activeTab();
  undoBtn.disabled = tab.strokes.length === 0;
  redoBtn.disabled = tab.redo.length === 0;
}
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

function doClearPage() {
  const tab = activeTab();
  if (!tab.strokes.length) { showToast('Page is already empty'); return; }
  showConfirm('Clear this page?', 'Everything drawn on this page will be erased.', () => {
    const backup = tab.strokes;
    tab.strokes = [];
    tab.redo = [];
    renderActiveTab();
    updateUndoRedoButtons();
    persist();
    showToast('Page cleared', 'Undo', () => {
      tab.strokes = backup;
      renderActiveTab();
      updateUndoRedoButtons();
      persist();
    });
  }, { okLabel: 'Clear' });
}
clearBtn.addEventListener('click', doClearPage);

/* ============================== Export ============================== */

function doExportImage() {
  const tab = activeTab();
  const off = document.createElement('canvas');
  off.width = drawCanvas.width;
  off.height = drawCanvas.height;
  const octx = off.getContext('2d');
  octx.drawImage(paperCanvas, 0, 0, off.width, off.height);
  octx.drawImage(drawCanvas, 0, 0, off.width, off.height);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  const name = tab.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'page';
  link.download = `slate-${name}-${date}.png`;
  link.href = off.toDataURL('image/png');
  link.click();
  showToast('Saved as image');
}
exportBtn.addEventListener('click', doExportImage);

/* ============================== Confirm modal ============================== */

function showConfirm(title, body, onConfirm, opts) {
  opts = opts || {};
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmOk.textContent = opts.okLabel || 'Delete';
  confirmOverlay.hidden = false;
  function cleanup() {
    confirmOverlay.hidden = true;
    confirmOk.removeEventListener('click', onOk);
    confirmCancel.removeEventListener('click', onCancel);
  }
  function onOk() { cleanup(); onConfirm(); }
  function onCancel() { cleanup(); }
  confirmOk.addEventListener('click', onOk);
  confirmCancel.addEventListener('click', onCancel);
}
confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) confirmOverlay.hidden = true; });

/* ============================== Help modal ============================== */

helpBtn.addEventListener('click', () => { helpOverlay.hidden = false; });
helpCloseBtn.addEventListener('click', () => { helpOverlay.hidden = true; });
helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) helpOverlay.hidden = true; });

/* ============================== Toast ============================== */

let toastTimer = null;
function showToast(msg, actionLabel, onAction) {
  toastEl.innerHTML = '';
  toastEl.textContent = msg;
  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.style.cssText = 'margin-left:10px;background:transparent;border:none;color:inherit;font-weight:700;text-decoration:underline;cursor:pointer;font-family:inherit;font-size:inherit;';
    btn.addEventListener('click', () => { onAction(); toastEl.classList.remove('show'); });
    toastEl.appendChild(btn);
  }
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), actionLabel ? 3600 : 1800);
}

/* ============================== Keyboard shortcuts ============================== */

const TOOL_KEYS = { '1': 'pen', '2': 'highlighter', '3': 'eraser', '4': 'laser' };

window.addEventListener('keydown', (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;

  if (e.key === 'Escape') { closePopovers(); confirmOverlay.hidden = true; helpOverlay.hidden = true; return; }
  if (isEditing) return;

  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); addTab(); return; }
  if (mod && e.key === 'Backspace') { e.preventDefault(); clearBtn.click(); return; }

  if (TOOL_KEYS[e.key]) { setActiveTool(TOOL_KEYS[e.key]); return; }

  if (e.key === '[' || e.key === ']') {
    const settings = state.toolSettings[state.activeTool];
    const [mn, mx] = SIZE_RANGES[state.activeTool];
    const step = Math.max(1, Math.round((mx - mn) / 12));
    settings.size = Math.min(mx, Math.max(mn, settings.size + (e.key === ']' ? step : -step)));
    updateStyleChip();
    if (!stylePopover.hidden) renderStyleContent();
    persist();
  }
});

/* ============================== Persistence flush ============================== */

document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('pagehide', saveNow);

/* ============================== Service worker ============================== */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ============================== Init ============================== */

function init() {
  document.documentElement.setAttribute('data-theme', effectiveTheme());
  toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === state.activeTool));
  palmToggleBtn.classList.toggle('toggled', state.palmRejection);
  applyTheme();
  renderTabs();
  fitCanvas();
  updateUndoRedoButtons();
  updateStyleChip();
}

init();

})();
