import * as Haptics from 'expo-haptics';
import { NumberFlow } from 'number-flow-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import {
  type LayoutChangeEvent,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// Coffee order screen — "Caffè Latte".
//
// Assets are two flat PNGs (see assets/coffee/), generated separately, not a
// live 3D model — see the conversation that led here for why: pre-rendered
// images with strong directional light read as dimensional without paying
// for real-time 3D, as long as you don't try to rotate a flat photo past
// ~15-20° (it stops looking like a new angle and starts looking like a
// tilted sticker). The "cluster" of cups below stays inside that limit.
//
// Motion notes (Emil's framework):
// - quantity taps happen constantly → cluster repositioning uses springs
//   (interruptible — rapid tapping never restarts from zero) with no extra
//   flourish. The lid-drop reveal is the one indulgence, and it plays once,
//   only on the front cup's first mount — a rare, first-impression moment,
//   not something replayed on every quantity change.
// - the size-pill indicator reuses the exact travel + colour-crossfade
//   technique from the seat picker's slot indicator, for a consistent feel
//   across the app's screens.
// - caffeine mg animates because it's the number the user is deciding on.

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
// For something falling back to rest. Zero velocity at BOTH ends: it leaves
// the apex at rest (so it never jerks downward the instant the rise stops)
// and arrives at rest (so it settles instead of hitting). EASE_OUT is wrong
// here — it starts at full speed, which is exactly the snap this replaces.
const EASE_SETTLE = Easing.bezier(0.33, 0, 0.15, 1);
const CREAM = '#F0EBE1';

const TITLE = 'Caffè Latte';
const BASE_MG_PER_CUP = 75; // matches the reference: 1 medium = 75mg, 3 small = 225mg
const MIN_QTY = 1;
const MAX_QTY = 6;

const SIZES = [
  { label: 'Small', ml: 237 },
  { label: 'Medium', ml: 355 },
  { label: 'Large', ml: 473 },
  { label: 'Extra Large', ml: 591 },
];
const DEFAULT_SIZE_INDEX = 1; // Medium, matches the reference's default state

const CUP = require('./assets/coffee/cup-medium.png');
const LID = require('./assets/coffee/lid-medium.png');
// Both files were cropped to the SAME shared bounding box (not independently
// cropped to their own content) — that's what keeps a cup and its lid in
// registration despite being separate images. Never crop one without the
// other, and never crop to each image's own tight bbox, or the lid's size
// relative to the cup's rim silently drifts. See sips output when saved.
const ASSET_ASPECT = 761 / 866;

