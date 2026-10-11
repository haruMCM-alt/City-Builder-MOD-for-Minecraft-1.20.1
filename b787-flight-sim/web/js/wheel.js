// Racing wheel (ハンコン) support through the Gamepad API.
//
// Wheels are "non-standard" gamepads whose axis order depends on the model and the OS (the
// pedals of the same Logitech wheel come out on different axes under Windows and Linux, at rest
// they read +1 on one and -1 on another, and Chrome reports 0 until a pedal is first moved).
// So nothing about the pedals is guessed: they are assigned by pressing them once (calibration,
// stored per device). Until then only the wheel itself (axis 0) is used.
//
//   wheel        roll (ailerons); on the ground it also steers the nose wheel (systems.js)
//   accelerator  thrust levers (absolute, or "rate": pressing moves the levers)
//   brake        wheel brakes (analogue)
//   clutch       pull (nose up): a wheel has no pitch axis; D-pad up / down = push / pull
//   buttons      paddles: flaps up / down; gear, speedbrake, reverse, A/P, A/T, view

const WHEEL_ID = /wheel|racing|G2[5-9]\b|G9[0-9]{2}|G923|driving force|DFGT|thrustmaster|\bT(?:150|248|300|500|GT|MX|S-?PC|S-?XW)\b|fanatec|csl|clubsport|podium|moza|simucube|simagic|PXN|hori.*rac|logitech.*(?:046d.*c2[0-9a-f]{2})/i;
const KEY = 'b787.wheel.';

export const GAINS = { 1.5: '±300°', 2.5: '±180°', 4: '±110°', 6: '±75°' };

export function isWheel(gp) { return !!gp && WHEEL_ID.test(gp.id || ''); }

function defaults() {
  return {
    steer: { axis: 0, inv: false },
    thr: null, brk: null, clu: null,           // { axis, rest, full }
    gain: 2.5, thrMode: 'abs',
    // button index -> command (Logitech layout: 0 ✕ 1 □ 2 ○ 3 △ 4 right paddle 5 left paddle 6 R2 7 L2)
    buttons: { 0: 'gear', 1: 'speedbrake', 2: 'reverse', 3: 'ap', 4: 'flapsDown', 5: 'flapsUp', 6: 'at', 7: 'view' },
  };
}

export class Wheel {
  constructor() {
    this.cfg = null; this.id = null; this.index = -1;
    this.prevBtn = {};
    this.thrActive = false;      // the accelerator has been pressed since the wheel appeared
    this.cal = null;             // running calibration
    this.state = { steer: 0, thr: 0, brk: 0, clu: 0, hat: 0 };
  }

  // the first connected wheel (or null); loads its configuration when it changes
  find(pads) {
    const gp = [...pads].find((p) => p && p.connected && isWheel(p)) || null;
    if (gp && gp.id !== this.id) {
      this.id = gp.id; this.index = gp.index;
      let c = null;
      try { c = JSON.parse(localStorage.getItem(KEY + gp.id) || 'null'); } catch (e) { /* storage unavailable */ }
      this.cfg = Object.assign(defaults(), c || {});
      this.thrActive = false; this.hatAxis = null;
      this.fresh = true;           // (the app shows a hint once)
    }
    if (!gp && this.id) { this.id = null; this.cfg = null; }
    return gp;
  }

  save() {
    if (!this.id) return;
    try { localStorage.setItem(KEY + this.id, JSON.stringify(this.cfg)); } catch (e) { /* storage unavailable */ }
  }

  reset() { this.cfg = defaults(); this.thrActive = false; this.save(); }

  calibrated() { return !!(this.cfg && this.cfg.thr && this.cfg.brk); }

  static pedal(ax, p) {
    if (!p || ax[p.axis] === undefined) return 0;
    const d = p.full - p.rest;
    return Math.abs(d) < 0.2 ? 0 : Math.min(1, Math.max(0, (ax[p.axis] - p.rest) / d));
  }

