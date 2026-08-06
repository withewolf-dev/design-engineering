'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MOTION_PRESETS, pingPong, sampleMotion } from '@/lib/motion';
import type { Easing, Motion } from '@/lib/schema';
import { EASING } from '@/lib/schema';
import { useEditor } from '@/lib/store';
import { NumberField, Section, Segmented } from './controls';

// The 10–20% a generator can't do.
//
// Everything else in the inspector edits a value someone could have typed into
// the code by hand. Motion is different: nobody knows what `damping: 16` feels
// like, they know whether the sheet felt right. So the controls here are chosen
// to be judged by eye — curves you watch rather than names you read, a preview
// that runs continuously, and parameters labelled by the sensation they change.

/** One rAF loop, writing to the DOM directly. Driving four looping previews
 *  through React state would re-render the panel sixty times a second to move
 *  some dots — the animation is presentation, so it stays out of the tree. */
function useRafLoop(cb: (elapsed: number) => void, enabled: boolean) {
  const ref = useRef(cb);
  ref.current = cb;

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      ref.current(now - start);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}

function usePrefersReducedMotion() {
  const ref = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    ref.current = mq.matches;
  }, []);
  return ref;
}

export function MotionEditor({ nodeId, motion }: { nodeId: string; motion: Motion }) {
  const begin = useEditor((s) => s.begin);
  const setMotion = useEditor((s) => s.setMotion);
  const setFocus = useEditor((s) => s.setFocus);
  const requestPlay = useEditor((s) => s.requestPlay);

  const reduced = usePrefersReducedMotion();
  const dotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const barRef = useRef<HTMLDivElement>(null);

  const presetSamples = useMemo(
    () => MOTION_PRESETS.map((p) => sampleMotion(p.motion)),
    [],
  );
  const currentSampled = useMemo(() => sampleMotion(motion), [motion]);

  useRafLoop((elapsed) => {
    presetSamples.forEach((sampled, i) => {
      const dot = dotRefs.current[i];
      if (!dot) return;
      const pos = pingPong(elapsed, sampled);
      dot.style.left = `${Math.max(-4, Math.min(104, pos * 100))}%`;
    });
    if (barRef.current) {
      const pos = pingPong(elapsed, currentSampled);
      barRef.current.style.transform = `translateY(${(1 - pos) * 100}%)`;
    }
  }, !reduced.current);

  function patch(next: Motion) {
    begin();
    setMotion(nodeId, next);
  }

  const activePreset = MOTION_PRESETS.findIndex((p) =>
    p.motion.type === 'spring'
      ? motion.type === 'spring'
      : motion.type === 'timing' && motion.easing === p.motion.easing,
  );

  return (
    <>
      <Section label="Curve">
        {/* Thumbnails animate rather than depicting the curve as a static line:
            a moving dot is read as motion in a fraction of the time a bezier
            diagram takes to interpret, and it is the actual quantity being
            chosen. */}
        <div className="flex gap-[6px]">
          {MOTION_PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              onClick={() => patch(preset.motion)}
              className={`flex flex-1 cursor-pointer flex-col items-center gap-[6px] rounded-lg border px-1 py-2 text-[10px] ${
                i === activePreset
                  ? 'border-[var(--accent)] text-[var(--text)]'
                  : 'border-[var(--line-strong)] text-[var(--text-faint)] hover:text-[var(--text-dim)]'
              } bg-[var(--panel-2)]`}
            >
              <span className="relative h-1 w-full rounded-full bg-white/10">
                <span
                  ref={(el) => {
                    dotRefs.current[i] = el;
                  }}
                  className="absolute top-1/2 -ml-[3px] -mt-[3px] h-[6px] w-[6px] rounded-full bg-[var(--accent)]"
                />
              </span>
              {preset.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Preview">
        <div className="relative mb-[10px] h-[72px] overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--panel-2)]">
          <div
            ref={barRef}
            className="absolute inset-x-[12%] bottom-0 h-[52%] rounded-t-lg border border-b-0 border-[var(--line-strong)] bg-[var(--raised)]"
            style={{ transform: 'translateY(100%)' }}
          />
        </div>
        <button
          onClick={() => requestPlay(nodeId)}
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--panel-2)] py-2 text-[12.5px] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          ▶ Test on canvas
        </button>
      </Section>

      <Section label="Timing">
        {motion.type === 'spring' ? (
          <>
            {/* Named for the sensation, not the symbol. "Stiffness 210" is
                meaningless without a physics background; "how snappy" is not. */}
            <NumberField
              label="Snappiness"
              value={motion.stiffness}
              min={20}
              max={600}
              step={5}
              onBegin={begin}
              onChange={(v) => setMotion(nodeId, { ...motion, stiffness: v })}
            />
            <NumberField
              label="Bounce"
              value={motion.damping}
              min={2}
              max={60}
              onBegin={begin}
              onChange={(v) => setMotion(nodeId, { ...motion, damping: v })}
            />
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-faint)]">
              Lower bounce overshoots more. Above ~2√stiffness it stops
              overshooting entirely.
            </p>
          </>
        ) : (
          <>
            <NumberField
              label="Duration"
              value={motion.duration}
              unit="ms"
              min={60}
              max={2000}
              step={10}
              onBegin={begin}
              onChange={(v) => setMotion(nodeId, { ...motion, duration: v })}
            />
            <div className="mt-2">
              <Segmented
                value={motion.easing}
                options={EASING.map((e) => ({
                  value: e,
                  label:
                    e === 'linear'
                      ? 'Linear'
                      : e === 'easeIn'
                        ? 'In'
                        : e === 'easeOut'
                          ? 'Out'
                          : 'In-Out',
                }))}
                onPick={(v) =>
                  patch({ ...motion, easing: v as Easing })
                }
              />
            </div>
          </>
        )}
      </Section>

      <div className="px-[14px] py-3">
        <button
          className="text-[12.5px] text-[var(--text-dim)] hover:text-[var(--accent)]"
          onClick={() => setFocus('interaction')}
        >
          ‹ Back to Interaction
        </button>
      </div>
    </>
  );
}
