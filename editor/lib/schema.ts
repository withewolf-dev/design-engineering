import { z } from 'zod';

// The node tree is the single source of truth.
//
// Everything downstream reads this and only this: the canvas renders it, the
// inspector edits it, the code panel compiles it. When AI generation lands, it
// becomes another writer into this same shape — which is the whole reason the
// schema is defined once, in Zod, rather than as loose TypeScript interfaces.
// The same schema can be handed to a model as a structured-output contract, so
// a generated screen is validated against the exact shape the editor can edit.

export const ALIGN = ['leading', 'center', 'trailing'] as const;
export const DIRECTION = ['vertical', 'horizontal'] as const;
export const WEIGHT = ['regular', 'medium', 'semibold', 'bold'] as const;
export const EASING = ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const;

export type Align = (typeof ALIGN)[number];
export type Direction = (typeof DIRECTION)[number];
export type Weight = (typeof WEIGHT)[number];
export type Easing = (typeof EASING)[number];

// ---------------------------------------------------------------- fills

export const gradientStopSchema = z.object({
  pos: z.number().min(0).max(100),
  color: z.string(),
});

export const fillSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: z.string() }),
  z.object({
    type: z.literal('gradient'),
    angle: z.number().min(0).max(360),
    stops: z.array(gradientStopSchema).min(2),
  }),
]);

export type GradientStop = z.infer<typeof gradientStopSchema>;
export type Fill = z.infer<typeof fillSchema>;

// ---------------------------------------------------------------- motion

// Spring and timing are genuinely different models, not one model with unused
// fields — a spring has no duration (it settles when it settles) and a timing
// curve has no stiffness. Modelling them as a union keeps the inspector honest:
// it can only ever show the controls that actually drive the output.
export const motionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('spring'),
    stiffness: z.number().min(20).max(600),
    damping: z.number().min(2).max(60),
  }),
  z.object({
    type: z.literal('timing'),
    duration: z.number().min(60).max(2000),
    easing: z.enum(EASING),
  }),
]);

export type Motion = z.infer<typeof motionSchema>;

export const interactionSchema = z.object({
  trigger: z.enum(['tap', 'longPress']),
  action: z.enum(['openSheet', 'navigate', 'toggleState']),
  actionLabel: z.string().optional(),
  motion: motionSchema,
});

export type Interaction = z.infer<typeof interactionSchema>;

// ---------------------------------------------------------------- nodes

export const NODE_TYPES = ['screen', 'stack', 'text', 'box', 'button'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export interface ScreenProps {
  background: string;
  padding: number;
  gap: number;
  direction: Direction;
  align: Align;
}
export interface StackProps {
  direction: Direction;
  gap: number;
  padding: number;
  align: Align;
  opacity: number;
}
export interface TextProps {
  content: string;
  size: number;
  weight: Weight;
  color: string;
  opacity: number;
}
export interface BoxProps {
  fill: Fill;
  cornerRadius: number;
  height: number;
  shadow: boolean;
  opacity: number;
}
export interface ButtonProps {
  label: string;
  fill: Fill;
  textColor: string;
  cornerRadius: number;
  height: number;
  opacity: number;
}

export type NodePropsMap = {
  screen: ScreenProps;
  stack: StackProps;
  text: TextProps;
  box: BoxProps;
  button: ButtonProps;
};

interface NodeCommon {
  id: string;
  name: string;
  interaction?: Interaction;
}

export type SceneNode = {
  [K in NodeType]: NodeCommon & {
    type: K;
    props: NodePropsMap[K];
    children?: K extends 'screen' | 'stack' ? SceneNode[] : never;
  };
}[NodeType];

export type ContainerNode = Extract<SceneNode, { type: 'screen' | 'stack' }>;

export function isContainer(node: SceneNode): node is ContainerNode {
  return node.type === 'screen' || node.type === 'stack';
}

/**
 * Props as an index-signature bag.
 *
 * The descriptor-driven inspector addresses props by string key, which the
 * per-type prop interfaces deliberately don't allow — that strictness is what
 * makes the renderer and codegen safe. This is the one sanctioned crossing
 * between the two worlds, kept in a single named function so the cast is
 * auditable rather than sprinkled through the UI.
 */
export function propsOf(node: SceneNode): Record<string, unknown> {
  return node.props as unknown as Record<string, unknown>;
}

// Zod mirror of the node tree. `children` defers through z.lazy so the
// recursive reference resolves at parse time rather than at module init.
const childrenField = z.array(z.lazy(() => sceneNodeSchema));

const nodeCommon = {
  id: z.string(),
  name: z.string(),
  interaction: interactionSchema.optional(),
};

export const sceneNodeSchema: z.ZodType<SceneNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      ...nodeCommon,
      type: z.literal('screen'),
      props: z.object({
        background: z.string(),
        padding: z.number(),
        gap: z.number(),
        direction: z.enum(DIRECTION),
        align: z.enum(ALIGN),
      }),
      children: childrenField.optional(),
    }),
    z.object({
      ...nodeCommon,
      type: z.literal('stack'),
      props: z.object({
        direction: z.enum(DIRECTION),
        gap: z.number(),
        padding: z.number(),
        align: z.enum(ALIGN),
        opacity: z.number(),
      }),
      children: childrenField.optional(),
    }),
    z.object({
      ...nodeCommon,
      type: z.literal('text'),
      props: z.object({
        content: z.string(),
        size: z.number(),
        weight: z.enum(WEIGHT),
        color: z.string(),
        opacity: z.number(),
      }),
    }),
    z.object({
      ...nodeCommon,
      type: z.literal('box'),
      props: z.object({
        fill: fillSchema,
        cornerRadius: z.number(),
        height: z.number(),
        shadow: z.boolean(),
        opacity: z.number(),
      }),
    }),
    z.object({
      ...nodeCommon,
      type: z.literal('button'),
      props: z.object({
        label: z.string(),
        fill: fillSchema,
        textColor: z.string(),
        cornerRadius: z.number(),
        height: z.number(),
        opacity: z.number(),
      }),
    }),
  ]) as unknown as z.ZodType<SceneNode>,
);

export const documentSchema = z.object({
  name: z.string(),
  root: sceneNodeSchema,
});

export type SceneDocument = z.infer<typeof documentSchema>;

// ---------------------------------------------------------------- tree ops

export function findNode(node: SceneNode, id: string): SceneNode | null {
  if (node.id === id) return node;
  if (!isContainer(node) || !node.children) return null;
  for (const child of node.children) {
    const hit = findNode(child, id);
    if (hit) return hit;
  }
  return null;
}

export function findParent(
  node: SceneNode,
  id: string,
): ContainerNode | null {
  if (!isContainer(node) || !node.children) return null;
  for (const child of node.children) {
    if (child.id === id) return node;
    const hit = findParent(child, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Is `id` inside `ancestorId`? The guard that stops a drag from dropping a
 * stack into its own child, which would detach that subtree from the document
 * and lose it.
 */
export function isDescendant(
  root: SceneNode,
  ancestorId: string,
  id: string,
): boolean {
  if (id === ancestorId) return false;
  const ancestor = findNode(root, ancestorId);
  if (!ancestor || !isContainer(ancestor)) return false;
  return findNode(ancestor, id) !== null;
}

/** Depth-first walk, yielding each node with its depth for the layer tree. */
export function flatten(
  node: SceneNode,
  depth = 0,
): Array<{ node: SceneNode; depth: number }> {
  const out = [{ node, depth }];
  if (isContainer(node) && node.children) {
    for (const child of node.children) out.push(...flatten(child, depth + 1));
  }
  return out;
}
