/* =========================================================================
 * Windows Me セットアップ再現 — ファンメイド / 非公式
 * ロゴ・アイコン・イラストはすべてこのファイル内の SVG で描き起こしています。
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
  var AC = null, sndOn = false;
  function actx() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      AC = new C();
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(freq, dur, type, gain, delay) {
    if (!sndOn) return;
    var c = actx(); if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  var snd = {
    click: function () { tone(1800, 0.012, 'square', 0.015); },
    beep: function () { tone(760, 0.11, 'square', 0.05); tone(560, 0.13, 'square', 0.045, 0.13); },
    ding: function () { tone(1046, 0.5, 'triangle', 0.05); tone(1568, 0.45, 'sine', 0.025, 0.02); },
    /* 起動音は実機の楽曲ではなく、この作品のためのオリジナルの短い和音 */
    start: function () {
      [[392, 0], [523.25, 0.18], [659.25, 0.36], [783.99, 0.54]].forEach(function (n) {
        tone(n[0], 1.5, 'triangle', 0.045, n[1]);
        tone(n[0] * 2, 1.2, 'sine', 0.018, n[1] + 0.02);
      });
      tone(130.81, 2.2, 'sine', 0.05, 0);
    },
    shutdown: function () {
      [[659.25, 0], [523.25, 0.16], [392, 0.32], [261.63, 0.5]].forEach(function (n) {
        tone(n[0], 1.1, 'triangle', 0.04, n[1]);
      });
    },
    drive: function () { tone(120 + Math.random() * 40, 0.05, 'sawtooth', 0.012); }
  };

  /* ------------------------------------------------------- ロゴ / アイコン */
  var A = {};

  A.flag = function (w, glossy) {
    var id = uid('f'), s = w / 122;
    function grad(n, a, b) {
      return '<linearGradient id="' + id + n + '" x1="0" y1="0" x2="0.35" y2="1">' +
        '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
    }
    return '<svg width="' + w + '" height="' + (112 * s) + '" viewBox="0 0 122 112" aria-hidden="true">' +
      '<defs>' +
      grad('r', glossy ? '#ff7a5e' : '#f4553a', '#c4210a') +
      grad('g', glossy ? '#b6ea45' : '#93d227', '#3f8f00') +
      grad('b', glossy ? '#6ad4ff' : '#34b7ef', '#0064b4') +
      grad('y', glossy ? '#ffe86a' : '#ffd52e', '#e09000') +
      '</defs>' +
      '<g>' +
      '<path fill="url(#' + id + 'r)" d="M4,34 C18,22 36,17 56,14 L56,50 C36,53 18,58 4,70 Z"/>' +
      '<path fill="url(#' + id + 'g)" d="M64,13 C84,10.5 104,10 118,12 L118,48 C104,46 84,46.5 64,49 Z"/>' +
      '<path fill="url(#' + id + 'b)" d="M4,76 C18,64 36,59 56,56 L56,92 C36,95 18,100 4,112 Z"/>' +
      '<path fill="url(#' + id + 'y)" d="M64,55 C84,52.5 104,52 118,54 L118,90 C104,88 84,88.5 64,91 Z"/>' +
      '</g></svg>';
  };

  /* 「Microsoft Windows Me / Millennium Edition」 ワードマーク(再現) */
  A.wordmark = function (w, light) {
    var id = uid('w');
    var ink = light ? '#ffffff' : '#0a2f5c';
    var sub = light ? '#9fd9ef' : '#2a6ea0';
    return '<svg width="' + w + '" height="' + (w * 120 / 292) + '" viewBox="0 0 292 120" aria-label="Microsoft Windows Millennium Edition">' +
      '<defs><linearGradient id="' + id + 'me" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#9ff0ff"/><stop offset="0.5" stop-color="#2eb6db"/><stop offset="1" stop-color="#0b6ea8"/></linearGradient></defs>' +
      '<text x="2" y="20" font-family="Franklin Gothic Medium, Arial Narrow, Arial, sans-serif" font-size="17" fill="' + ink + '" letter-spacing="0.4">Microsoft\u00ae</text>' +
      '<g transform="skewX(-9)">' +
      '<text x="6" y="66" font-family="Franklin Gothic Medium, Arial Narrow, Arial, sans-serif" font-size="46" font-weight="700" fill="' + ink + '" letter-spacing="-1">Windows</text>' +
      '<text x="210" y="70" font-family="Franklin Gothic Medium, Arial Narrow, Arial, sans-serif" font-size="54" font-weight="700" fill="url(#' + id + 'me)">Me</text>' +
      '</g>' +
      '<text x="4" y="94" font-family="Franklin Gothic Medium, Arial Narrow, Arial, sans-serif" font-size="19" fill="' + sub + '" letter-spacing="1.6">Millennium Edition</text>' +
      '</svg>';
  };

  A.setupLogo = function () {
    return '<div style="display:flex;align-items:flex-end;gap:7px">' + A.flag(46, true) +
      '</div><div style="margin-top:6px">' + A.wordmark(158, true) + '</div>';
  };

  A.bootLogo = function () {
    return '<div style="display:flex;align-items:center;gap:20px;filter:drop-shadow(0 0 22px rgba(60,180,230,.45))">' +
      A.flag(104, true) +
      '<div>' + A.wordmark(250, true) + '</div></div>';
  };

  /* --- デスクトップ用 32px アイコン群（すべて自作の図形） --- */
  var IC = {};
  IC.computer = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<rect x="3" y="4" width="26" height="18" rx="1.5" fill="#d8d3c8" stroke="#5c5850"/>' +
    '<rect x="5" y="6" width="22" height="13" fill="#1f6fa8"/>' +
    '<rect x="5" y="6" width="22" height="13" fill="none" stroke="#0d3f63"/>' +
    '<path d="M7 8h8v3H7z" fill="#6fc7ea" opacity=".85"/>' +
    '<rect x="10" y="22" width="12" height="3" fill="#b8b2a5" stroke="#5c5850"/>' +
    '<rect x="5" y="25" width="22" height="4" rx="1" fill="#cdc7bb" stroke="#5c5850"/>' +
    '<circle cx="24" cy="27" r="1" fill="#4cc463"/></svg>';
  IC.folder = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M3 8h9l2.5 3H29v16H3z" fill="#f4c64a" stroke="#8a6a12"/>' +
    '<path d="M3 12h26v15H3z" fill="#ffd970" stroke="#8a6a12"/></svg>';
  IC.globe = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<circle cx="16" cy="16" r="12" fill="#2f9fd8" stroke="#0d4d75"/>' +
    '<path d="M4 16h24M16 4c5 6 5 18 0 24M16 4c-5 6-5 18 0 24" fill="none" stroke="#bfe9ff" stroke-width="1"/>' +
    '<path d="M8 9c4 2 12 2 16 0M8 23c4-2 12-2 16 0" fill="none" stroke="#bfe9ff" stroke-width="1"/>' +
    '<path d="M16 4a12 12 0 0 1 10 6l-4 3-5-2z" fill="#7ed957" opacity=".8"/></svg>';
  IC.network = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<rect x="2" y="3" width="16" height="11" rx="1" fill="#d8d3c8" stroke="#5c5850"/>' +
    '<rect x="4" y="5" width="12" height="7" fill="#1f6fa8"/>' +
    '<rect x="14" y="18" width="16" height="11" rx="1" fill="#d8d3c8" stroke="#5c5850"/>' +
    '<rect x="16" y="20" width="12" height="7" fill="#1f6fa8"/>' +
    '<path d="M10 14v4h12v0" fill="none" stroke="#5c5850" stroke-width="1.4"/></svg>';
  IC.bin = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M8 10h16l-2 18H10z" fill="#b9c2c7" stroke="#59646b"/>' +
    '<path d="M13 13v13M16 13v13M19 13v13" stroke="#7d8a91" fill="none"/>' +
    '<rect x="6" y="7" width="20" height="3.6" rx="1.2" fill="#cdd6db" stroke="#59646b"/>' +
    '<path d="M13 7V5h6v2" fill="none" stroke="#59646b"/></svg>';
  IC.docs = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M3 8h9l2.5 3H29v16H3z" fill="#f4c64a" stroke="#8a6a12"/>' +
    '<rect x="11" y="9" width="13" height="16" fill="#fff" stroke="#77818a"/>' +
    '<path d="M13.5 13h8M13.5 16h8M13.5 19h5" stroke="#4b8fc4"/></svg>';
  IC.drive = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<rect x="4" y="9" width="24" height="14" rx="1.5" fill="#d8d3c8" stroke="#5c5850"/>' +
    '<rect x="7" y="12" width="18" height="4" fill="#b0aa9c"/>' +
    '<circle cx="9" cy="20" r="1.3" fill="#4cc463"/><rect x="13" y="19" width="11" height="2" fill="#9a9488"/></svg>';
  IC.floppy = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<rect x="5" y="5" width="22" height="22" rx="1" fill="#3a3f44" stroke="#1d2125"/>' +
    '<rect x="10" y="5" width="12" height="9" fill="#d8d3c8"/>' +
    '<rect x="17" y="6" width="3" height="7" fill="#7e8890"/>' +
    '<rect x="9" y="17" width="14" height="10" fill="#e6e2d8" stroke="#9a9488"/></svg>';
  IC.cd = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<circle cx="16" cy="16" r="12" fill="#cfd7db" stroke="#6b767c"/>' +
    '<circle cx="16" cy="16" r="12" fill="none" stroke="#9ad7f0" stroke-width="3" opacity=".5"/>' +
    '<circle cx="16" cy="16" r="4" fill="#fff" stroke="#6b767c"/>' +
    '<circle cx="16" cy="16" r="1.6" fill="#8b959b"/></svg>';
  IC.cpl = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<rect x="4" y="6" width="24" height="20" rx="2" fill="#d8d3c8" stroke="#5c5850"/>' +
    '<circle cx="12" cy="13" r="3.4" fill="#e9e5db" stroke="#6b665c"/><path d="M12 13v-2.6" stroke="#333"/>' +
    '<rect x="18" y="10" width="7" height="3" fill="#6fa8d8" stroke="#2c5f8c"/>' +
    '<rect x="8" y="19" width="16" height="3" fill="#b8b2a5" stroke="#6b665c"/></svg>';
  IC.help = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<rect x="6" y="4" width="20" height="24" rx="1.5" fill="#fff" stroke="#5c5850"/>' +
    '<rect x="6" y="4" width="5" height="24" fill="#2f7fbf" stroke="#1d5b8c"/>' +
    '<text x="17" y="22" font-size="15" font-weight="700" fill="#2f7fbf" text-anchor="middle" font-family="Arial">?</text></svg>';
  IC.run = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<rect x="4" y="7" width="24" height="18" rx="1.5" fill="#d8d3c8" stroke="#5c5850"/>' +
    '<rect x="4" y="7" width="24" height="4" fill="#2f5f9f"/>' +
    '<text x="8" y="21" font-size="9" font-family="monospace" fill="#111">C:\\&gt;</text></svg>';
  IC.power = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<circle cx="16" cy="17" r="10" fill="#d8d3c8" stroke="#5c5850"/>' +
    '<path d="M16 9v8" stroke="#c0392b" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M10.5 12.5a7.5 7.5 0 1 0 11 0" fill="none" stroke="#c0392b" stroke-width="2.2"/></svg>';
  IC.find = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M3 8h9l2.5 3H29v16H3z" fill="#f4c64a" stroke="#8a6a12"/>' +
    '<circle cx="19" cy="17" r="6" fill="#dff1fb" stroke="#2c5f8c" stroke-width="2"/>' +
    '<path d="M23.5 21.5 28 26" stroke="#2c5f8c" stroke-width="3" stroke-linecap="round"/></svg>';
  IC.star = '<svg width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M16 5l3.2 6.9 7.5.9-5.6 5.1 1.5 7.4L16 21.6 9.4 25.3l1.5-7.4L5.3 12.8l7.5-.9z" fill="#ffd34d" stroke="#a5771a"/></svg>';
  IC.up = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3 13 9H10v4H6V9H3z" fill="#f4c64a" stroke="#8a6a12"/></svg>';
  IC.back = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3 4 8l6 5z" fill="#2f7fbf" stroke="#1d5b8c"/></svg>';
  IC.fwd = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l6 5-6 5z" fill="#9a9488" stroke="#6b665c"/></svg>';
  IC.winlogo16 = function () { return A.flag(16, true); };

  /* メッセージボックス用アイコン(48px) */
  var MSGICON = {
    error: '<svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#d13a2c" stroke="#7d1b12"/>' +
      '<path d="M10 10 22 22M22 10 10 22" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
    info: '<svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#2f6fbf" stroke="#17416f"/>' +
      '<circle cx="16" cy="9.5" r="2.2" fill="#fff"/><path d="M16 14v10" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
    warn: '<svg width="32" height="32" viewBox="0 0 32 32"><path d="M16 2 31 29H1z" fill="#f2c31c" stroke="#8a6a12"/>' +
      '<path d="M16 11v9" stroke="#000" stroke-width="3.4" stroke-linecap="round"/><circle cx="16" cy="25" r="2" fill="#000"/></svg>',
    ask: '<svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#2f6fbf" stroke="#17416f"/>' +
      '<text x="16" y="24" font-size="21" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial">?</text></svg>'
  };

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
      snd.click();
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
      var w = o.width || 330;
      var win = h('div', { class: 'win', style: { width: w + 'px' } });
      var closeBtn = h('button', { class: 'tb x', type: 'button', 'aria-label': '閉じる' });
      var bar = h('div', { class: 'tbar' }, h('span', { class: 'ttl', text: o.title || '' }), o.noClose ? null : closeBtn);
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
      closeBtn.addEventListener('click', function () { snd.click(); done(o.escResult || 'cancel'); });

      var row = h('div', { class: 'dlg-row' });
      if (o.icon) add(row, frag('<div class="ic">' + MSGICON[o.icon] + '</div>'));
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

      /* 位置決め: 中央（やや上寄せ） */
      var ww = win.offsetWidth, wh = win.offsetHeight;
      win.style.left = Math.round((640 - ww) / 2) + 'px';
      win.style.top = Math.round((480 - wh) / 2 - 14) + 'px';
      dragify(win, bar);

      if (o.sound !== false) snd[o.icon === 'error' ? 'beep' : (o.icon === 'warn' ? 'beep' : 'ding')]();
      var f = win.querySelector('[data-autofocus]') || win.querySelector('.btn.def') || win.querySelector('.btn');
      if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 20);
      if (o.onOpen) o.onOpen(win, done);
    });
  }

  /* タイトルバーでドラッグ */
  function dragify(win, bar) {
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.classList.contains('tb')) return;
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

  window.__WinMe = { h: h, add: add, esc: esc, frag: frag, wait: wait, uid: uid, A: A, IC: IC,
    Btn: Btn, Field: Field, Radio: Radio, Check: Check, Progress: Progress, dialog: dialog,
    setScreen: setScreen, activeLayer: function () { return activeLayer(); }, dragify: dragify,
    snd: snd, pad: pad, modals: modals,
    get RUN() { return RUN; },
    setSpeed: function (v) { SPEED = v; }, getSpeed: function () { return SPEED; },
    setSound: function (v) { sndOn = v; if (v) actx(); }, getSound: function () { return sndOn; },
    refs: function () { return { screenWrap: screenWrap, stage: stage, crt: crt }; },
    bindRefs: function (sw, st, c) { screenWrap = sw; stage = st; crt = c; }
  };
})();

