import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Path,
  Shadow,
  Skia,
  usePathValue,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { NumberFlow, TimeFlow } from 'number-flow-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// A 24-hour charge window. Motion decisions:
//
// - DRAGGING IS NOT ANIMATED. The arc and the handles are driven straight off
//   the finger at 1:1, entirely on the UI thread. Grab offset is
//   preserved (angular deltas, not absolute angle), so the handle never jumps
//   under your thumb.
// - the three readouts are the exception: TimeFlow and NumberFlow roll their
//   digits and are JS-value components, so ONE reaction syncs all of them
//   across the bridge, and only when a displayed 5-minute value changes. That
//   is an acceptable trade for secondary displays — they are not what you are
//   touching. The thing under your thumb never waits on the JS thread.
// - the one-time build IS animated: a single `reveal` value sweeps the arc
//   from start to stop, which drags the stop handle and counts the duration
//   up for free. It explains the control in one gesture-shaped motion.
// - touching anything cancels the build instantly. The finger always wins.
// - handles lift on grab (scale 1.14 + deeper shadow) — the only feedback
//   available when your thumb is covering the thing you're touching.
// - the 24h swap crossfades the dial while it is invisible; two label sets
//   never overlap on screen.
// - reduced motion: no sweep, no scale, no lift. Values land where they are.

const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_FN = Easing.bezier(0.23, 1, 0.32, 1).factory();

const DAY = 1440; // minutes on the dial
const SNAP = 5; // minutes
// an hour, not 30 minutes: it guarantees the centre readout always has an hours
// segment, so the only part that can appear or disappear is the minutes. One
// structural change instead of two, and a sub-hour charge window is not useful
const MIN_SPAN = 60;
const MAX_SPAN = DAY - 30;

const RING = 30; // track thickness
const KNOB = 19; // handle radius
const GLYPH = KNOB / 23; // the bolt was drawn for a 23pt knob; keep it in ratio
// Deliberately NOT tied to KNOB. The dot got smaller, the touch target did not
// — 36pt of reach keeps both handles grabbable without hunting for them.
const GRAB = 36;

const GREEN = '#B7E96B';
const TRACK = '#F0F0F1';
const INK = '#0E0E10';

// ------------------------------------------------------------------- haptics

// Apple's grammar (Designing Audio-Haptic Experiences): CAUSALITY — fire on
// the causal event, not near it; HARMONY — same touch event as the visual
// change; UTILITY — only where it earns its place, or people learn to ignore
// all of it. The dial is a physical object — a crown — so the vocabulary is
// physical:
//
//   grab     light impact — you picked up a knob
//   band     soft impact  — the band is a broader, softer thing than a knob
//   tick     selection    — the crown's detent, once per 5-minute stop
//   hour     rigid impact — a taller tick on the same ruler, always felt
//   wall     heavy impact — the 1h / 23h30m clamp, once per arrival, not
//                           per event while pinned against it
//   drop     soft impact  — you set it down
//
// The entrance sweep is SILENT: the user didn't cause it (causality), and a
// self-buzzing component is exactly how haptics get turned off.
const buzz = {
  grab: (band: boolean) =>
    Haptics.impactAsync(
      band ? Haptics.ImpactFeedbackStyle.Soft : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => {}),
  tick: () => Haptics.selectionAsync().catch(() => {}),
  hour: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {}),
  wall: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  drop: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}),
};

// ------------------------------------------------------------------ geometry

// both run on the UI runtime (derived values) AND the JS one (pan handler),
// so they have to be worklets — an arrow function const cannot be workletized
function snap(v: number) {
  'worklet';
  return Math.round(v / SNAP) * SNAP;
}

function wrapDay(v: number) {
  'worklet';
  return ((v % DAY) + DAY) % DAY;
}

// 0 minutes sits at 12 o'clock and time runs clockwise
function pointAt(min: number, c: number, r: number) {
  const a = ((min / 4 - 90) * Math.PI) / 180;
  return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
}

