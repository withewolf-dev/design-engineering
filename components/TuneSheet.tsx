import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInLeft,
  FadeOut,
  FadeOutLeft,
  LinearTransition,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Config ────────────────────────────────────────────────────────────────

export type HapticKind = 'off' | 'selection' | 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' | 'success' | 'warning';
type LabelAnim = 'none' | 'fade' | 'scale' | 'slide';

export const DEFAULT_TUNING = {
  // Tab pill resize
  pillMotion: 'spring' as 'spring' | 'timing',
  damping: 18,
  stiffness: 220,
  mass: 1,
  timingMs: 260,
  // Active label
  labelIn: 'fade' as LabelAnim,
  labelInMs: 180,
  labelOut: 'none' as LabelAnim,
  labelOutMs: 120,
  switchAt: 'halfway' as 'halfway' | 'land',
  // Pager
  bounces: true,
  fastDeceleration: false,
  wallPx: 24,
  // Haptics
  hapticDetent: 'selection' as HapticKind,
  hapticLand: 'soft' as HapticKind,
  hapticWall: 'rigid' as HapticKind,
  hapticTap: 'selection' as HapticKind,
};
export type Tuning = typeof DEFAULT_TUNING;

export function haptic(kind: HapticKind) {
  if (kind === 'off') return;
  if (kind === 'selection') return Haptics.selectionAsync();
  if (kind === 'success' || kind === 'warning') return Haptics.notificationAsync(kind as Haptics.NotificationFeedbackType);
  return Haptics.impactAsync(kind as Haptics.ImpactFeedbackStyle);
}

export function pillTransition(t: Tuning) {
  return t.pillMotion === 'spring'
    ? LinearTransition.springify().damping(t.damping).stiffness(t.stiffness).mass(t.mass)
    : LinearTransition.duration(t.timingMs);
}

const ENTER = { fade: FadeIn, scale: ZoomIn, slide: FadeInLeft };
const EXIT = { fade: FadeOut, scale: ZoomOut, slide: FadeOutLeft };
export const labelEnter = (t: Tuning) => (t.labelIn === 'none' ? undefined : ENTER[t.labelIn].duration(t.labelInMs));
export const labelExit = (t: Tuning) => (t.labelOut === 'none' ? undefined : EXIT[t.labelOut].duration(t.labelOutMs));

// ── Sheet ─────────────────────────────────────────────────────────────────

const HAPTICS: HapticKind[] = ['off', 'selection', 'light', 'medium', 'heavy', 'soft', 'rigid', 'success', 'warning'];
const ANIMS: LabelAnim[] = ['none', 'fade', 'scale', 'slide'];

type Props = { tuning: Tuning; onChange: (t: Tuning) => void; onClose: () => void };

