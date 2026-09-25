// In-flight entertainment.
//  * every seat-back screen shows a live channel: one shared canvas atlas (4 x 3 tiles) redrawn a
//    few times a second; each screen instance picks its tile through an instanced attribute
//  * "your" seat (the window-seat view) has its own high-resolution monitor with a touch menu:
//    moving map, flight information, four films, music, a tail camera and a small game.
// Channels are drawn in a nominal 320 x 200 space.
import * as THREE from 'three';
import { isWater } from './terrain.js';
import { clamp } from './util.js';

export const CHANNELS = [
  { id: 'map', label: '🗺 マップ', name: 'Moving map' },
  { id: 'info', label: '✈ フライト情報', name: 'Flight info' },
  { id: 'movieA', label: '🎬 空の旅', name: 'Sky Journey' },
  { id: 'movieB', label: '🎬 海の物語', name: 'Ocean Tale' },
  { id: 'movieC', label: '🎬 夜の街', name: 'Night City' },
  { id: 'movieD', label: '🎬 宇宙ねこ', name: 'Space Cat' },
  { id: 'music', label: '🎵 音楽', name: 'Music' },
  { id: 'game', label: '🎮 スターキャッチ', name: 'Star Catcher' },
  { id: 'news', label: '📰 ニュース', name: 'News' },
  { id: 'menu', label: '🏠 ホーム', name: 'Home' },
  { id: 'saver', label: '', name: 'Welcome' },
  { id: 'camera', label: '📷 機外カメラ', name: 'Tail camera' },
];
const TILE = Object.fromEntries(CHANNELS.map((c, i) => [c.id, i]));
const WATCH = ['map', 'map', 'info', 'movieA', 'movieB', 'movieC', 'movieD', 'movieA', 'movieC', 'music', 'game', 'news'];

// ------------------------------------------------------------------ drawing helpers
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function header(c, title, d) {
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, 320, 18);
  c.fillStyle = '#e8eef6'; c.font = 'bold 11px sans-serif'; c.textBaseline = 'middle';
  c.fillText(title, 8, 9);
  c.textAlign = 'right'; c.fillText(d.clock, 312, 9); c.textAlign = 'left';
}

function film(c, t, d, title, dur, subs) {
  const pt = t % dur;
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 186, 320, 14);
  c.fillStyle = '#555'; c.fillRect(40, 192, 240, 3);
  c.fillStyle = '#ffcc55'; c.fillRect(40, 192, 240 * pt / dur, 3);
  c.fillStyle = '#ddd'; c.font = '9px sans-serif'; c.textBaseline = 'middle';
  c.fillText(fmtT(pt), 8, 193); c.textAlign = 'right'; c.fillText(fmtT(dur), 312, 193); c.textAlign = 'left';
  const sub = subs[Math.floor(pt / 6) % subs.length];
  if (sub && (pt % 6) < 4.5) {
    c.font = 'bold 12px sans-serif'; c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(sub, 161, 171); c.fillStyle = '#fff'; c.fillText(sub, 160, 170); c.textAlign = 'left';
  }
  if (pt < 4) { c.fillStyle = `rgba(0,0,0,${0.6 * (1 - pt / 4)})`; c.fillRect(0, 0, 320, 200);
    c.fillStyle = `rgba(255,255,255,${1 - pt / 4})`; c.font = 'bold 22px serif'; c.textAlign = 'center'; c.fillText(title, 160, 96); c.textAlign = 'left'; }
}

