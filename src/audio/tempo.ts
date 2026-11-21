/**
 * Offline tempo + beat-phase estimation for user-supplied songs.
 * Pure (works on a mono Float32Array), so it runs in the browser after
 * decodeAudioData and in Vitest on synthetic signals.
 *
 * Method: onset-strength envelope (positive log-energy flux, ~5.8 ms hop)
 * → comb-filter search over 60–220 BPM with a mild tempo prior → fine
 * refinement of BPM and phase. Assumes a constant tempo (click-tracked
 * recordings); live-drifting songs need a manual `bpm`/`offsetSec`.
 */

export interface TempoEstimate {
  bpm: number;
  /** Seconds from file start to the first detected beat. */
  offsetSec: number;
  /** 0..1, how much stronger the beat grid is than the average onset strength. */
  confidence: number;
}

const HOP = 256;
/** Off-beat/on-beat strength ratio below which the tempo is halved. */
const HALF_TIME_RATIO = 0.5;

export function onsetEnvelope(samples: Float32Array, sampleRate: number): { env: Float32Array; fps: number } {
  const frames = Math.floor(samples.length / HOP);
  const energy = new Float32Array(frames);
  // Simple high-pass (first difference) emphasises transients (kick click, snare, picking).
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const o = f * HOP;
    for (let i = 0; i < HOP; i++) {
      const x = samples[o + i]!;
      const d = x - prev;
      prev = x;
      e += x * x * 0.3 + d * d;
    }
    energy[f] = Math.log(1 + 1000 * e);
  }
  const env = new Float32Array(frames);
  for (let f = 1; f < frames; f++) env[f] = Math.max(0, energy[f]! - energy[f - 1]!);
  return { env, fps: sampleRate / HOP };
}

function sampleEnv(env: Float32Array, pos: number): number {
  const i = Math.floor(pos);
  const t = pos - i;
  const a = env[i] ?? 0;
  const b = env[i + 1] ?? 0;
  // Peak-preserving: onsets are 1–2 frames wide, take the max of neighbours.
  return Math.max(a * (1 - t) + b * t, t < 0.5 ? a : b);
}

/** Best phase (in frames) and mean on-grid strength for a beat period (in frames). */
function combScore(env: Float32Array, period: number, phaseStep: number, phaseFrom = 0, phaseTo = period): { phase: number; mean: number } {
  let best = { phase: 0, mean: -1 };
  for (let ph = phaseFrom; ph < phaseTo; ph += phaseStep) {
    let sum = 0;
    let n = 0;
    for (let p = ph; p < env.length - 1; p += period) {
      sum += sampleEnv(env, p);
      n++;
    }
    const mean = n ? sum / n : 0;
    if (mean > best.mean) best = { phase: ph, mean };
  }
  return best;
}

export function estimateTempo(samples: Float32Array, sampleRate: number, minBpm = 60, maxBpm = 220): TempoEstimate {
  const { env, fps } = onsetEnvelope(samples, sampleRate);
  let avg = 0;
  for (let i = 0; i < env.length; i++) avg += env[i]!;
  avg = avg / Math.max(1, env.length) || 1e-9;

  // Coarse search. Contrast (on-grid vs average) × number of hits favours the
  // real beat over its half-time; the log-normal prior centres on hardcore tempos.
  let best = { bpm: 120, score: -Infinity };
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const period = (60 / bpm) * fps;
    const { mean } = combScore(env, period, 1);
    const contrast = Math.max(0, mean / avg - 1);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 150) / 0.7) ** 2);
    const score = contrast * Math.sqrt(bpm) * prior;
    if (score > best.score) best = { bpm, score };
  }

  // Octave check: if every second beat is much weaker (off-beat hats), the slower grid is the real beat.
  {
    const period = (60 / best.bpm) * fps;
    const even = combScore(env, period * 2, 1);
    const odd = combScore(env, period * 2, 1, even.phase + period - 2, even.phase + period + 2);
    if (best.bpm / 2 >= minBpm && odd.mean < even.mean * HALF_TIME_RATIO) best = { bpm: best.bpm / 2, score: best.score };
  }

  // Fine search around the winner.
  let fine = { bpm: best.bpm, phase: 0, mean: -1 };
  for (let bpm = best.bpm - 0.6; bpm <= best.bpm + 0.6; bpm += 0.02) {
    const period = (60 / bpm) * fps;
    const r = combScore(env, period, 0.5);
    if (r.mean > fine.mean) fine = { bpm, phase: r.phase, mean: r.mean };
  }
  // Sub-frame phase.
  const period = (60 / fine.bpm) * fps;
  const sub = combScore(env, period, 0.1, Math.max(0, fine.phase - 1), fine.phase + 1);

  return {
    bpm: Math.round(fine.bpm * 100) / 100,
    offsetSec: (sub.phase * HOP) / sampleRate,
    confidence: Math.max(0, Math.min(1, (sub.mean / avg - 1) / 4)),
  };
}
