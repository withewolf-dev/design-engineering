'use client';

import { useRef } from 'react';
import { PALETTE } from '@/lib/nodeTypes';
import { stopsToRampCss } from '@/lib/render';
import type { Fill } from '@/lib/schema';
import { useEditor } from '@/lib/store';
import { NumberField, Section, Segmented, SwatchRow } from './controls';

// A gradient is the clearest case for a purpose-built editor.
//
// Expressed through generic property rows it becomes "stop 1 position", "stop 1
// colour", "stop 2 position"… — a list of numbers describing something entirely
// visual, where the one thing you actually want to do (drag that colour a bit
// left) takes three fields and a mental model. The ramp puts the stops on the
// gradient they produce, which is the only place they mean anything.

export function GradientEditor({ nodeId, fill }: { nodeId: string; fill: Fill }) {
  const activeStop = useEditor((s) => s.activeStop);
  const setActiveStop = useEditor((s) => s.setActiveStop);
  const begin = useEditor((s) => s.begin);
  const setStopPos = useEditor((s) => s.setStopPos);
  const setStopColor = useEditor((s) => s.setStopColor);
  const addStop = useEditor((s) => s.addStop);
  const removeStop = useEditor((s) => s.removeStop);
  const setFillAngle = useEditor((s) => s.setFillAngle);
  const convertFill = useEditor((s) => s.convertFill);
  const setFocus = useEditor((s) => s.setFocus);

  const rampRef = useRef<HTMLDivElement>(null);
  // A drag that ends over the ramp still emits a click, which would otherwise
  // read as "add a stop here" and drop a new one every time someone moves an
  // existing one. The flag outlives pointerup by a tick so the click that
  // follows it can be ignored.
  const dragging = useRef(false);

  const isGradient = fill.type === 'gradient';
  const stops = isGradient ? fill.stops : [];
  const activeIndex = Math.min(activeStop, Math.max(0, stops.length - 1));

  function dragStop(index: number, e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    setActiveStop(index);
    begin();
    const ramp = rampRef.current;
    if (!ramp) return;
    const rect = ramp.getBoundingClientRect();
    dragging.current = true;

    function move(ev: PointerEvent) {
      const pct = Math.round(
        Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100)),
      );
      setStopPos(nodeId, index, pct);
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setTimeout(() => {
        dragging.current = false;
      }, 0);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function addAt(e: React.MouseEvent) {
    if (!isGradient || dragging.current) return;
    if ((e.target as HTMLElement).closest('[data-stop]')) return;
    const ramp = rampRef.current;
    if (!ramp) return;
    const rect = ramp.getBoundingClientRect();
    const pct = Math.round(
      Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
    );
    begin();
    addStop(nodeId, pct, PALETTE[stops.length % PALETTE.length]);
  }

  function dragDial(e: React.PointerEvent) {
    if (!isGradient) return;
    e.preventDefault();
    begin();
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    function apply(clientX: number, clientY: number) {
      const deg = Math.round(
        (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI + 90,
      );
      setFillAngle(nodeId, (deg + 360) % 360);
    }
    function move(ev: PointerEvent) {
      apply(ev.clientX, ev.clientY);
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    apply(e.clientX, e.clientY);
  }

  return (
    <>
      <Section label="Fill Type">
        <Segmented
          value={fill.type}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'gradient', label: 'Gradient' },
          ]}
          onPick={(next) => {
            begin();
            convertFill(nodeId, next as Fill['type']);
          }}
        />
      </Section>

      {isGradient ? (
        <>
          <Section label="Stops">
            <div
              ref={rampRef}
              onClick={addAt}
              title="Click to add a stop"
              className="relative mb-[10px] h-[26px] cursor-copy rounded-md"
              style={{ backgroundImage: stopsToRampCss(fill) }}
            >
              {stops.map((stop, i) => (
                <button
                  key={i}
                  data-stop
                  onPointerDown={(e) => dragStop(i, e)}
                  aria-label={`Stop ${i + 1}`}
                  className="absolute top-1/2 h-[15px] w-[15px] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-[2.5px] border-[#0f0f11] active:cursor-grabbing"
                  style={{
                    left: `${stop.pos}%`,
                    background: stop.color,
                    boxShadow:
                      i === activeIndex
                        ? '0 0 0 1px rgba(255,255,255,0.7), 0 0 0 2.5px var(--accent)'
                        : '0 0 0 1px rgba(255,255,255,0.4)',
                  }}
                />
              ))}
            </div>

            <NumberField
              label="Position"
              value={stops[activeIndex]?.pos ?? 0}
              unit="%"
              min={0}
              max={100}
              onBegin={begin}
              onChange={(v) => setStopPos(nodeId, activeIndex, v)}
            />

            <SwatchRow
              value={stops[activeIndex]?.color ?? ''}
              swatches={PALETTE}
              onPick={(color) => {
                begin();
                setStopColor(nodeId, activeIndex, color);
              }}
            />

            {stops.length > 2 && (
              <button
                className="py-[5px] text-[12.5px] text-[var(--text-dim)] hover:text-[var(--danger)]"
                onClick={() => {
                  begin();
                  removeStop(nodeId, activeIndex);
                }}
              >
                Remove stop {activeIndex + 1}
              </button>
            )}
          </Section>

          <Section label="Angle">
            <div className="flex items-center gap-3">
              <div
                onPointerDown={dragDial}
                className="relative h-[38px] w-[38px] shrink-0 cursor-grab touch-none rounded-full border border-[var(--line-strong)] bg-[var(--panel-2)] active:cursor-grabbing"
              >
                <div
                  className="absolute bottom-1/2 left-1/2 -ml-px h-[14px] w-[2px] origin-bottom bg-[var(--accent)]"
                  style={{ transform: `rotate(${fill.angle}deg)` }}
                >
                  <span className="absolute -top-[2.5px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[var(--accent)]" />
                </div>
              </div>
              <div className="flex-1">
                <NumberField
                  label="Rotation"
                  value={fill.angle}
                  unit="°"
                  min={0}
                  max={360}
                  onBegin={begin}
                  onChange={(v) => setFillAngle(nodeId, v)}
                />
              </div>
            </div>
          </Section>
        </>
      ) : (
        <Section label="Color">
          <SwatchRow
            value={fill.color}
            swatches={PALETTE}
            onPick={(color) => {
              begin();
              setStopColor(nodeId, 0, color);
            }}
          />
        </Section>
      )}

      <div className="px-[14px] py-3">
        <button
          className="text-[12.5px] text-[var(--text-dim)] hover:text-[var(--accent)]"
          onClick={() => setFocus('node')}
        >
          ‹ Back
        </button>
      </div>
    </>
  );
}
