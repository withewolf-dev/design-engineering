'use client';

import { NODE_DEFS } from '@/lib/nodeTypes';
import { flatten } from '@/lib/schema';
import { useEditor } from '@/lib/store';

export function LayerTree() {
  const root = useEditor((s) => s.doc.root);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const rows = flatten(root);

  return (
    <div>
      {rows.map(({ node, depth }) => {
        const def = NODE_DEFS[node.type];
        const active = selectedId === node.id;
        return (
          <button
            key={node.id}
            onClick={() => select(node.id)}
            style={{ paddingLeft: 14 + depth * 16 }}
            className={`flex w-full items-center gap-2 border-l-2 py-[6px] pr-[14px] text-left text-[12.5px] ${
              active
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-dim)] hover:bg-white/[0.04]'
            }`}
          >
            <span
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-[var(--panel-2)] text-[10px] ${
                active ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'
              }`}
            >
              {def.icon}
            </span>
            <span className="truncate">{node.name}</span>
            {node.interaction && (
              <span
                className="ml-auto text-[10px] text-[var(--accent)]"
                title="Has an interaction"
              >
                ⚡
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
