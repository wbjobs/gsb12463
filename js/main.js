import { detectSupport, staticNativeOK, probeCssScrollTimeline, probeScrollTimelineCtor } from './support.js';
import { ScrollEngine } from './engine.js';
import { PerfMonitor } from './perf.js';

const FRAME_COUNT = 24;
const FRAME_SIZE = 160;

function buildSprite(frames, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size * frames;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < frames; i += 1) {
    const t = i / frames;
    const cx = i * size + size / 2;
    const cy = size / 2;
    const radius = size * 0.32;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * Math.PI * 2);
    for (let k = 0; k < 3; k += 1) {
      ctx.save();
      ctx.rotate((k * Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * (0.4 + t));
      ctx.strokeStyle = `hsl(${(t * 360 + k * 40) % 360} 80% 62%)`;
      ctx.lineWidth = size * 0.07;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.07 * (1 + 0.4 * Math.sin(t * Math.PI * 2)), 0, Math.PI * 2);
    ctx.fillStyle = '#e8ecf4';
    ctx.fill();
  }
  return canvas.toDataURL('image/png');
}

function setupFrameStrip() {
  const strip = document.getElementById('frame-strip');
  strip.style.backgroundImage = `url(${buildSprite(FRAME_COUNT, FRAME_SIZE)})`;
  strip.style.setProperty('--frames', String(FRAME_COUNT - 1));
  strip.style.setProperty('--strip-width', `${FRAME_SIZE * (FRAME_COUNT - 1)}px`);
}

function buildRegistry() {
  const registry = [
    { el: document.getElementById('progress-bar'), observeEl: null, type: 'progress', progressFn: 'document' },
    { el: document.getElementById('frame-strip'), observeEl: document.getElementById('frames-section'), type: 'frames', progressFn: 'container', frames: FRAME_COUNT, frameW: FRAME_SIZE },
    { el: document.getElementById('sticky-card'), observeEl: document.getElementById('sticky-section'), type: 'sticky', progressFn: 'container' },
    { el: document.getElementById('sticky-meter-fill'), observeEl: document.getElementById('sticky-section'), type: 'meter', progressFn: 'container' },
  ];
  document.querySelectorAll('[data-parallax]').forEach((el) => {
    registry.push({
      el,
      observeEl: el,
      type: 'parallax',
      progressFn: 'view',
      amp: Number(el.dataset.amp || 60),
    });
  });
  return registry;
}

const SUPPORT_ROWS = [
  ['cssScrollTimeline', 'CSS animation-timeline: scroll()'],
  ['cssViewTimeline', 'CSS animation-timeline: view()'],
  ['viewTimelineName', 'CSS view-timeline-name'],
  ['scrollTimelineCtor', 'ScrollTimeline 构造器'],
  ['viewTimelineCtor', 'ViewTimeline 构造器'],
  ['intersectionObserver', 'IntersectionObserver（降级依赖）'],
  ['performanceObserver', 'PerformanceObserver（性能统计）'],
];

function renderSupportTable(support, corrections) {
  const table = document.getElementById('support-table');
  table.innerHTML = SUPPORT_ROWS.map(([key, label]) => {
    const ok = support[key];
    const corrected = corrections.includes(key);
    const cls = corrected ? 'support-fixed' : ok ? 'support-ok' : 'support-no';
    const mark = corrected ? '⚠ 已修正' : ok ? '✓ 支持' : '✗ 不支持';
    return `<tr><td>${label}</td><td class="${cls}">${mark}</td></tr>`;
  }).join('');
}

function renderReasons(reasons) {
  document.getElementById('reasons').innerHTML = reasons.map((r) => `<li>${r}</li>`).join('');
}

