import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, FlatList, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LayoutAnimationConfig,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BG,
  BLUE,
  BubbleShell,
  clock,
  type Msg,
  PhotoBubble,
  type Poll,
  PollCard,
  ReactionBadges,
  TapbackBar,
  VoiceBubble,
} from './ChatParts';
import { Glass } from './Glass';
import { ask, type Card, OzerCard } from '../ozer/Card';
import { brief, SUGGESTIONS } from '../ozer/fixtures';
import { dev } from '../ozer/mock';

const GROUP_GAP = 60_000; // same sender within a minute → one bubble group
const STAMP_GAP = 15 * 60_000; // gap that earns a centered timestamp
const HEADER_H = 96; // floating avatar + name pill below the status bar
const BAR_H = 56; // floating input bar

const NAME = 'Ozer';
const REPLIES = ['haha yes', 'omw 🏃', 'wait really?', 'sounds good to me', '👀', 'ok ok I’m in', 'lol stop'];
const THEIR_TAPBACKS = ['❤️', '😂', '‼️'];

const now = Date.now();
// Newest first — the list is inverted so the latest message sits above the input.
const SEED: Msg[] = [
  {
    id: 'brief',
    fromMe: false,
    at: now - 20_000,
    card: { id: 'card_brief', prompt: 'Morning brief', spec: brief, status: 'done', createdAt: now - 20_000, dataAsOf: now - 25_000 },
  },
  { id: 'brief-text', text: 'Good morning! Revenue is up 12% and three things need you.', fromMe: false, at: now - 21_000 },
  {
    id: 's7',
    fromMe: false,
    at: now - 60_000,
    poll: {
      question: 'Where are we eating?',
      options: [
        { label: 'Tacos', votes: 2 },
        { label: 'Sushi', votes: 1 },
        { label: 'Pizza', votes: 0 },
      ],
    },
  },
  { id: 's6', fromMe: false, at: now - 2 * 60_000, voice: 7 },
  { id: 's5', text: 'Bring the good snacks this time', fromMe: false, at: now - 3 * 60_000 },
  { id: 's4', text: 'Tonight still on?', fromMe: false, at: now - 3.5 * 60_000 },
  { id: 's3', text: 'ok that was a great call', fromMe: true, at: now - 26 * 60 * 60_000, theirReaction: '❤️' },
  { id: 's2', text: 'Booked the table for 8', fromMe: false, at: now - 26.2 * 60 * 60_000 },
  { id: 's1', text: 'Did you sort dinner?', fromMe: true, at: now - 26.4 * 60 * 60_000 },
];

const NEW_POLL = (question: string): Poll => ({
  question,
  options: [
    { label: 'Yes', votes: 0 },
    { label: 'No', votes: 0 },
    { label: 'Maybe', votes: 0 },
  ],
});

