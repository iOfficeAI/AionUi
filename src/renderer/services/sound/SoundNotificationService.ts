export type SoundPreset = 'chime' | 'ding' | 'bell' | 'pop';

export const SOUND_PRESETS: SoundPreset[] = ['chime', 'ding', 'bell', 'pop'];

export class SoundNotificationService {
  private audioCtx: AudioContext | null = null;

  private getCtx(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  play(preset: SoundPreset = 'chime'): void {
    try {
      const ctx = this.getCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume().then(() => this.synthesize(ctx, preset));
      } else {
        this.synthesize(ctx, preset);
      }
    } catch {
      // ignore audio errors silently
    }
  }

  private synthesize(ctx: AudioContext, preset: SoundPreset): void {
    switch (preset) {
      case 'chime':
        this.tone(ctx, 784, 0, 0.12, 0.28);
        this.tone(ctx, 1047, 0.14, 0.1, 0.36);
        break;
      case 'ding':
        this.tone(ctx, 1318, 0, 0.08, 0.45);
        break;
      case 'bell':
        this.tone(ctx, 523, 0, 0.15, 0.22);
        this.tone(ctx, 659, 0, 0.1, 0.14);
        break;
      case 'pop':
        this.sweep(ctx, 180, 520, 0.08, 0.22);
        break;
    }
  }

  private tone(ctx: AudioContext, freq: number, delay: number, vol: number, decay: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime + delay;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.start(t);
    osc.stop(t + decay);
  }

  private sweep(ctx: AudioContext, freqFrom: number, freqTo: number, vol: number, decay: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqFrom, t);
    osc.frequency.exponentialRampToValueAtTime(freqTo, t + decay * 0.4);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.start(t);
    osc.stop(t + decay);
  }
}

export const soundNotificationService = new SoundNotificationService();