const DRAW = {
  map(c, t, d, S) {
    const img = S.mapImg;
    const R = S.mapR;
    if (img) c.drawImage(img, 0, 0, 320, 200);
    else { c.fillStyle = '#1d4e7a'; c.fillRect(0, 0, 320, 200); }
    const X = (x) => 160 + (x - d.cx) / R.w * 320, Yp = (z) => 100 + (z - d.cz) / R.h * 200;
    // route line to the airport and the flown track
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(X(d.x), Yp(d.z)); c.lineTo(X(0), Yp(0)); c.stroke(); c.setLineDash([]);
    if (S.trail.length > 1) {
      c.strokeStyle = '#ffd24a'; c.lineWidth = 2; c.beginPath();
      S.trail.forEach(([x, z], i) => (i ? c.lineTo(X(x), Yp(z)) : c.moveTo(X(x), Yp(z)))); c.stroke(); c.lineWidth = 1;
    }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(X(0), Yp(0), 3, 0, 7); c.fill();
    c.font = 'bold 9px sans-serif'; c.fillText('RJCB シティビルダー', X(0) + 5, Yp(0) - 4);
    // aircraft symbol
    c.save(); c.translate(X(d.x), Yp(d.z)); c.rotate(d.hdg * Math.PI / 180);
    c.fillStyle = '#fff'; c.strokeStyle = '#000';
    c.beginPath(); c.moveTo(0, -9); c.lineTo(2, -2); c.lineTo(9, 2); c.lineTo(9, 4); c.lineTo(2, 2); c.lineTo(1.5, 6); c.lineTo(4, 8.5); c.lineTo(-4, 8.5); c.lineTo(-1.5, 6); c.lineTo(-2, 2); c.lineTo(-9, 4); c.lineTo(-9, 2); c.lineTo(-2, -2); c.closePath();
    c.fill(); c.stroke(); c.restore();
    header(c, 'マップ Moving map', d);
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 168, 320, 32);
    c.fillStyle = '#fff'; c.font = '10px sans-serif';
    const items = [['高度', `${Math.round(d.altFt).toLocaleString()} ft`], ['対地速度', `${Math.round(d.gs * 1.852)} km/h`], ['外気温', `${Math.round(d.oat)} °C`], ['目的地まで', `${Math.round(d.dist)} km`]];
    items.forEach(([k, v], i) => { c.fillStyle = '#9fc4e8'; c.fillText(k, 8 + i * 78, 178); c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.fillText(v, 8 + i * 78, 192); c.font = '10px sans-serif'; });
  },
  info(c, t, d) {
    const g = c.createLinearGradient(0, 0, 0, 200); g.addColorStop(0, '#0d2a4f'); g.addColorStop(1, '#061527');
    c.fillStyle = g; c.fillRect(0, 0, 320, 200);
    header(c, 'フライト情報 Flight information', d);
    const rows = [['便名 Flight', d.callsign], ['機材 Aircraft', d.type], ['高度 Altitude', `${Math.round(d.altFt).toLocaleString()} ft / ${Math.round(d.altFt * 0.3048).toLocaleString()} m`],
      ['対地速度 Ground speed', `${Math.round(d.gs)} kt / ${Math.round(d.gs * 1.852)} km/h`], ['外気温 Outside air', `${Math.round(d.oat)} °C`],
      ['機首方位 Heading', `${String(Math.round(d.hdg) % 360).padStart(3, '0')}°`], ['目的地まで To RJCB', `${Math.round(d.dist)} km`], ['現地時刻 Local time', d.clock]];
    rows.forEach(([k, v], i) => {
      c.fillStyle = '#86a9cf'; c.font = '10px sans-serif'; c.fillText(k, 14, 36 + i * 20);
      c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.fillText(v, 150, 36 + i * 20);
    });
  },
  movieA(c, t, d) {       // Sky Journey: sunset flight over mountains
    const g = c.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, '#2b1f5c'); g.addColorStop(0.55, '#e0775a'); g.addColorStop(1, '#f7c16b');
    c.fillStyle = g; c.fillRect(0, 0, 320, 200);
    c.fillStyle = '#ffe3a0'; c.beginPath(); c.arc(230, 120 + Math.sin(t * 0.05) * 6, 22, 0, 7); c.fill();
    for (let l = 0; l < 3; l++) {
      c.fillStyle = ['#6b3d5e', '#4a2b4d', '#2c1a33'][l];
      c.beginPath(); c.moveTo(0, 200);
      for (let x = 0; x <= 320; x += 8) { const u = x + t * (6 + l * 10); c.lineTo(x, 130 + l * 18 - Math.abs(Math.sin(u * 0.02 + l)) * (38 - l * 8) - Math.sin(u * 0.07) * 6); }
      c.lineTo(320, 200); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 5; i++) { const x = (i * 97 - t * 14) % 380 + 380; c.beginPath(); c.ellipse(x % 380 - 30, 40 + i * 13, 28, 7, 0, 0, 7); c.fill(); }
    c.save(); c.translate(120 + Math.sin(t * 0.3) * 20, 70 + Math.sin(t * 0.5) * 8); c.fillStyle = '#1b1b2b';
    c.fillRect(-16, -2, 32, 4); c.fillRect(-4, -10, 6, 20); c.fillRect(-16, -6, 4, 6); c.restore();
    film(c, t, d, 'SKY JOURNEY', 5400, ['雲の上には、いつも太陽がある。', '— 次の目的地はどこ？', '夕焼けの向こうへ飛ぼう。', '', '「帰る場所があるから、遠くへ行ける」']);
  },
  movieB(c, t, d) {       // Ocean Tale: sailing boat on waves
    const g = c.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, '#6ec3f0'); g.addColorStop(1, '#d6f0ff');
    c.fillStyle = g; c.fillRect(0, 0, 320, 120);
    c.fillStyle = '#fff5c4'; c.beginPath(); c.arc(60, 40, 16, 0, 7); c.fill();
    for (let l = 0; l < 4; l++) {
      c.fillStyle = ['#2f86c4', '#2574ad', '#1c6096', '#154c7a'][l];
      c.beginPath(); c.moveTo(0, 200);
      for (let x = 0; x <= 320; x += 6) c.lineTo(x, 110 + l * 22 + Math.sin(x * 0.04 + t * (1 + l * 0.3) + l) * 5);
      c.lineTo(320, 200); c.fill();
      if (l === 0) {
        const bx = 180 + Math.sin(t * 0.2) * 40, by = 104 + Math.sin(bx * 0.04 + t) * 5;
        c.save(); c.translate(bx, by); c.rotate(Math.sin(t * 1.3) * 0.08);
        c.fillStyle = '#7a4a2a'; c.beginPath(); c.moveTo(-22, 0); c.lineTo(22, 0); c.lineTo(15, 9); c.lineTo(-15, 9); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -38); c.lineTo(0, -2); c.lineTo(19, -4); c.fill();
        c.fillStyle = '#f1e2c2'; c.beginPath(); c.moveTo(-2, -32); c.lineTo(-2, -2); c.lineTo(-16, -4); c.fill();
        c.restore();
      }
    }
    c.strokeStyle = '#333'; for (let i = 0; i < 3; i++) { const x = (t * 20 + i * 90) % 360 - 20, y = 50 + i * 12 + Math.sin(t * 2 + i) * 4; c.beginPath(); c.moveTo(x - 6, y); c.quadraticCurveTo(x - 3, y - 4, x, y); c.quadraticCurveTo(x + 3, y - 4, x + 6, y); c.stroke(); }
    film(c, t, d, 'OCEAN TALE', 6300, ['風が変わった。', '「舵をとれ、港はもうすぐだ」', '', '波の音だけが聞こえる夜。', '— 海はすべてを覚えている。']);
  },
  movieC(c, t, d) {       // Night City
    c.fillStyle = '#070b1d'; c.fillRect(0, 0, 320, 200);
    const r = rng(7);
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; c.fillRect(r() * 320, r() * 90, 1, 1); }
    c.fillStyle = '#f3f0d8'; c.beginPath(); c.arc(260, 36, 13, 0, 7); c.fill();
    let x = 0;
    while (x < 320) {
      const w = 18 + r() * 26, h = 50 + r() * 110;
      c.fillStyle = '#131a33'; c.fillRect(x, 200 - h, w - 2, h);
      for (let wy = 200 - h + 6; wy < 190; wy += 8) for (let wx = x + 3; wx < x + w - 5; wx += 6) {
        const on = Math.sin(wx * 12.9 + wy * 78.2 + Math.floor(t * 0.5 + wx)) > 0.3;
        if (on) { c.fillStyle = '#ffd98a'; c.fillRect(wx, wy, 3, 4); }
      }
      x += w;
    }
    for (let i = 0; i < 8; i++) { const cx = (t * 30 + i * 47) % 340 - 10; c.fillStyle = i % 2 ? '#ff4a4a' : '#fff7d0'; c.fillRect(i % 2 ? 320 - cx : cx, 196, 4, 2); }
    film(c, t, d, 'NIGHT CITY', 7200, ['この街は眠らない。', '「最終便には間に合う？」', '', '光の数だけ物語がある。']);
  },
  movieD(c, t, d) {       // Space Cat
    c.fillStyle = '#05030f'; c.fillRect(0, 0, 320, 200);
    const r = rng(3);
    for (let i = 0; i < 90; i++) { const sx = (r() * 320 - t * (5 + r() * 30)) % 320; c.fillStyle = '#fff'; c.fillRect((sx + 320) % 320, r() * 200, 1.4, 1.4); }
    c.fillStyle = '#c85cd6'; c.beginPath(); c.arc(250, 150, 34, 0, 7); c.fill();
    c.strokeStyle = '#e8a6f0'; c.beginPath(); c.ellipse(250, 150, 52, 10, -0.3, 0, 7); c.stroke();
    c.save(); c.translate(120 + Math.sin(t * 0.7) * 30, 90 + Math.cos(t * 0.9) * 20); c.rotate(Math.sin(t) * 0.2);
    c.fillStyle = '#e8e8f0'; c.fillRect(-26, -8, 40, 16); c.beginPath(); c.moveTo(14, -8); c.lineTo(30, 0); c.lineTo(14, 8); c.fill();
    c.fillStyle = '#ff9a3c'; c.beginPath(); c.moveTo(-26, -5); c.lineTo(-40 - Math.random() * 8, 0); c.lineTo(-26, 5); c.fill();
    c.fillStyle = '#f2a65a'; c.beginPath(); c.arc(0, -12, 9, 0, 7); c.fill();
    c.beginPath(); c.moveTo(-7, -17); c.lineTo(-5, -26); c.lineTo(-1, -19); c.fill(); c.beginPath(); c.moveTo(7, -17); c.lineTo(5, -26); c.lineTo(1, -19); c.fill();
    c.fillStyle = '#000'; c.fillRect(-4, -14, 2, 2); c.fillRect(3, -14, 2, 2); c.restore();
    film(c, t, d, 'SPACE CAT', 5100, ['にゃー（発進！）', '「ミケ船長、燃料が足りません」', '', 'にゃ？（次の星まで3光年）']);
  },
  music(c, t, d) {
    c.fillStyle = '#12091f'; c.fillRect(0, 0, 320, 200);
    header(c, '音楽 Music', d);
    c.save(); c.translate(70, 100); c.rotate(t * 0.6);
    c.fillStyle = '#222'; c.beginPath(); c.arc(0, 0, 44, 0, 7); c.fill();
    c.strokeStyle = '#333'; for (let rr = 14; rr < 44; rr += 5) { c.beginPath(); c.arc(0, 0, rr, 0, 7); c.stroke(); }
    c.fillStyle = '#e86a8a'; c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fill(); c.restore();
    for (let i = 0; i < 16; i++) {
      const h = 10 + 50 * Math.abs(Math.sin(t * (2 + i * 0.37) + i) * Math.sin(t * 1.3 + i * 0.7));
      const g = c.createLinearGradient(0, 150 - h, 0, 150); g.addColorStop(0, '#ff7aa8'); g.addColorStop(1, '#7a5cff');
      c.fillStyle = g; c.fillRect(140 + i * 10, 150 - h, 7, h);
    }
    const tracks = ['Blue Horizon', 'Cabin Lights', 'Cruise at 35,000', 'Runway Dreams'];
    const ti = Math.floor(t / 180) % tracks.length;
    c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.fillText(tracks[ti], 140, 170);
    c.fillStyle = '#b9a6d6'; c.font = '10px sans-serif'; c.fillText('City Builder Orchestra  ·  ' + fmtT(t % 180) + ' / 3:00', 140, 186);
  },
  game(c, t, d, S, G) {
    const g = G || S.demoGame;
    c.fillStyle = '#0a1330'; c.fillRect(0, 0, 320, 200);
    const r = rng(11); for (let i = 0; i < 40; i++) { c.fillStyle = '#334'; c.fillRect(r() * 320, (r() * 200 + t * 10) % 200, 1, 1); }
    for (const s of g.stars) { c.fillStyle = s.bad ? '#ff5a5a' : '#ffe066'; c.beginPath(); c.arc(s.x, s.y, s.bad ? 5 : 4, 0, 7); c.fill(); }
    c.fillStyle = '#7fd6ff'; c.fillRect(g.px - 22, 184, 44, 6);
    header(c, `スターキャッチ  SCORE ${g.score}  ♥${g.lives}`, d);
    if (g.over) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(60, 80, 200, 44); c.fillStyle = '#fff'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText('GAME OVER — ◀ ▶ でリスタート', 160, 106); c.textAlign = 'left'; }
  },
  news(c, t, d) {
    c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, 320, 200);
    c.fillStyle = '#b71c1c'; c.fillRect(0, 0, 320, 22); c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.textBaseline = 'middle'; c.fillText('CITY NEWS', 8, 11);
    c.textAlign = 'right'; c.fillText(d.clock, 312, 11); c.textAlign = 'left';
    const heads = ['シティビルダー空港、発着便が過去最多に', '新しい斜張橋が開通 — 市内の渋滞が緩和', '週末は全国的に晴れ、行楽日和', '港に大型コンテナ船が初入港', '電波塔のライトアップ、今夜は青色に'];
    const i = Math.floor(t / 8) % heads.length;
    c.fillStyle = '#222'; c.font = 'bold 15px sans-serif'; c.fillText(heads[i], 12, 70);
    c.fillStyle = '#666'; c.font = '11px sans-serif'; c.fillText('City Builder Broadcasting · 機内ニュース', 12, 96);
    c.fillStyle = '#ccc'; c.fillRect(12, 110, 296, 60);
    c.fillStyle = '#9aa'; for (let k = 0; k < 6; k++) c.fillRect(20 + k * 48, 170 - (20 + (k * 37 + i * 13) % 40), 30, 20 + (k * 37 + i * 13) % 40);
    c.fillStyle = '#b71c1c'; c.fillRect(0, 182, 320, 18);
    c.fillStyle = '#fff'; c.font = '11px sans-serif';
    const tick = '  ◆ 天気：晴れ 最高 24°C  ◆ 為替 1ドル=148円  ◆ 本日のおすすめ：機内限定メニュー  ◆ 到着ゲートは到着前にご案内します';
    c.fillText(tick, 320 - (t * 40) % (tick.length * 11 + 320), 191);
  },
  menu(c, t, d) {
    const g = c.createLinearGradient(0, 0, 320, 200); g.addColorStop(0, '#1a2a4a'); g.addColorStop(1, '#0a1020');
    c.fillStyle = g; c.fillRect(0, 0, 320, 200);
    header(c, `${d.airline}  エンターテインメント`, d);
    const items = [['🗺', 'マップ'], ['✈', '情報'], ['🎬', '映画'], ['🎵', '音楽'], ['🎮', 'ゲーム'], ['📷', 'カメラ']];
    items.forEach(([ic, lb], i) => {
      const x = 22 + (i % 3) * 96, y = 34 + Math.floor(i / 3) * 76;
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x, y, 84, 66);
      c.font = '26px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(ic, x + 42, y + 30);
      c.font = '11px sans-serif'; c.fillText(lb, x + 42, y + 56); c.textAlign = 'left';
    });
  },
  saver(c, t, d, S) {
    c.fillStyle = '#0b1220'; c.fillRect(0, 0, 320, 200);
    const x = 160 + Math.sin(t * 0.21) * 90, y = 90 + Math.sin(t * 0.33) * 45;
    if (S.logo) { c.save(); c.translate(x, y); c.scale(26, 26); try { S.logo.draw(c); } catch (e) { /* ignore */ } c.restore(); }
    c.fillStyle = '#cfd8e6'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center';
    c.fillText(`${d.airline} へようこそ`, 160, 178); c.textAlign = 'left';
  },
  camera(c, t, d) {
    c.fillStyle = '#111'; c.fillRect(0, 0, 320, 200);
    c.fillStyle = '#aaa'; c.font = '12px sans-serif'; c.textAlign = 'center'; c.fillText('TAIL CAMERA', 160, 100); c.textAlign = 'left';
  },
};

