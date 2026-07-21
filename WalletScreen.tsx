import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');
const CARD_W = width - 44;
const CARD_H = Math.round(CARD_W * 0.62);
const COLL_STEP = 44; // peek spacing (collapsed)
const EXP_STEP = 96; // fanned spacing (expanded)
const CONTAINER_H = CARD_H + (2 * EXP_STEP) + 20;

// ── palette (flat, no gradients) ────────────────────────────────
const C = {
  bg: '#0E0F13',
  surface: '#1A1C22',
  surfaceHi: '#23262F',
  line: 'rgba(255,255,255,0.08)',
  text: '#F5F6F8',
  muted: '#8B90A0',
  faint: '#565C6B',
  green: '#4FD6A0',
};

type Txn = { m: string; c: string; a: string; income?: boolean; tint: string };
type Card = {
  id: string;
  color: string;
  chip: string;
  name: string;
  last4: string;
  net: string;
  balance: string;
  txns: Txn[];
};

const CARDS: Card[] = [
  {
    id: 'everyday',
    color: '#0E5A47',
    chip: '#D8B25A',
    name: 'Everyday',
    last4: '4291',
    net: 'VISA',
    balance: '$8,240.16',
    txns: [
      { m: 'Blue Bottle', c: 'Coffee · Today', a: '-$5.40', tint: '#3B82F6' },
      { m: 'Figma', c: 'Software · Today', a: '-$15.00', tint: '#A259FF' },
      { m: 'Payroll', c: 'Income · Jul 1', a: '+$4,200.00', income: true, tint: '#10B981' },
      { m: 'Lyft', c: 'Transport · Yesterday', a: '-$18.60', tint: '#EC4899' },
    ],
  },
  {
    id: 'travel',
    color: '#2B357C',
    chip: '#C9CEDA',
    name: 'Travel',
    last4: '8830',
    net: 'MASTERCARD',
    balance: '$3,120.00',
    txns: [
      { m: 'Emirates', c: 'Flights · Jul 18', a: '-$862.00', tint: '#EF4444' },
      { m: 'Airbnb', c: 'Stays · Jul 17', a: '-$430.00', tint: '#FF5A5F' },
      { m: 'Top up', c: 'Transfer · Jul 15', a: '+$1,500.00', income: true, tint: '#10B981' },
    ],
  },
  {
    id: 'reserve',
    color: '#1D1E24',
    chip: '#8A8F9C',
    name: 'Reserve',
    last4: '1174',
    net: 'AMEX',
    balance: '$1,120.39',
    txns: [
      { m: 'Apple', c: 'Devices · Jul 12', a: '-$1,299.00', tint: '#9CA3AF' },
      { m: 'Cashback', c: 'Reward · Jul 10', a: '+$64.95', income: true, tint: '#10B981' },
      { m: 'Whole Foods', c: 'Grocery · Jul 9', a: '-$88.20', tint: '#22C55E' },
    ],
  },
];

// ── card face ───────────────────────────────────────────────────
function CardFace({ card }: { card: Card }) {
  return (
    <View style={[cf.card, { backgroundColor: card.color }]}>
      <View style={cf.top}>
        <Text style={cf.label}>{card.name.toUpperCase()}</Text>
        <Text style={cf.net}>{card.net}</Text>
      </View>
      <View style={[cf.chip, { backgroundColor: card.chip }]}>
        <View style={cf.chipLine} />
        <View style={cf.chipLine} />
      </View>
      <Text style={cf.number}>••••  ••••  ••••  {card.last4}</Text>
      <View style={cf.bottom}>
        <Text style={cf.holder}>GITARTHA A</Text>
        <Text style={cf.exp}>08 / 28</Text>
      </View>
    </View>
  );
}

