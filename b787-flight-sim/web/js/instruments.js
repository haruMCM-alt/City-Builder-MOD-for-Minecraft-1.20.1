// Boeing-style glass cockpit displays (PFD, ND, EICAS) and the head-up display.
import * as THREE from 'three';
import { DEG, RAD, KT, FT, FPM, clamp, wrap360, wrap180, headingVec } from './util.js';
import { FLAPS } from './flightmodel.js';
import { AUTOBRAKE } from './systems.js';

const C = {
  white: '#f2f5f8', green: '#3dff6e', magenta: '#ff4dff', cyan: '#4fe3ff', amber: '#ffb000', red: '#ff3b30',
  sky: '#1d6fc9', ground: '#8a5a2b', grey: '#5d6670', dark: '#1a1f26', black: '#000',
};
const MONO = '"DejaVu Sans Mono", "Liberation Mono", Consolas, monospace';

function font(ctx, size, weight = 'normal') { ctx.font = `${weight} ${size}px ${MONO}`; }
function text(ctx, s, x, y, col, size = 22, align = 'center', base = 'middle', weight = 'normal') {
  font(ctx, size, weight); ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y);
}
function line(ctx, x1, y1, x2, y2, col, w = 2) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function box(ctx, x, y, w, h, col, lw = 2) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); }

export class Instruments {
  constructor(pfd, nd, eicas, hud, world) {
    this.pfd = pfd; this.nd = nd; this.eicas = eicas; this.hud = hud;
    this.world = world;
    this.textures = {};
    for (const [k, c] of Object.entries({ PFD_L: pfd, ND_L: nd, EICAS: eicas, ND_R: nd, PFD_R: pfd })) {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      this.textures[k] = t;
    }
    this._t = 0;
    this.hudOn = true;
    this.iasTrend = 0;
    this._iasPrev = null;
  }

  update(dt, fm, sys, opts) {
    this._t += dt;
    const o = fm.out;
    if (this._iasPrev !== null) this.iasTrend += ((o.ias - this._iasPrev) / Math.max(dt, 1e-3) * 10 - this.iasTrend) * Math.min(1, dt * 2);
    this._iasPrev = o.ias;
    if (this._t > 1 / 20 || opts.force) {
      this._t = 0;
      if (opts.panel || opts.cockpit) {
        this.drawPFD(this.pfd.getContext('2d'), fm, sys);
        this.drawND(this.nd.getContext('2d'), fm, sys);
        this.drawEICAS(this.eicas.getContext('2d'), fm, sys);
        for (const t of Object.values(this.textures)) t.needsUpdate = true;
      }
    }
  }