function angleAt(x: number, y: number, c: number) {
  let deg = (Math.atan2(x - c, -(y - c)) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

// shortest signed distance between two angles, so crossing midnight is not a
// 359° jump
function shortest(deg: number) {
  let d = deg;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}

// a lightning bolt drawn around its own centre, so the handle can just move
function boltPath() {
  const p = Skia.Path.Make();
  p.moveTo(2.8, -8.5);
  p.lineTo(-5.5, 1.5);
  p.lineTo(-0.8, 1.5);
  p.lineTo(-2.8, 8.5);
  p.lineTo(5.5, -1.5);
  p.lineTo(0.8, -1.5);
  p.close();
  return p;
}

// ------------------------------------------------------------------- handles

function Knob({
  min,
  grab,
  size,
  radius,
  off,
}: {
  min: SharedValue<number>;
  grab: SharedValue<number>;
  size: number;
  radius: number;
  off?: boolean;
}) {
  const c = size / 2;
  const bolt = useMemo(boltPath, []);
  const slash = useMemo(
    () => Skia.Path.Make().moveTo(-8.4, -8.4).lineTo(8.4, 8.4),
    [],
  );

  const transform = useDerivedValue(() => {
    const a = ((min.value / 4 - 90) * Math.PI) / 180;
    return [
      { translateX: c + radius * Math.cos(a) },
      { translateY: c + radius * Math.sin(a) },
      { scale: grab.value },
    ];
  });

  // the lift reads as the handle coming toward you, so the shadow grows with it
  const shadowBlur = useDerivedValue(() => 5 + 50 * (grab.value - 1));

  return (
    <Group transform={transform}>
      <Circle cx={0} cy={0} r={KNOB} color={INK}>
        <Shadow dx={0} dy={2} blur={shadowBlur} color="rgba(0,0,0,0.26)" />
      </Circle>
      {/* one scale keeps the glyph in ratio with the dot — Skia scales the
          slash's stroke weights along with it, so nothing has to be retuned */}
      <Group transform={[{ scale: GLYPH }]}>
        <Path path={bolt} color="#FFFFFF" />
        {off && (
          <>
            {/* the slash carries its own gap so it reads on top of the bolt */}
            <Path path={slash} style="stroke" strokeWidth={5.5} strokeCap="round" color={INK} />
            <Path path={slash} style="stroke" strokeWidth={2.2} strokeCap="round" color="#FFFFFF" />
          </>
        )}
      </Group>
    </Group>
  );
}

// --------------------------------------------------------------------- clock

// memo matters here: dragging the stop handle leaves `start` untouched, so the
// start readout — a whole tree of digit slots — skips the render entirely.
// Rolling digits, same engine as the currency demo. Timings are cut hard from
// the library's 900ms default: while you drag, the readout is chasing a value
// that changes several times a second, so a slow roll would simply never catch
// up. 190ms is long enough to read as motion and short enough to stay glued to
// the dial. `trend` is left to auto, so digits spin the way time is moving —
// up when you extend the window, down when you pull it back.
const Clock = memo(function Clock({ min, h24 }: { min: number; h24: boolean }) {
  return (
    <TimeFlow
      hours={Math.floor(min / 60)}
      minutes={min % 60}
      is24Hour={h24}
      padHours={h24}
      style={styles.value}
      containerStyle={styles.valueBox}
      spinTiming={{ duration: 190, easing: EASE_FN }}
      transformTiming={{ duration: 190, easing: EASE_FN }}
      opacityTiming={{ duration: 130, easing: EASE_FN }}
    />
  );
});

// ------------------------------------------------------------------ duration

// The centre readout. Its structure changes — "6 h" has no minutes segment,
// "9 h 45 m" does — and a segment mounting mid-drag would jump the layout by
// its own width. So both segments stay mounted always: the minutes group
// fades, and the row slides by half that group's width to re-centre the hours.
// Opacity and transform only, which means it can happen under a moving finger.
const Duration = memo(function Duration({
  min,
  reduced,
}: {
  min: number;
  reduced: boolean;
}) {
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  const showM = minutes > 0;
  // "6 h" gets to be the hero; "23 h 55 m" steps down rather than colliding
  // with the hour ring at 3 and 9 o'clock
  const target = !showM ? 1 : hours >= 10 ? 0.74 : 0.82;

  const mw = useSharedValue(0); // measured width of the minutes group
  const p = useSharedValue(showM ? 1 : 0);
  const fit = useSharedValue(target);

  useEffect(() => {
    if (reduced) {
      p.value = showM ? 1 : 0;
      fit.value = target;
      return;
    }
    p.value = withSpring(showM ? 1 : 0, { dampingRatio: 1, duration: 260 });
    fit.value = withSpring(target, { dampingRatio: 1, duration: 240 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showM, target, reduced]);

  const row = useAnimatedStyle(() => ({
    transform: [
      { translateX: (mw.value / 2) * (1 - p.value) },
      { scale: fit.value },
    ],
  }));
  const mins = useAnimatedStyle(() => ({ opacity: p.value }));

  return (
    <Animated.View style={[styles.durRow, row]}>
      <NumberFlow
        value={hours}
        suffix=" h"
        style={styles.span}
        spinTiming={{ duration: 190, easing: EASE_FN }}
        transformTiming={{ duration: 190, easing: EASE_FN }}
        opacityTiming={{ duration: 130, easing: EASE_FN }}
      />
      <Animated.View
        style={[styles.durMins, mins]}
        onLayout={(e) => {
          mw.value = e.nativeEvent.layout.width;
        }}
      >
        <NumberFlow
          value={minutes}
          format={{ minimumIntegerDigits: 2 }}
          suffix=" m"
          style={styles.span}
          spinTiming={{ duration: 190, easing: EASE_FN }}
          transformTiming={{ duration: 190, easing: EASE_FN }}
          opacityTiming={{ duration: 130, easing: EASE_FN }}
        />
      </Animated.View>
    </Animated.View>
  );
});

// -------------------------------------------------------------------- switch

function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(on ? 1 : 0, { dampingRatio: 0.9, duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], ['#E7E7E9', GREEN]),
  }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: 18 * p.value }],
  }));

  return (
    <Pressable onPress={onChange} hitSlop={12}>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Pressable>
  );
}

