/* =========================================================================
 * desktop.js : デスクトップの土台
 *   ウィンドウ管理 / メニュー（メニュー バー・右クリック・カスケード）/
 *   ファイル ダイアログ / デスクトップ アイコン / スタート メニュー /
 *   タスク バーとトレイ / 終了処理
 * 個々のアプリは apps.js が APPS に登録する。
 * ========================================================================= */
(function () {
  'use strict';
  var W = window.__WinMe;
  var h = W.h, add = W.add, esc = W.esc, wait = W.wait, pic = W.pic;
  var Btn = W.Btn, Field = W.Field, Radio = W.Radio, Check = W.Check;
  var dialog = W.dialog, setScreen = W.setScreen, snd = W.snd, pad = W.pad;
  var S = window.__setupState, Save = window.__Save, VFS = window.__VFS;

  var APPS = {};
  var D = null, clockIV = null, zTop = 100, unwatchIcons = null;
  var DESK_H = 452;                                   /* 480 - タスク バー 28 */

  function info(title, body, icon) { return dialog({ title: title, icon: icon || 'info', width: 356, body: body }); }
  function fail(title, body) { return dialog({ title: title, icon: 'error', width: 360, body: esc(body).replace(/\n/g, '<br>') }); }
  function lab(t) { return esc(t).replace(/&amp;(.)/, '<u>$1</u>'); }
  function accOf(t) { var m = /&(.)/.exec(t); return m ? m[1].toUpperCase() : ''; }
  function scale() { var b = W.refs().screenWrap.getBoundingClientRect(); return { b: b, s: b.width / 640 }; }
  function rel(cx, cy) { var k = scale(); return { x: (cx - k.b.left) / k.s, y: (cy - k.b.top) / k.s }; }
  function relRect(el) {
    var r = el.getBoundingClientRect(), k = scale();
    return { x: (r.left - k.b.left) / k.s, y: (r.top - k.b.top) / k.s, w: r.width / k.s, h: r.height / k.s };
  }
  function na(name) {
    return function () {
      info(name, 'この再現版には、このプログラムは含まれていません。<br><br>[スタート] → [プログラム] → [アクセサリ] にあるプログラムは実際に動きます。');
    };
  }

  /* =================================================================
   *  ウィンドウ管理
   * ================================================================= */
  function tbBtn(kind, label) { return h('button', { class: 'tb ' + kind, type: 'button', 'aria-label': label }); }

  function openWindow(o) {
    if (!D) return null;
    var w = o.w || 360, hh = o.h || 0;
    var win = h('div', { class: 'win app' + (o.cls ? ' ' + o.cls : ''), style: { width: w + 'px', height: hh ? hh + 'px' : 'auto' } });
    var ttl = h('span', { class: 'ttl', text: o.title });
    var bMin = tbBtn('min', '最小化'), bMax = tbBtn('max', '最大化'), bX = tbBtn('x', '閉じる');
    if (o.max === false) bMax.disabled = true;
    var bar = h('div', { class: 'tbar' }, o.icon ? h('span', { class: 'ti' }, pic(o.icon, 16, 16)) : null, ttl, bMin, bMax, h('i', { class: 'tbgap' }), bX);
    var cli = h('div', { class: 'cli' });
    add(win, [bar, cli]);
    if (o.resizable) add(win, h('div', { class: 'rgrip' }));

    var n = D.wins.length % 6;
    var x = o.x != null ? o.x : 30 + n * 22, y = o.y != null ? o.y : 18 + n * 22;
    D.winlayer.appendChild(win);
    var ww = win.offsetWidth, wh = win.offsetHeight;
    x = Math.max(0, Math.min(640 - ww, x)); y = Math.max(0, Math.min(DESK_H - Math.min(wh, DESK_H), y));
    win.style.left = x + 'px'; win.style.top = y + 'px';

    var tl = h('span', { class: 'tl', text: o.title });
    var tb = h('button', { class: 'btn taskbtn', type: 'button' }, o.icon ? h('span', { class: 'ti' }, pic(o.icon, 16, 16)) : null, tl);
    var rec = { win: win, cli: cli, bar: bar, tb: tb, title: o.title, min: false, maxed: false, app: o.app || '', onClose: o.onClose, onKey: o.onKey };
    D.wins.push(rec);
    D.tasks.appendChild(tb);

    rec.setTitle = function (t) { rec.title = t; ttl.textContent = t; tl.textContent = t; };
    rec.close = function (force) { closeWin(rec, force); };
    rec.focus = function () { focusWin(rec); };
    rec.toggleMax = function () {
      if (o.max === false) return;
      if (!rec.maxed) {
        rec.prev = { l: win.style.left, t: win.style.top, w: win.style.width, h: win.style.height };
        win.style.left = '-2px'; win.style.top = '-2px'; win.style.width = '644px'; win.style.height = (DESK_H + 4) + 'px';
      } else {
        win.style.left = rec.prev.l; win.style.top = rec.prev.t; win.style.width = rec.prev.w; win.style.height = rec.prev.h;
      }
      rec.maxed = !rec.maxed;
      win.classList.toggle('maxed', rec.maxed);
      bMax.classList.toggle('restore', rec.maxed);
      if (o.onResize) o.onResize(rec);
    };

    tb.addEventListener('click', function () {
      if (rec.min) focusWin(rec); else if (D.active === rec) minimize(rec); else focusWin(rec);
    });
    bX.addEventListener('click', function () { rec.close(); });
    bMin.addEventListener('click', function () { minimize(rec); });
    bMax.addEventListener('click', function () { rec.toggleMax(); });
    bar.addEventListener('dblclick', function (e) { if (!e.target.classList.contains('tb')) rec.toggleMax(); });
    win.addEventListener('pointerdown', function () { focusWin(rec); }, true);
    W.dragify(win, bar);

    var grip = win.querySelector('.rgrip');
    if (grip) grip.addEventListener('pointerdown', function (e) {
      if (rec.maxed) return;
      e.preventDefault(); e.stopPropagation();
      var sc = scale().s, sx = e.clientX, sy = e.clientY, w0 = win.offsetWidth, h0 = win.offsetHeight;
      grip.setPointerCapture(e.pointerId);
      function mv(ev) {
        win.style.width = Math.max(o.minW || 200, Math.min(640, w0 + (ev.clientX - sx) / sc)) + 'px';
        win.style.height = Math.max(o.minH || 120, Math.min(DESK_H + 4, h0 + (ev.clientY - sy) / sc)) + 'px';
        if (o.onResize) o.onResize(rec);
      }
      function up() { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); }
      grip.addEventListener('pointermove', mv);
      grip.addEventListener('pointerup', up);
    });

    if (o.build) o.build(cli, rec);
    if (o.maximized) rec.toggleMax();
    focusWin(rec);
    return rec;
  }
  function focusWin(rec) {
    if (!D || !rec) return;
    rec.min = false;
    rec.win.hidden = false;
    if (D.active !== rec) rec.win.style.zIndex = ++zTop;
    D.active = rec;
    D.wins.forEach(function (r) {
      r.win.classList.toggle('inactive', r !== rec);
      r.tb.classList.toggle('is-down', r === rec);
    });
  }
  function topWin() {
    var best = null;
    D.wins.forEach(function (r) { if (!r.min && (!best || +r.win.style.zIndex > +best.win.style.zIndex)) best = r; });
    return best;
  }
  function minimize(rec) {
    rec.min = true;
    rec.win.hidden = true;
    rec.tb.classList.remove('is-down');
    if (D.active === rec) { D.active = null; var t = topWin(); if (t) focusWin(t); }
  }
  function closeWin(rec, force) {
    if (!force && rec.onClose) {
      Promise.resolve(rec.onClose(rec)).then(function (ok) { if (ok !== false) closeWin(rec, true); });
      return;
    }
    if (rec.onDestroy) try { rec.onDestroy(); } catch (e) {}
    rec.win.remove();
    rec.tb.remove();
    var i = D.wins.indexOf(rec);
    if (i >= 0) D.wins.splice(i, 1);
    if (D.active === rec) { D.active = null; var t = topWin(); if (t) focusWin(t); }
  }
  function findWin(app, key) {
    if (!D) return null;
    for (var i = 0; i < D.wins.length; i++) if (D.wins[i].app === app && (key == null || D.wins[i].key === key)) return D.wins[i];
    return null;
  }

  /* アクティブなウィンドウだけにキー操作を渡す */
  window.__activeScope = function () { return D && D.active && !D.active.min && D.root.isConnected ? D.active.win : null; };
  document.addEventListener('keydown', function (e) {
    if (!D || !D.root.isConnected || W.modals.length) return;
    var a = D.active;
    if (a && !a.min && a.onKey) a.onKey(e);
  });

  /* =================================================================
   *  メニュー
   * ================================================================= */
  var menuStack = [], menuClose = null;
  function closeMenus(level) {
    level = level || 0;
    while (menuStack.length > level) menuStack.pop().remove();
    if (level === 0 && menuClose) { var f = menuClose; menuClose = null; f(); }
  }
  function closeAllMenus() { closeMenus(0); closeStart(); closePopup(); }
  function itemsOf(x) { return typeof x === 'function' ? x() : x; }
  function openMenuAt(items, x, y, level, onClose, altX) {
    closeMenus(level);
    if (level === 0) menuClose = onClose || null;
    var m = h('div', { class: 'cmenu' });
    itemsOf(items).forEach(function (c) { if (c) add(m, menuRow(c, level)); });
    D.root.appendChild(m);
    var mw = m.offsetWidth, mh = m.offsetHeight;
    if (x + mw > 640) x = altX != null ? Math.max(0, altX - mw + 3) : Math.max(0, 640 - mw);
    if (y + mh > 480) y = Math.max(0, 480 - mh);
    m.style.left = x + 'px'; m.style.top = y + 'px';
    menuStack.push(m);
    return m;
  }
  function menuRow(c, level) {
    if (c.sep) return h('div', { class: 'msep' });
    var dis = typeof c.dis === 'function' ? c.dis() : !!c.dis;
    var chk = typeof c.checked === 'function' ? c.checked() : c.checked;
    var it = h('div', { class: 'cmi' + (dis ? ' dis' : '') + (c.bold ? ' bold' : '') },
      h('span', { class: 'ci' }, c.icon ? pic(c.icon, 16, 16) : (chk ? h('i', { class: c.radio ? 'mk-dot' : 'mk-chk' }) : null)),
      h('span', { class: 'cl', html: lab(c.label) }),
      c.key ? h('span', { class: 'ck', text: c.key }) : null,
      c.sub ? h('span', { class: 'ar' }) : null);
    it.addEventListener('mouseenter', function () {
      Array.prototype.forEach.call(it.parentNode.children, function (n) { n.classList.remove('hot'); });
      it.classList.add('hot');
      if (c.sub && !dis) { var r = relRect(it); openMenuAt(c.sub, r.x + r.w - 3, r.y - 3, level + 1, null, r.x); }
      else closeMenus(level + 1);
    });
    it.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dis || c.sub) return;
      closeAllMenus();
      if (c.act) c.act();
    });
    return it;
  }
  function MenuBar(defs) {
    var bar = h('div', { class: 'mbar' }), cur = null;
    defs.forEach(function (d) {
      var sp = h('span', { html: lab(d.label) });
      sp.dataset.acc = accOf(d.label);
      function show() {
        closeAllMenus();
        var r = relRect(sp);
        sp.classList.add('on'); cur = sp;
        openMenuAt(d.items, r.x, r.y + r.h, 0, function () { sp.classList.remove('on'); if (cur === sp) cur = null; });
      }
      sp.addEventListener('pointerdown', function (e) { e.stopPropagation(); if (cur === sp) closeAllMenus(); else show(); });
      sp.addEventListener('click', function (e) { e.stopPropagation(); if (e.detail === 0) show(); });
      sp.addEventListener('mouseenter', function () { if (cur && cur !== sp) show(); });
      add(bar, sp);
    });
    return bar;
  }
  function ctxMenu(e, items) {
    e.preventDefault(); e.stopPropagation();
    closeAllMenus();
    var p = rel(e.clientX, e.clientY);
    openMenuAt(items, p.x, p.y, 0);
  }
  document.addEventListener('pointerdown', function (e) {
    if (!D || !D.root.isConnected) return;
    var t = e.target;
    if (t.closest && t.closest('.cmenu,.startmenu,.mbar span,#startbtn,.popup')) return;
    closeAllMenus();
  }, true);

  /* 小さな浮き窓（音量など） */
  var popupEl = null;
  function closePopup() { if (popupEl) { popupEl.remove(); popupEl = null; } }
  function popup(el, x, y) { closeAllMenus(); popupEl = el; el.classList.add('popup'); el.style.left = x + 'px'; el.style.top = y + 'px'; D.root.appendChild(el); }

  /* =================================================================
   *  ファイルの種類
   * ================================================================= */
  var SPECIAL = { 'C:\\My Documents': 'mydocs', 'C:\\WINDOWS\\Desktop': 'desk' };
  function kindOf(name, node) {
    if (node && node.t === 'd') return 'dir';
    var x = VFS.ext(name);
    if (/^(txt|ini|log|bat|sys|inf|cfg|nfo)$/.test(x)) return x === 'txt' || x === 'log' ? 'txt' : 'ini';
    if (x === 'bmp') return 'bmp';
    if (x === 'exe' || x === 'com') return 'exe';
    if (x === 'wav') return 'wav';
    if (/^(htm|html|url)$/.test(x)) return 'htm';
    return 'doc';
  }
  var ICON32 = { dir: 'folder32', txt: 'file-txt', ini: 'file-ini', bmp: 'file-bmp', exe: 'file-exe', wav: 'file-wav', htm: 'file-htm', doc: 'file-doc' };
  var ICON16 = { dir: 'folder16', txt: 'txt16', ini: 'ini16', bmp: 'bmp16', exe: 'exe16', wav: 'wav16', htm: 'htm16', doc: 'doc16' };
  var EXE_ICON = {
    'app:notepad': ['file-txt', 'notepad16'], 'app:paint': ['file-bmp', 'paint16'], 'app:calc': ['ico-calc', 'calc16'],
    'app:mines': ['ico-mines', 'mine16b'], 'app:ie': ['ico-ie32', 'ie16'], 'app:wmp': ['ico-mplayer', 'wmp16'],
    'app:oe': ['ico-oe32', 'oe16'], 'app:explorer': ['ico-mycomputer', 'explorer16'], 'app:prompt': ['file-exe', 'msdos16'],
    'app:help': ['ico-help', 'help16'], 'app:restore': ['ico-restore', 'restore16']
  };
  function iconOf(path, node, small) {
    var r = VFS.real(path) || path;
    if (VFS.isRoot(r)) return small ? (r === 'D:' ? 'cd16' : 'hdd16') : (r === 'D:' ? 'drv-cd' : 'drv-hdd');
    if (SPECIAL[r] === 'mydocs') return small ? 'mydocs16' : 'ico-mydocs32';
    var k = kindOf(path, node);
    if (k === 'exe' && node && EXE_ICON[node.d]) return EXE_ICON[node.d][small ? 1 : 0];
    return (small ? ICON16 : ICON32)[k];
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' バイト';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function fmtDate(t) { var d = new Date(t); return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + d.getHours() + ':' + pad(d.getMinutes()); }

  /* ファイルを開く（拡張子で関連付け） */
  function openPath(path) {
    var n = VFS.get(path);
    if (!n) return fail('Windows', "'" + path + "' が見つかりません。\n名前を正しく入力したかどうかを確認してから、やり直してください。");
    path = VFS.real(path) || path;
    if (n.t === 'd') return APPS.explorer(path);
    var k = kindOf(path, n);
    if (k !== 'exe') Save.recent.add(path);
    if (k === 'txt' || k === 'ini') return APPS.notepad(path);
    if (k === 'bmp') return APPS.paint(path);
    if (k === 'wav') return APPS.wmp(path);
    if (k === 'htm') return APPS.ie(n.d && /^https?:/.test(n.d) ? n.d : 'about:home');
    if (k === 'exe') return runApp(String(n.d || '').replace(/^app:/, ''), n.n);
    return fail('ファイルを開く', "'" + n.n + "' を開くプログラムが登録されていません。");
  }
  function runApp(id, name) {
    if (id === 'setup') return info('Windows Millennium Edition セットアップ', 'Windows Millennium Edition は既にこのコンピュータにインストールされています。<br><br>セットアップをやり直すには、画面上端のメニューから [セーブを消去] を選んでください。');
    if (id === 'wordpad') return na('ワードパッド')();
    if (APPS[id]) return APPS[id]();
    return fail(name || 'Windows', 'このプログラムは、この再現版には含まれていません。');
  }

  /* =================================================================
   *  ファイル ダイアログ（開く / 名前を付けて保存）
   * ================================================================= */
  function fileDialog(o) {
    return new Promise(function (resolve) {
      var dir = o.dir || 'C:\\My Documents', chosen = null;
      var place = h('div', { class: 'well fd-place' });
      var up = h('button', { class: 'btn tbtn', type: 'button', title: '1 つ上のフォルダへ' }, h('i', { class: 'arw u' }));
      var list = h('div', { class: 'well fd-list', tabindex: '0' });
      var name = Field({ value: o.name || '', w: '100%' });
      name.dataset.autofocus = '1';
      function draw() {
        place.replaceChildren(pic(iconOf(dir, VFS.get(dir), true), 16, 16), h('span', { text: VFS.disp(dir) }));
        list.replaceChildren();
        up.disabled = VFS.isRoot(dir);
        (VFS.list(dir) || []).forEach(function (n) {
          if (n.t !== 'd' && o.exts && o.exts.indexOf(VFS.ext(n.n)) < 0) return;
          var p = VFS.join(dir, n.n);
          var it = h('div', { class: 'fd-it' }, pic(iconOf(p, n, true), 16, 16), h('span', { text: n.n }));
          it.addEventListener('click', function () {
            list.querySelectorAll('.fd-it').forEach(function (x) { x.classList.remove('on'); });
            it.classList.add('on');
            if (n.t !== 'd') name.value = n.n;
          });
          it.addEventListener('dblclick', function () {
            if (n.t === 'd') { dir = p; draw(); } else { name.value = n.n; accept(); }
          });
          add(list, it);
        });
      }
      up.addEventListener('click', function () { if (!VFS.isRoot(dir)) { dir = VFS.parent(dir); draw(); } });
      var closeFn = null;
      function accept() {
        var v = name.value.trim();
        if (!v) return;
        if (/^[a-z]:/i.test(v) || v.indexOf('\\') >= 0) {
          var t = VFS.get(v);
          if (t && t.t === 'd') { dir = VFS.real(v); name.value = ''; draw(); return; }
        }
        if (o.mode === 'save' && o.defExt && !/\.[^.]+$/.test(v)) v += '.' + o.defExt;
        var p = /^[a-z]:/i.test(v) ? v : VFS.join(dir, v);
        var ex = VFS.get(p);
        if (ex && ex.t === 'd') { dir = VFS.real(p); name.value = ''; draw(); return; }
        if (o.mode === 'open') {
          if (!ex) return fail(o.title, VFS.base(p) + '\nファイルが見つかりません。\nファイル名を確認してください。');
          chosen = VFS.real(p); closeFn('ok'); return;
        }
        if (!VFS.validName(VFS.base(p))) return fail(o.title, 'ファイル名に次の文字は使えません:\n\\ / : * ? " < > |');
        if (VFS.readonly(p)) return fail(o.title, 'ディスクは書き込み禁止になっています。');
        if (ex) {
          dialog({
            title: o.title, icon: 'warn', width: 360, body: esc(VFS.disp(p)) + ' は既に存在します。<br>上書きしますか?',
            buttons: [{ id: 'y', label: 'はい(&Y)' }, { id: 'n', label: 'いいえ(&N)', def: true, esc: true }]
          }).then(function (r) { if (r === 'y') { chosen = VFS.real(p) || p; closeFn('ok'); } });
          return;
        }
        chosen = p; closeFn('ok');
      }
      draw();
      dialog({
        title: o.title, width: 420, sound: false, cls: 'filedlg',
        body: h('div', {},
          h('div', { class: 'fd-row' }, h('label', { html: (o.mode === 'save' ? '保存する場所' : 'ファイルの場所') + '(<u>I</u>):' }), place, up),
          list,
          h('div', { class: 'fd-grid' },
            h('label', { html: 'ファイル名(<u>N</u>):' }), name,
            h('label', { html: 'ファイルの種類(<u>T</u>):' }), h('div', { class: 'well fd-type', text: o.typeLabel || 'すべてのファイル (*.*)' }))),
        buttons: [{ id: 'ok', label: o.mode === 'save' ? '保存(&S)' : '開く(&O)', def: true }, { id: 'cancel', label: 'キャンセル', esc: true }],
        btnAlign: 'right',
        onOpen: function (win, done) { closeFn = done; },
        onButton: function (id) { if (id === 'ok') { accept(); return false; } }
      }).then(function (r) { resolve(r === 'ok' ? chosen : null); });
    });
  }

  /* 名前の入力（新しいフォルダ・名前の変更） */
  function askName(title, prompt, value) {
    var f = Field({ value: value || '', w: '100%' });
    f.dataset.autofocus = '1';
    return dialog({
      title: title, width: 330, sound: false, btnAlign: 'right',
      body: h('div', {}, h('div', { text: prompt, style: { marginBottom: '8px' } }), f),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }],
      onOpen: function () { setTimeout(function () { f.select(); }, 30); }
    }).then(function (r) { return r === 'ok' ? f.value.trim() : null; });
  }

  /* ファイル操作のまとまり（エクスプローラとデスクトップで共通） */
  var Ops = {
    newFolder: function (dir) {
      try { VFS.mkdir(VFS.join(dir, VFS.unique(dir, '新しいフォルダ'))); } catch (e) { fail('フォルダの作成', e.message); }
    },
    newFile: function (dir, kind) {
      var base = kind === 'bmp' ? '新規 ビットマップ イメージ' : '新規 テキスト文書';
      try { VFS.write(VFS.join(dir, VFS.unique(dir, base, kind === 'bmp' ? 'bmp' : 'txt')), ''); } catch (e) { fail('新規作成', e.message); }
    },
    rename: function (path) {
      var n = VFS.get(path); if (!n) return;
      askName('名前の変更', '新しい名前を入力してください。', n.n).then(function (v) {
        if (!v || v === n.n) return;
        try { VFS.rename(path, v); } catch (e) { fail('名前の変更', e.message); }
      });
    },
    del: function (paths) {
      paths = [].concat(paths).filter(function (p) { return VFS.get(p); });
      if (!paths.length) return;
      if (VFS.readonly(paths[0])) return fail('ファイルの削除', 'ディスクは書き込み禁止になっています。');
      var n = VFS.get(paths[0]);
      var msg = paths.length > 1 ? 'これらの ' + paths.length + ' 個の項目をごみ箱に移しますか?' :
        "'" + n.n + "' " + (n.t === 'd' ? 'とその内容をすべて' : 'を') + 'ごみ箱に移しますか?';
      dialog({
        title: paths.length > 1 ? '複数ファイルの削除の確認' : (n.t === 'd' ? 'フォルダの削除の確認' : 'ファイルの削除の確認'),
        icon: 'ico-recycle-full', width: 370, body: esc(msg),
        buttons: [{ id: 'y', label: 'はい(&Y)', def: true }, { id: 'n', label: 'いいえ(&N)', esc: true }]
      }).then(function (r) {
        if (r !== 'y') return;
        try { paths.forEach(function (p) { VFS.remove(p); }); } catch (e) { fail('ファイルの削除', e.message); }
      });
    },
    props: function (path) {
      var n = VFS.get(path); if (!n) return;
      var k = kindOf(path, n);
      var TYPE = { dir: 'ファイル フォルダ', txt: 'テキスト文書', ini: '構成設定', bmp: 'ビットマップ イメージ', exe: 'アプリケーション', wav: 'Wave サウンド', htm: 'HTML 文書', doc: 'ファイル' };
      var count = n.t === 'd' ? (function c(x) { return x.c.reduce(function (s, y) { return s + (y.t === 'd' ? 1 + c(y) : 1); }, 0); })(n) : 0;
      dialog({
        title: n.n + 'のプロパティ', width: 340, sound: false, btnAlign: 'right',
        body: h('div', { class: 'props' },
          h('div', { class: 'props-head' }, pic(iconOf(path, n, false), 32, 32), h('span', { text: n.n })),
          h('div', { class: 'props-grid' },
            h('span', { text: '種類:' }), h('span', { text: TYPE[k] }),
            h('span', { text: '場所:' }), h('span', { text: VFS.disp(VFS.parent(path) || path) }),
            h('span', { text: 'サイズ:' }), h('span', { text: fmtSize(VFS.size(n)) + ' (' + VFS.size(n).toLocaleString() + ' バイト)' }),
            n.t === 'd' ? h('span', { text: '内容:' }) : null, n.t === 'd' ? h('span', { text: count + ' 個の項目' }) : null,
            h('span', { text: '更新日時:' }), h('span', { text: fmtDate(n.m || Date.now()) }))),
        buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
      });
    }
  };

  /* =================================================================
   *  壁紙・表示設定
   * ================================================================= */
  var WALLS = [
    ['(なし)', '#3a6ea5'],
    ['ティール', '#008080'],
    ['夕暮れ', 'linear-gradient(180deg,#e0855b 0%,#b3554a 52%,#5c2b45 100%)'],
    ['深い青', 'linear-gradient(180deg,#26324a 0%,#161d2c 60%,#0b0f18 100%)'],
    ['森', '#2f5f3f'],
    ['Windows 標準 (グレー)', '#808080'],
    ['ブルーの石畳', 'repeating-conic-gradient(#3a6ea5 0 25%,#336497 0 50%) 0 0/16px 16px'],
    ['砂', 'radial-gradient(circle at 30% 30%,#d8c7a0,#b49a6a 70%,#8a744c)']
  ];
  function wallCSS() {
    var d = Save.state.desk;
    if (d.wall === -1 && d.wallImg) {
      return d.wallMode === 'tile' ? '#3a6ea5 url("' + d.wallImg + '") 0 0 repeat' : '#3a6ea5 url("' + d.wallImg + '") center/auto no-repeat';
    }
    return (WALLS[d.wall] || WALLS[0])[1];
  }
  function applyWall() { if (D) D.root.style.background = wallCSS(); }

  /* =================================================================
   *  デスクトップ アイコン
   * ================================================================= */
  var DESKDIR = 'C:\\WINDOWS\\Desktop';
  function sysIcons() {
    var full = VFS.recycle.list().length > 0;
    return [
      { name: 'マイ ドキュメント', icon: 'ico-mydocs', act: function () { APPS.explorer('C:\\My Documents'); }, menu: 'folder', path: 'C:\\My Documents' },
      { name: 'マイ コンピュータ', icon: 'ico-mycomputer', act: function () { APPS.explorer('::mycomputer'); }, menu: 'mycomputer' },
      { name: 'マイ ネットワーク', icon: 'ico-network', act: function () { info('マイ ネットワーク', 'ワークグループ ' + esc(S.pc.wg) + ' には、ほかのコンピュータは見つかりませんでした。'); } },
      { name: 'ごみ箱', icon: full ? 'ico-recycle-full' : 'ico-recycle', act: function () { APPS.explorer('::recycle'); }, menu: 'recycle' },
      { name: 'Internet Explorer', icon: 'ico-ie', act: function () { APPS.ie(); } },
      { name: 'Outlook Express', icon: 'ico-oe', act: function () { APPS.oe(); } }
    ];
  }
  function drawIcons() {
    if (!D) return;
    var list = sysIcons();
    (VFS.list(DESKDIR) || []).forEach(function (n) {
      var p = VFS.join(DESKDIR, n.n);
      list.push({ name: n.n, icon: iconOf(p, n, false), act: function () { openPath(p); }, menu: 'file', path: p });
    });
    D.icons.replaceChildren();
    list.forEach(function (d, i) {
      var el = h('div', { class: 'dicon' }, pic(d.icon, 32, 32), h('div', {}, h('span', { class: 'lab', text: d.name })));
      el.style.left = (Math.floor(i / 6) * 75) + 'px';
      el.style.top = ((i % 6) * 75) + 'px';
      el.setAttribute('aria-selected', 'false');
      el.tabIndex = 0;
      function sel() {
        D.icons.querySelectorAll('.dicon').forEach(function (n) { n.setAttribute('aria-selected', 'false'); });
        el.setAttribute('aria-selected', 'true');
      }
      el.addEventListener('click', function (e) { e.stopPropagation(); closeAllMenus(); sel(); });
      el.addEventListener('dblclick', function () { d.act(); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') d.act();
        if (e.key === 'Delete' && d.menu === 'file') Ops.del(d.path);
        if (e.key === 'F2' && d.menu === 'file') Ops.rename(d.path);
      });
      el.addEventListener('contextmenu', function (e) {
        sel();
        var items = [{ label: '開く(&O)', bold: true, act: d.act }];
        if (d.menu === 'file') items.push({ sep: true }, { label: '削除(&D)', act: function () { Ops.del(d.path); } }, { label: '名前の変更(&M)', act: function () { Ops.rename(d.path); } }, { sep: true }, { label: 'プロパティ(&R)', act: function () { Ops.props(d.path); } });
        if (d.menu === 'folder') items.push({ label: 'エクスプローラ(&X)', act: d.act }, { sep: true }, { label: 'プロパティ(&R)', act: function () { Ops.props(d.path); } });
        if (d.menu === 'recycle') items.push({ label: 'ごみ箱を空にする(&B)', dis: !VFS.recycle.list().length, act: emptyRecycle });
        if (d.menu === 'mycomputer') items.push({ label: 'エクスプローラ(&X)', act: d.act }, { sep: true }, { label: 'プロパティ(&R)', act: function () { APPS.sysprops(); } });
        ctxMenu(e, items);
      });
      add(D.icons, el);
    });
  }
  function emptyRecycle() {
    var n = VFS.recycle.list().length;
    if (!n) return;
    dialog({
      title: '複数ファイルの削除の確認', icon: 'ico-recycle-full', width: 370,
      body: 'これらの ' + n + ' 個の項目を削除しますか?',
      buttons: [{ id: 'y', label: 'はい(&Y)', def: true }, { id: 'n', label: 'いいえ(&N)', esc: true }]
    }).then(function (r) { if (r === 'y') { VFS.recycle.empty(); snd.recycle(); } });
  }

  /* =================================================================
   *  スタート メニュー
   * ================================================================= */
  function menuDefs() {
    var EMPTY = [{ label: '(なし)', dis: true }];
    var ACC = [
      { label: 'エンターテイメント', icon: 'group', sub: [
        { label: 'Windows Media Player', icon: 'wmp16', act: function () { APPS.wmp(); } },
        { label: 'ボリューム コントロール', icon: 'wav16', act: volumePopup },
        { label: 'サウンド レコーダー', act: na('サウンド レコーダー') }] },
      { label: 'ゲーム', icon: 'group', sub: [
        { label: 'マインスイーパ', icon: 'mine16b', act: function () { APPS.mines(); } },
        { label: 'スパイダ ソリティア', act: na('スパイダ ソリティア') }, { label: 'ソリティア', act: na('ソリティア') },
        { label: 'ピンボール', act: na('ピンボール') }] },
      { label: 'システム ツール', icon: 'group', sub: [
        { label: 'システムの復元', icon: 'restore16', act: function () { APPS.restore(); } },
        { label: 'システム情報', icon: 'settings16', act: function () { APPS.sysprops(); } },
        { label: 'スキャンディスク', act: function () { APPS.scandisk(); } },
        { label: 'デフラグ', act: na('デフラグ') }] },
      { label: '通信', icon: 'group', sub: [{ label: 'ホーム ネットワーク ウィザード', act: na('ホーム ネットワーク ウィザード') }, { label: 'ダイヤルアップ ネットワーク', act: na('ダイヤルアップ ネットワーク') }] },
      { label: 'アドレス帳', icon: 'addressbook16', act: na('アドレス帳') },
      { label: '電卓', icon: 'calc16', act: function () { APPS.calc(); } },
      { label: 'イメージング', icon: 'imaging16', act: na('イメージング') },
      { label: 'MS-DOS プロンプト', icon: 'msdos16', act: function () { APPS.prompt(); } },
      { label: 'メモ帳', icon: 'notepad16', act: function () { APPS.notepad(); } },
      { label: 'ペイント', icon: 'paint16', act: function () { APPS.paint(); } },
      { label: 'エクスプローラ', icon: 'explorer16', act: function () { APPS.explorer('C:'); } },
      { label: 'Windows ムービー メーカー', icon: 'moviemaker16', act: na('Windows ムービー メーカー') },
      { label: 'ワードパッド', icon: 'wordpad16', act: na('ワードパッド') }
    ];
    var PROGRAMS = [
      { label: 'アクセサリ', icon: 'group', sub: ACC },
      { label: 'オンライン サービス', icon: 'group', sub: EMPTY },
      { label: 'スタートアップ', icon: 'group', sub: EMPTY },
      { label: 'Internet Explorer', icon: 'ie16', act: function () { APPS.ie(); } },
      { label: 'Outlook Express', icon: 'oe16', act: function () { APPS.oe(); } },
      { label: 'Windows Media Player', icon: 'wmp16', act: function () { APPS.wmp(); } }
    ];
    var docs = [{ label: 'マイ ドキュメント', icon: 'mydocs16', act: function () { APPS.explorer('C:\\My Documents'); } }];
    var rec = Save.recent.list();
    if (rec.length) docs.push({ sep: true });
    rec.forEach(function (p) {
      var n = VFS.get(p);
      docs.push({ label: n.n, icon: iconOf(p, n, true), act: function () { openPath(p); } });
    });
    return [
      { label: 'Windows Update', icon: 'sm-update', act: function () { APPS.ie('https://www.google.com/search?igu=1&hl=ja&q=Windows+Update'); } },
      { sep: true },
      { label: 'プログラム(&P)', icon: 'sm-programs', sub: PROGRAMS },
      { label: '最近使ったファイル(&D)', icon: 'sm-documents', sub: docs },
      { label: '設定(&S)', icon: 'sm-settings', sub: [
        { label: 'コントロール パネル(&C)', icon: 'cpl16', act: function () { APPS.explorer('::control'); } },
        { label: 'ダイヤルアップ ネットワーク(&N)', icon: 'folder16', act: na('ダイヤルアップ ネットワーク') },
        { label: 'プリンタ(&P)', icon: 'folder16', act: na('プリンタ') },
        { label: 'タスク バーと [スタート] メニュー(&T)', icon: 'settings16', act: taskbarProps }] },
      { label: '検索(&C)', icon: 'sm-search', sub: [
        { label: 'ファイルやフォルダ(&F)...', icon: 'search16', act: function () { APPS.find(); } },
        { label: 'インターネット上(&I)...', icon: 'ie16', act: function () { APPS.ie('about:home'); } }] },
      { label: 'ヘルプ(&H)', icon: 'sm-help', act: function () { APPS.help(); } },
      { label: 'ファイル名を指定して実行(&R)...', icon: 'sm-run', act: runDialog },
      { sep: true },
      { label: (S.user.name || 'ユーザー') + ' のログオフ(&L)...', icon: 'sm-logoff', act: logoff },
      { label: 'Windows の終了(&U)...', icon: 'sm-shutdown', act: shutdownDialog }
    ];
  }
  var startMenuEl = null;
  function closeStart() {
    if (startMenuEl) { startMenuEl.remove(); startMenuEl = null; }
    if (D) D.startBtn.classList.remove('is-down');
  }
  function toggleStart() {
    if (startMenuEl) { closeAllMenus(); return; }
    closeAllMenus();
    var items = h('div', { class: 'smitems' });
    var menu = h('div', { class: 'startmenu' }, h('div', { class: 'banner' }, pic('sm-banner', 21, 304)), items);
    menuDefs().forEach(function (o) {
      if (o.sep) { add(items, h('div', { class: 'smsep' })); return; }
      var it = h('div', { class: 'smi' }, pic(o.icon, 32, 32), h('span', { class: 'sl', html: lab(o.label) }), o.sub ? h('span', { class: 'ar' }) : null);
      it.dataset.acc = accOf(o.label);
      it.addEventListener('mouseenter', function () {
        items.querySelectorAll('.smi').forEach(function (n) { n.classList.remove('hot'); });
        it.classList.add('hot');
        if (o.sub) { var r = relRect(it); openMenuAt(o.sub, r.x + r.w - 3, r.y - 3, 0, null, r.x); } else closeMenus(0);
      });
      it.addEventListener('click', function (e) {
        e.stopPropagation();
        if (o.sub) { var r = relRect(it); openMenuAt(o.sub, r.x + r.w - 3, r.y - 3, 0, null, r.x); return; }
        closeAllMenus();
        if (o.act) o.act();
      });
      add(items, it);
    });
    D.root.appendChild(menu);
    startMenuEl = menu;
    D.startBtn.classList.add('is-down');
  }

  /* =================================================================
   *  タスク バーのダイアログ類
   * ================================================================= */
  function taskbarProps() {
    var c = Check({ label: '時計を表示する(&C)', checked: Save.state.desk.clock !== false });
    dialog({
      title: 'タスク バーと [スタート] メニューのプロパティ', width: 360, sound: false, btnAlign: 'right',
      body: h('div', {},
        Check({ label: '常に手前に表示(&T)', checked: true, disabled: true }),
        Check({ label: '自動的に隠す(&U)', disabled: true }),
        Check({ label: '[スタート] メニューに小さいアイコンを表示する(&S)', disabled: true }),
        c),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
    }).then(function (r) {
      if (r !== 'ok') return;
      Save.state.desk.clock = c.input.checked; Save.schedule();
      if (D) D.clock.hidden = !c.input.checked;
    });
  }
  function volumePopup() {
    var desk = Save.state.desk;
    var rng = h('input', { type: 'range', min: '0', max: '100', class: 'vol-range', 'aria-label': '音量' });
    rng.value = String(Math.round(desk.vol * 100));
    var mute = Check({ label: 'ミュート(&M)', checked: !!desk.mute });
    function apply() {
      desk.vol = +rng.value / 100; desk.mute = mute.input.checked;
      W.setVolume(desk.mute ? 0 : desk.vol); Save.schedule();
    }
    rng.addEventListener('input', apply);
    rng.addEventListener('change', function () { apply(); snd.ding(); });
    mute.input.addEventListener('change', apply);
    var el = h('div', { class: 'volpop' }, h('div', { text: '音量' }), rng, mute);
    popup(el, 532, DESK_H - 160);
  }
  function runDialog() {
    var f = Field({ w: '100%' });
    f.dataset.autofocus = '1';
    dialog({
      title: 'ファイル名を指定して実行', width: 356, sound: false, btnAlign: 'right',
      body: h('div', {},
        h('div', { class: 'dlg-row' }, h('div', {}, pic('sm-run', 32, 32)),
          h('div', { class: 'msg' }, '実行するプログラム名、または開くフォルダやドキュメント名、インターネット リソース名を入力してください。')),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '14px' } },
          h('label', { html: '名前(<u>O</u>):' }), h('div', { style: { flex: '1' } }, f))),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }, { id: 'b', label: '参照(&B)...' }],
      onButton: function (id) {
        if (id === 'b') {
          fileDialog({ mode: 'open', title: '参照', dir: 'C:\\WINDOWS' }).then(function (p) { if (p) f.value = p; });
          return false;
        }
      }
    }).then(function (r) {
      if (r !== 'ok') return;
      var v = f.value.trim();
      if (!v) return;
      if (!APPS.run(v)) {
        fail('ファイル名を指定して実行', "'" + v + "' が見つかりません。名前を正しく入力したかどうかを確認してから、やり直してください。").then(runDialog);
      }
    });
  }
  function logoff() {
    dialog({
      title: 'Windows のログオフ', icon: 'sm-logoff', width: 330, sound: false,
      body: 'ログオフしますか?',
      buttons: [{ id: 'y', label: 'はい(&Y)', def: true }, { id: 'n', label: 'いいえ(&N)', esc: true }]
    }).then(function (r) { if (r === 'y') { teardown(); snd.logoff(); window.__logon(); } });
  }

  /* =================================================================
   *  終了
   * ================================================================= */
  function shutdownDialog() {
    var mode = 'off';
    function r(v, label) { return Radio({ name: 'sd', label: label, checked: mode === v, onChange: function () { mode = v; } }); }
    dialog({
      title: 'Windows の終了', width: 356, sound: false, btnAlign: 'right',
      body: h('div', {},
        h('div', { class: 'dlg-row' }, h('div', {}, pic('sm-shutdown', 32, 32)), h('div', { class: 'msg' }, '次の中から選んでください。')),
        h('div', { style: { marginTop: '14px' } },
          r('off', '電源を切れる状態にする(&S)'), r('restart', '再起動する(&R)'),
          r('dos', 'MS-DOS モードで再起動する(&M)'), r('standby', 'スタンバイ(&T)'))),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }, { id: 'h', label: 'ヘルプ(&H)' }],
      onButton: function (id) { if (id === 'h') { APPS.help('shutdown'); return false; } }
    }).then(function (res) {
      if (res !== 'ok') return;
      shutdown(mode);
    });
  }
  function shutdown(mode, after) {
    var unsaved = D ? D.wins.filter(function (w) { return w.dirty && w.dirty(); }) : [];
    if (unsaved.length && mode !== 'standby') {
      unsaved[0].focus();
      unsaved[0].close();       /* 保存確認のダイアログが出る */
      return;
    }
    Save.commit();
    teardown();
    if (mode === 'standby') return standby();
    snd.logoff();
    fadeOut(function () {
      if (mode === 'restart') return window.__bootLogo(after || window.__desktop, 3200);
      if (mode === 'dos') return APPS.dosMode();
      powerOff();
    });
  }
  function teardown() { stopClock(); closeAllMenus(); }
  function fadeOut(next) {
    var root = h('div', { class: 'screen desk', style: { background: wallCSS() } });
    add(root, h('div', { class: 'center-abs' },
      h('div', { class: 'win dlg dsk', style: { position: 'static', width: '300px' } },
        h('div', { class: 'tbar' }, h('span', { class: 'ttl', text: 'Windows の終了' })),
        h('div', { class: 'cli' }, h('p', { class: 't', text: 'しばらくお待ちください。Windows を終了しています...' })))));
    D = null;
    setScreen(root);
    wait(2400).then(next);
  }
  function powerOff() {
    document.body.dataset.power = 'off';
    var root = h('div', { class: 'screen offscr' });
    var b = Btn('電源を入れる', {
      def: true, onClick: function () {
        document.body.dataset.power = 'on';
        if (Save.installed()) window.__bootLogo(window.__desktop, 4000); else window.__bootDOS();
      }
    });
    b.style.marginTop = '26px';
    add(root, h('div', { class: 'msg' }, 'コンピュータの電源を', h('br'), '切る準備ができました。', h('div', {}, b)));
    setScreen(root);
  }
  function standby() {
    document.body.dataset.power = 'standby';
    var root = h('div', { class: 'screen black' });
    add(root, h('div', { class: 'standby-msg', text: 'スタンバイ中 — 画面をクリックすると再開します' }));
    root.addEventListener('click', function () { document.body.dataset.power = 'on'; window.__desktop(); });
    D = null;
    setScreen(root);
  }

  /* =================================================================
   *  デスクトップ本体
   * ================================================================= */
  function stopClock() { if (clockIV) { clearInterval(clockIV); clockIV = null; } }

  window.__desktop = function () {
    W.setTheme('desk');
    stopClock();
    menuStack.length = 0; menuClose = null; startMenuEl = null; popupEl = null;
    var firstRun = !Save.installed();
    if (firstRun) Save.markInstalled(S); else Save.applyTo(S);
    Save.state.boots = (Save.state.boots || 0) + 1;
    var desk = Save.state.desk;
    W.setVolume(desk.mute ? 0 : desk.vol);

    var root = h('div', { class: 'screen desk' });
    var icons = h('div', { class: 'icons' });
    var winlayer = h('div', { class: 'winlayer' });
    var tasks = h('div', { class: 'tasks' });
    var clock = h('div', { id: 'clock' });
    var startBtn = h('button', { class: 'btn', id: 'startbtn', type: 'button' }, pic('start-flag', 20, 16), h('span', { text: 'スタート' }));
    function qlBtn(icon, title, act) {
      var b = h('button', { class: 'qlb', type: 'button', title: title }, pic(icon, 16, 16));
      b.addEventListener('click', function (e) { e.stopPropagation(); closeAllMenus(); act(); });
      return b;
    }
    var ql = h('div', { class: 'ql' }, h('i', { class: 'grip' }),
      qlBtn('ql-desktop', 'デスクトップの表示', function () { D.wins.slice().forEach(function (r) { if (!r.min) minimize(r); }); }),
      qlBtn('ql-ie', 'Internet Explorer ブラウザの起動', function () { APPS.ie(); }),
      qlBtn('ql-oe', 'Outlook Express の起動', function () { APPS.oe(); }),
      qlBtn('ql-wmp', 'Windows Media Player', function () { APPS.wmp(); }),
      h('i', { class: 'grip' }));
    var volBtn = h('button', { class: 'trayb', type: 'button', title: '音量' }, pic('tray-vol', 16, 16));
    volBtn.addEventListener('click', function (e) { e.stopPropagation(); volumePopup(); });
    clock.addEventListener('dblclick', function () { APPS.datetime(); });
    var tray = h('div', { class: 'tray' }, pic('tray-net', 16, 16), volBtn, clock);
    var taskbar = h('div', { class: 'taskbar' }, startBtn, ql, tasks, tray);
    add(root, [icons, winlayer, taskbar]);

    D = { root: root, icons: icons, winlayer: winlayer, tasks: tasks, startBtn: startBtn, clock: clock, wins: [], active: null };
    applyWall();
    clock.hidden = desk.clock === false;
    drawIcons();
    if (unwatchIcons) unwatchIcons();
    unwatchIcons = VFS.on(function () { if (D && D.root === root && root.isConnected) drawIcons(); });

    startBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleStart(); });
    root.addEventListener('click', function () {
      closeAllMenus();
      icons.querySelectorAll('.dicon').forEach(function (n) { n.setAttribute('aria-selected', 'false'); });
    });
    root.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    icons.addEventListener('contextmenu', deskMenu);
    winlayer.addEventListener('contextmenu', function (e) { if (e.target === winlayer) deskMenu(e); });
    root.addEventListener('contextmenu', function (e) { if (e.target === root) deskMenu(e); });
    function deskMenu(e) {
      if (e.target.closest && e.target.closest('.dicon')) return;
      ctxMenu(e, [
        { label: 'アイコンの整列(&I)', act: drawIcons },
        { label: '最新の情報に更新(&E)', act: drawIcons },
        { sep: true },
        { label: '新規作成(&W)', sub: [
          { label: 'フォルダ(&F)', icon: 'folder16', act: function () { Ops.newFolder(DESKDIR); } },
          { sep: true },
          { label: 'テキスト文書', icon: 'txt16', act: function () { Ops.newFile(DESKDIR, 'txt'); } },
          { label: 'ビットマップ イメージ', icon: 'bmp16', act: function () { Ops.newFile(DESKDIR, 'bmp'); } }] },
        { sep: true },
        { label: 'プロパティ(&R)', act: function () { APPS.display(); } }
      ]);
    }

    function tickClock() {
      var d = new Date();
      clock.textContent = d.getHours() + ':' + pad(d.getMinutes());
      clock.title = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 (' + '日月火水木金土'[d.getDay()] + ')';
    }
    tickClock();
    clockIV = setInterval(tickClock, 10000);

    setScreen(root);
    snd.startup();
    Save.commit();

    var lr = Save.state.lastRestore;
    if (lr) {
      delete Save.state.lastRestore; Save.schedule();
      wait(1600).then(function () {
        if (D && D.root === root) info('システムの復元', '復元は完了しました。<br><br>コンピュータは次の時点の状態に復元されました:<br>' + esc(fmtDate(lr.at)) + '  ' + esc(lr.name), 'ico-restore');
      });
    } else if (firstRun) {
      wait(1400).then(function () { if (D && D.root === root) APPS.welcome(); });
    }
  };

  window.__Desk = {
    APPS: APPS, openWindow: openWindow, findWin: findWin, MenuBar: MenuBar, ctxMenu: ctxMenu, openMenuAt: openMenuAt,
    closeAllMenus: closeAllMenus, fileDialog: fileDialog, askName: askName, Ops: Ops, openPath: openPath, runApp: runApp,
    iconOf: iconOf, kindOf: kindOf, fmtSize: fmtSize, fmtDate: fmtDate, info: info, fail: fail, na: na, lab: lab,
    WALLS: WALLS, applyWall: applyWall, wallCSS: wallCSS, taskbarProps: taskbarProps, emptyRecycle: emptyRecycle, shutdown: shutdown, runDialog: runDialog,
    volumePopup: volumePopup, relRect: relRect, rel: rel, D: function () { return D; }, DESK_H: DESK_H
  };
})();
