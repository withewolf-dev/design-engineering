'use client';

import { motionLabel } from '@/lib/motion';
import type { Control } from '@/lib/nodeTypes';
import { NODE_DEFS } from '@/lib/nodeTypes';
import { fillToCss } from '@/lib/render';
import type { Fill, SceneNode } from '@/lib/schema';
import { propsOf } from '@/lib/schema';
import { useEditor, useSelectedNode } from '@/lib/store';
import {
  NumberField,
  RowButton,
  Section,
  Segmented,
  SwatchRow,
  TextField,
  ToggleField,
} from './controls';
import { GradientEditor } from './GradientEditor';
import { MotionEditor } from './MotionEditor';

// The inspector is a router, not a form.
//
// It resolves what to show from two things: which node is selected, and how
// deep into it you've drilled. Element-level properties come out of the
// descriptor registry, so this file contains no per-type layout at all — the
// only hand-written panels are the two that genuinely need custom instruments.

function ControlRow({ node, control }: { node: SceneNode; control: Control }) {
  const begin = useEditor((s) => s.begin);
  const setProp = useEditor((s) => s.setProp);
  const setFocus = useEditor((s) => s.setFocus);
  const props = propsOf(node);

  switch (control.kind) {
    case 'number':
      return (
        <NumberField
          label={control.label}
          value={(props[control.key] as number) ?? 0}
          unit={control.unit}
          min={control.min}
          max={control.max}
          step={control.step}
          onBegin={begin}
          onChange={(v) => setProp(node.id, control.key, v)}
        />
      );

    case 'color':
      return (
        <div>
          <div className="pb-1 text-[12.5px] text-[var(--text-dim)]">
            {control.label}
          </div>
          <SwatchRow
            value={(props[control.key] as string) ?? ''}
            swatches={control.swatches}
            onPick={(color) => {
              begin();
              setProp(node.id, control.key, color);
            }}
          />
        </div>
      );

    case 'segmented':
      return (
        <div className="py-[5px]">
          <div className="pb-[6px] text-[12.5px] text-[var(--text-dim)]">
            {control.label}
          </div>
          <Segmented
            value={(props[control.key] as string) ?? ''}
            options={control.options}
            onPick={(v) => {
              begin();
              setProp(node.id, control.key, v);
            }}
          />
        </div>
      );

    case 'toggle':
      return (
        <ToggleField
          label={control.label}
          value={Boolean(props[control.key])}
          onChange={(v) => {
            begin();
            setProp(node.id, control.key, v);
          }}
        />
      );

    case 'text':
      return (
        <TextField
          value={(props[control.key] as string) ?? ''}
          onBegin={begin}
          onChange={(v) => setProp(node.id, control.key, v)}
        />
      );

    case 'fill': {
      const fill = props[control.key] as Fill;
      return (
        <button
          onClick={() => setFocus('fill')}
          className="my-[2px] flex w-full items-center gap-[9px] rounded-lg border border-[var(--line-strong)] bg-[var(--panel-2)] px-[9px] py-2 hover:border-[var(--accent)]"
        >
          <span
            className="h-[18px] w-[18px] shrink-0 rounded-[5px]"
            style={{
              backgroundImage: fillToCss(fill),
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
            }}
          />
          <span className="flex-1 text-left text-[12.5px]">
            {fill.type === 'gradient'
              ? `Gradient · ${fill.stops.length} stops`
              : 'Solid'}
          </span>
          <span className="text-[13px] text-[var(--text-faint)]">›</span>
        </button>
      );
    }
  }
}

