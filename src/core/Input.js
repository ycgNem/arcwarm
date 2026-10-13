// Pointer lock with raw input (unadjustedMovement: no OS acceleration), keys and mouse buttons as binds.
// Mouse motion is applied to the view the instant it arrives, not on the physics tick.
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.down = new Set();
    this.locked = false;
    this.raw = false;
    this.onLook = null; // (dx, dy) raw counts
    this.onLockChange = null;
    this.onKey = null; // (code) on press, for menus
    this.lockError = null;

    addEventListener('keydown', (e) => {
      if (this.locked && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
      if (!e.repeat) this.onKey?.(e.code, e);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousedown', (e) => {
      if (this.locked) e.preventDefault();
      this.down.add('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => this.down.delete('Mouse' + e.button));
    addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    // Mouse look. pointerrawupdate delivers each mouse report as it arrives (not batched to the next frame like
    // mousemove), so the view is as fresh as possible when the frame renders. Raw counts go straight to the view.
    this.rawEvents = 'onpointerrawupdate' in window;
    this.counts = { x: 0, y: 0, events: 0, spikes: 0 };
    this.rate = { n: 0, t0: performance.now(), hz: 0 };
    const onMove = (e) => {
      if (!this.locked || !this.onLook) return;
      const dx = e.movementX;
      const dy = e.movementY;
      if (dx === 0 && dy === 0) return;
      // Browsers can report one bogus jump right after the pointer locks, and no real report moves this many counts.
      const cap = this.rawEvents ? 1500 : 6000; // per-report vs per-frame batches
      if (this.skipNext || Math.abs(dx) > cap || Math.abs(dy) > cap) {
        this.skipNext = false;
        this.counts.spikes++;
        return;
      }
      this.counts.x += dx;
      this.counts.y += dy;
      this.counts.events++;
      const r = this.rate;
      r.n++;
      const now = performance.now();
      if (now - r.t0 >= 500) {
        r.hz = Math.round((r.n * 1000) / (now - r.t0));
        r.n = 0;
        r.t0 = now;
      }
      this.onLook(dx, dy);
    };
    addEventListener(this.rawEvents ? 'pointerrawupdate' : 'mousemove', onMove);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.down.clear();
      else this.skipNext = true;
      this.onLockChange?.(this.locked);
    });
  }

  async lock() {
    this.lockError = null;
    if (this.settings.rawInput) {
      try {
        await this.canvas.requestPointerLock({ unadjustedMovement: true });
        this.raw = true;
        return true;
      } catch (e) {
        if (e && e.name !== 'NotSupportedError') {
          this.lockError = e;
          return false; // e.g. re-locking too soon after Esc: Chrome wants ~1 s
        }
      }
    }
    try {
      await this.canvas.requestPointerLock();
      this.raw = false;
      return true;
    } catch (e) {
      this.lockError = e;
      return false;
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  action(name) {
    const binds = this.settings.keys[name] || [];
    for (const c of binds) if (this.down.has(c)) return true;
    return false;
  }
}
