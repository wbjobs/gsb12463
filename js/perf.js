const JANK_THRESHOLD_MS = 50;
const SAMPLE_WINDOW_MS = 500;

export class PerfMonitor {
  constructor(onSample) {
    this.onSample = onSample;
    this.mode = null;
    this.history = { native: null, fallback: null };
    this.longtaskSupported = false;
    this.longtaskBase = { count: 0, total: 0 };
    this.longtaskNow = { count: 0, total: 0 };

    try {
      if (
        typeof PerformanceObserver !== 'undefined' &&
        Array.isArray(PerformanceObserver.supportedEntryTypes) &&
        PerformanceObserver.supportedEntryTypes.includes('longtask')
      ) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.longtaskNow.count += 1;
            this.longtaskNow.total += entry.duration;
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
        this.longtaskSupported = true;
      }
    } catch {
      this.longtaskSupported = false;
    }

    this.resetWindow();
    this.resetAccum();
    this.rafId = 0;
    this.lastFrameTime = 0;
    this.tick = this.tick.bind(this);
  }

  resetWindow() {
    this.windowStart = 0;
    this.windowFrames = 0;
    this.windowJank = 0;
  }

  resetAccum() {
    this.accum = { fpsSum: 0, samples: 0, jank: 0, frames: 0, startedAt: 0 };
  }

  setMode(mode) {
    if (this.mode && this.accum.samples > 0) {
      this.history[this.mode] = this.snapshotAccum();
    }
    this.mode = mode;
    this.resetAccum();
    this.resetWindow();
    this.longtaskBase = { ...this.longtaskNow };
  }

  snapshotAccum() {
    const avgFps = this.accum.samples > 0 ? this.accum.fpsSum / this.accum.samples : 0;
    return {
      samples: this.accum.samples,
      avgFps,
      jank: this.accum.jank,
      frames: this.accum.frames,
      longtasks: this.longtaskNow.count - this.longtaskBase.count,
      longtaskTime: this.longtaskNow.total - this.longtaskBase.total,
    };
  }

  start() {
    if (!this.rafId) {
      this.lastFrameTime = 0;
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  tick(now) {
    this.rafId = requestAnimationFrame(this.tick);
    if (this.lastFrameTime) {
      const delta = now - this.lastFrameTime;
      this.windowFrames += 1;
      this.accum.frames += 1;
      if (delta > JANK_THRESHOLD_MS) {
        this.windowJank += 1;
        this.accum.jank += 1;
      }
      if (!this.windowStart) this.windowStart = this.lastFrameTime;
      const elapsed = now - this.windowStart;
      if (elapsed >= SAMPLE_WINDOW_MS) {
        const fps = (this.windowFrames / elapsed) * 1000;
        this.accum.fpsSum += fps;
        this.accum.samples += 1;
        this.onSample({
          fps,
          jank: this.windowJank,
          current: this.snapshotAccum(),
          history: this.history,
          mode: this.mode,
          longtaskSupported: this.longtaskSupported,
        });
        this.resetWindow();
      }
    }
    this.lastFrameTime = now;
  }
}