const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const stamp = (t: number) => {
  const d = new Date(t);
  const day =
    d.toDateString() === new Date().toDateString()
      ? 'Today'
      : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} ${time(t)}`;
};
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

type Body = Pick<Msg, 'text' | 'voice' | 'poll' | 'photo'>;

const DEV_ROLES = ['owner', 'team'] as const;
const DEV_STREAMS = ['ok', 'drop', 'invalid'] as const;
const DEV_ACTIONS = ['ok', 'rejected', 'failed'] as const;
const next = <T,>(xs: readonly T[], x: T) => xs[(xs.indexOf(x) + 1) % xs.length];

// topOffset: space reserved above the header (e.g. a tab bar). Defaults to the status bar.
export function Messages({ topOffset }: { topOffset?: number }) {
  const insets = useSafeAreaInsets();
  const top = topOffset ?? insets.top;
  const bottom = insets.bottom;
  const keyboard = useAnimatedKeyboard();
  const [messages, setMessages] = useState(SEED);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [tapback, setTapback] = useState<{ id: string; y: number; fromMe: boolean } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [recStart, setRecStart] = useState<number | null>(null);
  const [recNow, setRecNow] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const replyIdx = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const [role, setRole] = useState(dev.role);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (recStart === null) return;
    const t = setInterval(() => setRecNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [recStart]);

  // The list shrinks above the keyboard; the floating bar rides on top of it.
  const rootStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboard.height.value - bottom, 0),
  }));
  const barStyle = useAnimatedStyle(() => ({
    bottom: Math.max(keyboard.height.value, bottom),
  }));

  const update = (id: string, fn: (m: Msg) => Msg) => setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));

  // Fake the other side: read (maybe tapback / vote) → typing → reply. A new send restarts it.
  const scheduleReply = () => {
    timers.current.forEach(clearTimeout);
    setTyping(false);
    const reply = REPLIES[replyIdx.current++ % REPLIES.length];
    timers.current = [
      setTimeout(() => {
        setReadAt(Date.now());
        setTyping(true);
        setMessages((ms) => {
          const i = ms.findIndex((m) => m.fromMe);
          if (i < 0) return ms;
          const m = ms[i];
          let next = m;
          if (m.poll) {
            const v = Math.floor(Math.random() * m.poll.options.length);
            next = { ...m, poll: { ...m.poll, options: m.poll.options.map((o, j) => (j === v ? { ...o, votes: o.votes + 1 } : o)) } };
          } else if (Math.random() < 0.35) {
            next = { ...m, theirReaction: pick(THEIR_TAPBACKS) };
          }
          return ms.map((x, j) => (j === i ? next : x));
        });
      }, 900),
      setTimeout(() => {
        setTyping(false);
        setMessages((m) => [{ id: `r${Date.now()}`, text: reply, fromMe: false, at: Date.now() }, ...m]);
      }, 2400 + reply.length * 30),
    ];
  };

  // Text goes to Ozer: summary line first, then the card streams in. A new message aborts the last one.
  const askOzer = async (text: string) => {
    timers.current.forEach(clearTimeout);
    inflight.current?.abort();
    const ctrl = (inflight.current = new AbortController());
    timers.current = [setTimeout(() => setReadAt(Date.now()), 300)];
    setTyping(true);
    const upsert = (msg: Msg) =>
      setMessages((ms) => (ms.some((m) => m.id === msg.id) ? ms.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)) : [msg, ...ms]));
    try {
      await ask(text, ctrl.signal, {
        text: (t) => {
          setTyping(false);
          upsert({ id: `t${Date.now()}`, text: t, fromMe: false, at: Date.now() });
        },
        card: (card: Card) => upsert({ id: card.id, card, fromMe: false, at: card.createdAt }),
      });
    } catch {
      // Aborted before Ozer answered; the newer message owns the typing indicator now.
      if (!ctrl.signal.aborted) setTyping(false);
    }
  };

  const push = (body: Body) => {
    setMessages((m) => [{ id: String(Date.now()), fromMe: true, at: Date.now(), ...body }, ...m]);
    if (body.text) askOzer(body.text);
    else scheduleReply();
  };

  const say = (text: string) => {
    Haptics.selectionAsync();
    push({ text });
  };

  // Dev menu (long-press the name): role and failure modes for testing on a real phone.
  const openDevMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Ozer dev menu',
        options: [`Role: ${dev.role}`, `Stream: ${dev.stream}`, `Actions: ${dev.action}`, 'Close'],
        cancelButtonIndex: 3,
      },
      (i) => {
        if (i === 0) setRole((dev.role = next(DEV_ROLES, dev.role)));
        if (i === 1) dev.stream = next(DEV_STREAMS, dev.stream);
        if (i === 2) dev.action = next(DEV_ACTIONS, dev.action);
        if (i < 3) openDevMenu();
      },
    );
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    push({ text });
    setDraft('');
  };

  const openTapback = (msg: Msg, y: number) => {
    Keyboard.dismiss();
    setPlusOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTapback({ id: msg.id, y, fromMe: msg.fromMe });
  };

  const pickTapback = (emoji: string) => {
    if (!tapback) return;
    Haptics.selectionAsync();
    update(tapback.id, (m) => ({ ...m, reaction: m.reaction === emoji ? undefined : emoji }));
    setTimeout(() => setTapback(null), 160);
  };

  const vote = (id: string, i: number) => {
    Haptics.selectionAsync();
    update(id, (m) => {
      const p = m.poll!;
      const prev = p.myVote;
      const myVote = prev === i ? undefined : i;
      const options = p.options.map((o, j) => ({
        ...o,
        votes: o.votes - (j === prev ? 1 : 0) + (j === myVote ? 1 : 0),
      }));
      return { ...m, poll: { ...p, options, myVote } };
    });
  };

  // Hold the mic to record; release to send. Under a second is treated as a slip.
  const startRec = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecStart(Date.now());
    setRecNow(Date.now());
  };
  const stopRec = () => {
    if (recStart === null) return;
    const secs = Math.round((Date.now() - recStart) / 1000);
    setRecStart(null);
    if (secs < 1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    push({ voice: secs });
  };

  const attach = (kind: 'photo' | 'poll') => {
    setPlusOpen(false);
    Haptics.selectionAsync();
    if (kind === 'photo') push({ photo: `https://picsum.photos/seed/${Date.now()}/600/450` });
    else {
      // Whatever's in the field becomes the poll question.
      push({ poll: NEW_POLL(draft.trim() || 'Are you in?') });
      setDraft('');
    }
  };

  const lastMineId = messages.find((m) => m.fromMe)?.id;
  const tapbackMsg = tapback && messages.find((m) => m.id === tapback.id);

  return (
    <Animated.View style={[styles.root, rootStyle]}>
      <LayoutAnimationConfig skipEntering>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          extraData={[tapback, role]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          // Inverted: header renders at the visual bottom, footer at the top.
          ListHeaderComponent={
            <>
              {typing && <TypingBubble />}
              <View style={{ height: BAR_H + bottom + 42 }} />
            </>
          }
          ListFooterComponent={<View style={{ height: top + HEADER_H }} />}
          renderItem={({ item, index }) => {
            const newer = messages[index - 1];
            const older = messages[index + 1];
            const showStamp = !older || item.at - older.at > STAMP_GAP;
            const tail = !newer || newer.fromMe !== item.fromMe || newer.at - item.at > GROUP_GAP;
            const receipt =
              item.id === lastMineId ? (readAt && readAt >= item.at ? `Read ${time(readAt)}` : 'Delivered') : null;
            return (
              <Animated.View entering={FadeInDown.duration(220)}>
                {showStamp && <Text style={styles.stamp}>{stamp(item.at)}</Text>}
                <MessageRow
                  msg={item}
                  tail={tail}
                  focused={tapback?.id === item.id}
                  onLongPress={openTapback}
                  onVote={(i) => vote(item.id, i)}
                  role={role}
                  onSend={say}
                />
                {receipt && <Text style={styles.receipt}>{receipt}</Text>}
                {tail && <View style={styles.groupGap} />}
              </Animated.View>
            );
          }}
        />
      </LayoutAnimationConfig>

      <Header topInset={top} onLongPressName={openDevMenu} />

      {(plusOpen || tapback) && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            setPlusOpen(false);
            setTapback(null);
          }}
        />
      )}

      {tapback && (
        <View
          style={[styles.tapbackWrap, { top: Math.max(tapback.y - 62, top + HEADER_H) }, tapback.fromMe ? { right: 12 } : { left: 12 }]}
        >
          <TapbackBar current={tapbackMsg?.reaction} onPick={pickTapback} />
        </View>
      )}

      <Animated.View style={[styles.bar, barStyle]}>
        <LinearGradient colors={['rgba(255,255,255,0)', BG]} locations={[0, 0.45]} style={styles.barFade} pointerEvents="none" />
        {plusOpen && (
          <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOut.duration(120)} style={styles.menuWrap}>
            <Glass style={styles.menu}>
              <MenuItem icon="photo.on.rectangle.angled" color="#34C759" label="Photos" onPress={() => attach('photo')} />
              <MenuItem icon="chart.bar.fill" color="#FF9500" label="Poll" onPress={() => attach('poll')} />
            </Glass>
          </Animated.View>
        )}
        {!draft && !plusOpen && recStart === null && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.suggestWrap}
            contentContainerStyle={styles.suggest}
          >
            {SUGGESTIONS.map((t) => (
              <Pressable key={t} onPress={() => say(t)} style={({ pressed }) => pressed && { opacity: 0.5 }}>
                <Glass style={styles.suggestion}>
                  <Text style={styles.suggestionText}>{t}</Text>
                </Glass>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <Glass style={styles.plus}>
          <Pressable
            style={styles.center}
            hitSlop={6}
            onPress={() => {
              Haptics.selectionAsync();
              setPlusOpen((o) => !o);
            }}
            accessibilityLabel="Attachments"
          >
            <SymbolView name={plusOpen ? 'xmark' : 'plus'} size={plusOpen ? 16 : 20} weight="medium" tintColor="#3C3C43" />
          </Pressable>
        </Glass>
        <Glass style={styles.field}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setPlusOpen(false)}
            placeholder="iMessage"
            placeholderTextColor="#8E8E93"
            multiline
          />
          {recStart !== null && (
            <Animated.View entering={FadeIn.duration(120)} style={styles.recording} pointerEvents="none">
              <RecDot />
              <Text style={styles.recTime}>{clock(Math.floor((recNow - recStart) / 1000))}</Text>
              <Text style={styles.recHint}>Release to send</Text>
            </Animated.View>
          )}
          {draft.trim() ? (
            <Pressable style={styles.send} onPress={send} hitSlop={8} accessibilityLabel="Send">
              <SymbolView name="arrow.up" size={16} weight="bold" tintColor="#fff" />
            </Pressable>
          ) : (
            <Pressable style={styles.mic} onPressIn={startRec} onPressOut={stopRec} hitSlop={10} accessibilityLabel="Hold to record">
              <SymbolView name={recStart !== null ? 'mic.fill' : 'mic'} size={19} tintColor={recStart !== null ? '#FF3B30' : '#8E8E93'} />
            </Pressable>
          )}
        </Glass>
      </Animated.View>
    </Animated.View>
  );
}