// the little game (player version is steered with the ◀ ▶ buttons, the demo plays itself)
function newGame() { return { px: 160, stars: [], score: 0, lives: 3, over: false, t: 0, dir: 0 }; }
function stepGame(g, dt, auto) {
  g.t += dt;
  if (g.over) return;
  if (auto) {
    const tgt = g.stars.filter((s) => !s.bad).sort((a, b) => b.y - a.y)[0];
    g.dir = tgt ? Math.sign(tgt.x - g.px) * (Math.abs(tgt.x - g.px) > 4 ? 1 : 0) : 0;
  }
  g.px = clamp(g.px + g.dir * 170 * dt, 22, 298);
  if (Math.random() < dt * 1.6) g.stars.push({ x: 15 + Math.random() * 290, y: 20, v: 45 + Math.random() * 50 + g.score * 0.6, bad: Math.random() < 0.22 });
  for (const s of g.stars) s.y += s.v * dt;
  g.stars = g.stars.filter((s) => {
    if (s.y > 180 && s.y < 190 && Math.abs(s.x - g.px) < 26) { if (s.bad) g.lives--; else g.score += 10; return false; }
    if (s.y > 205) { if (!s.bad && !auto) g.lives -= 0; return false; }
    return true;
  });
  if (g.lives <= 0) { g.over = true; if (auto) Object.assign(g, newGame()); }
}

