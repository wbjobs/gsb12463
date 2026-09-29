const cssSupports = (prop, value) => {
  try {
    return typeof CSS !== 'undefined' && CSS.supports(prop, value);
  } catch {
    return false;
  }
};

export function detectSupport() {
  return {
    cssScrollTimeline: cssSupports('animation-timeline', 'scroll()'),
    cssViewTimeline: cssSupports('animation-timeline', 'view()'),
    viewTimelineName: cssSupports('view-timeline-name', '--probe'),
    scrollTimelineCtor: typeof window.ScrollTimeline === 'function',
    viewTimelineCtor: typeof window.ViewTimeline === 'function',
    intersectionObserver: typeof window.IntersectionObserver === 'function',
    performanceObserver: typeof window.PerformanceObserver === 'function',
  };
}

export function staticNativeOK(support) {
  return support.cssScrollTimeline && support.cssViewTimeline && support.viewTimelineName;
}

export function probeCssScrollTimeline() {
  try {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:-10px;top:-10px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
    el.style.animation = 'sdaProbe 1s linear both';
    el.style.animationTimeline = 'scroll()';
    const animations = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
    const first = animations[0];
    const timelineName = first && first.timeline && first.timeline.constructor
      ? first.timeline.constructor.name
      : '';
    const ok = timelineName !== '' && timelineName !== 'DocumentTimeline';
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

export function probeScrollTimelineCtor() {
  try {
    if (typeof window.ScrollTimeline !== 'function') return false;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:-10px;top:-10px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
    const anim = el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(1px)' }],
      { duration: 1, fill: 'both' }
    );
    anim.timeline = new ScrollTimeline({ source: document.scrollingElement });
    const ok = anim.timeline instanceof ScrollTimeline;
    anim.cancel();
    el.remove();
    return ok;
  } catch {
    return false;
  }
}
