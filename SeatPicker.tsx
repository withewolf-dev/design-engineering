import {
  Blur,
  BlurMask,
  Canvas,
  Circle,
  Fill,
  Group,
  Image as SkiaImage,
  LinearGradient,
  mapPoint3d,
  Paint,
  Path,
  processTransform3d,
  RadialGradient,
  Rect,
  Skia,
  type SkImage,
  type SkPath,
  useVideo,
  vec,
} from '@shopify/react-native-skia';
import { useAssets } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import { NumberFlow } from 'number-flow-react-native';
import { type ReactNode, memo, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// Cinema seat picker — "THE ODYSSEY".
//
// Motion notes (Emil's framework):
// - seat taps happen tens of times per session → feedback only: 110ms press
//   scale + a single-bounce pop on select. No entrance-length animation.
// - seats enter staggered on a diagonal (10ms/seat, capped) — decorative,
//   never blocks a tap.
// - the slot indicator *moves on screen* → ease-in-out, 240ms. Labels
//   crossfade colour in 150ms so no letter is ever mid-grey under the pill.
// - the screen's light spill brightens with the seat count: state indication,
//   not decoration. It's the only thing on the page that "reacts" at a
//   distance from the finger.
// - price animates because it's the one number the user is deciding on.

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

const CREAM = '#F0EBE1';
const SEAT_FREE = '#2B2B2E';
const SEAT_TAKEN = '#151517';
const SEAT_SEL = '#FFFFFF';

const PRICE_PER_SEAT = 350;
const MAX_SEATS = 6;

// 14 columns: 3 | aisle | 6 | aisle | 3
// '#' free · 'o' already sold · '.' aisle/void
// Ten rows, not eight: the house has to reach up into the light off the floor,
// or the screen and its reflection read as an object on a desk rather than the
// far wall of a room you're sitting in.
const LAYOUT = [
  '.##.######.##.',
  '###.######.###',
  '###.#o####.###',
  '###.######.###',
  '###.######.###',
  '###.######.###',
  '###.####oo.###',
  '###.######.###',
  '###.######.###',
  '###.##o###.###',
  '###.######.###',
  '###.######.###',
  '.##.######.##.',
];

const SLOTS = ['1:00 PM', '3:00 PM', '7:30 PM', '9:00 PM'];

const PRESELECTED = ['4-6', '4-7'];

// front row (nearest the screen, furthest from the viewer) reads at 86% of the
// back row, with the vertical gap closing to match
const ROW_TAPER = 0.84;
const ROW_GAP = 5;
const rowScale = (r: number) =>
  ROW_TAPER + (1 - ROW_TAPER) * (r / (LAYOUT.length - 1));

/* ------------------------------------------------------------------ atoms */

function PressScale({
  onPress,
  scaleTo = 0.97,
  style,
  disabled,
  children,
}: {
  onPress?: () => void;
  scaleTo?: number;
  style?: any;
  disabled?: boolean;
  children: ReactNode;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        s.value = withTiming(scaleTo, { duration: 110, easing: EASE_OUT });
      }}
      onPressOut={() => {
        s.value = withTiming(1, { duration: 160, easing: EASE_OUT });
      }}
      onPress={onPress}
    >
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

// two hairlines meeting at a point — cheaper and crisper than a glyph
function Chevron({ size = 8, color = '#8A8A8E' }: { size?: number; color?: string }) {
  const bar = {
    position: 'absolute' as const,
    width: size,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: color,
  };
  return (
    <View style={{ width: size * 1.6, height: size, justifyContent: 'center' }}>
      <View
        style={[bar, { left: 0, transform: [{ rotate: '38deg' }] }]}
      />
      <View
        style={[bar, { right: 0, transform: [{ rotate: '-38deg' }] }]}
      />
    </View>
  );
}

function Pin() {
  return (
    <View style={styles.pin}>
      <View style={styles.pinDot} />
    </View>
  );
}

/* ------------------------------------------------------------------ screen */

// The tilt is a real perspective projection, not a stacking trick: the plane
// rotates about its own X axis under a camera PERSP px away, so the far edge
// gets divided down. Negative angle = the *bottom* edge recedes — you are in a
// seat, above the screen's base, looking down the room at it.
//
// Lower PERSP = camera closer = stronger foreshortening. These two numbers are
// the whole "where am I standing" decision; everything else derives from them.
// PERSP and BAND_H are coupled: a shorter band spans less depth, so it tapers
// less at the same camera distance. Dropping PERSP alongside BAND_H holds the
// depth divergence steady — the screen gets smaller without getting flatter,
// which is what keeps it planted in the room instead of floating forward.
const PERSP = 160;
const TILT = -0.66; // radians, ~38°
const BAND_H = 106;
const BOW = 26; // rise of the screen's curve at centre

// Floor reflection. SQUASH is how much the floor foreshortens what it bounces.
//
// Blur is not one number. A reflection is legible right where it leaves the
// screen and only falls apart as it travels — that gradient of sharpness is
// the whole tell. One flat blur reads as a smudge someone painted under the
// screen. So: two passes over the same mirrored plate, a crisp one that owns
// the foot and a soft one that owns the distance, each with its own falloff.
// 0.28 is a floor seen at a grazing angle: a squat smear, not a mirror image.
// Anything approaching 0.5 reads as a tabletop directly under an object.
const REFLECT_SQUASH = 0.28;
// headroom above/below the reflection strip so the blur can bleed past the
// mirrored shape without clipping at its canvas edge
const REFLECT_PAD = 14;
const REFLECT_BANDS = [
  // right at the foot: a hint of what's playing, gone within a third
  {
    blur: 4,
    spread: 1,
    colors: ['rgba(0,0,0,0.486)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0)'],
  },
  // out across the floor: light that has lost the shape it came from, and
  // spread wider than its source the way bounced light does
  {
    blur: 9,
    spread: 1.22,
    colors: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.227)', 'rgba(0,0,0,0)'],
  },
];

