/* =========================================================================
 * setup.js : セットアップ本編
 *   MS-DOS 実モード → 第1フェーズ(16色・青地) → ファイルのコピー → 再起動
 *   → 第2フェーズ(白地にロゴ) → ログオン
 * 画面の座標は 640x480 の実機スクリーンショットを実測した値。
 * ========================================================================= */
(function () {
  'use strict';
  var W = window.__WinMe;
  var h = W.h, add = W.add, frag = W.frag, wait = W.wait, pic = W.pic;
  var Btn = W.Btn, Field = W.Field, Radio = W.Radio, Check = W.Check, Progress = W.Progress;
  var dialog = W.dialog, setScreen = W.setScreen, snd = W.snd;

  var S = window.__setupState = {
    key: ['', '', '', '', ''],
    dirMode: 'default', dirOther: 'C:\\WINDOWS.000',
    type: 'typical',
    user: { name: '', company: '' },
    pc: { name: 'MEBOX', wg: 'WORKGROUP', desc: '' },
    compMode: 'common', comps: null,
    country: '日本',
    tz: '(GMT+09:00) 大阪、札幌、東京', dst: false,
    bootdisk: true,
    eta: '30 ～ 60 分',
    restartCount: 0
  };

  var STEPS = [
    'セットアップの\n準備',
    'コンピュータ情報\nの収集',
    'Windows ファイル\nのコピー',
    'コンピュータの\n再起動',
    'ハードウェアの検出\nと設定の完了'
  ];
  var TITLE = 'Windows Millennium Edition セットアップ';

  function guard() { var g = W.RUN; return function () { return g === W.RUN; }; }
  window.__guard = guard;

  /* ------------------------------------------------- 左パネルと背景の枠 */
  function shell(phase, step, info) {
    W.setTheme('s16');
    var root = h('div', { class: 'screen setup p' + phase });
    var lp = h('div', { class: 'lp' });
    STEPS.forEach(function (t, i) {
      add(lp, h('div', { class: 'step' + (i === step ? ' cur' : ''), style: { top: (34 + 36 * i) + 'px' } },
        pic('step' + (i + 1), 20, 18), h('span', { text: t })));
    });
    add(lp, h('div', { class: 'eta' }, pic('clock', 20, 18), h('span', { text: '推定残り時間:' })));
    var etaVal = h('div', { class: 'eta-val', text: S.eta });
    var infoEl = h('div', { class: 'info', text: info || '' });
    add(lp, [etaVal, infoEl, pic('microsoft', 96, 17, 'mslogo')]);
    add(root, lp);
    if (phase === 1) {
      add(root, h('div', { class: 'p1top' }, pic('p1-flag', 24, 14), h('span', { text: TITLE })));
    }
    return { root: root, lp: lp, info: infoEl, eta: etaVal };
  }
  function setEta(sh, v) { S.eta = v; sh.eta.textContent = v; }

  /* 「21%」のように数字が反転表示されるバー */
  function PBar() {
    var t1 = h('span', { class: 't', text: '0%' }), t2 = h('span', { class: 't', text: '0%' });
    var fill = h('div', { class: 'f' }, t2);
    var box = h('div', { class: 'pbar' }, t1, fill);
    box.set = function (p) {
      p = Math.max(0, Math.min(100, p));
      fill.style.width = p + '%';
      t1.textContent = t2.textContent = Math.floor(p) + '%';
    };
    return box;
  }

  function errDlg(msg, title) {
    return dialog({ title: title || TITLE, icon: 'error', body: msg, width: 340 });
  }

  /* =====================================================================
   *  ウィザード
   * ===================================================================== */
  var PAGES = {}, hist = [];
  function page(o) { PAGES[o.id] = o; }

  function go(id) {
    var p = PAGES[id];
    if (!p) return;
    if (!p.transient) hist.push(id);
    if (p.eta) S.eta = p.eta;

    var sh = shell(p.phase || 1, 1, p.info);
    var win = h('div', { class: 'win s16 wizwin' + (p.side ? ' has-side' : '') });
    add(win, h('div', { class: 'tbar center' }, h('span', { class: 'ttl', text: TITLE + ' ウィザード' })));
    if (p.side) add(win, pic('wizard-side', 146, 288, 'wiz-side'));
    add(win, h('div', { class: 'wiz-h', text: p.title }));
    if (p.sub) add(win, h('div', { class: 'wiz-sub', text: p.sub }));
    var body = h('div', { class: 'wiz-body' });
    add(win, body);
    add(win, h('div', { class: 'wiz-sep' }));

    var ui = {
      shell: sh, page: p, body: body,
      setNext: function (en) { ui.btnNext.disabled = !en; },
      next: function () { tryNext(ui); }
    };
    add(body, p.build(ui));
    ui.btnBack = Btn('< 戻る(&B)', { cls: 'wb back', disabled: p.noBack || hist.length <= 1, onClick: back });
    ui.btnNext = Btn(p.finish ? '完了' : '次へ(&N) >', { cls: 'wb next', def: true, onClick: function () { tryNext(ui); } });
    ui.btnCancel = Btn('キャンセル', { cls: 'wb cancel', esc: true, onClick: cancelSetup });
    add(win, [ui.btnBack, ui.btnNext, ui.btnCancel]);
    add(sh.root, win);
    setScreen(sh.root);
    if (p.onShow) p.onShow(ui);
  }
  function back() {
    if (hist.length <= 1) return;
    hist.pop();
    var id = hist.pop();
    go(id);
  }
  function tryNext(ui) {
    if (ui.btnNext.disabled) return;
    var p = ui.page;
    Promise.resolve(p.next ? p.next(ui) : null).then(function (r) {
      if (typeof r === 'string') go(r);
    });
  }
  function cancelSetup() {
    dialog({
      title: 'セットアップの終了', icon: 'warn', width: 360,
      body: 'Windows Millennium Edition のセットアップは完了していません。<br><br>セットアップを終了しますか?',
      buttons: [{ id: 'yes', label: 'セットアップの終了(&X)' }, { id: 'no', label: '続行(&C)', def: true, esc: true }]
    }).then(function (r) { if (r === 'yes') exitScreen(); });
  }
  function P(html, cls) { return frag('<p class="t' + (cls ? ' ' + cls : '') + '">' + html + '</p>'); }

  /* ------------------------------------------------------------ ようこそ */
  page({
    id: 'welcome', side: true, noBack: true, eta: '30 ～ 60 分',
    title: 'Windows Me セットアップの開始',
    info: 'ここには、Windows セットアップに関する情報が表示されます。',
    build: function () {
      return [
        P('Windows Millennium Edition をお選びいただき、ありがとうございます。コンピュータがより使いやすく、頼りになり、楽しいものになります。'),
        P('Windows Millennium Edition では、インターネットにすばやく簡単に接続できます。以前のバージョンの Windows より、さらに使いやすくなりました。'),
        P('セットアップには 30 ～ 60 分かかります。所要時間はコンピュータの速度によって異なります。'),
        P('セットアップを開始するには、[次へ] をクリックしてください。')
      ];
    },
    next: function () { return 'license'; }
  });

  /* ------------------------------------------------------------ 使用許諾 */
  var EULA =
    '------------------------------------------------\n' +
    '   WINDOWS MILLENNIUM EDITION セットアップ再現版\n\n' +
    '   使用許諾契約書（ファンメイド版）\n' +
    '------------------------------------------------\n\n' +
    '重要 - 以下の内容を注意してお読みください。この契約書は、お客様と\n' +
    '頒布者との間に締結される契約です。本ソフトウェアをインストール、複製、\n' +
    'または使用することによって、お客様は本契約の各条項に同意したものと\n' +
    'みなされます。\n\n' +
    '1. 使用権の許諾\n' +
    '   頒布者は、本ソフトウェアを 1 台のコンピュータ上で使用する\n' +
    '   非独占的な権利を許諾します。\n\n' +
    '2. 複製の制限\n' +
    '   バックアップの目的でのみ、複製物を 1 部作成できます。\n\n' +
    '3. 禁止事項\n' +
    '   本ソフトウェアのリバース エンジニアリング、逆コンパイル、\n' +
    '   または逆アセンブルを行うことはできません。\n\n' +
    '4. 限定保証\n' +
    '   本ソフトウェアは現状有姿で提供されます。\n\n' +
    '5. 責任の制限\n' +
    '   頒布者は、本ソフトウェアの使用から生じるいかなる損害に\n' +
    '   ついても、責任を負わないものとします。\n\n' +
    '6. 本画面について\n' +
    '   本画面は、Windows Millennium Edition のセットアップを再現した\n' +
    '   非公式のファンメイド作品です。マイクロソフト コーポレーション\n' +
    '   とは関係がなく、実際の製品の使用許諾契約書ではありません。\n' +
    '   コンピュータに対する変更は一切行われません。\n';

  page({
    id: 'license', eta: '30 ～ 60 分',
    title: '使用許諾契約書', sub: '次の使用許諾契約書をお読みください。',
    info: 'セットアップを続行するには、使用許諾契約書に同意する必要があります。',
    build: function (ui) {
      var box = h('div', { class: 'well eula', tabindex: '0' }, h('pre', { text: EULA }));
      return [
        P('セットアップを続行するには、契約書に同意する必要があります。'),
        box,
        h('div', { class: 'rows' },
          Radio({ name: 'eula', label: '同意する(&A)', onChange: function () { ui.setNext(true); } }),
          Radio({ name: 'eula', label: '同意しない(&D)', checked: true, onChange: function () { ui.setNext(false); } }))
      ];
    },
    onShow: function (ui) { ui.setNext(false); },
    next: function () { return 'prodkey'; }
  });

  /* ------------------------------------------------------ プロダクト キー */
  page({
    id: 'prodkey', eta: '30 ～ 60 分',
    title: 'Windows プロダクト キー', sub: 'このソフトウェアのプロダクト キーを入力してください。',
    info: 'プロダクト キーは、CD-ROM ケースの裏面のラベルに記載されています。',
    build: function (ui) {
      var boxes = [];
      var row = h('div', { class: 'keyrow' });
      for (var i = 0; i < 5; i++) {
        (function (i) {
          var f = Field({ cls: 'key', max: 5, value: S.key[i], spell: false });
          if (i === 0) f.dataset.autofocus = '1';
          f.addEventListener('input', function () {
            f.value = f.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
            S.key[i] = f.value;
            if (f.value.length === 5 && i < 4) boxes[i + 1].focus();
            ui.setNext(boxes.every(function (b) { return b.value.length === 5; }));
          });
          f.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace' && !f.value && i > 0) boxes[i - 1].focus();
          });
          f.addEventListener('paste', function (e) {
            var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
            if (t.length > 5) {
              e.preventDefault();
              for (var j = 0; j < 5; j++) { S.key[j] = t.substr(j * 5, 5); boxes[j].value = S.key[j]; }
              boxes[4].focus();
              ui.setNext(boxes.every(function (b) { return b.value.length === 5; }));
            }
          });
          boxes.push(f);
          add(row, f);
          if (i < 4) add(row, h('span', { text: '-' }));
        })(i);
      }
      add(row, Btn('ヘルプ(&H)...', {
        cls: 'keyhelp', onClick: function () {
          dialog({
            title: 'プロダクト キー', icon: 'info', width: 372,
            body: 'プロダクト キーは 25 文字の英数字です。<br><br>この再現版では、英数字 25 文字であればどのキーでも受け付けます。<br>例: MEFAN-RETRO-CSSJS-HTML5-2000W'
          });
        }
      }));
      ui.keyBoxes = boxes;
      return [
        P('プロダクト キーは、コンピュータに付属のマニュアル、または Windows Millennium Edition のソフトウェアに付属しています。'),
        P('プロダクト キーは、Certificate of Authenticity の右下、バーコードのすぐ上に記載されています。'),
        P('ハイフンを除いて、下のボックスにプロダクト キーを入力してください。'),
        row
      ];
    },
    onShow: function (ui) {
      ui.setNext(ui.keyBoxes.every(function (b) { return b.value.length === 5; }));
    },
    next: function () { return 'dir'; }
  });

  /* ------------------------------------------------------- ディレクトリ */
  page({
    id: 'dir', eta: '38 分',
    title: 'ディレクトリの選択', sub: 'Windows をインストールするディレクトリを選択してください。',
    info: '既定のフォルダ (C:\\Windows) 以外のフォルダにも Windows をインストールできます。',
    build: function (ui) {
      var other = Field({ value: S.dirOther, w: '236px', disabled: S.dirMode !== 'other', spell: false });
      ui.other = other;
      return h('div', { class: 'rows', style: { marginTop: '28px' } },
        Radio({ name: 'dir', label: 'C:\\WINDOWS (推奨)(&C)', checked: S.dirMode === 'default', onChange: function () { S.dirMode = 'default'; other.disabled = true; } }),
        Radio({ name: 'dir', label: 'その他のディレクトリ(&O)', checked: S.dirMode === 'other', onChange: function () { S.dirMode = 'other'; other.disabled = false; other.focus(); } }),
        h('div', { style: { margin: '2px 0 0 14px' } }, other));
    },
    next: function (ui) {
      if (S.dirMode === 'other') {
        var v = ui.other.value.trim();
        if (!/^[A-Za-z]:\\[^\\/:*?"<>|]{1,40}$/.test(v)) {
          return errDlg('指定されたディレクトリ名は使用できません。<br><br>C:\\WINME のような形式で、有効なパスを入力してください。')
            .then(function () { ui.other.focus(); ui.other.select(); });
        }
        S.dirOther = v;
      }
      return 'prepdir';
    }
  });

  /* 「ディレクトリの準備」: 進行だけ見せて自動で次へ */
  page({
    id: 'prepdir', transient: true, noBack: true, eta: '36 分',
    title: 'ディレクトリの準備', sub: 'しばらくお待ちください。',
    info: 'セットアップは、Windows をインストールするディレクトリを準備しています。',
    build: function (ui) {
      ui.st = h('p', { class: 't', text: 'インストールされているコンポーネントを確認しています...' });
      ui.bar = Progress();
      return h('div', { style: { marginTop: '40px' } }, ui.st, ui.bar);
    },
    onShow: function (ui) {
      ui.setNext(false); ui.btnCancel.disabled = true;
      var alive = guard();
      var tasks = ['インストールされているコンポーネントを確認しています...', 'ディスクの空き領域を確認しています...', 'ディレクトリを準備しています...'];
      (function run(i) {
        if (!alive()) return;
        if (i >= tasks.length) { ui.bar.set(100); wait(450).then(function () { if (alive()) go('options'); }); return; }
        ui.st.textContent = tasks[i];
        ui.bar.set((i + 0.6) / tasks.length * 100);
        snd.drive();
        wait(800 + Math.random() * 400).then(function () { run(i + 1); });
      })(0);
    }
  });

  /* ------------------------------------------------ セットアップ オプション */
  var TYPES = [
    ['typical', '標準(&T)', 'ほとんどのコンピュータで、このオプションをお勧めします。', 'opt1'],
    ['portable', 'ポータブル(&P)', '携帯用コンピュータに便利なオプションでセットアップします。', 'opt2'],
    ['compact', 'コンパクト(&C)', 'ディスク領域を節約するため、オプションのコンポーネントはインストールされません。', 'opt3'],
    ['custom', 'カスタム(&U)', '上級ユーザーとシステム管理者向けです。すべてのセットアップ オプションをカスタマイズできます。', 'opt4']
  ];
  page({
    id: 'options', eta: '34 分',
    title: 'セットアップ オプション', sub: 'セットアップの種類を選択してください。',
    info: 'コンピュータの環境とユーザーのレベルに最も適したセットアップ オプションを選択してください。',
    build: function () {
      var wrap = h('div', { class: 'opts' });
      TYPES.forEach(function (t) {
        var r = Radio({ name: 'stype', label: t[1], checked: S.type === t[0], onChange: function () { S.type = t[0]; } });
        add(wrap, h('div', { class: 'opt' }, pic(t[3], 34, 34), h('div', {}, r, h('div', { class: 'optd', text: t[2] }))));
      });
      return wrap;
    },
    next: function () { return 'userinfo'; }
  });

  /* ----------------------------------------------------------- ユーザー情報 */
  page({
    id: 'userinfo', eta: '33 分',
    title: 'ユーザー情報', sub: 'ユーザー情報を入力してください。',
    info: '入力した名前は、Windows とプログラムの登録に使われます。',
    build: function (ui) {
      ui.n = Field({ value: S.user.name, w: '210px', max: 32 });
      ui.n.dataset.autofocus = '1';
      ui.c = Field({ value: S.user.company, w: '210px', max: 32 });
      return [
        P('名前と会社名を下のボックスに入力してください。会社名を入力しない場合は、空白のままにしておきます。'),
        h('div', { class: 'form' },
          h('label', { html: '名前(<u>A</u>):' }), ui.n,
          h('label', { html: '会社名(<u>O</u>):' }), ui.c)
      ];
    },
    next: function (ui) {
      if (!ui.n.value.trim()) return errDlg('名前を入力してください。').then(function () { ui.n.focus(); });
      S.user.name = ui.n.value.trim();
      S.user.company = ui.c.value.trim();
      return 'comps';
    }
  });

  /* ------------------------------------------------- Windows コンポーネント */
  page({
    id: 'comps', eta: '33 分',
    title: 'Windows コンポーネント', sub: 'セットアップの種類に応じて選択されたコンポーネントを変更できます。',
    info: 'Windows には、さまざまなオプション コンポーネントが付属しています。後で [コントロール パネル] からインストールすることもできます。',
    build: function () {
      return [
        P('コンポーネントによっては、追加のディスク領域が必要です。一覧から選択しない限り、インストールされないコンポーネントもあります。'),
        P('次のどちらかを選択してください:'),
        h('div', { class: 'rows' },
          Radio({ name: 'cm', label: '一般的なコンポーネントをインストールする (推奨)(&I)', checked: S.compMode === 'common', onChange: function () { S.compMode = 'common'; } }),
          Radio({ name: 'cm', label: 'コンポーネントの一覧を表示して、インストールするものを選択する(&D)', checked: S.compMode === 'list', onChange: function () { S.compMode = 'list'; } }))
      ];
    },
    next: function () { return S.compMode === 'list' ? 'compsel' : 'netid'; }
  });

  var COMPS = [
    ['アクセサリ', 13.1, true], ['アドレス帳', 1.7, true], ['通信', 9.8, true],
    ['デスクトップ テーマ', 31.7, false], ['ゲーム', 12.4, true],
    ['マルチ メディア', 21.2, true], ['オンライン サービス', 1.2, true],
    ['Outlook Express', 6.1, true], ['システム ツール', 6.3, true],
    ['ユーザー補助', 4.9, false], ['WebTV for Windows', 16.0, false]
  ];
  page({
    id: 'compsel', eta: '33 分',
    title: 'コンポーネントの選択', sub: 'インストールするコンポーネントを選択してください。',
    info: 'チェック ボックスをオンにすると、そのコンポーネントがインストールされます。',
    build: function () {
      if (!S.comps) { S.comps = {}; COMPS.forEach(function (c) { S.comps[c[0]] = c[2]; }); }
      var list = h('div', { class: 'well lst complist', tabindex: '0' });
      var need = h('b');
      function recalc() {
        var t = 482.6;
        COMPS.forEach(function (c) { if (S.comps[c[0]]) t += c[1]; });
        need.textContent = t.toFixed(1) + ' MB';
      }
      COMPS.forEach(function (c) {
        var cb = Check({ label: c[0], checked: S.comps[c[0]], onChange: function (e) { S.comps[c[0]] = e.target.checked; recalc(); } });
        add(cb, h('span', { class: 'sz', text: c[1].toFixed(1) + ' MB' }));
        add(list, cb);
      });
      recalc();
      return [
        h('label', { html: 'コンポーネント(<u>C</u>):', class: 'lbl' }), list,
        h('div', { class: 'spacerow' }, h('span', {}, 'セットアップに必要な領域:  ', need), h('span', { text: '利用できるディスク領域:  1,862.4 MB' }))
      ];
    },
    next: function () { return 'netid'; }
  });

  /* ------------------------------------------------------- ネットワーク ID */
  page({
    id: 'netid', eta: '31 分',
    title: 'ネットワーク ID', sub: 'ネットワーク上でコンピュータを識別するための、名前とワークグループを指定してください。',
    info: 'コンピュータの名前、ワークグループ、および簡単な説明を入力してください。',
    build: function (ui) {
      ui.n = Field({ value: S.pc.name, w: '150px', max: 15, spell: false });
      ui.n.dataset.autofocus = '1';
      ui.w = Field({ value: S.pc.wg, w: '150px', max: 15, spell: false });
      ui.d = Field({ value: S.pc.desc, w: '250px', max: 48 });
      return [
        P('ネットワーク上で識別するための、このコンピュータの名前、ワークグループ、および説明を入力してください。'),
        h('div', { class: 'form col' },
          h('label', { html: 'コンピュータ名(<u>C</u>):' }), ui.n,
          h('label', { html: 'ワークグループ(<u>W</u>):' }), ui.w,
          h('label', { html: 'コンピュータの説明(<u>D</u>):' }), ui.d)
      ];
    },
    next: function (ui) {
      var nm = ui.n.value.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,15}$/.test(nm)) {
        return errDlg('コンピュータ名が正しくありません。<br><br>15 文字以内の半角英数字で入力してください。空白は使用できません。')
          .then(function () { ui.n.focus(); ui.n.select(); });
      }
      S.pc.name = nm;
      S.pc.wg = (ui.w.value.trim() || 'WORKGROUP').toUpperCase();
      S.pc.desc = ui.d.value.trim();
      return 'country';
    }
  });

  /* リスト ボックス（↑↓キー対応） */
  function ListBox(items, sel, onPick, cls) {
    var list = h('div', { class: 'well lst ' + (cls || ''), tabindex: '0', role: 'listbox' });
    var els = items.map(function (c) {
      var it = h('div', { class: 'it', role: 'option', text: c });
      it.addEventListener('click', function () { pick(c); });
      add(list, it);
      return it;
    });
    function pick(c, scroll) {
      sel = c;
      els.forEach(function (it) {
        var on = it.textContent === c;
        it.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on && scroll) it.scrollIntoView({ block: 'nearest' });
      });
      onPick(c);
    }
    list.addEventListener('keydown', function (e) {
      var i = items.indexOf(sel);
      if (e.key === 'ArrowDown') { e.preventDefault(); pick(items[Math.min(items.length - 1, i + 1)], true); }
      if (e.key === 'ArrowUp') { e.preventDefault(); pick(items[Math.max(0, i - 1)], true); }
    });
    pick(sel);
    list.scrollToSel = function () {
      var i = items.indexOf(sel);
      list.scrollTop = Math.max(0, els[i].offsetTop - 28);
    };
    return list;
  }

  /* -------------------------------------------------------------- 国/地域 */
  var COUNTRIES = ['アイスランド', 'アイルランド', 'アメリカ合衆国', 'アルゼンチン', 'イギリス', 'イタリア', 'インド',
    'インドネシア', 'エジプト', 'オーストラリア', 'オーストリア', 'オランダ', 'カナダ', 'ギリシャ', 'シンガポール',
    'スイス', 'スウェーデン', 'スペイン', 'タイ', '大韓民国', '台湾', '中華人民共和国', 'デンマーク', 'ドイツ',
    'トルコ', '日本', 'ニュージーランド', 'ノルウェー', 'フィンランド', 'ブラジル', 'フランス', 'ベルギー',
    'ポーランド', 'ポルトガル', '香港', 'メキシコ', 'ロシア'];
  page({
    id: 'country', eta: '29 分',
    title: '国/地域', sub: '国/地域を変更できます。',
    info: 'このコンピュータを使用する国または地域を選択してください。',
    build: function (ui) {
      ui.list = ListBox(COUNTRIES, S.country, function (c) { S.country = c; }, 'biglist');
      return [h('label', { html: '国/地域を選択してください(<u>S</u>):', class: 'lbl' }), ui.list];
    },
    onShow: function (ui) { ui.list.scrollToSel(); },
    next: function () { return 'tz'; }
  });

  /* ---------------------------------------------------------- タイム ゾーン */
  var ZONES = [
    '(GMT-12:00) エニウェトク、クェゼリン', '(GMT-11:00) ミッドウェー島、サモア', '(GMT-10:00) ハワイ',
    '(GMT-09:00) アラスカ', '(GMT-08:00) 太平洋標準時 (米国およびカナダ)、ティファナ',
    '(GMT-07:00) 山地標準時 (米国およびカナダ)', '(GMT-06:00) 中部標準時 (米国およびカナダ)',
    '(GMT-05:00) 東部標準時 (米国およびカナダ)', '(GMT-03:00) ブラジリア',
    '(GMT) グリニッジ標準時: ダブリン、エジンバラ、リスボン、ロンドン',
    '(GMT+01:00) アムステルダム、ベルリン、ベルン、ローマ、ストックホルム', '(GMT+02:00) アテネ、イスタンブール、ミンスク',
    '(GMT+03:00) モスクワ、サンクトペテルブルグ', '(GMT+05:30) カルカッタ、チェンナイ、ムンバイ、ニューデリー',
    '(GMT+07:00) バンコク、ハノイ、ジャカルタ', '(GMT+08:00) 北京、重慶、香港、ウルムチ', '(GMT+08:00) 台北',
    '(GMT+09:00) 大阪、札幌、東京', '(GMT+09:00) ソウル', '(GMT+09:30) アデレード',
    '(GMT+10:00) キャンベラ、メルボルン、シドニー', '(GMT+12:00) オークランド、ウェリントン'
  ];
  var NO_DST = /GMT\+0(7|8|9):00|GMT\+05:30|ハワイ/;
  page({
    id: 'tz', eta: '28 分',
    title: 'タイム ゾーンの設定', sub: 'Windows Millennium Edition では、タイム ゾーンを簡単に設定できます。',
    info: 'このコンピュータを使用するタイム ゾーンを選択してください。',
    build: function (ui) {
      var dst = Check({ label: '自動的に夏時間の調整をする(&A)', checked: S.dst, onChange: function (e) { S.dst = e.target.checked; } });
      function sync(z) {
        var off = NO_DST.test(z);
        dst.input.disabled = off;
        dst.classList.toggle('off', off);
        if (off) { dst.input.checked = false; S.dst = false; }
      }
      ui.list = ListBox(ZONES, S.tz, function (z) { S.tz = z; sync(z); }, 'tzlist');
      return [
        P('タイム ゾーンを設定すると、お住まいの地域の標準時が設定されます。'),
        h('label', { html: '次の一覧からタイム ゾーンを選択してください(<u>S</u>):', class: 'lbl' }),
        ui.list, h('div', { style: { marginTop: '8px' } }, dst)
      ];
    },
    onShow: function (ui) { ui.list.scrollToSel(); },
    next: function () { return 'bootdisk'; }
  });

  /* ----------------------------------------------------------- 起動ディスク */
  page({
    id: 'bootdisk', eta: '26 分',
    title: '起動ディスク', sub: 'セットアップは起動ディスクを作成します。',
    info: '起動ディスクは、Windows が正しく起動しないときに、コンピュータを起動するために使います。',
    build: function () {
      return [
        P('Windows の起動時に問題が発生した場合、起動ディスクを使ってコンピュータを起動し、診断プログラムを実行して問題を解決できます。'),
        P('起動ディスクを作成するには、1.44 MB のフロッピー ディスクが 1 枚必要です。ディスク上のファイルはすべて削除されます。'),
        P('[次へ] をクリックすると、ディスクの挿入を求めるメッセージが表示されます。')
      ];
    },
    next: function () {
      return dialog({
        title: 'ディスクの挿入', icon: 'dlg-setup', width: 372,
        body: '「Windows Millennium Edition 起動ディスク」というラベルを付けたディスクを、ドライブ A: に挿入してください。<br><br>' +
          '[OK] をクリックすると、起動ディスクを作成します。<br>起動ディスクを作成しない場合は、[キャンセル] をクリックしてください。',
        buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'skip', label: 'キャンセル', esc: true }]
      }).then(function (r) {
        if (r !== 'ok') { S.bootdisk = false; return 'ready'; }
        return makeBootDisk();
      });
    }
  });
  function makeBootDisk() {
    return new Promise(function (resolve) {
      var bar = Progress(), alive = guard();
      dialog({
        title: '起動ディスクの作成', width: 344, noButtons: true, sound: false,
        body: h('div', {}, h('p', { class: 't', text: 'ドライブ A: に起動ディスクを作成しています...' }), bar),
        onOpen: function (win, done) {
          var p = 0;
          (function tick() {
            if (!alive()) return;
            p += 4 + Math.random() * 7; bar.set(p); snd.drive();
            if (p < 100) { wait(220).then(tick); return; }
            wait(420).then(function () {
              if (!alive()) return;
              done('done');
              dialog({
                title: TITLE, icon: 'dlg-setup', width: 360,
                body: '起動ディスクの作成が完了しました。<br><br>ディスクをドライブから取り出して、[OK] をクリックしてください。'
              }).then(function () { resolve('ready'); });
            });
          })();
        }
      });
    });
  }

  /* --------------------------------------------------- コピー開始の確認 */
  page({
    id: 'ready', side: true, finish: true, eta: '25 分',
    title: 'ファイルのコピーの開始',
    info: 'これ以降のセットアップでは、通常は操作の必要はありません。',
    build: function () {
      return [
        P('Windows Millennium Edition セットアップ ウィザードは、コンピュータにファイルをコピーするために必要な情報を収集しました。設定を確認または変更する場合は、[戻る] をクリックしてください。'),
        P('セットアップを完了し、Windows Millennium Edition のファイルのコピーを開始するには、[完了] をクリックしてください。')
      ];
    },
    next: function () { copying(); }
  });

  /* =====================================================================
   *  ファイルのコピー（青地のビルボード）
   * ===================================================================== */
  var BILLBOARDS = [
    ['ホーム ネットワーク', [
      '複数の PC を持つ家庭が増えるにつれて、ファイルやプリンタ、モデムを PC の間で共有することが、ますます重要になってきました。Windows Me が、ホーム ネットワークのセットアップをお手伝いします。',
      'ホーム ネットワーク ウィザードが、複数の PC をネットワークでつなぐ手順を順を追って案内します。',
      'インターネット接続の共有を使うと、電話回線、ADSL、ケーブル モデムなどの 1 つのインターネット接続を複数の PC で共有できます。']],
    ['デジタル メディア', [
      'Windows Media Player 7 は、CD の再生と録音、インターネット ラジオ、ビデオの再生をひとつにまとめた、新しいプレーヤーです。',
      'Windows Movie Maker を使うと、ビデオ カメラの映像をコンピュータに取り込んで編集し、電子メールや Web で家族や友人と共有できます。',
      'スキャナやデジタル カメラの画像は、マイ ピクチャ フォルダで縮小表示やスライド ショーとして楽しめます。']],
    ['PC の正常性', [
      'システムの復元は、コンピュータの状態を自動的に記録します。問題が起きたときは、正常に動作していた時点の状態に戻すことができます。',
      'システム ファイルの保護により、重要なシステム ファイルがほかのプログラムによって書き換えられるのを防ぎます。',
      '自動更新は、Windows の重要な更新をインターネットから自動的にダウンロードして、お知らせします。']],
    ['オンライン エクスペリエンス', [
      'Internet Explorer 5.5 と Outlook Express により、Web の閲覧や電子メールがさらに快適になりました。',
      'MSN Messenger サービスを使うと、オンラインの友人とその場でメッセージをやり取りできます。',
      'ヘルプとサポートでは、Web 上の最新情報も含めて、知りたいことをキーワードですばやく探せます。']],
    ['ゲームを楽しむ', [
      'Windows Me には、スパイダ ソリティアやピンボールなどの新しいゲームが付属しています。',
      'インターネット ゲームでは、世界中のプレーヤーとバックギャモン、チェッカー、ハーツ、リバーシ、スペードで対戦できます。',
      'DirectX 7 により、最新のゲームもなめらかなグラフィックスとサウンドで楽しめます。']]
  ];

  function copying() {
    hist.length = 0;
    S.eta = '22 分';
    var sh = shell(1, 2, '');
    var bar = PBar();
    add(sh.lp, [h('div', { class: 'cplabel', text: 'ファイルのコピー状況:' }), h('div', { class: 'cpbar' }, bar)]);
    var bb = h('div', { class: 'billboard' });
    add(sh.root, bb);
    setScreen(sh.root);

    var alive = guard(), cur = -1;
    function showBoard(i) {
      cur = i;
      var b = BILLBOARDS[i];
      bb.replaceChildren(h('h2', { text: b[0] }));
      b[1].forEach(function (t) { add(bb, h('p', { text: t })); });
    }
    showBoard(0);

    var total = 30000, t0 = Date.now();
    (function tick() {
      if (!alive()) return;
      var p = Math.min(100, (Date.now() - t0) * W.getSpeed() / total * 100);
      bar.set(p);
      var bi = Math.min(BILLBOARDS.length - 1, Math.floor(p / (100 / BILLBOARDS.length)));
      if (bi !== cur) { showBoard(bi); }
      setEta(sh, Math.max(19, Math.round(22 - p / 100 * 3)) + ' 分');
      if (Math.random() < 0.3) snd.drive();
      if (p >= 100) { wait(700).then(function () { if (alive()) restartDialog(1, 3, 'コンピュータを再起動して、セットアップを続行します。'); }); return; }
      wait(140).then(tick);
    })();
  }

  /* =====================================================================
   *  再起動ダイアログ（15 秒カウントダウン）
   * ===================================================================== */
  function restartDialog(phase, step, info) {
    var sh = shell(phase, step, info);
    setScreen(sh.root);
    var alive = guard();
    var bar = Progress();
    var txt = h('div', { class: 'msg', text: '' });
    function label(n) {
      txt.textContent = 'セットアップを続行するには、コンピュータを再起動する必要があります。' +
        n + ' 秒後、または [今すぐ再起動] をクリックすると、コンピュータは自動的に再起動します。';
    }
    label(15);
    dialog({
      title: 'コンピュータの再起動', width: 340, x: 147, y: 147, sound: false, noButtons: true,
      cls: 'restartdlg',
      body: h('div', { class: 'grpbox' },
        h('div', { class: 'dlg-row' }, h('div', { class: 'ic' }, pic('dlg-setup', 34, 34)), txt),
        h('div', { class: 'thinbar' }, bar),
        h('div', { class: 'dlg-btns' }, Btn('今すぐ再起動(&R)', { def: true, onClick: function () { doRestart(); } }))),
      onOpen: function () {
        var t0 = Date.now();
        (function tick() {
          if (!alive()) return;
          var el = (Date.now() - t0) * W.getSpeed() / 1000;
          bar.set(el / 15 * 100);
          label(Math.max(0, Math.ceil(15 - el)));
          if (el >= 15) { doRestart(); return; }
          wait(200).then(tick);
        })();
      }
    });
  }
  function doRestart() {
    S.restartCount++;
    bootLogo(S.restartCount === 1 ? hardware : (S.restartCount === 2 ? finalize : logon));
  }

  /* =====================================================================
   *  起動ロゴ
   * ===================================================================== */
  function bootLogo(next, ms) {
    document.body.dataset.power = 'on';
    setScreen(h('div', { class: 'screen black' }, h('div', { class: 'post', text: '_' })));
    var alive = guard();
    wait(800).then(function () {
      if (!alive()) return;
      var root = h('div', { class: 'screen bootscr' }, pic('boot', 640, 480), h('div', { class: 'bootbar' }));
      setScreen(root);
      var a2 = guard();
      wait(ms || 4200).then(function () { if (a2()) next(); });
    });
  }
  window.__bootLogo = bootLogo;

  /* =====================================================================
   *  第2フェーズ: ハードウェアの検出 → 項目のセットアップ
   * ===================================================================== */
  var HWINFO = 'セットアップは、ハードウェアを検出して、コンピュータを再起動することがあります。長い間応答がない場合は、電源を切ってから、もう一度入れ直してください。';

  function hardware() {
    S.eta = '18 分';
    var sh = shell(2, 4, HWINFO);
    setScreen(sh.root);
    var alive = guard();
    dialog({
      title: 'ハードウェアのセットアップ', icon: 'dlg-hardware', iconH: 30, width: 366, x: 198, y: 201,
      noButtons: true, sound: false,
      body: 'Windows Millennium Edition は、ドライバ データベースを初期化しています...',
      onOpen: function (win, done) {
        var n = 0;
        (function tick() {
          if (!alive()) return;
          snd.drive();
          if (++n < 9) { wait(420).then(tick); return; }
          done('ok');
          detect(sh);
        })();
      }
    });
  }
  function detect(sh) {
    var alive = guard();
    setEta(sh, '15 分');
    var bar = Progress();
    var pc = h('div', { class: 'pc', text: '0% 完了' });
    dialog({
      title: 'ハードウェアの検出', icon: 'dlg-hardware', iconH: 30, width: 344, x: 148, y: 125,
      noButtons: true, sound: false,
      body: h('div', {},
        h('div', { text: 'Windows は、コンピュータにあるプラグ アンド プレイ以外のハードウェアを検出しています。' }),
        h('p', { class: 't', style: { marginTop: '12px' }, text: '注意: この処理には数分かかり、コンピュータが応答しなくなることがあります。' }),
        h('p', { class: 't', text: '長い間進行状況インジケータが止まったままでディスクの動作もない場合は、コンピュータを再起動してください。' }),
        h('div', { style: { marginTop: '14px' } }, bar), pc),
      onOpen: function () {
        var p = 0;
        (function tick() {
          if (!alive()) return;
          p += 1.5 + Math.random() * 4;
          if (p > 100) p = 100;
          bar.set(p);
          pc.textContent = Math.floor(p) + '% 完了';
          setEta(sh, Math.round(15 - p / 100 * 4) + ' 分');
          snd.drive();
          if (p < 100) { wait(p > 55 && p < 62 ? 1500 : 260).then(tick); return; }
          wait(700).then(function () { if (alive()) restartDialog(2, 4, HWINFO); });
        })();
      }
    });
  }

  var ITEMS = ['コントロール パネル', 'スタート メニューのプログラム', 'Windows ヘルプ', 'アプリケーションの起動の調整', 'システムの構成'];
  function finalize() {
    S.eta = '10 分';
    var sh = shell(2, 4, 'Windows セットアップは、システム ソフトウェアを構成しています。');
    setScreen(sh.root);
    var alive = guard();
    var rows = ITEMS.map(function (t) { return h('div', { class: 'item' }, h('i'), h('span', { text: t })); });
    var cbar = Progress(), tbar = Progress();
    dialog({
      title: TITLE, icon: 'dlg-setup', iconW: 34, iconH: 34, width: 316, x: 315, y: 29, noButtons: true, sound: false,
      body: h('div', {}, h('div', { text: 'Windows は、次の項目をセットアップしています:' }), h('div', { class: 'items' }, rows)),
      onOpen: function () {
        var i = 0;
        (function step() {
          if (!alive()) return;
          if (i >= ITEMS.length) { wait(500).then(function () { if (alive()) { S.restartCount = 2; bootLogo(logon, 3600); } }); return; }
          rows.forEach(function (r, k) { r.classList.toggle('cur', k === i); });
          tbar.set(i / ITEMS.length * 100);
          setEta(sh, Math.max(1, 10 - i * 2) + ' 分');
          var p = 0;
          (function sub() {
            if (!alive()) return;
            p += 10 + Math.random() * 16;
            cbar.set(p);
            snd.drive();
            if (p < 100) { wait(230).then(sub); return; }
            i++; tbar.set(i / ITEMS.length * 100);
            wait(280).then(step);
          })();
        })();
      }
    });
    dialog({
      title: TITLE, width: 244, x: 196, y: 236, noButtons: true, sound: false, cls: 'mini',
      body: h('div', {},
        h('div', { text: 'システム設定を更新しています...' }),
        h('div', { class: 'lab2', text: 'コンポーネントの状況' }), cbar,
        h('div', { class: 'lab2', text: '全体の状況' }), tbar)
    });
  }

  /* =====================================================================
   *  ログオン
   * ===================================================================== */
  function logon() {
    W.setTheme('desk');
    setScreen(h('div', { class: 'screen desk' }));
    var u = Field({ value: S.user.name || 'ユーザー', w: '172px' });
    var p = Field({ type: 'password', w: '172px' });
    p.dataset.autofocus = '1';
    function ask() {
      dialog({
        title: 'Windows パスワードの入力', width: 372, sound: false, cls: 'logon', y: 150,
        body: h('div', { class: 'logon-grid' },
          h('div', { class: 'ic' }, pic('dlg-password', 32, 32)),
          h('div', {},
            h('div', { text: 'Windows にログオンするための、ユーザー名とパスワードを入力してください。' }),
            h('div', { class: 'form', style: { marginTop: '12px' } },
              h('label', { html: 'ユーザー名(<u>U</u>):' }), u,
              h('label', { html: 'パスワード(<u>P</u>):' }), p))),
        buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'cancel', label: 'キャンセル', esc: true }]
      }).then(function (r) {
        if (r === 'ok') S.user.name = u.value.trim() || 'ユーザー';
        if (r !== 'ok' || !p.value) { enter(); return; }
        confirmPass(p.value);
      });
    }
    function confirmPass(pw) {
      var c = Field({ type: 'password', w: '172px' });
      c.dataset.autofocus = '1';
      dialog({
        title: 'Windows パスワードの設定', width: 372, sound: false, cls: 'logon', y: 150,
        body: h('div', { class: 'logon-grid' },
          h('div', { class: 'ic' }, pic('dlg-password', 32, 32)),
          h('div', {},
            h('div', { text: '確認のため、新しいパスワードをもう一度入力してください。' }),
            h('div', { class: 'form', style: { marginTop: '12px' } },
              h('label', { html: 'パスワードの確認入力(<u>C</u>):' }), c))),
        buttons: [{ id: 'ok', label: 'OK', def: true }, { id: 'cancel', label: 'キャンセル', esc: true }]
      }).then(function (r) {
        if (r !== 'ok') { ask(); return; }
        if (c.value !== pw) {
          dialog({ title: 'Windows パスワードの設定', icon: 'error', width: 350, body: '入力された 2 つのパスワードが一致しません。<br><br>もう一度入力してください。' })
            .then(function () { confirmPass(pw); });
          return;
        }
        enter();
      });
    }
    function enter() {
      setScreen(h('div', { class: 'screen desk' }));
      wait(500).then(function () { window.__desktop(); });
    }
    wait(700).then(ask);
  }
  window.__logon = logon;
  /* 画面単位での確認用（コンソールから window.__setup.go('options') など） */
  window.__setup = { go: function (id) { hist.length = 0; go(id); }, copying: copying, hardware: hardware, finalize: finalize,
    restart: restartDialog, preparing: function () { preparing(); }, state: S };

  /* =====================================================================
   *  MS-DOS 実モード
   * ===================================================================== */
  function exitScreen() {
    var root = h('div', { class: 'screen dos' });
    add(root, h('div', { class: 'topbar', text: 'Windows Millennium Edition セットアップ' }));
    var wrap = h('div', { class: 'doswrap' }, frag(
      '<div style="margin-top:40px"><span class="wht">セットアップは完了していません。</span>\n\n' +
      'Windows Me はインストールされませんでした。\nコンピュータの構成は変更されていません。\n\n' +
      'セットアップをやり直すには、下のボタンを押してください。</div>'));
    var b = Btn('セットアップを再実行する', { def: true, onClick: function () { boot(); } });
    b.style.marginTop = '26px';
    add(wrap, b);
    add(root, [wrap, h('div', { class: 'botbar' }, h('span', { text: 'ENTER=再実行' }))]);
    setScreen(root);
  }

  function boot() {
    document.body.dataset.power = 'on';
    S.restartCount = 0;
    var root = h('div', { class: 'screen dos' });
    add(root, h('div', { class: 'topbar', text: 'Microsoft Windows Millennium Edition セットアップ' }));
    var wrap = h('div', { class: 'doswrap' });
    add(root, [wrap, h('div', { class: 'botbar' }, h('span', { text: 'ENTER=続行' }), h('span', { text: 'F3=終了' }))]);
    setScreen(root);

    var alive = guard();
    var lines = [
      '', '<span class="wht">Windows Millennium Edition セットアップへようこそ</span>', '',
      'セットアップは、Windows Me をインストールする準備をしています。',
      'まず、ハード ディスクにエラーがないかどうかを調べます。', '',
      'セットアップを続行するには、<span class="yel">Enter</span> キーを押してください。',
      'セットアップを終了するには、<span class="yel">F3</span> キーを押してください。', ''
    ];
    var i = 0;
    (function type() {
      if (!alive()) return;
      if (i >= lines.length) { add(wrap, h('div', { class: 'cur' })); return; }
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

  function scandisk() {
    var root = h('div', { class: 'screen dos' });
    add(root, h('div', { class: 'topbar', text: 'Microsoft ScanDisk' }));
    var st = h('div', { class: 'wht', text: 'ドライブ C: をチェックしています' });
    var meter = h('div', { class: 'meter' });
    var info = h('div', { text: 'ファイル アロケーション テーブル' });
    add(root, [h('div', { class: 'doswrap' },
      frag('<div>セットアップは、ハード ディスクにエラーがないかどうかを確認しています。</div>'),
      frag('<div>&nbsp;</div>'),
      h('div', { class: 'box' }, st, h('div', { html: '&nbsp;' }), info, meter)),
      h('div', { class: 'botbar' }, h('span', { text: 'ESC=中止' }))]);
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
          wait(1300).then(function () { if (alive()) preparing(); });
          return;
        }
        info.textContent = phases[ph];
      }
      snd.drive();
      wait(70).then(tick);
    })();
  }

  /* 青地に「セットアップ ウィザードを準備しています」の進行バー */
  function preparing() {
    S.eta = '30 ～ 60 分';
    setScreen(h('div', { class: 'screen black' }));
    var a0 = guard();
    wait(600).then(function () {
      if (!a0()) return;
      var sh = shell(1, 0, 'ここには、Windows セットアップに関する情報が表示されます。');
      var bar = PBar();
      var win = h('div', { class: 'win s16 prepwin' },
        h('div', { class: 'tbar center' }, h('span', { class: 'ttl', text: TITLE })),
        pic('dlg-setup-w', 34, 34, 'ic'),
        h('div', { class: 'txt', text: 'Windows セットアップ ウィザードを準備しています。ウィザードが残りのセットアップ作業をご案内します。しばらくお待ちください。' }),
        h('div', { class: 'bar' }, bar));
      add(sh.root, win);
      setScreen(sh.root);
      var alive = guard(), p = 0;
      (function tick() {
        if (!alive()) return;
        p += 2 + Math.random() * 5;
        bar.set(p);
        if (Math.random() < 0.5) snd.drive();
        if (p < 100) { wait(160).then(tick); return; }
        wait(500).then(function () { if (alive()) { hist.length = 0; go('welcome'); } });
      })();
    });
  }
})();
