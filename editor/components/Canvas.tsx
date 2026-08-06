'use client';

import {
  createContext,
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

// Sliding out of the way is a response, so it eases and takes time. The thing
// under the finger is not — it tracks 1:1, because anything else reads as the
// app lagging rather than as the card having weight.
const SETTLE = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
const LAND = 'transform 240ms cubic-bezier(0.2, 0, 0, 1)';
const DRAG_THRESHOLD = 4;

interface CanvasCtx {
  register: (id: string, el: HTMLElement | null) => void;
  startDrag: (id: string, e: React.PointerEvent) => void;
  draggingId: string | null;
  dragOffset: { x: number; y: number };
  shifts: Shifts;
  suppressClick: React.RefObject<boolean>;
}

const Ctx = createContext<CanvasCtx | null>(null);

function useCanvas(): CanvasCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('NodeView must render inside Canvas');
  return ctx;
}

/** Transform, transition and stacking for a node mid-drag. Shared by every node
 *  type so a button lifts exactly like a card does. */
function useDragStyle(nodeId: string): React.CSSProperties {
  const { draggingId, dragOffset, shifts } = useCanvas();
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
  const { register, startDrag, suppressClick } = useCanvas();
  const drag = useDragStyle(node.id);

  const selected = selectedId === node.id;
  const ring = selected ? '0 0 0 2px var(--accent)' : undefined;
  const isRoot = node.type === 'screen';

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (suppressClick.current) return;
    select(node.id);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (isRoot) return;
    e.stopPropagation();
    startDrag(node.id, e);
  }

  const common = { onClick, onPointerDown };

  switch (node.type) {
    case 'screen': {
      const p = node.props;
      return (
        <div
          onClick={onClick}
          ref={(el) => register(node.id, el)}
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
          {...common}
          ref={(el: HTMLDivElement | null) => register(node.id, el)}
          className="flex w-full cursor-grab touch-none rounded-lg active:cursor-grabbing"
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
          {...common}
          ref={(el: HTMLSpanElement | null) => register(node.id, el)}
          className="cursor-grab touch-none rounded px-1 py-px active:cursor-grabbing"
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
          {...common}
          ref={(el: HTMLDivElement | null) => register(node.id, el)}
          className="w-full cursor-grab touch-none active:cursor-grabbing"
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
          {...common}
          ref={(el: HTMLButtonElement | null) => register(node.id, el)}
          className="flex w-full cursor-grab touch-none items-center justify-center font-semibold active:cursor-grabbing"
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
  const begin = useEditor((s) => s.begin);
  const moveNode = useEditor((s) => s.moveNode);
  const playToken = useEditor((s) => s.playToken);
  const playNodeId = useEditor((s) => s.playNodeId);

  const [sheet, setSheet] = useState({ progress: 0, title: '' });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [shifts, setShifts] = useState<Shifts>(NO_SHIFTS);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const raf = useRef<number | null>(null);

  const elements = useRef(new Map<string, HTMLElement>()).current;
  const suppressClick = useRef(false);
  // Where the dragged node was on screen at the moment of release, so it can be
  // animated from there into whatever slot the commit gave it.
  const landing = useRef<{ id: string; rect: DOMRect } | null>(null);
  const dragActive = useRef(false);
  const rootRef = useRef(root);
  rootRef.current = root;

  function register(id: string, el: HTMLElement | null) {
    if (el) elements.set(id, el);
    else elements.delete(id);
  }

  function startDrag(id: string, e: React.PointerEvent) {
    // One gesture at a time. A drag interrupted without a pointerup — the
    // window losing focus, the OS cancelling the pointer — used to leave its
    // listeners attached, so the next release fired every stranded drag's
    // commit at once and moved several unrelated nodes.
    if (dragActive.current) return;
    dragActive.current = true;

    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    let finished = false;
    let latest: DropTarget | null = null;
    let rects: Map<string, DOMRect> | null = null;

    function move(ev: PointerEvent) {
      if (!active) {
        // A press that never travels is a click. Waiting for real movement is
        // what keeps selection working on elements that are also draggable.
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD)
          return;
        active = true;
        // Snapshot before anything is transformed, and reuse all gesture long.
        rects = snapshotRects(elements);
        setDraggingId(id);
        document.body.style.userSelect = 'none';
      }
      if (!rects) return;

      setDragOffset({ x: ev.clientX - startX, y: ev.clientY - startY });
      latest = computeDrop(ev.clientX, ev.clientY, rootRef.current, rects, id);
      setDrop(latest);
      setShifts(computeShifts(rootRef.current, rects, id, latest));
    }

    function finish(commit: boolean) {
      if (finished) return;
      finished = true;
      dragActive.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      document.body.style.userSelect = '';

      if (active) {
        if (latest && commit) {
          const el = elements.get(id);
          if (el) landing.current = { id, rect: el.getBoundingClientRect() };
          begin();
          moveNode(id, latest.parentId, latest.index);
          select(id);
        }
        // The click that follows this pointerup would otherwise re-select
        // whatever the cursor happened to end up over.
        suppressClick.current = true;
        setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      setDraggingId(null);
      setDragOffset({ x: 0, y: 0 });
      setShifts(NO_SHIFTS);
      setDrop(null);
    }

    const onUp = () => finish(true);
    // Cancelling puts everything back rather than committing a drop the user
    // never released on.
    const onCancel = () => finish(false);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
  }

  // Fly the dropped node from where the finger left it into its new slot.
  //
  // The reorder itself is instant — it has to be, the document is the source of
  // truth — so this measures the gap the commit opened up and plays it back as
  // motion. Without it the node teleports, and the drag ends by contradicting
  // the gap the siblings just spent 200ms opening.
  useLayoutEffect(() => {
    const pending = landing.current;
    if (!pending) return;
    landing.current = null;

    const el = elements.get(pending.id);
    if (!el) return;
    const now = el.getBoundingClientRect();
    const dx = pending.rect.left - now.left;
    const dy = pending.rect.top - now.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;

    const id = requestAnimationFrame(() => {
      el.style.transition = LAND;
      el.style.transform = '';
      const clear = () => {
        el.style.transition = '';
        el.style.transform = '';
        el.removeEventListener('transitionend', clear);
      };
      el.addEventListener('transitionend', clear);
    });
    return () => cancelAnimationFrame(id);
  });

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
                  startDrag,
                  draggingId,
                  dragOffset,
                  shifts,
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
