// First-launch tutorial: the player actually flies a short lesson before the menu opens.
// Part 1 takes off from runway 27 (thrust, rotation, gear, flaps, a turn, the autopilot);
// part 2 starts 12 nm out on the ILS and lands with the autopilot (APP, gear, flaps,
// reversers and brakes). Each step waits for the real action; a crash restarts the part.
import { FLAPS } from './flightmodel.js';
import { FT, runwayDir } from './util.js';

const KEY = 'b787.tutorialDone';
const k = (x) => `<kbd>${x}</kbd>`;

// steps: part (scenario), title, text (html, may use the live state), done(state) -> bool,
// or next: true for an information card closed with the button / Enter
const STEPS = [
  { part: 'rwy27', title: 'ようこそ！ はじめてのフライト', next: true,
    text: () => `これから 3〜5 分で、離陸から着陸までを<b>実際に操縦</b>して覚えます。<br>` +
      `いまボーイング 787 は羽田の滑走路 27 の上。画面左に<b>速度</b>、右に<b>高度</b>、中央に機体の傾きが表示されています。<br>` +
      `指示どおりにキーを押すと、自動で次の手順に進みます。` },
  { part: 'rwy27', title: '離陸推力を出す', text: () => `${k('Shift')} を押しながら ${k('R')} を押して、エンジンを離陸推力（TOGA）にします`,
    done: (s) => s.sys.pilot.throttle >= 0.95 || s.sys.at.mode === 'TOGA' },
  { part: 'rwy27', title: '機首を上げて離陸', text: (s) => {
    const vr = Math.round(s.sys.vspeeds().vr), ias = Math.round(s.o.ias || 0);
    return ias < vr - 15 ? `加速中… 速度が <b>${vr} ノット</b>（VR）になるまで待ちます（いま <b>${ias}</b> ノット）`
      : `${k('↓')} を押し続けて機首を上げます（いま <b>${ias}</b> ノット）。機首が 10 度くらい上がったら手を離して浮くのを待ちましょう`;
  }, done: (s) => !s.o.wow && s.agl > 35 },
  { part: 'rwy27', title: '脚（ギア）を上げる', text: () => `浮きました！ ${k('G')} で車輪を格納して空気抵抗を減らします`,
    done: (s) => !s.sys.gearLever },
  { part: 'rwy27', title: '上昇を続ける', text: (s) => `機首を 10〜15 度上げたまま、<b>1,500 ft</b> まで上昇します（いま <b>${Math.round(s.agl)}</b> ft）。` +
      `${k('↑')}${k('↓')} で機首の上げ下げ`, done: (s) => s.agl > 1500 },
  { part: 'rwy27', title: 'フラップを上げる', text: (s) => {
    const up = Math.round(s.sys.vspeeds().flapsUp || 200), ias = Math.round(s.o.ias || 0);
    return `速度が上がったら ${k('Z')} を押して、フラップを 1 段ずつ <b>UP</b> まで上げます（いま ${FLAPS[s.sys.flapLever].name}、${ias} ノット / 目安 ${up} ノット）`;
  }, done: (s) => s.sys.flapLever === 0 },
  { part: 'rwy27', title: '旋回してみる', text: (s) => `${k('←')} か ${k('→')} を押して機体を 20 度ほど傾けると曲がります。` +
      `向きを <b>30 度</b>変えてみましょう（いま ${Math.round(s.turned)} 度）。戻すときは反対のキー`,
    done: (s) => s.turned >= 30 },
  { part: 'rwy27', title: 'オートパイロット', text: (s) => `${k('1')} でオートパイロット（${s.sys.ap.on ? '✓' : '未'}）、` +
      `${k('2')} でオートスロットル（${s.sys.at.on ? '✓' : '未'}）を入れると、機体が高度と速度を保ってくれます`,
    done: (s) => s.sys.ap.on && s.sys.at.on },
  { part: 'rwy27', title: '離陸は完了！', next: true, text: () => 'よくできました。次は<b>着陸</b>の練習です。<br>滑走路から 7 マイル（約 13 km）手前、高度 2,000 ft に移動します' },
  { part: 'ils27', title: '着陸の準備：ILS を捕まえる', text: () => `空港からの電波（ILS）に沿って自動で降りられます。${k('6')}（APP）を押して ILS の捕捉を予約しましょう`,
    done: (s) => s.sys.ap.armed.loc || s.sys.ap.roll === 'LOC' },
  { part: 'ils27', title: '脚（ギア）を下ろす', text: () => `${k('G')} で車輪を下ろします`, done: (s) => s.sys.gearLever },
  { part: 'ils27', title: 'フラップを出す', text: (s) => `${k('X')} を何回か押して、フラップを <b>30</b> まで出します（いま ${FLAPS[s.sys.flapLever].name}）。` +
      '着陸用の遅い速度でも飛べるようになります。速度はオートスロットルが合わせます',
    done: (s) => s.sys.flapLever === FLAPS.length - 1 },
  { part: 'ils27', title: '滑走路へ降下中', text: (s) => {
    const ap = s.sys.ap;
    if (ap.roll !== 'LOC' && ap.roll !== 'ROLLOUT') return 'オートパイロットが滑走路の延長線（ローカライザー）に向かって旋回するのを待っています。少し待ちましょう';
    return `ILS に乗りました！ オートパイロットが 3 度の坂道で滑走路に降りていきます（高度 <b>${Math.round(s.agl)}</b> ft）。` +
      `${k('C')} で視点を切り替えてみましょう`;
  }, done: (s) => s.o.wow && s.o.gs > 30 },
  { part: 'ils27', title: '減速して止まる', text: (s) => `着陸しました！ ${k('H')} で逆噴射（${s.sys.pilot.reverse ? '✓' : '未'}）、` +
      `${k('Space')} を押し続けてブレーキ。止まるまで減速します（いま ${Math.round(s.o.gs)} ノット）`, done: (s) => s.o.wow && s.o.gs < 25 },
  { part: 'ils27', title: 'チュートリアル完了！ 🎉', next: true, last: true,
    text: () => 'おつかれさまでした。これで離陸から着陸までひと通り飛べます。<br>' +
      'メニューの <b>🔰 初心者モード</b>では、管制とのやりとりやゲートからの出発も、画面の案内つきで練習できます。' +
      '<br>チュートリアルはメニューからいつでもやり直せます' },
];

