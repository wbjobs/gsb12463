export class PerfMonitor {
  constructor() {
    this.reset();
    this.longtaskSupported = false;
    if ('PerformanceObserver' in window) {
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.longtasks += 1;
            this.longtaskTime += entry.duration;
          }
        });
        this.observer.observe({ entryTypes: ['longtask'] });
        this.longtaskSupported = true;
      } catch {
        this.longtaskSupported = false;
      }
    }
    this.running = false;
    this.last = 0;
    this.tick = this.tick.bind(this);
  }

  reset() {
    this.frames = 0;
    this.totalDelta = 0;
    this.worst = 0;
    this.jank = 0;
    this.dropped = 0;
    this.longtasks = 0;
    this.longtaskTime = 0;
    this.startTime = performance.now();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  tick(now) {
    if (!this.running) return;
    const delta = now - this.last;
    this.last = now;
    if (delta > 0 && delta < 1000) {
      this.frames += 1;
      this.totalDelta += delta;
      if (delta > this.worst) this.worst = delta;
      if (delta > 50) this.jank += 1;
      if (delta > 34) this.dropped += Math.max(0, Math.round(delta / 16.7) - 1);
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  snapshot() {
    const elapsed = Math.max(1, performance.now() - this.startTime);
    return {
      fps: this.frames / (elapsed / 1000),
      avgFrame: this.frames ? this.totalDelta / this.frames : 0,
      worst: this.worst,
      jank: this.jank,
      dropped: this.dropped,
      longtasks: this.longtasks,
      longtaskTime: this.longtaskTime,
      longtaskSupported: this.longtaskSupported,
      elapsed,
    };
  }
}
