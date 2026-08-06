'use client';

import { useEffect } from 'react';
import { useEditor } from '@/lib/store';
import { Canvas } from './Canvas';
import { CodePanel } from './CodePanel';
import { Inspector } from './Inspector';
import { LayerTree } from './LayerTree';

export function Editor() {
  const docName = useEditor((s) => s.doc.name);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Never steal undo from a field someone is typing in — the browser's own
      // text undo is the correct behaviour there.
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="flex h-full flex-col bg-[var(--app)]">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-[var(--line)] bg-[var(--panel)] px-4">
        <div className="flex items-center gap-[6px] rounded-md bg-[#34d399] px-[9px] py-[5px] text-[12.5px] font-bold text-[#062018]">
          ▤ Design
        </div>
        <div className="mx-auto flex items-center gap-2 text-[12.5px] text-[var(--text-dim)]">
          <b className="font-semibold text-[var(--text)]">{docName}</b>
          <span>›</span>
          <span>Screen</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            className="rounded px-2 py-1 text-[13px] text-[var(--text-dim)] enabled:hover:bg-white/[0.06] enabled:hover:text-[var(--text)] disabled:opacity-30"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⇧⌘Z)"
            className="rounded px-2 py-1 text-[13px] text-[var(--text-dim)] enabled:hover:bg-white/[0.06] enabled:hover:text-[var(--text)] disabled:opacity-30"
          >
            ↷
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[250px_1fr_292px]">
        <aside className="scroll-thin flex min-h-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)]">
            <div className="eyebrow px-[14px] pb-2 pt-3">Layers</div>
            <LayerTree />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <CodePanel />
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <Canvas />
        </main>

        <aside className="min-h-0 border-l border-[var(--line)] bg-[var(--panel)]">
          <Inspector />
        </aside>
      </div>
    </div>
  );
}
