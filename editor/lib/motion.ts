import type { Easing, Motion } from './schema';

// Motion is sampled, not approximated with a CSS transition.
//
// A spring's shape is a property of its physics, so the only way a preview can
// be honest about how it will feel on device is to integrate the same equation
// the platform does and play back the result. Sampling once into an array (as
// opposed to integrating live in the render loop) means every consumer — the
// curve thumbnails, the preview strip, the canvas playback — is animating the
// exact same numbers, and scrubbing a slider can't drift them out of sync.

export interface Sampled {
  /** Normalised positions, 0 → 1, at a fixed timestep. */
  samples: number[];
  /** Seconds per sample. */
  dt: number;
  durationMs: number;
}

const EASING_FN: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

const STEP = 1 / 120;

export function sampleTiming(easing: Easing, durationMs: number): Sampled {
  const fn = EASING_FN[easing];
  const total = durationMs / 1000;
  const steps = Math.max(2, Math.round(total / STEP));
  const samples: number[] = [];
  for (let i = 0; i <= steps; i++) samples.push(fn(i / steps));
  return { samples, dt: total / steps, durationMs };
}

/**
 * Explicit Euler integration of a damped harmonic oscillator settling from 0 to
 * 1 — the same model SwiftUI's `.spring` and Reanimated's `withSpring` use.
 * Runs until it is both near the target and nearly still, so an overdamped
 * spring produces a short array and a springy one produces a long one, which is
 * what makes the preview's length itself informative.
 */
export function sampleSpring(
  stiffness: number,
  damping: number,
  mass = 1,
): Sampled {
  let pos = 0;
  let vel = 0;
  let t = 0;
  const samples = [0];
  const maxT = 4;

  while (t < maxT) {
    const acc = (stiffness * (1 - pos) - damping * vel) / mass;
    vel += acc * STEP;
    pos += vel * STEP;
    samples.push(pos);
    t += STEP;
    if (t > 0.1 && Math.abs(1 - pos) < 0.002 && Math.abs(vel) < 0.002) break;
  }
  samples.push(1);
  return { samples, dt: STEP, durationMs: samples.length * STEP * 1000 };
}

export function sampleMotion(motion: Motion): Sampled {
  return motion.type === 'spring'
    ? sampleSpring(motion.stiffness, motion.damping)
    : sampleTiming(motion.easing, motion.duration);
}

/**
 * Position at wall-clock time `elapsed`, playing forward then backward so a
 * looping preview never snaps back to the start — the return trip reads as part
 * of the demonstration instead of as a glitch.
 */
export function pingPong(elapsed: number, s: Sampled): number {
  const dur = (s.samples.length - 1) * s.dt * 1000;
  if (dur <= 0) return 0;
  const cycle = dur * 2;
  const e = elapsed % cycle;
  const localMs = e <= dur ? e : cycle - e;
  const idx = Math.min(
    s.samples.length - 1,
    Math.floor(localMs / 1000 / s.dt),
  );
  return s.samples[idx];
}

/** Position at normalised progress 0 → 1, for one-shot playback. */
export function at(progress: number, s: Sampled): number {
  const idx = Math.min(
    s.samples.length - 1,
    Math.max(0, Math.round(progress * (s.samples.length - 1))),
  );
  return s.samples[idx];
}

export const MOTION_PRESETS: Array<{ label: string; motion: Motion }> = [
  { label: 'Linear', motion: { type: 'timing', duration: 500, easing: 'linear' } },
  { label: 'Ease Out', motion: { type: 'timing', duration: 500, easing: 'easeOut' } },
  { label: 'Ease In-Out', motion: { type: 'timing', duration: 500, easing: 'easeInOut' } },
  { label: 'Spring', motion: { type: 'spring', stiffness: 210, damping: 16 } },
];

export function motionLabel(motion: Motion): string {
  if (motion.type === 'spring') return 'Spring';
  const map: Record<Easing, string> = {
    linear: 'Linear',
    easeIn: 'Ease In',
    easeOut: 'Ease Out',
    easeInOut: 'Ease In-Out',
  };
  return map[motion.easing];
}