/* =========================================================================
 * セットアップ本編 — MS-DOS 実モード → GUI ウィザード
 * ========================================================================= */
(function () {
  'use strict';
  var W = window.__WinMe;
  var h = W.h, add = W.add, esc = W.esc, frag = W.frag, wait = W.wait, A = W.A;
  var Btn = W.Btn, Field = W.Field, Radio = W.Radio, Check = W.Check, Progress = W.Progress;
  var dialog = W.dialog, setScreen = W.setScreen, snd = W.snd, pad = W.pad;

  var S = window.__setupState = {
    key: ['', '', '', '', ''],
    dirMode: 'default',
    dirOther: 'C:\\WIN9X',
    type: 'typical',
    user: { name: '', company: '' },
    pc: { name: 'MYCOMPUTER', wg: 'WORKGROUP', desc: '' },
    country: '日本',
    bootdisk: 'yes',
    comps: null,
    eta: 47,
    tz: '(GMT+09:00) 大阪、札幌、東京',
    restartCount: 0
  };

  var STEPS = [
    'セットアップの準備',
    'コンピュータ情報の収集',
    'Windows ファイルのコピー',
    'コンピュータの再起動',
    'ハードウェアのセットアップと\n設定の完了'
  ];

  function guard() { var g = W.RUN; return function () { return g === W.RUN; }; }

  function errDlg(msg, title) {
    return dialog({ title: title || 'Windows Me セットアップ', icon: 'error', body: msg, width: 340 });
  }

  /* ------------------------------------------------------ ウィザードの枠 */
  function wizShell(stepIdx, title) {
    var side = h('div', { class: 'wiz-side' });
    add(side, frag('<div class="wiz-logo">' + A.setupLogo() + '</div>'));
    var ul = h('ul', { class: 'wiz-steps' });
    STEPS.forEach(function (t, i) {
      var cls = i < stepIdx ? 'done' : (i === stepIdx ? 'cur' : '');
      var li = h('li', { class: cls },
        h('span', { class: 'mk', text: i < stepIdx ? '\u2713' : (i === stepIdx ? '\u25B6' : '\u2022') }),
        h('span', { style: { whiteSpace: 'pre' }, text: t }));
      add(ul, li);
    });
    add(side, ul);
    var etaVal = h('b', { text: 'あと ' + S.eta + ' 分' });
    add(side, h('div', { class: 'wiz-eta' }, h('span', { text: '推定残り時間:' }), etaVal));

    var body = h('div', { class: 'wiz-body' });
    if (title) add(body, h('h1', { class: 'wiz-h', text: title }));
    var foot = h('div', { class: 'wiz-foot' }, h('div', { class: 'spacer' }));
    var main = h('div', { class: 'wiz-main' }, body, foot);
    var root = h('div', { class: 'screen' }, h('div', { class: 'wiz' }, side, main));
    return { root: root, side: side, body: body, foot: foot, eta: etaVal };
  }

  /* -------------------------------------------------------------- ページ */
  var PAGES = [];
  var byId = {};
  function page(o) { PAGES.push(o); byId[o.id] = o; }
  var hist = [];

  function go(id) {
    var p = byId[id];
    if (!p) return;
    if (!p.transient) hist.push(id);

    var sh = wizShell(p.step, p.title);
    var ui = {
      shell: sh, page: p,
      setNext: function (en) { ui.btnNext.disabled = !en; },
      setBack: function (en) { if (ui.btnBack) ui.btnBack.disabled = !en; },
      setCancel: function (en) { if (ui.btnCancel) ui.btnCancel.disabled = !en; },
      next: function () { tryNext(ui); },
      jump: function (to) { go(to); }
    };
    add(sh.body, p.build(ui));

    ui.btnBack = Btn('< 戻る(&B)', { disabled: p.noBack || hist.length <= 1, onClick: function () { back(); } });
    ui.btnNext = Btn(p.nextLabel || '次へ(&N) >', { def: true, onClick: function () { tryNext(ui); } });
    ui.btnCancel = Btn('キャンセル', { esc: true, onClick: function () { cancelSetup(); } });
    add(sh.foot, [ui.btnBack, ui.btnNext, h('span', { style: { width: '10px' } }), ui.btnCancel]);
    if (p.noCancel) ui.btnCancel.disabled = true;

    setScreen(sh.root);
    if (p.onShow) p.onShow(ui);
  }
  function back() {
    if (hist.length <= 1) return;
    hist.pop();
    var id = hist[hist.length - 1];
    hist.pop();
    go(id);
  }
  function tryNext(ui) {
    if (ui.btnNext.disabled) return;
    var p = ui.page;
    Promise.resolve(p.next ? p.next(ui) : (p.nextId || null)).then(function (r) {
      if (r === false || r == null) return;
      if (typeof r === 'string') go(r);
    });
  }

  function cancelSetup() {
    dialog({
      title: 'Windows Me セットアップの終了', icon: 'warn', width: 360,
      body: 'セットアップを終了しますか?<br><br>Windows Me はインストールされず、コンピュータの構成は変更されません。',
      buttons: [{ id: 'yes', label: 'はい(&Y)' }, { id: 'no', label: 'いいえ(&N)', def: true, esc: true }]
    }).then(function (r) {
      if (r === 'yes') exitScreen();
    });
  }

  function exitScreen() {
    var root = h('div', { class: 'screen dos' });
    add(root, h('div', { class: 'topbar', text: 'Windows Millennium Edition セットアップ' }));
    add(root, h('div', { class: 'doswrap' }, frag(
      '<div style="margin-top:40px"><span class="wht">セットアップは完了していません。</span>\n\n' +
      'Windows Me はインストールされませんでした。\nコンピュータの構成は変更されていません。\n\n' +
      'セットアップをやり直すには、下のボタンを押してください。</div>')));
    var b = Btn('セットアップを再実行する', { def: true, onClick: function () { boot(); } });
    b.style.marginTop = '26px';
    add(root.querySelector('.doswrap'), b);
    add(root, h('div', { class: 'botbar' }, h('span', { text: 'ENTER=再実行' })));
    setScreen(root);
  }

  /* ============================== 1. ようこそ ============================== */
  page({
    id: 'welcome', step: 0, title: 'Windows Me セットアップ ウィザードの開始', noBack: true,
    build: function () {
      return [
        frag('<p class="t">セットアップ ウィザードは、Microsoft Windows Millennium Edition をコンピュータにインストールします。</p>'),
        frag('<p class="t">セットアップでは、次の作業を行います:</p>'),
        frag('<ul class="t"><li>コンピュータに関する情報を収集します</li>' +
          '<li>Windows Me のファイルをコンピュータにコピーします</li>' +
          '<li>ハードウェアを検出し、設定します</li></ul>'),
        frag('<p class="t">セットアップには約 30 ～ 60 分かかります。実際の時間はコンピュータの構成によって異なります。</p>'),
        frag('<div class="note"><b>重要:</b> セットアップの実行中は、ほかのプログラムを起動しないでください。<br>' +
          '続行するには [次へ] をクリックしてください。</div>')
      ];
    },
    nextId: 'license'
  });

  /* ============================== 2. 使用許諾 ============================== */
  var EULA =
    '使用許諾契約書\n\n' +
    'この使用許諾契約書は、お客様と頒布者との間に締結される契約です。本ソフトウェアを\n' +
    'インストール、複製、または使用することによって、お客様は本契約の各条項に同意した\n' +
    'ものとみなされます。同意されない場合は、本ソフトウェアをインストールしないで\n' +
    'ください。\n\n' +
    '第 1 条 (使用権の許諾)\n' +
    '  頒布者は、お客様に対し、本ソフトウェアを 1 台のコンピュータ上で使用する非独占的な\n' +
    '  権利を許諾します。\n\n' +
    '第 2 条 (複製の制限)\n' +
    '  お客様は、バックアップの目的でのみ、本ソフトウェアの複製物を 1 部作成できます。\n' +
    '  複製物には、原本に含まれる著作権表示をそのまま含めるものとします。\n\n' +
    '第 3 条 (譲渡)\n' +
    '  お客様は、本ソフトウェアおよび本契約に基づく権利のすべてを第三者に譲渡できます。\n' +
    '  この場合、お客様は複製物を保持してはならず、譲受人は本契約の条項に同意するもの\n' +
    '  とします。\n\n' +
    '第 4 条 (禁止事項)\n' +
    '  お客様は、本ソフトウェアのリバース エンジニアリング、逆コンパイル、または逆\n' +
    '  アセンブルを行うことはできません。ただし、適用される法令により明示的に認められる\n' +
    '  場合を除きます。\n\n' +
    '第 5 条 (限定保証)\n' +
    '  本ソフトウェアは現状有姿で提供されます。頒布者は、本ソフトウェアが中断なく\n' +
    '  動作すること、および誤りがないことを保証しません。\n\n' +
    '第 6 条 (責任の制限)\n' +
    '  頒布者は、本ソフトウェアの使用または使用不能から生じるいかなる損害についても、\n' +
    '  責任を負わないものとします。\n\n' +
    '第 7 条 (契約の終了)\n' +
    '  お客様が本契約の条項に違反した場合、本契約は自動的に終了します。この場合、\n' +
    '  お客様は本ソフトウェアのすべての複製物を破棄しなければなりません。\n\n' +
    '第 8 条 (準拠法)\n' +
    '  本契約は、お客様が本ソフトウェアを取得した国の法令に準拠するものとします。\n\n' +
    '第 9 条 (完全合意)\n' +
    '  本契約は、本ソフトウェアに関するお客様と頒布者との間の完全な合意を構成します。\n\n' +
    '第 10 条 (本再現物について)\n' +
    '  本画面は、Windows Millennium Edition のセットアップ画面を HTML/CSS/JavaScript で\n' +
    '  再現した非公式のファンメイド作品です。実際の製品、その提供元とは一切関係が\n' +
    '  ありません。本画面では、コンピュータに対して一切の変更は行われません。\n';

  page({
    id: 'license', step: 0, title: '使用許諾契約書',
    build: function (ui) {
      var box = h('div', { class: 'well', style: { height: '212px', overflow: 'auto', padding: '4px 6px' } },
        h('pre', { style: { margin: '0', font: 'inherit', whiteSpace: 'pre-wrap', lineHeight: '1.6' }, text: EULA }));
      var r1 = Radio({
        name: 'eula', label: '使用許諾契約書に同意します(&A)', checked: false,
        onChange: function () { ui.setNext(true); }
      });
      var r2 = Radio({
        name: 'eula', label: '使用許諾契約書に同意しません(&D)', checked: true,
        onChange: function () { ui.setNext(false); }
      });
      return [
        frag('<p class="t">次の使用許諾契約書をよくお読みください。<br>' +
          '契約書の残りの部分を読むには、[Page Down] キーを押してください。</p>'),
        box,
        h('div', { style: { marginTop: '12px' } }, r1, r2)
      ];
    },
    onShow: function (ui) { ui.setNext(false); },
    nextId: 'prodkey'
  });

  /* ============================= 3. プロダクト キー ========================= */
  page({
    id: 'prodkey', step: 1, title: 'プロダクト キー',
    build: function (ui) {
      var boxes = [];
      var row = h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', margin: '14px 0 0' } });
      for (var i = 0; i < 5; i++) {
        (function (i) {
          var f = Field({ cls: 'key', max: 5, value: S.key[i], spell: false });
          if (i === 0) f.dataset.autofocus = '1';
          f.addEventListener('input', function () {
            f.value = f.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
            S.key[i] = f.value;
            if (f.value.length === 5 && i < 4) boxes[i + 1].focus();
          });
          f.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace' && !f.value && i > 0) { boxes[i - 1].focus(); }
          });
          f.addEventListener('paste', function (e) {
            var t = (e.clipboardData || window.clipboardData).getData('text') || '';
            t = t.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
            if (t.length > 5) {
              e.preventDefault();
              for (var j = 0; j < 5; j++) { S.key[j] = t.substr(j * 5, 5); boxes[j].value = S.key[j]; }
              boxes[4].focus();
            }
          });
          boxes.push(f);
          add(row, f);
          if (i < 4) add(row, h('span', { text: '-' }));
        })(i);
      }
      ui.keyBoxes = boxes;
      return [
        frag('<p class="t">Windows Me の CD-ROM ケースの裏面に記載されている、25 文字のプロダクト キーを入力してください。</p>'),
        row,
        frag('<p class="t dim" style="margin-top:12px">例: MEFAN-RETRO-CSSJS-HTML5-2000W<br>' +
          '英数字のみを入力します。ハイフンは自動的に入ります。</p>'),
        frag('<div class="note">プロダクト キーは大切に保管してください。Windows Me を再インストールするときに必要になります。</div>')
      ];
    },
    next: function (ui) {
      var k = ui.keyBoxes.map(function (b) { return b.value; }).join('');
      if (k.length !== 25) {
        return errDlg('入力されたプロダクト キーが正しくありません。<br><br>' +
          'CD-ROM ケースに記載されている 25 文字のキーを確認して、もう一度入力してください。')
          .then(function () { ui.keyBoxes[0].focus(); return false; });
      }
      return 'dir';
    }
  });

  /* ============================ 4. ディレクトリ =========================== */
  page({
    id: 'dir', step: 1, title: 'Windows ディレクトリの選択',
    build: function (ui) {
      var other = Field({ value: S.dirOther, w: '190px', disabled: S.dirMode !== 'other', spell: false });
      var r1 = Radio({
        name: 'dir', label: 'C:\\WINDOWS(&C)', checked: S.dirMode === 'default',
        onChange: function () { S.dirMode = 'default'; other.disabled = true; }
      });
      var r2 = Radio({
        name: 'dir', label: 'その他のディレクトリ(&O)', checked: S.dirMode === 'other',
        onChange: function () { S.dirMode = 'other'; other.disabled = false; other.focus(); }
      });
      ui.other = other;
      return [
        frag('<p class="t">Windows Me をインストールするディレクトリを選択してください。</p>'),
        r1, r2,
        h('div', { style: { margin: '2px 0 0 19px' } }, other),
        frag('<div class="note"><b>注意:</b> 既定以外のディレクトリを選択すると、' +
          '現在インストールされている Windows 用プログラムを再インストールする必要があります。</div>')
      ];
    },
    next: function (ui) {
      if (S.dirMode === 'other') {
        var v = ui.other.value.trim();
        if (!/^[A-Za-z]:\\[^\\/:*?"<>|]{1,40}$/.test(v)) {
          return errDlg('指定されたディレクトリ名は使用できません。<br><br>' +
            'C:\\WIN9X のような形式で、有効なパスを入力してください。')
            .then(function () { ui.other.focus(); ui.other.select(); return false; });
        }
        S.dirOther = v;
      }
      return 'prep';
    }
  });

  /* ============================ 5. 準備の確認 ============================= */
  page({
    id: 'prep', step: 1, title: 'インストールの準備', noBack: true, noCancel: true, transient: true,
    build: function (ui) {
      var st = h('p', { class: 't', text: 'ディスク領域を確認しています...' });
      var bar = Progress();
      ui.st = st; ui.bar = bar;
      return [
        frag('<p class="t">セットアップは、コンピュータにインストールの準備ができているかどうかを確認しています。しばらくお待ちください。</p>'),
        h('div', { style: { marginTop: '26px' } }, st, bar)
      ];
    },
    onShow: function (ui) {
      ui.setNext(false);
      var alive = guard();
      var tasks = [
        'ディスク領域を確認しています...',
        'インストール コンポーネントを検査しています...',
        'システム レジストリを確認しています...',
        '既存の構成情報を保存しています...'
      ];
      (function run(i) {
        if (!alive()) return;
        if (i >= tasks.length) {
          ui.bar.set(100);
          wait(500).then(function () { if (alive()) go('options'); });
          return;
        }
        ui.st.textContent = tasks[i];
        ui.bar.set((i / tasks.length) * 100 + 6);
        snd.drive();
        wait(900 + Math.random() * 500).then(function () { run(i + 1); });
      })(0);
    }
  });

  /* ========================== 6. セットアップ オプション ==================== */
  var TYPES = [
    ['typical', '標準(&T)', '一般的なデスクトップ コンピュータに推奨される構成でインストールします。ほとんどのユーザーはこのオプションを選択します。'],
    ['portable', 'ポータブル(&P)', 'ノート型コンピュータに適した構成です。ダイレクト ケーブル接続や、携帯時に役立つユーティリティがインストールされます。'],
    ['compact', 'コンパクト(&C)', 'ディスク領域を節約するため、省略可能なコンポーネントをインストールしません。'],
    ['custom', 'カスタム(&U)', 'インストールするコンポーネントを自分で選択します。Windows に慣れているユーザー向けです。']
  ];
  page({
    id: 'options', step: 1, title: 'セットアップ オプション',
    build: function (ui) {
      var desc = h('div', { class: 'note', style: { minHeight: '52px' } });
      function setDesc(t) { desc.textContent = t; }
      var wrap = h('div', { style: { marginTop: '10px' } });
      TYPES.forEach(function (t) {
        add(wrap, Radio({
          name: 'stype', label: t[1], checked: S.type === t[0],
          onChange: function () { S.type = t[0]; setDesc(t[2]); }
        }));
      });
      TYPES.forEach(function (t) { if (t[0] === S.type) setDesc(t[2]); });
      return [
        frag('<p class="t">セットアップの種類を選択してください。選択した種類によって、インストールされるコンポーネントが決まります。</p>'),
        wrap, desc
      ];
    },
    next: function () { return 'userinfo'; }
  });

  /* ============================== 7. ユーザー情報 ========================== */
  page({
    id: 'userinfo', step: 1, title: 'ユーザー情報',
    build: function (ui) {
      var n = Field({ value: S.user.name, w: '210px', max: 32 });
      n.dataset.autofocus = '1';
      var c = Field({ value: S.user.company, w: '210px', max: 32 });
      ui.n = n; ui.c = c;
      var g = h('fieldset', { class: 'grp' }, h('legend', { text: 'ユーザー情報' }),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '9px 10px', alignItems: 'center' } },
          h('label', { class: 'lbl', html: '名前(<u>N</u>):' }), n,
          h('label', { class: 'lbl', html: '会社名(<u>O</u>):' }), c));
      return [
        frag('<p class="t">名前を入力してください。会社名は必要に応じて入力します。<br>' +
          'ここで入力した情報は、Windows Me 用のプログラムをインストールするときに使われます。</p>'),
        g
      ];
    },
    next: function (ui) {
      if (!ui.n.value.trim()) {
        return errDlg('名前を入力してください。').then(function () { ui.n.focus(); return false; });
      }
      S.user.name = ui.n.value.trim();
      S.user.company = ui.c.value.trim();
      return S.type === 'custom' ? 'comps' : 'netid';
    }
  });

  /* ============================== 8. コンポーネント ======================== */
  var COMPS = [
    ['ユーザー補助', 4.2, true], ['アクセサリ', 12.4, true], ['通信', 8.3, true],
    ['デスクトップ テーマ', 30.1, false], ['ゲーム', 3.5, false],
    ['インターネット ツール', 15.2, true], ['マルチ メディア', 22.7, true],
    ['Windows Movie Maker', 7.9, true], ['オンライン サービス', 1.8, false],
    ['システム ツール', 5.6, true], ['Web TV for Windows', 11.3, false]
  ];
  page({
    id: 'comps', step: 1, title: 'Windows コンポーネント',
    build: function (ui) {
      if (!S.comps) { S.comps = {}; COMPS.forEach(function (c) { S.comps[c[0]] = c[2]; }); }
      var list = h('div', { class: 'well lst', style: { height: '176px' }, tabindex: '0' });
      var need = h('b', { text: '' });
      var free = 1024.0;
      function recalc() {
        var t = 62.5;
        COMPS.forEach(function (c) { if (S.comps[c[0]]) t += c[1]; });
        need.textContent = t.toFixed(1) + ' MB';
        ui.need = t;
      }
      COMPS.forEach(function (c) {
        var cb = Check({
          label: c[0], checked: S.comps[c[0]],
          onChange: function (e) { S.comps[c[0]] = e.target.checked; recalc(); }
        });
        cb.style.margin = '0';
        cb.style.padding = '2px 5px';
        add(cb, h('span', { class: 'dim', style: { marginLeft: 'auto' }, text: c[1].toFixed(1) + ' MB' }));
        cb.style.display = 'flex';
        add(list, cb);
      });
      recalc();
      return [
        frag('<p class="t">インストールするコンポーネントのチェック ボックスをオンにしてください。<br>' +
          'インストールしないコンポーネントは、オフにします。</p>'),
        list,
        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '8px' } },
          h('span', {}, '必要なディスク領域: ', need),
          h('span', { class: 'dim', text: '利用できる領域: ' + free.toFixed(1) + ' MB' }))
      ];
    },
    next: function () { return 'netid'; }
  });

  /* ============================ 9. コンピュータ情報 ======================== */
  page({
    id: 'netid', step: 1, title: 'コンピュータ情報',
    build: function (ui) {
      var n = Field({ value: S.pc.name, w: '180px', max: 15, spell: false });
      n.dataset.autofocus = '1';
      var w2 = Field({ value: S.pc.wg, w: '180px', max: 15, spell: false });
      var d = Field({ value: S.pc.desc, w: '240px', max: 48 });
      ui.n = n; ui.w = w2; ui.d = d;
      return [
        frag('<p class="t">コンピュータ名とワークグループ名を入力してください。<br>' +
          'ネットワーク上のほかのコンピュータから、この名前で識別されます。</p>'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 10px', alignItems: 'center', marginTop: '14px' } },
          h('label', { html: 'コンピュータ名(<u>C</u>):' }), n,
          h('label', { html: 'ワークグループ(<u>W</u>):' }), w2,
          h('label', { html: 'コンピュータの説明(<u>D</u>):' }), d),
        frag('<div class="note">コンピュータ名とワークグループ名は 15 文字以内で、空白を含めることはできません。</div>')
      ];
    },
    next: function (ui) {
      var nm = ui.n.value.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,15}$/.test(nm)) {
        return errDlg('コンピュータ名が正しくありません。<br><br>' +
          '15 文字以内の半角英数字で入力してください。空白は使用できません。')
          .then(function () { ui.n.focus(); ui.n.select(); return false; });
      }
      S.pc.name = nm;
      S.pc.wg = (ui.w.value.trim() || 'WORKGROUP').toUpperCase();
      S.pc.desc = ui.d.value.trim();
      return 'country';
    }
  });

  /* ============================== 10. 国/地域 ============================= */
  var COUNTRIES = ['日本', 'アメリカ合衆国', 'イギリス', 'カナダ', 'オーストラリア',
    'ドイツ', 'フランス', 'イタリア', 'スペイン', '大韓民国', '中華人民共和国', 'ブラジル'];
  page({
    id: 'country', step: 1, title: '国/地域の設定',
    build: function (ui) {
      var list = h('div', { class: 'well lst', style: { height: '186px' }, tabindex: '0', role: 'listbox' });
      var sel = S.country;
      var items = COUNTRIES.map(function (c) {
        var it = h('div', { class: 'it', role: 'option', text: c });
        it.setAttribute('aria-selected', c === sel ? 'true' : 'false');
        it.addEventListener('click', function () { pick(c); });
        return it;
      });
      items.forEach(function (i) { add(list, i); });
      function pick(c) {
        sel = S.country = c;
        items.forEach(function (it) { it.setAttribute('aria-selected', it.textContent === c ? 'true' : 'false'); });
      }
      list.addEventListener('keydown', function (e) {
        var i = COUNTRIES.indexOf(sel);
        if (e.key === 'ArrowDown') { e.preventDefault(); pick(COUNTRIES[Math.min(COUNTRIES.length - 1, i + 1)]); }
        if (e.key === 'ArrowUp') { e.preventDefault(); pick(COUNTRIES[Math.max(0, i - 1)]); }
      });
      return [
        frag('<p class="t">お住まいの国または地域を選択してください。<br>' +
          '日付や通貨の表示形式、キーボード レイアウトの既定値が設定されます。</p>'),
        list
      ];
    },
    next: function () { return 'bootdisk'; }
  });

  /* ============================ 11. 起動ディスク ========================== */
  page({
    id: 'bootdisk', step: 1, title: '起動ディスク',
    build: function () {
      return [
        frag('<p class="t">問題が発生したときにコンピュータを起動できるよう、起動ディスクを作成することをお勧めします。</p>'),
        frag('<p class="t">1.44 MB のフォーマット済みフロッピー ディスクを 1 枚用意してください。' +
          'ディスクに保存されている内容は、すべて消去されます。</p>'),
        h('div', { style: { marginTop: '14px' } },
          Radio({ name: 'bd', label: '起動ディスクを作成する(&Y)', checked: S.bootdisk === 'yes', onChange: function () { S.bootdisk = 'yes'; } }),
          Radio({ name: 'bd', label: '起動ディスクを作成しない(&N)', checked: S.bootdisk === 'no', onChange: function () { S.bootdisk = 'no'; } })),
        frag('<div class="note">起動ディスクは、後から [コントロール パネル] の [アプリケーションの追加と削除] で作成することもできます。</div>')
      ];
    },
    next: function (ui) {
      if (S.bootdisk !== 'yes') return 'copystart';
      return dialog({
        title: '起動ディスクの作成', icon: 'info', width: 366,
        body: 'ラベルの付いていないフォーマット済みの 1.44 MB フロッピー ディスクを、ドライブ A: に挿入してください。',
        buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'skip', label: 'キャンセル', esc: true }]
      }).then(function (r) {
        if (r !== 'ok') { S.bootdisk = 'no'; return false; }
        return makeBootDisk();
      });
    }
  });

  function makeBootDisk() {
    return new Promise(function (resolve) {
      var bar = Progress();
      var alive = guard();
      dialog({
        title: '起動ディスクの作成', width: 344, noClose: true, noButtons: true, sound: false,
        body: h('div', {}, h('p', { class: 't', text: 'ドライブ A: に起動ディスクを作成しています...' }), bar),
        onOpen: function (win, done) {
          var p = 0;
          (function tick() {
            if (!alive()) return;
            p += 4 + Math.random() * 7;
            bar.set(p);
            snd.drive();
            if (p >= 100) {
              wait(460).then(function () {
                if (!alive()) return;
                done('done');
                dialog({
                  title: '起動ディスクの作成', icon: 'info', width: 364,
                  body: '起動ディスクの作成が終了しました。<br><br>ディスクに「Windows Me 起動ディスク」とラベルを付けて、安全な場所に保管してください。'
                }).then(function () { resolve('copystart'); });
              });
              return;
            }
            wait(230).then(tick);
          })();
        }
      });
    });
  }

  /* ========================= 12. ファイルのコピー開始 ====================== */
  page({
    id: 'copystart', step: 1, title: 'ファイルのコピーの開始',
    build: function () {
      var dir = S.dirMode === 'other' ? S.dirOther : 'C:\\WINDOWS';
      return [
        frag('<p class="t">Windows Me のファイルをコンピュータにコピーする準備ができました。</p>'),
        h('fieldset', { class: 'grp' }, h('legend', { text: '設定内容' }),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', lineHeight: '1.5' } },
            h('span', { text: 'インストール先:' }), h('span', { text: dir }),
            h('span', { text: 'セットアップの種類:' }), h('span', { text: ({ typical: '標準', portable: 'ポータブル', compact: 'コンパクト', custom: 'カスタム' })[S.type] }),
            h('span', { text: '名前:' }), h('span', { text: S.user.name + (S.user.company ? ' / ' + S.user.company : '') }),
            h('span', { text: 'コンピュータ名:' }), h('span', { text: S.pc.name + '  (' + S.pc.wg + ')' }),
            h('span', { text: '国/地域:' }), h('span', { text: S.country }))),
        frag('<p class="t" style="margin-top:14px">[次へ] をクリックすると、ファイルのコピーを開始します。<br>' +
          'コピー中は、フロッピー ディスクを取り出さないでください。</p>')
      ];
    },
    nextLabel: '次へ(&N) >',
    next: function () { copying(); return false; }
  });

  /* =================== ファイルのコピー（スライドショー付き） ================ */
  var SLIDES = [
    {
      t: 'ホーム ムービーを、自分の手で。',
      d: 'Windows Movie Maker を使うと、ビデオ カメラで撮影した映像をコンピュータに取り込み、いらない部分を切り取って 1 本の作品に仕上げられます。完成したムービーは、電子メールで家族や友人に送れます。',
      art: 'movie'
    },
    {
      t: 'もしものときは、時間を巻き戻す。',
      d: 'システムの復元は、コンピュータの状態を定期的に記録します。新しいソフトウェアを入れて調子が悪くなっても、正常に動いていた日の状態に戻すことができます。',
      art: 'restore'
    },
    {
      t: '家じゅうの PC を、1 本の線でつなぐ。',
      d: 'ホーム ネットワーク ウィザードが、複数のコンピュータの接続を手順どおりに設定します。ファイルやプリンタ、1 つのインターネット接続を、家族みんなで共有できます。',
      art: 'network'
    },
    {
      t: '音楽も映像も、このプレーヤーひとつで。',
      d: 'Windows Media Player 7 は、CD の再生と取り込み、インターネット ラジオ、動画の再生をひとつにまとめました。お気に入りの曲は、プレイリストにして並べ替えられます。',
      art: 'media'
    },
    {
      t: '最新の状態を、自動でお届け。',
      d: '自動更新は、Windows Me の重要な更新をインターネット経由で受け取ります。更新プログラムが用意されると通知されるので、必要なものを選んでインストールできます。',
      art: 'update'
    },
    {
      t: '困ったときは、ヘルプとサポート。',
      d: '新しくなったヘルプとサポートでは、キーワードを入力するだけで、目的の説明やトラブルシューティング ツールを探せます。',
      art: 'help'
    }
  ];

  function slideArt(kind) {
    var g = '<defs><linearGradient id="sky' + kind + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#cfeefb"/><stop offset="1" stop-color="#eef7fb"/></linearGradient></defs>' +
      '<rect width="418" height="196" fill="url(#sky' + kind + ')"/>';
    var body = '';
    if (kind === 'movie') {
      body = '<rect x="58" y="34" width="300" height="130" rx="6" fill="#2b3742" stroke="#16202a"/>' +
        '<rect x="70" y="46" width="276" height="88" fill="#0f1a24"/>' +
        '<path d="M70 134 L150 78 L206 110 L262 66 L346 122 L346 134 Z" fill="#2f7fbf" opacity=".85"/>' +
        '<circle cx="300" cy="66" r="12" fill="#ffd34d"/>' +
        '<rect x="70" y="140" width="276" height="16" fill="#3d4c59"/>' +
        '<rect x="74" y="143" width="120" height="10" fill="#6fc7ea"/>' +
        '<path d="M206 144 l10 5 -10 5z" fill="#fff"/>';
    } else if (kind === 'restore') {
      body = '<circle cx="209" cy="98" r="62" fill="#fff" stroke="#4b8fc4" stroke-width="3"/>' +
        '<path d="M209 52 v46 l30 18" fill="none" stroke="#12456f" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M150 66 a72 72 0 0 1 20-14" fill="none" stroke="#2f9fd8" stroke-width="6"/>' +
        '<path d="M262 42 a74 74 0 0 1 34 46" fill="none" stroke="#2f9fd8" stroke-width="6" stroke-linecap="round"/>' +
        '<path d="M296 88 l-9 -14 18 2z" fill="#2f9fd8"/>' +
        '<rect x="96" y="148" width="226" height="12" rx="3" fill="#b9d7ea"/>';
    } else if (kind === 'network') {
      body = '<path d="M209 30 L318 92 H100 Z" fill="#c0563c"/><rect x="128" y="92" width="162" height="70" fill="#f0e6d2" stroke="#9d8f74"/>' +
        '<rect x="152" y="112" width="34" height="34" fill="#6fc7ea" stroke="#2f6f96"/>' +
        '<rect x="232" y="112" width="34" height="34" fill="#6fc7ea" stroke="#2f6f96"/>' +
        '<rect x="196" y="126" width="26" height="36" fill="#a97b4f" stroke="#6d4b2a"/>' +
        '<circle cx="66" cy="150" r="13" fill="#2f7fbf"/><circle cx="352" cy="150" r="13" fill="#2f7fbf"/>' +
        '<path d="M66 150 H128 M290 150 H352" stroke="#2f7fbf" stroke-width="3" stroke-dasharray="6 5"/>';
    } else if (kind === 'media') {
      body = '<circle cx="209" cy="96" r="58" fill="#d5dde2" stroke="#7d8a91" stroke-width="2"/>' +
        '<circle cx="209" cy="96" r="58" fill="none" stroke="#9ad7f0" stroke-width="12" opacity=".45"/>' +
        '<circle cx="209" cy="96" r="17" fill="#fff" stroke="#7d8a91"/><circle cx="209" cy="96" r="6" fill="#8b959b"/>' +
        '<path d="M96 150 q12 -26 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0" fill="none" stroke="#2f9fd8" stroke-width="3"/>' +
        '<path d="M292 40 v42 a13 10 0 1 1 -8 -9 V52 l26 -7 v34 a13 10 0 1 1 -8 -9 V33z" fill="#12456f"/>';
    } else if (kind === 'update') {
      body = '<rect x="104" y="44" width="210" height="108" rx="7" fill="#d8d3c8" stroke="#5c5850"/>' +
        '<rect x="116" y="56" width="186" height="76" fill="#1f6fa8"/>' +
        '<path d="M209 70 v38 M195 94 l14 16 14 -16" stroke="#bfe9ff" stroke-width="7" fill="none" stroke-linecap="round"/>' +
        '<rect x="150" y="152" width="118" height="8" rx="3" fill="#b8b2a5" stroke="#5c5850"/>' +
        '<circle cx="312" cy="48" r="16" fill="#e04a34" stroke="#8a2416"/>' +
        '<text x="312" y="54" font-size="19" font-weight="700" fill="#fff" text-anchor="middle" font-family="Arial">!</text>';
    } else {
      body = '<rect x="120" y="34" width="178" height="130" rx="4" fill="#fff" stroke="#5c5850"/>' +
        '<rect x="120" y="34" width="40" height="130" fill="#2f7fbf"/>' +
        '<path d="M176 60 h104 M176 78 h104 M176 96 h74" stroke="#a9bcc7" stroke-width="5" stroke-linecap="round"/>' +
        '<circle cx="246" cy="128" r="22" fill="#dff1fb" stroke="#2c5f8c" stroke-width="4"/>' +
        '<path d="M262 144 l20 20" stroke="#2c5f8c" stroke-width="8" stroke-linecap="round"/>';
    }
    return '<svg viewBox="0 0 418 196" width="100%" height="100%" aria-hidden="true">' + g + body + '</svg>';
  }

  var FILES = ['PRECOPY1.CAB', 'WIN_10.CAB', 'KERNEL32.DLL', 'USER32.DLL', 'GDI32.DLL',
    'SHELL32.DLL', 'COMCTL32.DLL', 'EXPLORER.EXE', 'MSHTML.DLL', 'WMPLAYER.EXE',
    'MOVIEMK.EXE', 'RSTRUI.EXE', 'SFC.EXE', 'HTMLHELP.EXE', 'NOTEPAD.EXE',
    'MSPAINT.EXE', 'SNDVOL32.EXE', 'WINHLP32.EXE', 'THEMES.CAB', 'FONTS.CAB',
    'DRIVERS.CAB', 'NET_10.CAB', 'WIN_23.CAB', 'SYSTEM.DAT', 'USER.DAT'];

  function copying() {
    var sh = wizShell(2, null);
    var slidewrap = h('div', { class: 'slidewrap' });
    var slideEls = SLIDES.map(function (s, i) {
      return h('div', { class: 'slide' + (i === 0 ? ' on' : '') },
        frag('<div class="art">' + slideArt(s.art) + '</div>'),
        h('h4', { text: s.t }),
        h('p', { text: s.d }));
    });
    slideEls.forEach(function (e) { add(slidewrap, e); });

    var fn = h('span', { class: 'fn', text: FILES[0] });
    var pc = h('span', { text: '0%' });
    var bar = Progress();
    var foot = h('div', { class: 'copyfoot' },
      h('div', { class: 'st' }, h('span', { text: 'ファイルをコピーしています...' }), fn, pc),
      bar);

    sh.body.remove();
    var main = sh.root.querySelector('.wiz-main');
    main.replaceChildren(slidewrap, foot);
    setScreen(sh.root);

    var alive = guard();
    var p = 0, i = 0, cur = 0;
    var total = 26000;   /* 体感 26 秒 */
    var t0 = Date.now();

    var slideTimer = function () {
      if (!alive()) return;
      slideEls[cur].classList.remove('on');
      wait(460).then(function () {
        if (!alive()) return;
        cur = (cur + 1) % slideEls.length;
        slideEls[cur].classList.add('on');
        wait(4600).then(slideTimer);
      });
    };
    wait(4600).then(slideTimer);

    (function tick() {
      if (!alive()) return;
      var el = (Date.now() - t0) * W.getSpeed();
      p = Math.min(100, (el / total) * 100);
      /* 進みかたに緩急をつける（実機の「93% で止まる」感じ） */
      var shaped = p < 88 ? p : 88 + (p - 88) * 0.85;
      bar.set(shaped);
      pc.textContent = Math.floor(shaped) + '%';
      var idx = Math.min(FILES.length - 1, Math.floor(shaped / 100 * FILES.length));
      if (idx !== i) { i = idx; fn.textContent = FILES[i]; snd.drive(); }
      var remain = Math.max(1, Math.round(S.eta * (1 - shaped / 100)));
      sh.eta.textContent = 'あと ' + remain + ' 分';
      if (p >= 100) { wait(600).then(function () { if (alive()) restartPrompt(); }); return; }
      wait(120).then(tick);
    })();
  }

  /* ============================== 再起動の確認 ============================ */
  function restartPrompt() {
    var sh = wizShell(3, 'コンピュータの再起動');
    var cd = h('b', { text: '15' });
    add(sh.body, [
      frag('<p class="t">Windows Me のファイルのコピーが終了しました。</p>'),
      frag('<p class="t">セットアップを続行するには、コンピュータを再起動する必要があります。<br>' +
        'フロッピー ディスクがドライブに入っている場合は、取り出してください。</p>'),
      h('p', { class: 't', style: { marginTop: '20px' } }, '残り ', cd, ' 秒でコンピュータを再起動します。')
    ]);
    var btn = Btn('今すぐ再起動(&R)', { def: true, onClick: function () { doRestart(); } });
    add(sh.foot, btn);
    setScreen(sh.root);
    var alive = guard(), n = 15;
    (function tick() {
      if (!alive()) return;
      n--;
      cd.textContent = String(n);
      if (n <= 0) { doRestart(); return; }
      wait(1000).then(tick);
    })();
  }
  function doRestart() {
    S.restartCount++;
    window.__bootSequence();
  }

  /* --------------------------------------------------------- 起動シーケンス */
  window.__startSetup = function () { hist.length = 0; go('welcome'); };
  window.__setupGo = go;
  window.__setupState = S;
  window.__wizShell = wizShell;
  window.__guard = guard;

  /* ------------------------------ MS-DOS 起動 ---------------------------- */
  function boot() {
    document.body.dataset.power = 'on';
    var root = h('div', { class: 'screen dos' });
    add(root, h('div', { class: 'topbar', text: 'Microsoft Windows Millennium Edition セットアップ' }));
    var wrap = h('div', { class: 'doswrap' });
    add(root, wrap);
    var bot = h('div', { class: 'botbar' },
      h('span', { text: 'ENTER=続行' }), h('span', { text: 'F3=終了' }));
    add(root, bot);
    setScreen(root);

    var alive = guard();
    var lines = [
      '',
      '<span class="wht">Windows Millennium Edition セットアップへようこそ</span>',
      '',
      'セットアップは、Windows Me をインストールする準備をしています。',
      'この処理には数分かかることがあります。',
      '',
      'セットアップを続行するには、<span class="yel">Enter</span> キーを押してください。',
      'セットアップを終了するには、<span class="yel">F3</span> キーを押してください。',
      ''
    ];
    var i = 0;
    (function type() {
      if (!alive()) return;
      if (i >= lines.length) {
        var c = h('div', { class: 'cur' });
        add(wrap, c);
        return;
      }
      add(wrap, frag('<div>' + (lines[i] || '&nbsp;') + '</div>'));
      i++;
      wait(110).then(type);
    })();

    window.__screenKeys = function (e) {
      if (e.key === 'Enter') { e.preventDefault(); scandisk(); return true; }
      if (e.key === 'F3') { e.preventDefault(); exitScreen(); return true; }
      return false;
    };
    root.addEventListener('click', function () { scandisk(); });
  }
  window.__bootDOS = boot;

  /* ------------------------------ ScanDisk ------------------------------- */
  function scandisk() {
    var root = h('div', { class: 'screen dos' });
    add(root, h('div', { class: 'topbar', text: 'Microsoft ScanDisk' }));
    var wrap = h('div', { class: 'doswrap' });
    var box = h('div', { class: 'box' });
    var st = h('div', { class: 'wht', text: 'ドライブ C: をチェックしています' });
    var meter = h('div', { class: 'meter' });
    var info = h('div', { text: 'ファイル アロケーション テーブル' });
    add(box, [st, h('div', { html: '&nbsp;' }), info, meter]);
    add(wrap, [frag('<div>セットアップは、ハード ディスクにエラーがないかどうかを確認しています。</div>'),
      frag('<div>&nbsp;</div>'), box]);
    add(root, wrap);
    add(root, h('div', { class: 'botbar' }, h('span', { text: 'ESC=中止' })));
    setScreen(root);

    var alive = guard();
    var phases = ['ファイル アロケーション テーブル', 'ディレクトリ構造', 'ファイル システム', '表面スキャン'];
    var ph = 0, n = 0;
    (function tick() {
      if (!alive()) return;
      n += 3;
      meter.textContent = new Array(Math.min(n, 48) + 1).join('\u2588');
      if (n >= 48) {
        n = 0; ph++;
        if (ph >= phases.length) {
          st.textContent = 'チェックが完了しました';
          info.textContent = 'ScanDisk はエラーを検出しませんでした。';
          meter.textContent = '';
          wait(1400).then(function () { if (alive()) prepGui(); });
          return;
        }
        info.textContent = phases[ph];
      }
      snd.drive();
      wait(70).then(tick);
    })();
  }

  /* ------------------------ GUI に切り替わる直前の画面 --------------------- */
  function prepGui() {
    var root = h('div', { class: 'screen dos' });
    add(root, h('div', { class: 'topbar', text: 'Microsoft Windows Millennium Edition セットアップ' }));
    add(root, h('div', { class: 'doswrap' },
      frag('<div style="margin-top:60px">Windows セットアップ ウィザードを起動しています...</div>'),
      frag('<div>&nbsp;</div>'),
      frag('<div class="cur">しばらくお待ちください </div>')));
    setScreen(root);
    var alive = guard();
    wait(2200).then(function () {
      if (!alive()) return;
      setScreen(h('div', { class: 'screen black' }));
      var a2 = guard();
      wait(700).then(function () { if (a2()) window.__startSetup(); });
    });
  }
})();

