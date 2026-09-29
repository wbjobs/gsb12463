function cssDeclOk(prop, value) {
  try {
    return typeof CSS !== 'undefined' && CSS.supports(prop, value);
  } catch {
    return false;
  }
}

function cssStyleSticks(value) {
  try {
    const el = document.createElement('div');
    el.style.animationTimeline = value;
    return el.style.animationTimeline !== '';
  } catch {
    return false;
  }
}

function apiOk(name, make) {
  if (!(name in window)) return false;
  try {
    return make() != null;
  } catch {
    return false;
  }
}

export function detectSupport() {
  const entries = [];
  const corrections = [];

  const cssScrollDecl = cssDeclOk('animation-timeline', 'scroll(root)');
  const cssScrollSticks = cssScrollDecl && cssStyleSticks('scroll(root)');
  if (cssScrollDecl && !cssScrollSticks) {
    corrections.push('animation-timeline: scroll() 声明支持但样式未生效，已修正为不支持');
  }
  entries.push({
    key: 'cssScroll',
    label: 'CSS animation-timeline: scroll()',
    ok: cssScrollSticks,
    corrected: cssScrollDecl && !cssScrollSticks,
  });

  const cssViewDecl = cssDeclOk('animation-timeline', 'view()');
  const cssViewSticks = cssViewDecl && cssStyleSticks('view()');
  if (cssViewDecl && !cssViewSticks) {
    corrections.push('animation-timeline: view() 声明支持但样式未生效，已修正为不支持');
  }
  entries.push({
    key: 'cssView',
    label: 'CSS animation-timeline: view()',
    ok: cssViewSticks,
    corrected: cssViewDecl && !cssViewSticks,
  });

  entries.push({
    key: 'scrollTimeline',
    label: 'ScrollTimeline API',
    ok: apiOk('ScrollTimeline', () => new ScrollTimeline()),
    corrected: false,
  });

  entries.push({
    key: 'viewTimeline',
    label: 'ViewTimeline API',
    ok: apiOk('ViewTimeline', () => new ViewTimeline({ subject: document.createElement('div') })),
    corrected: false,
  });

  entries.push({
    key: 'intersectionObserver',
    label: 'IntersectionObserver（降级依赖）',
    ok: 'IntersectionObserver' in window,
    corrected: false,
  });

  entries.push({
    key: 'raf',
    label: 'requestAnimationFrame（降级依赖）',
    ok: 'requestAnimationFrame' in window,
    corrected: false,
  });

  entries.push({
    key: 'performanceObserver',
    label: 'PerformanceObserver（性能统计）',
    ok: 'PerformanceObserver' in window,
    corrected: false,
  });

  const map = {};
  for (const e of entries) map[e.key] = e;

  return { entries, map, corrections };
}
