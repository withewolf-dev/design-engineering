import {
  Canvas,
  Circle,
  LinearGradient,
  Oval,
  RoundedRect,
  Shadow,
  vec,
} from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

// Motion follows the Emil Kowalski framework:
// - seen daily → one-time reveal choreography only, nothing loops
// - the progress fill + count-up is state indication (the earned animation)
// - day circles stagger in 45ms apart, scale 0.9→1 (never from 0)
// - rejected: counting "32 DAYS" (headline being read), flame pulse (loop)
// - reduced motion: movement dropped, fades kept

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const EASE = Easing.bezier(0.23, 1, 0.32, 1);

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W * 0.92, 380);
const PADDING = 22;
const INNER_W = CARD_W - PADDING * 2;

const WEEK: { d: string; s: 'done' | 'current' | 'empty' }[] = [
  { d: 'Mon', s: 'done' },
  { d: 'Tue', s: 'done' },
  { d: 'Wed', s: 'done' },
  { d: 'Thu', s: 'current' },
  { d: 'Fri', s: 'empty' },
  { d: 'Sat', s: 'empty' },
  { d: 'Sun', s: 'empty' },
];

const STEPS = 6825;
const GOAL = 10000;
const PCT = STEPS / GOAL;

// glowing orange rounded-square with a flame glyph.
// GLOW_PAD is generous so the blur fades out well inside the canvas —
// an undersized pad clips the glow into a visible square halo.
function FlameEmblem() {
  const S = 54;
  const R = 16;
  const P = 30;
  const C = S + P * 2;
  return (
    <View style={{ width: C, height: C, marginLeft: -P, marginVertical: -P }}>
      <Canvas style={{ width: C, height: C }}>
        <RoundedRect x={P} y={P} width={S} height={S} r={R}>
          <Shadow dx={0} dy={0} blur={26} color="rgba(255,120,40,0.30)" />
          <Shadow dx={0} dy={2} blur={13} color="rgba(255,95,25,0.55)" />
          <LinearGradient
            start={vec(P, P)}
            end={vec(P, P + S)}
            colors={['#FF8A3D', '#E22F17']}
          />
        </RoundedRect>
      </Canvas>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 25 }}>🔥</Text>
      </View>
    </View>
  );
}

// footprint: rotated sole + a toe arc that follows the sole's tilt
function FootIcon() {
  const g = '#6E7378';
  return (
    <View style={{ transform: [{ rotate: '8deg' }] }}>
      <Canvas style={{ width: 30, height: 34 }}>
        <Oval x={9.5} y={13.5} width={12.5} height={16.5} color={g} />
        <Circle cx={10.8} cy={10.2} r={2.6} color={g} />
        <Circle cx={15.4} cy={8.2} r={2.2} color={g} />
        <Circle cx={19.4} cy={8.4} r={1.9} color={g} />
        <Circle cx={22.6} cy={10.2} r={1.7} color={g} />
      </Canvas>
    </View>
  );
}

// fade + 6px rise, started after `delay` ms
function Reveal({
  delay,
  reduced,
  children,
}: {
  delay: number;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 350, easing: EASE }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: reduced ? 0 : 6 * (1 - p.value) }],
  }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

// one weekday circle — staggered scale 0.9→1 entrance
function DayCell({
  d,
  s,
  index,
  reduced,
}: {
  d: string;
  s: 'done' | 'current' | 'empty';
  index: number;
  reduced: boolean;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      160 + index * 45,
      withTiming(1, { duration: 320, easing: EASE }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: reduced ? 1 : 0.9 + 0.1 * p.value }],
  }));
  return (
    <Animated.View style={[styles.dayCol, a]}>
      <View
        style={[
          styles.circle,
          s === 'done' && styles.circleDone,
          s === 'current' && styles.circleCurrent,
          s === 'empty' && styles.circleEmpty,
        ]}
      >
        {s === 'done' && <Text style={styles.check}>✓</Text>}
      </View>
      <Text style={[styles.dayLabel, s !== 'empty' && styles.dayLabelActive]}>
        {d}
      </Text>
    </Animated.View>
  );
}

