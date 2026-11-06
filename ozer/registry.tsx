import { type ComponentRegistry, type ComponentRenderProps, useBoundProp, useStateValue } from '@json-render/react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { createContext, useContext, useState } from 'react';
import { ActivityIndicator, Pressable, Switch as RNSwitch, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Glass } from '../components/Glass';
import { type ActionName, BACKGROUNDS, ICONS, TEAM_ACTIONS } from './catalog';
import type { Role } from './mock';

// The one place card colours, radius and type live. Changing it restyles every card.
export const theme = {
  ink: '#000',
  muted: '#6C6C70',
  faint: '#8E8E93',
  line: 'rgba(60,60,67,0.14)',
  fill: 'rgba(118,118,128,0.10)',
  accent: '#007AFF',
  up: '#1F9D55',
  down: '#E5484D',
  radius: 22,
  inner: 12,
};

const GRADIENTS: Record<(typeof BACKGROUNDS)[number], readonly [string, string, ...string[]] | null> = {
  plain: null,
  glass: null,
  aurora: ['#EAF1FF', '#F4EBFF', '#E7FBF3'],
  sunset: ['#FFF0E5', '#FFE6EE'],
  ocean: ['#E5F3FF', '#E6FBF8'],
};

const SYMBOLS: Record<(typeof ICONS)[number], SFSymbol> = {
  cart: 'cart', refund: 'arrow.uturn.backward.circle', star: 'star.fill', invoice: 'doc.text', ad: 'megaphone',
  lead: 'person.crop.circle.badge.plus', ticket: 'ticket', payment: 'creditcard', order: 'shippingbox', email: 'envelope',
  website: 'globe', alert: 'exclamationmark.triangle', check: 'checkmark.circle', clock: 'clock', user: 'person',
};

// Card-level facts the registry needs but the model never writes.
export type CardMeta = { role: Role; stale: boolean; refresh: () => void };
export const CardContext = createContext<CardMeta>({ role: 'owner', stale: false, refresh: () => {} });

// Written by the card's action runner into its state store.
export const RESULT = '/__ozer/result';
export const BUSY = '/__ozer/busy';
export type Result = { status: 'ok' | 'rejected' | 'failed'; message: string };

type P<T> = ComponentRenderProps<T>;

function BriefCard({ element: { props }, children }: P<{ title: string; subtitle?: string | null; background: keyof typeof GRADIENTS }>) {
  const body = (
    <View style={s.cardBody}>
      <Text style={s.title}>{props.title}</Text>
      {props.subtitle ? <Text style={s.subtitle}>{props.subtitle}</Text> : null}
      {children}
    </View>
  );
  if (props.background === 'glass') return <Glass style={s.card}>{body}</Glass>;
  const colors = GRADIENTS[props.background];
  return colors ? (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.card, s.cardEdge]}>
      {body}
    </LinearGradient>
  ) : (
    <View style={[s.card, s.cardEdge, s.plain]}>{body}</View>
  );
}

function Metric({ element: { props } }: P<{ label: string; value: string; change?: number | null }>) {
  const c = props.change;
  return (
    <View style={s.metric}>
      <Text style={s.metricLabel} numberOfLines={1}>{props.label}</Text>
      <Text style={s.metricValue} numberOfLines={1} adjustsFontSizeToFit>{props.value}</Text>
      {c != null && (
        <Text style={[s.change, { color: c >= 0 ? theme.up : theme.down }]}>
          {c >= 0 ? '▲' : '▼'} {Math.abs(c).toFixed(1)}%
        </Text>
      )}
    </View>
  );
}

const MetricRow = ({ children }: P<{}>) => <View style={s.metricRow}>{children}</View>;

function List({ element: { props }, children }: P<{ title?: string | null }>) {
  return (
    <View style={s.section}>
      {props.title ? <Text style={s.kicker}>{props.title.toUpperCase()}</Text> : null}
      <View style={s.list}>{children}</View>
    </View>
  );
}

function ListItem({ element: { props } }: P<{ icon: keyof typeof SYMBOLS; title: string; detail?: string | null; amount?: string | null }>) {
  return (
    <View style={s.item}>
      <View style={s.itemIcon}>
        <SymbolView name={SYMBOLS[props.icon] ?? 'circle'} size={15} tintColor={props.icon === 'alert' ? theme.down : theme.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.itemTitle} numberOfLines={1}>{props.title}</Text>
        {props.detail ? <Text style={s.itemDetail} numberOfLines={1}>{props.detail}</Text> : null}
      </View>
      {props.amount ? <Text style={s.amount}>{props.amount}</Text> : null}
    </View>
  );
}

