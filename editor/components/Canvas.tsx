'use client';

import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { disableNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { DropTarget, Shifts } from '@/lib/drop';
import { computeDrop, computeShifts, snapshotRects } from '@/lib/drop';
import { at, sampleMotion } from '@/lib/motion';
import { alignToCss, fillToCss, weightToCss } from '@/lib/render';
import type { SceneNode } from '@/lib/schema';
import { findNode, isContainer } from '@/lib/schema';
import { useEditor } from '@/lib/store';

// The canvas renders the tree. That is its whole job — it holds no state of its
// own about what anything looks like, so there is exactly one description of
// the design in the system and no chance of the preview and the export
// disagreeing.
//
// Dragging moves nodes BETWEEN and WITHIN stacks; it never assigns a position.
// Free placement would have to compile to `.offset(x:y:)`, which pins a design
// to the one screen size it was drawn on — the exact inconsistency this tool
// exists to remove. So a drop resolves to a parent and an index, and the
// generated VStack simply lists its children in a new order.
//
// The gesture lifecycle belongs to Pragmatic Drag and Drop. Hand-rolling it
// meant owning pointer capture, cancellation and cleanup, and the bug that came
// out of that — an interrupted drag leaving its listeners attached, so a later
// release committed several stranded drags at once — is precisely the class of
// problem a maintained library has already solved. What stays ours is the part
// that is actually about this product: which slot a drop resolves to, and how
// the stack opens to receive it.

// Sliding out of the way is a response, so it eases and takes time. The thing
// under the finger is not — it tracks 1:1, because anything else reads as the
// app lagging rather than as the card having weight.
const SETTLE = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
const LAND_MS = 240;
const LAND = `transform ${LAND_MS}ms cubic-bezier(0.2, 0, 0, 1)`;

/** A node flying from where it was released into the slot the commit gave it.
 *  Held as state, not written to the DOM, so React remains the only writer of
 *  `transform` — see the note on useDragStyle. */
interface Landing {
  id: string;
  dx: number;
  dy: number;
  animate: boolean;
}

interface CanvasCtx {
  register: (id: string, el: HTMLElement | null) => void;
  draggingId: string | null;
  dragOffset: { x: number; y: number };
  shifts: Shifts;
  landing: Landing | null;
  suppressClick: React.RefObject<boolean>;
}

const Ctx = createContext<CanvasCtx | null>(null);

function useCanvas(): CanvasCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('NodeView must render inside Canvas');
  return ctx;
}

/**
 * Wires one node into the drag system and into the rect registry.
 *
 * The element is tracked in state rather than a plain ref because the binding
 * has to be torn down and re-attached when React swaps the DOM node out — which
 * is exactly what a reorder does.
 */
function useNodeBinding(nodeId: string, isRoot: boolean) {
  const { register } = useCanvas();
  const [el, setEl] = useState<HTMLElement | null>(null);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      setEl(node);
      register(nodeId, node);
    },
    [nodeId, register],
  );

  useEffect(() => {
    if (!el) return;
    if (isRoot) {
      // The screen is the drop surface. Without a registered drop target the
      // browser refuses the drop outright and every gesture ends as a cancel.
      return dropTargetForElements({ element: el });
    }
    return draggable({
      element: el,
      getInitialData: () => ({ nodeId }),
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        // We draw the lift ourselves with a transform. The browser's ghost
        // would be a second copy of the same element chasing the cursor.
        disableNativeDragPreview({ nativeSetDragImage });
      },
    });
  }, [el, nodeId, isRoot]);

  return ref;
}

/**
 * Transform, transition and stacking for a node mid-drag. Shared by every node
 * type so a button lifts exactly like a card does.
 *
 * Every transform on this screen is produced here and nowhere else. An earlier
 * version animated the landing by assigning `el.style.transform` directly while
 * React was also writing that property from this style object — two writers,
 * one property. When the cleanup listener didn't fire, the inline value stayed
 * on the node forever and elements drifted out of the layout and overlapped
 * each other. Anything that needs to move now goes through state.
 */
