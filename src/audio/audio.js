// Pure WebAudio synthesis: cute chiptune SFX + three looping music tracks scheduled on the audio clock.
// No audio files. The AudioContext is created lazily and resumed on the first user gesture.

const MUTE_KEY = 'pk:muted';
const MASTER_VOL = 0.5;
const MUSIC_VOL = 0.12;
const DEDUPE_MS = 80;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---------- music tracks (8 bars, 16th-note grid = 128 steps) ----------
// mel: eighth-note melody (64 entries, midi or null). bassRoots: one midi root per bar.
const TRACKS = {
  park: {
    bpm: 110, lead: 'square', leadVol: 0.5, bassWave: 'triangle', bassVol: 0.8, hats: true, kick: true, snare: false,
    bassRoots: [48, 53, 55, 48, 45, 53, 55, 48],
    mel: [
      76, 79, 76, 72, 74, 76, 74, null,
      77, 81, 77, 74, 76, 77, 76, null,
      79, 83, 79, 74, 76, 79, 81, null,
      84, null, 79, null, 76, null, 72, null,
      81, 84, 81, 76, 77, 81, 79, null,
      77, 81, 84, 81, 79, 77, 76, null,
      74, 76, 79, 81, 83, 81, 79, 77,
      76, null, 72, null, 72, null, null, null,
    ],
    // bass pattern per bar in eighths: 0 = root, 7 = fifth, 12 = octave, null = rest
    bassPat: [0, null, 7, null, 0, null, 12, 7],
  },
  tron: {
    bpm: 124, lead: 'sawtooth', leadVol: 0.32, bassWave: 'sawtooth', bassVol: 0.55, hats: true, kick: true, snare: false, pad: true, arp: true,
    bassRoots: [57, 57, 53, 53, 55, 55, 52, 52],
    // arpeggio intervals cycled on 16ths (minor chord with 9th)
    arpPat: [0, 3, 7, 12, 14, 12, 7, 3, 0, 7, 12, 15, 12, 7, 3, 0],
    bassPat: [0, 0, null, 0, 0, null, 0, 0],
  },
  race: {
    bpm: 150, lead: 'square', leadVol: 0.38, bassWave: 'sawtooth', bassVol: 0.7, hats: true, kick: true, snare: true,
    bassRoots: [40, 40, 43, 45, 40, 40, 38, 47],
    mel: [
      64, null, 67, 64, 71, null, 69, 67,
      64, null, 67, 71, 74, 71, 69, null,
      67, null, 70, 67, 74, null, 72, 70,
      69, null, 72, 69, 76, 74, 72, null,
      64, null, 67, 64, 71, null, 69, 67,
      64, 67, 71, 76, 74, 71, 69, null,
      62, null, 65, 62, 69, null, 67, 65,
      71, null, 74, 71, 76, 79, 78, 74,
    ],
    bassPat: [0, 0, 0, 0, 0, 0, 12, 0],
  },
};

