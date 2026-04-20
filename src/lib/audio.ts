'use client';

// ============================================================
// Lightweight Web Audio SFX system
// Generates short procedural sounds — no audio files required.
// ============================================================

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.15,
  rampDown = true
) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  if (rampDown) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

// --- Public SFX API ---

/** Short crisp "click" when tapping a land */
export function sfxTapLand() {
  playTone(800, 0.06, 'square', 0.08);
}

/** Warm chord when casting a spell */
export function sfxCastSpell() {
  playTone(440, 0.25, 'triangle', 0.12);
  setTimeout(() => playTone(554, 0.2, 'triangle', 0.08), 50);
  setTimeout(() => playTone(659, 0.15, 'triangle', 0.06), 100);
}

/** Card played from hand — soft thud */
export function sfxPlayCard() {
  playTone(180, 0.12, 'sine', 0.15);
  playTone(120, 0.08, 'triangle', 0.1);
}

/** Damage dealt — sharp hit */
export function sfxDamage() {
  playTone(200, 0.1, 'sawtooth', 0.12);
  playTone(100, 0.15, 'square', 0.08);
}

/** Life gained — ascending chime */
export function sfxLifeGain() {
  playTone(523, 0.15, 'sine', 0.1);
  setTimeout(() => playTone(659, 0.15, 'sine', 0.1), 80);
  setTimeout(() => playTone(784, 0.2, 'sine', 0.08), 160);
}

/** Turn start — subtle bell */
export function sfxTurnStart() {
  playTone(880, 0.3, 'sine', 0.06);
  setTimeout(() => playTone(1320, 0.2, 'sine', 0.04), 100);
}

/** Game over — dramatic chord */
export function sfxGameOver() {
  playTone(220, 0.8, 'triangle', 0.15);
  playTone(277, 0.8, 'triangle', 0.12);
  playTone(330, 0.8, 'triangle', 0.1);
  setTimeout(() => {
    playTone(440, 1.0, 'sine', 0.08);
  }, 400);
}

/** Pass priority — very subtle tick */
export function sfxPassPriority() {
  playTone(600, 0.03, 'square', 0.04);
}
