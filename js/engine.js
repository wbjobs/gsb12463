const clamp01 = (v) => Math.min(1, Math.max(0, v));

const LERP = 0.18;
const EPSILON = 0.0005;

function documentProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? clamp01(window.scrollY / max) : 0;
}

function viewProgress(el, vh) {
  const rect = el.getBoundingClientRect();
  return clamp01((vh - rect.top) / (vh + rect.height));
}

function containerProgress(el, vh) {
  const rect = el.getBoundingClientRect();
  const range = rect.height - vh;
  return range > 0 ? clamp01(-rect.top / range) : 0;
}

const PROGRESS_FNS = {
  document: (target, vh) => documentProgress(),
  view: (target, vh) => viewProgress(target.observeEl, vh),
  container: (target, vh) => containerProgress(target.observeEl, vh),
};

const APPLIERS = {
  progress(target, p) {
    target.el.style.transform = `scaleX(${p})`;
  },
  parallax(target, p) {
    const offset = (0.5 - p) * 2 * target.amp;
    target.el.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
  },
  frames(target, p) {
    const index = Math.min(target.frames - 1, Math.floor(p * target.frames));
    if (index !== target.lastFrame) {
      target.lastFrame = index;
      target.el.style.backgroundPosition = `${-index * target.frameW}px 0`;
    }
  },
  sticky(target, p) {
    const scale = p < 0.5 ? 0.7 + 0.64 * p : 1.02 + 0.12 * (p - 0.5);
    const rotate = p < 0.5 ? -8 + 16 * p : 16 * (p - 0.5);
    const opacity = p < 0.5 ? 0.4 + 1.2 * p : 1 - 0.2 * (p - 0.5);
    target.el.style.transform = `scale(${scale.toFixed(4)}) rotate(${rotate.toFixed(2)}deg)`;
    target.el.style.opacity = opacity.toFixed(3);
  },
  meter(target, p) {
    target.el.style.transform = `scaleX(${p})`;
  },
};

export class ScrollEngine {
  constructor() {
    this.mode = null;
    this.targets = [];
    this.io = null;
    this.rafId = 0;
    this.dirty = false;
    this.onScroll = () => {
      this.dirty = true;
      this.pump();
    };
    this.tick = this.tick.bind(this);
  }

  setup(mode, registry) {
    this.teardown();
    this.mode = mode;
    const root = document.documentElement;
    root.classList.toggle('mode-native', mode === 'native');
    root.classList.toggle('mode-fallback', mode === 'fallback');
    if (mode !== 'fallback') return;

    this.targets = registry.map((item) => ({
      ...item,
      current: 0,
      visible: item.progressFn === 'document',
      lastFrame: -1,
    }));

    this.io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = this.targets.find((t) => t.observeEl === entry.target);
          if (target) {
            target.visible = entry.isIntersecting;
            if (entry.isIntersecting) {
              this.dirty = true;
              this.pump();
            }
          }
        }
      },
      { rootMargin: '15% 0px 15% 0px' }
    );
    for (const target of this.targets) {
      if (target.progressFn !== 'document') this.io.observe(target.observeEl);
    }

    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    this.dirty = true;
    this.pump();
  }

  pump() {
    if (!this.rafId && this.mode === 'fallback') {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  tick() {
    this.rafId = 0;
    const vh = window.innerHeight;
    let settled = true;
    for (const target of this.targets) {
      if (!target.visible) continue;
      const next = PROGRESS_FNS[target.progressFn](target, vh);
      const eased = target.current + (next - target.current) * LERP;
      const done = Math.abs(eased - next) < EPSILON;
      target.current = done ? next : eased;
      if (!done) settled = false;
      APPLIERS[target.type](target, target.current);
    }
    if (!settled || this.dirty) {
      this.dirty = false;
      this.pump();
    }
  }

  teardown() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.io) {
      this.io.disconnect();
      this.io = null;
    }
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    for (const target of this.targets) {
      target.el.style.transform = '';
      target.el.style.opacity = '';
      if (target.type === 'frames') target.el.style.backgroundPosition = '';
    }
    this.targets = [];
    document.documentElement.classList.remove('mode-native', 'mode-fallback');
    this.mode = null;
  }
}