export class Tutorial {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.el = document.getElementById('tut');
  }

  static done() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  // calm, clear morning on the 787-9 with no other traffic or radio; the menu values are
  // restored afterwards
  start() {
    const app = this.app, $ = (id) => document.getElementById(id);
    this.saved = {};
    for (const id of ['weather', 'windSpd', 'turb', 'tod', 'traffic', 'beginner']) {
      const el = $(id);
      if (el) this.saved[id] = el.type === 'checkbox' ? el.checked : el.value;
    }
    const set = (id, v) => { const el = $(id); if (!el) return; if (el.type === 'checkbox') el.checked = v; else { el.value = v; el.dispatchEvent(new Event('input')); } };
    set('weather', 'clear'); $('weather')?.dispatchEvent(new Event('change'));
    set('windSpd', 0); set('turb', 0); set('tod', 10); set('traffic', false); set('beginner', false);
    this.active = true;
    this.part = null;
    document.body.classList.add('tutorial');
    $('menu').classList.add('hidden');
    $('title')?.classList.add('hidden');
    const go = () => {
      app.audio.enabled = $('sound') ? $('sound').checked : true;
      app.audio.start();
      app.beginner = false;
      this.goto(0);
    };
    if (app.cur?.id !== 'b789' && app.types.b789) app.selectType('b789').then(go); else go();
  }

  // step i; a new part (or a restart after a crash) sets up its scenario first
  goto(i, restart = false) {
    const app = this.app, st = STEPS[i];
    if (restart || this.part !== st.part) this.beginPart(st.part);
    this.i = i; this.step = st;
    if (st.title === '旋回してみる') this.hdg0 = app.fm.out.hdg;
    this.crashT = 0;
    this.render(true);
  }

  beginPart(part) {
    const app = this.app, sys = app.sys;
    this.part = part;
    app.startScenario(part, true);
    if (part === 'ils27') {
      // the player arms the approach; speed is managed by the autothrottle
      sys.ap.armed.loc = false; sys.ap.armed.gs = false;
      // 7 nm out at 2,000 ft (below the glideslope, as the approach expects) instead of the
      // scenario's 12 nm: a shorter descent to watch
      const r = app.worldData.runways.find((x) => x.ident === '27'), d = runwayDir(r);
      app.fm.pos.x += d.x * 5 * 1852; app.fm.pos.z += d.z * 5 * 1852; app.fm.pos.y = 2000 * FT;
      sys.mcp.alt = 2000;
      sys.autobrake = 3; sys.speedbrakeArmed = true;
    }
    if (app.radio) app.radio.enabled = false;
    this.hdg0 = null;
  }

  // first action step of the current part (a crash restarts from there)
  partStart() {
    return STEPS.findIndex((x) => x.part === this.part && !x.next);
  }

  state() {
    const app = this.app, o = app.fm.out;
    const turned = this.hdg0 == null ? 0 : Math.abs(((o.hdg - this.hdg0 + 540) % 360) - 180);
    return { app, sys: app.sys, fm: app.fm, o, agl: o.raFt ?? o.altFt, turned };
  }

  // called from the UI update (~8 Hz)
  update(dt) {
    if (!this.active || !this.step) return;
    const app = this.app, s = this.state(), st = this.step;
    // landing part: the autothrottle speed follows the flaps
    if (st.part === 'ils27' && app.sys.at.on && !s.o.wow) {
      const vs = app.sys.vspeeds(), fl = app.sys.flapLever;
      app.sys.mcp.spd = Math.round(fl >= 6 ? vs.vref + 5 : fl >= 4 ? vs.vref + 20 : Math.min(180, FLAPS[fl].vfe - 10));
    }
    if (app.fm.crashed) {
      this.crashT += dt;
      if (this.crashT > 3.5) {
        app.toast('もう一度やってみましょう — Let\'s try again', 3500);
        this.goto(this.partStart(), true);
      }
      this.render(false, '機体が壊れてしまいました… 少し前からやり直します');
      return;
    }
    if (!st.next && !app.paused && st.done(s)) {
      app.audio.chime?.();
      this.goto(this.i + 1);
      return;
    }
    this.render(false);
  }

  render(force, override) {
    const st = this.step, el = this.el;
    if (!el || !st) return;
    const s = this.state();
    const total = STEPS.length;
    const body = override || st.text(s);
    const html = `<div class="tH"><span class="tN">🎓 チュートリアル ${this.i + 1} / ${total}</span><b>${st.title}</b></div>` +
      `<div class="tB">${body}</div>` +
      `<div class="tP"><i style="width:${Math.round(100 * this.i / (total - 1))}%"></i></div>` +
      (st.next ? `<button class="tGo">${st.last ? 'メニューへ ▶' : '次へ ▶'}<small>Enter</small></button>` : '');
    if (force || el.innerHTML !== html) {
      el.innerHTML = html;
      const b = el.querySelector('.tGo');
      if (b) b.onclick = () => this.next();
    }
    el.classList.remove('hidden');
  }

  // information card: button / Enter
  next() {
    if (!this.active || !this.step?.next) return;
    if (this.step.last) this.finish();
    else this.goto(this.i + 1);
  }

  onKey(e) {
    if (!this.active || !this.step?.next) return false;
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.next(); return true; }
    return false;
  }

  finish() {
    const app = this.app, $ = (id) => document.getElementById(id);
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* storage unavailable */ }
    this.active = false;
    this.step = null;
    document.body.classList.remove('tutorial');
    this.el.classList.add('hidden');
    for (const [id, v] of Object.entries(this.saved || {})) {
      const el = $(id);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = v; else { el.value = v; el.dispatchEvent(new Event('input')); }
    }
    $('weather')?.dispatchEvent(new Event('change'));
    app.openMenu();
  }
}
