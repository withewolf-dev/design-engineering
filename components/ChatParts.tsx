import { SymbolView } from 'expo-symbols';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import type { Card } from '../ozer/Card';
import { Glass } from './Glass';

export const BLUE = '#007AFF';
export const GRAY = '#E9E9EB';
export const BG = '#FFFFFF';

export type Poll = { question: string; options: { label: string; votes: number }[]; myVote?: number };
// One message; exactly one of text / voice / poll / photo / card is set.
export type Msg = {
  id: string;
  fromMe: boolean;
  at: number;
  text?: string;
  voice?: number; // seconds
  poll?: Poll;
  photo?: string; // uri
  card?: Card; // Ozer generative UI card
  reaction?: string; // my tapback
  theirReaction?: string;
};

export const TAPBACKS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ── Bubble with tail ──────────────────────────────────────────────────────

export function BubbleShell(p: { fromMe: boolean; tail: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const color = p.fromMe ? BLUE : GRAY;
  return (
    <View style={[styles.bubble, { backgroundColor: color }, p.style]}>
      {p.children}
      {p.tail && (
        // Classic tail: a colored curve with a background-colored curve carved out of it.
        <>
          <View style={[p.fromMe ? styles.tailR : styles.tailL, { backgroundColor: color }]} />
          <View style={p.fromMe ? styles.cutR : styles.cutL} />
        </>
      )}
    </View>
  );
}

// ── Voice note ────────────────────────────────────────────────────────────

const BARS = 26;
const BAR_W = 3;
const BAR_GAP = 2;
const WAVE_W = BARS * (BAR_W + BAR_GAP) - BAR_GAP;

// Stable pseudo-random waveform per message id.
function waveform(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Array.from({ length: BARS }, () => {
    h = (h * 1103515245 + 12345) | 0;
    return 4 + (((h >>> 16) & 0xff) / 255) * 20;
  });
}

function Wave({ heights, color }: { heights: number[]; color: string }) {
  return (
    <View style={styles.wave}>
      {heights.map((h, i) => (
        <View key={i} style={{ width: BAR_W, height: h, borderRadius: BAR_W / 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

// No real audio — playback is a progress sweep across the waveform.
export function VoiceBubble({ msg, tail }: { msg: Msg; tail: boolean }) {
  const seconds = msg.voice ?? 0;
  const heights = useRef(waveform(msg.id)).current;
  const progress = useSharedValue(0);
  const [playing, setPlaying] = useState(false);
  const done = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(done.current), []);

  const toggle = () => {
    clearTimeout(done.current);
    if (playing) {
      cancelAnimation(progress);
      setPlaying(false);
      return;
    }
    const from = progress.value >= 1 ? 0 : progress.value;
    const ms = (1 - from) * seconds * 1000;
    progress.value = from;
    progress.value = withTiming(1, { duration: ms, easing: Easing.linear });
    done.current = setTimeout(() => {
      setPlaying(false);
      progress.value = withTiming(0, { duration: 250 });
    }, ms);
    setPlaying(true);
  };

  const fill = useAnimatedStyle(() => ({ width: progress.value * WAVE_W }));
  const fg = msg.fromMe ? '#fff' : '#000';
  const dim = msg.fromMe ? 'rgba(255,255,255,0.45)' : '#A0A0A5';

  return (
    <BubbleShell fromMe={msg.fromMe} tail={tail} style={styles.voice}>
      <Pressable onPress={toggle} hitSlop={12} accessibilityLabel={playing ? 'Pause' : 'Play'}>
        <SymbolView name={playing ? 'pause.fill' : 'play.fill'} size={18} tintColor={fg} />
      </Pressable>
      <View style={{ width: WAVE_W }}>
        <Wave heights={heights} color={dim} />
        <Animated.View style={[styles.waveFill, fill]}>
          <Wave heights={heights} color={fg} />
        </Animated.View>
      </View>
      <Text style={[styles.duration, { color: fg }]}>{clock(seconds)}</Text>
    </BubbleShell>
  );
}

// ── Poll ──────────────────────────────────────────────────────────────────

const bar = LinearTransition.springify().damping(20).stiffness(200);

export function PollCard({ poll, onVote }: { poll: Poll; onVote: (i: number) => void }) {
  const total = poll.options.reduce((s, o) => s + o.votes, 0);
  return (
    <View style={styles.poll}>
      <View style={styles.pollHead}>
        <SymbolView name="chart.bar.fill" size={12} tintColor="#8E8E93" />
        <Text style={styles.pollKicker}>POLL</Text>
      </View>
      <Text style={styles.pollQ}>{poll.question}</Text>
      {poll.options.map((o, i) => {
        const mine = poll.myVote === i;
        return (
          <Pressable key={o.label} onPress={() => onVote(i)} style={styles.option}>
            <Animated.View
              layout={bar}
              style={[styles.optionFill, { width: `${total ? (o.votes / total) * 100 : 0}%` }, mine && styles.optionFillMine]}
            />
            <SymbolView name={mine ? 'checkmark.circle.fill' : 'circle'} size={20} tintColor={mine ? BLUE : '#C7C7CC'} />
            <Text style={styles.optionLabel}>{o.label}</Text>
            <Text style={styles.optionCount}>{o.votes}</Text>
          </Pressable>
        );
      })}
      <Text style={styles.pollTotal}>
        {total} {total === 1 ? 'vote' : 'votes'}
      </Text>
    </View>
  );
}

// ── Photo ─────────────────────────────────────────────────────────────────

export function PhotoBubble({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={styles.photo} />;
}

// ── Tapbacks ──────────────────────────────────────────────────────────────

// Badges sit on the corner facing the conversation: top-left on mine, top-right on theirs.
export function ReactionBadges({ msg }: { msg: Msg }) {
  const items = [
    msg.theirReaction && { emoji: msg.theirReaction, byMe: false },
    msg.reaction && { emoji: msg.reaction, byMe: true },
  ].filter(Boolean) as { emoji: string; byMe: boolean }[];
  if (!items.length) return null;
  return (
    <View style={[styles.badges, msg.fromMe ? { left: -12 } : { right: -12 }]} pointerEvents="none">
      {items.map((r, i) => (
        <Animated.View
          key={r.emoji + r.byMe}
          entering={ZoomIn.springify().damping(12)}
          style={[styles.badge, { backgroundColor: r.byMe ? BLUE : GRAY }, i > 0 && { marginLeft: -10 }]}
        >
          <Text style={styles.badgeEmoji}>{r.emoji}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

export function TapbackBar({ current, onPick }: { current?: string; onPick: (emoji: string) => void }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(16)}>
      <Glass style={styles.tapbar}>
        {TAPBACKS.map((e, i) => (
          <Animated.View key={e} entering={ZoomIn.delay(30 * i).springify().damping(12)}>
            <Pressable onPress={() => onPick(e)} style={[styles.tap, current === e && styles.tapOn]}>
              <Text style={styles.tapEmoji}>{e}</Text>
            </Pressable>
          </Animated.View>
        ))}
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, marginTop: 2 },
  tailR: { position: 'absolute', bottom: 0, right: -8, width: 20, height: 20, borderBottomLeftRadius: 16 },
  cutR: { position: 'absolute', bottom: -4, right: -20, width: 20, height: 30, borderBottomLeftRadius: 14, backgroundColor: BG },
  tailL: { position: 'absolute', bottom: 0, left: -8, width: 20, height: 20, borderBottomRightRadius: 16 },
  cutL: { position: 'absolute', bottom: -4, left: -20, width: 20, height: 30, borderBottomRightRadius: 14, backgroundColor: BG },

  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  wave: { flexDirection: 'row', alignItems: 'center', gap: BAR_GAP, height: 26, width: WAVE_W },
  waveFill: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  duration: { fontSize: 15, fontVariant: ['tabular-nums'] },

  poll: {
    width: 260,
    marginTop: 2,
    padding: 12,
    gap: 8,
    borderRadius: 18,
    backgroundColor: BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D1D6',
  },
  pollHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pollKicker: { fontSize: 11, fontWeight: '600', color: '#8E8E93', letterSpacing: 0.5 },
  pollQ: { fontSize: 17, fontWeight: '600', color: '#000', marginBottom: 2 },
  option: {
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  optionFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(60,60,67,0.10)' },
  optionFillMine: { backgroundColor: 'rgba(0,122,255,0.18)' },
  optionLabel: { flex: 1, fontSize: 15, color: '#000' },
  optionCount: { fontSize: 15, color: '#8E8E93', fontVariant: ['tabular-nums'] },
  pollTotal: { fontSize: 12, color: '#8E8E93', textAlign: 'right' },

  photo: { width: 220, height: 165, borderRadius: 18, marginTop: 2, backgroundColor: GRAY },

  badges: { position: 'absolute', top: -18, flexDirection: 'row' },
  badge: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: BG, alignItems: 'center', justifyContent: 'center' },
  badgeEmoji: { fontSize: 15 },

  tapbar: { flexDirection: 'row', gap: 2, padding: 6, borderRadius: 28 },
  tap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  tapOn: { backgroundColor: 'rgba(0,122,255,0.2)' },
  tapEmoji: { fontSize: 24 },
});