// Screen geometry, shared with the ambient canvas so the light spill can be
// drawn in room space (a glow clipped by its own canvas shows a hard edge).
//
// The projected size is *measured*, not guessed: the same matrix Skia will use
// is applied to the shape's extremes, and the canvas is sized from the result.
// That way TILT can be dialled to anything without the screen growing past the
// canvas edge or leaving a dead band underneath it.
function screenGeometry(width: number) {
  const cx = width / 2;
  const top = 0;
  const bot = BAND_H;
  const cy = BAND_H / 2;

  const m = processTransform3d([
    { translateX: cx },
    { translateY: cy },
    { perspective: PERSP },
    { rotateX: TILT },
    { translateX: -cx },
    { translateY: -cy },
  ]);

  // horizontal magnification at the top corners — the widest points of the
  // projected shape, and therefore the ones that decide the base width
  const spread = mapPoint3d(m, [cx + 100, top, 0])[0] - cx;
  const half = (width * 0.45) / (spread / 100);
  const l = cx - half;
  const r = cx + half;

  const ys = [
    mapPoint3d(m, [l, top, 0])[1],
    mapPoint3d(m, [cx, top - BOW, 0])[1],
    mapPoint3d(m, [l, bot, 0])[1],
    mapPoint3d(m, [cx, bot - BOW, 0])[1],
  ];
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padTop = 10;
  const padBottom = 12;

  return {
    H: maxY - minY + padTop + padBottom,
    l,
    r,
    top,
    bot,
    bow: BOW,
    cy,
    // 2D nudge that lands the projected shape inside the canvas
    offsetY: padTop - minY,
    // where the screen's lowest edge ends up, for the light throw
    footY: padTop - minY + maxY,
    // Projected extremes *before* offsetY is applied. The reflection mirrors
    // about these, because it draws the plate raw inside a group that is
    // already carrying the offset — mirroring about the post-offset foot would
    // push the whole reflection down by offsetY * (1 + squash).
    projTop: minY,
    projBottom: maxY,
  };
}

