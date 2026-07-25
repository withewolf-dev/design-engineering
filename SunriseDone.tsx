import { type ReactNode, useEffect, useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import HorizonGlow from './HorizonGlow';

// Day-complete screen, tuned with Apple's fluid-interface principles:
// - the dawn is TOUCHABLE: drag tracks 1:1 with rubber-band resistance,
//   release springs home carrying the finger's velocity (damping ~0.8 —
//   bounce is allowed because the gesture carried momentum)
// - entrances are critically-damped springs (damping 1.0), not bezier timings
// - content parallaxes at 0.35× of the horizon — depth, not decoration
// - press feedback on pointer-down, ~100ms
// - reduced motion: fades only, drag disabled

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

// Apple's rubber-band: the further past the boundary, the less it follows
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

function Rise({
  delay,
  reduced,
  dy = 8,
  duration = 450,
  children,
}: {
  delay: number;
  reduced: boolean;
  dy?: number;
  duration?: number;
  children: ReactNode;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    // critically damped spring — graceful settle, zero overshoot
    p.value = withDelay(delay, withSpring(1, { dampingRatio: 1, duration }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: reduced ? 0 : dy * (1 - p.value) }],
  }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

export default function SunriseDone({ onSeePost }: { onSeePost?: () => void }) {
  const reduced = useReducedMotion();

  // drag offset of the horizon — 0 at rest
  const drag = useSharedValue(0);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // ~10px hysteresis before committing to the drag (taps unaffected)
        onMoveShouldSetPanResponder: (_e, g) =>
          !reduced && Math.abs(g.dy) > 10,
        onPanResponderMove: (_e, g) => {
          // 1:1 with progressive resistance — soft boundary, not a wall
          drag.value = rubberband(g.dy, 400);
        },
        onPanResponderRelease: (_e, g) => {
          // velocity handoff: the spring continues at the finger's speed.
          // slight bounce is earned — the gesture carried momentum.
          drag.value = withSpring(0, {
            dampingRatio: 0.8,
            duration: 450,
            velocity: g.vy * 1000,
          });
        },
        onPanResponderTerminate: () => {
          drag.value = withSpring(0, { dampingRatio: 1, duration: 350 });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduced],
  );

  // sunrise entrance — one spring drives the rise AND the light bloom
  const sun = useSharedValue(0);
  useEffect(() => {
    sun.value = withDelay(100, withSpring(1, { dampingRatio: 1, duration: 900 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pulling the dawn upward brightens the rim — light responds to the finger
  const lift = useDerivedValue(() =>
    Math.min(1, Math.max(0, -drag.value / 70)),
  );

  // horizon follows the finger fully; content sits deeper — 0.35× parallax
  const horizonDrag = useAnimatedStyle(() => ({
    opacity: Math.min(1, sun.value * 1.2),
    transform: [
      { translateY: (reduced ? 0 : 36 * (1 - sun.value)) + drag.value },
    ],
  }));
  const contentDrag = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value * 0.35 }],
  }));

  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  return (
    <View style={styles.root} {...pan.panHandlers}>
      {/* the dawn rises and blooms once, then belongs to the finger */}
      <Animated.View style={[StyleSheet.absoluteFill, horizonDrag]}>
        <View style={styles.horizonBox}>
          <HorizonGlow reveal={sun} lift={lift} />
        </View>
      </Animated.View>

      {/* content in the dark sky — parallaxes at 0.35× */}
      <Animated.View style={[styles.content, contentDrag]} pointerEvents="box-none">
        <Rise delay={350} reduced={reduced}>
          <Text style={styles.kicker}>DAY 32 COMPLETE</Text>
        </Rise>
        <Rise delay={410} reduced={reduced}>
          <Text style={styles.headline}>That's your rep{'\n'}for today.</Text>
        </Rise>
        <Rise delay={470} reduced={reduced}>
          <Text style={styles.sub}>
            Post is live. The next task arrives at sunrise.
          </Text>
        </Rise>
        <Rise delay={530} reduced={reduced}>
          <Pressable
            onPressIn={() => {
              // respond on pointer-down — instant
              press.value = withTiming(0.97, { duration: 100, easing: EASE });
            }}
            onPressOut={() => {
              press.value = withSpring(1, { dampingRatio: 1, duration: 300 });
            }}
            onPress={onSeePost}
          >
            <Animated.View style={[styles.btn, pressStyle]}>
              <Text style={styles.btnText}>See today's post</Text>
            </Animated.View>
          </Pressable>
        </Rise>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#181824',
    overflow: 'hidden',
  },
  horizonBox: {
    width: '100%',
    height: '100%',
  },
  content: {
    position: 'absolute',
    top: '9%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.6, // small caps keep positive tracking
    color: 'rgba(196,186,255,0.75)',
    marginBottom: 10,
  },
  headline: {
    fontSize: 28,
    lineHeight: 31, // tight leading for display text
    letterSpacing: -0.6, // negative tracking as type grows
    fontWeight: '800',
    color: '#F4F2FF',
    textAlign: 'center',
    marginBottom: 10,
  },
  sub: {
    fontSize: 13.5,
    lineHeight: 19, // comfortable leading for body
    color: 'rgba(214,208,244,0.65)',
    textAlign: 'center',
    marginBottom: 20,
  },
  btn: {
    paddingHorizontal: 22,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  btnText: {
    color: '#EFEDF8',
    fontSize: 14.5,
    fontWeight: '700',
  },
});
