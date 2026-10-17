// Clip playback from long user-supplied recordings.
//
// The in-car announcement recording ships with the game (assets/sounds/, added at the
// project owner's request; credit: ひごくま / Higokuma). The departure-melody recording
// is loaded from a file the user picks, or assets/audio/utsunomiya_melody.m4a (gitignored).
// Cue points (seconds into each recording) are in announce-cues.js / melody-cues.js.

import { CUES, EXPECTED_DURATION } from './announce-cues.js';

export const LOCAL_AUDIO_URL = 'assets/sounds/utsunomiya_announce.mp3';
export const LOCAL_MELODY_URL = 'assets/audio/utsunomiya_melody.m4a';

/** plays [start, end] segments of one long audio file through a Web Audio bus */
export class ClipPlayer {
  constructor(sound, busName, expected) {
    this.sound = sound;
    this.busName = busName;
    this.expected = expected;
    this.audio = null;
    this.srcNode = null;
    this.current = null; // { id, end }
    this.fileName = '';
    this.paused = false;
    this.loading = null;
  }

  async tryLocal(url) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (!r.ok) return false;
      await this.setSource(url, url.split('/').pop());
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
        this.durationWarning = Math.abs(a.duration - this.expected) > 5;
        this.srcNode = null;
        this.onLoaded();
        resolve();
      };
      const bad = () => { cleanup(); reject(new Error('この音声ファイルを再生できませんでした。Chrome・Edge・Safari で開くか、mp3 に変換したファイルを選んでください。')); };
      const cleanup = () => { a.removeEventListener('loadedmetadata', ok); a.removeEventListener('error', bad); };
      a.addEventListener('loadedmetadata', ok);
      a.addEventListener('error', bad);
    });
  }

  onLoaded() {}

  /** route the <audio> element through the Web Audio graph (after the context exists) */
  attach() {
    if (!this.audio || this.srcNode || !this.sound.ctx) return;
    try {
      this.srcNode = this.sound.ctx.createMediaElementSource(this.audio);
      this.srcNode.connect(this.sound[this.busName]);
    } catch (e) {
      console.warn('audio routing failed; playing directly', e);
    }
  }

  playRange(id, start, end) {
    this.stopClip(true);
    if (!this.audio) return 0;
    this.attach();
    this.audio.currentTime = start;
    this.audio.volume = 1;
    const p = this.audio.play();
    if (p && p.catch) p.catch(() => {});
    this.current = { id, end };
    return end - start;
  }

  stopClip(quick = false) {
    if (this.audio && !this.audio.paused) {
      if (quick) this.audio.pause();
      else this.fadeOut();
    }
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
    return this.audio && !this.audio.paused;
  }

  setPaused(p) {
    this.paused = p;
    if (this.audio && this.current) {
      if (p) this.audio.pause(); else this.audio.play().catch(() => {});
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

/** in-car announcements, with a speech-synthesis fallback */
export class Announcer extends ClipPlayer {
  constructor(sound) {
    super(sound, 'annBus', EXPECTED_DURATION);
    this.mode = 'tts'; // 'file' | 'tts' | 'off'
  }

  onLoaded() { this.mode = 'file'; }

  /** load the built-in recording (no HEAD probe: works on static hosts that reject HEAD) */
  async loadBuiltIn() {
    try { await this.setSource(LOCAL_AUDIO_URL, '内蔵（ひごくま氏 収録）'); return true; } catch { return false; }
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
      return this.playRange(id, c[0], c[1]);
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
    this.stopClip(quick);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  get playing() {
    if (!this.current) return false;
    if (this.current.tts) return speechSynthesis.speaking;
    return super.playing;
  }

  setPaused(p) {
    if (this.mode === 'tts' && 'speechSynthesis' in window) {
      if (p) speechSynthesis.pause(); else speechSynthesis.resume();
      this.paused = p;
      return;
    }
    super.setPaused(p);
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
