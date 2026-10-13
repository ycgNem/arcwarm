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
    addEventListener('mousemove', (e) => {
      if (this.locked && this.onLook) this.onLook(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.down.clear();
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
