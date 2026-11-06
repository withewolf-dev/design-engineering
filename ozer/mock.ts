import type { Spec } from '@json-render/core';
import { type ActionName, catalog, TEAM_ACTIONS } from './catalog';
import { route } from './fixtures';

// ── Contract (PRD "Backend contract"). Phase 2 swaps the Mock* classes for Http*; nothing else changes. ──

export type ChatReply = {
  text: string; // one-line summary, always first
  stream: AsyncIterable<string> | null; // SpecStream (JSONL patches) as raw text chunks; null = text-only answer
  cardId: string | null;
};
export interface ChatTransport {
  send(req: { conversationId: string; message: string; catalogVersion: number }, signal: AbortSignal): Promise<ChatReply>;
}

export type ActionResult = { status: 'ok' | 'rejected' | 'failed'; message: string; cardState?: Record<string, unknown> };
export interface ActionClient {
  run(req: { cardId: string; action: ActionName; params: Record<string, unknown>; idempotencyKey: string }): Promise<ActionResult>;
}

// ── Dev settings, switched from the dev menu on a real phone ──

export type Role = 'owner' | 'team';
export const dev = {
  role: 'owner' as Role,
  stream: 'ok' as 'ok' | 'drop' | 'invalid',
  action: 'ok' as 'ok' | 'rejected' | 'failed',
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });
const between = (a: number, b: number) => a + Math.random() * (b - a);

// Same patch order a model would stream: state first, then root, then elements parent → child.
export function toSpecStream(spec: Spec) {
  const lines: [string, unknown][] = [];
  if (spec.state) lines.push(['/state', spec.state]);
  lines.push(['/root', spec.root]);
  for (const [k, v] of Object.entries(spec.elements)) lines.push([`/elements/${k}`, v]);
  return lines.map(([path, value]) => JSON.stringify({ op: 'add', path, value }) + '\n').join('');
}

export class MockTransport implements ChatTransport {
  async send({ message }: { message: string }, signal: AbortSignal): Promise<ChatReply> {
    await sleep(between(500, 900), signal); // model + tool time before the first token
    const reply = route(message);
    if (!reply.spec) return { text: reply.text, stream: null, cardId: null };
    let jsonl = toSpecStream(reply.spec);
    if (dev.stream === 'invalid') jsonl = jsonl.replace(/"type":"BriefCard"/, '"type":"Dashboard"');
    return { text: reply.text, stream: chunks(jsonl, signal), cardId: `card_${Date.now()}` };
  }
}

// Random chunk sizes so lines split mid-token, 30–80 ms apart.
async function* chunks(text: string, signal: AbortSignal) {
  let i = 0;
  while (i < text.length) {
    if (dev.stream === 'drop' && i > text.length / 2) throw new Error('Network connection was lost');
    const n = Math.round(between(20, 140));
    yield text.slice(i, i + n);
    i += n;
    await sleep(between(30, 80), signal);
  }
}

// Plays the server: re-validates params as untrusted input, enforces role and caps, dedupes by idempotency key.
export class MockActionClient implements ActionClient {
  private done = new Map<string, ActionResult>();

  async run({ action, params, idempotencyKey }: Parameters<ActionClient['run']>[0]): Promise<ActionResult> {
    const prior = this.done.get(idempotencyKey);
    if (prior) return prior;
    await sleep(between(300, 800));
    if (dev.action === 'failed') return { status: 'failed', message: 'Couldn’t reach Ozer. Your changes are kept, try again.' };
    if (dev.action === 'rejected') return { status: 'rejected', message: 'That item changed since this card was made. Refresh it.' };
    if (dev.role === 'team' && !TEAM_ACTIONS.includes(action)) return { status: 'rejected', message: 'Only the owner can do this.' };

    const parsed = catalog.data.actions[action].params.safeParse(params);
    if (!parsed.success) return { status: 'rejected', message: parsed.error.issues[0]?.message ?? 'Invalid request.' };
    const p = parsed.data as Record<string, any>;
    if (action === 'send_review_reply' && p.refundShipping && dev.role === 'team')
      return { status: 'rejected', message: 'Only the owner can refund shipping.' };
    if (action === 'approve_refund' && p.amount > p.orderTotal)
      return { status: 'rejected', message: `Refund can’t be more than the order total ($${p.orderTotal}).` };

    const result: ActionResult = { status: 'ok', message: okMessage(action, p) };
    this.done.set(idempotencyKey, result);
    return result;
  }
}

function okMessage(action: ActionName, p: Record<string, any>) {
  switch (action) {
    case 'recover_carts': return `Sent to ${p.cartIds.length} customers`;
    case 'send_review_reply':
      return ['Reply posted', p.offer !== 'None' && `with ${p.offer.toLowerCase()}`, p.refundShipping && `$${p.shippingFee} shipping refunded`]
        .filter(Boolean).join(', ');
    case 'approve_refund': return `Refunded $${p.amount} to ${p.customer}`;
    case 'pause_campaign': return `Paused ${p.name}`;
    default: return 'Done';
  }
}

export const transport: ChatTransport = new MockTransport();
export const actions: ActionClient = new MockActionClient();