function makeBand(width: number) {
  const { l, r, top, bot, bow } = screenGeometry(width);
  return Skia.Path.MakeFromSVGString(
    `M ${l} ${top} Q ${width / 2} ${top - bow} ${r} ${top} L ${r} ${bot} Q ${
      width / 2
    } ${bot - bow} ${l} ${bot} Z`,
  );
}

// Only the bottom edge. A stroke around the whole shape is a bezel, and a
// bezel is a manufactured object — the single loudest "this is a laptop" cue
// in the frame. A real screen's top and sides just stop, and the room is dark;
// the base gets an edge because that's where it meets something.
function makeFoot(width: number) {
  const { l, r, bot, bow } = screenGeometry(width);
  return Skia.Path.MakeFromSVGString(
    `M ${l} ${bot} Q ${width / 2} ${bot - bow} ${r} ${bot}`,
  );
}

// The lit plate itself — the tilted plane with the picture on it. Drawn twice:
// once as the screen, once upside down on the floor as its reflection, so the
// two can never drift out of register.
function ScreenPlate({
  width,
  band,
  frame,
  bare = false,
}: {
  width: number;
  band: SkPath;
  frame: SharedValue<SkImage | null>;
  bare?: boolean;
}) {
  const { l, r, top, bot, bow, cy } = screenGeometry(width);
  return (
    <Group
      origin={vec(width / 2, cy)}
      transform={[{ perspective: PERSP }, { rotateX: TILT }]}
    >
      <Group clip={band}>
        {/* unlit screen fabric — visible for the frame or two before the
            first video frame lands, so the screen is never a hole */}
        {!bare && (
          <Path path={band}>
            <LinearGradient
              start={vec(0, top)}
              end={vec(0, bot)}
              colors={['#3A3833', '#232220', '#161514']}
            />
          </Path>
        )}

        <SkiaImage
          image={frame}
          x={l}
          y={top - bow}
          width={r - l}
          height={bot - top + bow}
          fit="cover"
        />

        {/* the picture sits behind glass, not on it */}
        {!bare && (
          // Only the top edge darkens. The bottom stop used to read as a
          // bezel — a lit screen meets the floor with light, not with a bar.
          <Path path={band} opacity={0.3}>
            <LinearGradient
              start={vec(0, top - bow)}
              end={vec(0, bot)}
              colors={['#000000', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']}
            />
          </Path>
        )}
      </Group>
    </Group>
  );
}

// The projection screen: a band bowed upward at the centre, lit from within,
// spilling warm light down onto the first rows.
function ProjectionScreen({
  width,
  heat,
  frame,
}: {
  width: number;
  heat: SharedValue<number>;
  frame: SharedValue<SkImage | null>;
}) {
  const { H, cy, offsetY } = screenGeometry(width);
  const band = useMemo(() => makeBand(width), [width]);
  const foot = useMemo(() => makeFoot(width), [width]);
  const rim = useDerivedValue(() => 0.32 + 0.28 * heat.value);

  if (!band || !foot) return <View style={{ height: H, marginBottom: 12 }} />;

  return (
    // floor on the throw distance, so a short viewport never butts the front
    // row up against the screen
    <Canvas style={{ width, height: H, marginBottom: 12 }}>
      <Group transform={[{ translateY: offsetY }]}>
        <ScreenPlate width={width} band={band} frame={frame} />

        {/* base edge only — where the screen meets the stage. Outside the
            plate so the reflection doesn't inherit an edge a floor wouldn't
            have */}
        <Group
          origin={vec(width / 2, cy)}
          transform={[{ perspective: PERSP }, { rotateX: TILT }]}
        >
          <Path path={foot} style="stroke" strokeWidth={1} color="#EDE6D8" opacity={rim} />
        </Group>
      </Group>
    </Canvas>
  );
}

/* -------------------------------------------------------------------- seat */

type SeatState = 'free' | 'taken';

const Seat = memo(function Seat({
  size,
  state,
  selected,
  delay,
  reduced,
  onPress,
}: {
  size: number;
  state: SeatState;
  selected: boolean;
  delay: number;
  reduced: boolean;
  onPress: () => void;
}) {
  const sel = useSharedValue(selected ? 1 : 0);
  const bump = useSharedValue(0);
  const press = useSharedValue(1);
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withDelay(delay, withTiming(1, { duration: 320, easing: EASE_OUT }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const first = useSharedValue(true);
  useEffect(() => {
    sel.value = withTiming(selected ? 1 : 0, { duration: 180, easing: EASE_OUT });
    if (first.value) {
      first.value = false;
      return;
    }
    if (reduced) return;
    // one pop, then settle — a seat is claimed, not inflated
    bump.value = withSequence(
      withTiming(selected ? 1 : -0.5, { duration: 110, easing: EASE_OUT }),
      withSpring(0, { damping: 15, stiffness: 340 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const back = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      sel.value,
      [0, 1],
      [state === 'taken' ? SEAT_TAKEN : SEAT_FREE, SEAT_SEL],
    ),
  }));

  const base = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      sel.value,
      [0, 1],
      [state === 'taken' ? SEAT_TAKEN : SEAT_FREE, SEAT_SEL],
    ),
  }));

  const wrap = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: reduced
      ? [{ scale: 1 }]
      : [
          { translateY: 6 * (1 - enter.value) },
          { scale: (0.92 + 0.08 * enter.value) * press.value * (1 + 0.1 * bump.value) },
        ],
  }));

  const w = size;
  const backH = size * 0.72;

  return (
    <Pressable
      disabled={state === 'taken'}
      hitSlop={4}
      onPressIn={() => {
        press.value = withTiming(0.88, { duration: 90, easing: EASE_OUT });
      }}
      onPressOut={() => {
        press.value = withTiming(1, { duration: 150, easing: EASE_OUT });
      }}
      onPress={onPress}
    >
      <Animated.View style={[{ width: w, height: size }, wrap]}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: w * 0.11,
              right: w * 0.11,
              top: 0,
              height: backH,
              borderTopLeftRadius: w * 0.3,
              borderTopRightRadius: w * 0.3,
              borderBottomLeftRadius: w * 0.12,
              borderBottomRightRadius: w * 0.12,
            },
            back,
          ]}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: size * 0.24,
              borderRadius: w * 0.16,
            },
            base,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
});

