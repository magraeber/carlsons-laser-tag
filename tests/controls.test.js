import test from 'node:test';
import assert from 'node:assert/strict';
import { Controls } from '../src/controls.js';

class Element extends EventTarget {
  style = {};
  setPointerCapture(id) { this.captured = id; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}
function send(target, type, props = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event); return event;
}
function setup(coarse) {
  const elements = Object.fromEntries(['#joystick-knob', '#joystick', '#look-zone', '#fire'].map(id => [id, new Element()]));
  const fakeDocument = new EventTarget(); fakeDocument.querySelector = id => elements[id]; fakeDocument.pointerLockElement = null;
  globalThis.document = fakeDocument; globalThis.window = new EventTarget(); globalThis.matchMedia = () => ({ matches: coarse });
  let pauses = 0, engages = 0;
  const canvas = new Element(); const controls = new Controls(canvas, { onPause: () => pauses++, onEngage: () => engages++ });
  controls.setEnabled(true);
  return { elements, controls, canvas, pauses: () => pauses, engages: () => engages };
}

test('three independent touch pointers can move, aim and fire simultaneously', () => {
  const { elements: e, controls, engages } = setup(true);
  send(e['#joystick'], 'pointerdown', { pointerId: 11, clientX: 50, clientY: 16 });
  send(e['#look-zone'], 'pointerdown', { pointerId: 12, clientX: 400, clientY: 200 });
  send(e['#fire'], 'pointerdown', { pointerId: 13 });
  send(e['#look-zone'], 'pointermove', { pointerId: 12, clientX: 440, clientY: 180 });
  const input = controls.consume();
  assert.equal(input.x, 0); assert.equal(input.z, -1); assert.equal(input.fire, true);
  assert.ok(input.yaw > 0); assert.ok(input.pitch < 0); assert.equal(engages(), 1);
  assert.equal(controls.consume().yaw, 0); assert.equal(controls.consume().fire, true);
  // Losing a look pointer must not cancel movement or firing.
  send(e['#look-zone'], 'pointercancel', { pointerId: 12 });
  assert.equal(controls.consume().fire, true); assert.equal(controls.consume().z, -1);
  send(e['#fire'], 'lostpointercapture', { pointerId: 13 });
  assert.equal(controls.consume().fire, false); assert.equal(controls.consume().z, -1);
  send(e['#joystick'], 'pointercancel', { pointerId: 11 });
  assert.equal(controls.consume().z, 0); assert.equal(e['#joystick-knob'].style.transform, '');
});

test('joystick clamps long drags and ignores a second joystick pointer', () => {
  const { elements: e, controls } = setup(true);
  send(e['#joystick'], 'pointerdown', { pointerId: 1, clientX: 500, clientY: 500 });
  let input = controls.consume(); assert.ok(Math.abs(Math.hypot(input.x, input.z) - 1) < 1e-6);
  send(e['#joystick'], 'pointerdown', { pointerId: 2, clientX: 0, clientY: 0 });
  send(e['#joystick'], 'pointerup', { pointerId: 2 });
  input = controls.consume(); assert.ok(input.x > 0 && input.z > 0);
  controls.setEnabled(false); input = controls.consume(); assert.equal(input.x, 0); assert.equal(input.z, 0); assert.equal(input.fire, false);
});

test('desktop keyboard and drag aiming work without pointer lock; blur resets held input', () => {
  const { controls, canvas, pauses } = setup(false);
  send(window, 'keydown', { code: 'KeyW' }); send(window, 'keydown', { code: 'KeyD' }); send(window, 'keydown', { code: 'Space' });
  let input = controls.consume(); assert.equal(input.x, 1); assert.equal(input.z, -1); assert.equal(input.fire, true);
  send(window, 'keyup', { code: 'Space' });
  send(canvas, 'pointerdown', { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100 });
  send(window, 'pointermove', { pointerId: 3, pointerType: 'mouse', clientX: 125, clientY: 90 });
  input = controls.consume(); assert.ok(input.yaw > 0 && input.pitch < 0 && input.fire);
  send(window, 'pointercancel', { pointerId: 3 }); assert.equal(controls.consume().fire, false);
  send(window, 'blur'); input = controls.consume(); assert.equal(input.x, 0); assert.equal(input.z, 0); assert.equal(pauses(), 1);
});
