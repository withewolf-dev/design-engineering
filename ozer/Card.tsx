import { createSpecStreamCompiler, createStateStore, type Spec, type StateStore } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react-native';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { type ActionName, catalog, CATALOG_VERSION } from './catalog';
import { actions, transport, type Role } from './mock';
import { BUSY, CardContext, registry, RESULT, type Result } from './registry';

const DAY = 24 * 60 * 60_000;
const stores = new Map<string, StateStore>();

export type Card = {
  id: string;
  prompt: string; // what the owner asked; re-sent by Retry / Refresh
  spec: Spec | null;
  status: 'streaming' | 'done' | 'dropped' | 'invalid';
  createdAt: number;
  dataAsOf: number;
};

// Ask Ozer. Text arrives first, then the card fills in patch by patch.
export async function ask(
  message: string,
  signal: AbortSignal,
  on: { text: (t: string) => void; card: (c: Card) => void },
) {
  const reply = await transport.send({ conversationId: 'c_main', message, catalogVersion: CATALOG_VERSION }, signal);
  on.text(reply.text);
  if (!reply.stream || !reply.cardId) return;

  const compiler = createSpecStreamCompiler<Spec>();
  const card: Card = { id: reply.cardId, prompt: message, spec: null, status: 'streaming', createdAt: Date.now(), dataAsOf: Date.now() };
  const emit = (patch: Partial<Card>) => on.card({ ...card, ...patch });
  let last: Spec | null = null;
  try {
    for await (const chunk of reply.stream) {
      const { result, newPatches } = compiler.push(chunk);
      // Incomplete lines produce no patches, so the last valid spec stays on screen.
      if (newPatches.length && result.root) emit({ spec: (last = { ...result, elements: { ...result.elements } }) });
    }
  } catch (e) {
    // Network drop or the owner moved on (aborted): keep what rendered, offer Retry.
    if (!signal.aborted) console.warn('[ozer] stream dropped', e);
    return emit({ spec: last, status: 'dropped' });
  }
  const spec = sanitize(compiler.getResult());
  emit(spec ? { spec, status: 'done' } : { spec: null, status: 'invalid' });
}

// The model may only reference catalog actions; unknown bindings are stripped. Unknown components are
// dropped by the renderer, but a card whose root isn't an Ozer component can't be shown at all.
function sanitize(spec: Spec): Spec | null {
  const check = catalog.validate(spec);
  if (!check.success) console.warn('[ozer] spec failed validation', check.error?.issues?.slice(0, 5));
  const rootEl = spec.elements?.[spec.root];
  if (!rootEl || !catalog.componentNames.includes(rootEl.type)) return null;
  const allowed = new Set<string>([...catalog.actionNames, 'setState']);
  const elements = Object.fromEntries(
    Object.entries(spec.elements).map(([k, el]) => {
      if (!el.on) return [k, el];
      const on = Object.fromEntries(
        Object.entries(el.on)
          .map(([ev, b]) => [ev, (Array.isArray(b) ? b : [b]).filter((x) => allowed.has(x.action))] as const)
          .filter(([, bs]) => bs.length),
      );
      return [k, { ...el, on }];
    }),
  );
  return { ...spec, elements };
}

const confirm = (title: string, ok: string) =>
  new Promise<boolean>((resolve) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(title, undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ]);
  });

// Built by the app from params, never by the model. Returns null when no confirmation is needed.
function confirmation(action: ActionName, p: Record<string, any>): [string, string] | null {
  if (action === 'approve_refund') return [`Refund $${p.amount} to ${p.customer}?`, 'Refund'];
  if (action === 'pause_campaign') return [`Pause “${p.name}”?`, 'Pause'];
  if (action === 'send_review_reply' && p.refundShipping) return [`Post reply and refund $${p.shippingFee} shipping?`, 'Post and refund'];
  return null;
}

export function OzerCard({ card, role, onSend }: { card: Card; role: Role; onSend: (text: string) => void }) {
  // Card state outlives the row (FlatList unmounts off-screen rows). ponytail: in-memory, expo-sqlite when persistence lands.
  if (!stores.has(card.id) && card.spec) stores.set(card.id, createStateStore(JSON.parse(JSON.stringify(card.spec.state ?? {}))));
  const store = { current: stores.get(card.id) ?? null };

  const handlers = useMemo(() => {
    const run = async (action: ActionName, params: Record<string, unknown>) => {
      const st = store.current!;
      if (st.get(BUSY)) return; // a double tap can't fire twice
      if (action === 'send_message') return onSend(String(params.text));
      if (action === 'dismiss') return st.set(RESULT, { status: 'ok', message: 'Dismissed' } satisfies Result);
      const ask = confirmation(action, params);
      if (ask && !(await confirm(...ask))) return;
      st.set(BUSY, action);
      const r = await actions.run({ cardId: card.id, action, params, idempotencyKey: `${card.id}:${action}` });
      st.set(BUSY, null);
      st.set(RESULT, { status: r.status, message: r.message } satisfies Result);
      Haptics.notificationAsync(r.status === 'ok' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    };
    return Object.fromEntries(catalog.actionNames.map((a) => [a, (p: Record<string, unknown>) => run(a as ActionName, p ?? {})]));
  }, [card.id, onSend]);

  const meta = useMemo(
    () => ({ role, stale: Date.now() - card.createdAt > DAY, refresh: () => onSend(card.prompt) }),
    [role, card.createdAt, card.prompt, onSend],
  );

  if (card.status === 'invalid' || !store.current) {
    return card.status === 'invalid' ? <Text style={s.meta}>This card couldn’t be shown.</Text> : null;
  }
  return (
    <View>
      <CardContext.Provider value={meta}>
        <JSONUIProvider registry={registry} store={store.current} handlers={handlers}>
          <Renderer spec={card.spec} registry={registry} includeStandard={false} loading={card.status === 'streaming'} />
        </JSONUIProvider>
      </CardContext.Provider>
      {card.status === 'dropped' ? (
        <Pressable onPress={() => onSend(card.prompt)} hitSlop={8}>
          <Text style={[s.meta, s.retry]}>Connection lost · Retry</Text>
        </Pressable>
      ) : card.status === 'done' ? (
        <Text style={s.meta}>
          As of {new Date(card.dataAsOf).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  meta: { fontSize: 11, color: '#8E8E93', marginTop: 6, marginLeft: 4 },
  retry: { color: '#E5484D', fontWeight: '600' },
});
