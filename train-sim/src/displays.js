// Canvas-drawn displays: LED destination indicators (dot matrix), roll signs,
// in-car passenger information screens (LED on E231, LCD on E233) and ad posters.
//
// Every texture here is mapped onto glTF UVs, so flipY must be false
// (the glTF loader's convention) - otherwise the text comes out upside down.
import * as THREE from 'three';

export const UI_FONT = '"BIZ UDPGothic","Noto Sans JP","Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif';
export const LED_FONT = '"DotGothic16","BIZ UDPGothic",monospace';

/** wait for the web fonts so the first canvas draws use them */
export async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`700 32px "BIZ UDPGothic"`, '普通宇都宮次は'),
        document.fonts.load(`400 32px "BIZ UDPGothic"`, 'Utsunomiya'),
        document.fonts.load(`400 16px "DotGothic16"`, '普通宇都宮上野'),
      ]),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch { /* fall back to system fonts */ }
}

export function canvasTexture(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 4;
  return { c, g: c.getContext('2d'), t };
}

/**
 * Light-emitting dot matrix: draw `drawFn` onto a low-resolution mask
 * (one pixel per LED), then render each LED as a round dot.
 */
export function dotMatrix(g, x, y, cols, rows, pitch, drawFn) {
  const m = document.createElement('canvas');
  m.width = cols; m.height = rows;
  const mg = m.getContext('2d');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, cols, rows);
  drawFn(mg, cols, rows);
  const px = mg.getImageData(0, 0, cols, rows).data;
  const r = pitch * 0.42;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 4;
      const lum = Math.max(px[k], px[k + 1], px[k + 2]);
      const cx = x + (i + 0.5) * pitch, cy = y + (j + 0.5) * pitch;
      if (lum > 60) {
        g.fillStyle = `rgb(${px[k]},${px[k + 1]},${px[k + 2]})`;
      } else g.fillStyle = '#1a1612';               // unlit LED
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
  }
}