// The cup and lid were generated in separate passes and came out at
// noticeably different absolute scales (the lid rendered ~1.7x too large) —
// no amount of cropping fixes that, cropping only trims shared margin. These
// values were derived by compositing both PNGs in Python at candidate
// scale/offset pairs and eyeballing the result until the lid actually sat on
// the rim instead of engulfing the cup. Re-derive them the same way if either
// asset is regenerated.
const LID_SCALE = 0.58;
const LID_OFFSET_Y_FRAC = -0.148; // fraction of CUP_SIZE — top edge of the lid box,
// calibrated at Medium (heightScale = 1).
//
// THE SLIVER BUG, and why several "obvious" fixes failed:
//
// The cup and lid were generated as two independent images, so their rim
// ellipses do not share a shape. Measured in render units at the Medium
// calibration, the cup's rim reaches its widest (half-width 51.6pt) at
// y=19.8, while the lid reaches ITS widest (51.7pt) 9.5pt lower, at y=29.3.
// So at the exact height where the cup is fattest, the lid is only 50.2pt
// wide — and 1.4pt of tan rim protrudes on each side. That is the sliver.
//
// Sliding the lid does not fix it. Moving it up until the two widest points
// align leaves ~0.1pt of overlap (antialiasing still leaks) and detaches the
// lid's front lip from the cup, opening a visible dark seam underneath —
// verified by rendering it. Scaling the lid up uniformly fixes the width but
// re-introduces the same seam, because a taller lid also has to move.
//
// The fix is to correct the actual defect: the lid is too NARROW relative to
// its height. LID_X_STRETCH widens it 8.9% horizontally only — leaving its
// vertical position and height (which already looked right) untouched. The
// value is not eyeballed: it is the max over every row above the lid's front
// lip of (cup_half_width + 1pt margin) / lid_half_width, i.e. the smallest
// stretch that guarantees the lid covers the rim everywhere with a 1pt
// safety margin for antialiasing. Re-derive it the same way if either asset
// is regenerated.
//
// This holds at every size for free: the height stretch (HEIGHT_SCALE, see
// below) multiplies BOTH the cup's and the lid's heights and y-offsets by
// the same factor while leaving both widths alone, so the coverage
// relationship is scale-invariant. Confirmed by rendering Small/Medium/XL.
const LID_X_STRETCH = 1.089;
// The lid is centred on the cup by construction rather than by a stored
// offset — a hardcoded X offset silently goes stale the moment LID_SCALE or
// LID_X_STRETCH changes, which is exactly how the earlier off-centre drift
// got in.
const LID_WIDTH_FRAC = LID_SCALE * LID_X_STRETCH;
const LID_OFFSET_X_FRAC = (1 - LID_WIDTH_FRAC) / 2;
const LID_DROP = 30; // how far above rest the lid starts before it settles
const LID_JUMP = 34; // how high the lid hops when the size changes underneath it
const LID_RISE_MS = 190; // pop up, decelerating into the apex
const LID_FALL_MS = 380; // longer than the rise — the fall is the calm half

/* ------------------------------------------------------------------ atoms */

