import {
  Blur,
  Canvas,
  DashPathEffect,
  Group,
  Path,
  Skia,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { NumberFlow } from 'number-flow-react-native';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  type SharedValue,
  Easing,
  runOnJS,
  useAnimatedReaction,
  withDelay,
  withRepeat,
  withSequence,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// Wallet — swipe a card up and it slips into the pocket.
//
// The whole illusion is z-order, not clipping. The wallet is two PNGs cut from
// the same source image (see assets/wallet/): the full wallet, and just the
// front pocket panel with everything above its lip transparent. The card is
// rendered BETWEEN them, so it's occluded by real leather with a real stitched
// edge — including the V-dip — instead of by a rectangular mask. Nothing here
// clips anything; the card is always fully drawn, and the panel is simply on
// top of it.
//
// Because the two PNGs share a canvas and were cut from the same pixels, both
// are absoluteFill on the same box and there is no offset arithmetic anywhere.
// If either asset is ever re-exported, they must stay the same size or the
// pocket lip stops lining up with the leather.
//
// Motion notes:
// - drag maps 1:1 to the card. No easing, no lag: the card is under the
//   finger, and anything else feels like latency rather than physics.
// - release springs. A card sliding into a leather slot has friction and no
//   bounce, so this is a critically-damped spring (dampingRatio 1) — an
//   overshoot would read as plastic.
// - the commit haptic fires when the decision is made, not when the animation
//   lands. The thing being confirmed is the user's release, and delaying the
//   tap by 300ms to sync it with the visual makes it feel like lag.

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// a thrown object decelerating into the top of its arc
const EASE_RISE = Easing.bezier(0.16, 0.68, 0.3, 1);
// and accelerating out of it. Gravity has no ease-out on the way down; the
// card is stopped by leather, not by the curve.
const EASE_FALL = Easing.bezier(0.5, 0, 0.85, 0.5);
const RISE_MS = 380;
// A short beat at the top, just enough to separate "came up" from "went in".
// It used to be 520ms to make room for a somersault; without one, a long hang
// is dead air.
const HOLD_MS = 190;
const FALL_MS = 470;
// How much bigger the card gets at the top of its arc. It is closer to you up
// there than it is lying in the deck or sitting in the pocket, and scale is the
// only cue for that once the flip is gone — without it the card reads as
// sliding around on a flat plane rather than being lifted off one.
const FLIGHT_LIFT = 0.1;

const FETCH_MS = 2000;
const BALANCE = 124805.5;
// the wallet's own corner radius, in on-screen units. Measured off the asset:
// 26px of a 961px-wide image.
const WALLET_RADIUS_FRAC = 26 / 961;

// Typefaces, not the system default.
//
// Copperplate is the engraver's face — it is what actually gets stamped on
// letterheads, certificates and card plates, and it exists in small caps only,
// which is exactly what a label wants to be.
//
// Optima carries the amount. The requirement that decides it is LINING
// FIGURES: numerals of uniform height sitting on one baseline. Hoefler Text,
// Georgia, Palatino and Iowan all default to old-style figures, which are
// drawn like lowercase — 4 and 7 drop below the line, 6 and 8 rise above it —
// so a number like 1,24,805 visibly bobs up and down. Lovely in a paragraph,
// wrong for a readout.
//
// Among the faces that ship with iOS and have lining figures, Optima is the
// one that belongs on leather: a stressed humanist sans with swelling strokes,
// no slabs, no hairlines. It survives a textured surface where Didot and
// Bodoni would dissolve into the grain, and it reads as luxury goods rather
// than as banking software.
//
// Both ship with iOS, so there is no font file to load and nothing to wait for
// on first paint. Android falls back to the system face.
const FACE_LABEL = Platform.select({ ios: 'Copperplate', default: undefined });
const FACE_AMOUNT = Platform.select({ ios: 'Optima', default: undefined });
// How far the wallet drops out of the way while a card is in the air. Big,
// because "out of the way" means the card's bottom edge clears the wallet's
// TOP edge with room to spare — not merely clearing the pocket panel.
const WALLET_DIP = 150;

const WALLET_BACK = require('./assets/wallet/wallet.png');
const WALLET_FRONT = require('./assets/wallet/wallet-front.png');
const CARD = require('./assets/wallet/card-green.png');

// measured off the assets — see the cutting pass that produced them
const WALLET_ASPECT = 961 / 708;
const CARD_ASPECT = 1039 / 684;
// the pocket lip sits at 38.4% of the wallet's height. Only used to sanity
// check the resting position; the occlusion itself never consults it.
const LIP_FRAC = 0.384;

// where the card comes to rest once filed, as a fraction of wallet height.
// Lands the card's top edge a quarter of the card above the lip and its bottom
// just inside the wallet's base — the same proportion a real card sits at.
const INSERTED_FRAC = 0.2;
// how much of the loose card is visible above the bottom edge. The rest hangs
// off-screen, so the card reads as one of a stack you're pulling from rather
// than a single prop sitting in empty space — and the swipe gets the full
// height of the screen to travel through.
const PEEK_FRAC = 0.3;
// The wallet sits well down the screen to leave headroom the card flies through
// on its way over the top. Without that room the somersault would happen behind
// leather — see PANEL_TOP_FRAC.
const WALLET_TOP = 140;
const WALLET_TOP_INLINE = 96;
// the highest pixel the front panel actually draws: the angled corner cutouts,
// which reach higher than the lip's shoulders. Above this line the panel is
// fully transparent, so a card there overlaps nothing and can be swapped in
// front of it with no visible change.
const PANEL_TOP_FRAC = 0.25;

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

// The charge running the wallet's perimeter while the balance is fetched.
//
// One path, stroked twice: a dim continuous track so the shape is always
// legible, and a short bright dash chasing around it. The dash is a
// DashPathEffect whose PHASE is animated — that moves the gap along the path
// instead of redrawing geometry every frame, so the whole thing costs one
// stroke regardless of speed. A blurred copy underneath is the glow; blur is
// what makes it read as charge rather than as a moving rectangle.
function Charge({
  width,
  height,
  progress,
}: {
  width: number;
  height: number;
  progress: SharedValue<number>;
}) {
  const path = useMemo(() => {
    const r = width * WALLET_RADIUS_FRAC;
    const p = Skia.Path.Make();
    // inset by half the stroke so the line sits ON the edge, not outside it
    p.addRRect(Skia.RRectXY(Skia.XYWHRect(1.5, 1.5, width - 3, height - 3), r, r));
    return p;
  }, [width, height]);

  const len = 2 * (width + height);
  // negative, so the dash travels clockwise
  const phase = useDerivedValue(() => -progress.value * len);
  const on = len * 0.22;
  const glow = useDerivedValue(() => 6 + 4 * Math.sin(progress.value * Math.PI * 4));

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Path path={path} style="stroke" strokeWidth={1.5} color="rgba(124,247,196,0.16)" />
      <Group>
        <Blur blur={glow} />
        <Path path={path} style="stroke" strokeWidth={4} color="#7CF7C4" opacity={0.55}>
          <DashPathEffect intervals={[on, len - on]} phase={phase} />
        </Path>
      </Group>
      <Path path={path} style="stroke" strokeWidth={2} color="#D6FFEE">
        <DashPathEffect intervals={[on * 0.5, len - on * 0.5]} phase={phase} />
      </Path>
    </Canvas>
  );
}

