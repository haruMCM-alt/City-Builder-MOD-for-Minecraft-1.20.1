import { fmtTime } from './timetable.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = $('hud');
    this.speedo = $('speedo');
    this.g = this.speedo.getContext('2d');
    this.notchList = $('notches');
    this.msgEl = $('message');
    this.msgTimer = 0;
    this.lastNotchKey = '';
  }

  setup(veh, timetable) {
    this.veh = veh;
    this.maxDial = veh.maxSpeed <= 100 ? 120 : 140;
    // notch column
    const items = [];
    for (let p = veh.powerNotches; p >= 1; p--) items.push({ h: p, label: 'P' + p, cls: 'p' });
    items.push({ h: 0, label: 'N', cls: 'n' });
    for (let b = 1; b <= veh.brakeNotches; b++) items.push({ h: -b, label: 'B' + b, cls: 'b' });
    items.push({ h: -(veh.brakeNotches + 1), label: 'EB', cls: 'eb' });
    this.notchList.innerHTML = items.map((it) => `<div class="notch ${it.cls}" data-h="${it.h}">${it.label}</div>`).join('');
    this.notchEls = [...this.notchList.children];
    // route strip
    const strip = $('routeStrip');
    strip.innerHTML = timetable.map((r, i) => `<div class="rs-st" data-i="${i}"><span class="dot"></span><span class="nm">${r.station.name}</span></div>`).join('');
    this.stripEls = [...strip.children];
    $('vehName').textContent = veh.name;
  }

  message(text, cls = '', dur = 2.5) {
    this.msgEl.innerHTML = text;
    this.msgEl.className = 'show ' + cls;
    this.msgTimer = dur;
  }

  update(dt, d) {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msgEl.className = '';
    }
    this.drawSpeedo(d.kmh, d.limit, d.pattern, d.atsNear, d.atsBrake);
    // notch
    const key = d.handle + ':' + d.atsBrake;
    if (key !== this.lastNotchKey) {
      this.lastNotchKey = key;
      for (const e of this.notchEls) e.classList.toggle('on', Number(e.dataset.h) === d.handle);
    }
    $('notchBig').textContent = d.notchLabel;
    $('notchBig').className = d.handle > 0 ? 'p' : d.handle < 0 ? (d.handle === -(this.veh.brakeNotches + 1) ? 'eb' : 'b') : 'n';
    // info
    $('clock').textContent = fmtTime(d.clock);
    $('nextName').textContent = d.next ? d.next.station.name : '—';
    $('nextKind').textContent = d.next ? (d.terminal ? '終点' : '停車') : '';
    $('nextArr').textContent = d.next ? fmtTime(d.next.arr) : '--';
    $('nextDep').textContent = d.depText || '';
    const dist = d.dist;
    let distTxt = '--';
    if (dist != null) {
      if (Math.abs(dist) < 100) distTxt = dist.toFixed(2) + ' m';
      else if (Math.abs(dist) < 1000) distTxt = Math.round(dist) + ' m';
      else distTxt = (dist / 1000).toFixed(2) + ' km';
    }
    $('nextDist').textContent = distTxt;
    $('delay').textContent = d.delayText || '';
    $('delay').className = d.delay > 0 ? 'late' : '';
    $('score').textContent = d.score;
    $('limitNow').textContent = d.limit;
    const nl = d.nextLimit;
    $('limitNext').textContent = nl ? `${nl.v} (${Math.round(nl.d)}m先)` : '';
    $('atsLamp').className = d.atsBrake ? 'lamp red' : d.atsNear ? 'lamp yellow' : 'lamp';
    $('atsLamp').textContent = d.atsBrake ? 'ATS ブレーキ' : d.atsNear ? 'パターン接近' : 'ATS-P';
    $('doorLamp').className = d.doorsOpen ? 'lamp yellow' : 'lamp';
    $('doorLamp').textContent = d.doorsOpen ? 'ドア開' : '戸閉';
    // precision stop gauge
    const sg = $('stopGauge');
    if (dist != null && dist < 120 && dist > -40 && d.running) {
      sg.classList.add('show');
      const x = Math.max(-1, Math.min(1, -dist / 40));
      $('stopNeedle').style.left = `${50 + x * 50}%`;
      $('stopText').textContent = dist >= 0 ? `あと ${dist.toFixed(2)} m` : `${(-dist).toFixed(2)} m 行き過ぎ`;
    } else sg.classList.remove('show');
    // route strip
    for (const e of this.stripEls) {
      const i = Number(e.dataset.i);
      e.classList.toggle('done', i < d.targetIdx);
      e.classList.toggle('cur', i === d.targetIdx);
    }
  }

  drawSpeedo(kmh, limit, pattern, near, brake) {
    const g = this.g, W = this.speedo.width, H = this.speedo.height;
    const cx = W / 2, cy = H / 2, R = W * 0.44;
    const max = this.maxDial;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const ang = (v) => a0 + (a1 - a0) * Math.min(1, Math.max(0, v / max));
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(8,10,14,0.88)';
    g.beginPath(); g.arc(cx, cy, R + 10, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#555'; g.lineWidth = 3; g.stroke();
    // limit arc
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(255,200,0,0.85)';
    g.beginPath(); g.arc(cx, cy, R - 6, ang(limit), a1); g.stroke();
    if (pattern < max) {
      g.strokeStyle = 'rgba(255,40,40,0.9)';
      g.beginPath(); g.arc(cx, cy, R - 6, ang(pattern), a1); g.stroke();
    }
    // ticks
    g.fillStyle = '#ddd'; g.strokeStyle = '#ddd';
    g.font = `bold ${Math.round(W * 0.065)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= max; v += 5) {
      const a = ang(v);
      const big = v % 20 === 0;
      g.lineWidth = big ? 3 : 1.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R - (big ? 22 : 14)), cy + Math.sin(a) * (R - (big ? 22 : 14)));
      g.lineTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2));
      g.stroke();
      if (big) g.fillText(String(v), cx + Math.cos(a) * (R - 40), cy + Math.sin(a) * (R - 40));
    }
    // needle
    const a = ang(kmh);
    g.strokeStyle = brake ? '#ff3030' : '#ffcf3a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx - Math.cos(a) * 14, cy - Math.sin(a) * 14); g.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); g.stroke();
    g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill();
    // digital
    g.fillStyle = near ? '#ffcf3a' : '#fff';
    g.font = `bold ${Math.round(W * 0.15)}px "DSEG7 Classic", ui-monospace, monospace`;
    g.fillText(String(Math.floor(kmh)), cx, cy + R * 0.48);
    g.fillStyle = '#aaa'; g.font = `${Math.round(W * 0.055)}px sans-serif`;
    g.fillText('km/h', cx, cy + R * 0.72);
  }
}