  // =========================================================================== PFD
  drawPFD(ctx, fm, sys) {
    const o = fm.out, W = 600;
    ctx.save();
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, W);
    const cx = 300, cy = 292, ppd = 7.2;   // pixels per degree of pitch
    // ---- attitude -------------------------------------------------------------
    ctx.save();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(150, 105, 300, 370, 26) : ctx.rect(150, 105, 300, 370);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-o.bank * DEG);
    const py = o.pitch * ppd;
    ctx.fillStyle = C.sky; ctx.fillRect(-500, -900 + py, 1000, 900);
    ctx.fillStyle = C.ground; ctx.fillRect(-500, py, 1000, 900);
    line(ctx, -500, py, 500, py, C.white, 2);
    for (let p = -30; p <= 30; p += 2.5) {
      if (p === 0) continue;
      const y = py - p * ppd;
      const major = p % 10 === 0, mid = p % 5 === 0;
      const w = major ? 70 : mid ? 38 : 18;
      line(ctx, -w, y, w, y, C.white, 2);
      if (major) { text(ctx, Math.abs(p), -w - 22, y, C.white, 18); text(ctx, Math.abs(p), w + 22, y, C.white, 18); }
    }
    ctx.restore();
    // bank scale
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = C.white; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 165, (-90 - 60) * DEG, (-90 + 60) * DEG); ctx.stroke();
    for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
      const r1 = 165, r2 = Math.abs(a) % 30 === 0 ? 185 : 175;
      const t = (a - 90) * DEG;
      line(ctx, Math.cos(t) * r1, Math.sin(t) * r1, Math.cos(t) * r2, Math.sin(t) * r2, C.white, 2);
    }
    ctx.fillStyle = C.white;
    ctx.beginPath(); ctx.moveTo(0, -166); ctx.lineTo(-9, -182); ctx.lineTo(9, -182); ctx.closePath(); ctx.fill();
    ctx.rotate(-o.bank * DEG);
    const bankCol = Math.abs(o.bank) > 35 ? C.amber : C.white;
    ctx.fillStyle = bankCol;
    ctx.beginPath(); ctx.moveTo(0, -163); ctx.lineTo(-11, -145); ctx.lineTo(11, -145); ctx.closePath(); ctx.fill();
    // slip/skid
    const slip = clamp(o.beta * RAD * 4, -24, 24);
    ctx.fillRect(-14 + slip, -141, 28, 6);
    ctx.restore();
    // flight path vector
    const drift = wrap180(o.track - o.hdg);
    const fpvX = cx + clamp(drift, -12, 12) * ppd;
    const fpvY = cy - (o.fpa - o.pitch) * ppd;
    ctx.save();
    ctx.translate(fpvX, fpvY); ctx.rotate(-o.bank * DEG);
    ctx.strokeStyle = C.green; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
    line(ctx, -26, 0, -9, 0, C.green, 2.5); line(ctx, 9, 0, 26, 0, C.green, 2.5); line(ctx, 0, -9, 0, -19, C.green, 2.5);
    ctx.restore();
    // flight director
    if (sys.fdOn && (sys.ap.on || fm.out.wow === false)) {
      const fdP = clamp(sys.fd.pitch * ppd, -120, 120), fdR = clamp(sys.fd.roll * 3.2, -120, 120);
      line(ctx, cx - 110, cy - fdP, cx + 110, cy - fdP, C.magenta, 3);
      line(ctx, cx + fdR, cy - 110, cx + fdR, cy + 110, C.magenta, 3);
    }
    // aircraft symbol
    ctx.fillStyle = C.black; ctx.strokeStyle = C.white; ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      ctx.fillRect(cx + s * 60 - (s > 0 ? 0 : 50), cy - 5, 50, 10);
      ctx.strokeRect(cx + s * 60 - (s > 0 ? 0 : 50), cy - 5, 50, 10);
    }
    ctx.fillRect(cx - 5, cy - 5, 10, 10); ctx.strokeRect(cx - 5, cy - 5, 10, 10);
    // ILS deviation
    const d = sys.ilsDev;
    if (sys.ils && d.valid) {
      text(ctx, 'ILS ' + sys.ils.ident + '  ' + sys.ils.ils.freq, 160, 92, C.white, 17, 'left');
      text(ctx, 'DME ' + Math.max(0, d.dme).toFixed(1), 160, 112, C.white, 17, 'left');
      // localizer (bottom)
      for (const k of [-2, -1, 1, 2]) { ctx.strokeStyle = C.white; ctx.beginPath(); ctx.arc(cx + k * 45, 452, 5, 0, 7); ctx.stroke(); }
      line(ctx, cx, 442, cx, 462, C.white, 2);
      const lx = cx + clamp(-d.loc / 1.25 * 45 * 1, -100, 100);
      ctx.fillStyle = C.magenta;
      ctx.beginPath(); ctx.moveTo(lx, 443); ctx.lineTo(lx + 11, 452); ctx.lineTo(lx, 461); ctx.lineTo(lx - 11, 452); ctx.closePath(); ctx.fill();
      if (d.gsValid) {
        for (const k of [-2, -1, 1, 2]) { ctx.strokeStyle = C.white; ctx.beginPath(); ctx.arc(466, cy + k * 45, 5, 0, 7); ctx.stroke(); }
        line(ctx, 456, cy, 476, cy, C.white, 2);
        const gy = cy + clamp(d.gs / 0.35 * 45, -100, 100);
        ctx.beginPath(); ctx.moveTo(466, gy - 11); ctx.lineTo(475, gy); ctx.lineTo(466, gy + 11); ctx.lineTo(457, gy); ctx.closePath(); ctx.fill();
      }
    }
    // radio altitude
    if (o.raFt < 2500) {
      const col = o.raFt < 200 && fm.ctl.gearPos < 0.5 ? C.amber : C.white;
      text(ctx, Math.round(o.raFt < 100 ? o.raFt : o.raFt / 10 * 10).toString(), cx, 420, col, 26, 'center', 'middle', 'bold');
    }
    // ---- speed tape -------------------------------------------------------------------
    const vs = sys.vspeeds();
    this.tape(ctx, 18, 105, 104, 370, o.ias, 90, 10, 20, (v) => Math.round(v), true, (y0, pxPer, cur) => {
      // max speed barber pole & min speed bands
      const vmax = Math.min(350, sys.flapLever > 0 ? vs.vfe : 350, o.mach > 0.01 ? o.ias * 0.90 / o.mach : 350);
      const yMax = y0 - (vmax - cur) * pxPer;
      ctx.save();
      for (let y = Math.max(105, yMax - 400); y < Math.min(475, yMax); y += 16) {
        ctx.fillStyle = C.red; ctx.fillRect(108, y, 12, 8); ctx.fillStyle = C.white; ctx.fillRect(108, y + 8, 12, 8);
      }
      ctx.restore();
      if (!fm.out.wow) {
        const yShk = y0 - (vs.stickShaker - cur) * pxPer;
        for (let y = yShk; y < 475; y += 16) { ctx.fillStyle = C.red; ctx.fillRect(108, y, 12, 8); ctx.fillStyle = C.black; ctx.fillRect(108, y + 8, 12, 8); }
        const yMin = y0 - (vs.minMan - cur) * pxPer;
        ctx.fillStyle = C.amber; ctx.fillRect(112, yMin, 4, Math.max(0, yShk - yMin));
      }
      // bugs
      const bug = (v, label, col) => {
        const y = y0 - (v - cur) * pxPer;
        if (y < 105 || y > 475) return;
        line(ctx, 102, y, 118, y, col, 3);
        text(ctx, label, 124, y, col, 16, 'left');
      };
      if (fm.out.wow || o.raFt < 50) { bug(vs.v1, 'V1', C.green); bug(vs.vr, 'VR', C.green); bug(vs.v2, 'V2', C.green); }
      else bug(vs.vref30, 'REF', C.green);
      const ySel = y0 - (sys.mcp.spd - cur) * pxPer;
      ctx.fillStyle = C.magenta;
      const ys = clamp(ySel, 105, 475);
      ctx.beginPath(); ctx.moveTo(104, ys); ctx.lineTo(122, ys - 12); ctx.lineTo(122, ys + 12); ctx.closePath(); ctx.fill();
      // trend vector
      const ty = y0 - this.iasTrend * pxPer;
      line(ctx, 100, y0, 100, ty, C.green, 3);
    });
    text(ctx, (sys.at.on ? '' : '') + Math.round(sys.mcp.spd), 70, 88, C.magenta, 22);
    text(ctx, o.mach >= 0.4 ? '.' + Math.round(o.mach * 1000).toString().padStart(3, '0') : 'GS ' + Math.round(o.gs), 70, 495, C.white, 20);
    // ---- altitude tape -----------------------------------------------------------------
    this.tape(ctx, 480, 105, 96, 370, o.altFt, 700, 100, 200, (v) => Math.round(v), false, (y0, pxPer, cur) => {
      const ySel = y0 - (sys.mcp.alt - cur) * pxPer;
      const ys = clamp(ySel, 105, 475);
      ctx.fillStyle = C.magenta;
      ctx.fillRect(480, ys - 12, 8, 24);
      // ground reference
      const yG = y0 - (-cur + (o.altFt - o.raFt)) * pxPer;
      if (yG < 475) { ctx.fillStyle = '#b8792f'; ctx.fillRect(480, Math.max(yG, 105), 10, 475 - Math.max(yG, 105)); }
    });
    text(ctx, Math.round(sys.mcp.alt).toString(), 528, 88, C.magenta, 22);
    text(ctx, 'STD', 528, 495, C.cyan, 18);
    // VSI
    const vsFpm = o.vs / FPM;
    ctx.fillStyle = C.dark; ctx.fillRect(578, 150, 20, 280);
    const vsy = (v) => 290 - Math.sign(v) * Math.min(Math.sqrt(Math.abs(v) / 6000), 1) * 130;
    for (const v of [-6000, -2000, -1000, 0, 1000, 2000, 6000]) line(ctx, 578, vsy(v), 588, vsy(v), C.white, 1.5);
    line(ctx, 598, 290, 580, vsy(vsFpm), C.white, 3);
    if (Math.abs(vsFpm) > 400) text(ctx, Math.round(vsFpm / 50) * 50, 588, vsFpm > 0 ? 138 : 442, C.white, 14);
    // ---- heading ----------------------------------------------------------------------------
    ctx.save();
    ctx.beginPath(); ctx.rect(150, 510, 300, 90); ctx.clip();
    ctx.translate(cx, 700);
    ctx.fillStyle = '#20252c'; ctx.beginPath(); ctx.arc(0, 0, 185, 0, Math.PI * 2); ctx.fill();
    for (let h = 0; h < 360; h += 5) {
      const a = (h - o.hdg - 90) * DEG;
      const r2 = h % 10 === 0 ? 168 : 176;
      line(ctx, Math.cos(a) * 185, Math.sin(a) * 185, Math.cos(a) * r2, Math.sin(a) * r2, C.white, 2);
      if (h % 30 === 0) {
        ctx.save(); ctx.rotate(a + Math.PI / 2);
        text(ctx, (h / 10).toString(), 0, -152, C.white, 18);
        ctx.restore();
      }
    }
    const hb = (sys.mcp.hdg - o.hdg - 90) * DEG;
    ctx.fillStyle = C.magenta;
    ctx.save(); ctx.rotate(hb + Math.PI / 2); ctx.fillRect(-9, -192, 18, 10); ctx.restore();
    const tk = (o.track - o.hdg - 90) * DEG;
    line(ctx, Math.cos(tk) * 60, Math.sin(tk) * 60, Math.cos(tk) * 185, Math.sin(tk) * 185, C.green, 2);
    ctx.restore();
    ctx.fillStyle = C.black; ctx.fillRect(cx - 34, 505, 68, 28); box(ctx, cx - 34, 505, 68, 28, C.white);
    text(ctx, String(Math.round(o.hdg) % 360 || 360).padStart(3, '0'), cx, 520, C.white, 22);
    text(ctx, 'MAG', cx + 60, 520, C.green, 15);
    // ---- FMA ----------------------------------------------------------------------------------
    ctx.fillStyle = '#0c0f13'; ctx.fillRect(150, 8, 300, 62);
    line(ctx, 250, 10, 250, 66, C.grey, 1.5); line(ctx, 350, 10, 350, 66, C.grey, 1.5);
    const at = sys.at.on ? (sys.at.mode === 'SPD' ? 'SPD' : sys.at.mode === 'TOGA' ? 'THR REF' : sys.at.mode) : '';
    const roll = sys.ap.on || sys.fdOn ? ({ HDG: 'HDG SEL', LOC: 'LOC', ROLLOUT: 'ROLLOUT', ATT: 'ATT' }[sys.ap.roll] || '') : '';
    const pitch = sys.ap.on || sys.fdOn ? ({ ALT: 'ALT', VS: 'V/S', FLCH: 'FLCH SPD', GS: 'G/S', FLARE: 'FLARE', ROLLOUT: '' }[sys.ap.pitch] || '') : '';
    text(ctx, at, 200, 26, C.green, 20);
    text(ctx, sys.ap.on ? roll : '', 300, 26, C.green, 20);
    text(ctx, sys.ap.on ? pitch : '', 400, 26, C.green, 20);
    if (sys.ap.armed.loc) text(ctx, 'LOC', 300, 52, C.white, 17);
    if (sys.ap.armed.gs) text(ctx, 'G/S', 400, 52, C.white, 17);
    text(ctx, sys.ap.on ? 'A/P' : (sys.fdOn ? 'FLT DIR' : ''), 300, 88, C.green, 20, 'center', 'middle', 'bold');
    // warnings on the PFD
    const WN = sys.warn;
    if (WN.stall) text(ctx, 'STALL', cx, 170, C.red, 30, 'center', 'middle', 'bold');
    else if (WN.pullUp) text(ctx, 'PULL UP', cx, 170, C.red, 30, 'center', 'middle', 'bold');
    else if (WN.overspeed) text(ctx, 'OVERSPEED', cx, 170, C.red, 26, 'center', 'middle', 'bold');
    ctx.restore();
  }

  tape(ctx, x, y, w, h, value, span, minor, major, fmt, left, extra) {
    const y0 = y + h / 2;
    const pxPer = h / span;
    ctx.save();
    ctx.fillStyle = '#3a4048'; ctx.fillRect(x, y, w, h);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const start = Math.floor((value - span / 2) / minor) * minor;
    for (let v = start; v <= value + span / 2; v += minor) {
      if (left && v < 30) continue;
      const yy = y0 - (v - value) * pxPer;
      const isMaj = Math.round(v) % major === 0;
      if (left) {
        line(ctx, x + w - 14, yy, x + w, yy, C.white, 2);
        if (isMaj) text(ctx, fmt(v), x + w - 20, yy, C.white, 20, 'right');
      } else {
        line(ctx, x, yy, x + 14, yy, C.white, 2);
        if (isMaj) text(ctx, fmt(v), x + 20, yy, C.white, 18, 'left');
      }
    }
    if (extra) extra(y0, pxPer, value);
    ctx.restore();
    // readout box
    ctx.fillStyle = C.black;
    const bw = left ? w - 8 : w + 2;
    const bx = left ? x + 2 : x - 2;
    ctx.fillRect(bx, y0 - 22, bw, 44); box(ctx, bx, y0 - 22, bw, 44, C.white, 2);
    const s = left ? Math.round(value).toString() : Math.round(value).toString();
    text(ctx, s, bx + bw / 2, y0, C.white, left ? 28 : 24, 'center', 'middle', 'bold');
  }

  // =========================================================================== ND
  drawND(ctx, fm, sys) {
    const o = fm.out, W = 600;
    ctx.save();
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, W);
    const cx = 300, cy = 470, R = 400;
    const range = o.altFt < 4000 ? 10 : o.altFt < 12000 ? 20 : o.altFt < 25000 ? 40 : 80;     // nm
    const ppm = R / (range * 1852);
    const hdg = o.hdg;
    const toScreen = (x, z) => {
      // heading-up map: project onto the aircraft's forward / right axes
      const dx = x - fm.pos.x, dz = z - fm.pos.z;
      const hx = Math.sin(hdg * DEG), hz = -Math.cos(hdg * DEG);
      const fwd = dx * hx + dz * hz;
      const right = dx * -hz + dz * hx;
      return [cx + right * ppm, cy - fwd * ppm];
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 40, 600, 560); ctx.clip();
    // range rings
    ctx.strokeStyle = '#6b7480'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.arc(cx, cy, R / 2, Math.PI, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
    // runways + ILS course lines
    const rw = this.world?.runways || [];
    for (const r of rw) {
      const t = r.threshold, dir = headingVec(r.heading);
      const endx = t[0] + dir.x * r.length, endz = t[2] + dir.z * r.length;
      const [ax, ay] = toScreen(t[0], t[2]); const [bx, by] = toScreen(endx, endz);
      line(ctx, ax, ay, bx, by, C.white, Math.max(3, 60 * ppm));
      if (sys.ils === r) {
        const fx = t[0] - dir.x * 15 * 1852, fz = t[2] - dir.z * 15 * 1852;
        const [qx, qy] = toScreen(fx, fz);
        ctx.setLineDash([12, 10]); line(ctx, ax, ay, qx, qy, C.magenta, 2); ctx.setLineDash([]);
      }
    }
    // airport symbol + name
    const [apx, apy] = toScreen(0, 0);
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(apx, apy, 9, 0, 7); ctx.stroke();
    text(ctx, 'RJCB', apx + 14, apy - 14, C.cyan, 16, 'left');
    // landmark tower
    if (this.world?.landmarkTower) {
      const [lx, ly] = toScreen(this.world.landmarkTower[0], this.world.landmarkTower[2]);
      ctx.fillStyle = C.amber; ctx.beginPath(); ctx.moveTo(lx, ly - 8); ctx.lineTo(lx + 6, ly + 5); ctx.lineTo(lx - 6, ly + 5); ctx.fill();
    }
    // track line
    const tk = wrap180(o.track - hdg) * DEG;
    ctx.setLineDash([10, 8]);
    line(ctx, cx, cy, cx + Math.sin(tk) * R, cy - Math.cos(tk) * R, C.white, 1.5);
    ctx.setLineDash([]);
    ctx.restore();
    // compass arc
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = C.white; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85); ctx.stroke();
    for (let h = 0; h < 360; h += 5) {
      const a = wrap180(h - hdg);
      if (Math.abs(a) > 48) continue;
      const t = (a - 90) * DEG;
      const r2 = h % 10 === 0 ? R - 18 : R - 10;
      line(ctx, Math.cos(t) * R, Math.sin(t) * R, Math.cos(t) * r2, Math.sin(t) * r2, C.white, 2);
      if (h % 30 === 0) {
        ctx.save(); ctx.rotate(t + Math.PI / 2); text(ctx, (h / 10).toString(), 0, -R + 32, C.white, 20); ctx.restore();
      }
    }
    const hb = (wrap180(sys.mcp.hdg - hdg) - 90) * DEG;
    ctx.fillStyle = C.magenta;
    ctx.save(); ctx.rotate(hb + Math.PI / 2); ctx.fillRect(-10, -R - 4, 20, 12); ctx.restore();
    ctx.restore();
    // aircraft symbol
    ctx.strokeStyle = C.white; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy - 22); ctx.lineTo(cx - 14, cy + 16); ctx.lineTo(cx + 14, cy + 16); ctx.closePath(); ctx.stroke();
    // header
    ctx.fillStyle = '#0c0f13'; ctx.fillRect(0, 0, 600, 40);
    text(ctx, 'GS', 12, 20, C.white, 16, 'left'); text(ctx, Math.round(o.gs), 42, 20, C.white, 22, 'left');
    text(ctx, 'TAS', 100, 20, C.white, 16, 'left'); text(ctx, Math.round(o.tas / KT), 138, 20, C.white, 22, 'left');
    const wind = fm.wind;
    const ws = Math.hypot(wind.x, wind.z) / KT;
    const wdir = wrap360(Math.atan2(-wind.x, wind.z) * RAD);
    text(ctx, `${String(Math.round(wdir)).padStart(3, '0')}°/${Math.round(ws)}`, 12, 58, C.white, 18, 'left');
    if (ws > 1) {
      ctx.save(); ctx.translate(40, 90); ctx.rotate((wdir + 180 - hdg) * DEG);
      line(ctx, 0, -16, 0, 16, C.white, 3);
      ctx.fillStyle = C.white; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(-7, 8); ctx.lineTo(7, 8); ctx.fill();
      ctx.restore();
    }
    text(ctx, 'TRK ' + String(Math.round(o.track)).padStart(3, '0') + ' MAG', 300, 20, C.green, 20);
    text(ctx, range + ' NM', 588, 20, C.white, 16, 'right');
    if (sys.ils) {
      text(ctx, 'RWY ' + sys.ils.ident, 588, 58, C.magenta, 18, 'right');
      const d = sys.ilsDev;
      if (d.valid) text(ctx, Math.max(0, d.dme).toFixed(1) + ' NM', 588, 80, C.white, 18, 'right');
    }
    ctx.restore();
  }

  // =========================================================================== EICAS
  drawEICAS(ctx, fm, sys) {
    const W = 600;
    ctx.save();
    ctx.fillStyle = C.black; ctx.fillRect(0, 0, W, W);
    const dial = (x, y, r, val, max, redline, label, digits, cmd) => {
      const a0 = -Math.PI * 1.0, span = Math.PI * 1.15;
      ctx.strokeStyle = C.white; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + span * (redline / max)); ctx.stroke();
      ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(x, y, r, a0 + span * (redline / max), a0 + span); ctx.stroke();
      const f = clamp(val / max, 0, 1.05);
      ctx.fillStyle = 'rgba(200,210,220,0.18)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r - 2, a0, a0 + span * f); ctx.closePath(); ctx.fill();
      const a = a0 + span * f;
      line(ctx, x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, C.white, 3);
      if (cmd !== undefined) {
        const ac = a0 + span * clamp(cmd / max, 0, 1.05);
        ctx.fillStyle = C.green; ctx.beginPath();
        ctx.arc(x + Math.cos(ac) * (r + 8), y + Math.sin(ac) * (r + 8), 4, 0, 7); ctx.fill();
      }
      ctx.fillStyle = C.black; ctx.fillRect(x + 4, y - r * 0.55 - 16, r * 1.05, 32);
      box(ctx, x + 4, y - r * 0.55 - 16, r * 1.05, 32, C.white, 1.5);
      text(ctx, digits, x + 4 + r * 0.52, y - r * 0.55, C.white, 22, 'center', 'middle', 'bold');
      text(ctx, label, x, y + 22, C.cyan, 15);
    };
    text(ctx, 'TO', 300, 18, C.green, 16);
    for (let i = 0; i < 2; i++) {
      const e = fm.engines[i];
      const x = 150 + i * 190;
      dial(x, 95, 62, e.n1, 110, 104, 'N1', e.n1.toFixed(1), sys.tla[i] * 100);
      dial(x, 220, 48, e.egt, 1100, 1060, 'EGT', Math.round(e.egt).toString());
      text(ctx, 'N2 ' + e.n2.toFixed(1), x, 290, C.white, 17);
      text(ctx, 'FF ' + (e.ff * 3.6).toFixed(1), x, 312, C.white, 17);
      if (e.reverse > 0.1) text(ctx, 'REV', x, 40, e.reverse > 0.9 ? C.green : C.amber, 18, 'center', 'middle', 'bold');
    }
    // fuel / weight
    text(ctx, 'FUEL', 70, 360, C.cyan, 16, 'left'); text(ctx, (fm.fuel / 1000).toFixed(1) + ' t', 140, 360, C.white, 20, 'left');
    text(ctx, 'GW', 70, 386, C.cyan, 16, 'left'); text(ctx, (fm.mass / 1000).toFixed(1) + ' t', 140, 386, C.white, 20, 'left');
    text(ctx, 'STAB', 70, 412, C.cyan, 16, 'left'); text(ctx, (fm.ctl.stab / DEG).toFixed(1), 140, 412, C.white, 20, 'left');
    text(ctx, 'A/B', 70, 438, C.cyan, 16, 'left'); text(ctx, AUTOBRAKE[sys.autobrake], 140, 438, sys.autobrakeActive ? C.green : C.white, 20, 'left');
    // flaps
    const fa = fm.ctl.flapAngle;
    text(ctx, 'FLAPS', 470, 350, C.cyan, 16);
    box(ctx, 455, 362, 30, 150, C.white, 1.5);
    ctx.fillStyle = C.green; ctx.fillRect(457, 364, 26, 146 * clamp(fa / 30, 0, 1));
    const lever = FLAPS[sys.flapLever];
    const ly = 364 + 146 * lever.angle / 30;
    line(ctx, 445, ly, 495, ly, C.magenta, 3);
    text(ctx, lever.name, 530, ly, Math.abs(fa - lever.angle) < 0.2 ? C.green : C.magenta, 20);
    // gear
    const gp = fm.ctl.gearPos;
    const gs = gp < 0.01 ? ['DOWN', C.green] : gp > 0.99 ? ['UP', C.white] : ['TRANSIT', C.amber];
    text(ctx, 'GEAR', 330, 350, C.cyan, 16);
    ctx.fillStyle = gp < 0.01 ? '#0b3d1a' : gp > 0.99 ? '#111' : '#3d2a00';
    ctx.fillRect(280, 362, 100, 32); box(ctx, 280, 362, 100, 32, gs[1], 2);
    text(ctx, gs[0], 330, 378, gs[1], 18, 'center', 'middle', 'bold');
    // speedbrake
    const sbTxt = fm.ctl.groundSpoiler > 0.1 ? 'GND SPLR' : fm.ctl.speedbrake > 0.02 ? 'SPDBRK EXT' : sys.speedbrakeArmed ? 'SPDBRK ARMED' : '';
    if (sbTxt) text(ctx, sbTxt, 330, 420, sbTxt.includes('ARMED') ? C.green : C.amber, 17);
    // alert messages
    const msgs = [];
    const W8 = sys.warn;
    if (fm.crashed) msgs.push(['CRASH', C.red]);
    if (W8.stall) msgs.push(['STALL', C.red]);
    if (W8.overspeed) msgs.push(['OVERSPEED', C.red]);
    if (W8.config) msgs.push(['CONFIG ' + (fm.ctl.parkingBrake ? 'PARKING BRAKE' : 'FLAPS'), C.red]);
    if (fm.ctl.parkingBrake) msgs.push(['PARKING BRAKE SET', C.amber]);
    if (fm.ctl.speedbrake > 0.05 && fm.out.raFt < 800) msgs.push(['SPEEDBRAKE EXTENDED', C.amber]);
    if (!sys.ap.on && sys._apWasOn) msgs.push(['AUTOPILOT DISC', C.amber]);
    if (sys.lawDirect) msgs.push(['FLIGHT CONTROLS DIRECT', C.amber]);
    if (fm.fuel < 3000) msgs.push(['FUEL QTY LOW', C.amber]);
    if (fm.ctl.pushback) msgs.push(['PUSHBACK', C.cyan]);
    msgs.slice(0, 6).forEach(([m, c], i) => text(ctx, m, 290, 470 + i * 22, c, 17, 'center'));
    ctx.restore();
  }

  // =========================================================================== HUD
  drawHUD(ctx, fm, sys, camera, w, h) {
    ctx.clearRect(0, 0, w, h);
    if (!this.hudOn) return;
    const o = fm.out;
    const col = 'rgba(110, 255, 140, 0.92)';
    const colDim = 'rgba(110, 255, 140, 0.6)';
    const P = new THREE.Vector3();
    const proj = (dir) => {
      P.copy(camera.position).addScaledVector(dir, 1000).project(camera);
      if (P.z > 1) return null;
      return [(P.x * 0.5 + 0.5) * w, (-P.y * 0.5 + 0.5) * h];
    };
    const dirHP = (hdg, pitch) => {
      const hr = hdg * DEG, pr = pitch * DEG;
      return new THREE.Vector3(Math.sin(hr) * Math.cos(pr), Math.sin(pr), -Math.cos(hr) * Math.cos(pr));
    };
    ctx.save();
    ctx.shadowColor = 'rgba(80,255,120,0.6)'; ctx.shadowBlur = 6;
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.fillStyle = col;
    // horizon + pitch ladder (conformal)
    const hd = o.hdg;
    const seg = (p1, p2, dash) => {
      if (!p1 || !p2) return;
      ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); ctx.setLineDash([]);
    };
    seg(proj(dirHP(hd - 25, 0)), proj(dirHP(hd - 3, 0)));
    seg(proj(dirHP(hd + 3, 0)), proj(dirHP(hd + 25, 0)));
    for (let hh = Math.ceil((hd - 20) / 10) * 10; hh <= hd + 20; hh += 10) {
      const p = proj(dirHP(hh, 0));
      if (p) { seg(p, [p[0], p[1] + 10]); text(ctx, String(wrap360(hh) / 10 | 0).padStart(2, '0'), p[0], p[1] + 24, col, 15); }
    }
    for (let pt = -20; pt <= 25; pt += 5) {
      if (pt === 0) continue;
      const a = proj(dirHP(hd - 6, pt)), b = proj(dirHP(hd - 2, pt)), c2 = proj(dirHP(hd + 2, pt)), d = proj(dirHP(hd + 6, pt));
      const dash = pt < 0 ? [8, 6] : null;
      seg(a, b, dash); seg(c2, d, dash);
      if (a) text(ctx, Math.abs(pt), a[0] - 20, a[1], colDim, 14);
    }
    // flight path vector
    const vel = new THREE.Vector3(fm.vel.x, fm.vel.y, fm.vel.z);
    if (vel.length() > 15) {
      const fp = proj(vel.normalize());
      if (fp) {
        ctx.beginPath(); ctx.arc(fp[0], fp[1], 9, 0, 7); ctx.stroke();
        seg([fp[0] - 26, fp[1]], [fp[0] - 9, fp[1]]); seg([fp[0] + 9, fp[1]], [fp[0] + 26, fp[1]]); seg([fp[0], fp[1] - 9], [fp[0], fp[1] - 18]);
        // guidance cue (flight director)
        if (sys.fdOn && !o.wow) {
          const gx = fp[0] + clamp(sys.fd.roll * 2.2, -80, 80);
          const gy = fp[1] - clamp(sys.fd.pitch * 12, -80, 80);
          ctx.beginPath(); ctx.arc(gx, gy, 6, 0, 7); ctx.stroke();
        }
        // acceleration chevron
        const acc = this.iasTrend / 10 * KT / 9.81;
        seg([fp[0] - 34, fp[1] - acc * 60], [fp[0] - 40, fp[1] - acc * 60 - 5]);
        if (o.raFt < 300 && sys.ils) {
          // -3 deg reference line
          const r = proj(dirHP(o.track, -3));
          if (r) seg([r[0] - 40, r[1]], [r[0] + 40, r[1]], [10, 8]);
        }
      }
    }
    // speed / altitude readouts
    const cx = w / 2, cy = h / 2;
    ctx.strokeRect(cx - 290, cy - 16, 80, 32);
    text(ctx, Math.round(o.ias), cx - 250, cy, col, 22, 'center', 'middle', 'bold');
    text(ctx, (o.mach >= 0.4 ? 'M ' + o.mach.toFixed(3) : 'GS ' + Math.round(o.gs)), cx - 250, cy + 34, col, 15);
    text(ctx, 'SPD ' + Math.round(sys.mcp.spd), cx - 250, cy - 34, col, 15);
    ctx.strokeRect(cx + 210, cy - 16, 90, 32);
    text(ctx, Math.round(o.altFt), cx + 255, cy, col, 22, 'center', 'middle', 'bold');
    text(ctx, (o.vs / FPM >= 0 ? '+' : '') + Math.round(o.vs / FPM / 10) * 10, cx + 255, cy + 34, col, 15);
    text(ctx, 'ALT ' + Math.round(sys.mcp.alt), cx + 255, cy - 34, col, 15);
    if (o.raFt < 2500) text(ctx, Math.round(o.raFt) + 'R', cx + 150, cy + 70, col, 20);
    // FMA
    const fma = [sys.at.on ? sys.at.mode : '', sys.ap.on ? sys.ap.roll : '', sys.ap.on ? sys.ap.pitch : ''].join('   ');
    text(ctx, fma, cx, cy - h * 0.3, col, 17);
    if (sys.ils && sys.ilsDev.valid) {
      text(ctx, 'ILS ' + sys.ils.ident + '  ' + Math.max(0, sys.ilsDev.dme).toFixed(1) + ' NM', cx - 220, cy - h * 0.3, col, 15);
      // deviation scales
      const lx = cx + clamp(-sys.ilsDev.loc / 1.25 * 30, -70, 70);
      ctx.strokeRect(lx - 6, cy + 120, 12, 12);
      for (const k of [-2, -1, 1, 2]) { ctx.beginPath(); ctx.arc(cx + k * 30, cy + 126, 3, 0, 7); ctx.stroke(); }
      if (sys.ilsDev.gsValid) {
        const gy = cy + clamp(sys.ilsDev.gs / 0.35 * 30, -70, 70);
        ctx.strokeRect(cx + 170, gy - 6, 12, 12);
        for (const k of [-2, -1, 1, 2]) { ctx.beginPath(); ctx.arc(cx + 176, cy + k * 30, 3, 0, 7); ctx.stroke(); }
      }
    }
    // bank scale
    ctx.save(); ctx.translate(cx, cy + h * 0.28);
    for (const a of [-30, -20, -10, 0, 10, 20, 30]) { const t = (a + 90) * DEG; seg([Math.cos(t) * 90, Math.sin(t) * 90], [Math.cos(t) * 100, Math.sin(t) * 100]); }
    ctx.rotate(o.bank * DEG);
    ctx.beginPath(); ctx.moveTo(0, 86); ctx.lineTo(-7, 74); ctx.lineTo(7, 74); ctx.closePath(); ctx.stroke();
    ctx.restore();
    const W8 = sys.warn;
    const warnTxt = W8.stall ? 'STALL' : W8.pullUp ? 'PULL UP' : W8.overspeed ? 'OVERSPEED' : W8.sinkRate ? 'SINK RATE' : '';
    if (warnTxt) text(ctx, warnTxt, cx, cy - 70, 'rgba(255,80,60,0.95)', 28, 'center', 'middle', 'bold');
    ctx.restore();
  }
}
