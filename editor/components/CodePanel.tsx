'use client';

import { useMemo, useState } from 'react';
import { generateSwift, tokenizeSwift } from '@/lib/codegen';
import { useEditor } from '@/lib/store';

// Always visible, never behind an export step.
//
// Hiding the output until someone asks for it is what lets a design and its
// implementation drift: the designer never sees the consequence of a choice,
// and the developer receives a surprise. Keeping it on screen makes the code a
// running commentary on the canvas — and makes an unreasonable value obvious
// while it is still cheap to change.

export function CodePanel() {
  const doc = useEditor((s) => s.doc);
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => generateSwift(doc), [doc]);
  const lines = useMemo(() => code.split('\n'), [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-[14px] pb-2 pt-3">
        <span className="eyebrow">SwiftUI</span>
        <button
          onClick={copy}
          className="rounded border border-[var(--line-strong)] px-[7px] py-[2px] text-[11px] text-[var(--text-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto bg-[var(--panel-2)] px-[14px] py-3">
        <pre className="m-0 font-mono text-[11px] leading-[1.65]">
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre">
              {tokenizeSwift(line).map((token, j) => (
                <span key={j} className={token.cls}>
                  {token.text}
                </span>
              ))}
              {line === '' ? ' ' : ''}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
