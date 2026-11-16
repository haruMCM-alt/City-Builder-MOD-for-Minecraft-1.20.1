/* =========================================================================
 * apps.js : デスクトップで動くアプリ
 *   エクスプローラ / メモ帳 / ペイント / 電卓 / マインスイーパ /
 *   Internet Explorer / Windows Media Player / Outlook Express /
 *   システムの復元 / 検索 / ヘルプ / MS-DOS プロンプト / コントロール パネル
 * ファイルは save.js の仮想ファイル システム (C:) に保存される。
 * ========================================================================= */
(function () {
  'use strict';
  var W = window.__WinMe, Desk = window.__Desk, VFS = window.__VFS, Save = window.__Save, S = window.__setupState;
  var h = W.h, add = W.add, esc = W.esc, wait = W.wait, pic = W.pic, pad = W.pad;
  var Btn = W.Btn, Field = W.Field, Radio = W.Radio, Check = W.Check, dialog = W.dialog, snd = W.snd;
  var APPS = Desk.APPS, openWindow = Desk.openWindow, MenuBar = Desk.MenuBar, ctxMenu = Desk.ctxMenu;
  var info = Desk.info, fail = Desk.fail, Ops = Desk.Ops, fileDialog = Desk.fileDialog;
  var iconOf = Desk.iconOf, fmtSize = Desk.fmtSize, fmtDate = Desk.fmtDate, openPath = Desk.openPath;

  function sepBtn() { return h('i', { class: 'tsep' }); }
  function tbtn(label, glyph, act, title) {
    var b = h('button', { class: 'btn tlbtn', type: 'button', title: title || label },
      glyph ? h('span', { class: 'gl', html: glyph }) : null, label ? h('span', { text: label }) : null);
    b.addEventListener('click', function (e) { e.stopPropagation(); act(); });
    return b;
  }
  function tabs(names) {
    return h('div', { class: 'tabs' }, names.map(function (n, i) { return h('span', { class: 'tab' + (i ? '' : ' on'), text: n }); }));
  }
  function about(title, app, icon) {
    dialog({
      title: title + 'のバージョン情報', width: 380, sound: false, btnAlign: 'right',
      body: h('div', { class: 'about' },
        h('div', { class: 'about-head' }, pic(icon || 'ico-mycomputer', 32, 32), h('div', {},
          h('div', { text: 'Microsoft (R) ' + app }),
          h('div', { text: 'Windows Millennium Edition' }),
          h('div', { text: 'Copyright (C) 1981-2000 Microsoft Corp.' }))),
        h('div', { class: 'about-sep' }),
        h('div', { text: 'この製品は次の方にライセンスされています:' }),
        h('div', { class: 'about-lic', text: S.user.name || 'ユーザー' }),
        h('div', { class: 'about-lic', text: S.user.company || '' }),
        h('div', { class: 'about-sep' }),
        h('div', { text: 'Windows で使用できる物理メモリ:  130,612 KB' })),
      buttons: [{ id: 'ok', label: 'OK', def: true, esc: true }]
    });
  }
  /* 変更を保存するかどうかの確認（はい / いいえ / キャンセル） */
  function askSave(app, name) {
    return dialog({
      title: app, icon: 'warn', width: 360, sound: false,
      body: esc(name) + ' ファイルの内容は変更されています。<br><br>変更を保存しますか?',
      buttons: [{ id: 'y', label: 'はい(&Y)', def: true }, { id: 'n', label: 'いいえ(&N)' }, { id: 'c', label: 'キャンセル', esc: true }]
    });
  }

  /* =================================================================
   *  ようこそ
   * ================================================================= */
  APPS.welcome = function () {
    openWindow({
      title: 'Windows Me へようこそ', w: 380, y: 96, x: 130, max: false, app: 'welcome',
      build: function (cli, rec) {
        cli.classList.add('welcome');
        add(cli, h('div', { class: 'dlg-row' },
          h('div', {}, pic('ico-mycomputer', 32, 32)),
          h('div', { class: 'msg' },
            h('div', { style: { fontWeight: '700', marginBottom: '6px' }, text: 'ようこそ、' + (S.user.name || 'ユーザー') + ' さん' }),
            h('div', { text: 'セットアップが完了しました。このコンピュータの状態は、ブラウザに自動的に保存されます。次に開いたときは、パッケージをクリックするとこのデスクトップから再開できます。' }),
            h('div', { style: { marginTop: '8px' }, text: '[スタート] → [プログラム] → [アクセサリ] のメモ帳・ペイント・電卓・マインスイーパや、Internet Explorer、Windows Media Player を試してみてください。' }))));
        add(cli, h('div', { class: 'dlg-btns right' },
          Btn('ヘルプを見る(&H)', { onClick: function () { rec.close(); APPS.help('new'); } }),
          Btn('閉じる', { def: true, onClick: function () { rec.close(); } })));
      }
    });
  };

  /* =================================================================
   *  コントロール パネルの各項目
   * ================================================================= */
  APPS.display = function () {
    var desk = Save.state.desk, WALLS = Desk.WALLS;
    var cur = desk.wall;
    var opts = WALLS.map(function (w, i) { return { i: i, label: w[0] }; });
    if (desk.wallImg) opts.push({ i: -1, label: '(ペイントで設定した画像)' });
    var list = h('div', { class: 'well lst', style: { height: '100px' }, tabindex: '0' });
    var screen = h('div', { class: 'mon-screen' });
    var prev = h('div', { class: 'mon' }, pic('sys-monitor', 122, 120), screen);
    function css(i) {
      if (i === -1) return desk.wallMode === 'tile' ? '#3a6ea5 url("' + desk.wallImg + '") 0 0/30% repeat' : '#3a6ea5 url("' + desk.wallImg + '") center/50% no-repeat';
      return (WALLS[i] || WALLS[0])[1];
    }
    function sel(i) {
      cur = i; screen.style.background = css(i);
      list.querySelectorAll('.it').forEach(function (n) { n.setAttribute('aria-selected', +n.dataset.i === i ? 'true' : 'false'); });
    }
    opts.forEach(function (o) {
      var it = h('div', { class: 'it', text: o.label, data: { i: String(o.i) } });
      it.addEventListener('click', function () { sel(o.i); });
      add(list, it);
    });
    sel(cur);
    list.addEventListener('keydown', function (e) {
      var idx = opts.findIndex(function (o) { return o.i === cur; });
      if (e.key === 'ArrowDown') { e.preventDefault(); sel(opts[Math.min(opts.length - 1, idx + 1)].i); }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel(opts[Math.max(0, idx - 1)].i); }
    });
    dialog({
      title: '画面のプロパティ', width: 388, sound: false, btnAlign: 'right',
      body: h('div', {},
        tabs(['背景', 'スクリーン セーバー', 'デザイン', '設定']),
        h('div', { class: 'tabbody' },
          h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '8px' } }, prev),
          h('label', { html: '壁紙(<u>W</u>):', style: { display: 'block', marginBottom: '4px' } }), list)),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }, { id: 'ap', label: '適用(&A)' }],
      onButton: function (id) {
        if (id === 'ap' || id === 'ok') { desk.wall = cur; Desk.applyWall(); Save.schedule(); }
        if (id === 'ap') return false;
      }
    });
  };

  APPS.datetime = function () {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    var cal = h('div', { class: 'cal' });
    ['日', '月', '火', '水', '木', '金', '土'].forEach(function (d) { add(cal, h('b', { text: d })); });
    var first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    for (var i = 0; i < first; i++) add(cal, h('span'));
    for (var d = 1; d <= days; d++) add(cal, h('span', { class: d === now.getDate() ? 'on' : '', text: String(d) }));
    var clock = h('div', { class: 'bigclock' });
    function upd() { var t = new Date(); clock.textContent = pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds()); }
    upd();
    var iv = setInterval(upd, 1000);
    dialog({
      title: '日付と時刻のプロパティ', width: 410, sound: false, btnAlign: 'right',
      body: h('div', {},
        tabs(['日付と時刻', 'タイム ゾーン']),
        h('div', { class: 'tabbody dt' },
          h('fieldset', { class: 'grp' }, h('legend', { text: '日付' }),
            h('div', { class: 'well dt-month', text: y + '年 ' + (m + 1) + '月' }), cal),
          h('fieldset', { class: 'grp' }, h('legend', { text: '時刻' }), clock)),
        h('div', { class: 'dt-tz', text: '現在のタイム ゾーン: ' + S.tz })),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
    }).then(function () { clearInterval(iv); });
  };

  APPS.sysprops = function () {
    var k = S.key.join('').replace(/(.{5})(?=.)/g, '$1-') || '-----';
    dialog({
      title: 'システムのプロパティ', width: 440, sound: false, btnAlign: 'right',
      body: h('div', {},
        tabs(['情報', 'デバイス マネージャ', 'ハードウェア プロファイル', 'パフォーマンス']),
        h('div', { class: 'tabbody', style: { display: 'flex', gap: '16px' } },
          h('div', {}, pic('sys-monitor', 122, 120)),
          h('div', { style: { lineHeight: '17px', flex: '1' } },
            h('div', { text: 'システム:' }),
            h('div', { class: 'ind', text: 'Microsoft Windows Me' }),
            h('div', { class: 'ind', text: '4.90.3000' }),
            h('div', { style: { marginTop: '8px' }, text: '使用者:' }),
            h('div', { class: 'ind', text: S.user.name }),
            h('div', { class: 'ind', text: S.user.company || '' }),
            h('div', { class: 'ind', text: k }),
            h('div', { style: { marginTop: '8px' }, text: 'コンピュータ:' }),
            h('div', { class: 'ind', text: 'GenuineIntel' }),
            h('div', { class: 'ind', text: 'Pentium(r) III プロセッサ' }),
            h('div', { class: 'ind', text: '128.0 MB RAM' })))),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
    });
  };

  var EVENTS = [
    ['Windows の起動', 'startup', 'The Microsoft Sound.wav'], ['Windows の終了', 'logoff', 'LOGOFF.WAV'],
    ['一般の警告音', 'ding', 'DING.WAV'], ['メッセージ (情報)', 'chord', 'CHORD.WAV'],
    ['ナビゲーションの開始', 'start', 'START.WAV'], ['ごみ箱を空にする', 'recycle', 'RECYCLE.WAV'],
    ['(未割り当て)', 'tada', 'TADA.WAV']
  ];
  APPS.sound = function () {
    var desk = Save.state.desk, cur = 0;
    var list = h('div', { class: 'well lst', style: { height: '112px' }, tabindex: '0' });
    var nameEl = h('div', { class: 'well snd-name' });
    EVENTS.forEach(function (ev, i) {
      var it = h('div', { class: 'it', text: ev[0] });
      it.addEventListener('click', function () { pick(i); });
      it.addEventListener('dblclick', function () { snd.play(ev[1]); });
      add(list, it);
    });
    function pick(i) {
      cur = i;
      list.querySelectorAll('.it').forEach(function (n, j) { n.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
      nameEl.textContent = EVENTS[i][2];
    }
    pick(0);
    var rng = h('input', { type: 'range', min: '0', max: '100', class: 'hrange', 'aria-label': '音量' });
    rng.value = String(Math.round(desk.vol * 100));
    var mute = Check({ label: 'ミュート(&M)', checked: !!desk.mute });
    function apply() { desk.vol = +rng.value / 100; desk.mute = mute.input.checked; W.setVolume(desk.mute ? 0 : desk.vol); Save.schedule(); }
    rng.addEventListener('input', apply); mute.input.addEventListener('change', apply);
    dialog({
      title: 'サウンドとマルチメディアのプロパティ', width: 400, sound: false, btnAlign: 'right',
      body: h('div', {},
        tabs(['サウンド', 'オーディオ', 'デバイス']),
        h('div', { class: 'tabbody' },
          h('div', { class: 'snd-row' }, h('span', { text: '音量:' }), rng, mute),
          h('label', { html: 'サウンド イベント(<u>E</u>):', class: 'lbl', style: { marginTop: '8px' } }), list,
          h('div', { class: 'snd-row', style: { marginTop: '8px' } }, h('span', { text: '名前:' }), nameEl,
            Btn('▶ 再生(&P)', { onClick: function () { snd.play(EVENTS[cur][1]); } })))),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
    });
  };

  APPS.addremove = function () {
    var progs = [['Windows Media Player 7', '13.1 MB'], ['Internet Explorer 5.5', '18.4 MB'], ['Outlook Express 5.5', '6.1 MB'],
      ['Windows ムービー メーカー', '7.9 MB'], ['MSN Messenger サービス', '1.8 MB'], ['DirectX 7.1', '9.2 MB']];
    var list = h('div', { class: 'well lst', style: { height: '150px' } });
    progs.forEach(function (p) { add(list, h('div', { class: 'it ar-row' }, h('span', { text: p[0] }), h('span', { class: 'dim', text: p[1] }))); });
    dialog({
      title: 'アプリケーションの追加と削除のプロパティ', width: 400, sound: false, btnAlign: 'right',
      body: h('div', {},
        tabs(['インストールと削除', 'Windows ファイル', '起動ディスク']),
        h('div', { class: 'tabbody' },
          h('p', { class: 't', text: '次のソフトウェアは、Windows によって自動的に削除できます。プログラムを削除するには、一覧から選択して [追加と削除] をクリックしてください。' }),
          list,
          h('div', { style: { textAlign: 'right', marginTop: '8px' } }, Btn('追加と削除(&R)...', { disabled: true })))),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
    });
  };

  function ieState() { return Save.state.ie || (Save.state.ie = { home: 'about:home' }); }
  APPS.inetopts = function () {
    var ie = ieState();
    var f = Field({ value: ie.home, w: '100%' });
    dialog({
      title: 'インターネット オプション', width: 400, sound: false, btnAlign: 'right',
      body: h('div', {},
        tabs(['全般', 'セキュリティ', 'コンテンツ', '接続']),
        h('div', { class: 'tabbody' },
          h('fieldset', { class: 'grp' }, h('legend', { text: 'ホーム ページ' }),
            h('div', { class: 'dlg-row' }, pic('ico-world', 32, 32), h('div', { style: { flex: '1' } },
              h('div', { text: 'ホーム ページとして使用するページを指定できます。' }),
              h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '8px 0' } }, h('label', { html: 'アドレス(<u>R</u>):' }), h('div', { style: { flex: '1' } }, f)),
              h('div', { style: { display: 'flex', gap: '6px' } },
                Btn('標準設定(&F)', { onClick: function () { f.value = 'about:home'; } }),
                Btn('空白を使用(&B)', { onClick: function () { f.value = 'about:blank'; } }))))))),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
    }).then(function (r) { if (r === 'ok') { ie.home = f.value.trim() || 'about:home'; Save.schedule(); } });
  };

  APPS.scandisk = function () {
    var bar = W.Progress(), st = h('div', { text: 'ファイルとフォルダを確認しています...' });
    dialog({
      title: 'スキャンディスク - (C:)', width: 360, sound: false, noButtons: true,
      body: h('div', {}, h('div', { class: 'dlg-row' }, pic('drv-hdd', 32, 32), h('div', { class: 'msg' }, st)), h('div', { style: { marginTop: '12px' } }, bar)),
      onOpen: function (win, done) {
        var p = 0;
        (function tick() {
          p += 6 + Math.random() * 8; bar.set(p);
          if (p > 50) st.textContent = 'ファイル アロケーション テーブルを確認しています...';
          if (p < 100) { setTimeout(tick, 160); return; }
          done('ok');
          info('スキャンディスクの結果 - (C:)', 'スキャンディスクはエラーを検出しませんでした。<br><br>' +
            VFS.size(VFS.get('C:')).toLocaleString() + ' バイト (ファイル)<br>1,341,652,992 バイト (空き領域)', 'drv-hdd');
        })();
      }
    });
  };

  /* =================================================================
   *  エクスプローラ（フォルダ ウィンドウ）
   * ================================================================= */
  var CPL = [
    { name: 'アプリケーションの追加と削除', icon: 'ico-settings', desc: 'プログラムのインストールと削除、Windows コンポーネントの追加と削除を行います。', act: function () { APPS.addremove(); } },
    { name: 'インターネット オプション', icon: 'ico-world', desc: 'Internet Explorer のホーム ページなどを設定します。', act: function () { APPS.inetopts(); } },
    { name: 'サウンドとマルチメディア', icon: 'cpl-sound', desc: 'システム イベントのサウンドと音量を設定します。', act: function () { APPS.sound(); } },
    { name: 'システム', icon: 'cpl-system', desc: 'システムの情報を表示します。', act: function () { APPS.sysprops(); } },
    { name: 'タスク バーと [スタート] メニュー', icon: 'ico-settings', desc: 'タスク バーの時計の表示などを設定します。', act: function () { Desk.taskbarProps(); } },
    { name: '画面', icon: 'cpl-display', desc: 'デスクトップの壁紙を変更します。', act: function () { APPS.display(); } },
    { name: '日付と時刻', icon: 'cpl-datetime', desc: 'コンピュータの日付と時刻を表示します。', act: function () { APPS.datetime(); } },
    { name: 'ユーザー', icon: 'ico-users', desc: 'このコンピュータのユーザーを表示します。', act: function () { info('ユーザー', 'このコンピュータのユーザー: ' + esc(S.user.name || 'ユーザー')); } }
  ];
  var TYPENAME = { txt: 'テキスト文書', ini: '構成設定', bmp: 'ビットマップ イメージ', exe: 'アプリケーション', wav: 'Wave サウンド', htm: 'HTML 文書', doc: 'ファイル', dir: 'ファイル フォルダ' };
  var clip = null;              /* エクスプローラのクリップボード { op, paths } */

  APPS.explorer = function (path) {
    path = path || 'C:';
    if (path[0] !== ':') { path = VFS.real(path) || path; if (!VFS.get(path)) return fail('エクスプローラ', path + ' が見つかりません。'); }
    var cur = path, back = [], fwd = [], sel = [];
    var addr = Field({ w: '100%', spell: false });
    var view = h('div', { class: 'iview', tabindex: '0' });
    var wvTitle = h('div', { class: 'wv-title' }), wvBody = h('div', { class: 'wv-body' });
    var wv = h('div', { class: 'webview' }, wvTitle, h('div', { class: 'wv-rule' }), wvBody);
    var addrIc = h('span', { class: 'addr-ic' });
    var st1 = h('div'), st2 = h('div');
    var bBack, bFwd, bUp, rec;

    function real() { return cur[0] !== ':'; }
    function canWrite() { return real() && !VFS.readonly(cur); }
    function parentOf(p) {
      if (p === '::mycomputer') return null;
      if (p === '::control' || p === '::recycle') return '::mycomputer';
      if (VFS.isRoot(p)) return '::mycomputer';
      return VFS.parent(p);
    }
    function nav(p) {
      if (p === cur) return;
      back.push(cur); fwd = [];
      cur = p; sel = []; draw();
    }
    function goBack() { if (!back.length) return; fwd.push(cur); cur = back.pop(); sel = []; draw(); }
    function goFwd() { if (!fwd.length) return; back.push(cur); cur = fwd.pop(); sel = []; draw(); }
    function up() { var p = parentOf(cur); if (p) nav(p); }
    function navTyped() {
      var v = addr.value.trim();
      if (/^マイ ?コンピュータ$/.test(v)) return nav('::mycomputer');
      if (/^コントロール ?パネル$/.test(v)) return nav('::control');
      if (/^ごみ箱$/.test(v)) return nav('::recycle');
      if (/^(https?:\/\/|www\.)/i.test(v)) return APPS.ie(v);
      var n = VFS.get(v);
      if (!n) return fail('アドレス', "'" + v + "' が見つかりません。名前を正しく入力したかどうかを確認してから、やり直してください。");
      if (n.t === 'd') nav(VFS.real(v)); else openPath(v);
    }
    function title() {
      if (cur === '::mycomputer') return 'マイ コンピュータ';
      if (cur === '::control') return 'コントロール パネル';
      if (cur === '::recycle') return 'ごみ箱';
      if (cur === 'C:') return 'ローカル ディスク (C:)';
      if (cur === 'D:') return 'WIN_ME (D:)';
      if (cur === 'C:\\My Documents') return 'マイ ドキュメント';
      return VFS.base(cur);
    }
    function icon16() {
      if (cur === '::mycomputer') return 'mycomputer16';
      if (cur === '::control') return 'cpl16';
      if (cur === '::recycle') return VFS.recycle.list().length ? 'recyclefull16' : 'recycle16';
      return iconOf(cur, VFS.get(cur), true);
    }
    function items() {
      if (cur === '::mycomputer') return [
        { name: '3.5 インチ FD (A:)', icon: 'drv-floppy', path: 'A:', kind: 'floppy', desc: '3.5 インチ フロッピー ディスク' },
        { name: 'ローカル ディスク (C:)', icon: 'drv-hdd', path: 'C:', kind: 'go', desc: 'ローカル ディスク\n空き領域: 1.24 GB' },
        { name: 'WIN_ME (D:)', icon: 'drv-cd', path: 'D:', kind: 'go', desc: 'CD-ROM ディスク (読み取り専用)' },
        { name: 'コントロール パネル', icon: 'ico-cpl', path: '::control', kind: 'go', desc: 'コンピュータの設定を変更します。' }];
      if (cur === '::control') return CPL.map(function (c) { return { name: c.name, icon: c.icon, path: '::cpl:' + c.name, kind: 'cpl', act: c.act, desc: c.desc }; });
      if (cur === '::recycle') return VFS.recycle.list().map(function (r, i) {
        return { name: r.node.n, icon: iconOf(r.node.n, r.node, false), path: '::rb:' + i, kind: 'rb', idx: i, desc: '元の場所: ' + VFS.disp(r.from) + '\n削除日時: ' + fmtDate(r.at) };
      });
      return (VFS.list(cur) || []).map(function (n) {
        var p = VFS.join(cur, n.n);
        return { name: n.n, icon: iconOf(p, n, false), path: p, kind: n.t === 'd' ? 'dir' : 'file', node: n };
      });
    }
    function byPath(p) { var r = null; items().forEach(function (i) { if (i.path === p) r = i; }); return r; }
    function openItem(it) {
      if (!it) return;
      if (it.kind === 'dir' || it.kind === 'go') return nav(it.path);
      if (it.kind === 'floppy') return dialog({
        title: 'A:\\', icon: 'error', width: 352, body: 'A:\\ にアクセスできません。<br><br>デバイスの準備ができていません。',
        buttons: [{ id: 'r', label: '再試行(&R)', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
      });
      if (it.kind === 'cpl') return it.act();
      if (it.kind === 'rb') return info('ごみ箱', 'ごみ箱の中のファイルは開けません。<br>開くには、[元に戻す] で元の場所に戻してください。');
      openPath(it.path);
    }
    function selectAll() { sel = items().map(function (i) { return i.path; }); paintSel(); }
    function copySel(op) {
      if (!real() || !sel.length) return;
      if (op === 'cut' && !canWrite()) return;
      clip = { op: op, paths: sel.slice() };
      view.querySelectorAll('.iv').forEach(function (n) { n.classList.toggle('cut', op === 'cut' && sel.indexOf(n.dataset.path) >= 0); });
    }
    function paste() {
      if (!clip || !canWrite()) return;
      try {
        clip.paths.forEach(function (p) {
          if (!VFS.get(p)) return;
          var par = VFS.parent(p);
          if (clip.op === 'cut' && par && par.toLowerCase() === cur.toLowerCase()) return;
          if ((cur + '\\').toLowerCase().indexOf((p + '\\').toLowerCase()) === 0) {
            throw new Error("'" + VFS.base(p) + "' をコピーできません。\nコピー先のフォルダは、コピー元のフォルダのサブフォルダです。");
          }
          VFS.copy(p, cur);
          if (clip.op === 'cut') VFS.remove(p, true);
        });
        if (clip.op === 'cut') clip = null;
      } catch (e) { fail('ファイルのコピー', e.message); }
    }
    function delSel() {
      if (cur === '::recycle') {
        var idx = sel.map(function (p) { return +p.slice(5); }).sort(function (a, b) { return b - a; });
        if (!idx.length) return;
        dialog({
          title: 'ファイルの削除の確認', icon: 'ico-recycle-full', width: 360, body: idx.length + ' 個の項目を完全に削除しますか?',
          buttons: [{ id: 'y', label: 'はい(&Y)', def: true }, { id: 'n', label: 'いいえ(&N)', esc: true }]
        }).then(function (r) { if (r === 'y') { idx.forEach(function (i) { VFS.recycle.purge(i); }); snd.recycle(); } });
        return;
      }
      if (!sel.length || !real()) return;
      if (!canWrite()) { fail('ファイルの削除', 'ディスクは書き込み禁止になっています。'); return; }
      Ops.del(sel);
    }
    function restoreSel() {
      sel.map(function (p) { return +p.slice(5); }).sort(function (a, b) { return b - a; }).forEach(function (i) { VFS.recycle.restore(i); });
    }
    function newMenu() {
      return [
        { label: 'フォルダ(&F)', icon: 'folder16', act: function () { Ops.newFolder(cur); } }, { sep: true },
        { label: 'テキスト文書', icon: 'txt16', act: function () { Ops.newFile(cur, 'txt'); } },
        { label: 'ビットマップ イメージ', icon: 'bmp16', act: function () { Ops.newFile(cur, 'bmp'); } }];
    }
    function paintSel() {
      view.querySelectorAll('.iv').forEach(function (n) { n.setAttribute('aria-selected', sel.indexOf(n.dataset.path) >= 0 ? 'true' : 'false'); });
      describe();
    }
    function describe() {
      var its = items();
      if (sel.length === 1) {
        var it = byPath(sel[0]);
        if (it) {
          wvTitle.textContent = it.name;
          var lines = [];
          if (it.desc) lines.push(it.desc);
          if (it.node) {
            lines.push(TYPENAME[Desk.kindOf(it.name, it.node)]);
            lines.push('更新日時: ' + fmtDate(it.node.m || Date.now()));
            if (it.kind !== 'dir') lines.push('サイズ: ' + fmtSize(VFS.size(it.node)));
          }
          wvBody.textContent = lines.join('\n');
          st1.textContent = '1 個のオブジェクトを選択';
          st2.textContent = it.node && it.kind !== 'dir' ? fmtSize(VFS.size(it.node)) : '';
          return;
        }
      }
      wvTitle.textContent = title();
      var DESC = {
        '::mycomputer': 'コンピュータのドライブやコントロール パネルを表示します。\n\n項目を選択すると、その説明が表示されます。',
        '::control': 'コントロール パネルを使って、コンピュータの設定をカスタマイズできます。\n\n項目を選択すると、その説明が表示されます。',
        '::recycle': 'このフォルダには、削除したファイルやフォルダが入っています。\n\n元に戻すには、項目を右クリックして [元に戻す] を選んでください。'
      };
      wvBody.textContent = sel.length > 1 ? sel.length + ' 個の項目を選択' :
        (DESC[cur] || (cur === 'C:\\My Documents' ? 'このフォルダには、ドキュメントや画像などのファイルを保存できます。\n\n' : '') + '項目を選択すると、その説明が表示されます。');
      st1.textContent = sel.length > 1 ? sel.length + ' 個のオブジェクトを選択' : its.length + ' 個のオブジェクト';
      st2.textContent = real() ? fmtSize(its.reduce(function (s, i) { return s + (i.node && i.kind !== 'dir' ? VFS.size(i.node) : 0); }, 0)) : (cur === '::mycomputer' ? 'マイ コンピュータ' : '');
    }
    function itemMenu(it) {
      if (it.kind === 'rb') return [{ label: '元に戻す(&E)', bold: true, act: restoreSel }, { sep: true }, { label: '削除(&D)', act: delSel }];
      if (it.kind === 'cpl') return [{ label: '開く(&O)', bold: true, act: function () { it.act(); } }];
      if (it.kind === 'go' || it.kind === 'floppy') {
        var m = [{ label: '開く(&O)', bold: true, act: function () { openItem(it); } }];
        if (it.path === 'C:' || it.path === 'D:') m.push({ label: 'エクスプローラ(&X)', act: function () { APPS.explorer(it.path); } }, { sep: true }, { label: 'プロパティ(&R)', act: function () { Ops.props(it.path); } });
        return m;
      }
      return [
        { label: '開く(&O)', bold: true, act: function () { openItem(it); } },
        it.kind === 'dir' ? { label: 'エクスプローラ(&X)', act: function () { APPS.explorer(it.path); } } : null,
        it.kind === 'file' && /\.(txt|ini|bat|log|sys|inf)$/i.test(it.name) ? { label: '編集(&E)', act: function () { APPS.notepad(it.path); } } : null,
        { sep: true },
        { label: '切り取り(&T)', dis: !canWrite(), act: function () { copySel('cut'); } },
        { label: 'コピー(&C)', act: function () { copySel('copy'); } },
        { sep: true },
        { label: '削除(&D)', dis: !canWrite(), act: delSel },
        { label: '名前の変更(&M)', dis: !canWrite(), act: function () { Ops.rename(it.path); } },
        { sep: true },
        { label: 'プロパティ(&R)', act: function () { Ops.props(it.path); } }].filter(Boolean);
    }
    function draw() {
      var t = title();
      rec.setTitle(t);
      [rec.win.querySelector('.tbar .ti img'), rec.tb.querySelector('.ti img')].forEach(function (img) { if (img) img.src = W.src(icon16()); });
      addr.value = real() ? VFS.disp(cur) : t;
      addrIc.replaceChildren(pic(icon16(), 16, 16));
      bBack.disabled = !back.length; bFwd.disabled = !fwd.length; bUp.disabled = !parentOf(cur);
      view.replaceChildren();
      sel = sel.filter(function (p) { return !!byPath(p); });
      items().forEach(function (it) {
        var el = h('div', { class: 'iv', data: { path: it.path } }, h('div', {}, pic(it.icon, 32, 32)), h('div', { class: 'lab', text: it.name }));
        if (clip && clip.op === 'cut' && clip.paths.indexOf(it.path) >= 0) el.classList.add('cut');
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          if (e.ctrlKey) { var i = sel.indexOf(it.path); if (i >= 0) sel.splice(i, 1); else sel.push(it.path); }
          else sel = [it.path];
          paintSel();
        });
        el.addEventListener('dblclick', function () { openItem(it); });
        el.addEventListener('contextmenu', function (e) {
          if (sel.indexOf(it.path) < 0) { sel = [it.path]; paintSel(); }
          ctxMenu(e, itemMenu(it));
        });
        add(view, el);
      });
      paintSel();
    }
    function layout() { rec.win.classList.toggle('narrow', rec.win.offsetWidth < 420); }

    rec = openWindow({
      title: '', w: 470, h: 320, resizable: true, minW: 300, minH: 200, icon: 'folder16', app: 'explorer',
      onResize: function () { layout(); },
      onKey: function (e) {
        if (e.target === addr) return;
        var k = e.key.toLowerCase();
        if (e.key === 'Delete') { e.preventDefault(); delSel(); }
        else if (e.key === 'F2') { e.preventDefault(); if (sel.length === 1 && canWrite()) Ops.rename(sel[0]); }
        else if (e.key === 'Enter') { e.preventDefault(); if (sel.length) openItem(byPath(sel[0])); }
        else if (e.key === 'Backspace') { e.preventDefault(); up(); }
        else if (e.key === 'F5') { e.preventDefault(); draw(); }
        else if (e.ctrlKey && k === 'a') { e.preventDefault(); selectAll(); }
        else if (e.ctrlKey && k === 'c') { e.preventDefault(); copySel('copy'); }
        else if (e.ctrlKey && k === 'x') { e.preventDefault(); copySel('cut'); }
        else if (e.ctrlKey && k === 'v') { e.preventDefault(); paste(); }
      },
      build: function (cli) {
        cli.classList.add('explorer');
        add(cli, MenuBar([
          { label: 'ファイル(&F)', items: function () {
            return [
              { label: '新規作成(&W)', dis: !canWrite(), sub: newMenu() },
              { sep: true },
              cur === '::recycle' ? { label: 'ごみ箱を空にする(&B)', dis: !VFS.recycle.list().length, act: Desk.emptyRecycle } : null,
              cur === '::recycle' ? { label: '元に戻す(&E)', dis: !sel.length, act: restoreSel } : null,
              { label: '削除(&D)', dis: !sel.length || (!canWrite() && cur !== '::recycle'), act: delSel },
              { label: '名前の変更(&M)', dis: sel.length !== 1 || !canWrite(), act: function () { Ops.rename(sel[0]); } },
              { label: 'プロパティ(&R)', dis: !real(), act: function () { Ops.props(sel[0] || cur); } },
              { sep: true },
              { label: '閉じる(&C)', act: function () { rec.close(); } }
            ].filter(Boolean);
          } },
          { label: '編集(&E)', items: function () {
            return [
              { label: '切り取り(&T)', key: 'Ctrl+X', dis: !sel.length || !canWrite(), act: function () { copySel('cut'); } },
              { label: 'コピー(&C)', key: 'Ctrl+C', dis: !sel.length || !real(), act: function () { copySel('copy'); } },
              { label: '貼り付け(&P)', key: 'Ctrl+V', dis: !clip || !canWrite(), act: paste },
              { sep: true },
              { label: 'すべて選択(&A)', key: 'Ctrl+A', act: selectAll }
            ];
          } },
          { label: '表示(&V)', items: [{ label: '最新の情報に更新(&R)', key: 'F5', act: function () { draw(); } }] },
          { label: '移動(&G)', items: function () {
            return [
              { label: '戻る(&B)', dis: !back.length, act: goBack }, { label: '進む(&F)', dis: !fwd.length, act: goFwd },
              { label: '1 つ上のフォルダへ(&U)', dis: !parentOf(cur), act: up }, { sep: true },
              { label: 'マイ コンピュータ(&C)', act: function () { nav('::mycomputer'); } },
              { label: 'マイ ドキュメント(&D)', act: function () { nav('C:\\My Documents'); } },
              { label: 'コントロール パネル(&P)', act: function () { nav('::control'); } }
            ];
          } },
          { label: 'ヘルプ(&H)', items: [
            { label: 'トピックの検索(&H)', act: function () { APPS.help('files'); } }, { sep: true },
            { label: 'Windows のバージョン情報(&A)', act: function () { about('Windows', 'Windows', 'ico-mycomputer'); } }] }
        ]));
        bBack = tbtn('戻る', '&#9664;', goBack); bFwd = tbtn('進む', '&#9654;', goFwd); bUp = tbtn('上へ', '&#9650;', up, '1 つ上のフォルダへ');
        add(cli, h('div', { class: 'tstrip big' }, bBack, bFwd, bUp, sepBtn(),
          tbtn('切り取り', '', function () { copySel('cut'); }), tbtn('コピー', '', function () { copySel('copy'); }),
          tbtn('貼り付け', '', paste), sepBtn(), tbtn('削除', '&#10005;', delSel),
          tbtn('プロパティ', '', function () { if (real()) Ops.props(sel[0] || cur); })));
        addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); navTyped(); } });
        add(cli, h('div', { class: 'addrbar' }, h('label', { html: 'アドレス(<u>D</u>)' }),
          h('div', { class: 'addr-in well' }, addrIc, addr), Btn('移動', { cls: 'gobtn', onClick: navTyped })));
        add(cli, h('div', { class: 'exp-body' }, wv, view));
        add(cli, h('div', { class: 'sbar' }, st1, st2));
        view.addEventListener('click', function (e) { if (e.target === view) { sel = []; paintSel(); } });
        view.addEventListener('contextmenu', function (e) {
          if (e.target !== view) return;
          sel = []; paintSel();
          ctxMenu(e, cur === '::recycle' ? [
            { label: 'ごみ箱を空にする(&B)', dis: !VFS.recycle.list().length, act: Desk.emptyRecycle },
            { label: '最新の情報に更新(&E)', act: draw }] : [
            { label: '最新の情報に更新(&E)', act: draw },
            { sep: true },
            { label: '貼り付け(&P)', dis: !clip || !canWrite(), act: paste },
            { sep: true },
            { label: '新規作成(&W)', dis: !canWrite(), sub: newMenu() },
            { sep: true },
            { label: 'プロパティ(&R)', dis: !real(), act: function () { Ops.props(cur); } }]);
        });
      }
    });
    rec.onDestroy = VFS.on(function () { if (rec.win.isConnected) { if (real() && !VFS.get(cur)) cur = 'C:'; draw(); } });
    draw(); layout();
    snd.nav();
    return rec;
  };

  /* =================================================================
   *  メモ帳
   * ================================================================= */
  APPS.notepad = function (path) {
    if (path) {
      path = VFS.real(path) || path;
      var open = Desk.findWin('notepad', path.toLowerCase());
      if (open) { open.focus(); return open; }
    }
    var file = null, dirty = false, wrap = true, findText = '';
    var ta = h('textarea', { class: 'np', spellcheck: 'false', wrap: 'soft' });
    var rec = openWindow({
      title: '無題 - メモ帳', w: 430, h: 300, resizable: true, minW: 220, minH: 140, icon: 'notepad16', app: 'notepad',
      onClose: function () { return confirmDiscard(); },
      onKey: function (e) {
        var k = e.key.toLowerCase();
        if (e.ctrlKey && k === 's') { e.preventDefault(); save(); }
        else if (e.ctrlKey && k === 'o') { e.preventDefault(); openFile(); }
        else if (e.ctrlKey && k === 'n') { e.preventDefault(); newFile(); }
        else if (e.ctrlKey && k === 'f') { e.preventDefault(); find(); }
        else if (e.key === 'F3') { e.preventDefault(); findNext(); }
        else if (e.key === 'F5') { e.preventDefault(); insertDate(); }
      },
      build: function (cli) {
        cli.classList.add('npwin');
        add(cli, MenuBar([
          { label: 'ファイル(&F)', items: [
            { label: '新規(&N)', key: 'Ctrl+N', act: newFile },
            { label: '開く(&O)...', key: 'Ctrl+O', act: openFile },
            { label: '上書き保存(&S)', key: 'Ctrl+S', act: function () { save(); } },
            { label: '名前を付けて保存(&A)...', act: function () { saveAs(); } },
            { sep: true },
            { label: 'ページ設定(&U)...', dis: true }, { label: '印刷(&P)', dis: true },
            { sep: true },
            { label: 'メモ帳の終了(&X)', act: function () { rec.close(); } }] },
          { label: '編集(&E)', items: function () {
            var has = ta.selectionStart !== ta.selectionEnd;
            return [
              { label: '元に戻す(&U)', key: 'Ctrl+Z', act: function () { ta.focus(); document.execCommand('undo'); } },
              { sep: true },
              { label: '切り取り(&T)', key: 'Ctrl+X', dis: !has, act: function () { ta.focus(); document.execCommand('cut'); } },
              { label: 'コピー(&C)', key: 'Ctrl+C', dis: !has, act: function () { ta.focus(); document.execCommand('copy'); } },
              { label: '貼り付け(&P)', key: 'Ctrl+V', act: pasteText },
              { label: '削除(&L)', key: 'Del', dis: !has, act: function () { ta.focus(); document.execCommand('delete'); } },
              { sep: true },
              { label: 'すべて選択(&A)', act: function () { ta.focus(); ta.select(); } },
              { label: '日付と時刻(&D)', key: 'F5', act: insertDate },
              { sep: true },
              { label: '右端で折り返す(&W)', checked: wrap, act: function () { wrap = !wrap; ta.wrap = wrap ? 'soft' : 'off'; ta.classList.toggle('nowrap', !wrap); } }];
          } },
          { label: '検索(&S)', items: [
            { label: '検索(&F)...', act: find },
            { label: '次を検索(&N)', key: 'F3', act: findNext }] },
          { label: 'ヘルプ(&H)', items: [
            { label: 'トピックの検索(&H)', act: function () { APPS.help('files'); } }, { sep: true },
            { label: 'バージョン情報(&A)', act: function () { about('メモ帳', 'メモ帳', 'file-txt'); } }] }
        ]));
        add(cli, ta);
      }
    });
    rec.key = path ? path.toLowerCase() : null;
    rec.dirty = function () { return dirty; };
    ta.addEventListener('input', function () { if (!dirty) { dirty = true; } });
    function name() { return file ? VFS.base(file) : '無題'; }
    function setTitle() { rec.setTitle(name() + ' - メモ帳'); }
    function load(p) {
      var n = VFS.get(p);
      if (!n) return fail('メモ帳', p + '\nファイルが見つかりません。');
      if (Desk.kindOf(p, n) !== 'txt' && Desk.kindOf(p, n) !== 'ini' && /^(app|snd|cab):|^data:/.test(n.d || '')) {
        return fail('メモ帳', VFS.base(p) + '\nこのファイルは、メモ帳では開けない形式です。');
      }
      file = VFS.real(p); ta.value = String(n.d || '').replace(/\r\n/g, '\n'); dirty = false;
      rec.key = file.toLowerCase(); setTitle(); ta.setSelectionRange(0, 0);
      Save.recent.add(file);
    }
    function write(p) {
      try { VFS.write(p, ta.value.replace(/\n/g, '\r\n')); }
      catch (e) { fail('メモ帳', e.message); return false; }
      file = VFS.real(p) || p; dirty = false; rec.key = file.toLowerCase(); setTitle(); Save.recent.add(file);
      return true;
    }
    function save() {
      if (!file || VFS.readonly(file)) return saveAs();
      return Promise.resolve(write(file));
    }
    function saveAs() {
      return fileDialog({ mode: 'save', title: '名前を付けて保存', exts: ['txt'], defExt: 'txt', typeLabel: 'テキスト文書 (*.txt)',
        dir: file && !VFS.readonly(file) ? VFS.parent(file) : 'C:\\My Documents', name: file ? VFS.base(file) : '' })
        .then(function (p) { return p ? write(p) : false; });
    }
    function confirmDiscard() {
      if (!dirty) return true;
      return askSave('メモ帳', name()).then(function (r) {
        if (r === 'y') return save().then(function (ok) { return !!ok; });
        return r === 'n';
      });
    }
    function newFile() {
      Promise.resolve(confirmDiscard()).then(function (ok) {
        if (!ok) return;
        file = null; ta.value = ''; dirty = false; rec.key = null; setTitle(); ta.focus();
      });
    }
    function openFile() {
      Promise.resolve(confirmDiscard()).then(function (ok) {
        if (!ok) return;
        fileDialog({ mode: 'open', title: '開く', exts: ['txt', 'ini', 'log', 'bat', 'inf', 'sys'], typeLabel: 'テキスト文書 (*.txt)', dir: file ? VFS.parent(file) : 'C:\\My Documents' })
          .then(function (p) { if (p) load(p); });
      });
    }
    function insertDate() {
      var d = new Date();
      var s = d.getHours() + ':' + pad(d.getMinutes()) + ' ' + d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
      ta.focus(); ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, 'end'); dirty = true;
    }
    function pasteText() {
      ta.focus();
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (t) { ta.setRangeText(t, ta.selectionStart, ta.selectionEnd, 'end'); dirty = true; }).catch(function () { document.execCommand('paste'); });
      } else document.execCommand('paste');
    }
    function find() {
      var f = Field({ value: findText, w: '100%' });
      f.dataset.autofocus = '1';
      dialog({
        title: '検索', width: 330, sound: false, btnAlign: 'right',
        body: h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('label', { html: '検索する文字列(<u>N</u>):' }), h('div', { style: { flex: '1' } }, f)),
        buttons: [{ id: 'ok', label: '次を検索(&F)', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
      }).then(function (r) { if (r === 'ok') { findText = f.value; findNext(); } });
    }
    function findNext() {
      if (!findText) return find();
      var i = ta.value.indexOf(findText, ta.selectionEnd);
      if (i < 0) i = ta.value.indexOf(findText);
      if (i < 0) return info('メモ帳', '"' + esc(findText) + '" が見つかりません。');
      ta.focus(); ta.setSelectionRange(i, i + findText.length);
    }
    if (path) load(path);
    setTimeout(function () { ta.focus(); }, 30);
    return rec;
  };

  /* =================================================================
   *  ペイント
   * ================================================================= */
  var PALETTE = [
    '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
    '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040'];
  var TOOLS = [
    ['pick', 'スポイト', '<path d="M11 2l3 3-2 2-3-3zM9 5l2 2-6 6H3v-2z" fill="#444"/>'],
    ['fill', '塗りつぶし', '<path d="M3 8l5-5 5 5-5 5z" fill="#ddd" stroke="#000"/><path d="M13 9c1 2 1 3 0 4" stroke="#00f" fill="none" stroke-width="2"/>'],
    ['pencil', '鉛筆', '<path d="M3 13l1-3 7-7 2 2-7 7z" fill="#e8c840" stroke="#000"/><path d="M3 13l1-3 2 2z" fill="#000"/>'],
    ['brush', 'ブラシ', '<path d="M10 2l4 4-5 3-2-2z" fill="#a0522d" stroke="#000"/><path d="M7 8l2 2c-1 3-4 4-6 4 1-2 1-5 4-6z" fill="#000"/>'],
    ['eraser', '消しゴム', '<path d="M2 10l6-6 6 6-3 3H5z" fill="#f0e0e8" stroke="#000"/><path d="M5 13l-3-3 3-3 3 3z" fill="#fff" stroke="#000"/>'],
    ['line', '直線', '<path d="M2 14L14 2" stroke="#000" stroke-width="1.5"/>'],
    ['rect', '四角形', '<rect x="2.5" y="4.5" width="11" height="8" fill="none" stroke="#000"/>'],
    ['ellipse', '楕円', '<ellipse cx="8" cy="8.5" rx="6" ry="4.5" fill="none" stroke="#000"/>']
  ];
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

  APPS.paint = function (path) {
    var file = null, dirty = false, tool = 'pencil', fg = '#000000', bg = '#ffffff', size = 1, shapeMode = 'o';
    var CW = 380, CH = 250, undo = [];
    var cv = h('canvas', { class: 'pcanvas', width: String(CW), height: String(CH) });
    var ov = h('canvas', { class: 'pover', width: String(CW), height: String(CH) });
    var ctx = cv.getContext('2d', { willReadFrequently: true }), octx = ov.getContext('2d');
    var holder = h('div', { class: 'pwrap' }, h('div', { class: 'pstage' }, cv, ov));
    var pos = h('div'), fgEl = h('i', { class: 'pfg' }), bgEl = h('i', { class: 'pbg' });
    var toolbox = h('div', { class: 'ptools' }), optbox = h('div', { class: 'well popts' });
    function clear() { ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH); }
    clear();
    var rec = openWindow({
      title: '無題 - ペイント', w: 500, h: 384, resizable: true, minW: 320, minH: 260, icon: 'paint16', app: 'paint',
      onClose: function () { return confirmDiscard(); },
      onKey: function (e) {
        var k = e.key.toLowerCase();
        if (e.ctrlKey && k === 'z') { e.preventDefault(); doUndo(); }
        else if (e.ctrlKey && k === 's') { e.preventDefault(); save(); }
        else if (e.ctrlKey && k === 'o') { e.preventDefault(); openFile(); }
        else if (e.ctrlKey && k === 'n' && !e.shiftKey) { e.preventDefault(); newFile(); }
        else if (e.ctrlKey && e.shiftKey && k === 'n') { e.preventDefault(); snap(); clear(); dirty = true; }
        else if (e.ctrlKey && k === 'i') { e.preventDefault(); invert(); }
      },
      build: function (cli) {
        cli.classList.add('paintwin');
        add(cli, MenuBar([
          { label: 'ファイル(&F)', items: [
            { label: '新規(&N)', key: 'Ctrl+N', act: newFile },
            { label: '開く(&O)...', key: 'Ctrl+O', act: openFile },
            { label: '上書き保存(&S)', key: 'Ctrl+S', act: function () { save(); } },
            { label: '名前を付けて保存(&A)...', act: function () { saveAs(); } },
            { sep: true },
            { label: '壁紙に設定 (並べて表示)(&B)', act: function () { setWall('tile'); } },
            { label: '壁紙に設定 (中央に表示)(&K)', act: function () { setWall('center'); } },
            { sep: true },
            { label: 'ペイントの終了(&X)', act: function () { rec.close(); } }] },
          { label: '編集(&E)', items: function () {
            return [
              { label: '元に戻す(&U)', key: 'Ctrl+Z', dis: !undo.length, act: doUndo },
              { sep: true },
              { label: '画像を消去(&C)', key: 'Ctrl+Shift+N', act: function () { snap(); clear(); dirty = true; } }];
          } },
          { label: '変形(&I)', items: [
            { label: '左右反転(&H)', act: function () { flip(true); } },
            { label: '上下反転(&V)', act: function () { flip(false); } },
            { label: '色の反転(&I)', key: 'Ctrl+I', act: invert }] },
          { label: 'ヘルプ(&H)', items: [
            { label: 'トピックの検索(&H)', act: function () { APPS.help('new'); } }, { sep: true },
            { label: 'バージョン情報(&A)', act: function () { about('ペイント', 'ペイント', 'file-bmp'); } }] }
        ]));
        TOOLS.forEach(function (t) {
          var b = h('button', { class: 'ptool', type: 'button', title: t[1], data: { tool: t[0] } },
            W.frag('<svg width="16" height="16" viewBox="0 0 16 16">' + t[2] + '</svg>'));
          b.addEventListener('click', function () { tool = t[0]; paintTools(); });
          add(toolbox, b);
        });
        add(toolbox, optbox);
        var pal = h('div', { class: 'ppal' });
        PALETTE.forEach(function (c) {
          var s = h('button', { class: 'pcol', type: 'button', style: { background: c }, 'aria-label': c });
          s.addEventListener('click', function () { fg = c; paintColors(); });
          s.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); bg = c; paintColors(); });
          add(pal, s);
        });
        add(cli, h('div', { class: 'pmain' }, toolbox, holder));
        add(cli, h('div', { class: 'pbottom' }, h('div', { class: 'pcur well' }, bgEl, fgEl), pal));
        add(cli, h('div', { class: 'sbar' }, h('div', { text: 'ヘルプを表示するには、[ヘルプ] メニューの [トピックの検索] をクリックしてください。' }), pos));
      }
    });
    rec.dirty = function () { return dirty; };
    function paintTools() {
      toolbox.querySelectorAll('.ptool').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === tool); });
      optbox.replaceChildren();
      if (tool === 'brush' || tool === 'eraser' || tool === 'line') {
        (tool === 'eraser' ? [4, 6, 8, 10] : [1, 2, 3, 5]).forEach(function (s) {
          var o = h('button', { class: 'popt' + (size === s ? ' on' : ''), type: 'button' }, h('i', { style: { width: s + 'px', height: s + 'px' } }));
          o.addEventListener('click', function () { size = s; paintTools(); });
          add(optbox, o);
        });
        if (tool === 'eraser' && size < 4) size = 4;
        if (tool !== 'eraser' && size > 5) size = 1;
      } else if (tool === 'rect' || tool === 'ellipse') {
        [['o', '輪郭'], ['of', '輪郭と塗りつぶし'], ['f', '塗りつぶし']].forEach(function (m) {
          var o = h('button', { class: 'popt shape s-' + m[0] + (shapeMode === m[0] ? ' on' : ''), type: 'button', title: m[1] }, h('i'));
          o.addEventListener('click', function () { shapeMode = m[0]; paintTools(); });
          add(optbox, o);
        });
      }
    }
    function paintColors() { fgEl.style.background = fg; bgEl.style.background = bg; }
    paintTools(); paintColors();

    function snap() { undo.push(ctx.getImageData(0, 0, CW, CH)); if (undo.length > 8) undo.shift(); }
    function doUndo() { var d = undo.pop(); if (!d) return; if (d.width !== CW || d.height !== CH) resize(d.width, d.height); ctx.putImageData(d, 0, 0); dirty = true; }
    function resize(w, hh) { CW = w; CH = hh; cv.width = ov.width = w; cv.height = ov.height = hh; }
    function stamp(c, x, y, s, col) { c.fillStyle = col; var o = Math.floor(s / 2); c.fillRect(x - o, y - o, s, s); }
    function lineOn(c, x0, y0, x1, y1, s, col) {
      var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
      for (;;) {
        stamp(c, x0, y0, s, col);
        if (x0 === x1 && y0 === y1) break;
        var e2 = 2 * e;
        if (e2 >= dy) { e += dy; x0 += sx; }
        if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
    function rectOn(c, x0, y0, x1, y1, col1, col2) {
      var l = Math.min(x0, x1), t = Math.min(y0, y1), r = Math.max(x0, x1), b = Math.max(y0, y1);
      if (shapeMode !== 'o') { c.fillStyle = shapeMode === 'f' ? col1 : col2; c.fillRect(l, t, r - l + 1, b - t + 1); }
      if (shapeMode !== 'f') { c.fillStyle = col1; c.fillRect(l, t, r - l + 1, 1); c.fillRect(l, b, r - l + 1, 1); c.fillRect(l, t, 1, b - t + 1); c.fillRect(r, t, 1, b - t + 1); }
    }
    function ellipseOn(c, x0, y0, x1, y1, col1, col2) {
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
      var t = Math.min(y0, y1), b = Math.max(y0, y1);
      for (var y = t; y <= b; y++) {
        var dy = (y + 0.5 - cy - 0.5) / (ry + 0.5), w = dy * dy <= 1 ? (rx + 0.5) * Math.sqrt(1 - dy * dy) : -1;
        if (w < 0) continue;
        var l = Math.round(cx - w), r = Math.round(cx + w);
        if (shapeMode !== 'o') { c.fillStyle = shapeMode === 'f' ? col1 : col2; c.fillRect(l, y, r - l + 1, 1); }
        if (shapeMode !== 'f') { c.fillStyle = col1; c.fillRect(l, y, 1, 1); c.fillRect(r, y, 1, 1); }
      }
      if (shapeMode !== 'f') {
        for (var x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          var dx = (x - cx) / (rx + 0.5), hh = dx * dx <= 1 ? (ry + 0.5) * Math.sqrt(1 - dx * dx) : -1;
          if (hh < 0) continue;
          c.fillStyle = col1; c.fillRect(x, Math.round(cy - hh), 1, 1); c.fillRect(x, Math.round(cy + hh), 1, 1);
        }
      }
    }
    function flood(x, y, col) {
      var img = ctx.getImageData(0, 0, CW, CH), d = img.data, i0 = (y * CW + x) * 4;
      var tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2], c = hex(col);
      if (tr === c[0] && tg === c[1] && tb === c[2]) return;
      var stack = [[x, y]];
      while (stack.length) {
        var p = stack.pop(), px = p[0], py = p[1];
        while (py >= 0 && match(px, py)) py--;
        py++;
        var L = false, R = false;
        while (py < CH && match(px, py)) {
          var i = (py * CW + px) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
          if (px > 0) { if (match(px - 1, py)) { if (!L) { stack.push([px - 1, py]); L = true; } } else L = false; }
          if (px < CW - 1) { if (match(px + 1, py)) { if (!R) { stack.push([px + 1, py]); R = true; } } else R = false; }
          py++;
        }
      }
      ctx.putImageData(img, 0, 0);
      function match(mx, my) { var j = (my * CW + mx) * 4; return d[j] === tr && d[j + 1] === tg && d[j + 2] === tb; }
    }
    function at(e) {
      var r = cv.getBoundingClientRect();
      return { x: Math.floor((e.clientX - r.left) * CW / r.width), y: Math.floor((e.clientY - r.top) * CH / r.height) };
    }
    var drag = null;
    ov.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); });
    ov.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      var p = at(e), col = e.button === 2 ? bg : fg, alt = e.button === 2 ? fg : bg;
      if (tool === 'pick') {
        var px = ctx.getImageData(Math.max(0, Math.min(CW - 1, p.x)), Math.max(0, Math.min(CH - 1, p.y)), 1, 1).data;
        var c = '#' + [px[0], px[1], px[2]].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
        if (e.button === 2) bg = c; else fg = c;
        paintColors(); tool = 'pencil'; paintTools();
        return;
      }
      snap(); dirty = true;
      if (tool === 'fill') { if (p.x >= 0 && p.y >= 0 && p.x < CW && p.y < CH) flood(p.x, p.y, col); return; }
      drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, col: tool === 'eraser' ? bg : col, alt: alt };
      ov.setPointerCapture(e.pointerId);
      if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') stamp(ctx, p.x, p.y, tool === 'pencil' ? 1 : size, drag.col);
    });
    ov.addEventListener('pointermove', function (e) {
      var p = at(e);
      pos.textContent = (p.x >= 0 && p.y >= 0 && p.x < CW && p.y < CH) ? p.x + ',' + p.y : '';
      if (!drag) return;
      if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
        lineOn(ctx, drag.x, drag.y, p.x, p.y, tool === 'pencil' ? 1 : size, drag.col);
        drag.x = p.x; drag.y = p.y;
      } else {
        drag.x = p.x; drag.y = p.y;
        octx.clearRect(0, 0, CW, CH);
        shape(octx);
      }
    });
    function shape(c) {
      if (tool === 'line') lineOn(c, drag.x0, drag.y0, drag.x, drag.y, size, drag.col);
      if (tool === 'rect') rectOn(c, drag.x0, drag.y0, drag.x, drag.y, drag.col, drag.alt);
      if (tool === 'ellipse') ellipseOn(c, drag.x0, drag.y0, drag.x, drag.y, drag.col, drag.alt);
    }
    ov.addEventListener('pointerup', function () {
      if (!drag) return;
      if (tool === 'line' || tool === 'rect' || tool === 'ellipse') { octx.clearRect(0, 0, CW, CH); shape(ctx); }
      drag = null;
    });
    ov.addEventListener('pointerleave', function () { pos.textContent = ''; });

    function flip(hz) {
      snap();
      var t = document.createElement('canvas'); t.width = CW; t.height = CH;
      t.getContext('2d').drawImage(cv, 0, 0);
      ctx.save(); ctx.setTransform(hz ? -1 : 1, 0, 0, hz ? 1 : -1, hz ? CW : 0, hz ? 0 : CH); ctx.drawImage(t, 0, 0); ctx.restore();
      dirty = true;
    }
    function invert() {
      snap();
      var img = ctx.getImageData(0, 0, CW, CH), d = img.data;
      for (var i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
      ctx.putImageData(img, 0, 0); dirty = true;
    }
    function name() { return file ? VFS.base(file) : '無題'; }
    function setTitle() { rec.setTitle(name() + ' - ペイント'); }
    function load(p) {
      var n = VFS.get(p);
      if (!n) return fail('ペイント', p + '\nファイルが見つかりません。');
      file = VFS.real(p); dirty = false; undo = []; setTitle();
      Save.recent.add(file);
      if (!/^data:image\//.test(n.d || '')) { resize(380, 250); clear(); return; }
      var img = new Image();
      img.onload = function () { resize(img.width, img.height); ctx.drawImage(img, 0, 0); };
      img.src = n.d;
    }
    function write(p) {
      try { VFS.write(p, cv.toDataURL('image/png')); } catch (e) { fail('ペイント', e.message); return false; }
      file = VFS.real(p) || p; dirty = false; setTitle(); Save.recent.add(file);
      return true;
    }
    function save() { if (!file || VFS.readonly(file)) return saveAs(); return Promise.resolve(write(file)); }
    function saveAs() {
      return fileDialog({ mode: 'save', title: '名前を付けて保存', exts: ['bmp'], defExt: 'bmp', typeLabel: '256 色ビットマップ (*.bmp)',
        dir: file && !VFS.readonly(file) ? VFS.parent(file) : 'C:\\My Documents\\My Pictures', name: file ? VFS.base(file) : '' })
        .then(function (p) { return p ? write(p) : false; });
    }
    function confirmDiscard() {
      if (!dirty) return true;
      return dialog({
        title: 'ペイント', icon: 'warn', width: 340, sound: false, body: esc(name()) + ' への変更を保存しますか?',
        buttons: [{ id: 'y', label: 'はい(&Y)', def: true }, { id: 'n', label: 'いいえ(&N)' }, { id: 'c', label: 'キャンセル', esc: true }]
      }).then(function (r) {
        if (r === 'y') return save().then(function (ok) { return !!ok; });
        return r === 'n';
      });
    }
    function newFile() {
      Promise.resolve(confirmDiscard()).then(function (ok) { if (ok) { file = null; dirty = false; undo = []; resize(380, 250); clear(); setTitle(); } });
    }
    function openFile() {
      Promise.resolve(confirmDiscard()).then(function (ok) {
        if (!ok) return;
        fileDialog({ mode: 'open', title: '開く', exts: ['bmp'], typeLabel: 'ビットマップ ファイル (*.bmp)', dir: file ? VFS.parent(file) : 'C:\\My Documents\\My Pictures' })
          .then(function (p) { if (p) load(p); });
      });
    }
    function setWall(mode) {
      var go = function () {
        var desk = Save.state.desk;
        desk.wallImg = cv.toDataURL('image/png'); desk.wallMode = mode; desk.wall = -1;
        Desk.applyWall(); Save.schedule();
      };
      if (!file || dirty) {
        dialog({ title: 'ペイント', icon: 'info', width: 340, body: '壁紙に設定する前に、画像を保存してください。', buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }] })
          .then(function (r) { if (r === 'ok') save().then(function (ok) { if (ok) go(); }); });
      } else go();
    }
    if (path) load(path);
    return rec;
  };

  /* =================================================================
   *  電卓
   * ================================================================= */
  APPS.calc = function () {
    var ex = Desk.findWin('calc'); if (ex) { ex.focus(); return ex; }
    var acc = null, op = null, cur = '0', fresh = true, mem = 0, lastOp = null, lastVal = null, err = false;
    var disp = h('div', { class: 'calc-disp well', text: '0.' });
    var memEl = h('div', { class: 'calc-mem well' });
    function fmt(n) {
      if (!isFinite(n)) throw new Error('inf');
      var s = String(+n.toPrecision(14));
      if (s.indexOf('e') < 0 && s.indexOf('.') < 0) s += '.';
      return s;
    }
    function show() { disp.textContent = err ? err : (cur.indexOf('.') < 0 && cur.indexOf('e') < 0 ? cur + '.' : cur); memEl.textContent = mem ? 'M' : ''; }
    function calc(a, o, b) {
      if (o === '/' && b === 0) throw new Error('div');
      return o === '+' ? a + b : o === '-' ? a - b : o === '*' ? a * b : a / b;
    }
    function guard(fn) {
      return function () {
        if (err && fn !== clearAll) return;
        try { fn.apply(null, arguments); } catch (e) {
          err = e.message === 'div' ? '0 で除算することはできません。' : '入力された関数は無効です。';
        }
        show();
      };
    }
    function digit(d) {
      if (fresh) { cur = d === '.' ? '0.' : d; fresh = false; return; }
      if (d === '.' && cur.indexOf('.') >= 0) return;
      if (cur.replace(/[-.]/g, '').length >= 32) return;
      cur = cur === '0' && d !== '.' ? d : cur + d;
    }
    function setOp(o) {
      if (op && !fresh) { acc = calc(acc, op, +cur); cur = fmt(acc).replace(/\.$/, ''); }
      else acc = +cur;
      op = o; fresh = true; lastOp = null;
    }
    function equals() {
      if (op) { lastOp = op; lastVal = fresh && acc !== null && cur === '' ? acc : +cur; acc = calc(acc, op, lastVal); op = null; }
      else if (lastOp) acc = calc(+cur, lastOp, lastVal);
      else return;
      cur = fmt(acc).replace(/\.$/, ''); fresh = true;
    }
    function unary(kind) {
      var v = +cur;
      if (kind === 'sqrt') { if (v < 0) throw new Error('bad'); v = Math.sqrt(v); }
      if (kind === 'inv') { if (v === 0) throw new Error('div'); v = 1 / v; }
      if (kind === 'pct') v = (acc || 0) * v / 100;
      if (kind === 'neg') { cur = cur[0] === '-' ? cur.slice(1) : (cur === '0' ? cur : '-' + cur); return; }
      cur = fmt(v).replace(/\.$/, ''); fresh = true;
    }
    function clearAll() { acc = null; op = null; cur = '0'; fresh = true; err = false; lastOp = null; }
    function ce() { cur = '0'; fresh = true; err = false; }
    function bs() { if (fresh) return; cur = cur.length > 1 ? cur.slice(0, -1) : '0'; if (cur === '-') cur = '0'; }
    var A = {
      d: guard(digit), op: guard(setOp), eq: guard(equals), un: guard(unary), c: guard(clearAll), ce: guard(ce), bs: guard(bs),
      mc: guard(function () { mem = 0; }), mr: guard(function () { cur = fmt(mem).replace(/\.$/, ''); fresh = true; }),
      ms: guard(function () { mem = +cur; fresh = true; }), mp: guard(function () { mem += +cur; fresh = true; })
    };
    function B(label, act, cls) { return Btn(label, { cls: 'cb ' + (cls || ''), onClick: act }); }
    var rec = openWindow({
      title: '電卓', w: 262, max: false, icon: 'calc16', app: 'calc',
      onKey: function (e) {
        var k = e.key;
        if (/^[0-9]$/.test(k)) A.d(k);
        else if (k === '.' || k === ',') A.d('.');
        else if ('+-*/'.indexOf(k) >= 0) A.op(k);
        else if (k === 'Enter' || k === '=') { e.preventDefault(); A.eq(); }
        else if (k === 'Backspace') { e.preventDefault(); A.bs(); }
        else if (k === 'Escape') A.c();
        else if (k === 'Delete') A.ce();
        else if (k === '%') A.un('pct');
        else if (k === 'r' || k === 'R') A.un('inv');
        else if (k === '@') A.un('sqrt');
        else if (k === 'F9') { e.preventDefault(); A.un('neg'); }
        else if (e.ctrlKey && k.toLowerCase() === 'c') { try { navigator.clipboard.writeText(disp.textContent.replace(/\.$/, '')); } catch (x) {} }
        else return;
      },
      build: function (cli) {
        cli.classList.add('calcwin');
        add(cli, MenuBar([
          { label: '編集(&E)', items: [
            { label: 'コピー(&C)', key: 'Ctrl+C', act: function () { try { navigator.clipboard.writeText(disp.textContent.replace(/\.$/, '')); } catch (x) {} } },
            { label: '貼り付け(&P)', key: 'Ctrl+V', act: function () {
              if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { if (isFinite(+t)) { cur = String(+t); fresh = false; show(); } }).catch(function () {});
            } }] },
          { label: '表示(&V)', items: [
            { label: '標準(&T)', checked: true, radio: true }, { label: '関数電卓(&S)', dis: true }, { sep: true },
            { label: '桁区切り(&I)', dis: true }] },
          { label: 'ヘルプ(&H)', items: [{ label: 'バージョン情報(&A)', act: function () { about('電卓', '電卓', 'ico-calc'); } }] }
        ]));
        add(cli, disp);
        add(cli, h('div', { class: 'calc-row top' }, memEl,
          B('Back', A.bs, 'red wide'), B('CE', A.ce, 'red wide'), B('C', A.c, 'red wide')));
        var rows = [
          [['MC', A.mc, 'red'], ['7'], ['8'], ['9'], ['/', null, 'red'], ['sqrt', function () { A.un('sqrt'); }, 'blue']],
          [['MR', A.mr, 'red'], ['4'], ['5'], ['6'], ['*', null, 'red'], ['%', function () { A.un('pct'); }, 'blue']],
          [['MS', A.ms, 'red'], ['1'], ['2'], ['3'], ['-', null, 'red'], ['1/x', function () { A.un('inv'); }, 'blue']],
          [['M+', A.mp, 'red'], ['0'], ['+/-', function () { A.un('neg'); }, 'blue'], ['.', null, 'blue'], ['+', null, 'red'], ['=', A.eq, 'red']]
        ];
        rows.forEach(function (r) {
          var row = h('div', { class: 'calc-row' });
          r.forEach(function (c, i) {
            var lbl = c[0], act = c[1];
            if (!act) act = /^[0-9.]$/.test(lbl) ? function () { A.d(lbl); } : function () { A.op(lbl); };
            var b = B(lbl, act, (c[2] || 'blue') + (i === 0 ? ' mem' : ''));
            add(row, b);
          });
          add(cli, row);
        });
      }
    });
    show();
    return rec;
  };

  /* =================================================================
   *  マインスイーパ
   * ================================================================= */
  var LEVELS = { beg: [9, 9, 10, '初級'], int: [16, 16, 40, '中級'], exp: [30, 16, 99, '上級'] };
  var FACE = {
    smile: '<circle cx="8.5" cy="8.5" r="7.5" fill="#ff0" stroke="#000"/><rect x="5" y="5" width="2" height="2"/><rect x="10" y="5" width="2" height="2"/><path d="M5 10.5c1.5 2 5.5 2 7 0" fill="none" stroke="#000" stroke-width="1.2"/>',
    oh: '<circle cx="8.5" cy="8.5" r="7.5" fill="#ff0" stroke="#000"/><rect x="5" y="5" width="2" height="2"/><rect x="10" y="5" width="2" height="2"/><circle cx="8.5" cy="11.5" r="1.8" fill="none" stroke="#000" stroke-width="1.2"/>',
    dead: '<circle cx="8.5" cy="8.5" r="7.5" fill="#ff0" stroke="#000"/><path d="M4.5 4.5l3 3M7.5 4.5l-3 3M9.5 4.5l3 3M12.5 4.5l-3 3" stroke="#000"/><path d="M5 12.5c1.5-2 5.5-2 7 0" fill="none" stroke="#000" stroke-width="1.2"/>',
    cool: '<circle cx="8.5" cy="8.5" r="7.5" fill="#ff0" stroke="#000"/><path d="M3 6h11v1l-1.5 1.5h-3L8.5 7l-1 1.5h-3L3 7z"/><path d="M5 10.5c1.5 2 5.5 2 7 0" fill="none" stroke="#000" stroke-width="1.2"/>'
  };
  var MINE = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 2v12M2 8h12M4 4l8 8M12 4l-8 8" stroke="#000"/><circle cx="8" cy="8" r="4.2"/><rect x="6" y="6" width="2" height="2" fill="#fff"/></svg>';
  var FLAG = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M9 3L4 5.5 9 8z" fill="#f00"/><path d="M9 3v8" stroke="#000"/><rect x="5" y="11" width="6" height="1"/><rect x="4" y="12" width="8" height="2"/></svg>';

  APPS.mines = function () {
    var ex = Desk.findWin('mines'); if (ex) { ex.focus(); return ex; }
    var st = Save.state.mines || (Save.state.mines = {});
    var lvl = st.level || 'beg', marks = st.marks !== false;
    var cols, rows, count, cells, state, flags, opened, timer = 0, t0 = 0, secs = 0, iv = null;
    var cntEl = h('div', { class: 'ms-led' }), timeEl = h('div', { class: 'ms-led' });
    var face = h('button', { class: 'ms-face', type: 'button', 'aria-label': '新しいゲーム' });
    var grid = h('div', { class: 'ms-grid' });
    function setFace(k) { face.innerHTML = '<svg viewBox="0 0 17 17" width="17" height="17">' + FACE[k] + '</svg>'; }
    function led(el, n) { n = Math.max(-99, Math.min(999, n)); el.textContent = n < 0 ? '-' + ('0' + -n).slice(-2) : ('00' + n).slice(-3); }
    function stopTimer() { if (iv) { clearInterval(iv); iv = null; } }
    function reset() {
      stopTimer();
      var L = LEVELS[lvl]; cols = L[0]; rows = L[1]; count = L[2];
      cells = []; state = 'ready'; flags = 0; opened = 0; secs = 0;
      grid.style.gridTemplateColumns = 'repeat(' + cols + ',16px)';
      grid.replaceChildren();
      for (var i = 0; i < cols * rows; i++) {
        var el = h('div', { class: 'ms-c', data: { i: String(i) } });
        cells.push({ el: el, mine: false, n: 0, open: false, mark: 0 });
        add(grid, el);
      }
      led(cntEl, count); led(timeEl, 0); setFace('smile');
      if (rec) { var w = cols * 16 + 30; rec.win.style.width = w + 'px'; }
    }
    function nb(i) {
      var x = i % cols, y = Math.floor(i / cols), out = [];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) out.push(ny * cols + nx);
      }
      return out;
    }
    function lay(safe) {
      var ban = [safe].concat(nb(safe)), placed = 0;
      while (placed < count) {
        var r = Math.floor(Math.random() * cols * rows);
        if (cells[r].mine || ban.indexOf(r) >= 0 && cols * rows - ban.length >= count) continue;
        cells[r].mine = true; placed++;
      }
      cells.forEach(function (c, i) { c.n = nb(i).filter(function (j) { return cells[j].mine; }).length; });
    }
    function startTimer() {
      t0 = Date.now(); secs = 1; led(timeEl, 1);
      iv = setInterval(function () { if (!rec.win.isConnected) return stopTimer(); secs = Math.min(999, 1 + Math.floor((Date.now() - t0) / 1000)); led(timeEl, secs); }, 250);
    }
    function reveal(i) {
      var c = cells[i];
      if (c.open || c.mark === 1) return;
      if (state === 'ready') { lay(i); state = 'play'; startTimer(); }
      if (c.mine) return lose(i);
      var stack = [i];
      while (stack.length) {
        var k = stack.pop(), cc = cells[k];
        if (cc.open || cc.mark === 1) continue;
        cc.open = true; opened++;
        cc.el.className = 'ms-c o' + (cc.n ? ' n' + cc.n : '');
        cc.el.textContent = cc.n ? String(cc.n) : '';
        if (!cc.n) nb(k).forEach(function (j) { if (!cells[j].open) stack.push(j); });
      }
      if (opened === cols * rows - count) win();
    }
    function chord(i) {
      var c = cells[i];
      if (!c.open || !c.n) return;
      var f = nb(i).filter(function (j) { return cells[j].mark === 1; }).length;
      if (f === c.n) nb(i).forEach(function (j) { if (state === 'play') reveal(j); });
    }
    function mark(i) {
      var c = cells[i];
      if (c.open || state === 'won' || state === 'lost') return;
      c.mark = c.mark === 0 ? 1 : (c.mark === 1 && marks ? 2 : 0);
      flags += c.mark === 1 ? 1 : (c.mark === 2 || (c.mark === 0 && !marks) ? -1 : 0);
      if (c.mark === 0 && marks) flags += 0;
      c.el.className = 'ms-c' + (c.mark === 1 ? ' f' : c.mark === 2 ? ' q' : '');
      c.el.innerHTML = c.mark === 1 ? FLAG : c.mark === 2 ? '?' : '';
      flags = cells.filter(function (x) { return x.mark === 1; }).length;
      led(cntEl, count - flags);
    }
    function lose(i) {
      state = 'lost'; stopTimer(); setFace('dead');
      cells.forEach(function (c, k) {
        if (c.mine && c.mark !== 1) { c.el.className = 'ms-c o m' + (k === i ? ' x' : ''); c.el.innerHTML = MINE; }
        else if (!c.mine && c.mark === 1) { c.el.className = 'ms-c o w'; c.el.innerHTML = MINE; }
      });
    }
    function win() {
      state = 'won'; stopTimer(); setFace('cool');
      cells.forEach(function (c) { if (c.mine) { c.mark = 1; c.el.className = 'ms-c f'; c.el.innerHTML = FLAG; } });
      led(cntEl, 0);
      var best = st[lvl];
      if (!best || secs < best.t) {
        var f = Field({ value: S.user.name || '名無し', w: '100%' });
        f.dataset.autofocus = '1';
        dialog({
          title: 'マインスイーパ', width: 300, sound: false,
          body: h('div', { style: { textAlign: 'center' } }, h('div', { text: LEVELS[lvl][3] + 'の最高記録を更新しました。' }), h('div', { text: '名前を入力してください。', style: { margin: '6px 0' } }), f),
          buttons: [{ id: 'ok', label: 'OK', def: true }]
        }).then(function () { st[lvl] = { t: secs, n: f.value.trim() || '名無し' }; Save.schedule(); bestTimes(); });
      }
    }
    function bestTimes() {
      function row(k) { var b = st[k]; return h('div', { class: 'ms-best' }, h('span', { text: LEVELS[k][3] + ':' }), h('span', { text: b ? b.t + ' 秒' : '999 秒' }), h('span', { text: b ? b.n : '名無し' })); }
      dialog({
        title: 'マインスイーパの最高記録', width: 300, sound: false,
        body: h('div', {}, row('beg'), row('int'), row('exp')),
        buttons: [{ id: 'r', label: '記録の消去(&R)' }, { id: 'ok', label: 'OK', def: true, esc: true }],
        onButton: function (id) { if (id === 'r') { delete st.beg; delete st.int; delete st.exp; Save.schedule(); } }
      });
    }
    function setLevel(k) { lvl = k; st.level = k; Save.schedule(); reset(); }
    var down = null;
    grid.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); });
    grid.addEventListener('pointerdown', function (e) {
      var el = e.target.closest('.ms-c'); if (!el || state === 'won' || state === 'lost') return;
      var i = +el.dataset.i;
      if (e.button === 2) { mark(i); return; }
      if (e.button !== 0) return;
      down = i; setFace('oh');
      if (!cells[i].open && !cells[i].mark) el.classList.add('p');
    });
    grid.addEventListener('pointerup', function (e) {
      if (down === null) return;
      var el = e.target.closest('.ms-c'), i = el ? +el.dataset.i : down;
      cells.forEach(function (c) { c.el.classList.remove('p'); });
      down = null;
      if (state === 'won' || state === 'lost') return;
      setFace('smile');
      if (cells[i].open) chord(i); else reveal(i);
    });
    grid.addEventListener('pointerleave', function () { if (down !== null) { cells.forEach(function (c) { c.el.classList.remove('p'); }); down = null; if (state !== 'lost' && state !== 'won') setFace('smile'); } });
    face.addEventListener('click', reset);
    var rec = openWindow({
      title: 'マインスイーパ', w: 9 * 16 + 30, max: false, icon: 'mine16b', app: 'mines',
      onKey: function (e) { if (e.key === 'F2') { e.preventDefault(); reset(); } },
      build: function (cli) {
        cli.classList.add('mswin');
        add(cli, MenuBar([
          { label: 'ゲーム(&G)', items: function () {
            return [
              { label: '新しいゲーム(&N)', key: 'F2', act: reset }, { sep: true },
              { label: '初級(&B)', checked: lvl === 'beg', act: function () { setLevel('beg'); } },
              { label: '中級(&I)', checked: lvl === 'int', act: function () { setLevel('int'); } },
              { label: '上級(&E)', checked: lvl === 'exp', act: function () { setLevel('exp'); } }, { sep: true },
              { label: 'マーク (?)(&M)', checked: marks, act: function () { marks = !marks; st.marks = marks; Save.schedule(); } }, { sep: true },
              { label: '最高記録(&T)...', act: bestTimes }, { sep: true },
              { label: '終了(&X)', act: function () { rec.close(); } }];
          } },
          { label: 'ヘルプ(&H)', items: [
            { label: '遊び方(&C)', act: function () { APPS.help('games'); } }, { sep: true },
            { label: 'バージョン情報(&A)', act: function () { about('マインスイーパ', 'マインスイーパ', 'ico-mines'); } }] }
        ]));
        add(cli, h('div', { class: 'ms-frame' }, h('div', { class: 'ms-top' }, cntEl, face, timeEl), h('div', { class: 'ms-board' }, grid)));
      }
    });
    rec.onDestroy = stopTimer;
    reset();
    return rec;
  };

  /* =================================================================
   *  Internet Explorer 5.5
   * ================================================================= */
  var IE_FAV = [
    ['Google', 'about:home'],
    ['Google 検索 - Windows Me', 'https://www.google.com/search?igu=1&hl=ja&q=Windows+Me'],
    ['Google マップ - 東京', 'https://maps.google.com/maps?hl=ja&q=%E6%9D%B1%E4%BA%AC&z=12&output=embed'],
    ['Wikipedia - Microsoft Windows Me', 'https://ja.m.wikipedia.org/wiki/Microsoft_Windows_Me'],
    ['Wikipedia - メインページ', 'https://ja.m.wikipedia.org/wiki/%E3%83%A1%E3%82%A4%E3%83%B3%E3%83%9A%E3%83%BC%E3%82%B8']
  ];
  var ieWins = [];
  document.addEventListener('securitypolicyviolation', function (e) {
    var d = e.effectiveDirective || e.violatedDirective || '';
    if (!/frame-src|child-src|default-src/.test(d)) return;
    ieWins.forEach(function (w) { if (w.pending && e.blockedURI && w.pending.indexOf(e.blockedURI.replace(/\/$/, '')) === 0) w.blocked(); });
  });
  function googleHome(go) {
    var q = Field({ w: '100%', spell: false });
    q.classList.add('g-q');
    function search(lucky) {
      var v = q.value.trim(); if (!v) return;
      go('https://www.google.com/search?igu=1&hl=ja&q=' + encodeURIComponent(v) + (lucky ? '&btnI=1' : ''));
    }
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); search(false); } });
    var logo = h('div', { class: 'g-logo' }, ['G', 'o', 'o', 'g', 'l', 'e'].map(function (c, i) { return h('span', { class: 'g' + i, text: c }); }));
    var page = h('div', { class: 'g-page' },
      h('div', { class: 'g-top' }, h('a', { href: '#', text: 'Google マップ', onclick: function (e) { e.preventDefault(); go('https://maps.google.com/maps?hl=ja&q=' + encodeURIComponent(q.value.trim() || '東京') + '&z=12&output=embed'); } }),
        h('span', { text: ' - ' }), h('a', { href: '#', text: 'Wikipedia', onclick: function (e) { e.preventDefault(); go(q.value.trim() ? 'https://ja.m.wikipedia.org/wiki/' + encodeURIComponent(q.value.trim()) : IE_FAV[3][1]); } })),
      logo,
      h('div', { class: 'g-count', text: '1,346,966,000 のウェブページを検索' }),
      h('div', { class: 'g-box' }, q),
      h('div', { class: 'g-btns' },
        h('button', { type: 'button', class: 'g-btn', text: 'Google 検索', onclick: function () { search(false); } }),
        h('button', { type: 'button', class: 'g-btn', text: "I'm Feeling Lucky", onclick: function () { search(true); } })),
      h('div', { class: 'g-links' },
        h('a', { href: '#', text: '地図を検索', onclick: function (e) { e.preventDefault(); go('https://maps.google.com/maps?hl=ja&q=' + encodeURIComponent(q.value.trim() || '東京タワー') + '&z=15&output=embed'); } }),
        h('span', { text: ' - ' }),
        h('a', { href: '#', text: 'Windows Me について調べる', onclick: function (e) { e.preventDefault(); go(IE_FAV[3][1]); } })),
      h('div', { class: 'g-note', text: 'この画面は 2000 年ごろのトップ ページの再現です。検索結果と地図は現在の Google から表示されます。' }));
    setTimeout(function () { try { q.focus(); } catch (e) {} }, 60);
    return page;
  }
  function ieError(url, reason) {
    var a = h('a', { href: url, target: '_blank', rel: 'noopener', text: url });
    return h('div', { class: 'ie-err' },
      h('div', { class: 'ie-err-h' }, pic('msg-info', 32, 32), h('div', { text: 'ページを表示できません' })),
      h('div', { class: 'ie-err-rule' }),
      h('p', { text: reason || '表示しようとしたページは、この環境では表示できません。セキュリティの設定で、外部のページの埋め込みが禁止されている可能性があります。' }),
      h('p', { text: '次の方法をお試しください:' }),
      h('ul', {}, h('li', {}, '次のリンクから、お使いのブラウザでページを開く: ', a),
        h('li', { text: '[戻る] ボタンをクリックして、別のリンクを試す' })),
      h('p', { class: 'dim', text: 'HTTP 403 - 禁止されています  Internet Explorer' }));
  }

  APPS.ie = function (url) {
    var ie = ieState();
    url = url || ie.home || 'about:home';
    if (/^www\./i.test(url)) url = 'https://' + url;
    var hist = [], fwdS = [], cur = null, frame = null, loadT = 0;
    var addr = Field({ w: '100%', spell: false });
    var view = h('div', { class: 'ie-view' });
    var status = h('div', { text: '完了' }), zone = h('div', { class: 'ie-zone' }, pic('world16', 16, 16), h('span', { text: 'インターネット' }));
    var throb = h('div', { class: 'ie-throb' }, pic('ie16b', 16, 16));
    var bBack, bFwd;
    var me = { pending: null, blocked: function () { if (cur) show(ieError(cur)); me.pending = null; } };
    ieWins.push(me);
    function external(u) { return /^https?:/i.test(u); }
    function show(el) { view.replaceChildren(el); }
    function busy(on, msg) { throb.classList.toggle('on', on); status.textContent = msg || (on ? 'ページを開いています...' : '完了'); }
    function nav(u, push) {
      if (push !== false && cur) { hist.push(cur); fwdS = []; }
      cur = u; addr.value = u === 'about:home' ? 'http://www.google.com/' : u;
      bBack.disabled = !hist.length; bFwd.disabled = !fwdS.length;
      clearTimeout(loadT);
      if (u === 'about:home') { show(googleHome(function (x) { nav(x); })); rec.setTitle('Google - Microsoft Internet Explorer'); busy(false); return; }
      if (u === 'about:blank') { show(h('div', { class: 'ie-blank' })); rec.setTitle('about:blank - Microsoft Internet Explorer'); busy(false); return; }
      if (!external(u)) { show(ieError(u, 'アドレスが正しくありません。http:// で始まるアドレスを入力してください。')); busy(false); return; }
      frame = h('iframe', {
        class: 'ie-frame', src: u, referrerpolicy: 'no-referrer',
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation',
        allow: 'fullscreen; geolocation'
      });
      me.pending = u;
      frame.addEventListener('load', function () { me.pending = null; busy(false, 'ページが表示されました'); });
      show(frame);
      var host = u.replace(/^https?:\/\//, '').split('/')[0];
      rec.setTitle(host + ' - Microsoft Internet Explorer');
      busy(true, host + ' に接続しています...');
      loadT = setTimeout(function () { if (throb.classList.contains('on')) busy(false, '完了'); }, 12000);
    }
    function goTyped() {
      var v = addr.value.trim();
      if (!v) return;
      if (/^https?:\/\/(www\.)?google\.(com|co\.jp)\/?$/i.test(v)) return nav('about:home');
      if (/^(about:|https?:\/\/)/i.test(v)) return nav(v);
      if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return nav('https://' + v);
      nav('https://www.google.com/search?igu=1&hl=ja&q=' + encodeURIComponent(v));
    }
    function openReal() {
      if (!cur || !external(cur)) return info('Internet Explorer', 'このページは、お使いのブラウザでは開けません。');
      var a = h('a', { href: cur.replace(/[?&]igu=1/, '').replace(/&output=embed/, ''), target: '_blank', rel: 'noopener' });
      document.body.appendChild(a); a.click(); a.remove();
    }
    var rec = openWindow({
      title: 'Microsoft Internet Explorer', w: 560, h: 400, resizable: true, minW: 360, minH: 240, icon: 'ie16', app: 'ie',
      onKey: function (e) {
        if (e.target === addr) return;
        if (e.key === 'F5') { e.preventDefault(); nav(cur, false); }
        if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); }
        if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); fwd(); }
      },
      build: function (cli) {
        cli.classList.add('iewin');
        var mb = MenuBar([
          { label: 'ファイル(&F)', items: [
            { label: '新規作成(&N)', sub: [{ label: 'ウィンドウ(&W)', key: 'Ctrl+N', act: function () { APPS.ie(cur); } }] },
            { label: '開く(&O)...', act: function () { addr.focus(); addr.select(); } },
            { sep: true },
            { label: 'お使いのブラウザで開く(&B)', act: openReal },
            { sep: true },
            { label: '閉じる(&C)', act: function () { rec.close(); } }] },
          { label: '編集(&E)', items: [{ label: '切り取り(&T)', dis: true }, { label: 'コピー(&C)', dis: true }, { label: '貼り付け(&P)', dis: true }] },
          { label: '表示(&V)', items: [
            { label: '中止(&P)', key: 'Esc', act: function () { if (frame) { frame.src = 'about:blank'; } busy(false, '中止しました'); } },
            { label: '最新の情報に更新(&R)', key: 'F5', act: function () { nav(cur, false); } }] },
          { label: 'お気に入り(&A)', items: function () {
            return [{ label: 'お気に入りに追加(&A)...', dis: true }, { sep: true }].concat(IE_FAV.map(function (f) {
              return { label: f[0], icon: f[1] === 'about:home' || f[1].indexOf('google') >= 0 ? 'htm16' : 'htm16', act: function () { nav(f[1]); } };
            }));
          } },
          { label: 'ツール(&T)', items: [{ label: 'インターネット オプション(&O)...', act: function () { APPS.inetopts(); } }] },
          { label: 'ヘルプ(&H)', items: [
            { label: 'Internet Explorer のヘルプ(&C)', act: function () { APPS.help('internet'); } }, { sep: true },
            { label: 'バージョン情報(&A)', act: function () { about('Internet Explorer', 'Internet Explorer 5.5', 'ico-ie32'); } }] }
        ]);
        add(cli, h('div', { class: 'ie-menurow' }, mb, throb));
        bBack = tbtn('戻る', '&#9664;', back); bFwd = tbtn('進む', '&#9654;', fwd);
        add(cli, h('div', { class: 'tstrip big ie-tb' }, bBack, bFwd,
          tbtn('中止', '&#10005;', function () { if (frame) frame.src = 'about:blank'; busy(false, '中止しました'); }),
          tbtn('更新', '&#8635;', function () { nav(cur, false); }),
          tbtn('ホーム', '&#8962;', function () { nav(ie.home || 'about:home'); }), sepBtn(),
          tbtn('検索', '', function () { nav('about:home'); }),
          tbtn('お気に入り', '', function () { nav(IE_FAV[3][1]); }),
          tbtn('ブラウザで開く', '', openReal)));
        addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); goTyped(); } });
        add(cli, h('div', { class: 'addrbar' }, h('label', { html: 'アドレス(<u>D</u>)' }),
          h('div', { class: 'addr-in well' }, pic('htm16', 16, 16), addr),
          Btn('移動', { cls: 'gobtn', onClick: goTyped }), h('span', { class: 'ie-links', text: 'リンク' })));
        add(cli, view);
        add(cli, h('div', { class: 'sbar' }, status, zone));
      }
    });
    rec.onDestroy = function () { var i = ieWins.indexOf(me); if (i >= 0) ieWins.splice(i, 1); clearTimeout(loadT); };
    function back() { if (!hist.length) return; fwdS.push(cur); var u = hist.pop(); nav(u, false); bFwd.disabled = false; }
    function fwd() { if (!fwdS.length) return; hist.push(cur); var u = fwdS.pop(); nav(u, false); }
    nav(url, false);
    return rec;
  };

  /* =================================================================
   *  Windows Media Player 7
   * ================================================================= */
  APPS.wmp = function (path) {
    var ex = Desk.findWin('wmp');
    var list = (VFS.list('C:\\WINDOWS\\Media') || []).filter(function (n) { return /^snd:/.test(n.d); }).map(function (n) { return { name: n.n, snd: n.d.slice(4), path: 'C:\\WINDOWS\\Media\\' + n.n }; });
    var startIdx = 0;
    if (path) { var n0 = VFS.get(path); list.forEach(function (t, i) { if (n0 && n0.d === 'snd:' + t.snd) startIdx = i; }); }
    if (ex) { ex.focus(); if (ex.playAt) ex.playAt(startIdx); return ex; }
    var idx = startIdx, audio = new Audio(), an = null, data = null, raf = 0, wvol = 0.8;
    audio.preload = 'auto';
    var cv = h('canvas', { class: 'wmp-vis', width: '300', height: '150' }), vctx = cv.getContext('2d');
    var titleEl = h('div', { class: 'wmp-title' }), timeEl = h('div', { class: 'wmp-time', text: '00:00' });
    var seek = h('input', { type: 'range', min: '0', max: '1000', value: '0', class: 'wmp-seek', 'aria-label': '再生位置' });
    var vol = h('input', { type: 'range', min: '0', max: '100', value: '80', class: 'wmp-vol', 'aria-label': '音量' });
    var plEl = h('div', { class: 'wmp-pl' });
    var bPlay = h('button', { class: 'wmp-b play', type: 'button', title: '再生' });
    var stateEl = h('div', { class: 'wmp-state', text: '停止' });
    function useAnalyser() { return location.protocol !== 'file:' || /^data:/.test(audio.src); }
    function ensureGraph() {
      if (an || !useAnalyser()) return;
      try {
        var c = W.actx(); if (!c) return;
        var src = c.createMediaElementSource(audio);
        an = c.createAnalyser(); an.fftSize = 64;
        src.connect(an); an.connect(c.destination);
        data = new Uint8Array(an.frequencyBinCount);
      } catch (e) { an = null; }
    }
    function load(i) {
      idx = (i + list.length) % list.length;
      var t = list[idx];
      audio.src = W.soundURL(t.snd);
      titleEl.textContent = t.name.replace(/\.wav$/i, '');
      plEl.querySelectorAll('.wmp-it').forEach(function (e, j) { e.classList.toggle('on', j === idx); });
    }
    function play() {
      ensureGraph();
      audio.volume = wvol * (Save.state.desk.mute ? 0 : Save.state.desk.vol);
      var p = audio.play(); if (p && p.catch) p.catch(function () {});
    }
    function stop() { audio.pause(); audio.currentTime = 0; }
    audio.addEventListener('play', function () { bPlay.classList.add('pause'); stateEl.textContent = '再生中'; loop(); });
    audio.addEventListener('pause', function () { bPlay.classList.remove('pause'); stateEl.textContent = audio.currentTime ? '一時停止' : '停止'; });
    audio.addEventListener('ended', function () { stateEl.textContent = '停止'; if (idx < list.length - 1) { load(idx + 1); play(); } });
    audio.addEventListener('timeupdate', function () {
      var t = audio.currentTime || 0;
      timeEl.textContent = pad(Math.floor(t / 60)) + ':' + pad(Math.floor(t % 60));
      if (audio.duration) seek.value = String(Math.round(t / audio.duration * 1000));
    });
    seek.addEventListener('input', function () { if (audio.duration) audio.currentTime = +seek.value / 1000 * audio.duration; });
    vol.addEventListener('input', function () { wvol = +vol.value / 100; audio.volume = wvol * (Save.state.desk.mute ? 0 : Save.state.desk.vol); });
    function loop() {
      cancelAnimationFrame(raf);
      var w = cv.width, hh = cv.height, bars = 24, ph = Date.now() / 1000;
      vctx.fillStyle = '#000'; vctx.fillRect(0, 0, w, hh);
      var vals = [];
      if (an && !audio.paused) { an.getByteFrequencyData(data); for (var i = 0; i < bars; i++) vals.push(data[i % data.length] / 255); }
      else for (var j = 0; j < bars; j++) vals.push(audio.paused ? 0.03 : Math.abs(Math.sin(ph * 3 + j * 0.7) * Math.cos(ph * 1.7 + j * 0.31)) * 0.9 + 0.05);
      var bw = w / bars;
      vals.forEach(function (v, k) {
        var bh = Math.max(2, v * (hh - 20));
        var g = vctx.createLinearGradient(0, hh, 0, hh - bh);
        g.addColorStop(0, '#0a3d8f'); g.addColorStop(0.6, '#2fa8ff'); g.addColorStop(1, '#bff4ff');
        vctx.fillStyle = g; vctx.fillRect(k * bw + 2, hh - bh, bw - 4, bh);
      });
      if (!audio.paused && rec.win.isConnected) raf = requestAnimationFrame(loop);
    }
    function navBtn(label, act, on) {
      var b = h('button', { class: 'wmp-nav' + (on ? ' on' : ''), type: 'button', text: label });
      b.addEventListener('click', function () { rec.cli.querySelectorAll('.wmp-nav').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); act(); });
      return b;
    }
    var stage = h('div', { class: 'wmp-stage' });
    function nowPlaying() { stage.replaceChildren(h('div', { class: 'wmp-np' }, h('div', { class: 'wmp-visbox' }, cv, titleEl), plEl)); loop(); }
    function panel(t, body) { stage.replaceChildren(h('div', { class: 'wmp-panel' }, h('div', { class: 'wmp-ph', text: t }), h('div', { text: body }))); }
    var rec = openWindow({
      title: 'Windows Media Player', w: 500, h: 340, resizable: true, minW: 420, minH: 300, icon: 'wmp16', app: 'wmp', cls: 'wmpwin',
      onKey: function (e) { if (e.key === ' ' && e.target.tagName !== 'INPUT') { e.preventDefault(); if (audio.paused) play(); else audio.pause(); } },
      build: function (cli) {
        cli.classList.add('wmpcli');
        add(cli, MenuBar([
          { label: 'ファイル(&F)', items: [{ label: '開く(&O)...', act: function () { fileDialog({ mode: 'open', title: '開く', exts: ['wav'], typeLabel: 'オーディオ ファイル (*.wav)', dir: 'C:\\WINDOWS\\Media' }).then(function (p) { if (p) APPS.wmp(p); }); } }, { sep: true }, { label: '閉じる(&C)', act: function () { rec.close(); } }] },
          { label: '再生(&P)', items: [{ label: '再生/一時停止(&P)', key: 'Space', act: function () { if (audio.paused) play(); else audio.pause(); } }, { label: '停止(&S)', act: stop }, { sep: true }, { label: '前の曲(&R)', act: function () { load(idx - 1); play(); } }, { label: '次の曲(&N)', act: function () { load(idx + 1); play(); } }] },
          { label: 'ヘルプ(&H)', items: [{ label: 'バージョン情報(&A)', act: function () { about('Windows Media Player', 'Windows Media Player 7', 'ico-mplayer'); } }] }
        ]));
        var side = h('div', { class: 'wmp-side' },
          navBtn('再生中', nowPlaying, true),
          navBtn('メディア ガイド', function () { panel('メディア ガイド', 'インターネットに接続すると、最新の音楽やビデオの情報が表示されます。この再現版では、インターネットには接続しません。'); }),
          navBtn('CD 再生', function () { panel('CD 再生', 'ドライブ D: にオーディオ CD が入っていません。'); }),
          navBtn('メディア ライブラリ', function () { panel('メディア ライブラリ', 'C:\\WINDOWS\\Media にある ' + list.length + ' 個のサウンドが登録されています。[再生中] から再生できます。'); }),
          navBtn('ラジオ チューナ', function () { panel('ラジオ チューナ', 'インターネット ラジオを聴くには、インターネットへの接続が必要です。'); }),
          navBtn('ポータブル デバイス', function () { panel('ポータブル デバイスへ', '接続されているデバイスはありません。'); }),
          navBtn('スキンの選択', function () { panel('スキンの選択', '現在のスキン: 既定'); }));
        add(cli, h('div', { class: 'wmp-body' }, side, stage));
        add(cli, h('div', { class: 'wmp-ctrl' },
          h('div', { class: 'wmp-seekrow' }, seek, timeEl),
          h('div', { class: 'wmp-btnrow' }, bPlay,
            h('button', { class: 'wmp-b stop', type: 'button', title: '停止', onclick: stop }),
            h('button', { class: 'wmp-b prev', type: 'button', title: '前', onclick: function () { load(idx - 1); play(); } }),
            h('button', { class: 'wmp-b next', type: 'button', title: '次', onclick: function () { load(idx + 1); play(); } }),
            stateEl, h('span', { class: 'wmp-vl', text: '音量' }), vol)));
      }
    });
    bPlay.addEventListener('click', function () { if (audio.paused) play(); else audio.pause(); });
    list.forEach(function (t, i) {
      var it = h('div', { class: 'wmp-it', text: t.name.replace(/\.wav$/i, '') });
      it.addEventListener('dblclick', function () { load(i); play(); });
      it.addEventListener('click', function () { load(i); });
      add(plEl, it);
    });
    rec.playAt = function (i) { load(i); play(); };
    rec.onDestroy = function () { audio.pause(); audio.src = ''; cancelAnimationFrame(raf); };
    nowPlaying();
    load(startIdx);
    if (path) play();
    return rec;
  };

  /* =================================================================
   *  Outlook Express
   * ================================================================= */
  APPS.oe = function () {
    var ex = Desk.findWin('oe'); if (ex) { ex.focus(); return ex; }
    var oe = Save.state.oe || (Save.state.oe = { read: false });
    var MAIL = {
      from: 'Microsoft Outlook Express チーム', subj: 'Outlook Express へようこそ',
      body: (S.user.name || 'ユーザー') + ' 様\n\nOutlook Express をお使いいただき、ありがとうございます。\n\n' +
        'Outlook Express を使うと、電子メールの送受信やニュース グループの購読を、ひとつのウィンドウで行えます。\n\n' +
        '・アドレス帳に連絡先を登録すると、メールの宛先をすばやく入力できます。\n' +
        '・複数のメール アカウントをまとめて管理できます。\n' +
        '・HTML 形式のメールで、文字の色や画像を使った便りを送れます。\n\n' +
        '電子メールを使うには、インターネット接続ウィザードでメール アカウントを設定してください。\n\n' +
        '※ この再現版では、実際のメールの送受信は行いません。\n\nMicrosoft Outlook Express チーム'
    };
    var preview = h('div', { class: 'oe-prev' });
    var row = h('div', { class: 'oe-row' + (oe.read ? '' : ' unread') },
      h('span', { text: MAIL.from }), h('span', { text: MAIL.subj }), h('span', { text: fmtDate(Save.state.installedAt || Date.now()) }));
    var inbox = h('div', { class: 'oe-f on', text: '受信トレイ' + (oe.read ? '' : ' (1)') });
    function openMail() {
      row.classList.add('sel'); row.classList.remove('unread'); oe.read = true; Save.schedule();
      inbox.textContent = '受信トレイ';
      preview.replaceChildren(
        h('div', { class: 'oe-ph' }, h('div', {}, h('b', { text: '差出人: ' }), MAIL.from), h('div', {}, h('b', { text: '件名: ' }), MAIL.subj)),
        h('div', { class: 'oe-pb', text: MAIL.body }));
    }
    row.addEventListener('click', openMail);
    function noNet() { fail('Outlook Express', 'サーバーに接続できませんでした。\nインターネットへの接続が設定されていません。'); }
    var rec = openWindow({
      title: '受信トレイ - Outlook Express', w: 540, h: 350, resizable: true, minW: 420, minH: 260, icon: 'oe16', app: 'oe',
      build: function (cli) {
        cli.classList.add('oewin');
        add(cli, MenuBar([
          { label: 'ファイル(&F)', items: [{ label: '閉じる(&C)', act: function () { rec.close(); } }] },
          { label: '編集(&E)', items: [{ label: 'すべて選択(&A)', dis: true }] },
          { label: '表示(&V)', items: [{ label: '最新の情報に更新(&R)', act: function () {} }] },
          { label: 'ツール(&T)', items: [{ label: '送受信(&S)', act: noNet }, { label: 'アドレス帳(&B)...', act: Desk.na('アドレス帳') }] },
          { label: 'メッセージ(&M)', items: [{ label: 'メッセージの作成(&N)', act: noNet }] },
          { label: 'ヘルプ(&H)', items: [{ label: 'バージョン情報(&A)', act: function () { about('Outlook Express', 'Outlook Express 5.5', 'ico-oe32'); } }] }
        ]));
        add(cli, h('div', { class: 'tstrip big' },
          tbtn('メールの作成', '', noNet), sepBtn(), tbtn('返信', '', noNet), tbtn('転送', '', noNet), sepBtn(),
          tbtn('削除', '&#10005;', function () { info('Outlook Express', 'このメッセージは削除できません。'); }), tbtn('送受信', '', noNet), sepBtn(), tbtn('アドレス', '', Desk.na('アドレス帳'))));
        add(cli, h('div', { class: 'oe-body' },
          h('div', { class: 'oe-tree well' },
            h('div', { class: 'oe-f root', text: 'Outlook Express' }),
            h('div', { class: 'oe-f lv1', text: 'ローカル フォルダ' }),
            inbox, h('div', { class: 'oe-f', text: '送信トレイ' }), h('div', { class: 'oe-f', text: '送信済みアイテム' }),
            h('div', { class: 'oe-f', text: '削除済みアイテム' }), h('div', { class: 'oe-f', text: '下書き' })),
          h('div', { class: 'oe-right' },
            h('div', { class: 'oe-list well' }, h('div', { class: 'oe-head' }, h('span', { text: '差出人' }), h('span', { text: '件名' }), h('span', { text: '受信日時' })), row),
            preview)));
        add(cli, h('div', { class: 'sbar' }, h('div', { text: '1 通のメッセージ、' + (oe.read ? 0 : 1) + ' 通は未開封' }), h('div', { text: 'オフライン作業中' })));
      }
    });
    preview.replaceChildren(h('div', { class: 'oe-hint', text: 'メッセージを選択すると、ここに内容が表示されます。' }));
    return rec;
  };

  /* =================================================================
   *  システムの復元
   * ================================================================= */
  APPS.restore = function () {
    var ex = Desk.findWin('restore'); if (ex) { ex.focus(); return ex; }
    var body = h('div', { class: 'sr-main' }), foot = h('div', { class: 'sr-foot' });
    var rec = openWindow({
      title: 'システムの復元', w: 520, h: 360, max: false, icon: 'restore16', app: 'restore',
      build: function (cli) {
        cli.classList.add('srwin');
        add(cli, h('div', { class: 'sr-wrap' }, body, foot));
      }
    });
    function page(title, left, right, buttons) {
      body.replaceChildren(
        h('div', { class: 'sr-head' }, pic('ico-restore', 32, 32), h('div', { class: 'sr-title', text: title })),
        h('div', { class: 'sr-cols' }, h('div', { class: 'sr-left' }, left), h('div', { class: 'sr-right' }, right)));
      foot.replaceChildren.apply(foot, buttons);
    }
    function P(t) { return h('p', { text: t }); }
    function start() {
      var mode = 'restore';
      page('システムの復元へようこそ',
        [P('システムの復元を使うと、コンピュータに問題が発生したときに、データ ファイル (ドキュメントや電子メールなど) を失わずに、以前の状態に戻すことができます。'),
          P('コンピュータは、復元ポイントと呼ばれる時点を自動的に記録します。自分で名前を付けて、復元ポイントを作成することもできます。'),
          P('マイ ドキュメント フォルダ内のファイルは、復元しても変更されません。')],
        [P('開始するには、実行するタスクを選択してください:'),
          Radio({ name: 'srm', label: 'コンピュータを以前の状態に復元する(&R)', checked: true, onChange: function () { mode = 'restore'; } }),
          Radio({ name: 'srm', label: '復元ポイントを作成する(&C)', onChange: function () { mode = 'create'; } }),
          h('p', { class: 'dim', style: { marginTop: '14px' }, text: '続行するには、オプションを選択して [次へ] をクリックしてください。' })],
        [Btn('次へ(&N) >', { def: true, onClick: function () { if (mode === 'create') create(); else choose(); } }), Btn('キャンセル', { esc: true, onClick: function () { rec.close(); } })]);
    }
    function create() {
      var f = Field({ w: '100%' }); f.dataset.autofocus = '1';
      page('復元ポイントの作成',
        [P('コンピュータは、復元ポイントを自動的に作成します。この画面では、自分で復元ポイントを作成できます。'),
          P('システムに変更を加える前に復元ポイントを作成しておくと、変更を元に戻したいときに役立ちます。')],
        [h('label', { html: '復元ポイントの説明(<u>D</u>):', class: 'lbl' }), f,
          h('p', { class: 'dim', style: { marginTop: '10px' }, text: '日付と時刻は、復元ポイントに自動的に追加されます。' })],
        [Btn('< 戻る(&B)', { onClick: start }),
          Btn('次へ(&N) >', { def: true, onClick: function () {
            var d = f.value.trim();
            if (!d) return fail('システムの復元', '復元ポイントの説明を入力してください。');
            Save.restore.create(d);
            page('復元ポイントの作成の確認',
              [P('新しい復元ポイントが作成されました。')],
              [h('div', { class: 'sr-box well' }, h('div', { text: fmtDate(Date.now()) }), h('div', { text: d })),
                P('コンピュータを以前の状態に戻すには、[システムの復元] を実行して、この復元ポイントを選択してください。')],
              [Btn('ホーム(&H)', { onClick: start }), Btn('閉じる', { def: true, onClick: function () { rec.close(); } })]);
          } }),
          Btn('キャンセル', { esc: true, onClick: function () { rec.close(); } })]);
      setTimeout(function () { f.focus(); }, 30);
    }
    function choose() {
      var pts = Save.restore.list(), pick = pts[0] ? pts[0].id : null;
      var list = h('div', { class: 'well lst sr-list', tabindex: '0' });
      pts.forEach(function (p) {
        var it = h('div', { class: 'it sr-it' }, h('span', { text: fmtDate(p.at) }), h('span', { text: p.name }));
        it.setAttribute('aria-selected', p.id === pick ? 'true' : 'false');
        it.addEventListener('click', function () { pick = p.id; list.querySelectorAll('.it').forEach(function (n) { n.setAttribute('aria-selected', 'false'); }); it.setAttribute('aria-selected', 'true'); });
        add(list, it);
      });
      if (!pts.length) add(list, h('div', { class: 'dim', style: { padding: '6px' }, text: '利用できる復元ポイントがありません。' }));
      page('復元ポイントの選択',
        [P('一覧には、利用できる復元ポイントが新しい順に表示されています。'),
          P('システム チェックポイントは、Windows のセットアップ時に作成されたものです。')],
        [h('label', { text: '復元ポイントを選択してください:', class: 'lbl' }), list],
        [Btn('< 戻る(&B)', { onClick: start }),
          Btn('次へ(&N) >', { def: true, disabled: !pts.length, onClick: function () {
            var p = pts.filter(function (x) { return x.id === pick; })[0]; if (!p) return;
            page('復元ポイントの選択の確認',
              [P('[次へ] をクリックすると、開いているプログラムが閉じられ、コンピュータが再起動します。'),
                P('ほかのプログラムで作業中のファイルは、先に保存しておいてください。')],
              [h('div', { class: 'sr-box well' }, h('div', { text: fmtDate(p.at) }), h('div', { text: p.name })),
                P('この時点以降に行ったシステムの変更 (壁紙やデスクトップのファイルなど) は元に戻ります。マイ ドキュメント内のファイルはそのまま残ります。')],
              [Btn('< 戻る(&B)', { onClick: choose }),
                Btn('次へ(&N) >', { def: true, onClick: function () {
                  rec.close(true);
                  Desk.shutdown('restart', function () { Save.restore.apply(p.id); window.__desktop(); });
                } }),
                Btn('キャンセル', { esc: true, onClick: function () { rec.close(); } })]);
          } }),
          Btn('キャンセル', { esc: true, onClick: function () { rec.close(); } })]);
    }
    start();
    return rec;
  };

  /* =================================================================
   *  検索（ファイルやフォルダ）
   * ================================================================= */
  APPS.find = function () {
    var ex = Desk.findWin('find'); if (ex) { ex.focus(); return ex; }
    var q = Field({ w: '100%', spell: false }); q.dataset.autofocus = '1';
    var where = h('select', { class: 'sel9' }, ['C:\\', 'C:\\My Documents', 'C:\\WINDOWS', 'D:\\'].map(function (v) { return h('option', { value: v, text: v }); }));
    var res = h('div', { class: 'well find-res' }), st = h('div', { text: '' });
    function run() {
      var t = q.value.trim();
      res.replaceChildren(h('div', { class: 'find-head' }, h('span', { text: '名前' }), h('span', { text: 'フォルダ' }), h('span', { text: 'サイズ' })));
      var found = VFS.search(where.value, t);
      found.forEach(function (p) {
        var n = VFS.get(p);
        var r = h('div', { class: 'find-row' }, h('span', {}, pic(iconOf(p, n, true), 16, 16), h('span', { text: n.n })), h('span', { text: VFS.disp(VFS.parent(p)) }), h('span', { text: n.t === 'd' ? '' : fmtSize(VFS.size(n)) }));
        r.addEventListener('click', function () { res.querySelectorAll('.find-row').forEach(function (x) { x.classList.remove('on'); }); r.classList.add('on'); });
        r.addEventListener('dblclick', function () { openPath(p); });
        r.addEventListener('contextmenu', function (e) {
          ctxMenu(e, [{ label: '開く(&O)', bold: true, act: function () { openPath(p); } },
            { label: 'このファイルを含むフォルダを開く(&I)', act: function () { APPS.explorer(VFS.parent(p)); } },
            { sep: true }, { label: 'プロパティ(&R)', act: function () { Ops.props(p); } }]);
        });
        add(res, r);
      });
      st.textContent = found.length + ' 個のファイルが見つかりました';
    }
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(); } });
    var rec = openWindow({
      title: '検索結果', w: 470, h: 330, resizable: true, minW: 360, minH: 240, icon: 'search16', app: 'find',
      build: function (cli) {
        cli.classList.add('findwin');
        add(cli, h('div', { class: 'find-top' },
          h('div', { class: 'find-form' },
            h('div', { class: 'find-ph' }, pic('ico-search', 32, 32), h('div', { text: 'ファイルやフォルダの検索' })),
            h('label', { html: 'ファイル名またはフォルダ名の一部(<u>N</u>):' }), q,
            h('label', { html: '探す場所(<u>L</u>):' }), where,
            h('div', { class: 'find-btns' }, Btn('検索開始(&I)', { def: true, onClick: run }), Btn('新しい検索(&W)', { onClick: function () { q.value = ''; res.replaceChildren(); st.textContent = ''; q.focus(); } })))));
        add(cli, res);
        add(cli, h('div', { class: 'sbar' }, st, h('div', { text: '' })));
      }
    });
    return rec;
  };

  /* =================================================================
   *  ヘルプとサポート
   * ================================================================= */
  var HELP = {
    home: ['ヘルプとサポートへようこそ', '知りたいことを左の一覧から選んでください。\n\nこのコンピュータは、Windows Millennium Edition の画面と操作を再現したものです。セットアップから、デスクトップでのファイル操作、インターネットの閲覧、ゲームまで、実際に操作できます。'],
    'new': ['Windows Me の新機能', '■ システムの復元\nコンピュータを以前の状態に戻せます。[スタート] → [プログラム] → [アクセサリ] → [システム ツール] → [システムの復元]。\n\n■ Windows Media Player 7\n音楽の再生とビジュアライゼーション。[スタート] → [プログラム] → [Windows Media Player]。\n\n■ Internet Explorer 5.5\nGoogle 検索、Google マップ、Wikipedia を表示できます。\n\n■ ペイント\n描いた絵は [ファイル] → [壁紙に設定] でデスクトップの壁紙になります。'],
    desktop: ['デスクトップの使い方', '・アイコンはダブルクリックで開きます。\n・デスクトップを右クリックすると、新しいフォルダやテキスト文書を作成できます。作成したものは C:\\WINDOWS\\Desktop に保存されます。\n・ウィンドウはタイトル バーをドラッグして移動し、右下の角でサイズを変えられます。タイトル バーをダブルクリックすると最大化します。\n・タスク バーのスピーカーをクリックすると音量を変えられます。\n・時計をダブルクリックすると日付と時刻が表示されます。'],
    files: ['ファイルとフォルダ', '・[マイ コンピュータ] や [マイ ドキュメント] から、ドライブ C のファイルを操作できます。\n・ファイルを右クリックすると、名前の変更、削除、コピー、切り取りができます。\n・削除したファイルはごみ箱に移ります。ごみ箱を開いて右クリックすると、元に戻せます。\n・メモ帳やペイントで保存したファイルは、ブラウザに自動的に保存され、次回も残っています。\n・ドライブ D (CD-ROM) は読み取り専用です。'],
    internet: ['インターネット', 'Internet Explorer のアドレス バーに言葉を入力して Enter キーを押すと、Google で検索します。http:// で始まるアドレスを入力すると、そのページを開きます。\n\nページによっては、埋め込み表示が禁止されているため表示できません。その場合は [ファイル] → [お使いのブラウザで開く] を使ってください。\n\nお気に入りから、Google マップや Wikipedia も開けます。'],
    games: ['ゲーム', '■ マインスイーパ\n地雷のないマスをすべて開くと勝ちです。数字は、周りの 8 マスにある地雷の数です。\n・左クリック: マスを開く\n・右クリック: 旗を立てる (もう一度で ?、さらにもう一度で解除)\n・開いた数字をクリック: 旗の数が合っていれば周りを開く\n[ゲーム] メニューで難易度を変えられます。最高記録は保存されます。'],
    restore: ['システムの復元', '復元ポイントを作成しておくと、後でその時点の状態に戻せます。壁紙やデスクトップ、C ドライブのファイルが元に戻ります。マイ ドキュメント内のファイルは変更されません。\n\nセットアップ直後には、自動的に "システム チェックポイント" が作成されています。'],
    save: ['このコンピュータの保存について', 'セットアップを完了すると、インストール済みの状態、設定、C ドライブのファイル、ごみ箱、復元ポイントが、このブラウザに自動的に保存されます。\n\n次にページを開くと Windows Me のパッケージが表示され、クリックすると起動してデスクトップから再開します。\n\n最初からセットアップをやり直すには、画面の上端にマウスを移動して表示されるメニューから [セーブを消去] を選びます。\n\nプライベート ウィンドウなど、ブラウザが保存を許可しない環境では、その回限りになります。'],
    shutdown: ['Windows の終了', '・電源を切れる状態にする: 作業内容を保存して、電源を切れる状態にします。\n・再起動する: Windows を再起動します。\n・MS-DOS モードで再起動する: MS-DOS のコマンド プロンプトで起動します。WIN と入力すると Windows に戻ります。\n・スタンバイ: 画面を消して待機します。クリックすると再開します。']
  };
  var HELP_ORDER = ['home', 'new', 'desktop', 'files', 'internet', 'games', 'restore', 'save', 'shutdown'];
  APPS.help = function (topic) {
    var ex = Desk.findWin('help');
    if (ex) { ex.focus(); if (topic && ex.show) ex.show(topic); return ex; }
    var nav = h('div', { class: 'hlp-nav' }), page = h('div', { class: 'hlp-page' });
    function show(t) {
      if (!HELP[t]) t = 'home';
      nav.querySelectorAll('.hlp-t').forEach(function (n) { n.classList.toggle('on', n.dataset.t === t); });
      page.replaceChildren(h('h2', { text: HELP[t][0] }), h('div', { class: 'hlp-text', text: HELP[t][1] }));
      page.scrollTop = 0;
    }
    HELP_ORDER.forEach(function (t) {
      var a = h('div', { class: 'hlp-t', data: { t: t } }, pic(t === 'home' ? 'help16' : 'chm16', 16, 16), h('span', { text: HELP[t][0] }));
      a.addEventListener('click', function () { show(t); });
      add(nav, a);
    });
    var rec = openWindow({
      title: 'ヘルプとサポート', w: 540, h: 360, resizable: true, minW: 400, minH: 260, icon: 'help16', app: 'help',
      build: function (cli) {
        cli.classList.add('hlpwin');
        add(cli, h('div', { class: 'hlp-bar' },
          h('div', { class: 'hlp-brand' }, pic('help16', 16, 16), h('span', { text: 'ヘルプとサポート' })),
          h('div', { class: 'hlp-tabs' }, h('span', { text: 'ホーム', onclick: function () { show('home'); } }), h('span', { text: '索引', onclick: function () { show('home'); } }), h('span', { text: '支援', onclick: function () { show('save'); } }), h('span', { text: 'ツアーとチュートリアル', onclick: function () { show('new'); } }))));
        add(cli, h('div', { class: 'hlp-body' }, nav, page));
      }
    });
    rec.show = show;
    show(topic || 'home');
    return rec;
  };

  /* =================================================================
   *  MS-DOS プロンプト（仮想ファイル システムに対応）
   * ================================================================= */
  function short83(name, isDir) {
    var m = /^(.*?)(?:\.([^.]*))?$/.exec(name), base = (m[1] || '').replace(/[\s.]/g, '').toUpperCase(), ext = (m[2] || '').toUpperCase();
    if (base.length > 8) base = base.slice(0, 6) + '~1';
    return (base + '        ').slice(0, 8) + ' ' + (isDir ? '   ' : (ext + '   ').slice(0, 3));
  }
  function dosDate(t) { var d = new Date(t); return pad(d.getFullYear() % 100) + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '  ' + (' ' + d.getHours()).slice(-2) + ':' + pad(d.getMinutes()); }
  var APP_CMDS = { notepad: 'notepad', edit: 'notepad', mspaint: 'paint', pbrush: 'paint', calc: 'calc', winmine: 'mines', explorer: 'explorer', iexplore: 'ie', control: 'control', wmplayer: 'wmp', msimn: 'oe', rstrui: 'restore', winver: 'sysprops', help: 'help', winhelp: 'help', scandskw: 'scandisk' };

  function makeTerminal(opts) {
    var cwd = 'C:\\WINDOWS';
    var out = h('div', { class: 'termout' });
    var promptEl = h('span');
    var inp = h('input', { class: 'termin', spellcheck: 'false', autocomplete: 'off' });
    var el = h('div', { class: 'term' }, out, h('div', { class: 'termline' }, promptEl, inp));
    var histL = [], hi = 0;
    function prompt() { return VFS.disp(cwd) + '>'; }
    function say(t) { add(out, h('div', { text: t === '' ? '\u00a0' : t })); el.scrollTop = el.scrollHeight; }
    function upd() { promptEl.textContent = prompt(); }
    function resolve(a) {
      if (!a) return cwd;
      a = a.replace(/^"|"$/g, '');
      if (/^[a-z]:/i.test(a)) return VFS.norm(a);
      if (a[0] === '\\') return cwd.slice(0, 2) + a;
      var parts = (cwd + '\\' + a).split('\\'), outP = [];
      parts.forEach(function (p) { if (!p || p === '.') return; if (p === '..') { if (outP.length > 1) outP.pop(); } else outP.push(p); });
      return outP.join('\\');
    }
    function wild(pat) { return new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'); }
    function dir(arg) {
      var target = resolve(arg), pat = null;
      var n = VFS.get(target);
      if (!n && /[*?]/.test(arg || '')) { pat = wild(VFS.base(target)); target = VFS.parent(target) || cwd; n = VFS.get(target); }
      if (!n) { say('ファイルが見つかりません'); return; }
      if (n.t !== 'd') { pat = wild(n.n); target = VFS.parent(target); n = VFS.get(target); }
      say(''); say(' ドライブ ' + target[0] + ' のボリューム ラベルは ' + (target[0] === 'D' ? 'WIN_ME' : 'WIN_ME_SYS') + ' です');
      say(' ボリューム シリアル番号は 2A1F-0C3D です'); say(' ディレクトリは ' + VFS.disp(target)); say('');
      var files = 0, dirs = 0, bytes = 0;
      if (!VFS.isRoot(target) && !pat) { say('.              <DIR>        ' + dosDate(n.m || Date.now()) + ' .'); say('..             <DIR>        ' + dosDate(n.m || Date.now()) + ' ..'); dirs += 2; }
      VFS.list(target).forEach(function (c) {
        if (pat && !pat.test(c.n)) return;
        var sz = c.t === 'd' ? '<DIR>       ' : (' ' + VFS.size(c).toLocaleString()).slice(-12).padStart(12);
        say(short83(c.n, c.t === 'd') + ' ' + (c.t === 'd' ? '    <DIR>   ' : sz) + ' ' + dosDate(c.m || Date.now()) + ' ' + c.n);
        if (c.t === 'd') dirs++; else { files++; bytes += VFS.size(c); }
      });
      say(('         ' + files).slice(-9) + ' 個のファイル  ' + (bytes.toLocaleString() + ' バイト').padStart(18));
      say(('         ' + dirs).slice(-9) + ' 個のディレクトリ' + '  1,341,652,992 バイトの空き');
      say('');
    }
    function exec(raw) {
      var line = raw.trim();
      if (!line) return;
      var m = /^(\S+)\s*(.*)$/.exec(line), cmd = m[1].toLowerCase(), arg = m[2].trim();
      if (/^[a-z]:$/i.test(cmd)) {
        if (/^a:$/i.test(cmd)) { say(''); say('ドライブ A: の読み取り中にエラーが発生しました'); say('中止(A), 再試行(R), 失敗(F)?A'); say(''); return; }
        if (!VFS.get(cmd)) { say('ドライブの指定が無効です'); return; }
        cwd = cmd.toUpperCase(); return;
      }
      if (/^cd\.\.$/.test(cmd)) { cmd = 'cd'; arg = '..'; }
      if (/^cd\\$/.test(cmd)) { cmd = 'cd'; arg = '\\'; }
      try {
        switch (cmd) {
          case 'cls': out.replaceChildren(); return;
          case 'ver': say(''); say('Windows Millennium [Version 4.90.3000]'); say(''); return;
          case 'date': say('現在の日付: ' + new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })); return;
          case 'time': say('現在の時刻: ' + new Date().toLocaleTimeString('ja-JP')); return;
          case 'echo': say(arg || 'ECHO は <ON> です'); return;
          case 'mem': say(''); say('メモリの種類        合計      使用中      空き'); say('----------------  --------  --------  --------');
            say('コンベンショナル      640K       38K      602K'); say('上位                  155K      155K        0K'); say('拡張 (XMS)        130,612K   44,032K   86,580K'); say(''); return;
          case 'dir': dir(arg); return;
          case 'cd': case 'chdir': {
            if (!arg) { say(VFS.disp(cwd)); return; }
            var t = resolve(arg), n = VFS.get(t);
            if (!n || n.t !== 'd') { say('ディレクトリ名が違います'); return; }
            cwd = VFS.real(t); return;
          }
          case 'md': case 'mkdir': if (!arg) { say('パラメータの数が足りません'); return; } VFS.mkdir(resolve(arg)); return;
          case 'rd': case 'rmdir': {
            var rp = resolve(arg), rn = VFS.get(rp);
            if (!rn || rn.t !== 'd') { say('パスが無効か、ディレクトリが空ではありません'); return; }
            if (rn.c.length) { say('パスが無効か、ディレクトリが空ではありません'); return; }
            VFS.remove(rp, true); return;
          }
          case 'del': case 'erase': {
            var dp = resolve(arg);
            if (/[*?]/.test(VFS.base(dp))) {
              var re = wild(VFS.base(dp)), pd = VFS.parent(dp);
              (VFS.list(pd) || []).filter(function (c) { return c.t === 'f' && re.test(c.n); }).forEach(function (c) { VFS.remove(VFS.join(pd, c.n), true); });
              return;
            }
            var dn = VFS.get(dp);
            if (!dn || dn.t !== 'f') { say('ファイルが見つかりません'); return; }
            VFS.remove(dp, true); return;
          }
          case 'type': {
            var tp = resolve(arg), tn = VFS.get(tp);
            if (!tn || tn.t !== 'f') { say('ファイルが見つかりません - ' + arg); return; }
            if (/^(app|snd|cab):|^data:/.test(tn.d || '')) { say('(バイナリ ファイルのため表示できません)'); return; }
            String(tn.d || '').split(/\r?\n/).forEach(say); return;
          }
          case 'ren': case 'rename': {
            var ra = arg.split(/\s+/);
            if (ra.length < 2) { say('パラメータの数が足りません'); return; }
            VFS.rename(resolve(ra[0]), ra[1]); return;
          }
          case 'copy': {
            var ca = arg.split(/\s+/);
            if (ca.length < 2) { say('パラメータの数が足りません'); return; }
            var src = resolve(ca[0]), dst = resolve(ca[1]), dn2 = VFS.get(dst);
            if (!VFS.get(src)) { say('ファイルが見つかりません - ' + ca[0]); return; }
            if (dn2 && dn2.t === 'd') VFS.copy(src, dst); else VFS.copy(src, VFS.parent(dst), VFS.base(dst));
            say('        1 個のファイルをコピーしました'); return;
          }
          case 'help': say(''); ['CD/CHDIR  ディレクトリを変更します', 'CLS       画面を消去します', 'COPY      ファイルをコピーします', 'DATE/TIME 日付と時刻を表示します',
            'DEL       ファイルを削除します', 'DIR       ファイルの一覧を表示します', 'ECHO      メッセージを表示します', 'MD/RD     ディレクトリを作成/削除します',
            'MEM       メモリの使用状況を表示します', 'REN       ファイル名を変更します', 'TYPE      テキスト ファイルの内容を表示します', 'VER       バージョンを表示します',
            'START     Windows のプログラムやファイルを開きます (例: START NOTEPAD)', opts.winCmd ? 'WIN       Windows に戻ります' : 'EXIT      MS-DOS プロンプトを終了します'].forEach(say); say(''); return;
          case 'exit': if (opts.onExit) opts.onExit(); return;
          case 'win': if (opts.winCmd) { opts.onWin(); return; } break;
          case 'start': if (!arg) { say('パラメータの数が足りません'); return; } return launch(arg.split(/\s+/)[0], arg.split(/\s+/).slice(1).join(' '));
        }
        var key = cmd.replace(/\.(exe|com)$/, '');
        if (APP_CMDS[key]) return launch(key, arg);
        var fp = resolve(cmd), fn = VFS.get(fp) || VFS.get(fp + '.exe') || VFS.get(fp + '.com');
        if (fn && fn.t === 'f') return launch(fp, '');
        say('コマンドまたはファイル名が違います');
      } catch (e) { say(e.message.split('\n')[0]); }
    }
    function launch(cmd, arg) {
      if (opts.winCmd) { say('このプログラムは Windows 上で実行する必要があります。'); return; }
      var key = cmd.toLowerCase().replace(/\.(exe|com)$/, '');
      var target = arg ? resolve(arg) : null;
      if (APP_CMDS[key]) {
        var app = APP_CMDS[key];
        if (app === 'control') return APPS.explorer('::control');
        if ((app === 'notepad' || app === 'paint') && target && VFS.get(target)) return APPS[app](target);
        if (app === 'explorer') return APPS.explorer(target && VFS.get(target) ? target : cwd);
        if (app === 'ie' && arg) return APPS.ie(arg);
        return APPS[app]();
      }
      var p = resolve(cmd);
      if (VFS.get(p)) return openPath(p);
      say('コマンドまたはファイル名が違います');
    }
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) { hi--; inp.value = histL[hi] || ''; } return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); if (hi < histL.length) { hi++; inp.value = histL[hi] || ''; } return; }
      if (e.key !== 'Enter') return;
      e.preventDefault(); e.stopPropagation();
      var raw = inp.value;
      say(prompt() + raw);
      inp.value = '';
      if (raw.trim()) { histL.push(raw); hi = histL.length; }
      exec(raw);
      upd();
    });
    el.addEventListener('click', function () { inp.focus(); });
    (opts.banner || []).forEach(say);
    upd();
    el.focusInput = function () { setTimeout(function () { inp.focus(); }, 40); };
    return el;
  }

  APPS.prompt = function () {
    return openWindow({
      title: 'MS-DOS プロンプト', w: 420, h: 270, resizable: true, minW: 260, minH: 160, icon: 'msdos16', app: 'prompt',
      build: function (cli, rec) {
        var t = makeTerminal({
          banner: ['', 'Microsoft(R) Windows Millennium', '   (C) Copyright Microsoft Corp 1981-1999.', '', 'HELP と入力すると、使えるコマンドが表示されます。', ''],
          onExit: function () { rec.close(); }
        });
        cli.classList.add('promptwin');
        add(cli, t);
        t.focusInput();
      }
    });
  };

  APPS.dosMode = function () {
    document.body.dataset.power = 'on';
    var root = h('div', { class: 'screen', style: { background: '#000' } });
    var t = makeTerminal({
      banner: ['', 'Microsoft(R) Windows Millennium', '   (C) Copyright Microsoft Corp 1981-1999.', '', 'WIN と入力すると Windows に戻ります。', ''],
      winCmd: true,
      onWin: function () { window.__bootLogo(window.__desktop, 2600); },
      onExit: function () { window.__bootLogo(window.__desktop, 2600); }
    });
    t.classList.add('full');
    add(root, t);
    W.setScreen(root);
    t.focusInput();
  };

  /* =================================================================
   *  ファイル名を指定して実行
   * ================================================================= */
  APPS.run = function (v) {
    var s = v.trim();
    if (!s) return false;
    if (/^(https?:\/\/|www\.)/i.test(s)) { APPS.ie(s); return true; }
    if (/^(マイ ?コンピュータ)$/.test(s)) { APPS.explorer('::mycomputer'); return true; }
    var m = /^"([^"]+)"\s*(.*)$/.exec(s) || /^(\S+)\s*(.*)$/.exec(s);
    var key = m[1].toLowerCase().replace(/\.(exe|com)$/, ''), arg = m[2].trim();
    var JA = { 'メモ帳': 'notepad', 'ペイント': 'paint', '電卓': 'calc', 'マインスイーパ': 'mines', 'コントロール パネル': 'control' };
    if (JA[m[1]]) key = JA[m[1]];
    var map = {
      notepad: function () { return APPS.notepad(arg && VFS.get(arg) ? arg : null); },
      mspaint: function () { return APPS.paint(arg && VFS.get(arg) ? arg : null); }, paint: function () { return APPS.paint(); }, pbrush: function () { return APPS.paint(); },
      calc: APPS.calc, winmine: APPS.mines, mines: APPS.mines, command: APPS.prompt, cmd: APPS.prompt,
      explorer: function () { return APPS.explorer(arg && VFS.get(arg) ? arg : 'C:'); },
      iexplore: function () { return APPS.ie(arg || null); }, control: function () { return APPS.explorer('::control'); },
      wmplayer: function () { return APPS.wmp(); }, msimn: APPS.oe, rstrui: APPS.restore, winver: APPS.sysprops,
      help: function () { return APPS.help(); }, winhelp: function () { return APPS.help(); }, scandskw: APPS.scandisk,
      regedit: Desk.na('レジストリ エディタ'), sysedit: Desk.na('システム構成エディタ'), msconfig: Desk.na('システム設定ユーティリティ')
    };
    if (map[key]) { map[key](); return true; }
    if (VFS.get(s)) { openPath(s); return true; }
    var guess = VFS.get('C:\\WINDOWS\\' + s) ? 'C:\\WINDOWS\\' + s : (VFS.get('C:\\WINDOWS\\' + s + '.exe') ? 'C:\\WINDOWS\\' + s + '.exe' : null);
    if (guess) { openPath(guess); return true; }
    return false;
  };
})();