export class GameAudio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this._muted = false;
    try { this._muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}
    this.lastPlayed = new Map();
    this.track = null;        // current track name (may be pending until the context unlocks)
    this.seq = null;          // scheduler state for the running track
    this.noiseBuf = null;

    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });

    const ev = game.events;
    ev.on('game:start', () => this.music('park'));
    ev.on('ride:board', ({ ride }) => {
      if (ride === 'lightcycle') this.music('tron');
      else if (ride === 'motorcycle') this.music('race');
      this.play('whoosh');
    });
    ev.on('ride:exit', () => this.music('park'));
    ev.on('ride:complete', () => { this.music('park'); this.play('quest'); });
    ev.on('gem:found', () => this.play('gem'));
    ev.on('quest:complete', () => this.play('quest'));
    ev.on('unlock', () => this.play('unlock'));
    ev.on('drive:lap', () => this.play('lap'));
    ev.on('drive:crash', () => this.play('crash'));
  }

  // ---------- mute ----------
  get muted() { return this._muted; }
  set muted(v) {
    this._muted = !!v;
    try { localStorage.setItem(MUTE_KEY, this._muted ? '1' : '0'); } catch {}
    this.applyMute();
  }
  applyMute() {
    if (!this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this._muted ? 0 : MASTER_VOL, now, 0.03);
  }

  // ---------- context ----------
  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = this.ctx = new AC();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.knee.value = 20; this.comp.ratio.value = 6; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : MASTER_VOL;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = MUSIC_VOL; this.musicBus.connect(this.master);
    // 1.5 s white-noise buffer shared by whoosh / crash / hats
    const len = Math.floor(ctx.sampleRate * 1.5);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  unlock() {
    if (!this.ensure()) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (this.track && !this.seq) this.startTrack(this.track);
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  // ---------- SFX ----------
  play(name) {
    const now = performance.now();
    const last = this.lastPlayed.get(name) || -1e9;
    if (now - last < DEDUPE_MS) return;      // other modules may fire the same cue for the same event
    this.lastPlayed.set(name, now);
    if (!this.ctx) return;                   // nothing until the first gesture
    const fn = this.sounds[name];
    if (fn) { try { fn.call(this, this.ctx.currentTime + 0.005); } catch (e) { console.warn('[audio]', name, e); } }
  }

  // One oscillator voice with a simple gain envelope and optional pitch slide / lowpass.
  tone({ t, freq, to, type = 'sine', dur = 0.2, vol = 0.3, a = 0.005, r, filter, q = 1, dest }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    const rel = r ?? dur;
    g.gain.setValueAtTime(vol, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(filter, t); f.Q.value = q; o.connect(f); node = f; }
    node.connect(g).connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  // Filtered noise burst. type: 'bandpass' | 'lowpass' | 'highpass'; f0 -> f1 sweep over dur.
  noise({ t, dur = 0.3, vol = 0.3, type = 'bandpass', f0 = 800, f1, q = 1, a = 0.01, dest }) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  sounds = {
    jump(t) { this.tone({ t, freq: 380, to: 820, type: 'square', dur: 0.14, vol: 0.14, filter: 2400 }); },
    board(t) {
      this.tone({ t, freq: 880, type: 'sine', dur: 0.35, vol: 0.22 });
      this.tone({ t, freq: 1760, type: 'sine', dur: 0.2, vol: 0.05 });
      this.tone({ t: t + 0.16, freq: 1318, type: 'sine', dur: 0.5, vol: 0.22 });
      this.tone({ t: t + 0.16, freq: 2636, type: 'sine', dur: 0.3, vol: 0.05 });
    },
    gem(t) {
      [84, 88, 91].forEach((n, i) => {
        this.tone({ t: t + i * 0.08, freq: midi(n), type: 'triangle', dur: 0.35, vol: 0.22 });
        this.tone({ t: t + i * 0.08, freq: midi(n + 12), type: 'sine', dur: 0.25, vol: 0.06 });
      });
      this.tone({ t: t + 0.24, freq: midi(96), type: 'sine', dur: 0.6, vol: 0.12 });
    },
    talk(t) { this.tone({ t, freq: 520 + Math.random() * 420, type: 'sine', dur: 0.055, vol: 0.09, a: 0.004 }); },
    quest(t) {
      [[67, 0, 0.16], [72, 0.16, 0.16], [76, 0.32, 0.16], [79, 0.48, 0.7]].forEach(([n, dt, d]) => {
        this.tone({ t: t + dt, freq: midi(n), type: 'square', dur: d, vol: 0.12, filter: 3000 });
        this.tone({ t: t + dt, freq: midi(n - 12), type: 'triangle', dur: d, vol: 0.12 });
      });
      this.tone({ t: t + 0.48, freq: midi(84), type: 'sine', dur: 0.7, vol: 0.08 });
    },
    unlock(t) {
      const notes = [72, 76, 79, 84, 88, 91, 96];
      notes.forEach((n, i) => this.tone({ t: t + i * 0.055, freq: midi(n), type: 'sine', dur: 0.4, vol: 0.14 }));
      this.noise({ t: t + 0.2, dur: 0.6, vol: 0.05, type: 'highpass', f0: 5000 });
    },
    whoosh(t) { this.noise({ t, dur: 0.8, vol: 0.28, type: 'bandpass', f0: 180, f1: 2600, q: 0.8, a: 0.25 }); },
    click(t) {
      this.tone({ t, freq: 1900, to: 1200, type: 'sine', dur: 0.045, vol: 0.12, a: 0.002 });
      this.noise({ t, dur: 0.03, vol: 0.06, type: 'highpass', f0: 3000, a: 0.002 });
    },
    crash(t) {
      this.noise({ t, dur: 0.5, vol: 0.4, type: 'lowpass', f0: 3000, f1: 300, a: 0.005 });
      this.tone({ t, freq: 130, to: 38, type: 'sine', dur: 0.45, vol: 0.45, a: 0.004 });
    },
    lap(t) {
      this.tone({ t, freq: 1046, type: 'sine', dur: 0.25, vol: 0.2 });
      this.tone({ t: t + 0.13, freq: 1046, type: 'sine', dur: 0.4, vol: 0.2 });
      this.tone({ t: t + 0.13, freq: 1568, type: 'sine', dur: 0.4, vol: 0.08 });
    },
    boost(t) { this.tone({ t, freq: 180, to: 900, type: 'sawtooth', dur: 0.5, vol: 0.12, filter: 1800, q: 3, a: 0.02 }); },
    // Needoh: a soft, wet squelch — a downward wobble with low-passed noise under it
    squish(t) {
      this.tone({ t, freq: 320, to: 110, type: 'sine', dur: 0.22, vol: 0.2, a: 0.01 });
      this.tone({ t: t + 0.05, freq: 180, to: 260, type: 'triangle', dur: 0.18, vol: 0.08, a: 0.02, filter: 900 });
      this.noise({ t, dur: 0.16, vol: 0.08, type: 'lowpass', f0: 1400, f1: 300, a: 0.01 });
    },
    // Lifeguard whistle: a sharp two-tone "fweet-FWEET" with a bit of breath noise
    whistle(t) {
      this.tone({ t, freq: 2300, to: 2500, type: 'square', dur: 0.16, vol: 0.12, a: 0.004, filter: 6000 });
      this.tone({ t, freq: 2340, type: 'sine', dur: 0.16, vol: 0.12, a: 0.004 });
      this.tone({ t: t + 0.2, freq: 2700, to: 3000, type: 'square', dur: 0.3, vol: 0.13, a: 0.004, filter: 7000 });
      this.tone({ t: t + 0.2, freq: 2740, type: 'sine', dur: 0.3, vol: 0.13, a: 0.004 });
      this.noise({ t, dur: 0.5, vol: 0.04, type: 'bandpass', f0: 2600, q: 4, a: 0.01 });
    },
    // Thunder (storm weather): a low rumble of filtered noise that swells, then rolls away
    thunder(t) {
      this.noise({ t, dur: 1.6, vol: 0.22, type: 'lowpass', f0: 90, f1: 260, a: 0.25 });
      this.noise({ t: t + 0.35, dur: 2.2, vol: 0.14, type: 'lowpass', f0: 160, f1: 60, a: 0.4 });
      this.tone({ t, freq: 48, to: 32, type: 'sine', dur: 1.8, vol: 0.12, a: 0.2 });
    },
    // Glow wand: a rising glitter of tiny sine pings
    sparkle(t) {
      [96, 100, 103, 108, 112].forEach((n, i) => this.tone({ t: t + i * 0.05, freq: midi(n), type: 'sine', dur: 0.22, vol: 0.09 }));
      this.noise({ t, dur: 0.35, vol: 0.04, type: 'highpass', f0: 6000, a: 0.01 });
    },
    // Snack bite: a crunchy noise click plus a happy "nom" blip
    eat(t) {
      this.noise({ t, dur: 0.09, vol: 0.18, type: 'lowpass', f0: 2500, f1: 600, a: 0.003 });
      this.tone({ t: t + 0.06, freq: 440, to: 660, type: 'triangle', dur: 0.14, vol: 0.12 });
      this.noise({ t: t + 0.16, dur: 0.07, vol: 0.12, type: 'lowpass', f0: 2000, f1: 500, a: 0.003 });
    },
    // Balloon bop: a rubbery boing
    boing(t) { this.tone({ t, freq: 220, to: 520, type: 'sine', dur: 0.2, vol: 0.14, a: 0.005 }); this.tone({ t: t + 0.12, freq: 520, to: 300, type: 'sine', dur: 0.25, vol: 0.1 }); },
    // Bedtime: a slow, soft lullaby chime
    sleep(t) {
      [76, 72, 69, 64].forEach((n, i) => { this.tone({ t: t + i * 0.32, freq: midi(n), type: 'sine', dur: 0.9, vol: 0.12 }); this.tone({ t: t + i * 0.32, freq: midi(n - 12), type: 'triangle', dur: 0.9, vol: 0.05, filter: 1200 }); });
    },
  };

  // ---------- music ----------
  music(name) {
    if (name === this.track && (this.seq || !name)) return;
    this.stopTrack();
    this.track = name;
    if (name && this.ctx) this.startTrack(name);
  }
  startTrack(name) {
    const def = TRACKS[name];
    if (!def || !this.ctx) return;
    const ctx = this.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(this.musicBus);
    bus.gain.setTargetAtTime(1, ctx.currentTime, 0.4); // fade in
    this.seq = { name, def, bus, step: 0, nextTime: ctx.currentTime + 0.1, stepDur: 60 / def.bpm / 4, pad: null };
    if (def.pad) this.startPad(this.seq);
  }
  stopTrack() {
    const s = this.seq; if (!s) return;
    const now = this.ctx.currentTime;
    s.bus.gain.cancelScheduledValues(now);
    s.bus.gain.setTargetAtTime(0.0001, now, 0.25);
    const bus = s.bus, pad = s.pad;
    setTimeout(() => { try { pad?.forEach((o) => o.stop()); bus.disconnect(); } catch {} }, 1500);
    this.seq = null;
  }
  // sustained detuned saw chord that follows the bar's root (tron)
  startPad(s) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0.16;
    f.connect(g).connect(s.bus);
    s.pad = [];
    s.padOsc = [];
    for (const det of [-7, 7, 0]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
      o.connect(f); o.start(); s.pad.push(o); s.padOsc.push(o);
    }
    s.padIntervals = [0, 7, 12];
  }

  update() {
    const s = this.seq;
    if (!s || !this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    // lookahead scheduler: keep ~0.3 s of notes queued on the audio clock
    while (s.nextTime < ctx.currentTime + 0.3) {
      this.scheduleStep(s, s.step, s.nextTime);
      s.step = (s.step + 1) % 128;
      s.nextTime += s.stepDur;
    }
  }
  scheduleStep(s, step, t) {
    const d = s.def, bus = s.bus;
    const bar = Math.floor(step / 16), sixteenth = step % 16, eighth = Math.floor(step / 2);
    const root = d.bassRoots[bar];
    const stepDur = s.stepDur;
    // pad: retune on bar boundaries
    if (s.padOsc && sixteenth === 0) s.padOsc.forEach((o, i) => o.frequency.setTargetAtTime(midi(root + s.padIntervals[i]), t, 0.05));
    // melody / arpeggio
    if (d.arp) {
      const n = root + 12 + d.arpPat[sixteenth];
      this.tone({ t, freq: midi(n), type: d.lead, dur: stepDur * 0.9, vol: d.leadVol, a: 0.005, filter: 2200, q: 2, dest: bus });
    } else if (step % 2 === 0) {
      const n = d.mel[eighth];
      if (n != null) {
        // tie into the next eighth if it is a rest
        const sustain = d.mel[(eighth + 1) % 64] == null ? 1.9 : 0.95;
        this.tone({ t, freq: midi(n), type: d.lead, dur: stepDur * 2 * sustain, vol: d.leadVol, a: 0.01, filter: 2600, dest: bus });
      }
    }
    // bass (eighths)
    if (step % 2 === 0) {
      const iv = d.bassPat[eighth % 8];
      if (iv != null) this.tone({ t, freq: midi(root + iv), type: d.bassWave, dur: stepDur * 1.8, vol: d.bassVol, a: 0.01, filter: 500, dest: bus });
    }
    // drums
    if (d.kick && (sixteenth === 0 || sixteenth === 8 || (d.snare && sixteenth === 14)))
      this.tone({ t, freq: 150, to: 45, type: 'sine', dur: 0.14, vol: 0.9, a: 0.003, dest: bus });
    if (d.snare && (sixteenth === 4 || sixteenth === 12))
      this.noise({ t, dur: 0.12, vol: 0.35, type: 'bandpass', f0: 1800, q: 0.7, a: 0.003, dest: bus });
    if (d.hats && sixteenth % 2 === 0)
      this.noise({ t, dur: 0.04, vol: sixteenth % 4 === 2 ? 0.16 : 0.08, type: 'highpass', f0: 7000, a: 0.002, dest: bus });
  }
}