function Quote({ element: { props } }: P<{ text: string; author?: string | null; rating?: number | null }>) {
  return (
    <View style={s.quote}>
      {props.rating ? (
        <View style={s.stars}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SymbolView key={i} name={i <= props.rating! ? 'star.fill' : 'star'} size={13} tintColor="#FF9F0A" />
          ))}
        </View>
      ) : null}
      <Text style={s.quoteText}>“{props.text}”</Text>
      {props.author ? <Text style={s.itemDetail}>— {props.author}</Text> : null}
    </View>
  );
}

const CHART_H = 110;
function Chart({ element: { props } }: P<{ type: 'bar' | 'line'; data: { x: string; y: number }[]; yLabel?: string | null }>) {
  const [w, setW] = useState(0);
  const ys = props.data.map((d) => d.y);
  const max = Math.max(...ys, 0) || 1;
  const min = props.type === 'line' ? Math.min(...ys) * 0.9 : 0;
  const y = (v: number) => CHART_H - ((v - min) / (max - min || 1)) * CHART_H;
  const step = props.data.length > 1 ? w / (props.data.length - 1) : 0;
  return (
    <View style={s.section}>
      {props.yLabel ? <Text style={s.kicker}>{props.yLabel.toUpperCase()}</Text> : null}
      <View style={{ height: CHART_H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {props.type === 'bar' ? (
          <View style={s.bars}>
            {props.data.map((d, i) => (
              <View key={i} style={[s.bar, { height: Math.max(2, CHART_H - y(d.y)) }]} />
            ))}
          </View>
        ) : (
          w > 0 &&
          props.data.map((d, i) => {
            const x0 = i * step, y0 = y(d.y);
            const next = props.data[i + 1];
            const seg =
              next &&
              (() => {
                const x1 = (i + 1) * step, y1 = y(next.y);
                const len = Math.hypot(x1 - x0, y1 - y0);
                const angle = Math.atan2(y1 - y0, x1 - x0);
                // A segment is a thin bar centred between the two points, then rotated.
                return (
                  <View
                    key={`s${i}`}
                    style={[s.seg, { width: len, left: (x0 + x1) / 2 - len / 2, top: (y0 + y1) / 2 - 1.25, transform: [{ rotate: `${angle}rad` }] }]}
                  />
                );
              })();
            return [seg, <View key={`d${i}`} style={[s.dot, { left: x0 - 3.5, top: y0 - 3.5 }]} />];
          })
        )}
      </View>
      <View style={s.axis}>
        {props.data.map((d, i) => (
          <Text key={i} style={s.axisLabel}>{d.x}</Text>
        ))}
      </View>
    </View>
  );
}

function ActionRow({ children }: P<{}>) {
  const result = useStateValue<Result>(RESULT);
  const { stale, refresh } = useContext(CardContext);
  if (result?.status === 'ok') {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={s.done}>
        <SymbolView name="checkmark.circle.fill" size={18} tintColor={theme.up} />
        <Text style={s.doneText}>{result.message}</Text>
      </Animated.View>
    );
  }
  return (
    <View style={s.section}>
      {result ? <Text style={s.error}>{result.message}</Text> : null}
      <View style={s.actions}>
        {stale ? (
          <Pressable style={[s.btn, s.btnPrimary]} onPress={refresh}>
            <Text style={[s.btnText, { color: '#fff' }]}>Refresh</Text>
          </Pressable>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

function Button({ element, emit }: P<{ label: string; variant?: 'primary' | 'secondary' | null }>) {
  const busy = useStateValue<string>(BUSY);
  const { role } = useContext(CardContext);
  const on = element.on?.press;
  const action = (Array.isArray(on) ? on[0] : on)?.action as ActionName | undefined;
  const allowed = role === 'owner' || !action || TEAM_ACTIONS.includes(action);
  const primary = element.props.variant !== 'secondary';
  const spinning = busy === action;
  return (
    <Pressable
      disabled={!allowed || !!busy}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        emit('press');
      }}
      style={({ pressed }) => [s.btn, primary ? s.btnPrimary : s.btnSecondary, (pressed || !allowed || (busy && !spinning)) && { opacity: 0.45 }]}
    >
      {spinning ? (
        <ActivityIndicator color={primary ? '#fff' : theme.ink} />
      ) : (
        <Text style={[s.btnText, { color: primary ? '#fff' : theme.ink }]} numberOfLines={1}>
          {allowed ? element.props.label : `${element.props.label} · Owner only`}
        </Text>
      )}
    </Pressable>
  );
}

const TextEl = ({ element: { props } }: P<{ text: string }>) => (
  <Animated.Text entering={FadeIn.duration(180)} style={s.note}>{props.text}</Animated.Text>
);

function Field({ label, children }: { label?: string | null; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      {label ? <Text style={s.kicker}>{label.toUpperCase()}</Text> : null}
      {children}
    </View>
  );
}

function Textarea({ element: { props }, bindings }: P<{ label?: string | null; value?: string | null }>) {
  const [value, set] = useBoundProp(props.value ?? '', bindings?.value);
  return (
    <Field label={props.label}>
      <TextInput style={[s.input, s.textarea]} value={value ?? ''} onChangeText={set} multiline scrollEnabled={false} />
    </Field>
  );
}

function Select({ element: { props }, bindings }: P<{ label?: string | null; options: string[]; value?: string | null }>) {
  const [value, set] = useBoundProp(props.value ?? props.options[0], bindings?.value);
  return (
    <Field label={props.label}>
      <View style={s.chips}>
        {props.options.map((o) => {
          const on = o === value;
          return (
            <Pressable
              key={o}
              onPress={() => {
                Haptics.selectionAsync();
                set(o);
              }}
              style={[s.chip, on && s.chipOn]}
            >
              <Text style={[s.chipText, on && { color: '#fff' }]}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

function Switch({ element: { props }, bindings }: P<{ label: string; checked?: boolean | null }>) {
  const [checked, set] = useBoundProp(!!props.checked, bindings?.checked);
  return (
    <View style={s.switchRow}>
      <Text style={s.itemTitle}>{props.label}</Text>
      <RNSwitch
        value={!!checked}
        onValueChange={(v) => {
          Haptics.selectionAsync();
          set(v);
        }}
      />
    </View>
  );
}

function AmountInput({ element: { props }, bindings }: P<{ label?: string | null; value?: string | null; max?: number | null }>) {
  const [value, set] = useBoundProp(props.value ?? '', bindings?.value);
  const over = props.max != null && Number(value) > props.max;
  return (
    <Field label={props.label}>
      <View style={[s.input, s.amountRow, over && { borderColor: theme.down }]}>
        <Text style={s.currency}>$</Text>
        <TextInput
          style={s.amountInput}
          value={value ?? ''}
          onChangeText={(t) => set(t.replace(/[^0-9.]/g, ''))}
          keyboardType="decimal-pad"
        />
        {props.max != null && <Text style={s.itemDetail}>of ${props.max}</Text>}
      </View>
    </Field>
  );
}

export const registry: ComponentRegistry = {
  BriefCard, Metric, MetricRow, List, ListItem, Quote, Chart, ActionRow,
  Button, Text: TextEl, Textarea, Select, Switch, AmountInput,
};

const s = StyleSheet.create({
  card: { borderRadius: theme.radius, overflow: 'hidden' },
  cardEdge: { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.line },
  plain: { backgroundColor: '#fff' },
  cardBody: { padding: 16, gap: 14 },
  title: { fontSize: 20, fontWeight: '700', color: theme.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: theme.muted, marginTop: -12 },
  section: { gap: 8 },
  kicker: { fontSize: 11, fontWeight: '600', color: theme.faint, letterSpacing: 0.5 },

  metricRow: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, padding: 10, borderRadius: theme.inner, backgroundColor: 'rgba(255,255,255,0.7)', gap: 2 },
  metricLabel: { fontSize: 12, color: theme.muted },
  metricValue: { fontSize: 22, fontWeight: '700', color: theme.ink, fontVariant: ['tabular-nums'] },
  change: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },

  list: { borderRadius: theme.inner, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  itemIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: theme.fill, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 15, color: theme.ink, flexShrink: 1 },
  itemDetail: { fontSize: 13, color: theme.muted },
  amount: { fontSize: 15, fontWeight: '600', color: theme.ink, fontVariant: ['tabular-nums'] },

  quote: { gap: 6, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: theme.line },
  stars: { flexDirection: 'row', gap: 2 },
  quoteText: { fontSize: 16, lineHeight: 22, color: theme.ink, fontStyle: 'italic' },

  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  bar: { flex: 1, borderRadius: 4, backgroundColor: theme.accent },
  seg: { position: 'absolute', height: 2.5, borderRadius: 1.25, backgroundColor: theme.accent },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#fff', borderWidth: 2, borderColor: theme.accent },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { fontSize: 11, color: theme.faint },

  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnPrimary: { backgroundColor: theme.ink },
  btnSecondary: { backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.line },
  btnText: { fontSize: 15, fontWeight: '600' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 },
  doneText: { fontSize: 15, fontWeight: '600', color: theme.ink, flex: 1 },
  error: { fontSize: 13, color: theme.down },

  note: { fontSize: 13, color: theme.muted, marginTop: -6 },
  input: {
    borderRadius: theme.inner,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.ink,
  },
  textarea: { minHeight: 88, lineHeight: 20, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.85)', borderWidth: StyleSheet.hairlineWidth, borderColor: theme.line },
  chipOn: { backgroundColor: theme.ink, borderColor: theme.ink },
  chipText: { fontSize: 14, color: theme.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  currency: { fontSize: 22, fontWeight: '600', color: theme.ink },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '600', color: theme.ink, fontVariant: ['tabular-nums'] },
});
