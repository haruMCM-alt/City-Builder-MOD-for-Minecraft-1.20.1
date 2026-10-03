// Flight information display (departures and arrivals), in the style of Narita / Haneda
// boards: black board, white text, yellow times, airline mark + flight number, rows that
// switch between Japanese and English every few seconds, coloured remarks.  One board per
// airport, built live from the AI traffic.
import { logoById, drawLogoIcon } from './livery.js';
import { AIRPORT, aptName } from './atc.js';
import { REMOTES } from './airports.js';

const REM = {
  ontime: ['定刻', 'On Time', 'rOk'], boarding: ['搭乗中', 'Now Boarding', 'rBoard'], final: ['最終案内', 'Final Call', 'rFinal'],
  closed: ['搭乗終了', 'Gate Closed', 'rClosed'], departed: ['出発済', 'Departed', 'rGone'], delayed: ['遅延', 'Delayed', 'rDelay'],
  soon: ['まもなく到着', 'Approaching', 'rBoard'], landed: ['着陸', 'Landed', 'rFinal'], arrived: ['到着済', 'Arrived', 'rGone'],
};
const CRUISE = 230;                     // m/s, for the arrival estimates of flights en route

const iconCache = new Map();
function logoIcon(id) {
  if (!iconCache.has(id)) {
    const c = document.createElement('canvas'); c.width = c.height = 44;
    drawLogoIcon(c, logoById(id));
    iconCache.set(id, c.toDataURL());
  }
  return iconCache.get(id);
}
const hhmm = (sec) => { const m = Math.floor(((sec / 60) % 1440 + 1440) % 1440); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class FIDS {
  constructor(app, el) {
    this.app = app; this.el = el;
    this.tab = 'home';
    this.kind = 'dep';                      // 'dep' departures / 'arr' arrivals
    this.open = false;
    this._t = 0; this._lang = 0; this._langT = 0;
    this.gone = [];                         // recently departed (kept on the board for a while)
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) { this.tab = b.dataset.tab; this.render(); }
      const k = e.target.closest('[data-kind]');
      if (k) { this.kind = k.dataset.kind; this.render(); }
      if (e.target.closest('.fClose')) this.toggle(false);
    });
  }

  toggle(on = !this.open, tab = null, kind = null) {
    this.open = on;
    if (tab) this.tab = tab;
    if (kind) this.kind = kind;
    this.el.classList.toggle('hidden', !on);
    if (on) this.render();
  }

  // game clock in seconds of the day
  clock() {
    const A = this.app;
    return (A.clockBase ?? (A.world?.tod || 12) * 3600) + (A.traffic?.time || 0);
  }

  // stable schedule per aircraft: on 5-minute slots, one departure per slot and board
  // (like a real timetable); shown as delayed when the estimate slips past it
  _sched(ac, estimate, which, key = 'fids') {
    let f = ac[key];
    // a new schedule for a new visit (other board, or an old slot long gone)
    if (!f || f.board !== which || f.sched == null || f.sched < estimate - 3600) {
      const lk = key + which, last = (this._last ||= {})[lk] ?? -1e9;
      const slot = Math.max(Math.ceil(estimate / 300) * 300, last + 300);
      this._last[lk] = slot;
      f = ac[key] = { ...(f || {}), sched: slot, board: which };
    }
    f.est = estimate;
    return f;
  }

  _rows(which) {
    const T = this.app.traffic, now = this.clock();
    if (!T) return [];
    const rows = [], pending = [];
    // schedule new flights in order of their estimated departure
    const add = (ac, gate, dest, state) => pending.push([ac, gate, dest, state, this._estimate(ac, state, now, T)]);
    const addNow = (ac, gate, dest, state, est) => {
      const num = (ac.callsign.match(/\d+/) || ['0'])[0];
      const code = logoById(ac.liv.logo).code || 'JL';
      const f = this._sched(ac, est, which);
      let rem = state;
      if (state === 'ontime') {
        const left = f.sched - now;
        rem = left < 600 ? 'final' : left < 1800 ? 'boarding' : 'ontime';
        if (f.est > f.sched + 300) rem = 'delayed';
      }
      rows.push({ t: f.sched, newT: rem === 'delayed' ? Math.ceil(f.est / 300) * 300 : null, logo: ac.liv.logo, flight: `${code} ${num}`, dest, gate, rem });
    };
    if (which === 'home') {
      for (const ac of T.aircraft) {
        if (ac.inbound && ac.state !== 'PARKED') continue;
        const st = ac.state;
        const dest = aptName(T.destOf(ac).id);
        if (st === 'PARKED') add(ac, ac.stand.id, dest, 'ontime');
        else if (['TUG', 'REQ_PUSH', 'PUSH_WAIT'].includes(st)) add(ac, ac.stand.id, dest, 'closed');
        else if (['PUSH', 'TAXI_WAIT', 'TAXI_OUT', 'HOLDING', 'LINEUP', 'WAIT_TKOF', 'TAKEOFF'].includes(st)) add(ac, ac.stand?.id ?? '', dest, 'departed');
      }
    } else {
      const dest = AIRPORT.name;
      for (const ac of T.remote || []) {
        if (ac.rap?.id !== +which) continue;
        const st = ac.state;
        if (st === 'R_PARK') add(ac, ac.a2?.id ?? '', dest, 'ontime');
        else if (['R_PUSH', 'R_TAXIOUT', 'R_TKOF'].includes(st)) add(ac, ac.a2?.id ?? ac.fids?.gate ?? '', dest, 'departed');
        if (ac.a2) (ac.fids || (ac.fids = {})).gate = ac.a2.id;
      }
    }
    pending.sort((a, b) => a[4] - b[4]);
    for (const p of pending) addNow(...p);
    rows.sort((a, b) => a.t - b.t);
    return rows.slice(0, 12);
  }

  // arrivals: flights en route (time from the remaining route), on approach, landed, parked
  _arrRows(which) {
    const T = this.app.traffic, now = this.clock();
    if (!T) return [];
    const rows = [], pending = [];
    const left = (ac) => {
      const r = ac.route;
      const rem = r && r.path ? Math.max(0, (r.path.length ?? r.path.len ?? 0) - (r.s || 0)) : 60000;
      return rem / Math.max(ac.v || 0, CRUISE * 0.6);
    };
    const add = (ac, from, gate, rem, est) => pending.push([ac, from, gate, rem, est]);
    if (which === 'home') {
      for (const ac of T.remote || []) {
        if (ac.state === 'R_BACK') add(ac, aptName(ac.rap.id), '', 'ontime', now + left(ac) + 360);
      }
      for (const ac of T.aircraft) {
        const from = aptName((ac.fromAp ||= T._weighted(REMOTES)).id);
        if (ac.inbound && ['AIR', 'RETURN'].includes(ac.state)) add(ac, from, ac.stand?.id ?? '', 'soon', now + 240);
        else if (ac.inbound && ['ROLLOUT', 'TAXI_IN'].includes(ac.state)) add(ac, from, ac.stand?.id ?? '', 'landed', ac.fidsA?.sched ?? now);
        else if (ac.state === 'PARKED' && ac.arrivedAt != null && T.time - ac.arrivedAt < 900) add(ac, from, ac.stand?.id ?? '', 'arrived', ac.fidsA?.sched ?? now - 60);
      }
    } else {
      const from = AIRPORT.name;
      for (const ac of T.remote || []) {
        if (ac.rap?.id !== +which) continue;
        if (ac.state === 'R_OUT') add(ac, from, ac.a2?.id ?? '', left(ac) < 300 ? 'soon' : 'ontime', now + left(ac) + 240);
        else if (ac.state === 'R_TAXI') add(ac, from, ac.a2?.id ?? '', 'landed', ac.fidsA?.sched ?? now);
        else if (ac.state === 'R_PARK' && ac.arrivedAt != null && T.time - ac.arrivedAt < 900) add(ac, from, ac.a2?.id ?? '', 'arrived', ac.fidsA?.sched ?? now - 60);
      }
    }
    pending.sort((a, b) => a[4] - b[4]);
    for (const [ac, from, gate, rem, est] of pending) {
      const num = (ac.callsign.match(/\d+/) || ['0'])[0];
      const code = logoById(ac.liv.logo).code || 'JL';
      const f = this._sched(ac, est, which, 'fidsA');
      let r = rem;
      if (rem === 'ontime' && f.est > f.sched + 300) r = 'delayed';
      rows.push({ t: f.sched, newT: r === 'delayed' ? Math.ceil(f.est / 300) * 300 : null, logo: ac.liv.logo, flight: `${code} ${num}`, dest: from, gate, rem: r });
    }
    rows.sort((a, b) => a.t - b.t);
    return rows.slice(0, 12);
  }

  _estimate(ac, state, now, T) {
    if (state === 'departed') return ac.fids?.sched ?? now;
    if (ac.readyAt != null) return now + Math.max(0, ac.readyAt - T.time) + 240;
    if (ac.parkFor != null) return now + Math.max(0, ac.parkFor - ac.timer) + 60;
    return now + 1500;                                            // being turned round
  }

  update(dt) {
    if (!this.open) return;
    this._t += dt; this._langT += dt;
    if (this._langT > 5) { this._langT = 0; this._lang ^= 1; this._t = 1; }
    if (this._t >= 1) { this._t = 0; this.render(); }
  }

  render() {
    const home = this.tab === 'home';
    const name = home ? AIRPORT.name : aptName(+this.tab);
    const en = this._lang === 1, arr = this.kind === 'arr';
    const rows = arr ? this._arrRows(this.tab) : this._rows(this.tab);
    const H = arr ? (en ? ['Time', 'From', 'Flight', 'Gate', 'Remarks'] : ['時刻', '出発地', '便名', '到着口', '備考'])
      : (en ? ['Time', 'Destination', 'Flight', 'Gate', 'Remarks'] : ['時刻', '行先', '便名', '搭乗口', '備考']);
    const body = rows.map((r) => {
      const R = REM[r.rem];
      const time = r.newT ? `<s>${hhmm(r.t)}</s><b class="fNew">${hhmm(r.newT)}</b>` : hhmm(r.t);
      return `<tr><td class="fTime">${time}</td><td class="fDest">${esc(r.dest)}</td>
        <td class="fFlt"><img src="${logoIcon(r.logo)}" alt="">${esc(r.flight)}</td>
        <td class="fGate">${esc(r.gate)}</td><td class="fRem ${R[2]}">${en ? R[1] : R[0]}</td></tr>`;
    }).join('') || `<tr><td colspan="5" class="fEmpty">${arr ? (en ? 'No arrivals scheduled' : '到着予定の便はありません') : (en ? 'No departures scheduled' : '出発予定の便はありません')}</td></tr>`;
    this.el.innerHTML = `
      <div class="fHead">
        <span class="fPlane${arr ? ' fArr' : ''}">✈</span><span class="fTitle">${arr ? (en ? 'Arrivals' : '到着') : (en ? 'Departures' : '出発')}</span>
        <span class="fKinds"><button data-kind="dep" class="${arr ? '' : 'sel'}">出発 Departures</button><button data-kind="arr" class="${arr ? 'sel' : ''}">到着 Arrivals</button></span>
        <span class="fApt">${esc(name)}${en ? ' Airport' : ' 空港'}</span>
        <span class="fClock">${hhmm(this.clock())}</span>
        <button class="fClose" title="Close">✕</button>
      </div>
      <div class="fTabs"><button data-tab="home" class="${home ? 'sel' : ''}">${esc(AIRPORT.name)}</button>${REMOTES.map((ap) => `<button data-tab="${ap.id}" class="${this.tab === String(ap.id) ? 'sel' : ''}">${esc(aptName(ap.id))}</button>`).join('')}</div>
      <table><thead><tr>${H.map((h, i) => `<th class="h${i}">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
      <div class="fFoot">${arr ? (en ? 'Shift+A: close · Shift+D: departures' : 'Shift+A で閉じる ・ Shift+D で出発案内') : (en ? 'Shift+D: close · Shift+A: arrivals · Please check the boarding gate on your ticket.' : 'Shift+D で閉じる ・ Shift+A で到着案内 ・ ご搭乗口は搭乗券でもご確認ください')}</div>`;
  }
}
