// All sound in SOLMAR HEAT is synthesized with WebAudio: no audio files.
// Engine hum, police sirens, the helicopter, gunshots, crashes, mission
// stingers and four radio stations, all built from oscillators and noise.
// Every method is a no-op until the player has interacted (the browser
// only lets audio start after a gesture) and while muted.

/** Radio stations: name, tempo and character. */
export const RADIO_STATIONS = [
  { name: 'Solmar FM', bpm: 76, mood: 'chill' },
  { name: 'Bassline 88', bpm: 118, mood: 'drive' },
  { name: 'Neon Nights', bpm: 104, mood: 'synth' },
  { name: 'Marina Talk', bpm: 66, mood: 'jazz' },
];

/** Chord roots (Hz) for the radio progressions. */
const CHORDS = {
  chill: [[261.6, 329.6, 392.0, 493.9], [220.0, 261.6, 329.6, 392.0], [174.6, 220.0, 261.6, 349.2], [196.0, 246.9, 293.7, 392.0]],
  jazz: [[233.1, 311.1, 415.3], [196.0, 261.6, 349.2], [174.6, 220.0, 293.7], [146.8, 220.0, 277.2]],
};

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    station: 0,
    radioTimer: null,
    radioStep: 0,
    radioNextTime: 0,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenHigh: false,
    sirenTimer: null,
    rotorSrc: null,
    rotorGain: null,

    /** Create the context (call from a user gesture). */
    resume() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
    },

    setMuted(muted) {
      this.muted = muted;
      if (this.master) this.master.gain.value = muted ? 0 : 0.5;
    },

    /** A short tone: frequency, seconds, wave type, volume, delay. */
    tone(freq, dur, type = 'sine', gain = 0.2, when = 0) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    },

    /** A burst of filtered noise (gunshots, crashes, hats). */
    noise(dur, filterFreq, gain = 0.3, when = 0, type = 'lowpass') {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + when;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter).connect(g).connect(this.master);
      src.start(t);
    },

    /** Continuous engine hum: pitch follows speed (0..1). */
    startEngine() {
      if (!this.ctx || this.engineOsc) return;
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'square';
      this.engineOsc2.frequency.value = 28;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter);
      this.engineOsc2.connect(filter);
      filter.connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
      this.engineOsc2.start();
    },

    /** speed01: 0 parked, 1 flat out. throttle: 0..1. */
    setEngine(speed01, throttle) {
      if (!this.engineOsc) return;
      const f = 55 + speed01 * 130 + throttle * 25;
      this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
      this.engineOsc2.frequency.setTargetAtTime(f / 2, this.ctx.currentTime, 0.08);
      this.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.06, this.ctx.currentTime, 0.1);
    },

    /** Two-tone police siren, on or off. */
    setSiren(on) {
      if (!this.ctx) return;
      if (on && !this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'square';
        this.sirenOsc.frequency.value = 720;
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0.045;
        this.sirenOsc.connect(this.sirenGain).connect(this.master);
        this.sirenOsc.start();
        this.sirenHigh = false;
        this.sirenTimer = setInterval(() => {
          if (!this.sirenOsc) return;
          this.sirenHigh = !this.sirenHigh;
          this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 960 : 720, this.ctx.currentTime, 0.05);
        }, 420);
      } else if (!on && this.sirenOsc) {
        clearInterval(this.sirenTimer);
        this.sirenTimer = null;
        this.sirenOsc.stop();
        this.sirenOsc = null;
      }
    },

    /** Helicopter rotor thump, on or off. */
    setRotor(on) {
      if (!this.ctx) return;
      if (on && !this.rotorSrc) {
        const len = this.ctx.sampleRate;
        const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.rotorSrc = this.ctx.createBufferSource();
        this.rotorSrc.buffer = buffer;
        this.rotorSrc.loop = true;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220;
        this.rotorGain = this.ctx.createGain();
        this.rotorGain.gain.value = 0.12;
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 13;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 0.07;
        lfo.connect(lfoGain).connect(this.rotorGain.gain);
        this.rotorSrc.connect(filter).connect(this.rotorGain).connect(this.master);
        this.rotorSrc.start();
        lfo.start();
        this._rotorLfo = lfo;
      } else if (!on && this.rotorSrc) {
        this.rotorSrc.stop();
        this.rotorSrc = null;
        if (this._rotorLfo) this._rotorLfo.stop();
      }
    },

    /** Gunshot: a crack for the pistol, a boom for the shotgun, a bark for the SMG. */
    shot(weapon) {
      if (weapon === 'shotgun') {
        this.noise(0.28, 900, 0.5);
        this.tone(90, 0.2, 'sine', 0.4);
      } else if (weapon === 'smg') {
        this.noise(0.08, 2400, 0.25);
      } else if (weapon === 'fists') {
        this.noise(0.07, 500, 0.2);
      } else {
        this.noise(0.12, 1800, 0.35);
      }
    },

    crash() {
      this.noise(0.35, 400, 0.5);
      this.tone(60, 0.3, 'sine', 0.4);
    },

    /** Mission stinger: rising major arpeggio on success, falling minor on failure. */
    stinger(win) {
      const notes = win ? [523.3, 659.3, 784.0, 1046.5] : [392.0, 311.1, 233.1];
      notes.forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.22, i * 0.12));
    },

    /** Start the radio on a station (0..3). */
    startRadio(station) {
      this.stopRadio();
      if (!this.ctx) return;
      this.station = station;
      this.radioStep = 0;
      this.radioNextTime = this.ctx.currentTime + 0.1;
      this.radioTimer = setInterval(() => this.scheduleRadio(), 40);
    },

    stopRadio() {
      if (this.radioTimer) {
        clearInterval(this.radioTimer);
        this.radioTimer = null;
      }
    },

    /** Schedule radio notes a little ahead of time. */
    scheduleRadio() {
      if (!this.ctx) return;
      const st = RADIO_STATIONS[this.station];
      const stepDur = 60 / st.bpm / 2; // eighth notes
      while (this.radioNextTime < this.ctx.currentTime + 0.15) {
        const when = this.radioNextTime - this.ctx.currentTime;
        const step = this.radioStep;
        const chords = CHORDS[st.mood === 'jazz' ? 'jazz' : 'chill'];
        const chord = chords[Math.floor(step / 8) % chords.length];
        if (st.mood === 'chill' && step % 8 === 0) {
          for (const f of chord) this.tone(f, stepDur * 7, 'triangle', 0.05, when);
        }
        if (st.mood === 'jazz' && step % 8 === 0) {
          for (const f of chord) this.tone(f, stepDur * 6, 'sine', 0.07, when);
          this.tone(chord[0] / 2, stepDur * 6, 'sine', 0.09, when);
        }
        if (st.mood === 'drive') {
          const bass = [55, 55, 65.4, 49][Math.floor(step / 4) % 4];
          if (step % 2 === 0) this.tone(bass, stepDur * 1.8, 'square', 0.12, when);
          if (step % 4 === 2) this.noise(0.03, 6000, 0.05, when, 'highpass');
        }
        if (st.mood === 'synth') {
          const arp = chord.concat([chord[0] * 2]);
          const note = arp[step % arp.length];
          this.tone(note, stepDur * 0.9, 'sawtooth', 0.06, when);
          if (step % 8 === 0) this.tone(chord[0] / 2, stepDur * 6, 'triangle', 0.1, when);
        }
        this.radioStep += 1;
        this.radioNextTime += stepDur;
      }
    },
  };
  return audio;
}
