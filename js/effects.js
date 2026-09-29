const FRAME_COUNT = 12;
const FRAME_WIDTH = 120;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function scrollProgress() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  return max > 0 ? clamp01(window.scrollY / max) : 0;
}

function viewProgress(el) {
  const rect = el.getBoundingClientRect();
  return clamp01((window.innerHeight - rect.top) / (window.innerHeight + rect.height));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class FallbackRuntime {
  constructor() {
    this.items = new Set();
    this.running = false;
    this.smoothScroll = scrollProgress();
    this.tick = this.tick.bind(this);
    this.hasIO = 'IntersectionObserver' in window;
    this.io = this.hasIO
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const item = entry.target.__fxItem;
              if (item) item.active = entry.isIntersecting;
            }
          },
          { rootMargin: '25% 0px 25% 0px' }
        )
      : null;
  }

  add(item) {
    item.smooth = undefined;
    item.active = false;
    if (item.kind === 'view') {
      if (this.io) {
        item.el.__fxItem = item;
        this.io.observe(item.el);
      } else {
        item.active = true;
      }
    }
    this.items.add(item);
    this.start();
    return () => this.remove(item);
  }

  remove(item) {
    this.items.delete(item);
    if (item.kind === 'view' && this.io) {
      this.io.unobserve(item.el);
      delete item.el.__fxItem;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  tick() {
    if (!this.running) return;
    this.smoothScroll = lerp(this.smoothScroll, scrollProgress(), 0.2);
    if (Math.abs(this.smoothScroll - scrollProgress()) < 0.0005) {
      this.smoothScroll = scrollProgress();
    }
    for (const item of this.items) {
      if (item.kind === 'scroll') {
        item.update(this.smoothScroll);
        continue;
      }
      if (!item.active) continue;
      const target = viewProgress(item.el);
      item.smooth = item.smooth === undefined ? target : lerp(item.smooth, target, 0.2);
      if (Math.abs(item.smooth - target) < 0.0005) item.smooth = target;
      item.update(item.smooth);
    }
    this.raf = requestAnimationFrame(this.tick);
  }
}

function hasScrollDrivenTimeline(el) {
  if (!el || typeof el.getAnimations !== 'function') return false;
  return el.getAnimations().some((anim) => {
    const t = anim.timeline;
    return t && t.constructor && t.constructor.name !== 'DocumentTimeline';
  });
}

function nativeMount(root, animatedEl) {
  root.classList.add('fx-native');
  return {
    verify: () => hasScrollDrivenTimeline(animatedEl),
    cleanup: () => root.classList.remove('fx-native'),
  };
}

function pollProgress(animatedEl, onProgress) {
  let raf = 0;
  let alive = true;
  const loop = () => {
    if (!alive) return;
    const anims = animatedEl.getAnimations ? animatedEl.getAnimations() : [];
    for (const anim of anims) {
      const timing = anim.effect && anim.effect.getComputedTiming
        ? anim.effect.getComputedTiming()
        : null;
      if (timing && timing.progress != null && isFinite(timing.progress)) {
        onProgress(clamp01(timing.progress));
        break;
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
  };
}

export const effects = [
  {
    id: 'progress',
    name: '滚动进度条',
    requires: 'cssScroll',
    mountNative() {
      const track = document.getElementById('progressTrack');
      const bar = document.getElementById('progressBar');
      bar.style.transform = '';
      return nativeMount(track, bar);
    },
    mountFallback(runtime) {
      const bar = document.getElementById('progressBar');
      return runtime.add({
        kind: 'scroll',
        update: (p) => {
          bar.style.transform = `scaleX(${p})`;
        },
      });
    },
  },
  {
    id: 'parallax',
    name: '视差',
    requires: 'cssView',
    mountNative() {
      const section = document.getElementById('parallaxSection');
      const layer = section.querySelector('.layer-back');
      for (const el of section.querySelectorAll('.layer')) el.style.transform = '';
      return nativeMount(section, layer);
    },
    mountFallback(runtime) {
      const section = document.getElementById('parallaxSection');
      const layers = [
        { el: section.querySelector('.layer-back'), amp: 60 },
        { el: section.querySelector('.layer-mid'), amp: 110 },
        { el: section.querySelector('.layer-front'), amp: 170 },
      ];
      return runtime.add({
        kind: 'view',
        el: section,
        update: (p) => {
          for (const { el, amp } of layers) {
            el.style.transform = `translate3d(0, ${(amp * (1 - 2 * p)).toFixed(2)}px, 0)`;
          }
        },
      });
    },
  },
  {
    id: 'frames',
    name: '逐帧动画',
    requires: 'cssView',
    mountNative() {
      const section = document.getElementById('frameSection');
      const sprite = document.getElementById('frameSprite');
      const label = document.getElementById('frameLabel');
      sprite.style.backgroundPosition = '';
      const handle = nativeMount(section, sprite);
      const stopPoll = pollProgress(sprite, (p) => {
        const idx = Math.min(FRAME_COUNT - 1, Math.floor(p * FRAME_COUNT));
        label.textContent = `第 ${idx + 1} / ${FRAME_COUNT} 帧`;
      });
      return {
        verify: handle.verify,
        cleanup: () => {
          stopPoll();
          handle.cleanup();
        },
      };
    },
    mountFallback(runtime) {
      const section = document.getElementById('frameSection');
      const sprite = document.getElementById('frameSprite');
      const label = document.getElementById('frameLabel');
      return runtime.add({
        kind: 'view',
        el: section,
        update: (p) => {
          const idx = Math.min(FRAME_COUNT - 1, Math.floor(p * FRAME_COUNT));
          sprite.style.backgroundPosition = `${-idx * FRAME_WIDTH}px 0`;
          label.textContent = `第 ${idx + 1} / ${FRAME_COUNT} 帧`;
        },
      });
    },
  },
  {
    id: 'sticky',
    name: '粘性效果',
    requires: 'cssView',
    mountNative() {
      const section = document.getElementById('stickySection');
      const card = document.getElementById('stickyCard');
      const label = document.getElementById('stickyLabel');
      card.style.transform = '';
      card.style.opacity = '';
      const handle = nativeMount(section, card);
      const stopPoll = pollProgress(card, (p) => {
        label.textContent = `${Math.round(p * 100)}%`;
      });
      return {
        verify: handle.verify,
        cleanup: () => {
          stopPoll();
          handle.cleanup();
        },
      };
    },
    mountFallback(runtime) {
      const section = document.getElementById('stickySection');
      const card = document.getElementById('stickyCard');
      const label = document.getElementById('stickyLabel');
      return runtime.add({
        kind: 'view',
        el: section,
        update: (p) => {
          const scale = 0.6 + 0.4 * p;
          const rotate = -8 + 8 * p;
          const y = 40 * (1 - p);
          card.style.transform = `scale(${scale.toFixed(4)}) rotate(${rotate.toFixed(2)}deg) translate3d(0, ${y.toFixed(2)}px, 0)`;
          card.style.opacity = (0.3 + 0.7 * p).toFixed(3);
          label.textContent = `${Math.round(p * 100)}%`;
        },
      });
    },
  },
];
