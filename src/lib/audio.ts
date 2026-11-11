'use client';

/**
 * 숲속여행 절차적 사운드 엔진
 * ─────────────────────────────────────────────
 * 외부 음원 없이 Web Audio 로 바람·새소리·발소리·장작 소리를 합성한다.
 * 모든 소리는 사용자의 "숲으로 들어가기" 제스처 이후에만 시작된다.
 */

import { CABIN } from '@/lib/world';

type Surface = 'grass' | 'dirt' | 'wood' | 'stone';

type Environment = {
  night: number;
  cabin: boolean;
  sitting: boolean;
  resting: boolean;
  fireIntensity: number;
};

/** 벽난로 소리 위치 (오두막 기준: 왼쪽(-x) 벽 안쪽, 벽난로 중심 z) */
const FIRE = { x: CABIN.x - 4.9, z: CABIN.z - 0.4 };

class ForestAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private leafGain: GainNode | null = null;
  private birdGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private stepBuffer: AudioBuffer | null = null;
  private started = false;
  private muted = false;
  private lastStep = 0;
  private env: Environment = {
    night: 0,
    cabin: false,
    sitting: false,
    resting: false,
    fireIntensity: 0.5,
  };
  private listener = { x: 0, z: 72 };
  private birdTimer: ReturnType<typeof setTimeout> | null = null;
  private fireTimer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;

  get isStarted() {
    return this.started;
  }

  async start() {
    if (this.started) {
      await this.ctx?.resume().catch(() => {});
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      await ctx.resume().catch(() => {});

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.35;

      const master = ctx.createGain();
      master.gain.value = 0.75;
      master.connect(compressor).connect(ctx.destination);
      this.master = master;

      const reverb = ctx.createConvolver();
      reverb.buffer = this.makeImpulse(ctx, 2.8, 2.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.24;
      reverb.connect(wet).connect(master);
      this.reverb = reverb;
      this.wet = wet;

      this.noise = this.makeNoise(ctx, 4, false);
      this.brown = this.makeNoise(ctx, 6, true);
      this.stepBuffer = this.makeStepBuffer(ctx);

      // 바람
      const wind = ctx.createBufferSource();
      wind.buffer = this.brown;
      wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 420;
      windFilter.Q.value = 0.5;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.045;
      wind.connect(windFilter).connect(windGain);
      windGain.connect(master);
      const windSend = ctx.createGain();
      windSend.gain.value = 0.12;
      windGain.connect(windSend).connect(reverb);
      wind.start();
      this.windGain = windGain;
      this.windFilter = windFilter;

      // 나뭇잎
      const leaves = ctx.createBufferSource();
      leaves.buffer = this.noise;
      leaves.loop = true;
      const leafFilter = ctx.createBiquadFilter();
      leafFilter.type = 'bandpass';
      leafFilter.frequency.value = 2100;
      leafFilter.Q.value = 0.7;
      const leafGain = ctx.createGain();
      leafGain.gain.value = 0.012;
      leaves.connect(leafFilter).connect(leafGain).connect(master);
      const leafSend = ctx.createGain();
      leafSend.gain.value = 0.2;
      leafGain.connect(leafSend).connect(reverb);
      leaves.start();
      this.leafGain = leafGain;

      // 새소리 버스
      const birdGain = ctx.createGain();
      birdGain.gain.value = 0.6;
      birdGain.connect(master);
      const birdSend = ctx.createGain();
      birdSend.gain.value = 0.5;
      birdGain.connect(birdSend).connect(reverb);
      this.birdGain = birdGain;

      // 장작 소리
      const fire = ctx.createBufferSource();
      fire.buffer = this.brown;
      fire.loop = true;
      const fireFilter = ctx.createBiquadFilter();
      fireFilter.type = 'lowpass';
      fireFilter.frequency.value = 760;
      const fireGain = ctx.createGain();
      fireGain.gain.value = 0;
      fire.connect(fireFilter).connect(fireGain).connect(master);
      const fireSend = ctx.createGain();
      fireSend.gain.value = 0.35;
      fireGain.connect(fireSend).connect(reverb);
      fire.start();
      this.fireGain = fireGain;

      // 바람 세기 LFO
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain).connect(windGain.gain);
      lfo.start();

      this.started = true;
      this.startedAt = performance.now();
      this.scheduleBird();
      this.scheduleFirePop();

      document.addEventListener('visibilitychange', this.onVisibility);
      window.setTimeout(() => this.update(this.env), 200);
    } catch (err) {
      console.warn('[audio] 시작 실패', err);
    }
  }

  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend().catch(() => {});
    else void this.ctx.resume().catch(() => {});
  };

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyMaster();
  }

  private applyMaster() {
    if (!this.ctx || !this.master) return;
    const target = this.muted ? 0.0001 : this.env.resting ? 0.38 : 0.75;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  update(env: Environment) {
    this.env = env;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const inside = env.cabin;
    const night = env.night;

    this.windGain?.gain.setTargetAtTime(
      env.resting ? 0.012 : inside ? 0.012 : 0.048 * (1 - night * 0.25),
      t,
      1.2,
    );
    this.windFilter?.frequency.setTargetAtTime(inside ? 190 : 320 + (1 - night) * 260, t, 1.5);
    this.leafGain?.gain.setTargetAtTime(inside ? 0.0015 : 0.011 * (1 - night * 0.75), t, 1.2);
    this.birdGain?.gain.setTargetAtTime(inside ? 0.14 : 0.6, t, 0.8);

    const dist = Math.hypot(this.listener.x - FIRE.x, this.listener.z - FIRE.z);
    const attenuation = inside
      ? Math.max(0, 1 - dist / 13)
      : Math.max(0, 0.18 - dist / 120);
    this.fireGain?.gain.setTargetAtTime(
      env.fireIntensity * 0.3 * attenuation,
      t,
      0.5,
    );
    this.applyMaster();
  }

  setListener(x: number, z: number) {
    this.listener.x = x;
    this.listener.z = z;
  }

  footprint(surface: Surface, running = false) {
    if (!this.ctx || !this.stepBuffer || this.muted) return;
    const now = performance.now();
    if (now - this.lastStep < 110) return;
    this.lastStep = now;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.stepBuffer;
    // [FEAT-01] 음 높이를 ±6%만 흔들어 걸음마다 조금씩 다르되 딱딱하지 않게 한다.
    src.playbackRate.value = 0.94 + Math.random() * 0.12;

    // [FEAT-01] 높은 대역(bandpass)이 "탁탁"하게 들렸다 → 낮은 대역만 남기는 lowpass로 바꾼다.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.value =
      surface === 'wood' ? 500 : surface === 'dirt' ? 700 : surface === 'grass' ? 800 : 900;

    const gain = ctx.createGain();
    // [FEAT-01] 바닥별 크기는 그대로 두고, 달릴 때 커지는 배율만 1.35 → 1.2로 줄인다.
    const volume =
      (surface === 'grass' ? 0.05 : surface === 'dirt' ? 0.11 : 0.09) * (running ? 1.2 : 1);
    // [FEAT-01] 바로 시작하던 소리를 10ms 동안 올리고 약 0.22초에 걸쳐 부드럽게 사라지게 한다.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    src.connect(filter).connect(gain).connect(this.master!);
    const send = ctx.createGain();
    send.gain.value = 0.18;
    gain.connect(send).connect(this.reverb!);
    src.start(t);
    src.stop(t + 0.3);

    if (surface === 'wood') {
      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(110 + Math.random() * 24, t);
      thump.frequency.exponentialRampToValueAtTime(58, t + 0.12);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.06, t);
      tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      thump.connect(tg).connect(this.master!);
      thump.start(t);
      thump.stop(t + 0.15);
    }
  }

  creak() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.linearRampToValueAtTime(120, t + 0.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.035, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.75);
  }

  rustle() {
    this.burst(2600, 0.09, 0.5);
  }

  logDrop() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.4);
    this.burst(700, 0.14, 0.25);
  }

  sip() {
    this.burst(900, 0.06, 0.18);
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.02, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  private burst(freq: number, duration: number, volume: number) {
    if (!this.ctx || !this.noise || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  private scheduleBird() {
    if (this.birdTimer) clearTimeout(this.birdTimer);
    const night = this.env.night;
    const delay = night > 0.6 ? 9000 + Math.random() * 16000 : 2800 + Math.random() * 7500;
    this.birdTimer = setTimeout(() => {
      if (this.started) {
        if (!this.muted && this.birdGain) {
          if (night > 0.6 && Math.random() < 0.45) this.hoot();
          else this.chirp();
        }
        this.scheduleBird();
      }
    }, delay);
  }

  private chirp() {
    if (!this.ctx || !this.birdGain || !this.reverb) return;
    const ctx = this.ctx;
    const base = ctx.currentTime + 0.02;
    const notes = 2 + Math.floor(Math.random() * 4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.7 - 0.85;
    const bus = ctx.createGain();
    bus.gain.value = 0.55 + Math.random() * 0.35;
    pan.connect(bus).connect(this.birdGain);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    bus.connect(send).connect(this.reverb);

    for (let i = 0; i < notes; i++) {
      const t = base + i * (0.08 + Math.random() * 0.04);
      const freq = 1900 + Math.random() * 2100;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * (1.15 + Math.random() * 0.3), t + 0.035);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t + 0.11);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.055, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      osc.connect(gain).connect(pan);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  private hoot() {
    if (!this.ctx || !this.birdGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    for (let i = 0; i < 2; i++) {
      const start = t + i * 0.55;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, start);
      osc.frequency.linearRampToValueAtTime(310, start + 0.35);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.05, start + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.2 - 0.6;
      osc.connect(gain).connect(pan).connect(this.birdGain);
      osc.start(start);
      osc.stop(start + 0.5);
    }
  }

  private scheduleFirePop() {
    if (this.fireTimer) clearTimeout(this.fireTimer);
    this.fireTimer = setTimeout(() => {
      if (this.started) {
        if (!this.muted && this.env.fireIntensity > 0.04 && this.fireGain) {
          const dist = Math.hypot(this.listener.x - FIRE.x, this.listener.z - FIRE.z);
          if ((this.env.cabin && dist < 13) || dist < 4) {
            this.pop();
          }
        }
        this.scheduleFirePop();
      }
    }, 180 + Math.random() * 900);
  }

  private pop() {
    if (!this.ctx || !this.noise || !this.fireGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800 + Math.random() * 1400;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.02 + Math.random() * 0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.05);
    src.connect(filter).connect(gain).connect(this.fireGain);
    src.start(t);
    src.stop(t + 0.12);
  }

  private makeNoise(ctx: AudioContext, seconds: number, brown: boolean) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.2;
        } else {
          data[i] = white * 0.6;
        }
      }
    }
    return buffer;
  }

  private makeStepBuffer(ctx: AudioContext) {
    const length = Math.floor(ctx.sampleRate * 0.16);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = Math.pow(1 - t, 3.2);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    return buffer;
  }

  private makeImpulse(ctx: AudioContext, seconds: number, decay: number) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buffer;
  }
}

export const audio = new ForestAudio();