function MessageRow(p: {
  msg: Msg;
  tail: boolean;
  focused: boolean;
  onLongPress: (m: Msg, y: number) => void;
  onVote: (i: number) => void;
  role: typeof dev.role;
  onSend: (text: string) => void;
}) {
  const ref = useRef<View>(null);
  const { msg } = p;
  const reacted = !!(msg.reaction || msg.theirReaction);
  if (msg.card) {
    return (
      <View style={[styles.cardRow, reacted && styles.reacted]}>
        <OzerCard card={msg.card} role={p.role} onSend={p.onSend} />
      </View>
    );
  }
  return (
    <Animated.View
      style={[
        styles.row,
        msg.fromMe ? styles.mine : styles.theirs,
        reacted && styles.reacted,
        // Lift the bubble while its tapback bar is open.
        { transform: [{ scale: p.focused ? 1.05 : 1 }], transitionProperty: 'transform', transitionDuration: 180 },
      ]}
    >
      <Pressable ref={ref} delayLongPress={280} onLongPress={() => ref.current?.measureInWindow((_x, y) => p.onLongPress(msg, y))}>
        {msg.voice ? (
          <VoiceBubble msg={msg} tail={p.tail} />
        ) : msg.poll ? (
          <PollCard poll={msg.poll} onVote={p.onVote} />
        ) : msg.photo ? (
          <PhotoBubble uri={msg.photo} />
        ) : (
          <BubbleShell fromMe={msg.fromMe} tail={p.tail}>
            <Text style={[styles.text, msg.fromMe && { color: '#fff' }]}>{msg.text}</Text>
          </BubbleShell>
        )}
      </Pressable>
      <ReactionBadges msg={msg} />
    </Animated.View>
  );
}