// glowing green progress bar — fill width driven by the shared reveal value
function StepBar({ p }: { p: SharedValue<number> }) {
  const H = 18;
  const BAR = 8;
  const y = (H - BAR) / 2;
  const r = BAR / 2;
  const fillW = useDerivedValue(() => Math.max(BAR, INNER_W * PCT * p.value));
  const gradEnd = useDerivedValue(() => vec(Math.max(BAR, INNER_W * PCT * p.value), 0));
  return (
    <Canvas style={{ width: INNER_W, height: H }}>
      <RoundedRect
        x={0}
        y={y}
        width={INNER_W}
        height={BAR}
        r={r}
        color="rgba(255,255,255,0.07)"
      />
      <RoundedRect x={0} y={y} width={fillW} height={BAR} r={r}>
        <Shadow dx={0} dy={0} blur={9} color="rgba(95,225,95,0.75)" />
        <LinearGradient start={vec(0, 0)} end={gradEnd} colors={['#37B93F', '#7BF05C']} />
      </RoundedRect>
    </Canvas>
  );
}

export default function StreakCard() {
  const reduced = useReducedMotion();

  // one value drives the bar fill and both counters — they stay in sync
  const barP = useSharedValue(0);
  useEffect(() => {
    barP.value = withDelay(
      reduced ? 0 : 480,
      withTiming(1, { duration: reduced ? 200 : 650, easing: EASE }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepsProps = useAnimatedProps(() => {
    return { text: `${Math.round(STEPS * barP.value)}` } as any;
  });
  const pctProps = useAnimatedProps(() => {
    return { text: `${Math.round(PCT * 100 * barP.value)}%` } as any;
  });

  return (
    <View style={styles.card}>
      {/* header */}
      <Reveal delay={0} reduced={reduced}>
        <View style={styles.header}>
          <FlameEmblem />
          <View style={styles.headerText}>
            <Text style={styles.kicker}>STREAK</Text>
            <View style={styles.bigRow}>
              <Text style={styles.bigNum}>32</Text>
              <Text style={styles.unit}> DAYS</Text>
            </View>
          </View>
          <FootIcon />
        </View>

        <View style={styles.divider} />
      </Reveal>

      {/* week row — cells stagger themselves */}
      <View style={styles.week}>
        {WEEK.map(({ d, s }, i) => (
          <DayCell key={d} d={d} s={s} index={i} reduced={reduced} />
        ))}
      </View>

      {/* steps — bar fill + counters ride one shared value */}
      <Reveal delay={reduced ? 0 : 420} reduced={reduced}>
        <Text style={[styles.kicker, styles.stepsKicker]}>STEPS</Text>
        <View style={styles.stepRow}>
          <AnimatedTextInput
            editable={false}
            allowFontScaling={false}
            caretHidden
            underlineColorAndroid="transparent"
            defaultValue="0"
            animatedProps={stepsProps}
            style={[styles.bigNum, styles.countInput]}
          />
          <Text style={styles.goal}> /{GOAL.toLocaleString('en-US')}</Text>
          <View style={{ flex: 1 }} />
          <AnimatedTextInput
            editable={false}
            allowFontScaling={false}
            caretHidden
            underlineColorAndroid="transparent"
            defaultValue="0%"
            animatedProps={pctProps}
            style={[styles.pct, styles.countInput]}
          />
        </View>
        <StepBar p={barP} />
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    backgroundColor: '#141518',
    borderRadius: 30,
    padding: PADDING,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8A9095',
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 1,
  },
  bigNum: {
    fontSize: 30,
    fontWeight: '800',
    color: '#F4F6F5',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#8A9095',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 20,
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: {
    backgroundColor: '#59E15A',
    shadowColor: '#59E15A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  circleCurrent: {
    borderWidth: 2.5,
    borderColor: '#59E15A',
    backgroundColor: 'transparent',
  },
  circleEmpty: {
    backgroundColor: '#1E2023',
  },
  check: {
    color: '#0C2E0C',
    fontSize: 18,
    fontWeight: '900',
  },
  dayLabel: {
    marginTop: 9,
    fontSize: 13,
    fontWeight: '600',
    color: '#6E7378',
  },
  dayLabelActive: {
    color: '#C7CCD0',
  },
  stepsKicker: {
    marginTop: 26,
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  countInput: {
    padding: 0,
    margin: 0,
  },
  goal: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7078',
  },
  pct: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8A9095',
    fontVariant: ['tabular-nums'],
  },
});
