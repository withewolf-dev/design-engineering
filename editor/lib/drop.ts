import type { ContainerNode, SceneNode } from './schema';
import { findNode, findParent, flatten, isContainer, isDescendant } from './schema';

// Where would this land if I let go now — and what has to move to make room?
//
// Resolved from DOM rects rather than the tree's own numbers, because the
// layout engine, not the document, decides where things actually sit once gap,
// padding and alignment have been applied.
//
// Those rects are snapshotted ONCE at drag start and reused for the whole
// gesture. Measuring live would feed the sibling transforms back into the
// hit-test — elements would shift, the shift would change the drop index, and
// the index would change the shift — and the stack would oscillate under the
// cursor.

export interface DropTarget {
  parentId: string;
  /** Index into the target's children WITH the dragged node excluded. */
  index: number;
  line: { left: number; top: number; width: number; height: number };
  /** True when the target has no other children, so nothing can open a gap and
   *  a line is the only affordance available. */
  empty: boolean;
}

export type Shifts = Map<string, { x: number; y: number }>;

const LINE = 2;
const INSET = 6;

export function snapshotRects(elements: Map<string, HTMLElement>): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  for (const [id, el] of elements) rects.set(id, el.getBoundingClientRect());
  return rects;
}

export function computeDrop(
  pointerX: number,
  pointerY: number,
  root: SceneNode,
  rects: Map<string, DOMRect>,
  dragId: string,
): DropTarget | null {
  // Only containers receive, and never the dragged node or anything inside it —
  // dropping a stack into its own child would orphan that subtree.
  let best: { node: ContainerNode; depth: number; rect: DOMRect } | null = null;

  for (const { node, depth } of flatten(root)) {
    if (!isContainer(node)) continue;
    if (node.id === dragId || isDescendant(root, dragId, node.id)) continue;
    const rect = rects.get(node.id);
    if (!rect) continue;
    const inside =
      pointerX >= rect.left &&
      pointerX <= rect.right &&
      pointerY >= rect.top &&
      pointerY <= rect.bottom;
    // Deepest wins, so a nested stack claims the drop over the screen behind it.
    if (inside && (!best || depth > best.depth)) best = { node, depth, rect };
  }

  if (!best) return null;

  const vertical = best.node.props.direction === 'vertical';
  const siblings = (best.node.children ?? []).filter((c) => c.id !== dragId);
  const sibRects = siblings
    .map((c) => rects.get(c.id))
    .filter((r): r is DOMRect => Boolean(r));

  // Insert before the first sibling whose midpoint the pointer has not yet
  // passed; past all of them means append.
  let index = sibRects.length;
  for (let i = 0; i < sibRects.length; i++) {
    const r = sibRects[i];
    const mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
    if ((vertical ? pointerY : pointerX) < mid) {
      index = i;
      break;
    }
  }

  const box = best.rect;
  let line: DropTarget['line'];

  if (sibRects.length === 0) {
    line = vertical
      ? {
          left: box.left + INSET,
          top: box.top + box.height / 2 - LINE / 2,
          width: box.width - INSET * 2,
          height: LINE,
        }
      : {
          left: box.left + box.width / 2 - LINE / 2,
          top: box.top + INSET,
          width: LINE,
          height: box.height - INSET * 2,
        };
  } else {
    const edge =
      index < sibRects.length
        ? vertical
          ? sibRects[index].top
          : sibRects[index].left
        : vertical
          ? sibRects[sibRects.length - 1].bottom
          : sibRects[sibRects.length - 1].right;

    line = vertical
      ? {
          left: box.left + INSET,
          top: edge - LINE / 2,
          width: box.width - INSET * 2,
          height: LINE,
        }
      : {
          left: edge - LINE / 2,
          top: box.top + INSET,
          width: LINE,
          height: box.height - INSET * 2,
        };
  }

  return { parentId: best.node.id, index, line, empty: sibRects.length === 0 };
}

/**
 * How far each sibling must move so the gap appears where the node will land.
 *
 * The dragged element keeps its slot in the layout for the whole gesture — it
 * is only translated away visually — which means there is always exactly one
 * hole in the stack. Sliding the siblings between its origin and its target
 * walks that hole to where the drop will happen. Nothing is added or removed,
 * so no reflow occurs and every frame is a pure transform.
 */
export function computeShifts(
  root: SceneNode,
  rects: Map<string, DOMRect>,
  dragId: string,
  drop: DropTarget | null,
): Shifts {
  const shifts: Shifts = new Map();
  const dragRect = rects.get(dragId);
  const source = findParent(root, dragId);
  if (!dragRect || !source?.children || !drop) return shifts;

  const target = findNode(root, drop.parentId);
  if (!target || !isContainer(target)) return shifts;

  const move = (node: SceneNode, amount: number, vertical: boolean) => {
    shifts.set(node.id, vertical ? { x: 0, y: amount } : { x: amount, y: 0 });
  };

  const sourceVertical = source.props.direction === 'vertical';
  const sourceSiblings = source.children.filter((c) => c.id !== dragId);
  const origin = source.children.findIndex((c) => c.id === dragId);

  if (source.id === target.id) {
    const step =
      (sourceVertical ? dragRect.height : dragRect.width) + source.props.gap;
    // Everything the node passes over slides back by one slot, which is the
    // same thing as the hole sliding forward to meet the cursor.
    if (drop.index > origin) {
      for (let i = origin; i < drop.index; i++) {
        move(sourceSiblings[i], -step, sourceVertical);
      }
    } else if (drop.index < origin) {
      for (let i = drop.index; i < origin; i++) {
        move(sourceSiblings[i], step, sourceVertical);
      }
    }
    return shifts;
  }

  // Crossing containers: close the hole behind it, open one in front.
  const closeStep =
    (sourceVertical ? dragRect.height : dragRect.width) + source.props.gap;
  for (let i = origin; i < sourceSiblings.length; i++) {
    move(sourceSiblings[i], -closeStep, sourceVertical);
  }

  const targetVertical = target.props.direction === 'vertical';
  const openStep =
    (targetVertical ? dragRect.height : dragRect.width) + target.props.gap;
  const targetSiblings = (target.children ?? []).filter((c) => c.id !== dragId);
  for (let i = drop.index; i < targetSiblings.length; i++) {
    move(targetSiblings[i], openStep, targetVertical);
  }

  return shifts;
}
