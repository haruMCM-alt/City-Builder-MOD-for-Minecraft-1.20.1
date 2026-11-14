// Live content for the three LCDs on the cab desk (E231/E233 3-screen layout):
// No.1 meter (speedometer, BC/MR pressure), TIMS (next stop / time), right monitor (notch, ATS).
import * as THREE from 'three';
import { fmtTime } from './timetable.js';
import { canvasTexture, UI_FONT } from './displays.js';

// glTF UVs: canvas textures must not be flipped (that turned the screens upside down)
const screenTexture = canvasTexture;
const FONT = UI_FONT;

export class CabDisplays {
  constructor(cabRoot) {
    this.screens = {};
    this.timer = 0;
    cabRoot.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.name || !o.material.name.startsWith('LCD_')) return;
      const key = o.material.name.slice(4).toLowerCase();
      if (!this.screens[key]) {
        const s = screenTexture(512, 384);
        s.mat = new THREE.MeshBasicMaterial({ map: s.t, toneMapped: false });
        this.screens[key] = s;
      }
      o.material = this.screens[key].mat;
    });
  }

  update(dt, { physics, game, route }) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.1;                       // 10 Hz is plenty for an LCD
    const s = this.screens;
    if (s.meter) this.drawMeter(s.meter, physics);
    if (s.tims) this.drawTims(s.tims, game, physics);
    if (s.mon) this.drawMonitor(s.mon, physics, route);
    for (const k in s) s[k].t.needsUpdate = true;
  }

  drawMeter({ g, c }, ph) {
    const W = c.width, H = c.height;
    g.fillStyle = '#141a2a'; g.fillRect(0, 0, W, H);
    // speedometer, 0-140 km/h over a 260° arc
    const cx = W * 0.66, cy = H * 0.56, r = H * 0.40;
    const a0 = Math.PI * (0.5 + 50 / 180), span = Math.PI * 260 / 180;
    g.lineWidth = 3; g.strokeStyle = '#d8dde6';
    g.beginPath(); g.arc(cx, cy, r, a0, a0 + span); g.stroke();
    g.font = `700 18px ${FONT}`; g.fillStyle = '#d8dde6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= 140; v += 10) {
      const a = a0 + span * v / 140;
      const r1 = v % 20 === 0 ? r - 16 : r - 9;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
      if (v % 20 === 0) g.fillText(String(v), cx + Math.cos(a) * (r - 32), cy + Math.sin(a) * (r - 32));
    }
    const v = Math.min(140, ph.kmh);
    const a = a0 + span * v / 140;
    g.strokeStyle = '#ff8a1a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10)); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `700 44px ${FONT}`;
    g.fillText(String(Math.round(ph.kmh)), cx, cy + r * 0.55);
    g.font = `16px ${FONT}`; g.fillText('km/h', cx, cy + r * 0.82);
    // brake cylinder / main reservoir bars
    const bc = Math.min(800, ph.brake * 440 + (ph.ebActive ? 120 : 0));
    const mr = 830 + 40 * Math.sin(performance.now() / 9000);
    const bar = (y, label, val, max, min, col) => {
      g.fillStyle = '#cfd5de'; g.font = `700 18px ${FONT}`; g.textAlign = 'left';
      g.fillText(label, 16, y);
      g.strokeStyle = '#6c7586'; g.lineWidth = 2; g.strokeRect(60, y - 10, 150, 20);
      g.fillStyle = col; g.fillRect(61, y - 9, 148 * Math.max(0, Math.min(1, (val - min) / (max - min))), 18);
      g.fillStyle = '#ffffff'; g.font = `15px ${FONT}`; g.fillText(`${Math.round(val)}`, 216, y);
    };
    bar(H * 0.70, 'BC', bc, 800, 0, '#e8b030');
    bar(H * 0.82, 'MR', mr, 1000, 700, '#4fb0e8');
    // overhead voltage gauge (top left)
    g.fillStyle = '#cfd5de'; g.font = `700 16px ${FONT}`; g.textAlign = 'left';
    g.fillText('架線電圧 1.5 kV', 16, 28);
    g.fillText(`力行 ${(ph.power * 100).toFixed(0)}%`, 16, 54);
    g.fillStyle = '#7ad07a'; g.fillText('三相', 16, H - 16);
    g.fillStyle = ph.ebActive ? '#ff4040' : '#3c4454'; g.fillText('非常', 70, H - 16);
  }

  drawTims({ g, c }, game, ph) {
    const W = c.width, H = c.height;
    g.fillStyle = '#0b1a3c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1e3f8f'; g.fillRect(0, 0, W, 46);
    g.fillStyle = '#ffffff'; g.font = `700 22px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('TIMS  運転情報', 14, 24);
    g.textAlign = 'right'; g.fillText(fmtTime(game.clock, true), W - 14, 24);
    const tgt = game.target, cur = game.current;
    g.textAlign = 'left';
    const rows = [];
    if (cur) rows.push(['現在', cur.station.name, cur.dep != null ? fmtTime(cur.dep) + ' 発' : '']);
    if (tgt) rows.push(['次駅', tgt.station.name, tgt.arr != null ? fmtTime(tgt.arr) + ' 着' : '']);
    const nxt = game.tt[game.ti + 1];
    if (nxt) rows.push(['', nxt.station.name, nxt.arr != null ? fmtTime(nxt.arr) + ' 着' : '']);
    rows.forEach((r, i) => {
      const y = 86 + i * 62;
      g.fillStyle = i === 1 ? '#2c5bd0' : '#173070';
      g.fillRect(12, y - 26, W - 24, 52);
      g.fillStyle = '#9fb8ff'; g.font = `700 18px ${FONT}`; g.fillText(r[0], 22, y);
      g.fillStyle = '#ffffff'; g.font = `700 30px ${FONT}`; g.fillText(r[1], 90, y);
      g.font = `700 22px ${FONT}`; g.textAlign = 'right'; g.fillText(r[2], W - 24, y); g.textAlign = 'left';
    });
    if (tgt) {
      const d = tgt.station.s - ph.s;
      g.fillStyle = '#ffd24a'; g.font = `700 26px ${FONT}`;
      g.fillText(`停止位置まで ${d > 1000 ? (d / 1000).toFixed(2) + ' km' : Math.max(0, d).toFixed(0) + ' m'}`, 22, H - 34);
    }
  }

  drawMonitor({ g, c }, ph, route) {
    const W = c.width, H = c.height;
    g.fillStyle = '#141a2a'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'middle'; g.textAlign = 'center';
    // notch position
    g.fillStyle = '#cfd5de'; g.font = `700 20px ${FONT}`; g.fillText('ノッチ', W * 0.22, 32);
    const label = ph.notchLabel();
    g.fillStyle = ph.handle > 0 ? '#5fe07a' : ph.handle < 0 ? (label === 'EB' ? '#ff4545' : '#ffb03a') : '#ffffff';
    g.font = `700 72px ${FONT}`; g.fillText(label, W * 0.22, 110);
    // ATS-P state + current limit
    g.fillStyle = '#cfd5de'; g.font = `700 20px ${FONT}`; g.fillText('ATS-P', W * 0.68, 32);
    g.fillStyle = ph.ats.braking ? '#ff4545' : ph.ats.near ? '#ffb03a' : '#2b8a3e';
    g.fillRect(W * 0.48, 52, W * 0.40, 56);
    g.fillStyle = '#ffffff'; g.font = `700 28px ${FONT}`;
    g.fillText(ph.ats.braking ? 'ブレーキ動作' : ph.ats.near ? 'パターン接近' : '正常', W * 0.68, 80);
    const lim = route.limitOverTrain(ph.s, ph.len);
    g.fillStyle = '#cfd5de'; g.font = `700 20px ${FONT}`; g.fillText('制限速度', W * 0.5, 170);
    g.fillStyle = '#ffffff'; g.font = `700 56px ${FONT}`; g.fillText(`${Math.min(lim, ph.veh.maxSpeed)} km/h`, W * 0.5, 225);
    g.fillStyle = ph.doorsOpen ? '#ffd24a' : '#3c4454'; g.font = `700 24px ${FONT}`;
    g.fillText(ph.doorsOpen ? '戸 開' : '戸 閉', W * 0.5, 310);
  }

  dispose() {
    for (const k in this.screens) { this.screens[k].t.dispose(); this.screens[k].mat.dispose(); }
  }
}
