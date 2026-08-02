import { type ReactNode, useEffect, useState } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Full-screen push presentation, iOS-style.
//
// `progress` is owned by the caller so the layer *underneath* can move with
// the same value — one clock, no drift between the two halves of the push.
//
// Asymmetric by design: entering takes 380ms on the iOS drawer curve (the
// screen is arriving, it should feel weighty); leaving takes 260ms ease-out
// (the user already decided — get out of the way).

const EASE_DRAWER = Easing.bezier(0.32, 0.72, 0, 1);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export default function PushScreen({
  visible,
  progress,
  children,
}: {
  visible: boolean;
  progress: SharedValue<number>;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const w = Dimensions.get('window').width;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: reduced ? 200 : 380,
        easing: reduced ? EASE_OUT : EASE_DRAWER,
      });
    } else {
      progress.value = withTiming(
        0,
        { duration: reduced ? 160 : 260, easing: EASE_OUT },
        (done) => {
          if (done) runOnJS(setMounted)(false);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    // reduced motion keeps the layer change but drops the travel
    transform: [{ translateX: reduced ? 0 : w * (1 - progress.value) }],
    opacity: reduced ? progress.value : 1,
  }));

  if (!mounted) return null;

  return (
    <Animated.View style={[styles.screen, style]} pointerEvents="auto">
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0A0A0B',
    // edge shadow so the arriving screen reads as *above* the gallery
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: -8, height: 0 },
  },
});
