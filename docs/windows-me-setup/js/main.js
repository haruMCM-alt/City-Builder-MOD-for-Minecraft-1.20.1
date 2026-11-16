/* =========================================================================
 * main.js : 起動 — 画面の組み立て / 拡大縮小 / キーボード操作
 * ========================================================================= */
(function () {
  'use strict';
  var W = window.__WinMe;
  var h = W.h, add = W.add, frag = W.frag;

  var Save = window.__Save;
  var CRT_W = 0, CRT_H = 0, fit = true;
  /* 既定は「全画面」: 枠なしでページいっぱいに表示し、最初の操作でブラウザの全画面にも切り替える */
  var immersive = Save.pref.get('view', 'full') !== 'window';
  var autoNative = immersive, nativeFs = false, hintT = 0;

  var screenWrap = h('div', { id: 'screenwrap' });
  var bezel = h('div', { id: 'bezel' },
    h('div', { class: 'brand', text: 'MULTISYNC 1500' }),
    h('div', { class: 'knobs' },
      h('span', { class: 'knob' }), h('span', { class: 'knob' }), h('span', { id: 'led' })));
  var crt = h('div', { id: 'crt' }, screenWrap, bezel);
  var stage = h('div', { id: 'stage' }, crt);

  function shellBtn(label, onClick, pressed) {
    var b = h('button', { type: 'button', text: label });
    if (pressed != null) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', function (e) { e.stopPropagation(); onClick(b); });
    return b;
  }
  /* 同じ機能のボタンを、枠付き表示の下部バーと全画面の上端バーの両方に置く */
  var soundBtns = [], speedBtns = [], fullBtns = [];
  W.setSound(Save.pref.get('sound', true));
  function syncButtons() {
    soundBtns.forEach(function (b) { b.textContent = '音: ' + (W.getSound() ? 'ON' : 'OFF'); b.setAttribute('aria-pressed', String(W.getSound())); });
    speedBtns.forEach(function (b) { b.textContent = '速度 ×' + W.getSpeed(); b.setAttribute('aria-pressed', String(W.getSpeed() !== 1)); });
    fullBtns.forEach(function (b) { b.textContent = nativeFs ? '全画面を解除' : '全画面'; });
  }
  function toggleSound() { W.setSound(!W.getSound()); Save.pref.set('sound', W.getSound()); if (W.getSound()) W.snd.ding(); syncButtons(); }
  function cycleSpeed() { var v = W.getSpeed() === 1 ? 2 : (W.getSpeed() === 2 ? 4 : 1); W.setSpeed(v); syncButtons(); }
  function mk(list, label, fn) { var b = shellBtn(label, fn); list.push(b); return b; }

  var bScan = shellBtn('走査線', function (b) {
    var v = !document.body.classList.contains('scanlines');
    document.body.classList.toggle('scanlines', v);
    b.setAttribute('aria-pressed', String(v));
  }, false);
  var bFit = shellBtn('表示: フィット', function (b) {
    fit = !fit;
    b.textContent = '表示: ' + (fit ? 'フィット' : '等倍');
    b.setAttribute('aria-pressed', String(fit));
    resize();
  }, true);
  var dock = h('div', { id: 'dock' },
    h('div', { class: 'grp' }, mk(soundBtns, '音', toggleSound), bScan, mk(speedBtns, '速度', cycleSpeed)),
    h('div', { class: 'grp' }, bFit, shellBtn('全画面', function () { setImmersive(true, true); }), shellBtn('セーブを消去', askReset)));
  var fsbar = h('div', { id: 'fsbar' },
    mk(fullBtns, '全画面', function () { if (nativeFs) exitNative(); else requestNative(); }),
    shellBtn('枠付きで表示', function () { setImmersive(false); }),
    mk(soundBtns, '音', toggleSound), mk(speedBtns, '速度', cycleSpeed),
    shellBtn('セーブを消去', askReset));

  var hint = h('div', { id: 'hint' }, frag(
    '<kbd>Enter</kbd> 既定のボタン ・ <kbd>Esc</kbd> キャンセル ・ ' +
    '<kbd>Tab</kbd> 移動 ・ <kbd>Alt</kbd>+下線の文字 ・ <kbd>Alt</kbd>+<kbd>Enter</kbd> 全画面<br>' +
    '※ Windows Me のセットアップ画面を再現した非公式のファンメイド作品です。' +
    'ロゴ・アイコン・効果音は Microsoft の著作物で、実機のものを引用しています。実際のシステムには変更を加えません。'));

  document.body.append(stage, dock, hint, fsbar);
  W.bindRefs(screenWrap, stage, crt);
  syncButtons();

  /* CSS から参照する画像（ディザの青地と第2フェーズの背景） */
  var rs = document.documentElement.style;
  rs.setProperty('--img-dither', 'url("' + W.src('dither-blue') + '")');
  rs.setProperty('--img-bg2', 'url("' + W.src('bg2') + '")');
  ['bg2', 'boot', 'wizard-side', 'sm-banner', 'dlg-setup', 'dlg-hardware'].forEach(function (n) { new Image().src = W.src(n); });

  /* ------------------------------------------------------- 外側の確認画面 */
  function shellConfirm(title, text, okLabel) {
    return new Promise(function (resolve) {
      var ok = h('button', { type: 'button', class: 'sc-ok', text: okLabel });
      var no = h('button', { type: 'button', class: 'sc-no', text: 'キャンセル' });
      var box = h('div', { class: 'sc-box', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'sc-title', text: title }), h('p', { text: text }), h('div', { class: 'sc-btns' }, no, ok));
      var ov = h('div', { id: 'shellconfirm' }, box);
      function done(v) { ov.remove(); document.removeEventListener('keydown', key, true); resolve(v); }
      function key(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } }
      ok.addEventListener('click', function () { done(true); });
      no.addEventListener('click', function () { done(false); });
      ov.addEventListener('click', function (e) { if (e.target === ov) done(false); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(ov);
      setTimeout(function () { no.focus(); }, 30);
    });
  }
  function askReset() {
    shellConfirm('セーブを消去', 'このブラウザに保存されている Windows Me（設定・ファイル・復元ポイントなど）をすべて消去して、最初からセットアップします。よろしいですか?', '消去してやり直す')
      .then(function (yes) {
        if (!yes) return;
        Save.reset();
        var pkg = document.getElementById('pkg'); if (pkg) pkg.remove();
        window.__setupState.restartCount = 0;
        document.body.dataset.power = 'on';
        window.__bootDOS();
      });
  }
  window.__onSaveFail = function () {
    try { window.__Desk.fail('Windows', 'ディスクに空き領域がないため、変更を保存できませんでした。\n(ブラウザの保存領域が不足しているか、保存が許可されていません。)'); } catch (e) {}
  };

  /* ------------------------------------------------------------ 拡大縮小 */
  function resize() {
    if (immersive) {                    /* 全画面: 枠なしで 640x480 を画面いっぱいに */
      var fsS = Math.min(window.innerWidth / 640, window.innerHeight / 480);
      if (fsS >= 1) fsS = Math.floor(fsS * 4) / 4;
      crt.style.setProperty('--s', fsS);
      stage.style.width = Math.round(640 * fsS) + 'px';
      stage.style.height = Math.round(480 * fsS) + 'px';
      return;
    }
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

  /* ------------------------------------------------------------ 全画面 */
  /* ブラウザの全画面はクリックなどの操作がないと始められないため、
     ページいっぱいの表示を既定にして、最初の操作でブラウザの全画面へ切り替える */
  function requestNative() {
    var root = document.documentElement;
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req) return;
    try { var p = req.call(root); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(function () {});
  }
  function exitNative() {
    autoNative = false;
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    var cur = document.fullscreenElement || document.webkitFullscreenElement;
    var ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (cur && ex) { try { var p = ex.call(document); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  }
  function setImmersive(on, native) {
    immersive = on;
    Save.pref.set('view', on ? 'full' : 'window');
    document.body.classList.toggle('fs', on);
    if (on && native) requestNative();
    if (!on) exitNative();
    if (on) flashBar();
    resize();
    setTimeout(resize, 160);
  }
  function flashBar() {
    document.body.classList.add('fs-hint');
    clearTimeout(hintT);
    hintT = setTimeout(function () { document.body.classList.remove('fs-hint'); }, 2600);
  }
  function firstGesture(e) {
    if (!autoNative || !immersive || nativeFs) return;
    if (e.target && e.target.closest && e.target.closest('#fsbar,#dock,#shellconfirm')) return;
    autoNative = false;
    requestNative();
  }
  document.addEventListener('pointerdown', firstGesture, true);
  document.addEventListener('keydown', function (e) { if (e.key !== 'Escape' && !(e.altKey && e.key === 'Enter')) firstGesture(e); }, true);
  function onFsChange() {
    nativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!nativeFs) autoNative = false;          /* Esc などで解除したら、勝手に戻さない */
    syncButtons();
    resize();
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  document.addEventListener('mousemove', function (e) {
    if (!immersive || e.clientY > 48) return;
    flashBar();
  });

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
    if (e.altKey && e.key === 'Enter') { e.preventDefault(); if (!immersive) setImmersive(true, true); else if (nativeFs) exitNative(); else requestNative(); return; }
    if (window.__screenKeys && window.__screenKeys(e)) return;
    if (document.getElementById('pkg') || document.getElementById('shellconfirm')) return;
    var layer = W.activeLayer();
    if (!layer) return;
    if (!W.modals.length && window.__activeScope) layer = window.__activeScope() || layer;
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'textarea' || e.target.classList.contains('termin');
    /* モーダルの外にフォーカスが残っていても、キー入力はモーダルが受け取る */
    if (W.modals.length && !layer.contains(e.target)) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        var fd = layer.querySelector('[data-autofocus]') || layer.querySelector('.btn.def:not(:disabled)');
        if (e.key === 'Enter') { var dd = layer.querySelector('.btn.def:not(:disabled)'); if (dd) dd.click(); }
        else if (fd) fd.focus();
        return;
      }
      tag = ''; typing = false;
    }

    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
      var k = e.key.toUpperCase();
      var t = layer.querySelector('[data-acc="' + k + '"]');
      if (t) {
        e.preventDefault();
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
  /* ------------------------------------------------- パッケージ画面（2 回目以降） */
  function showPackage() {
    var st = Save.state, S0 = st.S || {};
    var d = new Date(Save.savedAt() || Date.now());
    var when = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
    var box = h('button', { type: 'button', class: 'box3d', 'aria-label': 'Windows Me を起動する' },
      h('span', { class: 'bx-front' }, h('img', { src: W.src('box-front.jpg'), alt: '' })),
      h('span', { class: 'bx-side' }, h('img', { src: W.src('box-spine.jpg'), alt: '' })),
      h('span', { class: 'bx-top' }));
    var reset = h('button', { type: 'button', class: 'pkg-link', text: '最初からセットアップする' });
    var pkg = h('div', { id: 'pkg' },
      h('div', { class: 'pkg-stage' }, h('div', { class: 'pkg-floor' }), box),
      h('div', { class: 'pkg-cap' },
        h('div', { class: 'pkg-go', text: 'パッケージをクリックして起動' }),
        h('div', { class: 'pkg-meta', text: (S0.user && S0.user.name ? S0.user.name + ' さんの ' : '') + (S0.pc && S0.pc.name ? S0.pc.name : 'コンピュータ') + ' ・ 前回の保存 ' + when }),
        reset));
    document.body.appendChild(pkg);
    document.body.classList.add('pkg-open');
    setScreenBlack();
    var going = false;
    function go() {
      if (going) return;
      going = true;
      if (immersive) { autoNative = false; requestNative(); }
      pkg.classList.add('opening');
      setTimeout(function () {
        pkg.remove();
        document.body.classList.remove('pkg-open');
        resize();
        window.__bootLogo(window.__desktop, 4200);
      }, 1500);
    }
    box.addEventListener('click', go);
    pkg.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === box) { e.preventDefault(); go(); } });
    reset.addEventListener('click', function (e) { e.stopPropagation(); askReset(); });
  }
  function setScreenBlack() { W.setScreen(h('div', { class: 'screen black' })); document.body.dataset.power = 'standby'; }

  document.body.classList.toggle('fs', immersive);
  document.body.dataset.power = 'on';
  resize();
  if (Save.installed()) showPackage(); else window.__bootDOS();
  setTimeout(resize, 120);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
})();
