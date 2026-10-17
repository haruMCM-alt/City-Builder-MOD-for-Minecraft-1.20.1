// In-car announcements.
//
// The recording itself is NOT part of this repository (it is someone else's work and
// its creator asks to be contacted before reuse). The player loads it from:
//   1. a file the user picks in the menu, or
//   2. assets/audio/utsunomiya_announce.m4a if the user placed it there locally.
// Cue points (seconds into that recording) are in announce-cues.js.
// Without the file, a synthetic voice (speechSynthesis) reads equivalent text.

import { CUES, EXPECTED_DURATION } from './announce-cues.js';

export const LOCAL_AUDIO_URL = 'assets/audio/utsunomiya_announce.m4a';

export class Announcer {
  constructor(sound) {
    this.sound = sound;
    this.mode = 'tts'; // 'file' | 'tts' | 'off'
    this.audio = null;
    this.srcNode = null;
    this.current = null; // { id, end }
    this.fileName = '';
    this.paused = false;
  }

  async tryLocal() {
    try {
      const r = await fetch(LOCAL_AUDIO_URL, { method: 'HEAD' });
      if (!r.ok) return false;
      await this.setSource(LOCAL_AUDIO_URL, 'assets/audio/utsunomiya_announce.m4a');
      return true;
    } catch { return false; }
  }

  loadFile(file) {
    const url = URL.createObjectURL(file);
    this.loading = this.setSource(url, file.name).finally(() => { this.loading = null; });
    return this.loading;
  }

  setSource(url, name) {
    return new Promise((resolve, reject) => {
      const a = new Audio();
      a.preload = 'auto';
      a.src = url;
      const ok = () => {
        cleanup();
        this.audio = a;
        this.fileName = name;
        this.mode = 'file';
        this.durationWarning = Math.abs(a.duration - EXPECTED_DURATION) > 5;
        this.srcNode = null;
        resolve();
      };
      const bad = () => { cleanup(); reject(new Error('この音声ファイルを再生できませんでした。Chrome・Edge・Safari で開くか、mp3 に変換したファイルを選んでください。')); };
      const cleanup = () => { a.removeEventListener('loadedmetadata', ok); a.removeEventListener('error', bad); };
      a.addEventListener('loadedmetadata', ok);
      a.addEventListener('error', bad);
    });
  }

  /** route the <audio> element through the Web Audio graph (after the context exists) */
  attach() {
    if (!this.audio || this.srcNode || !this.sound.ctx) return;
    try {
      this.srcNode = this.sound.ctx.createMediaElementSource(this.audio);
      this.srcNode.connect(this.sound.annBus);
    } catch (e) {
      console.warn('announcement routing failed; playing directly', e);
    }
  }

  has(id) {
    if (this.mode === 'off') return false;
    if (this.mode === 'file') return !!CUES[id];
    return true;
  }

  /** play the cue `id`; ctx = { station, door } for the TTS fallback */
  play(id, ctx = {}) {
    if (this.mode === 'off') return 0;
    this.stop(true);
    if (this.mode === 'file' && this.audio) {
      const c = CUES[id];
      if (!c) return 0;
      this.attach();
      this.audio.currentTime = c[0];
      this.audio.volume = 1;
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => {});
      this.current = { id, end: c[1] };
      return c[1] - c[0];
    }
    if (this.mode === 'tts' && 'speechSynthesis' in window) {
      const text = ttsText(id, ctx);
      if (!text) return 0;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP'; u.rate = 0.95; u.pitch = 1.1;
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith('ja'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
      this.current = { id, end: Infinity, tts: true };
      return text.length * 0.17;
    }
    return 0;
  }

  stop(quick = false) {
    if (this.audio && !this.audio.paused) {
      if (quick) this.audio.pause();
      else this.fadeOut();
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.current = null;
  }

  fadeOut() {
    const a = this.audio;
    let v = a.volume;
    const iv = setInterval(() => {
      v -= 0.1;
      if (v <= 0) { a.pause(); a.volume = 1; clearInterval(iv); } else a.volume = v;
    }, 40);
  }

  get playing() {
    if (!this.current) return false;
    if (this.current.tts) return speechSynthesis.speaking;
    return this.audio && !this.audio.paused;
  }

  setPaused(p) {
    this.paused = p;
    if (this.mode === 'file' && this.audio && this.current) {
      if (p) this.audio.pause(); else this.audio.play().catch(() => {});
    } else if (this.mode === 'tts' && 'speechSynthesis' in window) {
      if (p) speechSynthesis.pause(); else speechSynthesis.resume();
    }
  }

  /** call every frame: stops the clip at its end point */
  update() {
    if (this.current && !this.current.tts && this.audio && !this.paused) {
      if (this.audio.currentTime >= this.current.end) {
        this.audio.pause();
        this.current = null;
      }
    }
  }
}

function ttsText(id, ctx) {
  const st = ctx.station;
  const side = ctx.door === 'right' ? '右' : '左';
  if (id === 'intro') return 'この電車は、宇都宮線、普通、宇都宮行きです。まもなく発車いたします。';
  if (!st) return '';
  if (id.startsWith('dep:')) {
    const term = ctx.terminal ? '終点、' : '';
    return `今日も、JR東日本をご利用くださいまして、ありがとうございます。この電車は、宇都宮線、普通、宇都宮行きです。次は、${term}${st.name}、${st.name}です。`;
  }
  if (id.startsWith('arr:')) {
    const term = ctx.terminal ? '終点、' : '';
    return `まもなく、${term}${st.name}、${st.name}。お出口は、${side}側です。`;
  }
  return '';
}
