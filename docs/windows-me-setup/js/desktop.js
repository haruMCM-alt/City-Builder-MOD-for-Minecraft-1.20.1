/* =========================================================================
 * desktop.js : デスクトップ — ウィンドウ管理 / スタート メニュー / 付属アプリ
 * アイコンは実機(1024x768)のスクリーンショットから切り出した画像を使う。
 * ========================================================================= */
(function () {
  'use strict';
  var W = window.__WinMe;
  var h = W.h, add = W.add, esc = W.esc, frag = W.frag, wait = W.wait, pic = W.pic;
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
    var bar = h('div', { class: 'tbar' }, o.icon ? h('span', { class: 'ti' }, pic(o.icon, 16, 16)) : null, ttl, bMin, bMax, bX);
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
      o.icon ? h('span', { class: 'ti' }, pic(o.icon, 16, 16)) : null,
      h('span', { class: 'tl', text: o.title }));
    tb.addEventListener('click', function () {
            if (rec.min) { restore(rec); } else if (D.active === rec) { minimize(rec); } else { focusWin(rec); }
    });
    rec.tb = tb;
    D.tasks.appendChild(tb);

    bX.addEventListener('click', function () { closeWin(rec); });
    bMin.addEventListener('click', function () { minimize(rec); });
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
      var el = h('div', { class: 'iv' }, h('div', {}, pic(it.icon, 32, 32)), h('div', { class: 'lab', text: it.name }));
      el.setAttribute('aria-selected', 'false');
      el.addEventListener('click', function () {
        view.querySelectorAll('.iv').forEach(function (n) { n.setAttribute('aria-selected', 'false'); });
        el.setAttribute('aria-selected', 'true');
      });
      el.addEventListener('dblclick', function () { onOpen(it); });
      add(view, el);
    });
    return view;
  }
  function explorerChrome(cli, title, items, onOpen, status) {
    cli.classList.add('explorer');
    snd.nav();
    add(cli, h('div', { class: 'mbar' },
      h('span', { html: 'ファイル(<u>F</u>)' }), h('span', { html: '編集(<u>E</u>)' }),
      h('span', { html: '表示(<u>V</u>)' }), h('span', { html: 'ヘルプ(<u>H</u>)' })));
    add(cli, h('div', { class: 'tstrip' },
      h('button', { class: 'btn tbtn', type: 'button', disabled: true }, h('i', { class: 'arw l' })),
      h('button', { class: 'btn tbtn', type: 'button', disabled: true }, h('i', { class: 'arw r' })),
      h('button', { class: 'btn tbtn', type: 'button', disabled: true }, h('i', { class: 'arw u' })),
      h('span', { style: { marginLeft: '8px' }, text: title })));
    add(cli, iconView(items, onOpen));
    add(cli, h('div', { class: 'sbar' },
      h('div', { text: status || (items.length + ' 個のオブジェクト') }),
      h('div', { text: '' })));
  }

  /* ---------------------------------------------------------- 付属アプリ */
  var APPS = {};

  APPS.mycomputer = function () {
    openWindow({
      title: 'マイ コンピュータ', w: 386, h: 262, icon: 'mycomputer16',
      build: function (cli) {
        var items = [
          { name: '3.5 インチ FD (A:)', icon: 'drv-floppy', kind: 'fd' },
          { name: 'ローカル ディスク (C:)', icon: 'drv-hdd', kind: 'hd' },
          { name: 'CD-ROM (D:)', icon: 'drv-cd', kind: 'cd' },
          { name: 'コントロール パネル', icon: 'ico-cpl', kind: 'cpl' }
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
      title: 'ごみ箱', w: 340, h: 230, icon: 'recycle16',
      build: function (cli) { explorerChrome(cli, 'ごみ箱', [], function () {}, '0 個のオブジェクト'); }
    });
  };

  APPS.control = function () {
    openWindow({
      title: 'コントロール パネル', w: 386, h: 250, icon: 'cpl16',
      build: function (cli) {
        var items = [
          { name: '画面', icon: 'cpl-display', kind: 'disp' },
          { name: '日付と時刻', icon: 'cpl-datetime', kind: 'tz' },
          { name: 'システム', icon: 'cpl-system', kind: 'sys' },
          { name: 'サウンド', icon: 'cpl-sound', kind: 'snd' }
        ];
        explorerChrome(cli, 'コントロール パネル', items, function (it) {
          if (it.kind === 'tz') return tzDialog();
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
    ['(なし)', '#3a6ea5'],
    ['ティール', '#008080'],
    ['夕暮れ', 'linear-gradient(180deg,#e0855b 0%,#b3554a 52%,#5c2b45 100%)'],
    ['深い青', 'linear-gradient(180deg,#26324a 0%,#161d2c 60%,#0b0f18 100%)'],
    ['森', '#2f5f3f'],
    ['Windows 標準 (グレー)', '#808080']
  ];
  function displayProps() {
    var cur = D.wallIdx;
    var list = h('div', { class: 'well lst', style: { height: '100px' }, tabindex: '0' });
    var screen = h('div', { class: 'mon-screen' });
    var prev = h('div', { class: 'mon' }, pic('sys-monitor', 122, 120), screen);
    function paint(i) { screen.style.background = WALLS[i][1]; }
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
        h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '8px' } }, prev),
        h('label', { html: '背景の色またはデザインを選んでください(<u>S</u>):', style: { display: 'block', marginBottom: '4px' } }), list),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }, { id: 'ap', label: '適用(&A)' }],
      onButton: function (id) {
        if (id === 'ap' || id === 'ok') { D.wallIdx = cur; D.root.style.background = WALLS[cur][1]; }
        if (id === 'ap') return false;
      }
    });
  }

  function tzDialog() {
    var clock = h('div', { class: 'bigclock' });
    function upd() {
      var d = new Date();
      clock.textContent = d.getFullYear() + '年 ' + (d.getMonth() + 1) + '月 ' + d.getDate() + '日   ' +
        pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    upd();
    var iv = setInterval(upd, 1000);
    dialog({
      title: '日付と時刻のプロパティ', width: 380, sound: false, btnAlign: 'right',
      body: h('div', {}, clock,
        h('div', { style: { marginTop: '10px' }, text: '現在のタイム ゾーン: ' + S.tz })),
      buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'c', label: 'キャンセル', esc: true }]
    }).then(function () { clearInterval(iv); });
  }

  function sysProps() {
    var k = S.key.join('').replace(/(.{5})(?=.)/g, '$1-') || '-----';
    dialog({
      title: 'システムのプロパティ', width: 440, sound: false, btnAlign: 'right',
      body: h('div', { style: { display: 'flex', gap: '16px' } },
        h('div', {}, pic('sys-monitor', 122, 120)),
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
  function info(title, body) { return dialog({ title: title, icon: 'info', width: 356, body: body }); }
  function na(name) {
    return function () { info(name, 'この再現版には、このプログラムは含まれていません。<br><br>メモ帳・ペイント・MS-DOS プロンプト・コントロール パネルは実際に動きます。'); };
  }
  function ie() {
    info('インターネット接続ウィザード', 'インターネット接続はまだ設定されていません。<br><br>この再現版では、インターネットには接続しません。');
  }
  function lab(t) { return esc(t).replace(/&amp;(.)/, '<u>$1</u>'); }
  function relRect(el) {
    var r = el.getBoundingClientRect(), b = W.refs().screenWrap.getBoundingClientRect(), sc = b.width / 640;
    return { x: (r.left - b.left) / sc, y: (r.top - b.top) / sc, w: r.width / sc, h: r.height / sc };
  }

  function menuDefs() {
    var EMPTY = [{ label: '(なし)', dis: true }];
    var ACC = [
      { label: 'エンターテイメント', icon: 'group', sub: [{ label: 'Windows Media Player', icon: 'wmp16', act: na('Windows Media Player') }, { label: 'サウンド レコーダー', act: na('サウンド レコーダー') }, { label: 'ボリューム コントロール', act: na('ボリューム コントロール') }] },
      { label: 'ゲーム', icon: 'group', sub: [{ label: 'スパイダ ソリティア', act: na('スパイダ ソリティア') }, { label: 'ソリティア', act: na('ソリティア') }, { label: 'ピンボール', act: na('ピンボール') }, { label: 'マインスイーパ', act: na('マインスイーパ') }] },
      { label: 'システム ツール', icon: 'group', sub: [{ label: 'システムの復元', act: na('システムの復元') }, { label: 'スキャンディスク', act: na('スキャンディスク') }, { label: 'デフラグ', act: na('デフラグ') }] },
      { label: '通信', icon: 'group', sub: [{ label: 'ホーム ネットワーク ウィザード', act: na('ホーム ネットワーク ウィザード') }, { label: 'ダイヤルアップ ネットワーク', act: na('ダイヤルアップ ネットワーク') }] },
      { label: 'アドレス帳', icon: 'addressbook16', act: na('アドレス帳') },
      { label: '電卓', icon: 'calc16', act: na('電卓') },
      { label: 'イメージング', icon: 'imaging16', act: na('イメージング') },
      { label: 'MS-DOS プロンプト', icon: 'msdos16', act: APPS.prompt },
      { label: 'メモ帳', icon: 'notepad16', act: APPS.notepad },
      { label: 'ペイント', icon: 'paint16', act: APPS.paint },
      { label: 'エクスプローラ', icon: 'explorer16', act: APPS.mycomputer },
      { label: 'Windows ムービー メーカー', icon: 'moviemaker16', act: na('Windows ムービー メーカー') },
      { label: 'ワードパッド', icon: 'wordpad16', act: na('ワードパッド') }
    ];
    var PROGRAMS = [
      { label: 'アクセサリ', icon: 'group', sub: ACC },
      { label: 'オンライン サービス', icon: 'group', sub: EMPTY },
      { label: 'スタートアップ', icon: 'group', sub: EMPTY },
      { label: 'Internet Explorer', icon: 'ie16', act: ie },
      { label: 'Outlook Express', icon: 'oe16', act: na('Outlook Express') },
      { label: 'Windows Media Player', icon: 'wmp16', act: na('Windows Media Player') }
    ];
    return [
      { label: 'Windows Update', icon: 'sm-update', act: function () { info('Windows Update', 'インターネットに接続して、Windows Me の最新の更新を確認します。<br><br>この再現版では、インターネットには接続しません。'); } },
      { sep: true },
      { label: 'プログラム(&P)', icon: 'sm-programs', sub: PROGRAMS },
      { label: '最近使ったファイル(&D)', icon: 'sm-documents', sub: [{ label: 'マイ ドキュメント', icon: 'folder16', act: function () { info('マイ ドキュメント', 'このフォルダは空です。'); } }, { label: 'マイ ピクチャ', icon: 'folder16', act: function () { info('マイ ピクチャ', 'このフォルダは空です。'); } }] },
      { label: '設定(&S)', icon: 'sm-settings', sub: [{ label: 'コントロール パネル(&C)', icon: 'cpl16', act: APPS.control }, { label: 'ダイヤルアップ ネットワーク(&N)', icon: 'folder16', act: na('ダイヤルアップ ネットワーク') }, { label: 'プリンタ(&P)', icon: 'folder16', act: na('プリンタ') }, { label: 'タスク バーと [スタート] メニュー(&T)', icon: 'display16', act: displayProps }] },
      { label: '検索(&C)', icon: 'sm-search', sub: [{ label: 'ファイルやフォルダ(&F)...', icon: 'explorer16', act: function () { info('検索結果', '検索条件に一致するファイルは見つかりませんでした。'); } }, { label: 'インターネット上(&I)...', icon: 'ie16', act: ie }] },
      { label: 'ヘルプ(&H)', icon: 'sm-help', act: function () { info('ヘルプとサポート', 'Windows Me のヘルプとサポートでは、キーワードから説明やトラブルシューティング ツールを探せます。<br><br>この再現版には、目次は含まれていません。'); } },
      { label: 'ファイル名を指定して実行(&R)...', icon: 'sm-run', act: runDialog },
      { sep: true },
      { label: (S.user.name || 'ユーザー') + ' のログオフ(&L)...', icon: 'sm-logoff', act: function () {
        dialog({
          title: 'Windows のログオフ', icon: 'sm-logoff', width: 330, sound: false,
          body: 'ログオフしますか?',
          buttons: [{ id: 'y', label: 'はい(&Y)', def: true }, { id: 'n', label: 'いいえ(&N)', esc: true }]
        }).then(function (r) { if (r === 'y') { stopClock(); window.__logon(); } });
      } },
      { label: 'Windows の終了(&U)...', icon: 'sm-shutdown', act: shutdownDialog }
    ];
  }

  var menuStack = [];             /* 開いているカスケード メニュー（階層順） */
  function closeFrom(level) {
    while (menuStack.length > level) menuStack.pop().remove();
  }
  function openCascade(row, items, level) {
    closeFrom(level);
    var m = h('div', { class: 'cmenu' });
    items.forEach(function (c) { add(m, cascadeRow(c, level + 1)); });
    D.root.appendChild(m);
    var r = relRect(row);
    var x = r.x + r.w - 3, y = r.y - 3;
    if (x + m.offsetWidth > 638) x = Math.max(0, r.x - m.offsetWidth + 3);
    if (y + m.offsetHeight > 452) y = Math.max(0, 452 - m.offsetHeight);
    m.style.left = x + 'px'; m.style.top = y + 'px';
    menuStack.push(m);
  }
  function cascadeRow(c, level) {
    var it = h('div', { class: 'cmi' + (c.dis ? ' dis' : '') },
      h('span', { class: 'ci' }, c.icon ? pic(c.icon, 16, 16) : null),
      h('span', { class: 'cl', html: lab(c.label) }),
      c.sub ? h('span', { class: 'ar' }) : null);
    function hot() {
      Array.prototype.forEach.call(it.parentNode.children, function (n) { n.classList.remove('hot'); });
      it.classList.add('hot');
    }
    it.addEventListener('mouseenter', function () {
      hot();
      if (c.sub) openCascade(it, c.sub, level); else closeFrom(level);
    });
    it.addEventListener('click', function (e) {
      e.stopPropagation();
      if (c.dis) return;
      if (c.sub) { hot(); openCascade(it, c.sub, level); return; }
      closeStart();
      if (c.act) c.act();
    });
    return it;
  }

  function buildStartMenu() {
    var items = h('div', { class: 'smitems' });
    var menu = h('div', { class: 'startmenu' }, h('div', { class: 'banner' }, pic('sm-banner', 21, 304)), items);
    menuDefs().forEach(function (o) {
      if (o.sep) { add(items, h('div', { class: 'smsep' })); return; }
      var it = h('div', { class: 'smi' }, pic(o.icon, 32, 32), h('span', { class: 'sl', html: lab(o.label) }), o.sub ? h('span', { class: 'ar' }) : null);
      function hot() {
        items.querySelectorAll('.smi').forEach(function (n) { n.classList.remove('hot'); });
        it.classList.add('hot');
      }
      it.addEventListener('mouseenter', function () {
        hot();
        if (o.sub) openCascade(it, o.sub, 0); else closeFrom(0);
      });
      it.addEventListener('click', function (e) {
        e.stopPropagation();
        if (o.sub) { hot(); openCascade(it, o.sub, 0); return; }
        closeStart();
        if (o.act) o.act();
      });
      add(items, it);
    });
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    return menu;
  }

  function runDialog() {
    var f = Field({ w: '100%' });
    f.dataset.autofocus = '1';
    dialog({
      title: 'ファイル名を指定して実行', width: 356, sound: false, btnAlign: 'right',
      body: h('div', {},
        h('div', { class: 'dlg-row' }, h('div', {}, pic('sm-run', 32, 32)),
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
        h('div', { class: 'dlg-row' }, h('div', {}, pic('sm-shutdown', 32, 32)),
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
      if (mode === 'restart') { snd.logoff(); return fadeOut(function () { window.__bootLogo(window.__desktop, 3000); }); }
      if (mode === 'dos') { snd.logoff(); return fadeOut(dosMode); }
      snd.logoff();
      fadeOut(powerOff);
    });
  }

  function fadeOut(next) {
    var root = h('div', { class: 'screen desk', style: { background: WALLS[D ? D.wallIdx : 0][1] } });
    add(root, h('div', { class: 'center-abs' },
      h('div', { class: 'win dlg dsk', style: { position: 'static', width: '300px' } },
        h('div', { class: 'tbar' }, h('span', { class: 'ttl', text: 'Windows の終了' })),
        h('div', { class: 'cli' }, h('p', { class: 't', text: 'しばらくお待ちください。Windows を終了しています...' })))));
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
      onWin: function () { window.__bootLogo(window.__desktop, 2600); },
      onExit: function () { window.__bootLogo(window.__desktop, 2600); }
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
    closeFrom(0);
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
    W.setTheme('desk');
    stopClock();
    menuStack.length = 0;
    var root = h('div', { class: 'screen desk' });
    var icons = h('div', { class: 'icons' });
    var winlayer = h('div', { class: 'winlayer' });
    var tasks = h('div', { class: 'tasks' });
    var clock = h('div', { id: 'clock' });
    var startBtn = h('button', { class: 'btn', id: 'startbtn', type: 'button' },
      pic('start-flag', 20, 16), h('span', { text: 'スタート' }));

    function qlBtn(icon, title, act) {
      var b = h('button', { class: 'qlb', type: 'button', title: title }, pic(icon, 16, 16));
      b.addEventListener('click', function (e) { e.stopPropagation(); closeStart(); act(); });
      return b;
    }
    var ql = h('div', { class: 'ql' }, h('i', { class: 'grip' }),
      qlBtn('ql-desktop', 'デスクトップの表示', function () { D.wins.slice().forEach(function (r) { if (!r.min) minimize(r); }); }),
      qlBtn('ql-ie', 'Internet Explorer ブラウザの起動', ie),
      qlBtn('ql-oe', 'Outlook Express の起動', na('Outlook Express')),
      qlBtn('ql-wmp', 'Windows Media Player', na('Windows Media Player')),
      h('i', { class: 'grip' }));
    var tray = h('div', { class: 'tray' }, pic('tray-net', 16, 16), pic('tray-vol', 16, 16), clock);
    var taskbar = h('div', { class: 'taskbar' }, startBtn, ql, tasks, tray);
    add(root, [icons, winlayer, taskbar]);

    D = { root: root, winlayer: winlayer, tasks: tasks, startBtn: startBtn, wins: [], active: null, wallIdx: 0 };

    var DESKICONS = [
      { name: 'マイ ドキュメント', icon: 'ico-mydocs', act: function () { info('マイ ドキュメント', 'このフォルダは空です。'); } },
      { name: 'マイ コンピュータ', icon: 'ico-mycomputer', act: APPS.mycomputer },
      { name: 'マイ ネットワーク', icon: 'ico-network', act: function () { info('マイ ネットワーク', 'ワークグループ ' + S.pc.wg + ' には、ほかのコンピュータは見つかりませんでした。'); } },
      { name: 'ごみ箱', icon: 'ico-recycle', act: APPS.recycle },
      { name: 'Internet Explorer', icon: 'ico-ie', act: ie },
      { name: 'Outlook Express', icon: 'ico-oe', act: na('Outlook Express') }
    ];
    DESKICONS.forEach(function (d) {
      var el = h('div', { class: 'dicon' }, pic(d.icon, 32, 32), h('div', {}, h('span', { class: 'lab', text: d.name })));
      el.setAttribute('aria-selected', 'false');
      el.tabIndex = 0;
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        closeStart();
        icons.querySelectorAll('.dicon').forEach(function (n) { n.setAttribute('aria-selected', 'false'); });
        el.setAttribute('aria-selected', 'true');
      });
      el.addEventListener('dblclick', function () { d.act(); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { d.act(); } });
      add(icons, el);
    });

    startBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleStart(); });
    root.addEventListener('click', function () {
      closeStart();
      icons.querySelectorAll('.dicon').forEach(function (n) { n.setAttribute('aria-selected', 'false'); });
    });

    function tickClock() {
      var d = new Date();
      clock.textContent = d.getHours() + ':' + pad(d.getMinutes());
    }
    tickClock();
    clockIV = setInterval(tickClock, 15000);

    setScreen(root);
    startMenuEl = null;
    snd.startup();

    wait(1400).then(function () {
      if (!D || D.root !== root) return;
      openWindow({
        title: 'Windows Me へようこそ', w: 356, y: 128, x: 142,
        build: function (cli, rec) {
          cli.classList.add('welcome');
          add(cli, h('div', { class: 'dlg-row' },
            h('div', {}, pic('ico-mycomputer', 32, 32)),
            h('div', { class: 'msg' },
              h('div', { style: { fontWeight: '700', marginBottom: '6px' }, text: 'ようこそ、' + (S.user.name || 'ユーザー') + ' さん' }),
              h('div', { text: 'セットアップが完了しました。デスクトップのアイコンはダブルクリックで開けます。[スタート] ボタンからプログラムやコントロール パネルを試してみてください。' }))));
          add(cli, h('div', { class: 'dlg-btns right' },
            Btn('閉じる', { def: true, onClick: function () { rec.close(); } })));
        }
      });
    });
  };
})();
