import type { ContainerNode, SceneNode } from './schema';
import { flatten, isContainer, isDescendant } from './schema';

// Where would this land if I let go now?
//
// Resolved from live DOM rects rather than from the tree's own numbers,
// because the layout engine — not the document — decides where things actually
// sit once gap, padding and alignment have been applied. Measuring the result
// means the insertion line is drawn where the element will really go, which is
// the only version of this that can be trusted.

export interface DropTarget {
  parentId: string;
  /** Index into the target's children WITH the dragged node excluded. */
  index: number;
  line: { left: number; top: number; width: number; height: number };
}

const LINE = 2;
const INSET = 6;

export function computeDrop(
  pointerX: number,
  pointerY: number,
  root: SceneNode,
  elements: Map<string, HTMLElement>,
  dragId: string,
): DropTarget | null {
  // Only containers receive, and never the dragged node or anything inside it —
  // dropping a stack into its own child would orphan that subtree.
  let best: { node: ContainerNode; depth: number; rect: DOMRect } | null = null;

  for (const { node, depth } of flatten(root)) {
    if (!isContainer(node)) continue;
    if (node.id === dragId || isDescendant(root, dragId, node.id)) continue;
    const el = elements.get(node.id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
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
  const rects = siblings
    .map((c) => elements.get(c.id)?.getBoundingClientRect())
    .filter((r): r is DOMRect => Boolean(r));

  // Insert before the first sibling whose midpoint the pointer has not yet
  // passed; past all of them means append.
  let index = rects.length;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
    if ((vertical ? pointerY : pointerX) < mid) {
      index = i;
      break;
    }
  }

  const box = best.rect;
  let line: DropTarget['line'];

  if (rects.length === 0) {
    // Empty container: mark its middle, so the line still says "in here".
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
      index < rects.length
        ? vertical
          ? rects[index].top
          : rects[index].left
        : vertical
          ? rects[rects.length - 1].bottom
          : rects[rects.length - 1].right;

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

  return { parentId: best.node.id, index, line };
}