function PressScale({
  onPress,
  scaleTo = 0.97,
  style,
  children,
}: {
  onPress?: () => void;
  scaleTo?: number;
  style?: any;
  children: ReactNode;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
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
      <View style={[bar, { left: 0, transform: [{ rotate: '38deg' }] }]} />
      <View style={[bar, { right: 0, transform: [{ rotate: '-38deg' }] }]} />
    </View>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// staggered entrance: fade + 8px rise, delayed by index — same technique
// used across the gallery's other cards
function Enter({
  index,
  reduced,
  children,
  style,
}: {
  index: number;
  reduced: boolean;
  children: ReactNode;
  style?: any;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(index * 50, withTiming(1, { duration: 350, easing: EASE_OUT }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: reduced ? 0 : 8 * (1 - p.value) }],
  }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/* ---------------------------------------------------------------- cluster */

type SlotPos = { x: number; y: number; scale: number; rotate: number };

// Fixed roles, not fixed cup identities: "front" is always the cup nearest
// you, "left"/"back" join as quantity grows. Keying slots by role (not by
// count) means the front cup smoothly migrates from dead-centre to its
// clustered position when a second cup joins, instead of the whole pile
// remounting.
const CLUSTER: Record<1 | 2 | 3, Partial<Record<'back' | 'left' | 'front', SlotPos>>> = {
  1: {
    front: { x: 0, y: 0, scale: 1, rotate: 0 },
  },
  2: {
    left: { x: -30, y: 10, scale: 0.86, rotate: -9 },
    front: { x: 28, y: -6, scale: 1, rotate: 7 },
  },
  3: {
    back: { x: 0, y: -24, scale: 0.74, rotate: 0 },
    left: { x: -36, y: 14, scale: 0.88, rotate: -11 },
    front: { x: 32, y: 16, scale: 1, rotate: 9 },
  },
};

const POS_SPRING = { damping: 16, stiffness: 200 };
const CUP_SIZE = 190; // base render width; the source PNGs carry a lot of
// transparent margin, so the visible cup reads smaller than this box
const CLUSTER_LIFT = 26; // shifts the whole pile up within its stage

// One size selector, one cup asset — so size has to change something other
// than a uniform scale (a uniform scale is just a zoomed Medium, not a real
// Large). Real to-go cup product lines keep ONE rim diameter across every
// size — that's the actual reason one lid fits Small through Extra Large —
// and vary height to hold the extra volume. So: width (and the lid, and its
// calibration) stays fixed across sizes; only height changes, anchored from
// the top so the rim never moves and the lid's seating never has to be
// re-derived per size.
//
// The geometrically correct scale, given a fixed radius, is NOT a square
// root — it's linear. Cylinder volume V = πr²h; hold r constant and h ∝ V
// exactly, so honest values would be the SIZES ml ratio directly: 0.668x,
// 1x, 1.332x, 1.665x. That's the real answer to "how tall must a same-width
// cup be to hold this volume."
//
// It doesn't fit a fixed phone screen: at 1.665x the tallest cup overflows
// its box by ~111pt, which would need a ~470pt stage to avoid colliding with
// "Caffeine content" below it, without introducing scrolling. So this range
// is compressed toward Medium — still correctly ORDERED with volume, still
// visually distinct step to step, but capped by viewport space rather than
// by the geometry. Widen it (toward the honest values above) if this screen
// ever gets taller or gains scrolling.
const HEIGHT_SCALE = [0.85, 1, 1.09, 1.16]; // Small, Medium, Large, Extra Large

function CupSlot({
  active,
  pos,
  z,
  dropLid,
  reduced,
  heightScale,
}: {
  active: boolean;
  pos: SlotPos;
  z: number;
  dropLid: boolean;
  reduced: boolean;
  heightScale: number;
}) {
  const opacity = useSharedValue(active ? 1 : 0);
  const tx = useSharedValue(pos.x);
  const ty = useSharedValue(pos.y);
  // never animate in from scale(0) — start at 60% of the target, not zero
  const sc = useSharedValue(active ? pos.scale : pos.scale * 0.6);
  const rot = useSharedValue(pos.rotate);
  const lidY = useSharedValue(dropLid ? -LID_DROP : 0);
  const hScale = useSharedValue(heightScale);
  // skips the jump on this slot's first render — mount already has its own
  // reveal (dropLid) or is simply invisible; the jump is a reaction to a
  // size CHANGE, not to appearing
  const primed = useSharedValue(false);

  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, {
      duration: active ? 220 : 140,
      easing: EASE_OUT,
    });
    const targetScale = active ? pos.scale : pos.scale * 0.6;
    if (reduced) {
      tx.value = pos.x;
      ty.value = pos.y;
      sc.value = targetScale;
      rot.value = pos.rotate;
    } else {
      tx.value = withSpring(pos.x, POS_SPRING);
      ty.value = withSpring(pos.y, POS_SPRING);
      sc.value = withSpring(targetScale, POS_SPRING);
      rot.value = withSpring(pos.rotate, POS_SPRING);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pos.x, pos.y, pos.scale, pos.rotate]);

  useEffect(() => {
    hScale.value = reduced ? heightScale : withSpring(heightScale, POS_SPRING);
    // Resizing knocks the lid loose: it pops up, then settles back down.
    // The two halves use different curves on purpose — EASE_OUT rises fast
    // and stops dead at the apex, EASE_SETTLE leaves that apex from rest and
    // eases into the seat, so the direction change is continuous instead of
    // a snap. Skipped on first render (mount has its own reveal) and under
    // reduced motion.
    if (primed.value && !reduced) {
      lidY.value = withSequence(
        withTiming(-LID_JUMP, { duration: LID_RISE_MS, easing: EASE_OUT }),
        withTiming(0, { duration: LID_FALL_MS, easing: EASE_SETTLE }),
      );
    }
    primed.value = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightScale]);

  useEffect(() => {
    if (!dropLid) return;
    // the cup rises first; the lid settles onto it a beat later. Same settle
    // curve as the resize hop — this used to be an underdamped spring
    // (damping ratio 0.47), so the lid visibly bounced past its seat on the
    // very first impression.
    lidY.value = withDelay(
      160,
      withTiming(0, { duration: reduced ? 200 : LID_FALL_MS, easing: EASE_SETTLE }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrap = useAnimatedStyle(() => ({
    opacity: opacity.value,
    zIndex: z,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: sc.value },
      { rotate: `${rot.value}deg` },
    ],
  }));
  // the drop animates on top of the lid's fixed resting position — position
  // (left/top) and animated offset (transform) compose additively in RN, so
  // the corrective placement below never has to know about the drop
  const lidStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lidY.value }],
  }));
  // scaleY only, anchored at the top: the rim (and therefore the lid's
  // calibration) never moves regardless of size — only the base grows down
  const cupStyle = useAnimatedStyle(() => ({
    transformOrigin: 'top',
    transform: [{ scaleY: hScale.value }],
  }));

  const cupSize = { width: CUP_SIZE, height: CUP_SIZE * ASSET_ASPECT };
  // Pure Medium calibration — no heightScale arithmetic here on purpose.
  // The lid renders INSIDE the cup's scaleY wrapper, so it inherits exactly
  // the same vertical scale about exactly the same origin, for free and
  // always in sync. Computing it separately (as this used to) meant the lid
  // jumped to its new size on the React render while the cup was still
  // springing toward that size — and since that spring overshoots, the two
  // were misaligned for the whole transition. That is its own source of
  // momentary rim gaps, independent of the static calibration.
  const lidSize = {
    width: CUP_SIZE * LID_WIDTH_FRAC,
    height: CUP_SIZE * ASSET_ASPECT * LID_SCALE,
  };
  const lidBox = {
    position: 'absolute' as const,
    left: LID_OFFSET_X_FRAC * CUP_SIZE,
    top: LID_OFFSET_Y_FRAC * CUP_SIZE,
    ...lidSize,
  };

  return (
    <Animated.View style={[styles.cupSlot, wrap]}>
      {/* the lid is a CHILD of the scaler, not a sibling — that is what keeps
          it locked to the rim through the whole height animation */}
      <Animated.View style={[cupSize, styles.cupScaler, cupStyle]}>
        <Image source={CUP} style={cupSize} resizeMode="contain" />
        <Animated.View style={[lidBox, lidStyle]}>
          {/* stretch, not contain: the lid box is deliberately not the
              asset's aspect ratio (LID_X_STRETCH widens it), and "contain"
              would letterbox that away instead of applying it */}
          <Image source={LID} style={lidSize} resizeMode="stretch" />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function CupCluster({
  count,
  sizeIndex,
  reduced,
}: {
  count: number;
  sizeIndex: number;
  reduced: boolean;
}) {
  const effective = Math.min(count, 3) as 1 | 2 | 3;
  const layout = CLUSTER[effective];
  const fallback = CLUSTER[3];
  const heightScale = HEIGHT_SCALE[sizeIndex];

  return (
    <View style={[styles.stage, { transform: [{ translateY: -CLUSTER_LIFT }] }]}>
      <CupSlot
        active={!!layout.back}
        pos={layout.back ?? fallback.back!}
        z={1}
        dropLid={false}
        reduced={reduced}
        heightScale={heightScale}
      />
      <CupSlot
        active={!!layout.left}
        pos={layout.left ?? fallback.left!}
        z={2}
        dropLid={false}
        reduced={reduced}
        heightScale={heightScale}
      />
      {/* the front cup is always present from qty=1 onward, so its own
          mount-effect (the lid drop) only ever fires once per screen visit */}
      <CupSlot
        active
        pos={layout.front!}
        z={3}
        dropLid
        reduced={reduced}
        heightScale={heightScale}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ sizes */

function SizePill({
  label,
  ml,
  active,
  onPress,
  onLayout,
}: {
  label: string;
  ml: number;
  active: boolean;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const a = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    a.value = withTiming(active ? 1 : 0, { duration: 150, easing: EASE_OUT });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(a.value, [0, 1], ['#B4B4B8', '#131314']),
  }));
  const mlStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      a.value,
      [0, 1],
      ['rgba(180,180,184,0.65)', 'rgba(19,19,20,0.65)'],
    ),
  }));
  // the outline belongs to the UNSELECTED state — the cream indicator behind
  // the active pill is its own shape, and leaving a hairline on top of it
  // draws a seam around the fill
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      a.value,
      [0, 1],
      ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'],
    ),
  }));
  return (
    <Pressable onPress={onPress} onLayout={onLayout} style={styles.sizePillTap}>
      <Animated.View style={[styles.sizePill, borderStyle]}>
        <Animated.Text style={[styles.sizeLabel, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
        <Animated.Text style={[styles.sizeMl, mlStyle]} numberOfLines={1}>
          {ml} ml
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/* --------------------------------------------------------------------- app */

export default function CoffeeOrder({
  onClose,
  insetTop,
  insetBottom,
}: {
  onClose?: () => void;
  insetTop?: number;
  insetBottom?: number;
} = {}) {
  const reduced = useReducedMotion();
  const time = useClock();
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX);
  const [qty, setQty] = useState(1);
  const [pillBoxes, setPillBoxes] = useState<{ x: number; w: number }[]>([]);

  const mg = BASE_MG_PER_CUP * qty;

  const dec = () => {
    if (qty <= MIN_QTY) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQty((q) => q - 1);
  };
  const inc = () => {
    if (qty >= MAX_QTY) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQty((q) => q + 1);
  };

  // Size indicator — travels behind the tapped pill. The pills are MEASURED
  // rather than computed: deriving their geometry from the row width meant
  // silently assuming the row had no padding, so the indicator came out 10pt
  // too wide and drifted 10pt further right per pill (30pt off by "Extra
  // Large"). Measuring is also what the seat picker's slot indicator does.
  const ix = useSharedValue(0);
  const iw = useSharedValue(0);
  const measurePill = (i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setPillBoxes((prev) => {
      if (prev[i] && prev[i].x === x && prev[i].w === width) return prev;
      const next = [...prev];
      next[i] = { x, w: width };
      return next;
    });
  };
  useEffect(() => {
    const box = pillBoxes[sizeIndex];
    if (!box) return;
    if (iw.value === 0) {
      ix.value = box.x;
      iw.value = box.w;
      return;
    }
    const cfg = { duration: 240, easing: EASE_IN_OUT };
    ix.value = withTiming(box.x, cfg);
    iw.value = withTiming(box.w, cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizeIndex, pillBoxes]);
  const indicatorStyle = useAnimatedStyle(() => ({
    width: iw.value,
    transform: [{ translateX: ix.value }],
  }));

  return (
    <View
      style={[
        styles.root,
        insetTop != null && { paddingTop: insetTop },
        insetBottom != null && { paddingBottom: insetBottom },
      ]}
    >
      <Enter index={0} reduced={reduced} style={styles.header}>
        <View style={styles.headerLeft}>
          {onClose && (
            <PressScale scaleTo={0.92} style={styles.back} onPress={onClose}>
              <View style={styles.backChevron}>
                <Chevron size={9} color="#EDEDEF" />
              </View>
            </PressScale>
          )}
          <Text style={styles.title}>{TITLE}</Text>
        </View>
        <View style={styles.timePill}>
          <Text style={styles.timeText}>{time}</Text>
        </View>
      </Enter>

      <Enter index={1} reduced={reduced}>
        <CupCluster count={qty} sizeIndex={sizeIndex} reduced={reduced} />
      </Enter>

      <Enter index={2} reduced={reduced} style={styles.mgBlock}>
        <Text style={styles.mgLabel}>Caffeine content</Text>
        <View style={styles.mgRow}>
          <NumberFlow
            value={mg}
            format={{ maximumFractionDigits: 0 }}
            locales="en-US"
            style={styles.mgValue}
          />
          <Text style={styles.mgUnit}>mg</Text>
        </View>
      </Enter>

      <Enter index={3} reduced={reduced}>
        <View style={styles.sizeRow}>
          {pillBoxes[sizeIndex] && (
            <Animated.View style={[styles.sizeIndicator, indicatorStyle]} />
          )}
          {SIZES.map((s, i) => (
            <SizePill
              key={s.label}
              label={s.label}
              ml={s.ml}
              onLayout={measurePill(i)}
              active={sizeIndex === i}
              onPress={() => {
                if (i === sizeIndex) return;
                Haptics.selectionAsync();
                setSizeIndex(i);
              }}
            />
          ))}
        </View>
      </Enter>

      <Enter index={4} reduced={reduced} style={styles.stepperRow}>
        <PressScale scaleTo={0.9} style={styles.stepBtn} onPress={dec}>
          <Text style={styles.stepGlyph}>−</Text>
        </PressScale>
        <NumberFlow
          value={qty}
          format={{ maximumFractionDigits: 0 }}
          locales="en-US"
          style={styles.qtyText}
        />
        <PressScale scaleTo={0.9} style={styles.stepBtn} onPress={inc}>
          <Text style={styles.stepGlyph}>+</Text>
        </PressScale>
      </Enter>

      <Enter index={5} reduced={reduced} style={styles.footer}>
        <PressScale
          style={styles.confirm}
          onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)}
        >
          <Text style={styles.confirmText}>Confirm</Text>
        </PressScale>
      </Enter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#0A0A0A',
    paddingTop: 22,
    paddingBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  backChevron: {
    transform: [{ rotate: '90deg' }],
    marginLeft: -1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  timePill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EDEDEF',
  },
  stage: {
    // the crop removed most of the transparent padding baked into the
    // source PNGs, so the cup now fills its render box much more — give the
    // cluster's vertical travel a bit more headroom than before. Also has to
    // clear the tallest per-size stretch (XL, front cup) with real margin —
    // see HEIGHT_SCALE's comment for the numbers behind this height.
    height: 330,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  cupSlot: {
    position: 'absolute',
  },
  cupScaler: {
    // the lid sits at a negative top offset, i.e. outside this view's box.
    // Explicit because Android clips overflow by default and would slice
    // the top off the lid.
    overflow: 'visible',
  },
  mgBlock: {
    alignItems: 'center',
    marginTop: 6,
  },
  mgLabel: {
    fontSize: 13,
    color: '#9A9A9E',
  },
  mgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 4,
  },
  mgValue: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  mgUnit: {
    fontSize: 15,
    color: '#9A9A9E',
    marginBottom: 6,
  },
  sizeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 28,
    paddingHorizontal: 20,
  },
  sizeIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    // no `left` offset: translateX carries the MEASURED pill x, which is
    // already relative to this row and therefore already includes its
    // padding. Adding a left inset on top of that double-counts it.
    left: 0,
    borderRadius: 16,
    backgroundColor: CREAM,
  },
  sizePillTap: {
    // flexGrow, NOT flex: 1. `flex: 1` sets flexBasis to 0, which throws away
    // each pill's natural width and forces all four to be identical — so
    // "Extra Large" got the same room as "Small" and truncated. flexGrow with
    // the default `auto` basis sizes each pill to its own label first, then
    // shares the leftover space, so the row still fills the full width.
    flexGrow: 1,
  },
  sizePill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sizeLabel: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  sizeMl: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginTop: 28,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  stepGlyph: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: -2,
  },
  qtyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    minWidth: 24,
    textAlign: 'center',
  },
  footer: {
    marginTop: 'auto',
    paddingHorizontal: 22,
  },
  confirm: {
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CREAM,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#131314',
  },
});
