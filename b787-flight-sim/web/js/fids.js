// Flight information display (departures), in the style of Narita Airport's boards: black
// board, white text, yellow times, airline mark + flight number, rows that switch between
// Japanese and English every few seconds, coloured remarks.  One board per airport (home /
// second airport), built live from the AI traffic.
import { logoById, drawLogoIcon } from './livery.js';
import { AIRPORT } from './atc.js';

const CODE = { jal: 'JL', ana: 'NH', spark: 'CL', crane: 'TS', skyline: 'CB', wave: 'PW', fuji: 'FJ', globe: 'GL', plane: 'AS' };
const REM = {
  ontime: ['定刻', 'On Time', 'rOk'], boarding: ['搭乗中', 'Now Boarding', 'rBoard'], final: ['最終案内', 'Final Call', 'rFinal'],
  closed: ['搭乗終了', 'Gate Closed', 'rClosed'], departed: ['出発済', 'Departed', 'rGone'], delayed: ['遅延', 'Delayed', 'rDelay'],
};

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
    this.open = false;
    this._t = 0; this._lang = 0; this._langT = 0;
    this.gone = [];                         // recently departed (kept on the board for a while)
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) { this.tab = b.dataset.tab; this.render(); }
      if (e.target.closest('.fClose')) this.toggle(false);
    });
  }

  toggle(on = !this.open, tab = null) {
    this.open = on;
    if (tab) this.tab = tab;
    this.el.classList.toggle('hidden', !on);
    if (on) this.render();
  }

  // game clock in seconds of the day
  clock() {
    const A = this.app;
    return (A.clockBase ?? (A.world?.tod || 12) * 3600) + (A.traffic?.time || 0);
  }

  // stable schedule per aircraft: rounded to 5 minutes, delayed when it slips
  _sched(ac, estimate) {
    const f = ac.fids || (ac.fids = { sched: Math.ceil(estimate / 300) * 300 });
    f.est = estimate;
    return f;
  }

  _rows(which) {
    const T = this.app.traffic, now = this.clock();
    if (!T) return [];
    const rows = [];
    const add = (ac, gate, dest, state) => {
      const num = (ac.callsign.match(/\d+/) || ['0'])[0];
      const code = CODE[ac.liv.logo] || 'CL';
      let est;
      if (state === 'departed') est = ac.fids?.sched ?? now;
      else if (ac.readyAt != null) est = now + Math.max(0, ac.readyAt - T.time) + 240;
      else if (ac.parkFor != null) est = now + Math.max(0, ac.parkFor - ac.timer) + 60;
      else est = now + 1500;                                      // being turned round
      const f = this._sched(ac, est);
      let rem = state;
      if (state === 'ontime') {
        const left = f.est - now;
        rem = left < 600 ? 'final' : left < 1800 ? 'boarding' : 'ontime';
        if (f.est > f.sched + 300) rem = 'delayed';
      }
      rows.push({ t: f.sched, newT: rem === 'delayed' ? Math.ceil(f.est / 300) * 300 : null, logo: ac.liv.logo, flight: `${code} ${num}`, dest, gate, rem });
    };
    if (which === 'home') {
      const dest = AIRPORT.name2;
      for (const ac of T.aircraft) {
        if (ac.inbound && ac.state !== 'PARKED') continue;
        const st = ac.state;
        if (st === 'PARKED') add(ac, ac.stand.id, dest, 'ontime');
        else if (['TUG', 'REQ_PUSH', 'PUSH_WAIT'].includes(st)) add(ac, ac.stand.id, dest, 'closed');
        else if (['PUSH', 'TAXI_WAIT', 'TAXI_OUT', 'HOLDING', 'LINEUP', 'WAIT_TKOF', 'TAKEOFF'].includes(st)) add(ac, ac.stand?.id ?? '', dest, 'departed');
      }
    } else {
      const dest = AIRPORT.name;
      for (const ac of T.remote || []) {
        const st = ac.state;
        if (st === 'R_PARK') add(ac, ac.a2?.id ?? '', dest, 'ontime');
        else if (['R_PUSH', 'R_TAXIOUT', 'R_TKOF'].includes(st)) add(ac, ac.a2?.id ?? ac.fids?.gate ?? '', dest, 'departed');
        if (ac.a2) (ac.fids || (ac.fids = {})).gate = ac.a2.id;
      }
    }
    rows.sort((a, b) => a.t - b.t);
    return rows.slice(0, 12);
  }

  update(dt) {
    if (!this.open) return;
    this._t += dt; this._langT += dt;
    if (this._langT > 5) { this._langT = 0; this._lang ^= 1; this._t = 1; }
    if (this._t >= 1) { this._t = 0; this.render(); }
  }

  render() {
    const home = this.tab === 'home';
    const name = home ? AIRPORT.name : AIRPORT.name2;
    const en = this._lang === 1;
    const rows = this._rows(this.tab);
    const H = en ? ['Time', 'Destination', 'Flight', 'Gate', 'Remarks'] : ['時刻', '行先', '便名', '搭乗口', '備考'];
    const body = rows.map((r) => {
      const R = REM[r.rem];
      const time = r.newT ? `<s>${hhmm(r.t)}</s><b class="fNew">${hhmm(r.newT)}</b>` : hhmm(r.t);
      return `<tr><td class="fTime">${time}</td><td class="fDest">${esc(r.dest)}</td>
        <td class="fFlt"><img src="${logoIcon(r.logo)}" alt="">${esc(r.flight)}</td>
        <td class="fGate">${esc(r.gate)}</td><td class="fRem ${R[2]}">${en ? R[1] : R[0]}</td></tr>`;
    }).join('') || `<tr><td colspan="5" class="fEmpty">${en ? 'No departures scheduled' : '出発予定の便はありません'}</td></tr>`;
    this.el.innerHTML = `
      <div class="fHead">
        <span class="fPlane">✈</span><span class="fTitle">${en ? 'Departures' : '出発'}</span>
        <span class="fApt">${esc(name)}${en ? ' Airport' : ' 空港'}</span>
        <span class="fClock">${hhmm(this.clock())}</span>
        <button class="fClose" title="Close">✕</button>
      </div>
      <div class="fTabs"><button data-tab="home" class="${home ? 'sel' : ''}">${esc(AIRPORT.name)}</button><button data-tab="a2" class="${home ? '' : 'sel'}">${esc(AIRPORT.name2)}</button></div>
      <table><thead><tr>${H.map((h, i) => `<th class="h${i}">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
      <div class="fFoot">${en ? 'Shift+D: close · Please check the boarding gate on your ticket.' : 'Shift+D で閉じる ・ ご搭乗口は搭乗券でもご確認ください'}</div>`;
  }
}