function MenuItem({ icon, color, label, onPress }: { icon: SFSymbol; color: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.5 }]}>
      <View style={[styles.menuIcon, { backgroundColor: color }]}>
        <SymbolView name={icon} size={16} tintColor="#fff" />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
    </Pressable>
  );
}

function Header({ topInset, onLongPressName }: { topInset: number; onLongPressName: () => void }) {
  return (
    <View style={[styles.header, { paddingTop: topInset + 6 }]} pointerEvents="box-none">
      <LinearGradient colors={[BG, 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Glass style={styles.circle}>
        <Pressable style={styles.center} hitSlop={8} accessibilityLabel="Back">
          <SymbolView name="chevron.left" size={20} weight="semibold" tintColor="#000" />
        </Pressable>
      </Glass>
      <View style={styles.contact}>
        <Image source={require('../assets/icon.png') /* TODO: real Ozer avatar */} style={styles.avatar} />
        <Pressable onLongPress={onLongPressName} delayLongPress={400}>
          <Glass style={styles.namePill}>
            <Text style={styles.name}>{NAME}</Text>
            <SymbolView name="chevron.right" size={10} weight="bold" tintColor="#8E8E93" />
          </Glass>
        </Pressable>
      </View>
      <Glass style={styles.circle}>
        <Pressable style={styles.center} hitSlop={8} accessibilityLabel="FaceTime">
          <SymbolView name="video" size={20} tintColor="#000" />
        </Pressable>
      </Glass>
    </View>
  );
}

function TypingBubble() {
  return (
    <Animated.View entering={FadeInDown.duration(200)} style={[styles.theirs, styles.groupGap]}>
      <BubbleShell fromMe={false} tail style={styles.typing}>
        {[0, 1, 2].map((i) => (
          <Dot key={i} delay={i * 160} />
        ))}
      </BubbleShell>
    </Animated.View>
  );
}

function Dot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0.3, { duration: 320 })), -1),
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

function RecDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.25, { duration: 500 }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.recDot, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  circle: { width: 44, height: 44, borderRadius: 22 },
  contact: { alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  namePill: {
    marginTop: -8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
  },
  name: { fontSize: 15, fontWeight: '600', color: '#000' },

  list: { paddingHorizontal: 16 },
  stamp: { textAlign: 'center', color: '#8E8E93', fontSize: 11, fontWeight: '500', marginTop: 14, marginBottom: 8 },
  receipt: { alignSelf: 'flex-end', color: '#8E8E93', fontSize: 11, fontWeight: '500', marginTop: 2, marginRight: 2 },
  groupGap: { height: 8 },

  row: { maxWidth: '78%' },
  cardRow: { width: '94%', alignSelf: 'flex-start', marginTop: 2 },
  reacted: { marginTop: 18 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  text: { fontSize: 17, lineHeight: 22, color: '#000' },
  tapbackWrap: { position: 'absolute' },

  typing: { flexDirection: 'row', gap: 5, paddingVertical: 13, paddingHorizontal: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8E8E93' },

  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  // Fades messages out behind the bar and covers the home-indicator strip below it.
  barFade: { position: 'absolute', left: 0, right: 0, top: -24, bottom: -60 },
  plus: { width: 40, height: 40, borderRadius: 20 },
  field: { flex: 1, minHeight: 40, borderRadius: 20, justifyContent: 'center' },
  input: { fontSize: 17, maxHeight: 120, paddingLeft: 16, paddingRight: 44, paddingTop: 10, paddingBottom: 10 },
  send: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mic: { position: 'absolute', right: 12, bottom: 10 },

  recording: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 20,
    backgroundColor: BG,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' },
  recTime: { fontSize: 17, color: '#000', fontVariant: ['tabular-nums'] },
  recHint: { fontSize: 15, color: '#8E8E93' },

  suggestWrap: { position: 'absolute', left: 0, right: 0, bottom: BAR_H },
  suggest: { gap: 8, paddingHorizontal: 16 },
  suggestion: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center' },
  suggestionText: { fontSize: 15, color: '#000' },

  menuWrap: { position: 'absolute', left: 16, bottom: BAR_H + 4 },
  menu: { borderRadius: 22, paddingVertical: 6, minWidth: 190 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  menuIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 17, color: '#000' },
});