  // D-pad: standard mapping -> buttons 12 / 13; DirectInput wheels -> one "hat" axis whose value
  // steps through 8 directions from -1 (up) clockwise and reads ~+1.29 when released. The axis is
  // only trusted once that neutral value has been seen (a pedal at rest also reads -1 = "up").
  hat(gp) {
    const b = gp.buttons, ax = gp.axes;
    if (gp.mapping === 'standard' && b[12]) return (b[12].pressed ? -1 : 0) + (b[13]?.pressed ? 1 : 0);
    if (this.hatAxis == null) this.hatAxis = ax.findIndex((v) => v > 1.05 && v < 1.4);
    if (this.hatAxis < 0) { this.hatAxis = null; return 0; }
    const v = ax[this.hatAxis];
    if (v > 1.05) return 0;
    const k = ((Math.round((v + 1) / (2 / 7)) % 8) + 8) % 8;   // 0 up, 2 right, 4 down, 6 left
    return [7, 0, 1].includes(k) ? -1 : [3, 4, 5].includes(k) ? 1 : 0;
  }

  // read the wheel into this.state and fire button commands
  read(gp, onCommand) {
    const c = this.cfg, ax = gp.axes, S = this.state;
    let st = ax[c.steer.axis] || 0;
    if (c.steer.inv) st = -st;
    S.steer = st;
    S.thr = Wheel.pedal(ax, c.thr);
    S.brk = Wheel.pedal(ax, c.brk);
    S.clu = Wheel.pedal(ax, c.clu);
    S.hat = this.hat(gp);
    if (S.thr > 0.05) this.thrActive = true;
    if (this.cal) { this._calStep(gp); return S; }
    gp.buttons.forEach((b, i) => {
      const p = !!(b && (b.pressed || b.value > 0.5));
      const cmd = c.buttons[i];
      if (cmd && p && !this.prevBtn[i]) onCommand(cmd);
      this.prevBtn[i] = p;
    });
    return S;
  }

  // roll command from the wheel angle: gain sets the wheel angle of full deflection, a little
  // expo keeps the centre gentle
  roll() {
    const x = Math.max(-1, Math.min(1, this.state.steer * this.cfg.gain));
    return x * (0.55 + 0.45 * Math.abs(x));
  }

  // ---------------------------------------------------------------- calibration
  // what: 'steer' (turn right), 'thr' / 'brk' / 'clu' (press fully and release)
  calibrate(what, gp, done) {
    this.cal = { what, base: [...gp.axes], ext: [...gp.axes], t0: performance.now(), done, peak: -1, axis: -1 };
  }

  cancelCal() { if (this.cal) { const d = this.cal.done; this.cal = null; d?.(false); } }

  _calStep(gp) {
    const C = this.cal, ax = gp.axes, c = this.cfg;
    const used = new Set([c.steer.axis, c.thr?.axis, c.brk?.axis, c.clu?.axis].filter((a) => a != null));
    if (C.what !== 'steer') used.delete(c[C.what]?.axis);
    else used.delete(c.steer.axis);
    let best = -1, bd = 0;
    for (let i = 0; i < ax.length; i++) {
      if ((used.has(i) && C.what !== 'steer') || i === this.hatAxis) continue;
      const v = ax[i];
      if (v > 1.05) continue;                                   // a hat at rest
      if (Math.abs(v - C.base[i]) > Math.abs(C.ext[i] - C.base[i])) C.ext[i] = v;
      const d = Math.abs(C.ext[i] - C.base[i]);
      if (d > bd) { bd = d; best = i; }
    }
    const age = performance.now() - C.t0;
    if (C.what === 'steer') {
      // the axis that moved most while turning right
      if (bd > 0.25) {
        c.steer = { axis: best, inv: C.ext[best] - C.base[best] < 0 };
        this._finish(true);
      }
    } else if (bd > 0.5) {
      C.axis = best;
      // released again: the rest value is what it reads now (Chrome may report 0 before the
      // first movement), full travel is the extreme seen
      if (Math.abs(ax[best] - C.ext[best]) > 0.6 * bd && age > 400) {
        c[C.what] = { axis: best, rest: ax[best], full: C.ext[best] };
        if (C.what === 'thr') this.thrActive = false;
        this._finish(true);
      }
    }
    if (this.cal && age > 12000) this._finish(false);
  }

