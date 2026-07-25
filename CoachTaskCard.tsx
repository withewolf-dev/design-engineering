import { type ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import SunsetCard from './SunsetCard';

// Coach task card — daily task offer for the LinkedIn coach.
// Motion follows Emil Kowalski's framework:
// - seen daily → standard animation only; completion (rare) gets the one pop
// - entrances ease-out on a strong custom curve, staggered 50ms
// - press feedback: scale 0.97 @ 120ms
// - accept → in-progress is a state-indication crossfade (asymmetric timing)
// - decline exits faster than anything enters
// - reduced motion: movement removed, fades kept

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const ENTER_MS = 350;
const STAGGER_MS = 50;

type Phase = 'offered' | 'active' | 'done';

// pressable with Emil's scale-on-press feedback
function PressScale({
  onPress,
  style,
  children,
}: {
  onPress: () => void;
  style?: object;
  children: ReactNode;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      onPressIn={() => {
        s.value = withTiming(0.97, { duration: 120, easing: EASE_OUT });
      }}
      onPressOut={() => {
        s.value = withTiming(1, { duration: 160, easing: EASE_OUT });
      }}
      onPress={onPress}
      style={{ flex: 1 }}
    >
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

// staggered entrance row: fade + 8px rise, delayed by index
function Enter({
  index,
  reduced,
  children,
  style,
}: {
  index: number;
  reduced: boolean;
  children: ReactNode;
  style?: object;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      index * STAGGER_MS,
      withTiming(1, { duration: ENTER_MS, easing: EASE_OUT }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: reduced ? 0 : 8 * (1 - p.value) }],
  }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

export default function CoachTaskCard() {
  const reduced = useReducedMotion();

  // Phase morph state — from-phase, to-phase, and one transition progress.
  // Tracking from/to (instead of a single 0..2 value) means a done→offered
  // reset never passes *through* the active phase, so no row flashes.
  // No React state: presses only write shared values → zero re-renders.
  const fromP = useSharedValue(0);
  const toP = useSharedValue(0);
  const tp = useSharedValue(1); // 1 = settled on toP
  const checkPop = useSharedValue(0);

  const go = (next: Phase) => {
    const idx = next === 'offered' ? 0 : next === 'active' ? 1 : 2;
    fromP.value = toP.value;
    toP.value = idx;
    tp.value = 0;
    tp.value = withTiming(1, { duration: 260, easing: EASE_OUT });
    if (next === 'done') {
      if (reduced) {
        checkPop.value = withTiming(1, { duration: 150 });
      } else {
        checkPop.value = 0.5; // never from scale(0)
        checkPop.value = withSpring(1, { damping: 14, stiffness: 260 });
      }
    }
  };

  // Asymmetric morph: the exiting row leaves ~1.6× faster than the entering
  // row arrives, so the two rows never sit double-exposed mid-crossfade.
  // Entering row rises 10px and settles from scale 0.97 (never from 0).
  const rowStyle = (i: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const entering = toP.value === i;
      const leaving = fromP.value === i && toP.value !== i;
      const exitP = Math.min(tp.value * 1.6, 1);
      const o = entering ? tp.value : leaving ? 1 - exitP : 0;
      return {
        opacity: o,
        transform: [
          {
            translateY: reduced
              ? 0
              : entering
                ? 10 * (1 - tp.value)
                : leaving
                  ? -6 * exitP
                  : 0,
          },
          { scale: reduced ? 1 : entering ? 0.97 + 0.03 * tp.value : 1 },
        ],
        pointerEvents: entering && tp.value > 0.5 ? 'auto' : 'none',
      } as any;
    });
  const offeredRow = rowStyle(0);
  const activeRow = rowStyle(1);
  const doneRow = rowStyle(2);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkPop.value }],
  }));

  // kicker labels ride the same from/to/progress — always in sync with rows
  const kickerStyle = (i: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const entering = toP.value === i;
      const leaving = fromP.value === i && toP.value !== i;
      const exitP = Math.min(tp.value * 1.6, 1);
      return { opacity: entering ? tp.value : leaving ? 1 - exitP : 0 };
    });
  const kickerOffered = kickerStyle(0);
  const kickerActive = kickerStyle(1);
  const kickerDone = kickerStyle(2);

  return (
    <SunsetCard>
      <View style={styles.content}>
        {/* header */}
        <Enter index={0} reduced={reduced}>
          <View style={styles.kickerSlot}>
            <Animated.Text style={[styles.kicker, kickerOffered]}>
              TODAY'S TASK
            </Animated.Text>
            <Animated.Text style={[styles.kicker, styles.kickerAbs, kickerActive]}>
              IN PROGRESS
            </Animated.Text>
            <Animated.Text style={[styles.kicker, styles.kickerAbs, kickerDone]}>
              COMPLETED
            </Animated.Text>
          </View>
        </Enter>

        <Enter index={1} reduced={reduced}>
          <Text style={styles.title}>Write a short post on useEffect</Text>
        </Enter>

        <Enter index={2} reduced={reduced}>
          <Text style={styles.desc}>
            Explain the dependency array with one real bug you hit. End with a
            question to invite replies.
          </Text>
        </Enter>

        <View style={{ flex: 1 }} />

        {/* stats — why this task is worth doing */}
        <Enter index={3} reduced={reduced}>
          <View style={styles.chips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>≈ 40 min</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>+2.4× reach</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>🔥 streak +1</Text>
            </View>
          </View>
        </Enter>

        {/* actions — one slot, three phase rows crossfading */}
        <Enter index={4} reduced={reduced}>
          <View style={styles.actionSlot}>
            <Animated.View style={[styles.row, offeredRow]}>
              <PressScale style={[styles.btn, styles.btnGhost]} onPress={() => go('done')}>
                <Text style={styles.btnGhostText}>Not today</Text>
              </PressScale>
              <PressScale style={[styles.btn, styles.btnSolid]} onPress={() => go('active')}>
                <Text style={styles.btnSolidText}>Accept task</Text>
              </PressScale>
            </Animated.View>

            <Animated.View style={[styles.row, styles.rowAbs, activeRow]}>
              <PressScale style={[styles.btn, styles.btnSolid]} onPress={() => go('done')}>
                <Text style={styles.btnSolidText}>Mark complete</Text>
              </PressScale>
            </Animated.View>

            <Animated.View style={[styles.row, styles.rowAbs, doneRow]}>
              <PressScale style={[styles.btn, styles.btnDone]} onPress={() => go('offered')}>
                <View style={styles.doneInner}>
                  <Animated.Text style={[styles.check, checkStyle]}>✓</Animated.Text>
                  <Text style={styles.doneText}> Done · new task in 18h</Text>
                </View>
              </PressScale>
            </Animated.View>
          </View>
        </Enter>
      </View>
    </SunsetCard>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    height: '100%',
    padding: 24,
  },
  kickerSlot: {
    marginBottom: 10,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.4,
    color: 'rgba(255,214,150,0.85)',
  },
  kickerAbs: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  title: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '800',
    color: '#FFF6E8',
    marginBottom: 10,
  },
  desc: {
    fontSize: 13.5,
    lineHeight: 19,
    color: 'rgba(255,238,214,0.72)',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(24,12,2,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,236,200,0.25)',
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFEFD6',
  },
  actionSlot: {
    height: 52,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    height: 52,
  },
  rowAbs: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  btn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSolid: {
    backgroundColor: '#1A1008',
  },
  btnSolidText: {
    color: '#FFE9C4',
    fontSize: 15,
    fontWeight: '700',
  },
  btnGhost: {
    backgroundColor: 'rgba(26,16,8,0.30)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,236,200,0.35)',
  },
  btnGhostText: {
    color: '#FFF3DE',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDone: {
    backgroundColor: 'rgba(26,16,8,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,236,200,0.3)',
  },
  doneInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  check: {
    color: '#8BEF5A',
    fontSize: 17,
    fontWeight: '900',
  },
  doneText: {
    color: '#FFE9C4',
    fontSize: 14.5,
    fontWeight: '700',
  },
});