/* =========================================================================
 * 再起動後 — 起動ロゴ / ハードウェア検出 / ログオン
 * ========================================================================= */
(function () {
  'use strict';
  var W = window.__WinMe;
  var h = W.h, add = W.add, frag = W.frag, wait = W.wait, A = W.A;
  var Btn = W.Btn, Field = W.Field, Radio = W.Radio, Check = W.Check, Progress = W.Progress;
  var dialog = W.dialog, setScreen = W.setScreen, snd = W.snd;
  var S = window.__setupState;
  var wizShell = window.__wizShell, guard = window.__guard;

  /* ---------------------------------------------------- POST → 起動ロゴ */
  function bootLogo(ms, next) {
    var alive;
    var blank = h('div', { class: 'screen black' },
      h('div', { style: { color: '#c8c8c8', font: '15px/19px var(--mono)', padding: '8px' }, text: '_' }));
    setScreen(blank);
    alive = guard();
    wait(700).then(function () {
      if (!alive()) return;
      var root = h('div', { class: 'screen bootscr' });
      add(root, frag('<div>' + A.bootLogo() + '</div>'));
      add(root, h('div', { class: 'sweep' }, h('i')));
      add(root, h('div', { class: 'by', text: 'Microsoft' }));
      setScreen(root);
      var a2 = guard();
      wait(ms).then(function () { if (a2()) next(); });
    });
  }

  window.__bootLogo = bootLogo;

  window.__bootSequence = function () {
    document.body.dataset.power = 'on';
    if (S.restartCount <= 1) bootLogo(4200, hardware);
    else bootLogo(3600, logon);
  };

  /* ------------------------------------------------ ハードウェアの検出 */
  var DEVICES = [
    'プラグ アンド プレイ BIOS',
    'システム デバイス',
    'ディスプレイ アダプタ',
    'マウスとキーボード',
    'フロッピー ディスク コントローラ',
    'ハード ディスク コントローラ',
    'CD-ROM ドライブ',
    'サウンド、ビデオ、およびゲーム コントローラ',
    'ネットワーク アダプタ',
    'ポート (COM / LPT)'
  ];

  function hardware() {
    var sh = wizShell(4, 'ハードウェアのセットアップ');
    var st = h('p', { class: 't', text: 'プラグ アンド プレイ デバイスを検出しています...' });
    var bar = Progress();
    var log = h('div', { class: 'well', style: { height: '150px', overflow: 'auto', padding: '4px 6px', marginTop: '12px' } });
    add(sh.body, [
      frag('<p class="t">セットアップは、コンピュータに接続されているハードウェアを検出しています。<br>' +
        'この処理には数分かかることがあります。</p>'),
      frag('<div class="note">検出中にコンピュータが応答しなくなった場合は、電源を入れ直してください。' +
        'セットアップは中断した位置から再開されます。</div>'),
      h('div', { style: { marginTop: '18px' } }, st, bar),
      log
    ]);
    setScreen(sh.root);

    var alive = guard();
    var i = 0, shown = false;
    (function tick() {
      if (!alive()) return;
      if (i >= DEVICES.length) { bar.set(100); wait(700).then(function () { if (alive()) finalize(); }); return; }
      st.textContent = DEVICES[i] + ' を検出しています...';
      add(log, h('div', { text: '✓ ' + DEVICES[i] }));
      log.scrollTop = log.scrollHeight;
      bar.set(((i + 1) / DEVICES.length) * 100);
      snd.drive();
      i++;
      if (i === 6 && !shown) {
        shown = true;
        newHardware().then(function () { wait(500).then(tick); });
        return;
      }
      wait(650 + Math.random() * 450).then(tick);
    })();
  }

  function newHardware() {
    var bar = Progress();
    return dialog({
      title: '新しいハードウェアが見つかりました', width: 344, noClose: true, noButtons: true, sound: false,
      body: h('div', {},
        h('p', { class: 't', text: 'PCI マルチメディア オーディオ デバイス' }),
        h('p', { class: 't', text: '新しいハードウェアに必要なソフトウェアをインストールしています...' }),
        bar),
      onOpen: function (win, done) {
        var p = 0, alive = guard();
        (function tick() {
          if (!alive()) { done('x'); return; }
          p += 9 + Math.random() * 10;
          bar.set(p);
          if (p >= 100) { wait(420).then(function () { done('ok'); }); return; }
          wait(200).then(tick);
        })();
      }
    });
  }

  /* -------------------------------------------------------- 設定の完了 */
  var FINAL = [
    'コントロール パネル', 'スタート メニューのプログラム', 'Windows ヘルプ',
    'MS-DOS プログラムの設定', 'タイム ゾーンの設定', 'システム構成の更新'
  ];
  function finalize() {
    var sh = wizShell(4, '設定を完了しています');
    var bar = Progress();
    var list = h('div', { style: { marginTop: '14px', lineHeight: '1.9' } });
    var marks = FINAL.map(function (t) {
      var mk = h('span', { style: { display: 'inline-block', width: '16px', color: '#0a7a2a' }, text: '' });
      add(list, h('div', {}, mk, h('span', { text: t })));
      return mk;
    });
    add(sh.body, [
      frag('<p class="t">セットアップは、Windows Me の設定を完了しています。<br>しばらくお待ちください。</p>'),
      list, h('div', { style: { marginTop: '16px' } }, bar)
    ]);
    setScreen(sh.root);

    var alive = guard(), i = 0;
    (function tick() {
      if (!alive()) return;
      if (i >= FINAL.length) { wait(600).then(function () { if (alive()) timezone(); }); return; }
      marks[i].textContent = '✓';
      bar.set(((i + 1) / FINAL.length) * 100);
      i++;
      wait(780).then(tick);
    })();
  }

  /* -------------------------------------------------- タイム ゾーン設定 */
  var ZONES = [
    '(GMT+09:00) 大阪、札幌、東京',
    '(GMT+09:00) ソウル',
    '(GMT+08:00) 北京、重慶、香港、ウルムチ',
    '(GMT+00:00) グリニッジ標準時: ダブリン、エジンバラ、リスボン、ロンドン',
    '(GMT-05:00) 東部標準時 (米国およびカナダ)',
    '(GMT-08:00) 太平洋標準時 (米国およびカナダ)',
    '(GMT+01:00) アムステルダム、ベルリン、ベルン、ローマ、ストックホルム',
    '(GMT+10:00) キャンベラ、メルボルン、シドニー'
  ];
  function timezone(fromCPL) {
    var sel = h('select', { class: 'sel9', style: { width: '100%' } });
    ZONES.forEach(function (z) {
      var o = h('option', { value: z, text: z });
      if (z === S.tz) o.selected = true;
      add(sel, o);
    });
    var clock = h('div', {
      style: {
        textAlign: 'center', font: '700 15px/1.6 var(--mono)', margin: '10px 0 2px',
        fontVariantNumeric: 'tabular-nums'
      }
    });
    var dst = Check({ label: '自動的に夏時間の調整をする(&A)', disabled: true });
    function upd() {
      var d = new Date();
      clock.textContent = d.getFullYear() + '年 ' + (d.getMonth() + 1) + '月 ' + d.getDate() + '日  ' +
        W.pad(d.getHours()) + ':' + W.pad(d.getMinutes()) + ':' + W.pad(d.getSeconds());
    }
    upd();
    var iv = setInterval(upd, 1000);

    return dialog({
      title: '日付と時刻のプロパティ', width: 400, btnAlign: 'right',
      sound: false,
      body: h('div', {},
        h('div', { style: { fontWeight: '700', marginBottom: '8px' }, text: 'タイム ゾーン' }),
        h('label', { html: 'タイム ゾーン(<u>Z</u>):', style: { display: 'block', marginBottom: '4px' } }),
        sel, clock, h('div', { style: { marginTop: '8px' } }, dst),
        h('p', { class: 't dim', style: { marginTop: '10px' }, text: 'コンピュータの時計は、選択したタイム ゾーンに合わせて表示されます。' })),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'cancel', label: 'キャンセル', esc: true }],
      onOpen: function (win) {
        sel.addEventListener('change', function () {
          dst.input.disabled = sel.value.indexOf('GMT+09') < 0 && sel.value.indexOf('GMT+08') < 0 ? false : true;
          dst.classList.toggle('off', dst.input.disabled);
        });
      }
    }).then(function (r) {
      clearInterval(iv);
      if (r === 'ok') S.tz = sel.value;
      if (fromCPL) return;
      saveSettings();
    });
  }
  window.__tzDialog = timezone;

  function saveSettings() {
    var sh = wizShell(4, '設定を保存しています');
    var bar = Progress();
    add(sh.body, [
      frag('<p class="t">Windows Me のセットアップがまもなく完了します。<br>' +
        '設定を保存して、コンピュータを再起動します。</p>'),
      h('div', { style: { marginTop: '22px' } }, bar)
    ]);
    setScreen(sh.root);
    var alive = guard(), p = 0;
    (function tick() {
      if (!alive()) return;
      p += 7;
      bar.set(p);
      if (p >= 100) {
        wait(700).then(function () {
          if (!alive()) return;
          S.restartCount = 2;
          window.__bootSequence();
        });
        return;
      }
      wait(160).then(tick);
    })();
  }

  /* ------------------------------------------------------------ ログオン */
  function logon() {
    var root = h('div', { class: 'screen desk' });
    add(root, h('div', { class: 'wall' }));
    setScreen(root);

    var u = Field({ value: S.user.name || 'ユーザー', w: '176px' });
    var p = Field({ type: 'password', w: '176px' });
    u.dataset.autofocus = '1';

    function ask() {
      dialog({
        title: 'Windows へのログオン', width: 356, noClose: true, sound: false, btnAlign: 'right',
        body: h('div', {},
          h('div', { class: 'dlg-row' },
            frag('<div>' + '<svg width="32" height="32" viewBox="0 0 32 32">' +
              '<circle cx="16" cy="11" r="6" fill="#e8c9a0" stroke="#8a6a45"/>' +
              '<path d="M4 29c0-7 5.4-11 12-11s12 4 12 11z" fill="#4b7fb5" stroke="#2a5b87"/></svg>' + '</div>'),
            h('div', { class: 'msg' }, 'Windows のパスワードを入力してください。')),
          h('div', {
            style: {
              display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 10px',
              alignItems: 'center', marginTop: '14px'
            }
          },
            h('label', { html: 'ユーザー名(<u>U</u>):' }), u,
            h('label', { html: 'パスワード(<u>P</u>):' }), p)),
        buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'cancel', label: 'キャンセル', esc: true }]
      }).then(function (r) {
        if (r !== 'ok') {
          dialog({
            title: 'Windows へのログオン', icon: 'warn', width: 354,
            body: 'ログオンをキャンセルすると、一部の機能が使用できません。<br><br>もう一度ログオンしますか?',
            buttons: [{ id: 'yes', label: 'はい(&Y)', def: true }, { id: 'no', label: 'いいえ(&N)', esc: true }]
          }).then(function (r2) { if (r2 === 'yes') ask(); else enterDesktop(); });
          return;
        }
        S.user.name = u.value.trim() || 'ユーザー';
        if (!p.value) { enterDesktop(); return; }
        confirmPass(p.value, ask);
      });
    }
    function confirmPass(pw, retry) {
      var c = Field({ type: 'password', w: '176px' });
      c.dataset.autofocus = '1';
      dialog({
        title: 'Windows パスワードの設定', width: 356, sound: false, btnAlign: 'right',
        body: h('div', {},
          h('div', { class: 'msg' }, '確認のため、新しいパスワードをもう一度入力してください。'),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 10px', alignItems: 'center', marginTop: '14px' } },
            h('label', { html: 'パスワードの確認入力(<u>C</u>):' }), c)),
        buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'cancel', label: 'キャンセル', esc: true }]
      }).then(function (r) {
        if (r !== 'ok') { retry(); return; }
        if (c.value !== pw) {
          dialog({
            title: 'Windows パスワードの設定', icon: 'error', width: 350,
            body: '入力された 2 つのパスワードが一致しません。<br><br>もう一度入力してください。'
          }).then(function () { confirmPass(pw, retry); });
          return;
        }
        enterDesktop();
      });
    }
    wait(900).then(ask);
  }

  function enterDesktop() {
    var root = h('div', { class: 'screen desk' });
    add(root, h('div', { class: 'wall' }));
    setScreen(root);
    wait(600).then(function () { window.__desktop(); });
  }
  window.__logon = logon;
})();