/** front / side destination indicator: full-colour LED (E231/E233) or a roll sign (211/115) */
export function makeDestTexture(text, type = 'led', color = '#ff8a10') {
  const [kind, dest] = text.split(/\s+/);
  if (type === 'roll') {
    const { g, t } = canvasTexture(512, 112);
    g.fillStyle = '#f2f1ea'; g.fillRect(0, 0, 512, 112);
    g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, 512, 6); g.fillRect(0, 106, 512, 6);
    g.fillStyle = '#141414';
    g.font = `700 64px ${UI_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(dest || kind, 256, 52);
    g.font = `400 18px ${UI_FONT}`;
    g.fillText(dest === '宇都宮' ? 'Utsunomiya' : dest === '上野' ? 'Ueno' : '', 256, 94);
    return t;
  }
  const { g, t } = canvasTexture(768, 128);
  g.fillStyle = '#080706'; g.fillRect(0, 0, 768, 128);
  // 128 × 21 LEDs at 6 px pitch
  dotMatrix(g, 0, 1, 128, 21, 6, (mg, cols, rows) => {
    mg.textBaseline = 'middle';
    mg.fillStyle = '#18c048';
    mg.fillRect(1, 1, 33, rows - 2);
    mg.fillStyle = '#ffffff';
    mg.font = `16px ${LED_FONT}`;
    mg.textAlign = 'center';
    mg.fillText(kind || '普通', 17.5, rows / 2 + 1);
    mg.fillStyle = color;
    mg.font = `16px ${LED_FONT}`;
    mg.fillText(dest || '', 82, rows / 2 + 1);
  });
  return t;
}

// ---------------------------------------------------------------------------
// in-car passenger information display (above each door)
// ---------------------------------------------------------------------------
export class InfoDisplay {
  constructor(style) {
    this.style = style;                  // 'lcd' (E233) | 'led' (E231 / others)
    const s = style === 'lcd' ? canvasTexture(640, 228) : canvasTexture(640, 228);
    Object.assign(this, s);
    this.mat = new THREE.MeshBasicMaterial({ map: this.t, toneMapped: false });
    this.phase = 0;
    this.timer = 0;
    this.key = '';
  }

  update(dt, info) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 3.2;
    this.phase = (this.phase + 1) % 3;
    if (this.style === 'lcd') this.drawLCD(info); else this.drawLED(info);
    // black bezel (the box edges sample this)
    this.g.strokeStyle = '#050505'; this.g.lineWidth = 10;
    this.g.strokeRect(0, 0, this.c.width, this.c.height);
    this.t.needsUpdate = true;
  }

  drawLCD(info) {
    const { g, c } = this;
    const W = c.width, H = c.height;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    // header: line colour band with the train
    g.fillStyle = '#f68b1e'; g.fillRect(0, 0, W, 46);
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
    g.font = `700 24px ${UI_FONT}`; g.textAlign = 'left';
    g.fillText(this.phase === 1 ? 'Utsunomiya Line  for Utsunomiya' : '宇都宮線  普通  宇都宮行', 16, 24);
    g.textAlign = 'right'; g.font = `700 22px ${UI_FONT}`;
    g.fillText(info.carNo ? `${info.carNo}号車` : '', W - 16, 24);
    const st = info.next;
    const lbl = info.arriving ? (this.phase === 1 ? 'Arriving at' : 'まもなく') : (this.phase === 1 ? 'Next' : '次は');
    g.fillStyle = '#333'; g.textAlign = 'left'; g.font = `700 30px ${UI_FONT}`;
    g.fillText(lbl, 22, 96);
    g.fillStyle = '#111'; g.textAlign = 'center';
    const name = !st ? '' : this.phase === 1 ? st.en : this.phase === 2 ? st.kana : st.name;
    g.font = `700 ${this.phase === 1 ? 56 : 70}px ${UI_FONT}`;
    g.fillText(name, W * 0.58, 112);
    // door side + time
    g.fillStyle = '#e4e7eb'; g.fillRect(0, H - 52, W, 52);
    g.fillStyle = '#222'; g.font = `700 22px ${UI_FONT}`; g.textAlign = 'left';
    const side = st ? (st.door === 'right' ? (this.phase === 1 ? 'Doors on the right side will open.' : '右側のドアが開きます') : (this.phase === 1 ? 'Doors on the left side will open.' : '左側のドアが開きます')) : '';
    g.fillText(side, 18, H - 26);
    g.textAlign = 'right'; g.fillText(info.clock || '', W - 18, H - 26);
  }

  drawLED(info) {
    const { g, c } = this;
    const W = c.width, H = c.height;
    g.fillStyle = '#070605'; g.fillRect(0, 0, W, H);
    const st = info.next;
    const text = !st ? '' : this.phase === 1 ? `Next  ${st.en}` : info.arriving ? `まもなく ${st.name}` : `次は ${st.name}`;
    // 96 × 24 LEDs at 6.4 px pitch
    dotMatrix(g, 13, 37, 96, 24, 6.4, (mg, cols, rows) => {
      mg.textBaseline = 'middle';
      mg.fillStyle = this.phase === 1 ? '#3cff6a' : '#ff9a1a';
      mg.font = `16px ${LED_FONT}`;
      mg.textAlign = 'center';
      mg.fillText(text, cols / 2, rows / 2 + 1);
    });
  }
}

// ---------------------------------------------------------------------------
// generic (fictional) advertising posters
// ---------------------------------------------------------------------------
const AD_SET = [
  { bg: ['#ffd9a8', '#ff9a5a'], head: '秋の味覚フェア', sub: '駅ナカで旬を味わう', fg: '#5a2a10' },
  { bg: ['#bfe3ff', '#5aa0e0'], head: '週末は温泉へ', sub: 'のんびり列車旅', fg: '#0c2c50' },
  { bg: ['#e8f5d0', '#8cc860'], head: '英会話はじめよう', sub: '今なら入会金0円', fg: '#1f4010' },
  { bg: ['#f5d6ec', '#c86aa8'], head: '新作コミック発売', sub: '全国の書店で', fg: '#4a1036' },
];

export function makeAdTexture(i) {
  const ad = AD_SET[i % AD_SET.length];
  const { g, c, t } = canvasTexture(512, 360);
  const gr = g.createLinearGradient(0, 0, 512, 360);
  gr.addColorStop(0, ad.bg[0]); gr.addColorStop(1, ad.bg[1]);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 360);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(80 + k * 80, 280 - (k % 2) * 40, 40 + (k % 3) * 18, 0, 7); g.fill(); }
  g.fillStyle = ad.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 54px ${UI_FONT}`; g.fillText(ad.head, 256, 110);
  g.font = `400 30px ${UI_FONT}`; g.fillText(ad.sub, 256, 180);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 8; g.strokeRect(4, 4, c.width - 8, c.height - 8);
  return t;
}

/** the second (wide) screen above E233 doors: a generic weather / news panel */
export function makeTvTexture() {
  const { g, c, t } = canvasTexture(640, 228);
  const W = c.width, H = c.height;
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#2d7fd0'); gr.addColorStop(1, '#a8d4f5');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, 44);
  g.fillStyle = '#1b4f8a'; g.font = `700 24px ${UI_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText('きょうの天気', 16, 23);
  const cities = [['大宮', '晴れ', '23℃'], ['小山', '晴れ', '22℃'], ['宇都宮', 'くもり', '21℃']];
  cities.forEach(([n, w, tt], i) => {
    const x = 20 + i * 206;
    g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillRect(x, 62, 190, 140);
    g.fillStyle = '#123'; g.textAlign = 'center';
    g.font = `700 28px ${UI_FONT}`; g.fillText(n, x + 95, 88);
    g.fillStyle = w === '晴れ' ? '#f39a1a' : '#7a8794';
    g.beginPath(); g.arc(x + 60, 140, 22, 0, 7); g.fill();
    g.fillStyle = '#123'; g.font = `400 22px ${UI_FONT}`; g.fillText(w, x + 135, 130);
    g.font = `700 26px ${UI_FONT}`; g.fillText(tt, x + 135, 168);
  });
  g.strokeStyle = '#050505'; g.lineWidth = 10; g.strokeRect(0, 0, W, H);
  return t;
}