// ── screen ──────────────────────────────────────────────────────
export default function WalletScreen() {
  const expand = useRef(new Animated.Value(0)).current;
  const expandVal = useRef(0);
  const [active, setActive] = useState(0);
  const lifts = useMemo(() => CARDS.map(() => new Animated.Value(0)), []);
  const enter = useMemo(() => CARDS.map(() => new Animated.Value(0)), []);
  const ui = useRef(new Animated.Value(0)).current; // header + list entrance

  useEffect(() => {
    const id = expand.addListener(({ value }) => (expandVal.current = value));
    Animated.parallel([
      Animated.timing(ui, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.stagger(
        90,
        enter.map((v) =>
          Animated.spring(v, { toValue: 1, useNativeDriver: true, damping: 13 }),
        ),
      ),
    ]).start();
    // start with the front card active
    Animated.spring(lifts[0], { toValue: 1, useNativeDriver: true }).start();
    return () => expand.removeListener(id);
  }, [enter, expand, lifts, ui]);

  const springExpand = (to: number) => {
    expandVal.current = to;
    Animated.spring(expand, {
      toValue: to,
      useNativeDriver: true,
      damping: 15,
      stiffness: 140,
    }).start();
  };

  const selectCard = (i: number) => {
    if (expandVal.current < 0.5) {
      springExpand(1); // first tap opens the fan
      return;
    }
    setActive(i);
    lifts.forEach((v, j) =>
      Animated.spring(v, {
        toValue: j === i ? 1 : 0,
        useNativeDriver: true,
        damping: 14,
      }).start(),
    );
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8,
        onPanResponderMove: (_e, g) => {
          const next = expandVal.current + g.dy / 260;
          expand.setValue(Math.max(0, Math.min(1, next)));
        },
        onPanResponderRelease: (_e, g) => {
          const v = Math.max(0, Math.min(1, expandVal.current + g.dy / 260));
          const target = g.vy > 0.5 ? 1 : g.vy < -0.5 ? 0 : v > 0.5 ? 1 : 0;
          springExpand(target);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const card = CARDS[active];
  const fade = (d: number) => ({
    opacity: ui,
    transform: [
      { translateY: ui.interpolate({ inputRange: [0, 1], outputRange: [d, 0] }) },
    ],
  });

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* header */}
        <Animated.View style={[s.header, fade(10)]}>
          <View>
            <Text style={s.hi}>Wallet</Text>
            <Text style={s.date}>Monday, 21 Jul</Text>
          </View>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>GA</Text>
          </View>
        </Animated.View>

        {/* balance (reflects active card) */}
        <Animated.View style={[s.balanceBlock, fade(14)]}>
          <Text style={s.balanceLabel}>{card.name} balance</Text>
          <Text style={s.balance}>{card.balance}</Text>
          <View style={s.trendRow}>
            <Text style={s.trend}>▲ 2.4%</Text>
            <Text style={s.trendSub}>vs last month</Text>
          </View>
        </Animated.View>

        {/* quick actions */}
        <Animated.View style={[s.actions, fade(16)]}>
          {[
            { k: 'Send', g: '↑' },
            { k: 'Request', g: '↓' },
            { k: 'Top up', g: '+' },
          ].map((a) => (
            <Pressable
              key={a.k}
              style={({ pressed }) => [s.action, pressed && { opacity: 0.7 }]}
            >
              <Text style={s.actionGlyph}>{a.g}</Text>
              <Text style={s.actionTxt}>{a.k}</Text>
            </Pressable>
          ))}
        </Animated.View>

        {/* SIGNATURE: fan-out card stack */}
        <View style={s.stack} {...pan.panHandlers}>
          {CARDS.map((c, i) => {
            // i === 0 is the front (prominent) card; higher i sits further back/up
            const depth = CARDS.length - 1 - i;
            const collY = 60 + depth * COLL_STEP;
            const expY = 10 + depth * EXP_STEP;
            const scaleColl = 1 - i * 0.05;
            return (
              <Animated.View
                key={c.id}
                style={[
                  s.cardWrap,
                  {
                    zIndex: active === i ? 100 : depth,
                    opacity: enter[i],
                    transform: [
                      {
                        translateY: enter[i].interpolate({
                          inputRange: [0, 1],
                          outputRange: [26, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Animated.View
                  style={{
                    transform: [
                      {
                        translateY: expand.interpolate({
                          inputRange: [0, 1],
                          outputRange: [collY, expY],
                        }),
                      },
                      {
                        scale: expand.interpolate({
                          inputRange: [0, 1],
                          outputRange: [scaleColl, 1],
                        }),
                      },
                    ],
                  }}
                >
                  <Animated.View
                    style={{
                      transform: [
                        {
                          translateY: lifts[i].interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -18],
                          }),
                        },
                      ],
                    }}
                  >
                    <Pressable onPress={() => selectCard(i)}>
                      <CardFace card={c} />
                    </Pressable>
                  </Animated.View>
                </Animated.View>
              </Animated.View>
            );
          })}
        </View>

        {/* transactions (reflect active card) */}
        <Animated.View style={fade(16)}>
          <View style={s.txHead}>
            <Text style={s.txTitle}>Recent</Text>
            <Text style={s.txAll}>See all</Text>
          </View>
          {card.txns.map((t, i) => (
            <View key={i} style={s.tx}>
              <View style={[s.txDot, { backgroundColor: t.tint }]}>
                <Text style={s.txInit}>{t.m[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.txM}>{t.m}</Text>
                <Text style={s.txC}>{t.c}</Text>
              </View>
              <Text style={[s.txA, t.income && { color: C.green }]}>{t.a}</Text>
            </View>
          ))}
          <View style={{ height: 96 }} />
        </Animated.View>
      </ScrollView>

      {/* tab bar */}
      <View style={s.tabbar}>
        {['Home', 'Cards', 'Spend', 'You'].map((t, i) => (
          <Pressable key={t} style={s.tab}>
            {i === 0 && <View style={s.tabDot} />}
            <Text style={[s.tabTxt, i === 0 && s.tabActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const cf = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 22,
    padding: 22,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  net: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '800', fontStyle: 'italic' },
  chip: {
    width: 44,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 7,
  },
  chipLine: { height: 2, borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  number: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  holder: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  exp: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 22, paddingTop: 64 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hi: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  date: { color: C.muted, fontSize: 13, marginTop: 3 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: C.text, fontWeight: '700', fontSize: 14 },

  balanceBlock: { marginTop: 26 },
  balanceLabel: { color: C.muted, fontSize: 14, fontWeight: '500' },
  balance: {
    color: C.text,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1.5,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  trend: { color: C.green, fontSize: 13, fontWeight: '700' },
  trendSub: { color: C.faint, fontSize: 13 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  action: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  actionGlyph: { color: C.text, fontSize: 16, fontWeight: '700' },
  actionTxt: { color: C.text, fontSize: 14, fontWeight: '600' },

  stack: { height: CONTAINER_H, marginTop: 14 },
  cardWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },

  txHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
  txTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  txAll: { color: C.muted, fontSize: 13, fontWeight: '600' },
  tx: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  txDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  txInit: { color: '#fff', fontWeight: '800', fontSize: 16 },
  txM: { color: C.text, fontSize: 15, fontWeight: '600' },
  txC: { color: C.muted, fontSize: 12, marginTop: 2 },
  txA: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },

  tabbar: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 30,
    height: 62,
    borderRadius: 20,
    backgroundColor: 'rgba(26,28,34,0.94)',
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabDot: {
    position: 'absolute',
    top: 11,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.green,
  },
  tabTxt: { color: C.faint, fontSize: 12, fontWeight: '600' },
  tabActive: { color: C.text },
});