// Three chevrons climbing, instead of the words "swipe up to file".
//
// The wave runs bottom → top, which is the direction the finger has to go: the
// hint demonstrates the gesture rather than describing it. Each chevron is
// only ever fading and lifting a few points — it stays a hint, not a beacon.
//
// This is the one animation on the screen that loops, so it is deliberately
// the quietest: it never reaches full opacity, and the fade out is half again
// as long as the fade in, so the group reads as a slow pulse instead of a
// blink.
function HintChevron({ index }: { index: number }) {
  const reduced = useReducedMotion();
  const a = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    a.value = withDelay(
      // index 0 is the topmost, so it lights LAST
      (2 - index) * 150,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 420, easing: EASE_OUT }),
          withTiming(0, { duration: 640, easing: EASE_OUT }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: reduced ? 0.3 : 0.16 + 0.54 * a.value,
    transform: [{ translateY: reduced ? 0 : -3 * a.value }],
  }));

  return (
    <Animated.View style={[styles.chevronSlot, style]}>
      <View style={styles.chevronFlip}>
        <Chevron size={11} color="#FFFFFF" />
      </View>
    </Animated.View>
  );
}

function CardFace({ radius, sheen }: { radius: number; sheen: any }) {
  return (
    <>
      <Image source={CARD} style={styles.cardImage} resizeMode="contain" />
      <Animated.View
        pointerEvents="none"
        style={[styles.sheen, { borderRadius: radius }, sheen]}
      />
    </>
  );
}

