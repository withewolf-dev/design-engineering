'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { DropTarget } from '@/lib/drop';
import { computeDrop } from '@/lib/drop';
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

interface CanvasCtx {
  register: (id: string, el: HTMLElement | null) => void;
  startDrag: (id: string, e: React.PointerEvent) => void;
  draggingId: string | null;
  suppressClick: React.RefObject<boolean>;
}

const Ctx = createContext<CanvasCtx | null>(null);

function useCanvas(): CanvasCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('NodeView must render inside Canvas');
  return ctx;
}

function NodeView({ node }: { node: SceneNode }) {
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const { register, startDrag, draggingId, suppressClick } = useCanvas();

  const selected = selectedId === node.id;
  const ring = selected ? '0 0 0 2px var(--accent)' : undefined;
  const isRoot = node.type === 'screen';
  // The node being dragged stays in place and goes translucent rather than
  // following the cursor: the insertion line already says where it will land,
  // and a floating copy would cover the very gaps it is aiming between.
  const dragOpacityFactor = draggingId === node.id ? 0.35 : 1;

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
            opacity: (p.opacity / 100) * dragOpacityFactor,
            boxShadow: ring,
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
            opacity: (p.opacity / 100) * dragOpacityFactor,
            letterSpacing: p.size <= 12 ? '0.07em' : undefined,
            boxShadow: ring,
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
            opacity: (p.opacity / 100) * dragOpacityFactor,
            boxShadow: [
              p.shadow ? '0 10px 26px -12px rgba(0,0,0,0.6)' : '',
              ring ?? '',
            ]
              .filter(Boolean)
              .join(', '),
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
            opacity: (p.opacity / 100) * dragOpacityFactor,
            fontSize: 15,
            boxShadow: ring,
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

const DRAG_THRESHOLD = 4;

export function Canvas() {
  const root = useEditor((s) => s.doc.root);
  const select = useEditor((s) => s.select);
  const begin = useEditor((s) => s.begin);
  const moveNode = useEditor((s) => s.moveNode);
  const playToken = useEditor((s) => s.playToken);
  const playNodeId = useEditor((s) => s.playNodeId);

  const [sheet, setSheet] = useState({ progress: 0, title: '' });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const raf = useRef<number | null>(null);

  const elements = useRef(new Map<string, HTMLElement>()).current;
  const suppressClick = useRef(false);
  // Read inside pointer handlers that outlive the render they were created in.
  const rootRef = useRef(root);
  rootRef.current = root;

  function register(id: string, el: HTMLElement | null) {
    if (el) elements.set(id, el);
    else elements.delete(id);
  }

  function startDrag(id: string, e: React.PointerEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    let latest: DropTarget | null = null;

    function move(ev: PointerEvent) {
      if (!active) {
        // A press that never travels is a click. Waiting for real movement is
        // what keeps selection working on elements that are also draggable.
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD)
          return;
        active = true;
        setDraggingId(id);
        document.body.style.userSelect = 'none';
      }
      latest = computeDrop(ev.clientX, ev.clientY, rootRef.current, elements, id);
      setDrop(latest);
    }

    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';

      if (active) {
        if (latest) {
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
      setDrop(null);
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

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
                value={{ register, startDrag, draggingId, suppressClick }}
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

      {/* Fixed-position so it can be drawn over the phone's rounded clip without
          being cut off by it, and so it never disturbs the layout it measures. */}
      {drop && (
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