// ----------------------------------------------------------------- component

export default function ChargeWindow({
  onDragChange,
}: {
  // fires on touch-down, before a finger can travel far enough to scroll —
  // the host locks its scroll view for the length of the gesture
  onDragChange?: (dragging: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const [size, setSize] = useState(0);
  const [h24, setH24] = useState(false);

  const start = useSharedValue(0); // 12:00am
  const stop = useSharedValue(360); // 6:00am
  const reveal = useSharedValue(0);
  const grabA = useSharedValue(1);
  const grabB = useSharedValue(1);
  const dialIn = useSharedValue(0);
  const labels = useSharedValue(1);

  const c = size / 2;
  const R = Math.max(0, c - 28); // keeps the handles (and their shadow) in frame

  const span = useDerivedValue(() => wrapDay(stop.value - start.value));
  // during the build the arc has not reached the stop handle yet
  const shown = useDerivedValue(() => span.value * reveal.value);
  const shownStop = useDerivedValue(() => wrapDay(start.value + shown.value));

  // usePathValue rebuilds into one pooled builder on the UI thread. Allocating
  // a fresh Skia.Path here per frame (the obvious way) leaks native memory the
  // worklet runtime's GC never feels — a few drag sessions of that and jetsam
  // kills the app.
  const arc = usePathValue((p) => {
    'worklet';
    p.addArc(
      { x: c - R, y: c - R, width: R * 2, height: R * 2 },
      start.value / 4 - 90,
      shown.value / 4,
    );
  });

  // ticks are texture on the band, but they belong to the dial — offsetting
  // the dash phase by the arc's own start keeps them from sliding when the
  // start handle moves
  const phase = useDerivedValue(() => (R * (start.value / 4) * Math.PI) / 180);

  // TimeFlow and NumberFlow roll their digits, but both are JS-value
  // components, so the readouts have to cross to the JS thread. HOW they cross
  // matters more than how often:
  //
  // runOnJS from a per-frame reaction has no backpressure. If JS cannot keep up
  // — four digit-rolling trees per update, and screen recording steals a chunk
  // of the CPU — the calls queue without bound. The readout falls behind the
  // finger, the queue keeps growing, and it ends in a crash rather than a
  // dropped frame. So during a drag the values are pushed from the pan handler,
  // which already runs on the JS thread: if JS is slow, touch events coalesce
  // and updates are dropped instead of stacking up. That is real backpressure.
  //
  // The reaction stays for everything the finger is NOT driving — the entrance
  // sweep — and stands down while a handle is held.
  //
  // Starts collapsed, matching the arc at reveal 0 — otherwise the readouts
  // show their destination for one frame before rolling up to it.
  const [clock, setClock] = useState({ start: 0, stop: 0, dur: 0 });
  const clockRef = useRef(clock);
  // identity-stable on purpose: the animated reaction below captures this
  // function, and a fresh identity per render forces the reaction to
  // re-register and ship a new runOnJS handle across runtimes on every
  // detent render — churn for nothing, and worklets 0.10.0 could abort in
  // exactly that handle turnover mid-drag
  const pushClock = useCallback((s: number, e: number, d: number) => {
    const c = clockRef.current;
    if (c.start === s && c.stop === e && c.dur === d) return;
    clockRef.current = { start: s, stop: e, dur: d };
    setClock(clockRef.current);
  }, []);

  const dragSV = useSharedValue(0);
  useAnimatedReaction(
    () =>
      dragSV.value
        ? null
        : {
            s: wrapDay(snap(start.value)),
            e: wrapDay(snap(shownStop.value)),
            d: Math.max(0, snap(shown.value)),
          },
    (cur, prev) => {
      if (!cur) return;
      if (!prev || cur.s !== prev.s || cur.e !== prev.e || cur.d !== prev.d) {
        runOnJS(pushClock)(cur.s, cur.e, cur.d);
      }
    },
  );

  const play = () => {
    reveal.value = 0;
    dialIn.value = 0;
    if (reduced) {
      reveal.value = 1;
      dialIn.value = withTiming(1, { duration: 200, easing: EASE });
      return;
    }
    dialIn.value = withSpring(1, { dampingRatio: 1, duration: 420 });
    reveal.value = withDelay(90, withTiming(1, { duration: 420, easing: EASE }));
  };

  useEffect(() => {
    if (size > 0) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const toggle = () => {
    const next = !h24;
    buzz.tick(); // fires on the tap — the causal event — not the flip 110ms later
    // swap both the dial and the readouts at the same instant, while the
    // dial is invisible — the two label sets never overlap. One sequence:
    // two assignments would cancel each other and the swap would never fire.
    labels.value = withSequence(
      withTiming(0, { duration: 110, easing: EASE }, (done) => {
        'worklet';
        if (done) {
          runOnJS(setH24)(next);
        }
      }),
      withTiming(1, { duration: 190, easing: EASE }),
    );
  };

  // ------------------------------------------------------------- drag
  const mode = useRef<'a' | 'b' | 'band' | null>(null);
  const lastDeg = useRef(0);
  // the gesture accumulates unsnapped, and the span is tracked directly rather
  // than re-derived from two wrapped clock values — a fast fling can otherwise
  // wrap past a full day and read as a 30-minute window
  const acc = useRef(0);
  const spanAcc = useRef(0);
  const base = useRef({ start: 0, stop: 0 });

  const clampSpan = (v: number) =>
    v < MIN_SPAN ? MIN_SPAN : v > MAX_SPAN ? MAX_SPAN : v;

  // ---- haptic state: which detent we last ticked at, and whether we are
  // currently pinned against a span clamp
  const lastDetent = useRef(0);
  const tickAt = useRef(0);
  const pinned = useRef(false);

  // one tick per 5-minute stop on the value the finger is driving. Crossing
  // an hour is a taller tick on the same ruler — crisper, and never dropped.
  const detent = (v: number) => {
    const prev = lastDetent.current;
    if (v === prev) return;
    lastDetent.current = v;
    const now = Date.now();
    if (Math.floor(prev / 60) !== Math.floor(v / 60)) {
      tickAt.current = now;
      buzz.hour();
      return;
    }
    // a fast spin purrs rather than buzzes — drop ticks closer than 30ms
    if (now - tickAt.current < 30) return;
    tickAt.current = now;
    buzz.tick();
  };

  // the wall fires once on ARRIVAL at a clamp, then goes silent until the
  // finger leaves the bound — a wall you lean on does not keep knocking back
  const wallCheck = (raw: number, clamped: number) => {
    if (raw !== clamped) {
      if (!pinned.current) {
        pinned.current = true;
        buzz.wall();
      }
    } else {
      pinned.current = false;
    }
  };

  const hitTest = (x: number, y: number) => {
    const a = pointAt(start.value, c, R);
    // test against where the handle actually IS, which mid-build is still
    // riding the arc
    const b = pointAt(shownStop.value, c, R);
    const dA = Math.hypot(x - a.x, y - a.y);
    const dB = Math.hypot(x - b.x, y - b.y);
    if (dA < GRAB && dA <= dB) return 'a' as const;
    if (dB < GRAB) return 'b' as const;
    // the band itself drags the whole window, duration intact
    const r = Math.hypot(x - c, y - c);
    if (Math.abs(r - R) < RING / 2 + 6) {
      const within = wrapDay(angleAt(x, y, c) * 4 - start.value);
      if (within <= wrapDay(stop.value - start.value)) return 'band' as const;
    }
    return null;
  };

  const pan = useMemo(() => {
    const begin = (e: GestureResponderEvent) => {
      if (size === 0) return false;
      const { locationX, locationY } = e.nativeEvent;
      const m = hitTest(locationX, locationY);
      if (!m) return false;
      mode.current = m;
      lastDeg.current = angleAt(locationX, locationY, c);
      // the finger outranks the entrance: freeze the arc exactly where it
      // is on screen rather than snapping it to its destination
      cancelAnimation(reveal);
      stop.value = shownStop.value;
      reveal.value = 1;
      base.current = { start: start.value, stop: stop.value };
      spanAcc.current = wrapDay(stop.value - start.value);
      acc.current = 0;
      if (!reduced) {
        if (m !== 'b')
          grabA.value = withTiming(m === 'a' ? 1.14 : 1.06, { duration: 140, easing: EASE });
        if (m !== 'a')
          grabB.value = withTiming(m === 'b' ? 1.14 : 1.06, { duration: 140, easing: EASE });
      }
      dragSV.value = 1; // the reaction stands down; this handler drives now
      // the pickup — and seed the detent so the grab itself doesn't tick
      buzz.grab(m === 'band');
      lastDetent.current = m === 'b' ? stop.value : start.value;
      pinned.current = false;
      onDragChange?.(true);
      return true;
    };

    const end = () => {
      if (!mode.current) return;
      mode.current = null;
      grabA.value = withSpring(1, { dampingRatio: 1, duration: 260 });
      grabB.value = withSpring(1, { dampingRatio: 1, duration: 260 });
      dragSV.value = 0;
      sync(); // land on the exact final value, whatever was dropped on the way
      buzz.drop(); // set it down
      onDragChange?.(false);
    };

    // called at the end of every move: one setState per touch event, never more
    const sync = () => {
      const s0 = wrapDay(snap(start.value));
      const e0 = wrapDay(snap(stop.value));
      pushClock(s0, e0, Math.max(0, snap(wrapDay(stop.value - start.value))));
    };

    return PanResponder.create({
      // claim the touch in the capture phase, before the finger has moved
      // far enough for the scroll view to consider it a scroll
      onStartShouldSetPanResponderCapture: begin,
      onStartShouldSetPanResponder: begin,
      onMoveShouldSetPanResponderCapture: () => mode.current !== null,
      onMoveShouldSetPanResponder: () => mode.current !== null,
      // the default is `true`, which hands the gesture to the scroll view
      // the moment it asks. It does not get to ask.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderMove: (e) => {
        if (!mode.current) return;
        const { locationX, locationY } = e.nativeEvent;
        const deg = angleAt(locationX, locationY, c);
        const d = shortest(deg - lastDeg.current) * 4; // degrees → minutes
        lastDeg.current = deg;

        if (mode.current === 'band') {
          // the whole window slides, duration untouched
          acc.current += d;
          const shift = snap(acc.current);
          start.value = wrapDay(base.current.start + shift);
          stop.value = wrapDay(base.current.stop + shift);
          detent(start.value);
          sync();
          return;
        }
        if (mode.current === 'a') {
          // moving the start shortens the window; the stop stays put
          const raw = spanAcc.current - d;
          spanAcc.current = clampSpan(raw);
          wallCheck(raw, spanAcc.current);
          start.value = wrapDay(base.current.stop - snap(spanAcc.current));
          detent(start.value);
        } else {
          const raw = spanAcc.current + d;
          spanAcc.current = clampSpan(raw);
          wallCheck(raw, spanAcc.current);
          stop.value = wrapDay(base.current.start + snap(spanAcc.current));
          detent(stop.value);
        }
        sync();
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, c, R, reduced]);

  // ------------------------------------------------------------- render
  const dialStyle = useAnimatedStyle(() => ({
    opacity: dialIn.value,
    transform: [{ scale: reduced ? 1 : 0.96 + 0.04 * dialIn.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: labels.value * dialIn.value }));

  const hours = useMemo(() => {
    // the hour ring hugs the track, which is what buys the readout its room
    const r = R - 30;
    return Array.from({ length: 12 }, (_, i) => {
      const hh = i * 2;
      const p = pointAt(hh * 60, c, r);
      const text = h24
        ? `${hh}`
        : hh === 0
          ? '12am'
          : hh === 12
            ? '12pm'
            : `${hh % 12 === 0 ? 12 : hh % 12}`;
      return { key: hh, x: p.x, y: p.y, text };
    });
  }, [R, c, h24]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Time</Text>

      <View style={styles.row}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Start</Text>
          <Clock min={clock.start} h24={h24} />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Stop</Text>
          <Clock min={clock.stop} h24={h24} />
        </View>
        <View style={styles.switchField}>
          <Text style={styles.fieldLabel}>24 h</Text>
          <Switch on={h24} onChange={toggle} />
        </View>
      </View>

      <View
        style={styles.dial}
        onLayout={(e) => setSize(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
      >
        {size > 0 && (
          <Animated.View style={[StyleSheet.absoluteFill, dialStyle]} pointerEvents="none">
            <Canvas style={{ width: size, height: size }}>
              <Circle
                cx={c}
                cy={c}
                r={R}
                style="stroke"
                strokeWidth={RING}
                color={TRACK}
              />

              <Path
                path={arc}
                style="stroke"
                strokeWidth={RING}
                strokeCap="butt"
                color={GREEN}
              />

              {/* ruler texture, cut into the band rather than drawn beside it */}
              <Path
                path={arc}
                style="stroke"
                strokeWidth={RING}
                strokeCap="butt"
                color="rgba(46,66,16,0.22)"
              >
                <DashPathEffect intervals={[1.3, 4.4]} phase={phase} />
              </Path>

              <Knob min={start} grab={grabA} size={size} radius={R} />
              <Knob min={shownStop} grab={grabB} size={size} radius={R} off />
            </Canvas>

            <Animated.View style={[StyleSheet.absoluteFill, labelStyle]}>
              {hours.map((hh) => (
                <Text
                  key={hh.key}
                  style={[styles.hour, { left: hh.x - 20, top: hh.y - 9 }]}
                >
                  {hh.text}
                </Text>
              ))}
            </Animated.View>

            <View style={styles.center} pointerEvents="none">
              <Duration min={clock.dur} reduced={reduced} />
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
  },
  title: {
    fontSize: 23,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: '#101012',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
  },
  field: {
    flex: 1,
  },
  switchField: {
    alignItems: 'flex-start',
  },
  fieldLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: '#C2C5CA',
    marginBottom: 2,
  },
  value: {
    fontSize: 21,
    fontWeight: '600',
    color: '#16171A',
    fontVariant: ['tabular-nums'],
  },
  valueBox: {
    height: 27,
    justifyContent: 'center',
  },
  dial: {
    marginTop: 18,
    alignSelf: 'stretch',
    aspectRatio: 1,
  },
  hour: {
    position: 'absolute',
    width: 40,
    textAlign: 'center',
    fontSize: 12.5,
    fontWeight: '500',
    color: '#8A8D93',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  durMins: {
    paddingLeft: 7, // measured with the group, so the slide stays centred
  },
  span: {
    fontSize: 26,
    fontWeight: '600',
    color: '#101012',
    // a value changing under your finger must not reflow as digits change
    // width — proportional figures make the whole readout shiver
    fontVariant: ['tabular-nums'],
  },
  track: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 2,
    marginTop: 2,
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