export default function WalletInsert({
  onDragChange,
  onClose,
  insetTop,
  insetBottom,
}: {
  onDragChange?: (dragging: boolean) => void;
  // presenting full-screen: shows the back affordance and honours safe areas
  onClose?: () => void;
  insetTop?: number;
  insetBottom?: number;
}) {
  const reduced = useReducedMotion();
  // the stage's height matters as much as its width now: the card's resting
  // position is measured from the BOTTOM of the screen, not from the wallet
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const geo = useMemo(() => {
    if (stage.w === 0 || stage.h === 0) return null;
    const walletW = Math.min(stage.w, 380);
    const walletH = walletW / WALLET_ASPECT;
    const cardW = walletW * 0.86;
    const cardH = cardW / CARD_ASPECT;
    const walletTop = onClose ? WALLET_TOP : WALLET_TOP_INLINE;
    // everything below is in wallet-local coordinates, because that's the
    // space the card lives in (it's a sibling of the two wallet layers)
    const deck = stage.h - walletTop - cardH * PEEK_FRAC;
    return {
      walletW,
      walletH,
      walletTop,
      walletLeft: (stage.w - walletW) / 2,
      cardW,
      cardH,
      cardLeft: (walletW - cardW) / 2,
      inserted: walletH * INSERTED_FRAC,
      deck,
      lip: walletH * LIP_FRAC,
      // Fully above the wallet's top edge — not just above the pocket panel.
      // The back layer occludes anything inside the wallet's bounds, so this
      // is the only line at which swapping the card's depth is invisible.
      clear: -cardH - 2,
      // Apex of the somersault, measured against the wallet AFTER it has
      // dropped away: card bottom sits 26pt above the wallet's top edge, so
      // the two never share space while it turns. Staying on screen at all is
      // only possible because the wallet moves down rather than the card
      // being thrown higher.
      apex: WALLET_DIP - cardH - 26,
      // parked halfway down the empty run the card has to cross
      hintY: (walletH + deck) / 2,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, onClose]);

  // the card's top edge, in wallet-local coordinates. One value drives
  // everything else — lift, shadow, hint, progress.
  const y = useSharedValue(0);
  const grab = useSharedValue(0);
  // the wallet's own reaction: it drops out of the way while the card is
  // airborne and comes back up to meet it
  const recoil = useSharedValue(0);
  // 0 on the deck or in the pocket, 1 at the apex. Its own value rather than a
  // function of y, because y alone can't tell the rise from the fall — the
  // card passes the same heights twice and must be a different size each time.
  const lift = useSharedValue(0);

  // 0 loose → 1 filed. Derived rather than stored so it can never disagree
  // with where the card actually is.
  const p = useDerivedValue(() => {
    if (!geo) return 0;
    return interpolate(y.value, [geo.deck, geo.inserted], [0, 1], 'clamp');
  });

  // A spring follower sitting between the drag and the leather. PanResponder is
  // a JS-thread gesture system — it delivers `y` in irregular bursts, not once
  // per frame — so anything reading `p` directly moves in visible steps. The
  // card gets away with it because the eye tracks the finger it's pinned under;
  // the wallet has no such cover. Re-targeting a spring every update integrates
  // on the UI thread and preserves velocity across re-targets, which turns
  // stepped input into continuous motion.
  //
  // The bell (0 → 1 → 0) is what makes the wallet settle by itself once the card
  // is seated, rather than staying dipped.
  const react = useDerivedValue(() =>
    withSpring(interpolate(p.value, [0.35, 0.8, 1], [0, 1, 0], 'clamp'), {
      // dampingRatio 1: leather gives and settles. It does not bounce.
      dampingRatio: 1,
      duration: 420,
    }),
  );

  // the button only exists once a card is actually in the pocket. Driven from
  // the landing callback rather than from `p`, which hits 1 at the apex — the
  // button would appear while the card was still in mid-air.
  // 'idle' → 'charging' (2s of border charge) → 'done' (balance on screen)
  const [fetchState, setFetchState] = useState<'idle' | 'charging' | 'done'>('idle');
  const charge = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBalance = () => {
    if (fetchState !== 'idle') return;
    setFetchState('charging');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    charge.value = 0;
    // two laps in two seconds, linear — a charge travelling a wire has no
    // reason to ease, and easing it would make the loop's seam obvious
    charge.value = withTiming(2, { duration: FETCH_MS, easing: Easing.linear });
    timer.current = setTimeout(() => {
      setFetchState('done');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, FETCH_MS);
  };

  const resetFetch = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    cancelAnimation(charge);
    charge.value = 0;
    setFetchState('idle');
  };
  const start = useRef(0);
  const buzzed = useRef(false);
  // fires when the card actually touches down, which is a real impact and so
  // deserves its own tap — distinct from the light one on release
  const landed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // seating the card IS the request. No button: the gesture already said
    // what the user wanted, and asking them to confirm it with a tap would be
    // asking twice.
    fetchBalance();
  };
  // the responder reads this instead of `filed` so the closure can't go stale
  const filedRef = useRef(false);

  // position the card when the geometry first resolves, and again if the
  // width changes. NOT inside the responder's useMemo — that memo also
  // depends on `filed`, so assigning y there would slam the card to its
  // target the instant it was filed and cut the spring off mid-flight.
  useEffect(() => {
    if (!geo) return;
    y.value = filedRef.current ? geo.inserted : geo.deck;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  useEffect(() => {
    return () => {
      cancelAnimation(y);
      cancelAnimation(grab);
      cancelAnimation(recoil);
      cancelAnimation(lift);
      cancelAnimation(charge);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pan = useMemo(() => {
    if (!geo) return null;

    const settle = (to: number) => {
      // dampingRatio 1: leather has friction, so it arrives and stops. A
      // bouncy spring here makes an expensive card look like a toy.
      y.value = withSpring(to, { dampingRatio: 1, duration: reduced ? 220 : 460 });
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // only claim the gesture once it's clearly vertical, so a horizontal
      // flick or a scroll still belongs to the gallery
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        // a finger lands mid-flight: the flight is over, the finger wins
        cancelAnimation(y);
        cancelAnimation(recoil);
        cancelAnimation(lift);
        lift.value = withTiming(0, { duration: 180, easing: EASE_OUT });
        start.current = y.value;
        buzzed.current = false;
        grab.value = withTiming(1, { duration: 140, easing: EASE_OUT });
        onDragChange?.(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, g) => {
        // 1:1 with the finger, clamped to the two ends of the travel
        const next = Math.min(geo.deck, Math.max(geo.inserted, start.current + g.dy));
        y.value = next;
        // one tick at the mouth of the slot — the moment the card's top edge
        // reaches the lip is the moment it would physically touch leather
        if (!buzzed.current && next <= geo.lip - geo.cardH * 0.25) {
          buzzed.current = true;
          Haptics.selectionAsync();
        }
      },
      onPanResponderRelease: (_, g) => {
        grab.value = withSpring(0, { dampingRatio: 0.85, duration: 520 });
        onDragChange?.(false);
        const travel = geo.deck - geo.inserted;
        const passed = y.value < geo.deck - travel * 0.42;
        // a fast flick counts even if it didn't cover the distance — the user
        // has already expressed intent and shouldn't have to drag it all the way
        const flicked = g.vy < -0.9;
        const wantsIn = (passed || flicked) && g.vy < 0.9;
        filedRef.current = wantsIn;

        if (!wantsIn) {
          settle(geo.deck);
          resetFetch();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return;
        }

        if (reduced) {
          settle(geo.inserted);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          fetchBalance();
          return;
        }

        // The flight. The card is thrown up over the wallet, somersaults at
        // the top of its arc, and drops into the slot from above — so it
        // enters the pocket the way a hand would put it there, rather than
        // sliding in from underneath.
        //
        // Rise and fall are separate curves, not one spring: a spring is
        // symmetrical and this shouldn't be. It decelerates into the apex and
        // accelerates out of it, because that's what a thrown object does.
        // exactly the same three beats as the flight, so the card is at its
        // largest precisely at the apex and back to true size at the instant
        // it seats — no separate curve to fall out of sync
        lift.value = withSequence(
          withTiming(1, { duration: RISE_MS, easing: EASE_RISE }),
          withTiming(1, { duration: HOLD_MS }),
          withTiming(0, { duration: FALL_MS, easing: EASE_FALL }),
        );
        y.value = withSequence(
          withTiming(geo.apex, { duration: RISE_MS, easing: EASE_RISE }),
          // the hang: 10pt of continued drift rather than a dead hold, so the
          // apex never freezes into a still frame
          withTiming(geo.apex - 10, { duration: HOLD_MS, easing: Easing.inOut(Easing.sin) }),
          withTiming(geo.inserted, { duration: FALL_MS, easing: EASE_FALL }, (done) => {
            if (done) runOnJS(landed)();
          }),
        );
        // one full turn across the whole arc. inOut, so the card is turning
        // fastest while it's edge-on and hardest to read, and slowest at the
        // two moments its face is square to you.
        // the wallet drops away while the card is in the air and rises back to
        // meet it — the two halves of the same gesture, not two animations
        // down as the card rises, back up as it falls — the wallet and the
        // card meet in the middle instead of one waiting for the other
        // down as the card rises, HELD down for the whole somersault, then
        // back up to meet the card as it falls. The hold is the fix for the
        // wallet and the flip overlapping: previously it started climbing at
        // the apex, straight back into the card's airspace.
        recoil.value = withSequence(
          withTiming(1, { duration: RISE_MS - 40, easing: EASE_OUT }),
          withDelay(
            HOLD_MS + 60,
            withSpring(0, { dampingRatio: 0.9, duration: FALL_MS + 240 }),
          ),
        );
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderTerminate: () => {
        grab.value = withTiming(0, { duration: 220, easing: EASE_OUT });
        onDragChange?.(false);
        settle(filedRef.current ? geo.inserted : geo.deck);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, reduced]);

  // Where the card sits in the stack. Two places:
  //   0 BEHIND — under the whole wallet, hidden. This is the climb.
  //   1 IN     — between the two leather layers, i.e. in the pocket. This is
  //     the descent and the resting state.
  //
  // There is no third "above everything" depth: once the card is past the
  // wallet's top edge it overlaps no leather at all, so which copy is drawn
  // makes no difference — and that is exactly the moment to hand over.
  //
  // Driven by position, never by timers, so it stays correct on a flick, on an
  // interrupted drag, and on the way back out.
  // How far down the wallet currently is. Exposed as its own value because the
  // depth logic has to know: "has the card cleared the wallet" depends on where
  // the wallet is at that instant, not where it started.
  const walletShift = useDerivedValue(() =>
    reduced ? 0 : 14 * react.value + WALLET_DIP * recoil.value,
  );

  const phase = useSharedValue(0);
  useAnimatedReaction(
    // the card's position RELATIVE TO THE WALLET, since the wallet is moving
    // too. Comparing against a fixed line would flip the depth at the wrong
    // moment the instant the wallet dips.
    () => y.value - walletShift.value,
    (rel) => {
      if (!geo) return;
      // over the top → hand over to the in-pocket copy, and stay there for the
      // whole descent and the rest
      if (rel <= geo.clear) phase.value = 1;
      // all the way back down to the deck → behind the leather again
      else if (y.value >= geo.deck - 4) phase.value = 0;
    },
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.value },
      // lifts toward the finger while held, and flattens back out as it nears
      // the slot — a card being pressed into leather shouldn't still be
      // floating above it. (1 - p) is what does that.
      {
        scale: reduced
          ? 1
          : 1 + 0.06 * grab.value * (1 - p.value) + FLIGHT_LIFT * lift.value,
      },
    ],
    // the shadow is the only thing telling you the card is off the surface.
    // Opacity only — animating shadowRadius makes iOS re-blur the shadow
    // off-screen every frame, on the element that moves the most. The radius
    // lives in the static style.
    // deepens with height too, or a card 10% bigger would read as a zoom
    // rather than as something up in the air
    shadowOpacity: 0.25 + 0.35 * grab.value + 0.22 * lift.value,
  }));

  // The wallet reacts to PROXIMITY, not to the grab. Tying it to the touch
  // made the leather twitch the instant a finger landed, which reads as the
  // whole screen being loose. Instead it does nothing for the first 40% of the
  // travel, gives as the card comes into range, and is back at rest by the
  // time the card is seated — a bell curve, not a ramp, which is what makes
  // it settle on its own instead of staying dipped once the card is in.
  //
  // Applied to the two leather layers only — NOT to their shared parent,
  // which is also the card's parent and would drag the card along with it.
  const walletStyle = useAnimatedStyle(() => {
    if (reduced) return {};
    return {
      transform: [
        { translateY: walletShift.value },
        { scale: 1 + 0.012 * react.value },
      ],
    };
  });

  // light catching the face as it comes up off the deck
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : 0.05 * grab.value + 0.04 * p.value,
  }));

  // one copy per depth. Only ever one is visible, and they all share cardStyle,
  // so they occupy exactly the same place at all times.
  const deepStyle = useAnimatedStyle(() => ({ opacity: phase.value === 0 ? 1 : 0 }));
  const inStyle = useAnimatedStyle(() => ({ opacity: phase.value === 1 ? 1 : 0 }));

  const balance = useSharedValue(0);
  useEffect(() => {
    balance.value = withSpring(fetchState === 'done' ? 1 : 0, {
      dampingRatio: fetchState === 'done' ? 0.7 : 1,
      duration: fetchState === 'done' ? 640 : 220,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchState]);

  const balanceStyle = useAnimatedStyle(() => ({
    opacity: balance.value,
    transform: [
      { translateY: reduced ? 0 : (1 - balance.value) * 12 },
      { scale: reduced ? 1 : 0.96 + 0.04 * balance.value },
    ],
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ translateY: 6 * p.value }],
  }));

  const full = onClose != null;
  const cardBox = geo && {
    left: geo.cardLeft,
    width: geo.cardW,
    height: geo.cardH,
    borderRadius: geo.cardW * 0.038,
  };

  return (
    <View
      style={[
        styles.root,
        insetTop != null && { paddingTop: insetTop },
        insetBottom != null && { paddingBottom: insetBottom },
      ]}
    >
      {full && (
        <View style={[styles.header, { top: insetTop ?? 10 }]}>
          <PressScale scaleTo={0.92} style={styles.back} onPress={onClose}>
            <View style={styles.backChevron}>
              <Chevron size={9} color="#EDEDEF" />
            </View>
          </PressScale>
          <Text style={styles.title}>WALLET</Text>
        </View>
      )}

      {/* the stage takes the whole frame — its height is what places the card
          at the bottom edge, so it has to be measured, not assumed */}
      <View
        style={styles.stage}
        onLayout={(e: LayoutChangeEvent) =>
          setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
      >
        {geo && (
          <View
            style={{
              position: 'absolute',
              top: geo.walletTop,
              left: geo.walletLeft,
              width: geo.walletW,
              height: geo.walletH,
            }}
          >
            {/* BEHIND — under the leather. The card climbs the back of the
                wallet out of sight; this copy is the bottom of the stack. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.card, cardBox, cardStyle, deepStyle]}
            >
              <CardFace radius={geo.cardW * 0.038} sheen={sheenStyle} />
            </Animated.View>

            {/* the wallet, whole */}
            <Animated.View style={walletStyle} pointerEvents="none">
              <Image
                source={WALLET_BACK}
                style={{ width: geo.walletW, height: geo.walletH }}
                resizeMode="contain"
              />
            </Animated.View>

            {/* IN — between the two leather layers, i.e. in the pocket */}
            <Animated.View
              pointerEvents="none"
              style={[styles.card, cardBox, cardStyle, inStyle]}
            >
              <CardFace radius={geo.cardW * 0.038} sheen={sheenStyle} />
            </Animated.View>

            {/* the charge, on the leather's own transform so it stays welded
                to the wallet if the wallet moves */}
            {fetchState === 'charging' && (
              <Animated.View style={[styles.front, walletStyle]} pointerEvents="none">
                <Charge width={geo.walletW} height={geo.walletH} progress={charge} />
              </Animated.View>
            )}

            {/* the pocket panel */}
            <Animated.View style={[styles.front, walletStyle]} pointerEvents="none">
              <Image
                source={WALLET_FRONT}
                style={{ width: geo.walletW, height: geo.walletH }}
                resizeMode="contain"
              />
            </Animated.View>

            {/* The readout, on the leather itself. Sits low on the front
                panel — the only large unbroken area of the wallet, and the one
                place the filed card never covers. Drawn after the panel, and
                on the wallet's transform so it can't drift off it. */}
            <Animated.View
              style={[styles.front, walletStyle]}
              pointerEvents="none"
            >
              <Animated.View
                style={[
                  styles.balance,
                  {
                    // an explicit width, because styles.front is absolutely
                    // positioned with no width of its own — so the block was
                    // shrinking to fit its text and alignItems:'center' had
                    // nothing to centre within. That is why it was hanging off
                    // the left edge instead of sitting in the middle.
                    width: geo.walletW,
                    // centred in the front panel, BELOW the pocket lip. Higher
                    // than this and it lands on the card sticking out of the
                    // slot, which is what made it look like it was printed on
                    // the card rather than on the leather.
                    paddingTop: geo.walletH * 0.64,
                  },
                  balanceStyle,
                ]}
              >
                <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
                <NumberFlow
                  value={fetchState === 'done' ? BALANCE : 0}
                  format={{ style: 'currency', currency: 'INR' }}
                  // en-IN, so the grouping is lakh-style (1,24,805.50) rather
                  // than 124,805.50 — the separator pattern is half of what
                  // makes an amount read as rupees
                  locales="en-IN"
                  style={styles.balanceValue}
                />
              </Animated.View>
            </Animated.View>

            {/* The hit target, always on top and always tracking the card.
                The three copies are all pointerEvents:none — an opacity-0 view
                still catches touches in RN, so three of them stacked would
                fight over the gesture. One transparent grabber that follows
                cardStyle has none of that ambiguity, and it means the touch
                target is correct no matter which depth is currently drawn. */}
            <Animated.View
              {...(pan?.panHandlers ?? {})}
              style={[styles.card, cardBox, cardStyle]}
            />

            <Animated.View style={[styles.hint, { top: geo.hintY }]} pointerEvents="none">
              <Animated.View style={hintStyle}>
                {[0, 1, 2].map((i) => (
                  <HintChevron key={i} index={i} />
                ))}
              </Animated.View>
            </Animated.View>

          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0B',
  },
  stage: {
    flex: 1,
    // the card hangs past the bottom of this box on purpose
    overflow: 'visible',
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    position: 'absolute',
    left: 18,
    top: 0,
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
    transform: [{ rotate: '-90deg' }, { translateX: 1 }],
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.72)',
  },
  card: {
    position: 'absolute',
    top: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  front: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  balance: {
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Foil-stamped, not printed and not debossed.
  //
  // The deboss was correct physics and unreadable: its only contrast was a 1px
  // highlight, so it dissolved into the grain. Pure white is readable and reads
  // as a sticker — it is the one value on screen that belongs to no material.
  //
  // Silver foil is the way out, and it is what luxury leather goods actually
  // use. It is bright enough to read at a glance, but it is a MATERIAL: cool,
  // desaturated, never reaching white, so it sits in the same world as the
  // wallet's stitching highlights and the card's chip. The dark shadow beneath
  // is a contact shadow — foil is applied ON the leather and sits proud of it,
  // so the light comes from above and the shadow falls below.
  balanceLabel: {
    fontFamily: FACE_LABEL,
    fontSize: 10,
    fontWeight: '600',
    // Copperplate is already small caps and already wide; it needs less
    // tracking than a grotesque set in caps would
    letterSpacing: 1.4,
    // dimmer than the amount. A label competing with its own value is noise.
    color: '#767D81',
    marginBottom: 7,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  balanceValue: {
    fontFamily: FACE_AMOUNT,
    fontSize: 34,
    // Optima's strokes swell on their own; pushing it bold flattens exactly
    // the modulation that makes it worth using
    fontWeight: '600',
    // stamped type on leather is never tight, and Optima's open counters take
    // the air well
    letterSpacing: 0.8,
    // pulled well back off white. Foil catches light, it doesn't emit it —
    // this is the brightness of brushed metal in a dim room, not of a lamp.
    color: '#A2AAAE',
    textShadowColor: 'rgba(0,0,0,0.92)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  chevronSlot: {
    alignItems: 'center',
    marginBottom: 5,
  },
  // the Chevron atom draws a downward V, so it turns over. Kept on its own
  // node: a later style in the array replaces `transform` wholesale, so a
  // static rotate sitting beside an animated translateY would be thrown away.
  chevronFlip: {
    transform: [{ rotate: '180deg' }],
  },
});
