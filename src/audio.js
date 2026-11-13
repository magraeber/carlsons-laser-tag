export class Audio {
  constructor() { this.enabled = true; this.context = null; }
  unlock() {
    if (!this.enabled) return;
    try { this.context ??= new (window.AudioContext || window.webkitAudioContext)(); this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  tone(from, to, duration, volume = .04, type = 'sine') {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const ctx = this.context, oscillator = ctx.createOscillator(), gain = ctx.createGain(), time = ctx.currentTime;
    oscillator.type = type; oscillator.frequency.setValueAtTime(from, time); oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, to), time + duration);
    gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(time); oscillator.stop(time + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  shot(distance, player) { this.tone(790, 140, .12, player ? .045 : Math.max(0, .022 * (1 - distance / 28)), 'triangle'); }
  hit() { this.tone(1150, 1650, .08, .055); }
  hurt() { this.tone(135, 55, .22, .08, 'triangle'); }
  end(win) { this.tone(win ? 550 : 240, win ? 1100 : 100, .65, .08, 'triangle'); }
}
