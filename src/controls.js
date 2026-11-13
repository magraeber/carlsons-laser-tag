export class Controls {
  constructor(canvas, { onPause, onEngage }) {
    this.canvas = canvas; this.onPause = onPause; this.onEngage = onEngage;
    this.keys = new Set(); this.enabled = false; this.firing = false; this.moveX = 0; this.moveZ = 0;
    this.lookX = 0; this.lookY = 0; this.drag = null; this.joyPointer = null; this.firePointer = null;
    this.coarse = matchMedia('(pointer:coarse)').matches;
    this.knob = document.querySelector('#joystick-knob'); this.joystick = document.querySelector('#joystick');
    canvas.tabIndex = 0;
    this.setupKeyboard(); this.setupPointer(); this.setupTouch();
    window.addEventListener('blur', () => { this.reset(); if (this.enabled) this.onPause(); });
  }

  setupKeyboard() {
    window.addEventListener('keydown', event => {
      if (!this.enabled) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Escape', 'KeyP'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat) this.onPause();
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
  }

  engage() {
    this.onEngage?.();
    if (!this.coarse && this.enabled && document.pointerLockElement !== this.canvas) {
      try { const result = this.canvas.requestPointerLock?.(); result?.catch?.(() => {}); } catch { /* Drag aiming remains available. */ }
    }
  }

  setupPointer() {
    this.canvas.addEventListener('pointerdown', event => {
      if (!this.enabled || event.pointerType === 'touch' || event.button !== 0) return;
      this.engage(); this.firing = true;
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    window.addEventListener('pointermove', event => {
      if (!this.enabled || event.pointerType === 'touch') return;
      if (document.pointerLockElement === this.canvas) {
        this.lookX += event.movementX; this.lookY += event.movementY;
      } else if (this.drag?.id === event.pointerId) {
        this.lookX += event.clientX - this.drag.x; this.lookY += event.clientY - this.drag.y;
        this.drag.x = event.clientX; this.drag.y = event.clientY;
      }
    });
    const releaseMouse = event => {
      if (this.drag?.id === event.pointerId) { this.drag = null; this.firing = false; }
    };
    window.addEventListener('pointerup', releaseMouse);
    window.addEventListener('pointercancel', releaseMouse);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas) this.hadLock = true;
      else if (this.hadLock) { this.hadLock = false; this.reset(); if (this.enabled) this.onPause(); }
    });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  setupTouch() {
    const lookZone = document.querySelector('#look-zone'), fire = document.querySelector('#fire');
    this.joystick.addEventListener('pointerdown', event => {
      if (!this.enabled || this.joyPointer !== null) return;
      event.preventDefault(); this.joyPointer = event.pointerId;
      this.joystick.setPointerCapture(event.pointerId); this.updateJoystick(event);
    });
    this.joystick.addEventListener('pointermove', event => { if (event.pointerId === this.joyPointer) this.updateJoystick(event); });
    const endJoystick = event => {
      if (event.pointerId !== this.joyPointer) return;
      this.joyPointer = null; this.moveX = this.moveZ = 0; this.knob.style.transform = '';
    };
    this.joystick.addEventListener('pointerup', endJoystick); this.joystick.addEventListener('pointercancel', endJoystick); this.joystick.addEventListener('lostpointercapture', endJoystick);
    lookZone.addEventListener('pointerdown', event => {
      if (!this.enabled || this.lookPointer) return;
      event.preventDefault(); this.lookPointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; lookZone.setPointerCapture(event.pointerId);
    });
    lookZone.addEventListener('pointermove', event => {
      if (this.lookPointer?.id !== event.pointerId || !this.enabled) return;
      this.lookX += event.clientX - this.lookPointer.x; this.lookY += event.clientY - this.lookPointer.y;
      this.lookPointer.x = event.clientX; this.lookPointer.y = event.clientY;
    });
    const endLook = event => { if (this.lookPointer?.id === event.pointerId) this.lookPointer = null; };
    lookZone.addEventListener('pointerup', endLook); lookZone.addEventListener('pointercancel', endLook); lookZone.addEventListener('lostpointercapture', endLook);
    fire.addEventListener('pointerdown', event => {
      if (!this.enabled) return;
      event.preventDefault(); this.onEngage?.(); this.firing = true; this.firePointer = event.pointerId; fire.setPointerCapture(event.pointerId);
    });
    const endFire = event => { if (this.firePointer === event.pointerId) { this.firing = false; this.firePointer = null; } };
    fire.addEventListener('pointerup', endFire); fire.addEventListener('pointercancel', endFire); fire.addEventListener('lostpointercapture', endFire);
  }

  updateJoystick(event) {
    const rect = this.joystick.getBoundingClientRect(), max = rect.width * .34;
    let x = event.clientX - rect.left - rect.width / 2, z = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, z);
    if (length > max) { x *= max / length; z *= max / length; }
    this.moveX = Math.abs(x / max) < .09 ? 0 : x / max;
    this.moveZ = Math.abs(z / max) < .09 ? 0 : z / max;
    this.knob.style.transform = `translate(${x}px, ${z}px)`;
  }

  consume() {
    const has = (...codes) => codes.some(code => this.keys.has(code));
    const result = {
      x: this.moveX + Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft')),
      z: this.moveZ + Number(has('KeyS', 'ArrowDown')) - Number(has('KeyW', 'ArrowUp')),
      yaw: this.lookX * (this.coarse ? .0045 : .0024),
      pitch: this.lookY * (this.coarse ? .0045 : .0024),
      fire: this.firing || this.keys.has('Space'),
    };
    this.lookX = this.lookY = 0; return result;
  }

  reset() {
    this.keys.clear(); this.firing = false; this.moveX = this.moveZ = this.lookX = this.lookY = 0;
    this.joyPointer = this.firePointer = null; this.lookPointer = this.drag = null; this.knob.style.transform = '';
  }
  setEnabled(value) { this.enabled = value; if (!value) this.reset(); }
}