// seat geometry for the "your seat" view: eye at the head, looking at the screen in the seat ahead
export function ifeGeometry(info) {
  if (!info || info.mySeat == null) return null;
  const me = info.seats[info.mySeat];
  const front = info.seats.find((s) => s.l === me.l && s.r === me.r - 1);
  if (!front) return null;
  const tilt = 14 * Math.PI / 180;
  const sc = [front.p[0] - (0.335 + 0.2 * Math.sin(tilt)) - 0.011, front.p[1] + 0.82 + 0.2 * Math.cos(tilt), front.p[2]];
  return { eye: [me.p[0] - 0.13, me.p[1] + 1.24, me.p[2]], screen: sc, tilt, frontSeat: info.seats.indexOf(front) };
}

// -------------------------------------------------------------------------------- IFE system
export class IFE {
  constructor(cabin) {
    this.cabin = cabin;
    this.atlas = document.createElement('canvas');
    this.atlas.width = 1024; this.atlas.height = 600;
    this.atex = new THREE.CanvasTexture(this.atlas);
    this.atex.colorSpace = THREE.SRGBColorSpace;
    this.player = document.createElement('canvas');
    this.player.width = 640; this.player.height = 400;
    this.ptex = new THREE.CanvasTexture(this.player);
    this.ptex.colorSpace = THREE.SRGBColorSpace;
    this.ptex.anisotropy = 8;
    this.S = { trail: [], demoGame: newGame(), logo: null, mapImg: null, mapR: { w: 240000, h: 150000 } };
    this.game = newGame();
    this.channel = 'menu';
    this.t = 0; this._acc = 0; this._pacc = 0;
    this.d = { clock: '12:00', altFt: 0, gs: 0, oat: 15, dist: 0, hdg: 0, x: 0, z: 0, cx: 0, cz: 0, airline: 'Claude Air', callsign: '', type: '' };
    this._buildMap();
  }

