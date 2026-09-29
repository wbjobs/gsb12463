import { detectSupport } from './detect.js';
import { PerfMonitor } from './perf.js';
import { effects, FallbackRuntime } from './effects.js';

const FRAME_COUNT = 12;
const FRAME_SIZE = 120;

function buildSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_COUNT * FRAME_SIZE;
  canvas.height = FRAME_SIZE;
  const g = canvas.getContext('2d');
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const cx = i * FRAME_SIZE + FRAME_SIZE / 2;
    const cy = FRAME_SIZE / 2;
    g.strokeStyle = '#7c8cff';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, 44, 0, Math.PI * 2);
    g.stroke();
    const angle = (i / FRAME_COUNT) * Math.PI * 2 - Math.PI / 2;
    g.strokeStyle = '#ffb454';
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(angle) * 38, cy + Math.sin(angle) * 38);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, cy, 6, 0, Math.PI * 2);
    g.fill();
  }
  return canvas.toDataURL('image/png');
}

const support = detectSupport();
const runtime = new FallbackRuntime();
const perf = new PerfMonitor();
perf.start();

const state = {
  mode: 'auto',
  cleanups: [],
  results: [],
  corrections: [...support.corrections],
  sessions: new Map(),
};

function engineLabel(engine) {
  return engine === 'native' ? '原生 SDA' : 'IO + rAF 降级';
}

function recordSession() {
  if (!state.results.length) return;
  const engines = new Set(state.results.map((r) => r.engine));
  const label = engines.size === 1 ? [...engines][0] : 'mixed';
  const snap = perf.snapshot();
  if (snap.elapsed < 1500 || snap.frames < 10) return;
  state.sessions.set(label, snap);
  renderPerfTable();
}

function mountEffect(fx) {
  const supported = support.map[fx.requires] && support.map[fx.requires].ok;
  let wantNative = state.mode === 'native' || (state.mode === 'auto' && supported);

  if (state.mode === 'native' && !supported) {
    state.corrections.push(`「${fx.name}」强制原生但检测不支持，已安全降级`);
    wantNative = false;
  }

  if (wantNative) {
    try {
      const handle = fx.mountNative();
      if (handle.verify()) {
        state.cleanups.push(handle.cleanup);
        return { fx, engine: 'native', why: '原生 Scroll-Driven Animations' };
      }
      handle.cleanup();
      state.corrections.push(`「${fx.name}」检测误判：声明支持但运行时未生效，已修正为降级方案`);
    } catch (err) {
      state.corrections.push(`「${fx.name}」原生挂载异常（${err.message}），已安全降级`);
    }
  }

  try {
    const cleanup = fx.mountFallback(runtime);
    state.cleanups.push(cleanup);
    const why = state.mode === 'fallback'
      ? '手动切换到降级方案'
      : state.mode === 'native'
        ? '原生不可用，安全降级'
        : '浏览器缺少所需特性，自动降级';
    return { fx, engine: 'fallback', why };
  } catch (err) {
    state.corrections.push(`「${fx.name}」降级挂载失败：${err.message}`);
    return { fx, engine: 'fallback', why: '挂载失败' };
  }
}

function applyMode(mode) {
  recordSession();
  state.mode = mode;
  for (const cleanup of state.cleanups.splice(0)) {
    try { cleanup(); } catch { /* 忽略卸载异常 */ }
  }
  state.corrections = [...support.corrections];
  state.results = effects.map((fx) => mountEffect(fx));
  perf.reset();
  renderStatus();
  renderSwitcher();
}

function renderSupport() {
  const ul = document.getElementById('supportMatrix');
  ul.innerHTML = '';
  for (const entry of support.entries) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = entry.label;
    if (entry.corrected) {
      const note = document.createElement('span');
      note.className = 'note';
      note.textContent = '误判已修正';
      name.appendChild(note);
    }
    const st = document.createElement('span');
    st.className = entry.corrected ? 'st-fix' : entry.ok ? 'st-ok' : 'st-no';
    st.textContent = entry.corrected ? '⚠ 修正' : entry.ok ? '✓ 支持' : '✗ 不支持';
    li.append(name, st);
    ul.appendChild(li);
  }
}

function renderStatus() {
  const badge = document.getElementById('modeBadge');
  const engines = new Set(state.results.map((r) => r.engine));
  const modeName = { auto: '自动', native: '原生 SDA', fallback: '降级方案' }[state.mode];
  badge.textContent = engines.size === 1
    ? `${modeName} → ${engineLabel([...engines][0])}`
    : `${modeName} → 混合（部分降级）`;

  const ul = document.getElementById('effectStatus');
  ul.innerHTML = '';
  for (const { fx, engine, why } of state.results) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = `dot ${engine}`;
    const name = document.createElement('span');
    name.textContent = fx.name;
    const reason = document.createElement('span');
    reason.className = 'why';
    reason.textContent = `${engineLabel(engine)} · ${why}`;
    li.append(dot, name, reason);
    ul.appendChild(li);
  }

  const note = document.getElementById('correctionNote');
  if (state.corrections.length) {
    note.hidden = false;
    note.textContent = state.corrections.join('；');
  } else {
    note.hidden = true;
  }
}

function renderSwitcher() {
  for (const btn of document.querySelectorAll('.switcher button')) {
    btn.classList.toggle('active', btn.dataset.mode === state.mode);
  }
}

function renderPerfLive() {
  const snap = perf.snapshot();
  const root = document.getElementById('perfLive');
  const set = (k, v) => {
    const dd = root.querySelector(`[data-k="${k}"]`);
    if (dd) dd.textContent = v;
  };
  set('fps', snap.fps.toFixed(0));
  set('avgFrame', `${snap.avgFrame.toFixed(1)}ms`);
  set('worst', `${snap.worst.toFixed(0)}ms`);
  set('dropped', String(snap.dropped));
  set('jank', String(snap.jank));
  set('longtasks', snap.longtaskSupported ? String(snap.longtasks) : 'n/a');
}

function renderPerfTable() {
  const tbody = document.querySelector('#perfTable tbody');
  tbody.innerHTML = '';
  if (!state.sessions.size) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'empty';
    td.textContent = '切换方案后自动记录';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  const names = { native: '原生 SDA', fallback: 'IO + rAF', mixed: '混合' };
  for (const [key, snap] of state.sessions) {
    const tr = document.createElement('tr');
    const cells = [
      names[key] || key,
      snap.fps.toFixed(0),
      `${snap.avgFrame.toFixed(1)}ms`,
      String(snap.dropped),
      snap.longtaskSupported ? String(snap.longtasks) : 'n/a',
    ];
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function init() {
  document.getElementById('frameSprite').style.backgroundImage = `url(${buildSprite()})`;
  renderSupport();
  renderPerfTable();
  applyMode('auto');
  setInterval(renderPerfLive, 500);

  document.querySelector('.switcher').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-mode]');
    if (!btn || btn.dataset.mode === state.mode) return;
    applyMode(btn.dataset.mode);
  });
}

init();
