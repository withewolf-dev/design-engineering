'use client';

import { useEffect, useRef, useState } from 'react';

// The primitive controls. Every one of these is driven by a descriptor from
// lib/nodeTypes, so the inspector never constructs one by hand — which is what
// keeps "corner radius" behaving identically on a box, a button and whatever
// element type gets added next.

interface NumberFieldProps {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  onBegin: () => void;
  onChange: (value: number) => void;
}

/**
 * Type it, or drag its label.
 *
 * A slider was the wrong instrument here: it trades precision for a gesture,
 * caps its own range visibly, and eats horizontal space a dense panel doesn't
 * have. Scrubbing the label gives the same coarse gesture with none of those
 * costs, and typing stays available for the case where someone already knows
 * the number they want.
 */
export function NumberField({
  label,
  value,
  unit = '',
  min,
  max,
  step = 1,
  onBegin,
  onChange,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? `${value}${unit}`;

  function commit(raw: string) {
    const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ''));
    setDraft(null);
    if (Number.isNaN(parsed)) return;
    onBegin();
    onChange(clamp(parsed, min, max, step));
  }

  function startScrub(e: React.PointerEvent) {
    e.preventDefault();
    onBegin();
    const startX = e.clientX;
    const startValue = value;
    // A slow drag should still be able to land on every integer, so pixels map
    // to half a step rather than a whole one.
    const perPixel = step * 0.5;

    function move(ev: PointerEvent) {
      const next = clamp(startValue + (ev.clientX - startX) * perPixel, min, max, step);
      onChange(next);
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div className="flex items-center justify-between py-[5px]">
      <span
        className="scrub text-[12.5px] text-[var(--text-dim)]"
        onPointerDown={startScrub}
      >
        {label}
      </span>
      <input
        className="num-input"
        value={display}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function clamp(v: number, min: number, max: number, step: number) {
  const snapped = Math.round(v / step) * step;
  const bounded = Math.min(max, Math.max(min, snapped));
  // Kill floating-point dust from the snap so the field never reads "17.000000002".
  return Number(bounded.toFixed(4));
}

export function SwatchRow({
  value,
  swatches,
  onPick,
}: {
  value: string;
  swatches: string[];
  onPick: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-[7px] py-1">
      {swatches.map((color) => {
        const active = value.toLowerCase() === color.toLowerCase();
        return (
          <button
            key={color}
            aria-label={color}
            title={color}
            onClick={() => onPick(color)}
            className="h-5 w-5 rounded-full border-2 border-transparent"
            style={{
              background: color,
              boxShadow: active
                ? '0 0 0 2px var(--panel), 0 0 0 3.5px var(--accent)'
                : 'inset 0 0 0 1px rgba(255,255,255,0.18)',
            }}
          />
        );
      })}
    </div>
  );
}

export function Segmented({
  value,
  options,
  onPick,
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--panel-2)] p-[3px]">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onPick(opt.value)}
          className={`flex-1 rounded-md px-1 py-[6px] text-[11.5px] transition-colors ${
            value === opt.value
              ? 'bg-[var(--raised)] text-[var(--accent)]'
              : 'text-[var(--text-dim)] hover:text-[var(--text)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-[5px] text-[12.5px] text-[var(--text-dim)]">
      <span>{label}</span>
      <input
        type="checkbox"
        className="switch"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function TextField({
  value,
  onBegin,
  onChange,
}: {
  value: string;
  onBegin: () => void;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);

  // Follow the store when the change came from elsewhere (undo, a different
  // selection) but never yank the field out from under someone mid-type.
  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);

  return (
    <input
      className="w-full rounded-md border border-[var(--line-strong)] bg-[var(--panel-2)] px-2 py-[7px] text-[12.5px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
      value={draft}
      onChange={(e) => {
        dirty.current = true;
        setDraft(e.target.value);
      }}
      onFocus={onBegin}
      onBlur={() => {
        dirty.current = false;
        if (draft !== value) onChange(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

export function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--line)] px-[14px] pb-[14px] pt-3">
      <div className="eyebrow mb-2">{label}</div>
      {children}
    </div>
  );
}

export function RowButton({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`flex w-full items-center gap-[10px] rounded-md py-2 text-left ${
        onClick ? '-mx-[7px] w-[calc(100%+14px)] px-[7px] hover:bg-white/[0.04]' : ''
      }`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--panel-2)] text-[11px] text-[var(--accent)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-[var(--text)]">
          {title}
        </span>
        <span className="mt-px block truncate text-[12px] text-[var(--text-dim)]">
          {subtitle}
        </span>
      </span>
      {onClick && <span className="ml-auto text-[13px] text-[var(--text-faint)]">›</span>}
    </Tag>
  );
}