function Breadcrumb({ node }: { node: SceneNode }) {
  const focus = useEditor((s) => s.focus);
  const setFocus = useEditor((s) => s.setFocus);

  const trail: Array<{ label: string; to?: () => void }> = [
    { label: node.name, to: focus === 'node' ? undefined : () => setFocus('node') },
  ];
  if (focus === 'fill') trail.push({ label: 'Fill' });
  if (focus === 'interaction') trail.push({ label: 'Interaction' });
  if (focus === 'motion') {
    trail.push({ label: 'Interaction', to: () => setFocus('interaction') });
    trail.push({ label: 'Motion' });
  }

  return (
    <div className="flex flex-wrap items-center gap-[6px] text-[12.5px]">
      {trail.map((item, i) => (
        <span key={i} className="flex items-center gap-[6px]">
          {i > 0 && <span className="text-[var(--text-faint)]">/</span>}
          {item.to ? (
            <button
              onClick={item.to}
              className="text-[var(--text-dim)] hover:text-[var(--accent)]"
            >
              {item.label}
            </button>
          ) : (
            <span className="font-semibold text-[var(--text)]">{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-4 p-[14px]">
      <p className="m-0 text-[13px] leading-relaxed text-[var(--text-dim)]">
        Select a layer — in the tree, or on the canvas. This panel rebuilds
        around what you pick instead of showing every property at once.
      </p>
      <div className="flex flex-col gap-[10px]">
        {[
          ['Element', 'Fill, radius, type — whatever that node actually has.'],
          ['Interaction', 'The trigger and action bound to it.'],
          ['Motion', 'The curve underneath, tuned by feel.'],
        ].map(([tag, copy]) => (
          <div key={tag} className="flex items-baseline gap-[9px] text-[12px]">
            <span className="shrink-0 rounded bg-[var(--accent-soft)] px-[6px] py-[2px] font-mono text-[10.5px] uppercase tracking-wide text-[var(--accent)]">
              {tag}
            </span>
            <span className="text-[var(--text-dim)]">{copy}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Inspector() {
  const node = useSelectedNode();
  const focus = useEditor((s) => s.focus);
  const setFocus = useEditor((s) => s.setFocus);

  if (!node) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--line)] px-[14px] py-3">
          <span className="text-[12.5px] text-[var(--text-faint)]">
            Nothing selected
          </span>
        </div>
        <EmptyState />
      </div>
    );
  }

  const def = NODE_DEFS[node.type];
  const fill = propsOf(node).fill as Fill | undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-[14px] py-3">
        <Breadcrumb node={node} />
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto pb-6">
        {focus === 'fill' && fill ? (
          <GradientEditor nodeId={node.id} fill={fill} />
        ) : focus === 'motion' && node.interaction ? (
          <MotionEditor nodeId={node.id} motion={node.interaction.motion} />
        ) : focus === 'interaction' && node.interaction ? (
          <Section label="Interaction">
            <RowButton
              icon="☞"
              title="Trigger"
              subtitle={node.interaction.trigger === 'tap' ? 'Tap' : 'Long press'}
            />
            <RowButton
              icon="→"
              title="Action"
              subtitle={
                node.interaction.action === 'openSheet'
                  ? `Open "${node.interaction.actionLabel ?? 'sheet'}"`
                  : node.interaction.action
              }
            />
            <RowButton
              icon="∿"
              title="Motion"
              subtitle={motionLabel(node.interaction.motion)}
              onClick={() => setFocus('motion')}
            />
          </Section>
        ) : (
          <>
            <div className="border-b border-[var(--line)] px-[14px] py-[10px]">
              <span className="eyebrow">{def.label}</span>
            </div>

            {def.sections.map((section) => (
              <Section key={section.label} label={section.label}>
                {section.controls.map((control) => (
                  <ControlRow key={control.key} node={node} control={control} />
                ))}
              </Section>
            ))}

            {node.interaction && (
              <Section label="Interaction">
                <RowButton
                  icon="⚡"
                  title={
                    node.interaction.trigger === 'tap' ? 'On tap' : 'On long press'
                  }
                  subtitle={`${
                    node.interaction.action === 'openSheet'
                      ? `Open "${node.interaction.actionLabel ?? 'sheet'}"`
                      : node.interaction.action
                  } · ${motionLabel(node.interaction.motion)}`}
                  onClick={() => setFocus('interaction')}
                />
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