/* =========================================================================
 * デスクトップ — ウィンドウ マネージャ / スタート メニュー / 付属アプリ
 * ========================================================================= */
(function () {
  'use strict';
  var W = window.__WinMe;
  var h = W.h, add = W.add, esc = W.esc, frag = W.frag, wait = W.wait, A = W.A, IC = W.IC;
  var Btn = W.Btn, Field = W.Field, Radio = W.Radio, Check = W.Check;
  var dialog = W.dialog, setScreen = W.setScreen, snd = W.snd, pad = W.pad;
  var S = window.__setupState;

  var D = null;       /* 現在のデスクトップ参照 */
  var clockIV = null;
  var zTop = 100;

  /* ------------------------------------------------------ ウィンドウ管理 */
  function openWindow(o) {
    if (!D) return null;
    var win = h('div', { class: 'win app', style: { width: o.w + 'px', height: o.h ? o.h + 'px' : 'auto' } });
    var ttl = h('span', { class: 'ttl', text: o.title });
    var bMin = h('button', { class: 'tb min', type: 'button', 'aria-label': '最小化' });
    var bMax = h('button', { class: 'tb max', type: 'button', 'aria-label': '最大化', disabled: true });
    var bX = h('button', { class: 'tb x', type: 'button', 'aria-label': '閉じる' });
    var bar = h('div', { class: 'tbar' }, o.icon ? frag('<span class="ti">' + o.icon + '</span>') : null, ttl, bMin, bMax, bX);
    var cli = h('div', { class: 'cli' });
    add(win, bar); add(win, cli);

    var x = o.x != null ? o.x : 40 + (D.wins.length % 5) * 18;
    var y = o.y != null ? o.y : 30 + (D.wins.length % 5) * 18;
    win.style.left = x + 'px';
    win.style.top = y + 'px';
    D.winlayer.appendChild(win);

    var rec = { win: win, min: false, title: o.title };
    D.wins.push(rec);

    var tb = h('button', { class: 'btn taskbtn', type: 'button' },
      o.icon ? frag('<span class="ti">' + o.icon + '</span>') : null,
      h('span', { class: 'tl', text: o.title }));
    tb.addEventListener('click', function () {
      snd.click();
      if (rec.min) { restore(rec); } else if (D.active === rec) { minimize(rec); } else { focusWin(rec); }
    });
    rec.tb = tb;
    D.tasks.appendChild(tb);

    bX.addEventListener('click', function () { snd.click(); closeWin(rec); });
    bMin.addEventListener('click', function () { snd.click(); minimize(rec); });
    win.addEventListener('pointerdown', function () { focusWin(rec); }, true);
    W.dragify(win, bar);

    rec.close = function () { closeWin(rec); };
    if (o.build) o.build(cli, rec);
    focusWin(rec);
    return rec;
  }
  function focusWin(rec) {
    if (!D) return;
    rec.min = false;
    rec.win.hidden = false;
    rec.win.style.zIndex = ++zTop;
    D.active = rec;
    D.wins.forEach(function (r) {
      r.win.classList.toggle('inactive', r !== rec);
      r.tb.classList.toggle('is-down', r === rec && !r.min);
    });
  }
  function minimize(rec) {
    rec.min = true;
    rec.win.hidden = true;
    rec.tb.classList.remove('is-down');
    if (D.active === rec) D.active = null;
  }
  function restore(rec) { focusWin(rec); }
  function closeWin(rec) {
    rec.win.remove();
    rec.tb.remove();
    var i = D.wins.indexOf(rec);
    if (i >= 0) D.wins.splice(i, 1);
    if (D.active === rec) D.active = null;
  }

  /* ------------------------------------------------------ アイコン ビュー */
  function iconView(items, onOpen) {
    var view = h('div', { class: 'iview', tabindex: '0' });
    items.forEach(function (it) {
      var el = h('div', { class: 'iv' }, frag('<div>' + it.icon + '</div>'), h('div', { class: 'lab', text: it.name }));
      el.setAttribute('aria-selected', 'false');
      el.addEventListener('click', function () {
        view.querySelectorAll('.iv').forEach(function (n) { n.setAttribute('aria-selected', 'false'); });
        el.setAttribute('aria-selected', 'true');
      });
      el.addEventListener('dblclick', function () { snd.click(); onOpen(it); });
      add(view, el);
    });
    return view;
  }
  function explorerChrome(cli, title, items, onOpen, status) {
    cli.classList.add('explorer');
    add(cli, h('div', { class: 'mbar' },
      h('span', { html: 'ファイル(<u>F</u>)' }), h('span', { html: '編集(<u>E</u>)' }),
      h('span', { html: '表示(<u>V</u>)' }), h('span', { html: 'ヘルプ(<u>H</u>)' })));
    add(cli, h('div', { class: 'tstrip' },
      h('button', { class: 'btn tbtn', type: 'button', disabled: true }, frag(IC.back)),
      h('button', { class: 'btn tbtn', type: 'button', disabled: true }, frag(IC.fwd)),
      h('button', { class: 'btn tbtn', type: 'button', disabled: true }, frag(IC.up)),
      h('span', { style: { marginLeft: '8px', fontSize: '11px' }, text: title })));
    add(cli, iconView(items, onOpen));
    add(cli, h('div', { class: 'sbar' },
      h('div', { text: status || (items.length + ' 個のオブジェクト') }),
      h('div', { text: '' })));
  }

  /* ---------------------------------------------------------- 付属アプリ */
  var APPS = {};

  APPS.mycomputer = function () {
    openWindow({
      title: 'マイ コンピュータ', w: 386, h: 262, icon: IC.computer.replace(/width="32" height="32"/, 'width="16" height="16"'),
      build: function (cli) {
        var items = [
          { name: '3.5 インチ FD (A:)', icon: IC.floppy, kind: 'fd' },
          { name: 'ローカル ディスク (C:)', icon: IC.drive, kind: 'hd' },
          { name: 'CD-ROM (D:)', icon: IC.cd, kind: 'cd' },
          { name: 'コントロール パネル', icon: IC.cpl, kind: 'cpl' }
        ];
        explorerChrome(cli, 'マイ コンピュータ', items, function (it) {
          if (it.kind === 'cpl') return APPS.control();
          if (it.kind === 'fd') {
            return dialog({
              title: 'ドライブ A: にアクセスできません', icon: 'error', width: 352,
              body: 'デバイスの準備ができていません。<br><br>ドライブ A: にディスクが挿入されていることを確認してください。',
              buttons: [{ id: 'r', label: '再試行(&R)', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
            });
          }
          driveProps(it);
        }, '4 個のオブジェクト');
      }
    });
  };

  function driveProps(it) {
    var cap = it.kind === 'cd' ? 650 : 2048;
    var used = it.kind === 'cd' ? 512 : 731;
    var free = cap - used;
    var pie = '<svg width="86" height="86" viewBox="0 0 42 42">' +
      '<circle r="15.9" cx="21" cy="21" fill="#2f7fbf"/>' +
      '<circle r="15.9" cx="21" cy="21" fill="transparent" stroke="#d13a2c" stroke-width="31.8" ' +
      'stroke-dasharray="' + (used / cap * 100) + ' ' + (100 - used / cap * 100) + '" transform="rotate(-90 21 21)"/>' +
      '</svg>';
    dialog({
      title: it.name + ' のプロパティ', width: 340, sound: false, btnAlign: 'right',
      body: h('div', {},
        h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } },
          frag(pie),
          h('div', { style: { lineHeight: '1.9' } },
            h('div', { html: '<span style="display:inline-block;width:10px;height:10px;background:#d13a2c;margin-right:6px"></span>使用領域: ' + used.toLocaleString() + ' MB' }),
            h('div', { html: '<span style="display:inline-block;width:10px;height:10px;background:#2f7fbf;margin-right:6px"></span>空き領域: ' + free.toLocaleString() + ' MB' }),
            h('div', { style: { borderTop: '1px solid #808080', paddingTop: '4px', marginTop: '4px' }, text: '容量: ' + cap.toLocaleString() + ' MB' }))),
        h('p', { class: 't dim', style: { marginTop: '12px' }, text: 'ファイル システム: ' + (it.kind === 'cd' ? 'CDFS' : 'FAT32') })),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
    });
  }

  APPS.recycle = function () {
    openWindow({
      title: 'ごみ箱', w: 340, h: 230, icon: IC.bin.replace(/width="32" height="32"/, 'width="16" height="16"'),
      build: function (cli) { explorerChrome(cli, 'ごみ箱', [], function () {}, '0 個のオブジェクト'); }
    });
  };

  APPS.control = function () {
    openWindow({
      title: 'コントロール パネル', w: 386, h: 250, icon: IC.cpl.replace(/width="32" height="32"/, 'width="16" height="16"'),
      build: function (cli) {
        var items = [
          { name: '画面', icon: IC.cpl, kind: 'disp' },
          { name: '日付と時刻', icon: IC.drive, kind: 'tz' },
          { name: 'システム', icon: IC.computer, kind: 'sys' },
          { name: 'サウンド', icon: IC.cd, kind: 'snd' }
        ];
        explorerChrome(cli, 'コントロール パネル', items, function (it) {
          if (it.kind === 'tz') return window.__tzDialog(true);
          if (it.kind === 'disp') return displayProps();
          if (it.kind === 'sys') return sysProps();
          dialog({
            title: 'サウンドのプロパティ', icon: 'info', width: 340,
            body: 'この再現では、サウンドの詳細設定は用意されていません。<br><br>画面の下にある [音] ボタンで、効果音の有無を切り替えられます。'
          });
        }, '4 個のオブジェクト');
      }
    });
  };

  var WALLS = [
    ['標準 (Windows ブルー)', 'linear-gradient(180deg,#4f86bd 0%,#3a6ea5 46%,#26588a 100%)'],
    ['ティール', 'linear-gradient(180deg,#2a8f9e 0%,#14707f 55%,#0a4c58 100%)'],
    ['ミッドナイト', 'linear-gradient(180deg,#26324a 0%,#161d2c 60%,#0b0f18 100%)'],
    ['サンセット', 'linear-gradient(180deg,#e0855b 0%,#b3554a 52%,#5c2b45 100%)'],
    ['クラシック グレー', 'linear-gradient(180deg,#9a9488 0%,#7f7a70 100%)']
  ];
  function displayProps() {
    var cur = D.wallIdx;
    var list = h('div', { class: 'well lst', style: { height: '112px' }, tabindex: '0' });
    var prev = h('div', { style: { width: '132px', height: '100px', border: '1px solid #5c5850', borderRadius: '4px', overflow: 'hidden' } });
    var pin = h('div', { style: { width: '100%', height: '100%' } });
    add(prev, pin);
    var showLogo = Check({ label: 'ロゴを表示する(&L)', checked: D.showMark });
    function paint(i) { pin.style.background = WALLS[i][1]; }
    WALLS.forEach(function (w2, i) {
      var it = h('div', { class: 'it', text: w2[0] });
      it.setAttribute('aria-selected', i === cur ? 'true' : 'false');
      it.addEventListener('click', function () {
        cur = i; paint(i);
        list.querySelectorAll('.it').forEach(function (n, j) { n.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      });
      add(list, it);
    });
    paint(cur);
    dialog({
      title: '画面のプロパティ', width: 388, sound: false, btnAlign: 'right',
      body: h('div', {},
        h('div', { style: { fontWeight: '700', marginBottom: '8px' }, text: '背景' }),
        h('div', { style: { display: 'flex', gap: '14px' } }, prev,
          h('div', { style: { flex: '1' } }, h('label', { html: 'デザイン(<u>D</u>):', style: { display: 'block', marginBottom: '4px' } }), list)),
        h('div', { style: { marginTop: '10px' } }, showLogo)),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }, { id: 'ap', label: '適用(&A)' }],
      onButton: function (id) {
        if (id === 'ap' || id === 'ok') applyWall(cur, showLogo.input.checked);
        if (id === 'ap') return false;
      }
    });
  }
  function applyWall(i, mark) {
    D.wallIdx = i;
    D.showMark = mark;
    D.wall.style.background = WALLS[i][1];
    D.mark.style.display = mark ? '' : 'none';
  }

  function sysProps() {
    var k = S.key.join('').replace(/(.{5})(?=.)/g, '$1-') || '-----';
    dialog({
      title: 'システムのプロパティ', width: 372, sound: false, btnAlign: 'right',
      body: h('div', { style: { display: 'flex', gap: '16px' } },
        frag('<div>' + A.flag(54, true) + '</div>'),
        h('div', { style: { lineHeight: '1.85', flex: '1' } },
          h('div', { style: { fontWeight: '700' }, text: 'システム:' }),
          h('div', { text: 'Microsoft Windows Millennium Edition' }),
          h('div', { text: '4.90.3000' }),
          h('div', { style: { fontWeight: '700', marginTop: '8px' }, text: '使用者:' }),
          h('div', { text: S.user.name }),
          h('div', { text: S.user.company || '(会社名なし)' }),
          h('div', { text: k }),
          h('div', { style: { fontWeight: '700', marginTop: '8px' }, text: 'コンピュータ:' }),
          h('div', { text: 'Pentium(R) III プロセッサ' }),
          h('div', { text: '128.0 MB RAM' }))),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
    });
  }

  APPS.notepad = function () {
    openWindow({
      title: '無題 - メモ帳', w: 340, h: 230,
      build: function (cli) {
        add(cli, h('div', { class: 'mbar' },
          h('span', { html: 'ファイル(<u>F</u>)' }), h('span', { html: '編集(<u>E</u>)' }),
          h('span', { html: '検索(<u>S</u>)' }), h('span', { html: 'ヘルプ(<u>H</u>)' })));
        var ta = h('textarea', { class: 'np' });
        ta.value = '';
        add(cli, ta);
        setTimeout(function () { ta.focus(); }, 30);
      }
    });
  };

  APPS.paint = function () {
    var colors = ['#000000', '#808080', '#ffffff', '#d13a2c', '#f2c31c', '#3fa34d', '#2f7fbf', '#7b4ea8'];
    openWindow({
      title: '無題 - ペイント', w: 376, h: 276,
      build: function (cli) {
        add(cli, h('div', { class: 'mbar' },
          h('span', { html: 'ファイル(<u>F</u>)' }), h('span', { html: '編集(<u>E</u>)' }), h('span', { html: 'ヘルプ(<u>H</u>)' })));
        var cv = h('canvas', { class: 'pcanvas', width: '330', height: '176' });
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 330, 176);
        var col = '#000000', size = 3, drawing = false;
        var sw = h('div', { class: 'swatches' });
        colors.forEach(function (c) {
          var b = h('button', { class: 'sw', type: 'button', style: { background: c }, 'aria-label': c });
          b.addEventListener('click', function () {
            col = c;
            sw.querySelectorAll('.sw').forEach(function (n) { n.classList.remove('on'); });
            b.classList.add('on');
          });
          add(sw, b);
        });
        sw.firstElementChild.classList.add('on');
        add(sw, h('span', { style: { flex: '1' } }));
        add(sw, Btn('消去', { onClick: function () { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 330, 176); } }));
        var sizes = h('div', { class: 'swatches' });
        [1, 3, 7].forEach(function (s2) {
          var b = h('button', { class: 'sw dot', type: 'button' }, h('i', { style: { width: (s2 + 2) + 'px', height: (s2 + 2) + 'px' } }));
          b.addEventListener('click', function () {
            size = s2;
            sizes.querySelectorAll('.sw').forEach(function (n) { n.classList.remove('on'); });
            b.classList.add('on');
          });
          add(sizes, b);
        });
        sizes.children[1].classList.add('on');
        add(cli, h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', padding: '3px 2px' } }, sizes, sw));
        var holder = h('div', { class: 'pwrap' }, cv);
        add(cli, holder);
        function pos(e) {
          var r = cv.getBoundingClientRect();
          return { x: (e.clientX - r.left) * (330 / r.width), y: (e.clientY - r.top) * (176 / r.height) };
        }
        cv.addEventListener('pointerdown', function (e) {
          drawing = true;
          cv.setPointerCapture(e.pointerId);
          var p = pos(e);
          ctx.strokeStyle = col; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y); ctx.stroke();
        });
        cv.addEventListener('pointermove', function (e) {
          if (!drawing) return;
          var p = pos(e);
          ctx.lineTo(p.x, p.y); ctx.stroke();
        });
        cv.addEventListener('pointerup', function () { drawing = false; });
        cv.addEventListener('pointerleave', function () { drawing = false; });
      }
    });
  };

  /* ------------------------------------------------------ MS-DOS 風端末 */
  function makeTerminal(opts) {
    opts = opts || {};
    var out = h('div', { class: 'termout' });
    var inp = h('input', { class: 'termin', spellcheck: 'false', autocomplete: 'off' });
    var line = h('div', { class: 'termline' }, h('span', { text: 'C:\\WINDOWS>' }), inp);
    var el = h('div', { class: 'term' }, out, line);
    function say(t) { add(out, h('div', { text: t })); el.scrollTop = el.scrollHeight; }
    (opts.banner || []).forEach(say);
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var raw = inp.value;
      var cmd = raw.trim().toLowerCase();
      say('C:\\WINDOWS>' + raw);
      inp.value = '';
      if (!cmd) return;
      if (cmd === 'cls') { out.replaceChildren(); return; }
      if (cmd === 'ver') { say(''); say('Windows Millennium [Version 4.90.3000]'); say(''); return; }
      if (cmd === 'date') { say('現在の日付: ' + new Date().toLocaleDateString('ja-JP')); return; }
      if (cmd === 'time') { say('現在の時刻: ' + new Date().toLocaleTimeString('ja-JP')); return; }
      if (cmd === 'dir') {
        say('');
        say(' ドライブ C のボリューム ラベルは WIN_ME です');
        say(' ディレクトリは C:\\WINDOWS');
        say('');
        [['.', '<DIR>', '10-14-00  9:18a'], ['..', '<DIR>', '10-14-00  9:18a'],
         ['WIN      COM', '25,473', '06-08-00  5:00p'], ['EXPLORER EXE', '191,536', '06-08-00  5:00p'],
         ['NOTEPAD  EXE', '53,248', '06-08-00  5:00p'], ['SYSTEM   DAT', '1,703,936', '10-14-00  9:20a'],
         ['SYSTEM        ', '<DIR>', '10-14-00  9:18a'], ['DESKTOP       ', '<DIR>', '10-14-00  9:19a']]
          .forEach(function (r) { say(r[0].padEnd(16) + r[1].padStart(11) + '  ' + r[2]); });
        say('        8 個のファイル       1,974,193 バイト');
        say('                         1,341,652,992 バイトの空き');
        say('');
        return;
      }
      if (cmd === 'help') {
        say(''); say('使用できるコマンド: VER, DIR, CLS, DATE, TIME, ' + (opts.winCmd ? 'WIN, ' : '') + 'EXIT');
        say(''); return;
      }
      if (cmd === 'win' && opts.winCmd) { opts.onWin(); return; }
      if (cmd === 'exit') { opts.onExit && opts.onExit(); return; }
      say("'" + raw.trim().split(/\s+/)[0] + "' は、内部コマンドまたは外部コマンド、");
      say('操作可能なプログラムまたはバッチ ファイルとして認識されていません。');
      say('');
    });
    el.addEventListener('click', function () { inp.focus(); });
    el.focusInput = function () { setTimeout(function () { inp.focus(); }, 40); };
    return el;
  }

  APPS.prompt = function () {
    openWindow({
      title: 'MS-DOS プロンプト', w: 392, h: 250,
      build: function (cli, rec) {
        var t = makeTerminal({
          banner: ['Microsoft(R) Windows Millennium', '   (C) Copyright Microsoft Corp 1981-1999.', ''],
          onExit: function () { rec.close(); }
        });
        cli.style.padding = '2px';
        add(cli, t);
        t.focusInput();
      }
    });
  };

  /* ------------------------------------------------------ スタート メニュー */
  function menuItem(o) {
    var it = h('div', { class: 'smi' + (o.sep ? ' sep' : '') });
    if (o.sep) return it;
    add(it, h('span', { class: 'mi', style: { width: '20px', display: 'inline-flex', justifyContent: 'center' } },
      o.icon ? frag(o.icon.replace(/width="32" height="32"/, 'width="18" height="18"')) : null));
    add(it, h('span', { html: esc(o.label) }));
    if (o.sub) add(it, h('span', { class: 'ar', text: '\u25B6' }));
    return it;
  }

  function buildStartMenu() {
    var menu = h('div', { class: 'startmenu' });
    var banner = h('div', { class: 'banner' }, h('span', {}, frag('Windows <em>Me</em>')));
    var items = h('div', { class: 'smitems' });
    add(menu, banner); add(menu, items);

    var subOpen = null;
    function closeSub() { if (subOpen) { subOpen.remove(); subOpen = null; } }

    var DEF = [
      { label: 'Windows Update', icon: IC.globe, act: function () { info('Windows Update', 'インターネットに接続して、Windows Me の更新を確認します。<br><br>この再現では、実際の接続は行われません。'); } },
      { sep: true },
      { label: 'プログラム', icon: IC.folder, sub: [
        { label: 'アクセサリ', icon: IC.folder, sub2: true },
        { label: 'メモ帳', act: APPS.notepad },
        { label: 'ペイント', act: APPS.paint },
        { label: 'MS-DOS プロンプト', act: APPS.prompt },
        { label: 'Windows Movie Maker', act: function () { info('Windows Movie Maker', 'ビデオの取り込みと編集を行うツールです。<br><br>この再現では、機能は用意されていません。'); } },
        { label: 'Windows Media Player', act: function () { info('Windows Media Player 7', '音楽や動画を再生するプレーヤーです。<br><br>この再現では、機能は用意されていません。'); } }
      ] },
      { label: 'お気に入り', icon: IC.star, sub: [
        { label: 'リンク', act: function () { info('お気に入り', '登録されたページはありません。'); } },
        { label: 'チャンネル', act: function () { info('お気に入り', '登録されたページはありません。'); } }
      ] },
      { label: '最近使ったファイル', icon: IC.docs, sub: [{ label: '(空)', act: function () {} }] },
      { label: '設定', icon: IC.cpl, sub: [
        { label: 'コントロール パネル', act: APPS.control },
        { label: '画面のプロパティ', act: displayProps },
        { label: 'タスク バーとスタート メニュー', act: function () { info('タスク バーのプロパティ', 'この再現では、タスク バーの設定は変更できません。'); } }
      ] },
      { label: '検索', icon: IC.find, sub: [
        { label: 'ファイルやフォルダ', act: function () { info('検索', '検索条件に一致するファイルは見つかりませんでした。'); } }
      ] },
      { label: 'ヘルプ', icon: IC.help, act: function () { info('ヘルプとサポート', 'キーワードを入力すると、関連する説明やトラブルシューティング ツールを探せます。<br><br>この再現では、目次は用意されていません。'); } },
      { label: 'ファイル名を指定して実行...', icon: IC.run, act: runDialog },
      { sep: true },
      { label: 'ログオフ ' + (S.user.name || 'ユーザー') + '...', icon: IC.computer, act: function () {
        dialog({
          title: 'Windows のログオフ', icon: 'ask', width: 340,
          body: 'Windows をログオフしますか?',
          buttons: [{ id: 'y', label: 'はい(&Y)', def: true }, { id: 'n', label: 'いいえ(&N)', esc: true }]
        }).then(function (r) { if (r === 'y') { stopClock(); window.__logon(); } });
      } },
      { label: 'Windows の終了...', icon: IC.power, act: shutdownDialog }
    ];

    DEF.forEach(function (o) {
      var it = menuItem(o);
      add(items, it);
      if (o.sep) return;
      it.addEventListener('mouseenter', function () {
        closeSub();
        if (!o.sub) return;
        var sm = h('div', { class: 'submenu' });
        o.sub.forEach(function (c) {
          var ci = menuItem(c);
          ci.addEventListener('click', function (ev) {
            ev.stopPropagation();
            snd.click();
            closeStart();
            if (c.act) c.act();
            else info(c.label, 'この再現では、このプログラムは用意されていません。');
          });
          add(sm, ci);
        });
        menu.appendChild(sm);
        var r = it.getBoundingClientRect(), mr = menu.getBoundingClientRect();
        sm.style.left = (menu.offsetWidth - 3) + 'px';
        sm.style.top = Math.max(0, it.offsetTop - 2) + 'px';
        var sc = parseFloat(getComputedStyle(W.refs().crt).getPropertyValue('--s')) || 1;
        var over = (mr.left + menu.offsetWidth * sc + sm.offsetWidth * sc) - (W.refs().screenWrap.getBoundingClientRect().right);
        if (over > 0) sm.style.left = (menu.offsetWidth - 3 - sm.offsetWidth / 1) + 'px';
        var bottomOver = it.offsetTop + sm.offsetHeight - menu.offsetHeight;
        if (bottomOver > 0) sm.style.top = Math.max(0, it.offsetTop - bottomOver - 4) + 'px';
        subOpen = sm;
      });
      it.addEventListener('click', function () {
        if (o.sub) return;
        snd.click();
        closeStart();
        if (o.act) o.act();
      });
    });
    return menu;
  }

  function info(title, body) {
    return dialog({ title: title, icon: 'info', width: 356, body: body });
  }

  function runDialog() {
    var f = Field({ w: '100%' });
    f.dataset.autofocus = '1';
    dialog({
      title: 'ファイル名を指定して実行', width: 356, sound: false, btnAlign: 'right',
      body: h('div', {},
        h('div', { class: 'dlg-row' }, frag('<div>' + IC.run + '</div>'),
          h('div', { class: 'msg' }, '実行するプログラム名、または開くフォルダやドキュメント名を入力してください。')),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '14px' } },
          h('label', { html: '名前(<u>O</u>):' }), h('div', { style: { flex: '1' } }, f))),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true },
        { id: 'b', label: '参照(&B)...' }],
      onButton: function (id) {
        if (id === 'b') { info('参照', 'この再現では、ファイルの参照はできません。'); return false; }
      }
    }).then(function (r) {
      if (r !== 'ok') return;
      var v = f.value.trim().toLowerCase().replace(/\.exe$/, '');
      var map = {
        notepad: APPS.notepad, 'メモ帳': APPS.notepad,
        mspaint: APPS.paint, paint: APPS.paint, 'ペイント': APPS.paint,
        command: APPS.prompt, cmd: APPS.prompt, 'ms-dos': APPS.prompt,
        explorer: APPS.mycomputer, control: APPS.control,
        winver: function () { sysProps(); },
        sysedit: function () { info('SYSEDIT', 'システム構成エディタは、この再現には含まれていません。'); }
      };
      if (map[v]) { map[v](); return; }
      if (!v) return;
      dialog({
        title: 'ファイル名を指定して実行', icon: 'error', width: 372,
        body: "'" + esc(f.value.trim()) + "' が見つかりません。名前を正しく入力したかどうかを確認してから、やり直してください。"
      }).then(runDialog);
    });
  }

  /* -------------------------------------------------------- 終了オプション */
  function shutdownDialog() {
    var mode = 'off';
    function r(v, label) {
      return Radio({ name: 'sd', label: label, checked: mode === v, onChange: function () { mode = v; } });
    }
    dialog({
      title: 'Windows の終了', width: 356, sound: false, btnAlign: 'right',
      body: h('div', {},
        h('div', { class: 'dlg-row' }, frag('<div>' + IC.power + '</div>'),
          h('div', { class: 'msg' }, '次の中から選んでください。')),
        h('div', { style: { marginTop: '14px' } },
          r('off', '電源を切れる状態にする(&S)'),
          r('restart', '再起動する(&R)'),
          r('dos', 'MS-DOS モードで再起動する(&M)'),
          r('standby', 'スタンバイ(&T)'))),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true },
        { id: 'h', label: 'ヘルプ(&H)' }],
      onButton: function (id) {
        if (id === 'h') { info('Windows の終了', 'コンピュータの電源を切る前に、必ずこの画面から終了してください。'); return false; }
      }
    }).then(function (res) {
      if (res !== 'ok') return;
      stopClock();
      if (mode === 'standby') return standby();
      if (mode === 'restart') { snd.shutdown(); return fadeOut(function () { window.__bootLogo(3000, window.__desktop); }); }
      if (mode === 'dos') { snd.shutdown(); return fadeOut(dosMode); }
      snd.shutdown();
      fadeOut(powerOff);
    });
  }

  function fadeOut(next) {
    var root = h('div', { class: 'screen desk' });
    add(root, h('div', { class: 'wall', style: { background: WALLS[D ? D.wallIdx : 0][1] } }));
    var msg = h('div', {
      style: {
        position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }
    }, h('div', {
      class: 'win', style: { position: 'static', width: '300px', padding: '3px' }
    }, h('div', { class: 'tbar' }, h('span', { class: 'ttl', text: 'Windows の終了' })),
      h('div', { class: 'cli' }, h('p', { class: 't', text: 'しばらくお待ちください。Windows を終了しています...' }))));
    add(root, msg);
    setScreen(root);
    wait(2400).then(next);
  }

  function powerOff() {
    document.body.dataset.power = 'off';
    var root = h('div', { class: 'screen offscr' });
    var b = Btn('電源を入れる', { def: true, onClick: function () { document.body.dataset.power = 'on'; window.__bootDOS(); } });
    b.style.marginTop = '26px';
    add(root, h('div', { class: 'msg' }, 'コンピュータの電源を', h('br'), '切る準備ができました。', h('div', {}, b)));
    setScreen(root);
  }

  function standby() {
    document.body.dataset.power = 'standby';
    var root = h('div', { class: 'screen black' });
    add(root, h('div', {
      style: {
        position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#2b3a44', font: '12px var(--ui)'
      }, text: 'スタンバイ中 — 画面をクリックすると再開します'
    }));
    root.addEventListener('click', function () {
      document.body.dataset.power = 'on';
      window.__desktop();
    });
    setScreen(root);
  }

  function dosMode() {
    document.body.dataset.power = 'on';
    var root = h('div', { class: 'screen', style: { background: '#000' } });
    var t = makeTerminal({
      banner: ['Microsoft(R) Windows Millennium', '   (C) Copyright Microsoft Corp 1981-1999.', '',
        'WIN と入力すると Windows に戻ります。', ''],
      winCmd: true,
      onWin: function () { window.__bootLogo(2600, window.__desktop); },
      onExit: function () { window.__bootLogo(2600, window.__desktop); }
    });
    t.classList.add('full');
    add(root, t);
    setScreen(root);
    t.focusInput();
  }

  /* -------------------------------------------------------------- 本体 */
  function stopClock() { if (clockIV) { clearInterval(clockIV); clockIV = null; } }

  var startMenuEl = null;
  function closeStart() {
    if (startMenuEl) { startMenuEl.remove(); startMenuEl = null; }
    if (D) D.startBtn.classList.remove('is-down');
  }
  function toggleStart() {
    if (startMenuEl) { closeStart(); return; }
    startMenuEl = buildStartMenu();
    D.root.appendChild(startMenuEl);
    D.startBtn.classList.add('is-down');
  }

  window.__desktop = function () {
    stopClock();
    var root = h('div', { class: 'screen desk' });
    var wall = h('div', { class: 'wall' });
    var mark = frag('<div class="wallmark">' + A.wordmark(260, true) + '</div>');
    var icons = h('div', { class: 'icons' });
    var winlayer = h('div', { class: 'winlayer' });
    var tasks = h('div', { class: 'tasks' });
    var clock = h('div', { id: 'clock' });
    var startBtn = h('button', { class: 'btn', id: 'startbtn', type: 'button' },
      frag(A.flag(15, true)), h('span', { text: 'スタート' }));
    var taskbar = h('div', { class: 'taskbar' }, startBtn, tasks,
      h('div', { class: 'tray' }, frag('<span title="音量">' +
        '<svg width="13" height="13" viewBox="0 0 16 16"><path d="M3 6h3l4-3v10l-4-3H3z" fill="#4a4a4a"/>' +
        '<path d="M11.5 5.5a4 4 0 0 1 0 5" fill="none" stroke="#4a4a4a"/></svg></span>'), clock));

    add(root, [wall, mark, icons, winlayer, taskbar]);

    D = {
      root: root, wall: wall, mark: mark, winlayer: winlayer, tasks: tasks,
      startBtn: startBtn, wins: [], active: null, wallIdx: 0, showMark: true
    };

    var DESKICONS = [
      { name: 'マイ コンピュータ', icon: IC.computer, act: APPS.mycomputer },
      { name: 'マイ ドキュメント', icon: IC.docs, act: function () { info('マイ ドキュメント', 'このフォルダは空です。'); } },
      { name: 'インターネット', icon: IC.globe, act: function () { info('インターネット接続ウィザード', 'ダイヤルアップ接続は構成されていません。<br><br>この再現では、インターネットには接続しません。'); } },
      { name: 'ネットワーク コンピュータ', icon: IC.network, act: function () { info('ネットワーク コンピュータ', 'ワークグループ ' + S.pc.wg + ' には、ほかのコンピュータは見つかりませんでした。'); } },
      { name: 'ごみ箱', icon: IC.bin, act: APPS.recycle }
    ];
    DESKICONS.forEach(function (d) {
      var el = h('div', { class: 'dicon' }, frag('<div>' + d.icon + '</div>'), h('div', {}, h('span', { class: 'lab', text: d.name })));
      el.setAttribute('aria-selected', 'false');
      el.tabIndex = 0;
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        icons.querySelectorAll('.dicon').forEach(function (n) { n.setAttribute('aria-selected', 'false'); });
        el.setAttribute('aria-selected', 'true');
      });
      el.addEventListener('dblclick', function () { snd.click(); d.act(); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { snd.click(); d.act(); } });
      add(icons, el);
    });

    startBtn.addEventListener('click', function (e) { e.stopPropagation(); snd.click(); toggleStart(); });
    root.addEventListener('click', function () {
      closeStart();
      icons.querySelectorAll('.dicon').forEach(function (n) { n.setAttribute('aria-selected', 'false'); });
    });

    function tickClock() {
      var d = new Date();
      clock.textContent = W.pad(d.getHours()) + ':' + W.pad(d.getMinutes());
    }
    tickClock();
    clockIV = setInterval(tickClock, 15000);

    setScreen(root);
    startMenuEl = null;
    snd.start();

    wait(1400).then(function () {
      if (!D || D.root !== root) return;
      openWindow({
        title: 'Windows Me へようこそ', w: 344, y: 120, x: 150,
        build: function (cli, rec) {
          add(cli, h('div', { style: { display: 'flex', gap: '14px' } },
            frag('<div>' + A.flag(46, true) + '</div>'),
            h('div', { style: { flex: '1', lineHeight: '1.7' } },
              h('div', { style: { fontWeight: '700', marginBottom: '6px' }, text: 'ようこそ、' + (S.user.name || 'ユーザー') + 'さん' }),
              h('div', { text: 'セットアップが完了しました。デスクトップのアイコンはダブルクリックで開けます。[スタート] からプログラムやコントロール パネルを試してみてください。' }))));
          add(cli, h('div', { class: 'dlg-btns right' },
            Btn('ツアーの開始(&T)', { onClick: function () { info('Windows Me ツアー', 'この再現に含まれているのは、セットアップ画面とデスクトップの基本操作だけです。<br><br>[スタート] メニューからメモ帳・ペイント・MS-DOS プロンプトを開けます。'); } }),
            Btn('閉じる', { def: true, onClick: function () { rec.close(); } })));
        }
      });
    });
  };
})();