  // land / sea raster of the region around the airport (the map channel pans over it)
  _buildMap() {
    const W = 320, H = 200;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    this.S.mapBase = cv;
    this._mapCentre = [NaN, NaN];
  }

  _mapAround(cx, cz) {
    const R = this.S.mapR;
    if (Math.hypot(cx - this._mapCentre[0], cz - this._mapCentre[1]) < R.w * 0.15) return;
    this._mapCentre = [cx, cz];
    const cv = this.S.mapBase, c = cv.getContext('2d');
    const img = c.createImageData(160, 100);
    for (let j = 0; j < 100; j++) for (let i = 0; i < 160; i++) {
      const x = cx + (i / 160 - 0.5) * R.w, z = cz + (j / 100 - 0.5) * R.h;
      const w = isWater(x, z);
      const k = (j * 160 + i) * 4;
      const n = ((i * 7 + j * 13) % 5) * 2;
      if (w) { img.data[k] = 28; img.data[k + 1] = 78 + n; img.data[k + 2] = 128 + n; } else { img.data[k] = 96 + n; img.data[k + 1] = 128 + n; img.data[k + 2] = 78; }
      img.data[k + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = 160; tmp.height = 100;
    tmp.getContext('2d').putImageData(img, 0, 0);
    c.imageSmoothingEnabled = true;
    c.drawImage(tmp, 0, 0, 320, 200);
    this.S.mapImg = cv;
    this.d.cx = cx; this.d.cz = cz;
  }

  setLogo(logo, name) { this.S.logo = logo; this.d.airline = name || this.d.airline; }

  // screen material: atlas map + per-instance tile
  patchScreen(mat) {
    if (!mat || mat.userData.ife) return;
    mat.userData.ife = true;
    mat.map = this.atex; mat.emissiveMap = this.atex;
    mat.emissive = new THREE.Color(1, 1, 1); mat.emissiveIntensity = 0.9; mat.color.set(0xffffff);
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTile;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
{
  vec2 tOff = vec2(mod(aTile, 4.0) * 0.25, 1.0 - (floor(aTile / 4.0) + 1.0) / 3.0);
  #ifdef USE_MAP
  vMapUv = (vec2(1.0) - vMapUv) * vec2(0.25, 1.0 / 3.0) + tOff;
  #endif
  #ifdef USE_EMISSIVEMAP
  vEmissiveMapUv = (vec2(1.0) - vEmissiveMapUv) * vec2(0.25, 1.0 / 3.0) + tOff;
  #endif
}`);
    };
    mat.customProgramCacheKey = () => 'ife-screen';
    mat.needsUpdate = true;
  }

  // assign channels to the seat-back screens: a screen shows what the passenger behind watches
  assign(screens, occupied) {
    const info = this.cabin.info;
    const seats = info.seats;
    const behind = new Map();
    seats.forEach((s, i) => behind.set(s.l + '|' + (s.r + 1), i));
    for (const { im, list } of screens) {
      let attr = im.geometry.getAttribute('aTile');
      if (!attr) { attr = new THREE.InstancedBufferAttribute(new Float32Array(im.count), 1); im.geometry.setAttribute('aTile', attr); }
      list.forEach((s, k) => {
        const b = behind.get(s.l + '|' + s.r);
        const occ = b != null && occupied.has(b);
        attr.setX(k, occ ? TILE[WATCH[(b * 7 + 3) % WATCH.length]] : TILE.saver);
      });
      attr.needsUpdate = true;
    }
  }

  update(dt, visible, ifeView, data) {
    this.t += dt;
    Object.assign(this.d, data);
    const S = this.S;
    if (data.x !== undefined) {
      S._tr = (S._tr || 0) + dt;
      if (S._tr > 5) { S._tr = 0; S.trail.push([data.x, data.z]); if (S.trail.length > 400) S.trail.shift(); }
      this._mapAround(data.x, data.z);
    }
    stepGame(S.demoGame, dt, true);
    if (this.channel === 'game') stepGame(this.game, dt, false);
    if (!visible) return;
    this._acc += dt;
    if (this._acc > 0.25) {
      this._acc = 0;
      const c = this.atlas.getContext('2d');
      const tw = this.atlas.width / 4, th = this.atlas.height / 3;
      CHANNELS.forEach((ch, i) => {
        c.save();
        c.translate((i % 4) * tw, Math.floor(i / 4) * th);
        c.scale(tw / 320, th / 200);
        c.beginPath(); c.rect(0, 0, 320, 200); c.clip();
        c.textBaseline = 'alphabetic'; c.textAlign = 'left';
        try { DRAW[ch.id](c, this.t + i * 37, this.d, S); } catch (e) { /* keep going */ }
        c.restore();
      });
      this.atex.needsUpdate = true;
    }
    if (ifeView) {
      this._pacc += dt;
      if (this._pacc > 1 / 24) {
        this._pacc = 0;
        const c = this.player.getContext('2d');
        c.save(); c.scale(2, 2);
        c.textBaseline = 'alphabetic'; c.textAlign = 'left';
        try { DRAW[this.channel](c, this.t, this.d, S, this.game); } catch (e) { /* ignore */ }
        c.restore();
        this.ptex.needsUpdate = true;
      }
    }
  }

  select(id) {
    if (id === 'game' && (this.channel !== 'game' || this.game.over)) this.game = newGame();
    this.channel = id;
  }

  steer(dir) { if (this.game.over && dir) this.game = newGame(); this.game.dir = dir; }
}
