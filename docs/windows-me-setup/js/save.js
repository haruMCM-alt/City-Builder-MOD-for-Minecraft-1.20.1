/* =========================================================================
 * save.js : セーブ（localStorage）と仮想ファイル システム
 *
 * 1 度セットアップを終えると、インストール済みの状態・設定・C ドライブの
 * ファイル・ごみ箱・復元ポイントなどをこのブラウザに保存する。
 * 保存先は閲覧しているブラウザだけ。プライベート ウィンドウなどで保存できない
 * 場合でも動作はする（その回限りになる）。
 * ========================================================================= */
(function () {
  'use strict';

  var KEY = 'winme-save-v1', PREF = 'winme-pref-v1';
  function read(k) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function remove(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------ 設定 */
  var prefs = read(PREF) || {};
  var Pref = {
    get: function (k, d) { return prefs[k] === undefined ? d : prefs[k]; },
    set: function (k, v) { prefs[k] = v; write(PREF, prefs); }
  };

  /* -------------------------------------------------- 既定のファイル構成 */
  var T0 = new Date(2000, 9, 14, 9, 18).getTime();      /* 2000/10/14 9:18 */
  function F(n, d, sz, m) { return { t: 'f', n: n, d: d == null ? '' : d, sz: sz, m: m || T0 }; }
  function Dir(n, c, m) { return { t: 'd', n: n, c: c || [], m: m || T0 }; }

  var README =
    'Windows Me へようこそ\r\n' +
    '====================\r\n\r\n' +
    'このコンピュータは、Windows Millennium Edition のセットアップを再現した\r\n' +
    '非公式のファンメイド作品です。実際のコンピュータには何も変更を加えません。\r\n\r\n' +
    '実際に使えるもの\r\n' +
    '  ・エクスプローラ (フォルダの作成、名前の変更、削除、ごみ箱)\r\n' +
    '  ・メモ帳 / ペイント (C ドライブに保存できます)\r\n' +
    '  ・電卓 / マインスイーパ\r\n' +
    '  ・Internet Explorer (Google 検索、Google マップ、Wikipedia)\r\n' +
    '  ・Windows Media Player / システムの復元 / 検索 / ヘルプ\r\n' +
    '  ・MS-DOS プロンプト (DIR, CD, TYPE, MD, DEL など)\r\n\r\n' +
    'ファイルや設定は、このブラウザに自動的に保存されます。\r\n' +
    '次に開いたときは、パッケージをクリックするとそのまま起動します。\r\n';

  var WININI = '[windows]\r\nload=\r\nrun=\r\nNullPort=None\r\n\r\n[Desktop]\r\nWallpaper=(なし)\r\nTileWallpaper=0\r\n\r\n[intl]\r\niCountry=81\r\nsCountry=Japan\r\n';
  var SYSINI = '[boot]\r\nshell=Explorer.exe\r\nsystem.drv=system.drv\r\ndrivers=mmsystem.dll power.drv\r\n\r\n[386Enh]\r\nebios=*ebios\r\nwoafont=dosapp.fon\r\n';

  function defaultC() {
    return Dir('C:', [
      Dir('My Documents', [
        Dir('My Pictures', []),
        Dir('My Music', []),
        F('ようこそ.txt', README)
      ]),
      Dir('Program Files', [
        Dir('Accessories', [F('MSPAINT.EXE', 'app:paint', 344064), F('WORDPAD.EXE', 'app:wordpad', 204800)]),
        Dir('Internet Explorer', [F('IEXPLORE.EXE', 'app:ie', 60688)]),
        Dir('Outlook Express', [F('MSIMN.EXE', 'app:oe', 53312)]),
        Dir('Windows Media Player', [F('WMPLAYER.EXE', 'app:wmp', 167936)])
      ]),
      Dir('WINDOWS', [
        Dir('Desktop', []),
        Dir('Media', [
          F('The Microsoft Sound.wav', 'snd:startup', 486240), F('LOGOFF.WAV', 'snd:logoff', 344160),
          F('CHORD.WAV', 'snd:chord', 97016), F('DING.WAV', 'snd:ding', 80856),
          F('START.WAV', 'snd:start', 1192), F('RECYCLE.WAV', 'snd:recycle', 25434), F('TADA.WAV', 'snd:tada', 171100)
        ]),
        Dir('SYSTEM', [Dir('Restore', [F('RSTRUI.EXE', 'app:restore', 172032)])]),
        F('CALC.EXE', 'app:calc', 94208), F('COMMAND.COM', 'app:prompt', 93880),
        F('EXPLORER.EXE', 'app:explorer', 191536), F('NOTEPAD.EXE', 'app:notepad', 53248),
        F('WINMINE.EXE', 'app:mines', 24576), F('HELP.EXE', 'app:help', 20480),
        F('WIN.INI', WININI), F('SYSTEM.INI', SYSINI)
      ]),
      F('AUTOEXEC.BAT', ''), F('CONFIG.SYS', ''), F('COMMAND.COM', 'app:prompt', 93880)
    ]);
  }
  function defaultD() {
    return Dir('D:', [
      Dir('WIN9X', [
        F('BASE4.CAB', 'cab', 6602462), F('BASE5.CAB', 'cab', 2389513), F('NET7.CAB', 'cab', 1780335),
        F('PRECOPY1.CAB', 'cab', 1180347), F('WIN_10.CAB', 'cab', 4031225), F('SETUP.EXE', 'app:setup', 5632)
      ]),
      F('AUTORUN.INF', '[autorun]\r\nopen=SETUP.EXE\r\nicon=SETUP.EXE,0\r\n'),
      F('SETUP.EXE', 'app:setup', 5632),
      F('README.TXT', 'Microsoft Windows Millennium Edition CD-ROM\r\n\r\nセットアップを開始するには、SETUP.EXE を実行してください。\r\n')
    ]);
  }

  /* ------------------------------------------------------------ 状態 */
  var data = read(KEY);
  var FS = { drives: [] };
  function rebuild() {
    FS.drives = [data && data.fs && data.fs.C ? data.fs.C : defaultC(), defaultD()];
    FS.drives[1].ro = true;
  }
  if (!data || data.v !== 1) data = null;
  rebuild();

  var state = data || {
    v: 1, installed: false, S: null,
    desk: { wall: 0, vol: 0.8, mute: false, clock: true },
    recycle: [], recent: [], restore: [], mines: {}, boots: 0
  };

  var saveFailed = false, timer = 0;
  function commit() {
    clearTimeout(timer); timer = 0;
    if (!state.installed) return true;
    state.fs = { C: FS.drives[0] };
    state.savedAt = Date.now();
    var ok = write(KEY, state);
    if (!ok && !saveFailed) {
      saveFailed = true;
      if (window.__onSaveFail) window.__onSaveFail();
    }
    return ok;
  }
  function schedule() { if (!timer) timer = setTimeout(commit, 400); }
  window.addEventListener('pagehide', commit);
  window.addEventListener('beforeunload', commit);

  var Save = {
    installed: function () { return !!state.installed; },
    state: state,
    savedAt: function () { return state.savedAt || 0; },
    commit: commit,
    schedule: schedule,
    markInstalled: function (S) {
      var s = clone(S); delete s.restartCount;
      state.S = s;
      if (!state.installed) {
        state.installed = true;
        state.installedAt = Date.now();
        Save.restore.create('システム チェックポイント', true);
      }
      commit();
    },
    applyTo: function (S) { if (state.S) Object.keys(state.S).forEach(function (k) { S[k] = state.S[k]; }); },
    reset: function () {
      remove(KEY);
      state.installed = false; state.S = null; state.recycle = []; state.recent = []; state.restore = [];
      state.mines = {}; state.desk = { wall: 0, vol: 0.8, mute: false, clock: true }; state.boots = 0;
      delete state.fs; delete state.savedAt;
      data = null; rebuild(); emit();
    },
    recent: {
      add: function (p) {
        state.recent = [p].concat(state.recent.filter(function (x) { return x.toLowerCase() !== p.toLowerCase(); })).slice(0, 10);
        schedule();
      },
      list: function () { return state.recent.filter(function (p) { return !!VFS.get(p); }); }
    },
    restore: {
      list: function () { return state.restore.slice().reverse(); },
      create: function (name, system) {
        state.restore.push({ id: Date.now(), name: name, system: !!system, at: Date.now(), C: clone(FS.drives[0]), desk: clone(state.desk) });
        while (state.restore.length > 4) state.restore.shift();
        schedule();
      },
      /* システムの復元はユーザーのデータ (My Documents) には手を付けない */
      apply: function (id) {
        var rp = state.restore.filter(function (r) { return r.id === id; })[0];
        if (!rp) return false;
        var C = clone(rp.C);
        var cur = find(FS.drives[0], 'My Documents');
        var i = C.c.findIndex(function (n) { return n.n.toLowerCase() === 'my documents'; });
        if (cur) { if (i >= 0) C.c[i] = clone(cur); else C.c.unshift(clone(cur)); }
        FS.drives[0] = C;
        state.desk = clone(rp.desk);
        state.lastRestore = { name: rp.name, at: rp.at };
        emit(); commit();
        return true;
      }
    },
    pref: Pref
  };

  /* =================================================================
   *  仮想ファイル システム
   * ================================================================= */
  var listeners = [];
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); schedule(); }
  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function find(dir, name) {
    var l = name.toLowerCase();
    for (var i = 0; i < dir.c.length; i++) if (dir.c[i].n.toLowerCase() === l) return dir.c[i];
    return null;
  }
  function norm(p) {
    p = String(p || '').trim().replace(/\//g, '\\').replace(/\\+/g, '\\');
    if (/^[a-z]:/i.test(p)) p = p[0].toUpperCase() + p.slice(1);
    return p.replace(/\\$/, '');
  }
  function parts(p) { return norm(p).split('\\').filter(Boolean); }
  function drive(letter) {
    for (var i = 0; i < FS.drives.length; i++) if (FS.drives[i].n === letter) return FS.drives[i];
    return null;
  }

  var VFS = {
    norm: norm,
    disp: function (p) { p = norm(p); return /^[A-Z]:$/.test(p) ? p + '\\' : p; },
    join: function (dir, name) { return norm(dir) + '\\' + name; },
    parent: function (p) { var a = parts(p); a.pop(); return a.join('\\') || null; },
    base: function (p) { var a = parts(p); return a[a.length - 1] || ''; },
    ext: function (n) { var m = /\.([^.\\]+)$/.exec(n || ''); return m ? m[1].toLowerCase() : ''; },
    isRoot: function (p) { return /^[A-Z]:$/.test(norm(p)); },
    get: function (p) {
      var a = parts(p);
      if (!a.length) return null;
      var cur = drive(a[0].toUpperCase());
      for (var i = 1; cur && i < a.length; i++) cur = cur.t === 'd' ? find(cur, a[i]) : null;
      return cur || null;
    },
    /* 大文字小文字を実際の名前にそろえたパス */
    real: function (p) {
      var a = parts(p), cur = drive((a[0] || '').toUpperCase()), out = [];
      if (!cur) return null;
      out.push(cur.n);
      for (var i = 1; i < a.length; i++) { cur = cur.t === 'd' ? find(cur, a[i]) : null; if (!cur) return null; out.push(cur.n); }
      return out.join('\\');
    },
    list: function (p) {
      var d = VFS.get(p);
      if (!d || d.t !== 'd') return null;
      return d.c.slice().sort(function (a, b) {
        if (a.t !== b.t) return a.t === 'd' ? -1 : 1;
        return a.n.localeCompare(b.n, 'ja');
      });
    },
    readonly: function (p) { var d = drive(parts(p)[0]); return !!(d && d.ro); },
    size: function (n) {
      if (!n) return 0;
      if (n.t === 'd') return n.c.reduce(function (s, c) { return s + VFS.size(c); }, 0);
      if (n.sz) return n.sz;
      var d = n.d || '';
      return /^data:/.test(d) ? Math.round((d.length - d.indexOf(',') - 1) * 0.75) : new Blob([d]).size;
    },
    validName: function (n) { return !!n && n.length <= 200 && !/[\\/:*?"<>|]/.test(n) && n.trim() === n && !/^\.+$/.test(n); },
    unique: function (dir, base, ext) {
      var d = VFS.get(dir); var nm = base + (ext ? '.' + ext : ''), i = 2;
      while (d && find(d, nm)) { nm = base + ' (' + i + ')' + (ext ? '.' + ext : ''); i++; }
      return nm;
    },
    write: function (p, content) {
      if (VFS.readonly(p)) throw err('RO', 'ディスクは書き込み禁止になっています。');
      var dir = VFS.get(VFS.parent(p)), name = VFS.base(p);
      if (!dir || dir.t !== 'd') throw err('NOPATH', 'パスが見つかりません。');
      if (!VFS.validName(name)) throw err('NAME', 'ファイル名に次の文字は使えません:\n\\ / : * ? " < > |');
      var f = find(dir, name);
      if (f && f.t === 'd') throw err('EXISTS', '同じ名前のフォルダがあります。');
      if (!f) { f = { t: 'f', n: name }; dir.c.push(f); }
      f.d = content; delete f.sz; f.m = Date.now(); dir.m = f.m;
      emit();
      return f;
    },
    mkdir: function (p) {
      if (VFS.readonly(p)) throw err('RO', 'ディスクは書き込み禁止になっています。');
      var dir = VFS.get(VFS.parent(p)), name = VFS.base(p);
      if (!dir || dir.t !== 'd') throw err('NOPATH', 'パスが見つかりません。');
      if (!VFS.validName(name)) throw err('NAME', 'フォルダ名に次の文字は使えません:\n\\ / : * ? " < > |');
      if (find(dir, name)) throw err('EXISTS', '同じ名前のファイルまたはフォルダがあります。');
      var n = Dir(name, [], Date.now()); dir.c.push(n); emit();
      return n;
    },
    rename: function (p, name) {
      if (VFS.readonly(p)) throw err('RO', 'ディスクは書き込み禁止になっています。');
      var dir = VFS.get(VFS.parent(p)), n = VFS.get(p);
      if (!n || !dir) throw err('NOPATH', 'ファイルが見つかりません。');
      if (!VFS.validName(name)) throw err('NAME', 'ファイル名には次の文字は使えません:\n\\ / : * ? " < > |');
      var o = find(dir, name);
      if (o && o !== n) throw err('EXISTS', '指定されたファイル名は既に存在します。別の名前を指定してください。');
      n.n = name; emit();
    },
    /* 削除はごみ箱へ移動する（rm=true で完全に削除） */
    remove: function (p, rm) {
      if (VFS.readonly(p)) throw err('RO', 'ディスクは書き込み禁止になっています。');
      if (VFS.isRoot(p)) throw err('ROOT', 'ドライブは削除できません。');
      var dir = VFS.get(VFS.parent(p)), n = VFS.get(p);
      if (!n || !dir) throw err('NOPATH', 'ファイルが見つかりません。');
      dir.c.splice(dir.c.indexOf(n), 1);
      if (!rm) state.recycle.push({ node: n, from: VFS.real(VFS.parent(p)) || VFS.parent(p), at: Date.now() });
      emit();
    },
    copy: function (src, dstDir, name) {
      var n = VFS.get(src), d = VFS.get(dstDir);
      if (!n || !d || d.t !== 'd') throw err('NOPATH', 'パスが見つかりません。');
      if (VFS.readonly(dstDir)) throw err('RO', 'ディスクは書き込み禁止になっています。');
      var c = clone(n);
      c.n = name || (find(d, n.n) ? VFS.unique(dstDir, n.n.replace(/\.[^.]+$/, '') + ' のコピー', VFS.ext(n.n)) : n.n);
      d.c.push(c); emit();
      return c;
    },
    recycle: {
      list: function () { return state.recycle; },
      restore: function (i) {
        var r = state.recycle[i]; if (!r) return;
        var dir = VFS.get(r.from);
        if (!dir) { dir = drive('C:'); r.from = 'C:'; }
        r.node.n = find(dir, r.node.n) ? VFS.unique(r.from, r.node.n.replace(/\.[^.]+$/, ''), VFS.ext(r.node.n)) : r.node.n;
        dir.c.push(r.node);
        state.recycle.splice(i, 1);
        emit();
      },
      empty: function () { state.recycle.length = 0; emit(); },
      purge: function (i) { state.recycle.splice(i, 1); emit(); }
    },
    search: function (root, term) {
      var out = [], t = term.toLowerCase().replace(/\*/g, '');
      (function walk(p, n) {
        if (n.t === 'd') n.c.forEach(function (c) {
          var cp = p + '\\' + c.n;
          if (!t || c.n.toLowerCase().indexOf(t) >= 0) out.push(cp);
          walk(cp, c);
        });
      })(norm(root), VFS.get(root) || { t: 'f' });
      return out;
    },
    on: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
  };

  window.__Save = Save;
  window.__VFS = VFS;
})();