function useDragStyle(nodeId: string): React.CSSProperties {
  const { draggingId, dragOffset, shifts, landing } = useCanvas();

  if (landing?.id === nodeId) {
    return {
      transform: `translate(${landing.dx}px, ${landing.dy}px)`,
      // First frame pins it where the finger left it; the next frame animates
      // to zero, which is now its real slot.
      transition: landing.animate ? LAND : 'none',
      zIndex: 40,
      position: 'relative',
    };
  }

  if (!draggingId) return {};

  if (draggingId === nodeId) {
    return {
      transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(1.03)`,
      transition: 'none',
      zIndex: 40,
      position: 'relative',
      pointerEvents: 'none',
      // Lifting it off the surface is what makes the gap below read as a hole
      // rather than as the layout having broken.
      filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.55))',
    };
  }

  const shift = shifts.get(nodeId) ?? { x: 0, y: 0 };
  return {
    transform: `translate(${shift.x}px, ${shift.y}px)`,
    transition: SETTLE,
  };
}

function NodeView({ node }: { node: SceneNode }) {
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const { suppressClick } = useCanvas();
  const drag = useDragStyle(node.id);

  const isRoot = node.type === 'screen';
  const ref = useNodeBinding(node.id, isRoot);
  const selected = selectedId === node.id;
  const ring = selected ? '0 0 0 2px var(--accent)' : undefined;

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (suppressClick.current) return;
    select(node.id);
  }

  switch (node.type) {
    case 'screen': {
      const p = node.props;
      return (
        <div
          onClick={onClick}
          ref={ref}
          className="flex h-full w-full cursor-default"
          style={{
            flexDirection: p.direction === 'vertical' ? 'column' : 'row',
            alignItems: alignToCss(p.align),
            gap: p.gap,
            padding: p.padding,
            background: p.background,
            boxShadow: ring,
            borderRadius: 30,
          }}
        >
          {isContainer(node) &&
            node.children?.map((child) => <NodeView key={child.id} node={child} />)}
        </div>
      );
    }

    case 'stack': {
      const p = node.props;
      return (
        <div
          onClick={onClick}
          ref={ref}
          className="flex w-full cursor-grab rounded-lg active:cursor-grabbing"
          style={{
            flexDirection: p.direction === 'vertical' ? 'column' : 'row',
            alignItems: alignToCss(p.align),
            gap: p.gap,
            padding: p.padding,
            opacity: p.opacity / 100,
            boxShadow: ring,
            ...drag,
          }}
        >
          {isContainer(node) &&
            node.children?.map((child) => <NodeView key={child.id} node={child} />)}
        </div>
      );
    }

    case 'text': {
      const p = node.props;
      return (
        <span
          onClick={onClick}
          ref={ref}
          className="cursor-grab rounded px-1 py-px active:cursor-grabbing"
          style={{
            fontSize: p.size,
            fontWeight: weightToCss(p.weight),
            color: p.color,
            opacity: p.opacity / 100,
            letterSpacing: p.size <= 12 ? '0.07em' : undefined,
            boxShadow: ring,
            ...drag,
          }}
        >
          {p.content}
        </span>
      );
    }

    case 'box': {
      const p = node.props;
      return (
        <div
          onClick={onClick}
          ref={ref}
          className="w-full cursor-grab active:cursor-grabbing"
          style={{
            minHeight: p.height,
            borderRadius: p.cornerRadius,
            background: fillToCss(p.fill),
            opacity: p.opacity / 100,
            boxShadow: [
              p.shadow ? '0 10px 26px -12px rgba(0,0,0,0.6)' : '',
              ring ?? '',
            ]
              .filter(Boolean)
              .join(', '),
            ...drag,
          }}
        />
      );
    }

    case 'button': {
      const p = node.props;
      return (
        <button
          onClick={onClick}
          ref={ref}
          className="flex w-full cursor-grab items-center justify-center font-semibold active:cursor-grabbing"
          style={{
            minHeight: p.height,
            borderRadius: p.cornerRadius,
            background: fillToCss(p.fill),
            color: p.textColor,
            opacity: p.opacity / 100,
            fontSize: 15,
            boxShadow: ring,
            ...drag,
          }}
        >
          {p.label}
        </button>
      );
    }
  }
}

/** The sheet the "openSheet" action presents, animated by the node's own motion
 *  so pressing Test shows the tuned curve on the real surface rather than on a
 *  proxy rectangle. */
function Sheet({ progress, title }: { progress: number; title: string }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: progress * 0.55 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[22px] border-t border-[var(--line-strong)] bg-[#1b1b1e] px-[18px] pb-6 pt-3"
        style={{ transform: `translateY(${(1 - progress) * 100}%)` }}
      >
        <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-[var(--line-strong)]" />
        <h2 className="m-0 mb-[5px] text-[15px] font-semibold">{title}</h2>
        <p className="m-0 text-[12.5px] leading-normal text-[var(--text-dim)]">
          Unlimited generations, priority queue, and export to Xcode.
        </p>
      </div>
    </>
  );
}

const NO_SHIFTS: Shifts = new Map();

export function Canvas() {
  const root = useEditor((s) => s.doc.root);
  const select = useEditor((s) => s.select);
  const playToken = useEditor((s) => s.playToken);
  const playNodeId = useEditor((s) => s.playNodeId);

  const [sheet, setSheet] = useState({ progress: 0, title: '' });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [shifts, setShifts] = useState<Shifts>(NO_SHIFTS);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const raf = useRef<number | null>(null);

  const elements = useRef(new Map<string, HTMLElement>()).current;
  const suppressClick = useRef(false);
  const [landing, setLanding] = useState<Landing | null>(null);
  // Where the dragged node was on screen at the moment of release, so it can be
  // animated from there into whatever slot the commit gave it.
  const released = useRef<{ id: string; rect: DOMRect } | null>(null);
  // Snapshotted once per gesture. Measuring live would feed the sibling
  // transforms back into the hit-test and oscillate under the cursor.
  const rects = useRef<Map<string, DOMRect> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const target = useRef<DropTarget | null>(null);
  const rootRef = useRef(root);
  rootRef.current = root;

  const register = useCallback(
    (id: string, el: HTMLElement | null) => {
      if (el) elements.set(id, el);
      else elements.delete(id);
    },
    [elements],
  );

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => typeof source.data.nodeId === 'string',

      onDragStart: ({ source, location }) => {
        const id = source.data.nodeId as string;
        rects.current = snapshotRects(elements);
        origin.current = {
          x: location.current.input.clientX,
          y: location.current.input.clientY,
        };
        target.current = null;
        setLanding(null);
        setDraggingId(id);
        setDragOffset({ x: 0, y: 0 });
      },

      onDrag: ({ source, location }) => {
        const id = source.data.nodeId as string;
        const snapshot = rects.current;
        if (!snapshot) return;
        const { clientX, clientY } = location.current.input;

        setDragOffset({
          x: clientX - origin.current.x,
          y: clientY - origin.current.y,
        });
        const next = computeDrop(clientX, clientY, rootRef.current, snapshot, id);
        target.current = next;
        setDrop(next);
        setShifts(computeShifts(rootRef.current, snapshot, id, next));
      },

      onDrop: ({ source, location }) => {
        const id = source.data.nodeId as string;
        const resolved = target.current;
        // onDrop fires however the gesture ended, including a cancel. An empty
        // dropTargets list is the only signal that it was not a real drop, so
        // this is where committing is decided.
        const landed = location.current.dropTargets.length > 0;

        if (landed && resolved) {
          const el = elements.get(id);
          if (el) released.current = { id, rect: el.getBoundingClientRect() };
          const store = useEditor.getState();
          store.begin();
          store.moveNode(id, resolved.parentId, resolved.index);
          store.select(id);
          suppressClick.current = true;
          setTimeout(() => {
            suppressClick.current = false;
          }, 0);
        }

        setDraggingId(null);
        setDragOffset({ x: 0, y: 0 });
        setShifts(NO_SHIFTS);
        setDrop(null);
        rects.current = null;
        target.current = null;
      },
    });
  }, [elements]);

  useEffect(() => {
    if (!scrollEl) return;
    return autoScrollForElements({ element: scrollEl });
  }, [scrollEl]);

  // Fly the dropped node from where the finger left it into its new slot.
  //
  // The reorder itself is instant — it has to be, the document is the source of
  // truth — so this measures the gap the commit opened up and plays it back as
  // motion. Without it the node teleports, and the drag ends by contradicting
  // the gap the siblings just spent 200ms opening.
  //
  // Measured in a layout effect, before the browser paints, so the node is
  // never seen in its new position without the offset applied.
  useLayoutEffect(() => {
    const pending = released.current;
    if (!pending) return;
    released.current = null;

    const el = elements.get(pending.id);
    if (!el) return;
    const now = el.getBoundingClientRect();
    const dx = pending.rect.left - now.left;
    const dy = pending.rect.top - now.top;
    // Landing where it was already sitting needs no animation, and starting one
    // would leave a transform to clean up for no visible gain.
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    setLanding({ id: pending.id, dx, dy, animate: false });
  });

  // Second frame: release it to zero and let the transition carry it home. The
  // state is dropped once the animation is over, which is also what removes the
  // transform — by then it is translate(0,0) and removing it changes nothing.
  useEffect(() => {
    if (!landing || landing.animate) return;
    const frame = requestAnimationFrame(() =>
      setLanding((prev) =>
        prev && prev.id === landing.id ? { ...prev, dx: 0, dy: 0, animate: true } : prev,
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [landing]);

  useEffect(() => {
    if (!landing?.animate) return;
    const timer = setTimeout(() => setLanding(null), LAND_MS + 60);
    return () => clearTimeout(timer);
  }, [landing]);

  useEffect(() => {
    if (!playToken || !playNodeId) return;
    const node = findNode(root, playNodeId);
    const interaction = node?.interaction;
    if (!interaction) return;

    const sampled = sampleMotion(interaction.motion);
    const title = interaction.actionLabel ?? 'Details';
    const opening = sheet.progress < 0.5;
    const start = performance.now();

    function frame(now: number) {
      const t = Math.min(1, (now - start) / sampled.durationMs);
      const raw = at(t, sampled);
      setSheet({ progress: opening ? raw : 1 - raw, title });
      if (t < 1) raf.current = requestAnimationFrame(frame);
    }
    raf.current = requestAnimationFrame(frame);

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // Deliberately keyed on the token only: re-running when `sheet` changes
    // would restart the animation on its own first frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);

  return (
    <div
      ref={setScrollEl}
      className="flex flex-1 items-center justify-center overflow-auto p-8"
      onClick={() => select(null)}
    >
      <div className="flex flex-col items-center gap-[10px]">
        <div
          className="relative h-[600px] w-[292px] shrink-0 rounded-[42px] border border-[var(--line-strong)] p-[9px]"
          style={{
            background: 'linear-gradient(180deg,#19191b,#0f0f11)',
            boxShadow: '0 30px 70px -30px rgba(0,0,0,0.85)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute left-1/2 top-[9px] z-10 h-5 w-[84px] -translate-x-1/2 rounded-xl bg-[#08080a]" />
          <div className="relative h-full overflow-hidden rounded-[33px]">
            <div className="flex justify-between px-4 pb-1 pt-3 font-mono text-[11px] text-[var(--text-dim)]">
              <span>9:41</span>
              <span>••• ▲ ■</span>
            </div>
            <div className="h-[calc(100%-28px)]">
              <Ctx.Provider
                value={{
                  register,
                  draggingId,
                  dragOffset,
                  shifts,
                  landing,
                  suppressClick,
                }}
              >
                <NodeView node={root} />
              </Ctx.Provider>
            </div>
            {sheet.progress > 0.001 && (
              <Sheet progress={sheet.progress} title={sheet.title} />
            )}
          </div>
        </div>
        <div className="rounded-md border border-[var(--line-strong)] bg-[var(--panel)] px-[9px] py-[3px] font-mono text-[11px] text-[var(--text-faint)]">
          292 × 600
        </div>
      </div>

      {/* Only when the target is empty. Everywhere else the gap the siblings
          opened IS the indicator, and a line on top of it is noise. */}
      {drop?.empty && (
        <div
          className="pointer-events-none fixed z-50 rounded-full bg-[var(--accent)]"
          style={{
            left: drop.line.left,
            top: drop.line.top,
            width: drop.line.width,
            height: drop.line.height,
            boxShadow: '0 0 8px var(--accent)',
          }}
        />
      )}
    </div>
  );
}