function renderPerf(sample) {
  const current = document.getElementById('perf-current');
  const longtaskText = sample.longtaskSupported
    ? `长任务 ${sample.current.longtasks} 个`
    : '长任务 API 不可用';
  current.textContent = `实时 FPS：${sample.fps.toFixed(0)} ｜ 卡顿帧(>50ms)：${sample.jank} ｜ ${longtaskText}`;

  const rows = { native: sample.history.native, fallback: sample.history.fallback };
  if (sample.mode && sample.current.samples > 0) rows[sample.mode] = sample.current;
  document.querySelectorAll('#perf-compare tbody tr').forEach((tr) => {
    const data = rows[tr.dataset.perf];
    tr.classList.toggle('is-current', tr.dataset.perf === sample.mode);
    const cells = tr.querySelectorAll('td');
    if (!data) {
      cells[1].textContent = cells[2].textContent = cells[3].textContent = cells[4].textContent = '—';
      return;
    }
    cells[1].textContent = data.avgFps.toFixed(1);
    cells[2].textContent = `${data.jank} / ${data.frames}`;
    cells[3].textContent = String(data.longtasks);
    cells[4].textContent = `${data.longtaskTime.toFixed(0)}ms`;
  });
}

function main() {
  setupFrameStrip();

  const support = detectSupport();
  const corrections = [];
  const reasons = [];

  let nativeOK = staticNativeOK(support);
  if (nativeOK && !probeCssScrollTimeline()) {
    nativeOK = false;
    corrections.push('cssScrollTimeline');
    reasons.push('静态检测误报：CSS 声明支持但运行时探针未生效，已修正为降级');
  }
  if (support.scrollTimelineCtor && !probeScrollTimelineCtor()) {
    corrections.push('scrollTimelineCtor');
    reasons.push('ScrollTimeline 构造器存在但实例化失败，已修正检测结果');
  }
  if (!support.intersectionObserver) {
    reasons.push('警告：IntersectionObserver 不可用，降级方案将退化为纯 scroll 监听');
  }

  renderSupportTable(support, corrections);

  const engine = new ScrollEngine();
  const registry = buildRegistry();
  const perf = new PerfMonitor(renderPerf);
  perf.start();

  const badge = document.getElementById('mode-badge');
  const hint = document.getElementById('switch-hint');
  const buttons = [...document.querySelectorAll('.switcher__btn')];

  const state = { manual: null, mode: null };

  function resolveMode() {
    if (state.manual === 'native') return 'native';
    if (state.manual === 'fallback') return 'fallback';
    return nativeOK ? 'native' : 'fallback';
  }

  function currentReasons() {
    const list = [...reasons];
    if (state.manual === 'native') {
      list.push(nativeOK ? '手动切换：强制使用原生 Scroll-Driven Animations' : '手动强制原生方案（未通过检测，动画可能静止）');
    } else if (state.manual === 'fallback') {
      list.push('手动切换：强制使用 IntersectionObserver + requestAnimationFrame 降级方案');
    } else if (nativeOK) {
      list.push('自动检测：浏览器完整支持，使用原生 Scroll-Driven Animations');
    } else {
      list.push('自动检测：浏览器不支持或部分支持，降级为 IntersectionObserver + requestAnimationFrame');
    }
    return list;
  }

  function applyMode() {
    const next = resolveMode();
    try {
      engine.setup(next, registry);
      state.mode = next;
      perf.setMode(next);
      badge.textContent = next === 'native' ? '原生 SDA（CSS 驱动）' : '降级 JS（IO + rAF）';
      badge.classList.toggle('is-fallback', next === 'fallback');
      hint.textContent = next === 'native' && !nativeOK ? '当前浏览器未通过原生检测，动画可能静止' : '';
    } catch (err) {
      console.error('方案切换失败，回退到降级方案：', err);
      try {
        engine.setup('fallback', registry);
        state.mode = 'fallback';
        perf.setMode('fallback');
        badge.textContent = '降级 JS（切换异常回退）';
        badge.classList.add('is-fallback');
        hint.textContent = '方案切换异常，已自动回退到降级方案';
      } catch (fatal) {
        console.error('降级方案初始化失败：', fatal);
        hint.textContent = '动画引擎初始化失败';
      }
    }
    renderReasons(currentReasons());
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      state.manual = mode === 'auto' ? null : mode;
      buttons.forEach((b) => b.classList.toggle('is-active', b === btn));
      applyMode();
    });
  });

  applyMode();
}

main();