  _finish(ok) {
    const d = this.cal.done;
    this.cal = null;
    if (ok) this.save();
    d?.(ok);
  }
}

// ---------------------------------------------------------------- settings UI (options slide)
// live bars and the assignment buttons; while the menu is up the flight loop does not read the
// pads, so this polls them itself
export function bindWheelUI(wheel, $) {
  const root = $('wheelCfg');
  if (!root) return;
  const name = $('wheelName'), msg = $('wheelMsg'), gain = $('wheelGain'), mode = $('wheelThrMode');
  const bars = {};
  root.querySelectorAll('.wBar').forEach((b) => { bars[b.dataset.k] = b; });
  const PROMPT = { steer: 'ハンドルを右に回してください', thr: 'アクセルを奥まで踏んで、離してください',
    brk: 'ブレーキを奥まで踏んで、離してください', clu: 'クラッチを奥まで踏んで、離してください' };
  const LABEL = { steer: 'ハンドル', thr: 'アクセル', brk: 'ブレーキ', clu: 'クラッチ' };
  const pads = () => (navigator.getGamepads ? navigator.getGamepads() : []);
  const syncSelects = () => { if (wheel.cfg) { gain.value = String(wheel.cfg.gain); mode.value = wheel.cfg.thrMode; } };
  gain.addEventListener('change', () => { if (wheel.cfg) { wheel.cfg.gain = +gain.value; wheel.save(); } });
  mode.addEventListener('change', () => { if (wheel.cfg) { wheel.cfg.thrMode = mode.value; wheel.save(); } });
  root.querySelectorAll('[data-cal]').forEach((btn) => btn.addEventListener('click', () => {
    const gp = wheel.find(pads());
    if (!gp) { msg.textContent = 'ハンコンが見つかりません。つないでからハンドルを少し回してください。'; return; }
    wheel.cancelCal();
    const what = btn.dataset.cal;
    btn.classList.add('on');
    msg.textContent = PROMPT[what] + '（12 秒以内）';
    wheel.calibrate(what, gp, (ok) => {
      btn.classList.remove('on');
      msg.textContent = ok ? `${LABEL[what]}を割り当てました（軸 ${what === 'steer' ? wheel.cfg.steer.axis : wheel.cfg[what].axis}）` :
        `${LABEL[what]}の割り当てを中止しました（動きを検出できませんでした）`;
    });
  }));
  $('wheelReset').addEventListener('click', () => { if (wheel.cfg) { wheel.cancelCal(); wheel.reset(); syncSelects(); msg.textContent = '初期設定に戻しました'; } });
  let lastId = null;
  const tick = () => {
    requestAnimationFrame(tick);
    if (!root.offsetParent) return;                 // options not on screen
    const gp = wheel.find(pads());
    if (!gp) { if (lastId !== null) { name.textContent = '未接続 — つないでハンドルを少し回してください'; lastId = null; } return; }
    if (gp.id !== lastId) { lastId = gp.id; name.textContent = gp.id.replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 60); syncSelects(); }
    const S = wheel.read(gp, () => {});
    const c = wheel.cfg;
    const set = (k, v, on) => { const b = bars[k]; if (!b) return; b.classList.toggle('off', !on); const i = b.firstChild;
      if (k === 'steer') { const x = Math.max(-1, Math.min(1, v)); i.style.left = (x < 0 ? 50 + x * 50 : 50) + '%'; i.style.width = Math.abs(x) * 50 + '%'; } else i.style.width = v * 100 + '%'; };
    set('steer', S.steer, true);
    set('thr', S.thr, !!c.thr); set('brk', S.brk, !!c.brk); set('clu', S.clu, !!c.clu);
  };
  requestAnimationFrame(tick);
}
