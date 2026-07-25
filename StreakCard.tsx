import {
  Canvas,
  Circle,
  LinearGradient,
  Oval,
  RoundedRect,
  Shadow,
  vec,
} from '@shopify/react-native-skia';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

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

// glowing orange rounded-square with a flame glyph
function FlameEmblem() {
  const S = 54;
  const R = 16;
  const P = 12;
  const C = S + P * 2;
  return (
    <View style={{ width: C, height: C, marginLeft: -P, marginVertical: -P }}>
      <Canvas style={{ width: C, height: C }}>
        <RoundedRect x={P} y={P} width={S} height={S} r={R}>
          <Shadow dx={0} dy={0} blur={16} color="rgba(255,95,25,0.85)" />
          <LinearGradient
            start={vec(P, P)}
            end={vec(P, P + S)}
            colors={['#FF8A3D', '#E22F17']}
          />
        </RoundedRect>
      </Canvas>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 26 }}>🔥</Text>
      </View>
    </View>
  );
}

// simple monochrome footprint (steps) icon
function FootIcon() {
  const W = 34;
  const H = 34;
  const g = '#7C828A';
  return (
    <Canvas style={{ width: W, height: H }}>
      <Oval x={11} y={13} width={13} height={17} color={g} />
      <Circle cx={12.5} cy={10} r={2.1} color={g} />
      <Circle cx={16.5} cy={8} r={2.3} color={g} />
      <Circle cx={20.5} cy={8.5} r={2.2} color={g} />
      <Circle cx={23.5} cy={11} r={2} color={g} />
    </Canvas>
  );
}

// glowing green progress bar
function StepBar() {
  const H = 18;
  const BAR = 8;
  const y = (H - BAR) / 2;
  const r = BAR / 2;
  const fillW = Math.max(BAR, INNER_W * PCT);
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
        <LinearGradient
          start={vec(0, 0)}
          end={vec(fillW, 0)}
          colors={['#37B93F', '#7BF05C']}
        />
      </RoundedRect>
    </Canvas>
  );
}

export default function StreakCard() {
  return (
    <View style={styles.card}>
      {/* header */}
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

      {/* week row */}
      <View style={styles.week}>
        {WEEK.map(({ d, s }) => (
          <View key={d} style={styles.dayCol}>
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
            <Text
              style={[styles.dayLabel, s !== 'empty' && styles.dayLabelActive]}
            >
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* steps */}
      <Text style={[styles.kicker, styles.stepsKicker]}>STEPS</Text>
      <View style={styles.stepRow}>
        <Text style={styles.bigNum}>{STEPS.toLocaleString('en-US').replace(',', '')}</Text>
        <Text style={styles.goal}> /{GOAL.toLocaleString('en-US')}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.pct}>{Math.round(PCT * 100)}%</Text>
      </View>
      <StepBar />
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
  goal: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7078',
  },
  pct: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8A9095',
  },
});
