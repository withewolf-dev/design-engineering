import type { NodeType } from './schema';
import { ALIGN, DIRECTION, WEIGHT } from './schema';

// One registry, and the inspector is a function of it.
//
// The alternative — a hand-written panel component per node type — is how these
// tools rot: every new element means another bespoke panel, the controls drift
// apart, and "corner radius" ends up looking and behaving three different ways.
// Here a node type declares WHAT it exposes and the inspector decides HOW to
// render it, so a new type is a data entry, not a component.
//
// Controls that can't be expressed as a scalar (a gradient ramp, a motion
// curve) are declared as a `fill` / `motion` control and routed to a purpose-
// built editor. That's a deliberate escape hatch, not a gap: those two are
// exactly the properties where a generic number row is the wrong instrument,
// and they're the ones this product exists to make good.

export type Control =
  | {
      kind: 'number';
      key: string;
      label: string;
      unit?: string;
      min: number;
      max: number;
      step?: number;
    }
  | { kind: 'color'; key: string; label: string; swatches: string[] }
  | {
      kind: 'segmented';
      key: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
    }
  | { kind: 'toggle'; key: string; label: string }
  | { kind: 'text'; key: string; label: string }
  | { kind: 'fill'; key: string; label: string };

export interface Section {
  label: string;
  controls: Control[];
}

export interface NodeTypeDef {
  label: string;
  icon: string;
  sections: Section[];
}

// Accent-bearing colors an element can actually be. Deliberately a small fixed
// set rather than a free colour picker: a design system with six brand colours
// stays consistent, one with 16 million does not.
export const PALETTE = [
  '#FF9E45',
  '#E85D75',
  '#F5C84C',
  '#7BAE7F',
  '#5B8DBE',
  '#B98CE0',
];

export const INK = ['#F2F2F5', '#A8A8B0', '#57575E', '#0F0F11'];

export const SURFACES = ['#0F0F11', '#101A2B', '#1A1020', '#141A12', '#F7F7F8'];

const opacity: Control = {
  kind: 'number',
  key: 'opacity',
  label: 'Opacity',
  unit: '%',
  min: 0,
  max: 100,
};

const alignOptions = ALIGN.map((v) => ({
  value: v,
  label: v === 'leading' ? 'Lead' : v === 'center' ? 'Center' : 'Trail',
}));

const directionOptions = DIRECTION.map((v) => ({
  value: v,
  label: v === 'vertical' ? 'Vertical' : 'Horizontal',
}));

const weightOptions = WEIGHT.map((v) => ({
  value: v,
  label: v.charAt(0).toUpperCase() + v.slice(1),
}));

export const NODE_DEFS: Record<NodeType, NodeTypeDef> = {
  screen: {
    label: 'Screen',
    icon: '▣',
    sections: [
      {
        label: 'Layout',
        controls: [
          {
            kind: 'segmented',
            key: 'direction',
            label: 'Direction',
            options: directionOptions,
          },
          { kind: 'number', key: 'gap', label: 'Gap', unit: 'px', min: 0, max: 64 },
          {
            kind: 'number',
            key: 'padding',
            label: 'Padding',
            unit: 'px',
            min: 0,
            max: 64,
          },
          {
            kind: 'segmented',
            key: 'align',
            label: 'Align',
            options: alignOptions,
          },
        ],
      },
      {
        label: 'Appearance',
        controls: [
          {
            kind: 'color',
            key: 'background',
            label: 'Background',
            swatches: SURFACES,
          },
        ],
      },
    ],
  },

  stack: {
    label: 'Stack',
    icon: '≡',
    sections: [
      {
        label: 'Layout',
        controls: [
          {
            kind: 'segmented',
            key: 'direction',
            label: 'Direction',
            options: directionOptions,
          },
          { kind: 'number', key: 'gap', label: 'Gap', unit: 'px', min: 0, max: 64 },
          {
            kind: 'number',
            key: 'padding',
            label: 'Padding',
            unit: 'px',
            min: 0,
            max: 48,
          },
          {
            kind: 'segmented',
            key: 'align',
            label: 'Align',
            options: alignOptions,
          },
        ],
      },
      { label: 'Appearance', controls: [opacity] },
    ],
  },

  text: {
    label: 'Text',
    icon: 'T',
    sections: [
      {
        label: 'Content',
        controls: [{ kind: 'text', key: 'content', label: 'Text' }],
      },
      {
        label: 'Type',
        controls: [
          { kind: 'number', key: 'size', label: 'Size', unit: 'px', min: 10, max: 64 },
          {
            kind: 'segmented',
            key: 'weight',
            label: 'Weight',
            options: weightOptions,
          },
          { kind: 'color', key: 'color', label: 'Color', swatches: [...INK, ...PALETTE] },
        ],
      },
      { label: 'Appearance', controls: [opacity] },
    ],
  },

  box: {
    label: 'Box',
    icon: '▢',
    sections: [
      {
        label: 'Fill',
        controls: [{ kind: 'fill', key: 'fill', label: 'Fill' }],
      },
      {
        label: 'Layout',
        controls: [
          { kind: 'number', key: 'height', label: 'Height', unit: 'px', min: 24, max: 400 },
        ],
      },
      {
        label: 'Appearance',
        controls: [
          {
            kind: 'number',
            key: 'cornerRadius',
            label: 'Corner Radius',
            unit: 'px',
            min: 0,
            max: 64,
          },
          { kind: 'toggle', key: 'shadow', label: 'Drop shadow' },
          opacity,
        ],
      },
    ],
  },

  button: {
    label: 'Button',
    icon: '◉',
    sections: [
      {
        label: 'Content',
        controls: [{ kind: 'text', key: 'label', label: 'Label' }],
      },
      {
        label: 'Fill',
        controls: [{ kind: 'fill', key: 'fill', label: 'Fill' }],
      },
      {
        label: 'Layout',
        controls: [
          { kind: 'number', key: 'height', label: 'Height', unit: 'px', min: 32, max: 88 },
        ],
      },
      {
        label: 'Appearance',
        controls: [
          {
            kind: 'number',
            key: 'cornerRadius',
            label: 'Corner Radius',
            unit: 'px',
            min: 0,
            max: 44,
          },
          { kind: 'color', key: 'textColor', label: 'Label Color', swatches: INK },
          opacity,
        ],
      },
    ],
  },
};
