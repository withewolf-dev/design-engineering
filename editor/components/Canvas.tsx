'use client';

import { useEffect, useRef, useState } from 'react';
import { at, sampleMotion } from '@/lib/motion';
import { alignToCss, fillToCss, weightToCss } from '@/lib/render';
import type { SceneNode } from '@/lib/schema';
import { findNode, isContainer } from '@/lib/schema';
import { useEditor } from '@/lib/store';

// The canvas renders the tree. That is its whole job — it holds no state of its
// own about what anything looks like, so there is exactly one description of
// the design in the system and no chance of the preview and the export
// disagreeing.

function NodeView({ node }: { node: SceneNode }) {
  const selectedId = useEditor((s) => s.selectedId);
  const focus = useEditor((s) => s.focus);
  const select = useEditor((s) => s.select);

  const selected = selectedId === node.id;
  // Drilling into a fill still means the box it belongs to is what's selected.
  const outline = selected
    ? focus === 'fill' || focus === 'node' || focus === 'interaction' || focus === 'motion'
    : false;

  const ring = outline ? '0 0 0 2px var(--accent)' : undefined;

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    select(node.id);
  }

  switch (node.type) {
    case 'screen': {
      const p = node.props;
      return (
        <div
          onClick={onClick}
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
          className="flex w-full cursor-pointer rounded-lg"
          style={{
            flexDirection: p.direction === 'vertical' ? 'column' : 'row',
            alignItems: alignToCss(p.align),
            gap: p.gap,
            padding: p.padding,
            opacity: p.opacity / 100,
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
          onClick={onClick}
          className="cursor-pointer rounded px-1 py-px"
          style={{
            fontSize: p.size,
            fontWeight: weightToCss(p.weight),
            color: p.color,
            opacity: p.opacity / 100,
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
          onClick={onClick}
          className="w-full cursor-pointer"
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
          }}
        />
      );
    }

    case 'button': {
      const p = node.props;
      return (
        <button
          onClick={onClick}
          className="flex w-full items-center justify-center font-semibold"
          style={{
            minHeight: p.height,
            borderRadius: p.cornerRadius,
            background: fillToCss(p.fill),
            color: p.textColor,
            opacity: p.opacity / 100,
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

export function Canvas() {
  const root = useEditor((s) => s.doc.root);
  const select = useEditor((s) => s.select);
  const playToken = useEditor((s) => s.playToken);
  const playNodeId = useEditor((s) => s.playNodeId);

  const [sheet, setSheet] = useState({ progress: 0, title: '' });
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!playToken || !playNodeId) return;
    const node = findNode(root, playNodeId);
    const interaction = node?.interaction;
    if (!interaction) return;

    const sampled = sampleMotion(interaction.motion);
    const title = interaction.actionLabel ?? 'Details';
    // Replay always runs open → closed → open? No: it opens if closed, closes if
    // open, so repeated presses read as operating the sheet rather than as a
    // demo loop.
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
              <NodeView node={root} />
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
    </div>
  );
}
