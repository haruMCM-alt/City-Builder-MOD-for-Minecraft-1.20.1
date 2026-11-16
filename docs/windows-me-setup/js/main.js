/* =========================================================================
 * main.js : 起動 — 画面の組み立て / 拡大縮小 / キーボード操作
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
    'ロゴとアイコンは Microsoft の著作物で、実機の画面から引用しています。実際のシステムには変更を加えません。'));

  document.body.append(stage, dock, hint);
  W.bindRefs(screenWrap, stage, crt);

  /* CSS から参照する画像（ディザの青地と第2フェーズの背景） */
  var rs = document.documentElement.style;
  rs.setProperty('--img-dither', 'url("' + W.src('dither-blue') + '")');
  rs.setProperty('--img-bg2', 'url("' + W.src('bg2') + '")');
  ['bg2', 'boot', 'wizard-side', 'sm-banner', 'dlg-setup', 'dlg-hardware'].forEach(function (n) { new Image().src = W.src(n); });

  /* ------------------------------------------------------------ 拡大縮小 */
  function resize() {
    if (!CRT_W) { CRT_W = crt.offsetWidth; CRT_H = crt.offsetHeight; }
    var availW = Math.max(240, document.documentElement.clientWidth - 32);
    var availH = Math.max(220, window.innerHeight - dock.offsetHeight - hint.offsetHeight - 58);
    var s = fit ? Math.min(availW / CRT_W, availH / CRT_H) : 1;
    s = Math.max(0.3, Math.min(s, 2.4));
    if (s >= 1) s = Math.floor(s * 4) / 4;      /* ドット絵が崩れないよう 0.25 刻みに丸める */
    if (!fit) s = Math.min(1, availW / CRT_W);
    apply(s);
    /* 実際に組んでみて縦にあふれたら、あふれた分だけ詰める */
    if (fit) {
      var over = document.documentElement.scrollHeight - window.innerHeight;
      if (over > 2) { var s2 = Math.max(0.3, (CRT_H * s - over) / CRT_H); apply(s2 >= 1 ? Math.floor(s2 * 4) / 4 : s2); }
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
