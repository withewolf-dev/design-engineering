import type { Align, Fill, Weight } from './schema';

// Node props to CSS. Kept in one place because the canvas, the fill chip in the
// inspector and the gradient ramp all have to agree — if the ramp drew the
// gradient differently from the canvas, the editor would be lying about the
// thing it exists to edit.

export function fillToCss(fill: Fill): string {
  if (fill.type === 'solid') return fill.color;
  const stops = [...fill.stops]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => `${s.color} ${s.pos}%`)
    .join(', ');
  return `linear-gradient(${fill.angle}deg, ${stops})`;
}

/** The ramp is always left-to-right regardless of the gradient's own angle —
 *  it edits stop ORDER and colour, and letting it rotate would make positions
 *  read as spatial when they're proportional. */
export function stopsToRampCss(fill: Fill): string {
  if (fill.type === 'solid') return fill.color;
  const stops = [...fill.stops]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => `${s.color} ${s.pos}%`)
    .join(', ');
  return `linear-gradient(90deg, ${stops})`;
}

export function alignToCss(align: Align): string {
  return align === 'leading' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end';
}

export function weightToCss(weight: Weight): number {
  return { regular: 400, medium: 500, semibold: 600, bold: 700 }[weight];
}
