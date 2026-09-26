// Keyboard + gamepad input -> pilot controls and discrete commands.
import { clamp, approach } from './util.js';

export class Input {
  constructor(onCommand) {
    this.keys = new Set();
    this.onCommand = onCommand;
    this.axes = { pitch: 0, roll: 0, yaw: 0 };
    this.throttle = 0;
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End', '/', 'Tab'].includes(e.key)) e.preventDefault();
      if (!e.repeat) this.command(k, e);
      this.keys.add(k);
      if (e.shiftKey) this.keys.add('Shift');
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
      if (k === 'shift') this.keys.clear();
    });
    window.addEventListener('blur', () => this.keys.clear());
    this.pad = null;
    this._padPrev = {};
    this.touch = { pitch: 0, roll: 0, yaw: 0, brake: 0, throttle: null, active: false };
  }

  // on-screen controls for touch devices
  bindTouch(root) {
    const T = this.touch;
    const stick = root.querySelector('#stick'), knob = root.querySelector('#stickKnob');
    let id = null;
    const move = (e) => {
      const r = stick.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(x, y), k = l > 1 ? 1 / l : 1;
      T.roll = x * k; T.pitch = y * k;            // drag down = pull (nose up)
      knob.style.transform = `translate(${x * k * 46}px, ${y * k * 46}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); T.active = true; move(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = () => { id = null; T.roll = T.pitch = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const thr = root.querySelector('#thr');
    thr.addEventListener('input', () => { T.throttle = thr.value / 100; T.active = true; });
    this.thrSlider = thr;
    root.querySelectorAll('#tbtns button').forEach((b) => {
      const t = b.dataset.t;
      const hold = { brake: 'brake', yawL: -1, yawR: 1 };
      if (t in hold) {
        const on = () => { if (t === 'brake') T.brake = 1; else T.yaw = hold[t]; };
        const off = () => { if (t === 'brake') T.brake = 0; else T.yaw = 0; };
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
        b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
      } else {
        b.addEventListener('click', () => this.onCommand(t));
      }
    });
  }

  command(k, e) {
    const map = {
      g: 'gear', x: 'flapsDown', z: 'flapsUp', '/': 'speedbrake', k: 'speedbrake', p: 'parking', n: 'autobrake',
      h: 'reverse', '1': 'ap', '2': 'at', '3': 'hdg', '4': 'alt', '5': 'vs', '6': 'app', '7': 'flch',
      c: 'view', i: 'panel', u: 'hud', l: 'lights', t: 'time', j: 'pushback', Escape: 'menu', Backspace: 'reset',
      '0': 'direct', m: 'mute', o: 'service', v: 'view', b: 'trafficNext', '9': 'atcVoice', y: 'atc',
    };
    if (e.shiftKey && k === 'r') return this.onCommand('toga');
    if (e.shiftKey && k === 'f') return this.onCommand('idle');
    if (e.shiftKey && k === 'x') return this.onCommand('extinguish');
    if (e.shiftKey && k === 'd') return this.onCommand('fids');
    if (map[k]) this.onCommand(map[k]);
  }

  down(...ks) { return ks.some((k) => this.keys.has(k)); }

  walkAxes() {
    const K = this;
    return { fwd: (K.down('ArrowUp', 'w') ? 1 : 0) - (K.down('ArrowDown', 's') ? 1 : 0),
      side: (K.down('ArrowRight', 'd') ? 1 : 0) - (K.down('ArrowLeft', 'a') ? 1 : 0),
      turn: (K.down('e') ? 1 : 0) - (K.down('q') ? 1 : 0), run: K.down('Shift') };
  }

  // returns pilot inputs; rate-limited so a keyboard feels like a stick
  update(dt, pilot, sys) {
    const K = this;
    // walking in the cabin: the movement keys walk instead of flying
    const fly = this.walk ? 0 : 1;
    const tgtPitch = fly * ((K.down('ArrowDown', 's') ? 1 : 0) - (K.down('ArrowUp', 'w') ? 1 : 0));
    const tgtRoll = fly * ((K.down('ArrowRight', 'd') ? 1 : 0) - (K.down('ArrowLeft', 'a') ? 1 : 0));
    const tgtYaw = fly * ((K.down('e') ? 1 : 0) - (K.down('q') ? 1 : 0));
    const r = (cur, t, up, down) => approach(cur, t, t === 0 ? down : up, dt);
    this.axes.pitch = r(this.axes.pitch, tgtPitch * 0.85, 1.6, 3.5);
    this.axes.roll = r(this.axes.roll, tgtRoll, 2.2, 4);
    this.axes.yaw = r(this.axes.yaw, tgtYaw, 1.5, 3);
    let pitch = this.axes.pitch, roll = this.axes.roll, yaw = this.axes.yaw;
    // throttle
    let thr = pilot.throttle;
    if (K.down('r', 'PageUp', '=', '+')) thr += dt * 0.35;
    if (K.down('f', 'PageDown', '-')) thr -= dt * 0.35;
    // brakes
    let brakes = K.down(' ', '.') ? 1 : 0;
    // manual trim (direct law)
    sys.trimInput = (K.down('End') ? 1 : 0) - (K.down('Home') ? 1 : 0);
    // ---- gamepad ----
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
      const ax = gp.axes;
      if (Math.abs(dz(ax[1])) > 0) pitch = dz(ax[1]);
      if (Math.abs(dz(ax[0])) > 0) roll = dz(ax[0]);
      if (ax.length > 2 && Math.abs(dz(ax[2])) > 0) yaw = dz(ax[2]);
      const b = gp.buttons;
      const val = (i) => (b[i] ? (b[i].value ?? (b[i].pressed ? 1 : 0)) : 0);
      thr += (val(7) - val(6)) * dt * 0.4;
      if (val(4) > 0.5) yaw = -1;
      if (val(5) > 0.5) yaw = 1;
      brakes = Math.max(brakes, val(1));
      const edge = (i, cmd) => {
        const p = val(i) > 0.5;
        if (p && !this._padPrev[i]) this.onCommand(cmd);
        this._padPrev[i] = p;
      };
      edge(0, 'gear'); edge(2, 'flapsDown'); edge(3, 'flapsUp'); edge(9, 'ap'); edge(8, 'view'); edge(12, 'speedbrake');
    }
    // ---- touch ----
    const T = this.touch;
    if (T.active) {
      if (T.pitch || T.roll) { pitch = T.pitch; roll = T.roll; }
      if (T.yaw) yaw = T.yaw;
      if (T.throttle !== null) { thr = T.throttle; T.throttle = null; }
      brakes = Math.max(brakes, T.brake);
      if (this.thrSlider && document.activeElement !== this.thrSlider) this.thrSlider.value = Math.round(clamp(thr, 0, 1) * 100);
    }
    pilot.pitch = clamp(pitch, -1, 1);
    pilot.roll = clamp(roll, -1, 1);
    pilot.yaw = clamp(yaw, -1, 1);
    pilot.throttle = clamp(thr, 0, 1);
    pilot.brakes = brakes;
  }
}