/* =========================================================================
 * 起動 — 画面の組み立て / 拡大縮小 / キーボード操作
 * ========================================================================= */
(function () {
  'use strict';
  var W = window.__WinMe;
  var h = W.h, add = W.add, frag = W.frag;

  var CRT_W = 0, CRT_H = 0, fit = true;

  var screenWrap = h('div', { id: 'screenwrap' });
  var bezel = h('div', { id: 'bezel' },
    h('div', { class: 'brand', text: 'MULTISYNC 1500' }),
    h('div', { class: 'knobs' },
      h('span', { class: 'knob' }), h('span', { class: 'knob' }), h('span', { id: 'led' })));
  var crt = h('div', { id: 'crt' }, screenWrap, bezel);
  var stage = h('div', { id: 'stage' }, crt);

  function dockBtn(label, o) {
    var b = h('button', { type: 'button', text: label });
    if (o && o.pressed != null) b.setAttribute('aria-pressed', String(o.pressed));
    b.addEventListener('click', function () { o.onClick(b); });
    return b;
  }

  var bSound = dockBtn('音: OFF', {
    pressed: false,
    onClick: function (b) {
      var v = !W.getSound();
      W.setSound(v);
      b.textContent = '音: ' + (v ? 'ON' : 'OFF');
      b.setAttribute('aria-pressed', String(v));
      if (v) W.snd.click();
    }
  });
  var bScan = dockBtn('走査線', {
    pressed: false,
    onClick: function (b) {
      var v = !document.body.classList.contains('scanlines');
      document.body.classList.toggle('scanlines', v);
      b.setAttribute('aria-pressed', String(v));
    }
  });
  var bSpeed = dockBtn('速度 ×1', {
    onClick: function (b) {
      var v = W.getSpeed() === 1 ? 2 : (W.getSpeed() === 2 ? 4 : 1);
      W.setSpeed(v);
      b.textContent = '速度 ×' + v;
      b.setAttribute('aria-pressed', String(v !== 1));
    }
  });
  var bFit = dockBtn('表示: フィット', {
    pressed: true,
    onClick: function (b) {
      fit = !fit;
      b.textContent = '表示: ' + (fit ? 'フィット' : '等倍');
      b.setAttribute('aria-pressed', String(fit));
      resize();
    }
  });
  var bReset = dockBtn('最初から', {
    onClick: function () {
      document.body.dataset.power = 'on';
      window.__setupState.restartCount = 0;
      window.__bootDOS();
    }
  });

  var dock = h('div', { id: 'dock' },
    h('div', { class: 'grp' }, bSound, bScan, bSpeed),
    h('div', { class: 'grp' }, bFit, bReset));

  var hint = h('div', { id: 'hint' }, frag(
    '<kbd>Enter</kbd> 既定のボタン ・ <kbd>Esc</kbd> キャンセル ・ ' +
    '<kbd>Tab</kbd> 移動 ・ <kbd>Alt</kbd>+下線の文字<br>' +
    '※ Windows Me のセットアップ画面を再現した非公式のファンメイド作品です。' +
    'ロゴ・画面はすべて SVG と CSS の描き起こしで、実際のシステムには変更を加えません。'));

  document.body.append(stage, dock, hint);
  W.bindRefs(screenWrap, stage, crt);

  /* ------------------------------------------------------------ 拡大縮小 */
  function resize() {
    if (!CRT_W) { CRT_W = crt.offsetWidth; CRT_H = crt.offsetHeight; }
    var availW = Math.max(240, document.documentElement.clientWidth - 32);
    var availH = Math.max(220, window.innerHeight - dock.offsetHeight - hint.offsetHeight - 58);
    var s = fit ? Math.min(availW / CRT_W, availH / CRT_H) : 1;
    s = Math.max(0.3, Math.min(s, 2.4));
    if (!fit) s = Math.min(1, availW / CRT_W);
    apply(s);
    /* 実際に組んでみて縦にあふれたら、あふれた分だけ詰める */
    if (fit) {
      var over = document.documentElement.scrollHeight - window.innerHeight;
      if (over > 2) apply(Math.max(0.3, (CRT_H * s - over) / CRT_H));
    }
  }
  function apply(s) {
    crt.style.setProperty('--s', s);
    stage.style.width = Math.round(CRT_W * s) + 'px';
    stage.style.height = Math.round(CRT_H * s) + 'px';
  }
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  /* ドックと注記の高さが確定・変化したら測り直す */
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { requestAnimationFrame(resize); });
    ro.observe(dock);
    ro.observe(hint);
  }

  /* ---------------------------------------------------------- キーボード */
  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'),
      function (el) { return el.offsetParent !== null; });
  }

  document.addEventListener('keydown', function (e) {
    if (window.__screenKeys && window.__screenKeys(e)) return;
    var layer = W.activeLayer();
    if (!layer) return;
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'textarea' || e.target.classList.contains('termin');

    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
      var k = e.key.toUpperCase();
      var t = layer.querySelector('[data-acc="' + k + '"]');
      if (t) {
        e.preventDefault();
        W.snd.click();
        t.click();
        if (t.tagName === 'LABEL' && t.input) t.input.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
    if (e.key === 'Escape') {
      var c = layer.querySelector('[data-esc]');
      if (c && !c.disabled) { e.preventDefault(); c.click(); }
      return;
    }
    if (e.key === 'Enter' && !typing) {
      if (tag === 'button') return;             /* 既定の動作に任せる */
      var d = layer.querySelector('.btn.def:not(:disabled)');
      if (d) { e.preventDefault(); d.click(); }
      return;
    }
    if (e.key === 'Tab' && W.modals.length) {   /* モーダル内でフォーカスを循環 */
      var f = focusables(layer);
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      var n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 || i < 0 ? 0 : i + 1);
      f[n].focus();
    }
  });

  /* ラジオ/チェックはラベルのアクセラレータでも切り替わるようにする */
  document.addEventListener('click', function (e) {
    var lab = e.target.closest ? e.target.closest('label.ctl') : null;
    if (lab && lab.input && e.target === lab) { /* ラベル自体のクリックはブラウザが処理 */ }
  });

  /* ------------------------------------------------------------ スタート */
  document.body.dataset.power = 'on';
  resize();
  window.__bootDOS();
  setTimeout(resize, 120);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
})();