/* ---------------------------------------------------------------- time slot */

function Slot({
  label,
  active,
  onPress,
  onLayout,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const a = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    a.value = withTiming(active ? 1 : 0, { duration: 150, easing: EASE_OUT });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const text = useAnimatedStyle(() => ({
    color: interpolateColor(a.value, [0, 1], ['#B4B4B8', '#131314']),
  }));
  return (
    <Pressable onPress={onPress} onLayout={onLayout} style={styles.slot}>
      <Animated.Text style={[styles.slotText, text]}>{label}</Animated.Text>
    </Pressable>
  );
}

/* --------------------------------------------------------------------- app */

// The trailer, decoded straight into a canvas so it can be clipped by the
// screen's curve — a native video view could only ever give us a rectangle.
// Silent by design: a gallery that starts shouting is a gallery you close.
//
// This lives OUTSIDE the screen, at the app root, on purpose. Skia's useVideo
// disposes its native video in an unmount effect while its frame callback is
// still scheduled — unmounting a component that owns one crashes the UI thread
// with "Attempted to access a disposed object". Owning it somewhere that never
// unmounts removes that race entirely, and as a bonus the two SeatPickers
// (gallery preview and full screen) share one decoder instead of running two.
export function useTrailer() {
  const [assets] = useAssets([require('./assets/odyssey-trailer.mp4')]);
  const source = assets?.[0]?.localUri ?? assets?.[0]?.uri ?? null;

  // Decoder stops the moment the app leaves the foreground. `paused` must be
  // a SharedValue: useVideo captures plain values once at mount and never
  // reads them again.
  const paused = useSharedValue(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      paused.value = state !== 'active';
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { currentFrame } = useVideo(source, { looping: true, volume: 0, paused });
  return currentFrame;
}

export default function SeatPicker({
  frame,
  onClose,
  insetTop,
  insetBottom,
}: {
  frame: SharedValue<SkImage | null>;
  // presenting full-screen: shows the back affordance and honours safe areas
  onClose?: () => void;
  insetTop?: number;
  insetBottom?: number;
}) {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const [selected, setSelected] = useState<string[]>(PRESELECTED);
  const [slot, setSlot] = useState(2);
  const [slotBoxes, setSlotBoxes] = useState<{ x: number; w: number }[]>([]);

  // where the screen landed in the flow — the room canvas needs it to place
  // the light throw
  const [screenY, setScreenY] = useState<number | null>(null);

  const band = useMemo(() => (w > 0 ? makeBand(w) : null), [w]);
  const geo = w > 0 ? screenGeometry(w) : null;

  const count = selected.length;
  const heat = useSharedValue(PRESELECTED.length / MAX_SEATS);
  const spill = useDerivedValue(() => 0.1 + 0.1 * heat.value);
  useEffect(() => {
    heat.value = withTiming(Math.min(count / MAX_SEATS, 1), {
      duration: 420,
      easing: EASE_OUT,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const cols = LAYOUT[0].length;
  // wider column gap → smaller seats → thirteen rows still fit the viewport
  const gap = 6;
  const gridW = Math.max(w - 40, 0);
  const seat = gridW > 0 ? (gridW - gap * (cols - 1)) / cols : 0;

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return prev.filter((s) => s !== id);
      }
      if (prev.length >= MAX_SEATS) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return prev;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return [...prev, id];
    });
  };

  // slot indicator — travels to the tapped pill
  const ix = useSharedValue(0);
  const iw = useSharedValue(0);
  const ready = useSharedValue(0);
  useEffect(() => {
    const box = slotBoxes[slot];
    if (!box) return;
    if (ready.value === 0) {
      ix.value = box.x;
      iw.value = box.w;
      ready.value = withTiming(1, { duration: 200, easing: EASE_OUT });
      return;
    }
    const cfg = { duration: 240, easing: EASE_IN_OUT };
    ix.value = withTiming(box.x, cfg);
    iw.value = withTiming(box.w, cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, slotBoxes]);

  const indicator = useAnimatedStyle(() => ({
    opacity: ready.value,
    width: iw.value,
    transform: [{ translateX: ix.value }],
  }));

  const measureSlot = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setSlotBoxes((prev) => {
      if (prev[i] && prev[i].x === x && prev[i].w === width) return prev;
      const next = [...prev];
      next[i] = { x, w: width };
      return next;
    });
  };

  return (
    <View
      style={[
        styles.root,
        insetTop != null && { paddingTop: insetTop },
        insetBottom != null && { paddingBottom: insetBottom },
      ]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {/* Ambience: the room's own light. Its OWN canvas, on purpose — the
          reflection used to live in this one, which meant every video frame
          repainted the whole screen-sized canvas including these BlurMask(60)
          glows. Split out, this canvas repaints only when `spill` animates
          (a seat is picked); the video never touches it. */}
      {w > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Canvas style={{ flex: 1 }}>
            <Fill color="#0A0A0B" />
            <Circle cx={w * 0.22} cy={40} r={130} color="#38402F" opacity={0.55}>
              <BlurMask blur={60} style="normal" />
            </Circle>
            <Circle cx={w * 0.86} cy={10} r={110} color="#2A3328" opacity={0.5}>
              <BlurMask blur={60} style="normal" />
            </Circle>

            {/* the throw: light off the screen falling on the front rows.
                Squashed into an ellipse — light lying on a floor is wide and
                shallow — and reaching the front rows that sit inside it */}
            {geo && screenY != null && (
              <Group
                origin={vec(w / 2, screenY + geo.footY + 26)}
                transform={[{ scaleY: 0.5 }]}
              >
                <Circle
                  cx={w / 2}
                  cy={screenY + geo.footY + 26}
                  r={w * 0.75}
                  opacity={spill}
                >
                  <RadialGradient
                    c={vec(w / 2, screenY + geo.footY + 26)}
                    r={w * 0.75}
                    colors={['#E8DCC8', 'rgba(232,220,200,0.35)', 'rgba(232,220,200,0)']}
                  />
                </Circle>
              </Group>
            )}
          </Canvas>
        </View>
      )}

      {/* The picture bouncing off the floor. A dedicated canvas sized to just
          the strip of floor it covers: the per-frame repaint touches ~90pt of
          pixels instead of the whole screen, and each blur pass's saveLayer is
          bounded by the small canvas instead of spanning it all. */}
      {geo && band && screenY != null && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: screenY + geo.footY - REFLECT_PAD,
            height:
              (geo.projBottom - geo.projTop) * REFLECT_SQUASH + REFLECT_PAD * 2,
          }}
        >
          <Canvas style={{ flex: 1 }}>
            <Group
              transform={[
                { translateY: geo.offsetY - geo.footY + REFLECT_PAD },
              ]}
            >
              {REFLECT_BANDS.map((pass, i) => (
                <Group key={i} layer={<Paint><Blur blur={pass.blur} /></Paint>}>
                  <Group
                    origin={vec(w / 2, geo.projBottom)}
                    transform={[{ scaleX: pass.spread }]}
                  >
                    <Group
                      transform={[
                        { translateY: geo.projBottom * (1 + REFLECT_SQUASH) },
                        { scaleY: -REFLECT_SQUASH },
                      ]}
                    >
                      <ScreenPlate width={w} band={band} frame={frame} bare />
                    </Group>
                  </Group>

                  {/* this pass's stretch of floor */}
                  <Rect
                    x={0}
                    y={geo.projBottom}
                    width={w}
                    height={(geo.projBottom - geo.projTop) * REFLECT_SQUASH + 24}
                    blendMode="dstIn"
                  >
                    <LinearGradient
                      start={vec(0, geo.projBottom)}
                      end={vec(
                        0,
                        geo.projBottom +
                          (geo.projBottom - geo.projTop) * REFLECT_SQUASH,
                      )}
                      colors={pass.colors}
                    />
                  </Rect>
                </Group>
              ))}
            </Group>
          </Canvas>
        </View>
      )}

      <View style={styles.header}>
        {onClose && (
          <PressScale scaleTo={0.92} style={styles.back} onPress={onClose}>
            <View style={styles.backChevron}>
              <Chevron size={9} color="#EDEDEF" />
            </View>
          </PressScale>
        )}
        <Text style={styles.title}>THE ODYSSEY</Text>

        <View style={styles.pills}>
          <PressScale style={styles.pill}>
            <Text style={styles.pillText}>12 Jun</Text>
            <Chevron />
          </PressScale>
          <PressScale style={styles.pill}>
            <View style={styles.seatGlyph} />
            <Text style={styles.pillText}>
              {count} {count === 1 ? 'Seat' : 'Seats'}
            </Text>
            <Chevron />
          </PressScale>
        </View>

        <PressScale scaleTo={0.99} style={styles.venue}>
          <Pin />
          <View style={styles.venueText}>
            <Text style={styles.venueName}>AMC Mercado 20</Text>
            <Text style={styles.venueCity}>12 Main, Indiranagar</Text>
          </View>
          <Chevron size={9} />
        </PressScale>
      </View>

      <View onLayout={(e) => setScreenY(e.nativeEvent.layout.y)}>
        {w > 0 && band && (
          <ProjectionScreen width={w} heat={heat} frame={frame} />
        )}
      </View>

      <View style={styles.grid}>
        {LAYOUT.map((row, r) => (
          <View
            key={r}
            style={[
              styles.gridRow,
              {
                gap,
                // rows nearer the screen are further from *you* — they shrink
                // and close up. Without this the plan reads as a diagram no
                // matter how the screen is tilted. Set ROW_TAPER to 1 to kill.
                transform: [{ scale: rowScale(r) }],
                marginBottom:
                  ROW_GAP * rowScale(r) - seat * (1 - rowScale(r)),
              },
            ]}
          >
            {row.split('').map((ch, c) => {
              const id = `${r}-${c}`;
              if (ch === '.') return <View key={id} style={{ width: seat, height: seat }} />;
              return (
                <Seat
                  key={id}
                  size={seat}
                  state={ch === 'o' ? 'taken' : 'free'}
                  selected={selected.includes(id)}
                  delay={reduced ? 0 : Math.min((r * 2 + c) * 10, 260)}
                  reduced={reduced}
                  onPress={() => toggle(id)}
                />
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.sectionLabel}>Select Slot</Text>

        <View style={styles.slots}>
          <Animated.View style={[styles.indicator, indicator]} />
          {SLOTS.map((s, i) => (
            <Slot
              key={s}
              label={s}
              active={slot === i}
              onPress={() => {
                if (i === slot) return;
                Haptics.selectionAsync();
                setSlot(i);
              }}
              onLayout={measureSlot(i)}
            />
          ))}
        </View>

        <PressScale
          disabled={count === 0}
          style={[styles.buy, count === 0 && styles.buyOff]}
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
        >
          <Text style={styles.buyText}>
            {count === 0 ? 'Select seats' : 'Buy Tickets'}
          </Text>
          <View style={styles.priceChip}>
            <NumberFlow
              value={count * PRICE_PER_SEAT}
              // rupees don't carry paise on a ticket price
              format={{
                style: 'currency',
                currency: 'INR',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }}
              locales="en-IN"
              style={styles.priceText}
            />
          </View>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#0A0A0B',
    paddingTop: 22,
    paddingBottom: 18,
  },
  header: {
    paddingHorizontal: 20,
  },
  back: {
    position: 'absolute',
    left: 18,
    top: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    zIndex: 2,
  },
  backChevron: {
    transform: [{ rotate: '90deg' }],
    marginLeft: -1,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  pills: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EDEDEF',
  },
  seatGlyph: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#EDEDEF',
  },
  venue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
  },
  venueText: {
    alignItems: 'center',
  },
  venueName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  venueCity: {
    fontSize: 11,
    color: '#8A8A8E',
    marginTop: 2,
  },
  pin: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#C9C9CE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C9C9CE',
  },
  grid: {
    paddingHorizontal: 20,
    // slack lives *above* the grid, not below it: the seats sit close to the
    // slot picker they belong to, and the extra room reads as the dark throw
    // between the screen and the front row
    marginTop: 'auto',
    marginBottom: 4,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footer: {
    // both this and the grid take an auto margin, so leftover height splits
    // evenly instead of pooling into one void under the screen
    marginTop: 'auto',
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  slots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slot: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  slotText: {
    fontSize: 13,
    fontWeight: '600',
  },
  indicator: {
    position: 'absolute',
    left: 0,
    height: 34,
    borderRadius: 999,
    backgroundColor: CREAM,
  },
  buy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    height: 52,
    marginTop: 18,
    marginHorizontal: 22,
    borderRadius: 999,
    backgroundColor: CREAM,
  },
  buyOff: {
    opacity: 0.45,
  },
  buyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#131314',
  },
  priceChip: {
    height: 34,
    minWidth: 74,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#131314',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: CREAM,
  },
});
