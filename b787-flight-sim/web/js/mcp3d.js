// Live face of the 3-D mode control panel (glareshield).  The Blender model maps the MCP
// face and the tops of its pushbuttons onto one texture; this module paints that texture
// from the autoflight state: speed / heading / V/S / altitude windows, the green mode bars
// on the buttons, and the back-lit legends at night (emissive map).
import * as THREE from 'three';

const W = 2048;

export class MCP3D {
  constructor(layout) {
    this.L = layout;
    this.hw = layout.halfWidth; this.h = layout.height;
    this.H = Math.round(W * this.h / (2 * this.hw));
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = this.H; return c; };
    this.cb = mk(); this.ce = mk();
    this.base = new THREE.CanvasTexture(this.cb); this.base.colorSpace = THREE.SRGBColorSpace; this.base.anisotropy = 8; this.base.flipY = false;
    this.emis = new THREE.CanvasTexture(this.ce); this.emis.colorSpace = THREE.SRGBColorSpace; this.emis.flipY = false;
    this._key = '';
  }

  px(u) { return (u + this.hw) / (2 * this.hw) * W; }
  py(v) { return (1 - v / this.h) * this.H; }
  m(x) { return x / (2 * this.hw) * W; }

  apply(mat) {
    if (!mat) return;
    mat.map = this.base; mat.emissiveMap = this.emis;
    mat.color.set(0xffffff); mat.emissive = new THREE.Color(1, 1, 1); mat.emissiveIntensity = 1;
    mat.roughness = 0.6; mat.metalness = 0;
    mat.needsUpdate = true;
  }

  update(sys, night) {
    const s = sys, ap = s.ap;
    const active = {
      AT: s.at.on, AP_L: ap.on, AP_R: ap.on, FLCH: ap.on && ap.pitch === 'FLCH', VS: ap.on && ap.pitch === 'VS',
      ALT_HOLD: ap.on && ap.pitch === 'ALT', HDG_HOLD: ap.on && ap.roll === 'HDG',
      LOC: (ap.on && ap.roll === 'LOC') || ap.armed.loc, APP: (ap.on && ap.pitch === 'GS') || ap.armed.gs,
      LNAV: false, VNAV: false, CLB_CON: false,
    };
    const vs = ap.on && ap.pitch === 'VS' ? (s.mcp.vs > 0 ? '+' : s.mcp.vs < 0 ? '-' : ' ') + String(Math.abs(Math.round(s.mcp.vs))).padStart(4, ' ') : '';
    const win = {
      IAS: String(Math.round(s.mcp.spd)), HDG: String(Math.round(s.mcp.hdg) % 360 || 360).padStart(3, '0'),
      VS: vs, ALT: String(Math.round(s.mcp.alt)).padStart(5, ' '),
    };
    const lit = Math.round(night * 10) / 10;
    const key = JSON.stringify([active, win, lit]);
    if (key === this._key) return;
    this._key = key;
    this.draw(active, win, lit);
    this.base.needsUpdate = true; this.emis.needsUpdate = true;
  }

  draw(active, win, lit) {
    const b = this.cb.getContext('2d'), e = this.ce.getContext('2d');
    const H = this.H;
    // panel: medium grey with a darker frame
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#50555c'); g.addColorStop(1, '#3f444a');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    b.fillStyle = '#2b2f34'; b.fillRect(0, 0, W, 5); b.fillRect(0, H - 5, W, 5);
    e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
    const legend = `rgba(255,244,220,${lit})`;
    const label = (t, u, v, size = 0.0055, color = '#ecece4') => {
      const f = `bold ${Math.round(this.m(size))}px Arial, Helvetica, sans-serif`;
      b.font = f; b.fillStyle = color; b.textAlign = 'center'; b.textBaseline = 'middle';
      b.fillText(t, this.px(u), this.py(v));
      if (lit > 0.02) { e.font = f; e.fillStyle = legend; e.textAlign = 'center'; e.textBaseline = 'middle'; e.fillText(t, this.px(u), this.py(v)); }
    };
    for (const c of this.L.controls) {
      const u = c.u, v = c.v;
      if (c.kind === 'win') {
        const x0 = this.px(u - c.w / 2), y0 = this.py(v + c.h / 2), w = this.m(c.w), h = this.m(c.h);
        b.fillStyle = '#060708'; b.fillRect(x0, y0, w, h);
        e.fillStyle = '#000'; e.fillRect(x0, y0, w, h);
        const t = win[c.id] ?? '';
        const f = `bold ${Math.round(h * 0.78)}px "Courier New", monospace`;
        for (const ctx of [b, e]) {
          ctx.font = f; ctx.fillStyle = '#f2f2e8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(t, x0 + w / 2, y0 + h / 2 + 1);
        }
        label(c.label, u, v + c.h / 2 + 0.008);
      } else if (c.kind === 'pb') {
        const w = 0.03, h = 0.017;
        const x0 = this.px(u - w / 2), y0 = this.py(v + h / 2), ww = this.m(w), hh = this.m(h);
        b.fillStyle = '#16181b'; b.fillRect(x0, y0, ww, hh);
        // mode bar across the top of the button
        const on = active[c.id];
        b.fillStyle = on ? '#58ff8a' : '#1d2a22';
        b.fillRect(x0 + ww * 0.18, y0 + hh * 0.12, ww * 0.64, hh * 0.16);
        if (on) { e.fillStyle = '#58ff8a'; e.fillRect(x0 + ww * 0.18, y0 + hh * 0.12, ww * 0.64, hh * 0.16); }
        const f = `bold ${Math.round(this.m(0.0048))}px Arial, sans-serif`;
        b.font = f; b.fillStyle = '#e6e6e0'; b.textAlign = 'center'; b.textBaseline = 'middle';
        b.fillText(c.label, x0 + ww / 2, y0 + hh * 0.64);
        if (lit > 0.02) { e.font = f; e.fillStyle = legend; e.textAlign = 'center'; e.textBaseline = 'middle'; e.fillText(c.label, x0 + ww / 2, y0 + hh * 0.64); }
      } else if (c.kind === 'toggle') {
        label(c.label, u, v + 0.03);
        label('ON', u, v + 0.02, 0.0038); label('OFF', u, v - 0.018, 0.0038);
      } else if (c.kind === 'bar') {
        label('A/P DISENGAGE', u, v - 0.016, 0.0045);
      } else if (c.kind === 'knob') {
        // bank angle / IAS-MACH legends around the big knobs
        if (c.id === 'HDG') { label('BANK LIMIT', u, v - 0.026, 0.0038); }
        if (c.id === 'SPD') { label('IAS/MACH', u, v - 0.024, 0.0038); }
        if (c.id === 'ALT') { label('AUTO  1000', u, v - 0.026, 0.0038); }
      } else if (c.kind === 'wheel') {
        label('UP', u, v + 0.019, 0.0038); label('DN', u, v - 0.019, 0.0038);
      }
    }
    // group engravings
    label('A/T ARM', -0.583, 0.07, 0.0045);
    b.strokeStyle = '#d8d8d0'; b.lineWidth = 2;
    for (const [a, c] of [[-0.66, -0.455], [-0.36, -0.16], [-0.14, 0.11], [0.12, 0.43]]) {
      b.beginPath(); b.moveTo(this.px(a), this.py(0.124)); b.lineTo(this.px(c), this.py(0.124)); b.stroke();
    }
  }
}