export function TuneSheet({ tuning: t, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const set = <K extends keyof Tuning>(k: K) => (v: Tuning[K]) => onChange({ ...t, [k]: v });
  // Preview a haptic as you pick it, so you feel the option you're choosing.
  const setHaptic = (k: 'hapticDetent' | 'hapticLand' | 'hapticWall' | 'hapticTap') => (v: HapticKind) => {
    haptic(v);
    set(k)(v);
  };

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(20)}
      exiting={SlideOutDown.duration(200)}
      style={[styles.sheet, { paddingBottom: insets.bottom }]}
    >
      <View style={styles.grabber} />
      <View style={styles.topRow}>
        <Text style={styles.title}>Tune</Text>
        <View style={styles.topActions}>
          <Pressable onPress={() => onChange(DEFAULT_TUNING)} hitSlop={8}>
            <Text style={styles.action}>Reset</Text>
          </Pressable>
          <Pressable onPress={() => Share.share({ message: JSON.stringify(t, null, 2) })} hitSlop={8}>
            <Text style={styles.action}>Share</Text>
          </Pressable>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={[styles.action, styles.done]}>Done</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="Tab pill">
          <Chips options={['spring', 'timing'] as const} value={t.pillMotion} onChange={set('pillMotion')} />
          {t.pillMotion === 'spring' ? (
            <>
              <Num label="Damping" value={t.damping} min={1} max={60} step={1} onChange={set('damping')} />
              <Num label="Stiffness" value={t.stiffness} min={20} max={800} step={10} onChange={set('stiffness')} />
              <Num label="Mass" value={t.mass} min={0.1} max={5} step={0.1} onChange={set('mass')} />
            </>
          ) : (
            <Num label="Duration" unit="ms" value={t.timingMs} min={0} max={1000} step={10} onChange={set('timingMs')} />
          )}
        </Section>

        <Section title="Label enter">
          <Chips options={ANIMS} value={t.labelIn} onChange={set('labelIn')} />
          {t.labelIn !== 'none' && (
            <Num label="Duration" unit="ms" value={t.labelInMs} min={0} max={800} step={10} onChange={set('labelInMs')} />
          )}
        </Section>

        <Section title="Label exit">
          <Chips options={ANIMS} value={t.labelOut} onChange={set('labelOut')} />
          {t.labelOut !== 'none' && (
            <Num label="Duration" unit="ms" value={t.labelOutMs} min={0} max={800} step={10} onChange={set('labelOutMs')} />
          )}
        </Section>

        <Section title="Pager">
          <Row label="Tab switches at">
            <Chips options={['halfway', 'land'] as const} value={t.switchAt} onChange={set('switchAt')} />
          </Row>
          <Toggle label="Bounce at ends" value={t.bounces} onChange={set('bounces')} />
          <Toggle label="Fast deceleration" value={t.fastDeceleration} onChange={set('fastDeceleration')} />
          <Num label="Wall bump after" unit="px" value={t.wallPx} min={0} max={120} step={2} onChange={set('wallPx')} />
        </Section>

        <Section title="Haptics">
          <Row label="Halfway tick">
            <Chips options={HAPTICS} value={t.hapticDetent} onChange={setHaptic('hapticDetent')} />
          </Row>
          <Row label="Landing">
            <Chips options={HAPTICS} value={t.hapticLand} onChange={setHaptic('hapticLand')} />
          </Row>
          <Row label="Wall">
            <Chips options={HAPTICS} value={t.hapticWall} onChange={setHaptic('hapticWall')} />
          </Row>
          <Row label="Tab tap">
            <Chips options={HAPTICS} value={t.hapticTap} onChange={setHaptic('hapticTap')} />
          </Row>
        </Section>
      </ScrollView>
    </Animated.View>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.chipRow}>
      <Text style={[styles.rowLabel, styles.chipRowLabel]}>{label}</Text>
      {children}
    </View>
  );
}

function Num(p: { label: string; unit?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const shown = p.step < 1 ? p.value.toFixed(1) : String(p.value);
  return (
    <View style={styles.row}>
      <View style={styles.numHead}>
        <Text style={styles.rowLabel}>{p.label}</Text>
        <Text style={styles.value}>
          {shown}
          {p.unit}
        </Text>
      </View>
      <Slider
        value={p.value}
        minimumValue={p.min}
        maximumValue={p.max}
        step={p.step}
        minimumTrackTintColor="#007AFF"
        // Round away float noise from fractional steps.
        onValueChange={(v) => p.onChange(Math.round(v * 10) / 10)}
      />
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[styles.row, styles.toggle]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function Chips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} style={[styles.chip, o === value && styles.chipOn]}>
          <Text style={[styles.chipText, o === value && styles.chipTextOn]}>{o}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '52%',
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: '#C7C7CC', marginTop: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  title: { fontSize: 20, fontWeight: '700' },
  topActions: { flexDirection: 'row', gap: 18 },
  action: { fontSize: 16, color: '#007AFF' },
  done: { fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 18 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 13, color: '#6D6D72', textTransform: 'uppercase', marginLeft: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 6 },
  row: { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
  chipRow: { paddingVertical: 8, gap: 6 },
  chipRowLabel: { marginLeft: 14 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 15, color: '#000' },
  numHead: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { fontSize: 15, color: '#8E8E93', fontVariant: ['tabular-nums'] },
  chips: { gap: 6, paddingHorizontal: 14, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: '#EFEFF4', justifyContent: 'center' },
  chipOn: { backgroundColor: '#007AFF' },
  chipText: { fontSize: 14, color: '#3C3C43' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
});
