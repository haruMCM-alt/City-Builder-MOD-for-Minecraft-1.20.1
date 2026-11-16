/* =========================================================================
 * Windows Me セットアップ再現 — 非公式ファンメイド
 * core.js : 共通部品（DOM ヘルパ / 効果音 / 素材 / 9x コントロール / ダイアログ）
 *
 * 画面内のロゴ・アイコン・背景は assets/ 以下の画像を使用する。
 * 画像は実機スクリーンショットからの切り出しで、出典は README.md を参照。
 * ========================================================================= */
(function () {
  'use strict';

  document.documentElement.lang = 'ja';

  /* ---------------------------------------------------------------- 基盤 */
  var SPEED = 1;
  var RUN = 0;                      // 画面遷移世代。非同期処理の打ち切りに使う
  var timers = new Set();
  var uidN = 0;
  var uid = function (p) { return (p || 'u') + (++uidN); };

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'data') { for (var d in v) el.dataset[d] = v[d]; }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, kid) {
    if (kid == null || kid === false || kid === true) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { add(el, k); }); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function frag(html) {
    var t = document.createElement('div');
    t.innerHTML = html;
    /* 単一要素ならその要素を、複数ノードなら DocumentFragment を返す */
    if (t.childNodes.length === 1 && t.firstChild.nodeType === 1) return t.firstElementChild;
    var f = document.createDocumentFragment();
    while (t.firstChild) f.appendChild(t.firstChild);
    return f;
  }
  function wait(ms) {
    return new Promise(function (res) {
      var id = setTimeout(function () { timers.delete(id); res(); }, Math.max(0, ms / SPEED));
      timers.add(id);
    });
  }
  function clearTimers() { timers.forEach(function (id) { clearTimeout(id); }); timers.clear(); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* ------------------------------------------------------------ サウンド */
  /* Windows のサウンドは実機の WAV (assets/sounds/) を鳴らす。
     セットアップ中は Windows のサウンドが使えないので、PC スピーカーのビープ音だけを矩形波で出す。 */
  var SOUNDS = window.WINME_SOUNDS || null;
  var sndOn = true, unlocked = false, AC = null, vol = 0.8;
  var clips = {};
  ['startup', 'logoff', 'chord', 'ding', 'start', 'recycle', 'tada'].forEach(function (n) {
    try {
      var a = new Audio();
      a.preload = 'auto';
      a.src = SOUNDS && SOUNDS[n] ? SOUNDS[n] : 'assets/sounds/' + n + '.wav';
      clips[n] = a;
    } catch (e) {}
  });
  function soundURL(n) { return SOUNDS && SOUNDS[n] ? SOUNDS[n] : 'assets/sounds/' + n + '.wav'; }
  function play(n) {
    if (!sndOn || vol <= 0) return;
    var a = clips[n];
    if (!a) return;
    try {
      a.muted = false;
      a.volume = vol;
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function stopAll() {
    Object.keys(clips).forEach(function (n) { try { clips[n].pause(); } catch (e) {} });
  }
  function actx() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      AC = new C();
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  /* 最初の操作で再生を解禁する（操作なしの再生はブラウザに止められるため） */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    actx();
    Object.keys(clips).forEach(function (n) {
      var a = clips[n];
      try {
        a.muted = true;
        var p = a.play();
        if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; a.muted = false; }).catch(function () { a.muted = false; });
      } catch (e) { a.muted = false; }
    });
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  function speaker() {
    if (!sndOn) return;
    var c = actx(); if (!c) return;
    var t0 = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(800, t0);
    if (vol <= 0) return;
    g.gain.setValueAtTime(0.04 * vol, t0);
    g.gain.setValueAtTime(0.04 * vol, t0 + 0.16);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + 0.2);
  }
  var snd = {
    startup: function () { play('startup'); },    /* The Microsoft Sound.wav */
    logoff: function () { play('logoff'); },      /* LOGOFF.WAV */
    chord: function () { play('chord'); },        /* メッセージ ボックス */
    ding: function () { play('ding'); },          /* 一般の警告音 */
    nav: function () { play('start'); },          /* ナビゲーション開始 (START.WAV) */
    recycle: function () { play('recycle'); },    /* ごみ箱を空にする (RECYCLE.WAV) */
    tada: function () { play('tada'); },
    play: play,
    speaker: speaker,
    stop: stopAll
  };

  /* ---------------------------------------------------------------- 素材 */
  /* 単一ファイル版では build.py が window.WINME_ASSETS に data URI を埋め込む */
  var ASSETS = window.WINME_ASSETS || null;
  function src(name) { return ASSETS && ASSETS[name] ? ASSETS[name] : 'assets/' + (name.indexOf('.') >= 0 ? name : name + '.png'); }
  function pic(name, w, hh, cls) {
    var i = h('img', { src: src(name), alt: '', draggable: 'false', class: 'px' + (cls ? ' ' + cls : '') });
    if (w) { i.width = w; i.height = hh || w; }
    return i;
  }
  var MSG = { error: 'msg-error', info: 'msg-info', warn: 'msg-warn', ask: 'msg-ask' };
  var THEME = 's16';             /* 's16' = セットアップ中の 16 色 UI / 'desk' = デスクトップ */

  /* -------------------------------------------------------- コントロール */
  function accLabel(el, label) {
    var m = String(label).match(/&(.)/);
    el.dataset.acc = m ? m[1].toUpperCase() : '';
    el.innerHTML = esc(label).replace(/&amp;(.)/, '<u>$1</u>');
  }
  function Btn(label, o) {
    o = o || {};
    var b = h('button', { type: 'button', class: 'btn' + (o.def ? ' def' : '') + (o.cls ? ' ' + o.cls : '') });
    accLabel(b, label);
    if (o.disabled) b.disabled = true;
    if (o.esc) b.dataset.esc = '1';
    if (o.style) Object.assign(b.style, o.style);
    b.addEventListener('click', function (e) {
            if (o.onClick) o.onClick(e, b);
    });
    return b;
  }
  function Field(o) {
    o = o || {};
    var i = h('input', { type: o.type || 'text', class: 'tf' + (o.cls ? ' ' + o.cls : ''), id: o.id || uid('tf') });
    if (o.value != null) i.value = o.value;
    if (o.max) i.maxLength = o.max;
    if (o.w) i.style.width = o.w;
    if (o.disabled) i.disabled = true;
    if (o.ph) i.placeholder = o.ph;
    if (o.onInput) i.addEventListener('input', o.onInput);
    if (o.spell === false) { i.spellcheck = false; i.autocapitalize = 'off'; i.autocomplete = 'off'; }
    return i;
  }
  function Choice(kind, o) {
    var inp = h('input', { type: kind, class: kind === 'radio' ? 'r9' : 'c9', id: o.id || uid('c') });
    if (o.name) inp.name = o.name;
    if (o.value != null) inp.value = o.value;
    if (o.checked) inp.checked = true;
    if (o.disabled) inp.disabled = true;
    var span = h('span');
    accLabel(span, o.label);
    var lab = h('label', { class: 'ctl' + (o.disabled ? ' off' : '') }, inp, span);
    lab.dataset.acc = span.dataset.acc || '';
    if (o.sub) add(lab, h('span', { class: 'dim', text: o.sub }));
    if (o.onChange) inp.addEventListener('change', o.onChange);
    lab.input = inp;
    return lab;
  }
  var Radio = function (o) { return Choice('radio', o); };
  var Check = function (o) { return Choice('checkbox', o); };

  function Progress() {
    var bar = h('i');
    var box = h('div', { class: 'prog' }, bar);
    box.set = function (p) { bar.style.width = Math.max(0, Math.min(100, p)) + '%'; };
    return box;
  }

  /* ------------------------------------------------------------ 画面管理 */
  var screenWrap, stage, crt;
  var modals = [];

  function setScreen(el) {
    RUN++;
    clearTimers();
    window.__screenKeys = null;
    modals.length = 0;
    screenWrap.replaceChildren(el, h('div', { id: 'glare' }), h('div', { id: 'scan' }));
    var f = el.querySelector('[data-autofocus]') || el.querySelector('.btn.def:not(:disabled)');
    if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 30);
    return el;
  }
  function activeLayer() {
    return modals.length ? modals[modals.length - 1] : screenWrap.firstElementChild;
  }

  /* ダイアログ（モーダル） */
  function dialog(o) {
    return new Promise(function (resolve) {
      var theme = o.theme || THEME;
      var w = o.width || 330;
      var win = h('div', { class: 'win dlg ' + (theme === 'desk' ? 'dsk' : theme) + (o.cls ? ' ' + o.cls : ''), style: { width: w + 'px' } });
      var closeBtn = h('button', { class: 'tb x', type: 'button', 'aria-label': '閉じる' });
      var showClose = theme === 'desk' && !o.noClose;
      var bar = h('div', { class: 'tbar' + (o.centerTitle ? ' center' : '') },
        h('span', { class: 'ttl', text: o.title || '' }), showClose ? closeBtn : null);
      var cli = h('div', { class: 'cli' });
      var layer = h('div', { class: 'modal' }, win);

      function done(id) {
        if (!layer.isConnected) return;
        var i = modals.indexOf(layer);
        if (i >= 0) modals.splice(i, 1);
        layer.remove();
        resolve(id);
      }
      layer.done = done;
      closeBtn.addEventListener('click', function () { done(o.escResult || 'cancel'); });

      var row = h('div', { class: 'dlg-row' });
      if (o.icon) add(row, h('div', { class: 'ic' }, pic(MSG[o.icon] || o.icon, o.iconW || 32, o.iconH || 32)));
      var msg = h('div', { class: 'msg' });
      if (typeof o.body === 'string') msg.innerHTML = o.body; else add(msg, o.body);
      add(row, msg);
      add(cli, row);

      var btns = h('div', { class: 'dlg-btns' + (o.btnAlign === 'right' ? ' right' : '') });
      (o.buttons || [{ id: 'ok', label: 'OK', def: true }]).forEach(function (b) {
        add(btns, Btn(b.label, {
          def: b.def, esc: b.esc, disabled: b.disabled,
          onClick: function () {
            if (o.onButton && o.onButton(b.id, win) === false) return;
            done(b.id);
          }
        }));
      });
      if (!o.noButtons) add(cli, btns);
      add(win, bar); add(win, cli);

      screenWrap.appendChild(layer);
      modals.push(layer);

      /* 位置決め: セットアップ中は右側の作業領域の中央、デスクトップでは画面中央 */
      var ww = win.offsetWidth, wh = win.offsetHeight;
      var ax = theme === 's16' ? 134 : 0;
      win.style.left = (o.x != null ? o.x : Math.round(ax + (640 - ax - ww) / 2)) + 'px';
      win.style.top = (o.y != null ? o.y : Math.round((480 - wh) / 2 - 10)) + 'px';
      dragify(win, bar);

      if (o.sound !== false && MSG[o.icon]) {
        if (theme === 's16') { if (o.icon === 'error' || o.icon === 'warn') snd.speaker(); }
        else snd.chord();
      }
      /* ダイアログの外側をクリックすると警告音が鳴り、タイトル バーが点滅する */
      layer.addEventListener('pointerdown', function (e) {
        if (e.target !== layer) return;
        if (theme === 's16') snd.speaker(); else snd.ding();
        var n = 0;
        (function blink() {
          win.classList.toggle('inactive', n % 2 === 0);
          if (++n < 6) setTimeout(blink, 70); else win.classList.remove('inactive');
        })();
      });
      /* 開いた瞬間に入力先を移す（直後の Enter が背後のボタンに届かないように） */
      var f = win.querySelector('[data-autofocus]') || win.querySelector('.btn.def') || win.querySelector('.btn');
      if (f) { try { f.focus(); } catch (e) {} }
      if (o.onOpen) o.onOpen(win, done);
    });
  }

  /* タイトルバーでドラッグ */
  function dragify(win, bar) {
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.classList.contains('tb')) return;
      if (win.classList.contains('maxed')) return;
      var scale = parseFloat(getComputedStyle(crt).getPropertyValue('--s')) || 1;
      var sx = e.clientX, sy = e.clientY;
      var ox = parseFloat(win.style.left) || 0, oy = parseFloat(win.style.top) || 0;
      bar.setPointerCapture(e.pointerId);
      function mv(ev) {
        var nx = ox + (ev.clientX - sx) / scale, ny = oy + (ev.clientY - sy) / scale;
        win.style.left = Math.max(-win.offsetWidth + 60, Math.min(640 - 40, nx)) + 'px';
        win.style.top = Math.max(0, Math.min(480 - 24, ny)) + 'px';
      }
      function up(ev) {
        bar.removeEventListener('pointermove', mv);
        bar.removeEventListener('pointerup', up);
        try { bar.releasePointerCapture(ev.pointerId); } catch (err) {}
      }
      bar.addEventListener('pointermove', mv);
      bar.addEventListener('pointerup', up);
    });
  }

  window.__WinMe = { h: h, add: add, esc: esc, frag: frag, wait: wait, uid: uid, src: src, pic: pic,
    setTheme: function (t) { THEME = t; }, getTheme: function () { return THEME; },
    Btn: Btn, Field: Field, Radio: Radio, Check: Check, Progress: Progress, dialog: dialog,
    setScreen: setScreen, activeLayer: function () { return activeLayer(); }, dragify: dragify,
    snd: snd, pad: pad, modals: modals,
    get RUN() { return RUN; },
    setSpeed: function (v) { SPEED = v; }, getSpeed: function () { return SPEED; },
    setSound: function (v) { sndOn = v; if (!v) stopAll(); }, getSound: function () { return sndOn; },
    setVolume: function (v) { vol = Math.max(0, Math.min(1, v)); }, getVolume: function () { return vol; },
    soundURL: soundURL, actx: function () { return actx(); },
    refs: function () { return { screenWrap: screenWrap, stage: stage, crt: crt }; },
    bindRefs: function (sw, st, c) { screenWrap = sw; stage = st; crt = c; }
  };
})();
