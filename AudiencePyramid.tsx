import {
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  Fill,
  Group,
  LinearGradient,
  Path,
  Shader,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { NumberFlow } from 'number-flow-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// A sliced pyramid as an infographic. Motion decisions:
//
// - the build is EXPLANATORY (seen once per visit), so it may run ~1s:
//   the solid pyramid fades up → the seams open bottom-up, light spilling
//   out of each cut → leaders draw outward → the headline lands on the apex.
// - the seams open in stack order: lifting the lower slab carries every
//   slab above it. Nothing ever intersects, so the object stays believable.
// - selection = lift + focus. Tapping a tier separates it from the stack
//   below and dims the rest; the label rides along with its slab so the
//   leader line never detaches from what it points at.
// - entrances use a strong ease-out / critically damped spring (no bounce —
//   this is stone, not jelly). Press feedback is 100ms.
// - reduced motion: opacity only. No lift, no separation, no scale.

const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_FN = Easing.bezier(0.23, 1, 0.32, 1).factory();

const GAP = 12; // resting seam height between slabs
const SEL = 11; // extra lift for the selected slab and everything above it
const CUT = [0.33, 0.62]; // where the pyramid is sliced, apex → base

type Tier = {
  level: 0 | 1 | 2; // 0 = base slab, 2 = apex cap
  name: string;
  short: string;
  value: number;
  note: string;
};

const TIERS: Tier[] = [
  {
    level: 2,
    name: 'MEMBERS',
    short: '1,840',
    value: 1840,
    note: 'paid subscribers · 7.5% of engaged',
  },
  {
    level: 1,
    name: 'ENGAGED',
    short: '24.6k',
    value: 24600,
    note: 'liked, saved or shared · 19% of reach',
  },
  {
    level: 0,
    name: 'REACH',
    short: '128.4k',
    value: 128400,
    note: 'accounts reached in the last 30 days',
  },
];

// grainy near-black room with a soft pool of light behind the object
const BG_SKSL = `
uniform float2 res;
float hash(float2 p){ p = fract(p * float2(127.1, 311.7)); p += dot(p, p + 34.53); return fract(p.x * p.y); }
half4 main(float2 xy){
  float2 uv = xy / res;
  float d = distance(uv, float2(0.34, 0.34));
  float3 col = float3(0.066, 0.066, 0.070);
  col += float3(0.030, 0.030, 0.035) * (1.0 - smoothstep(0.05, 0.95, d));
  col += (hash(floor(xy)) - 0.5) * 0.016;
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

// lit face: cast concrete — sparse dark flecks, light falling off downward
const FACE_SKSL = `
uniform float2 org;
uniform float hgt;
float hash(float2 p){ p = fract(p * float2(127.1, 311.7)); p += dot(p, p + 34.53); return fract(p.x * p.y); }
half4 main(float2 xy){
  float v = clamp((xy.y - org.y) / hgt, 0.0, 1.0);
  float g = 0.655 - 0.090 * v;
  g += (hash(floor(xy)) - 0.5) * 0.045;
  g -= step(0.9885, hash(floor(xy) + 7.3)) * 0.30;
  return half4(half3(clamp(g, 0.0, 1.0)), 1.0);
}
`;

type Pt = { x: number; y: number };

const mix = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

function poly(pts: Pt[]) {
  const p = Skia.Path.Make();
  p.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
  p.close();
  return p;
}

function buildGeo(w: number, h: number, labelX: number) {
  const hw = 0.255 * w; // half the base width
  const cx = 0.29 * w;
  const apexY = 0.45 * h;
  const sideY = apexY + 1.216 * hw; // ratios lifted from the reference render
  const dep = 0.41 * hw; // how far the front corner drops below the sides

  const A = { x: cx, y: apexY };
  const L = { x: cx - hw, y: sideY };
  const R = { x: cx + hw, y: sideY };
  const F = { x: cx, y: sideY + dep };
  const B = { x: cx, y: sideY - dep };

  const s = [0, CUT[0], CUT[1], 1];

  const tiers = ([0, 1, 2] as const).map((level) => {
    const s0 = s[2 - level]; // upper cut
    const s1 = s[3 - level]; // lower cut

    const Lt = mix(A, L, s0);
    const Rt = mix(A, R, s0);
    const Ft = mix(A, F, s0);
    const Bt = mix(A, B, s0);
    const Lb = mix(A, L, s1);
    const Rb = mix(A, R, s1);
    const Fb = mix(A, F, s1);

    // the outer right edge at the slab's mid-height — where its leader hangs
    const anchor = mix(A, R, (s0 + s1) / 2);

    const leader = Skia.Path.Make();
    leader.moveTo(anchor.x + 9, anchor.y);
    leader.lineTo(labelX - 12, anchor.y);

    // only the two front edges of the cut — light spills toward the viewer,
    // not out of the back of the object
    const seamEdge = Skia.Path.Make();
    seamEdge.moveTo(Lt.x, Lt.y);
    seamEdge.lineTo(Ft.x, Ft.y);
    seamEdge.lineTo(Rt.x, Rt.y);

    return {
      level,
      body: poly([Lt, Bt, Rt, Rb, Fb, Lb]),
      leftFace: poly([Lt, Ft, Fb, Lb]),
      rightFace: poly([Ft, Rt, Rb, Fb]),
      topFace: s0 > 0 ? poly([Lt, Ft, Rt, Bt]) : null,
      seamEdge: s0 > 0 ? seamEdge : null,
      leader,
      anchor,
      midY: anchor.y,
      gradTop: Ft.y,
      gradBot: Fb.y,
    };
  });

  return {
    tiers,
    cx,
    apexY,
    faceOrg: [0, apexY] as [number, number],
    faceH: F.y - apexY,
    centerY: (apexY + F.y) / 2,
    baseY: F.y,
    cutY: [
      apexY + CUT[0] * (sideY - apexY),
      apexY + CUT[1] * (sideY - apexY),
    ] as [number, number],
  };
}

type Geo = ReturnType<typeof buildGeo>;

function Slab({
  g,
  faceShader,
  faceOrg,
  faceH,
  sepA,
  sepB,
  lift,
  focus,
  focusAbove,
  rise,
  labelIn,
  reduced,
}: {
  g: Geo['tiers'][number];
  faceShader: ReturnType<typeof Skia.RuntimeEffect.Make>;
  faceOrg: [number, number];
  faceH: number;
  sepA: SharedValue<number>;
  sepB: SharedValue<number>;
  lift: SharedValue<number>;
  focus: SharedValue<number>;
  focusAbove: SharedValue<number>;
  rise: SharedValue<number>;
  labelIn: SharedValue<number>;
  reduced: boolean;
}) {
  const { level } = g;

  // every slab carries the ones above it — the stack never interpenetrates
  const transform = useDerivedValue(() => {
    if (reduced) return [{ translateY: 0 }];
    const stack = level >= 2 ? sepA.value + sepB.value : level >= 1 ? sepA.value : 0;
    return [{ translateY: -GAP * stack - SEL * lift.value }];
  });

  // unselected slabs recede; they never disappear
  const dim = useDerivedValue(() => rise.value * (0.7 + 0.3 * focus.value));
  // the cut surface is the light source — it stays lit whichever slab is
  // selected, and answers to the slab above it as well as its own
  const seam = useDerivedValue(
    () => rise.value * (0.84 + 0.16 * Math.max(focus.value, focusAbove.value)),
  );
  const seamGlow = useDerivedValue(
    () => rise.value * (0.1 + 0.2 * Math.max(focus.value, focusAbove.value)),
  );
  const rimSoft = useDerivedValue(() => rise.value * 0.3 * focus.value);
  const rimCrisp = useDerivedValue(() => rise.value * 0.45 * focus.value);
  const leaderIn = useDerivedValue(() => labelIn.value * dim.value);

  return (
    <Group transform={transform}>
      {/* solid core: kills the antialiased seams between adjacent faces */}
      <Path path={g.body} color="#0E0E10" opacity={rise} />

      <Path path={g.leftFace} opacity={dim}>
        {faceShader && (
          <Shader source={faceShader} uniforms={{ org: faceOrg, hgt: faceH }} />
        )}
      </Path>

      <Path path={g.rightFace} opacity={dim}>
        <LinearGradient
          start={vec(0, g.gradTop)}
          end={vec(0, g.gradBot)}
          colors={['#2B2B2F', '#151517']}
        />
      </Path>

      {g.topFace && g.seamEdge && (
        <>
          {/* light spilling out of the cut, onto the faces below it */}
          <Path
            path={g.seamEdge}
            style="stroke"
            strokeWidth={6}
            strokeCap="round"
            color="#FFFFFF"
            opacity={seamGlow}
          >
            <BlurMask blur={8} style="normal" />
          </Path>
          <Path path={g.topFace} opacity={seam}>
            <LinearGradient
              start={vec(g.anchor.x - 200, 0)}
              end={vec(g.anchor.x + 40, 0)}
              colors={['#C6C6C9', '#FAFAFB']}
            />
          </Path>
        </>
      )}

      {/* selected: a rim light rather than an outline sitting on the surface */}
      <Path
        path={g.body}
        style="stroke"
        strokeWidth={2}
        color="#FFFFFF"
        opacity={rimSoft}
      >
        <BlurMask blur={7} style="normal" />
      </Path>
      <Path
        path={g.body}
        style="stroke"
        strokeWidth={1}
        color="#FFFFFF"
        opacity={rimCrisp}
      />

      {/* leader draws outward toward its label */}
      <Circle cx={g.anchor.x + 4} cy={g.anchor.y} r={2} color="#9DA1A7" opacity={leaderIn} />
      <Path
        path={g.leader}
        end={labelIn}
        style="stroke"
        strokeWidth={1.5}
        strokeCap="round"
        color="#9DA1A7"
        opacity={leaderIn}
      >
        <DashPathEffect intervals={[1.5, 5]} />
      </Path>
    </Group>
  );
}

function LabelRow({
  tier,
  top,
  left,
  sepA,
  sepB,
  lift,
  focus,
  appear,
  reduced,
  onPress,
}: {
  tier: Tier;
  top: number;
  left: number;
  sepA: SharedValue<number>;
  sepB: SharedValue<number>;
  lift: SharedValue<number>;
  focus: SharedValue<number>;
  appear: SharedValue<number>;
  reduced: boolean;
  onPress: () => void;
}) {
  const press = useSharedValue(1);
  const { level } = tier;

  // rides with its slab: rest position is the opened stack, so back out the
  // separation that hasn't happened yet
  const row = useAnimatedStyle(() => {
    const stack = level >= 2 ? sepA.value + sepB.value : level >= 1 ? sepA.value : 0;
    const ty = reduced ? 0 : GAP * level - GAP * stack - SEL * lift.value;
    return {
      opacity: appear.value,
      transform: [
        { translateY: ty + (reduced ? 0 : 6 * (1 - appear.value)) },
        { scale: press.value },
      ],
    };
  });

  const nameStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focus.value, [0, 1], ['#6E7278', '#C7CACF']),
  }));
  const valueStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focus.value, [0, 1], ['#93989F', '#FFFFFF']),
  }));

  return (
    <Pressable
      onPressIn={() => {
        press.value = withTiming(0.97, { duration: 100, easing: EASE });
      }}
      onPressOut={() => {
        press.value = withSpring(1, { dampingRatio: 1, duration: 300 });
      }}
      onPress={onPress}
      hitSlop={10}
      style={[styles.rowHit, { top, left }]}
    >
      <Animated.View style={row}>
        <Animated.Text style={[styles.rowName, nameStyle]}>{tier.name}</Animated.Text>
        <Animated.Text style={[styles.rowValue, valueStyle]}>{tier.short}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export default function AudiencePyramid() {
  const reduced = useReducedMotion();
  const [{ w, h }, setDim] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState<0 | 1 | 2>(2);
  const [revealed, setRevealed] = useState(false);

  const bg = useMemo(() => Skia.RuntimeEffect.Make(BG_SKSL), []);
  const face = useMemo(() => Skia.RuntimeEffect.Make(FACE_SKSL), []);

  const labelX = 0.655 * w;
  const geo = useMemo(
    () => (w > 0 && h > 0 ? buildGeo(w, h, labelX) : null),
    [w, h, labelX],
  );

  // one shared value per slab, indexed by level (0 = base)
  const sepA = useSharedValue(0); // base ↔ middle seam
  const sepB = useSharedValue(0); // middle ↔ apex seam
  const rise = useSharedValue(0);
  const lift = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const focus = [useSharedValue(1), useSharedValue(1), useSharedValue(1)];
  const labelIn = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const headIn = useSharedValue(0);
  const swap = useSharedValue(1);

  const started = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settleOn = (level: 0 | 1 | 2) => {
    for (let i = 0; i < 3; i++) {
      focus[i].value = withTiming(i === level ? 1 : 0, { duration: 200, easing: EASE });
      lift[i].value = reduced
        ? 0
        : withSpring(i >= level ? 1 : 0, { dampingRatio: 1, duration: 360 });
    }
  };

  const play = () => {
    if (timer.current) clearTimeout(timer.current);
    setRevealed(false);
    setSelected(2);

    sepA.value = 0;
    sepB.value = 0;
    rise.value = 0;
    headIn.value = 0;
    swap.value = 1;
    for (let i = 0; i < 3; i++) {
      labelIn[i].value = 0;
      lift[i].value = 0;
      focus[i].value = 1; // whole object reads as one piece during the build
    }

    if (reduced) {
      sepA.value = 1;
      sepB.value = 1;
      rise.value = withTiming(1, { duration: 220, easing: EASE });
      headIn.value = withDelay(120, withTiming(1, { duration: 220, easing: EASE }));
      for (let i = 0; i < 3; i++) {
        labelIn[i].value = withDelay(160, withTiming(1, { duration: 220, easing: EASE }));
      }
    } else {
      rise.value = withSpring(1, { dampingRatio: 1, duration: 480 });
      // seams open bottom-up: light works its way up through the stack
      sepA.value = withDelay(240, withSpring(1, { dampingRatio: 1, duration: 560 }));
      sepB.value = withDelay(310, withSpring(1, { dampingRatio: 1, duration: 560 }));
      for (let i = 0; i < 3; i++) {
        // same direction as the seams — base label first
        labelIn[i].value = withDelay(
          440 + (2 - i) * 70,
          withTiming(1, { duration: 300, easing: EASE }),
        );
      }
      headIn.value = withDelay(560, withTiming(1, { duration: 280, easing: EASE }));
    }

    timer.current = setTimeout(
      () => {
        setRevealed(true);
        settleOn(2);
      },
      reduced ? 240 : 700,
    );
  };

  useEffect(() => {
    if (w > 0 && h > 0 && !started.current) {
      started.current = true;
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const select = (level: 0 | 1 | 2) => {
    if (!revealed || level === selected) return;
    setSelected(level);
    settleOn(level);
    // the caption swaps while it is invisible — no crossfade of two strings
    swap.value = 0;
    swap.value = withTiming(1, { duration: 220, easing: EASE });
  };

  const onCanvasPress = (e: GestureResponderEvent) => {
    if (!geo) return;
    const { locationX, locationY } = e.nativeEvent;
    if (locationX > labelX - 12 || locationY < geo.apexY - 30) return;
    const a = geo.cutY[0] - GAP * 1.5;
    const b = geo.cutY[1] - GAP * 0.5;
    select(locationY < a ? 2 : locationY < b ? 1 : 0);
  };

  const active = TIERS.find((t) => t.level === selected)!;

  const header = useAnimatedStyle(() => ({
    opacity: headIn.value,
    transform: [{ translateY: reduced ? 0 : 8 * (1 - headIn.value) }],
  }));
  const caption = useAnimatedStyle(() => ({
    opacity: swap.value,
    transform: [{ translateY: reduced ? 0 : 5 * (1 - swap.value) }],
  }));

  // the whole object settles into place once — never from scale(0)
  const settle = useDerivedValue(() => [
    { scale: reduced ? 1 : 0.96 + 0.04 * rise.value },
  ]);

  const replay = useSharedValue(1);
  const replayStyle = useAnimatedStyle(() => ({
    opacity: headIn.value * 0.9,
    transform: [{ scale: replay.value }],
  }));

  return (
    <View
      style={styles.root}
      onLayout={(e) =>
        setDim({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {geo && (
        <>
          <Pressable onPress={onCanvasPress}>
            <Canvas style={{ width: w, height: h }}>
              <Fill>{bg && <Shader source={bg} uniforms={{ res: [w, h] }} />}</Fill>

              <Group transform={settle} origin={vec(geo.cx, geo.centerY)}>
                {geo.tiers.map((g) => (
                  <Slab
                    key={g.level}
                    g={g}
                    faceShader={face}
                    faceOrg={geo.faceOrg}
                    faceH={geo.faceH}
                    sepA={sepA}
                    sepB={sepB}
                    lift={lift[g.level]}
                    focus={focus[g.level]}
                    focusAbove={focus[Math.min(g.level + 1, 2)]}
                    rise={rise}
                    labelIn={labelIn[g.level]}
                    reduced={reduced}
                  />
                ))}
              </Group>
            </Canvas>
          </Pressable>

          <Animated.View style={[styles.header, header]} pointerEvents="none">
            <Text style={styles.kicker}>AUDIENCE PYRAMID</Text>
            <NumberFlow
              value={revealed ? active.value : 0}
              locales="en-US"
              style={styles.big}
              transformTiming={{ duration: 320, easing: EASE_FN }}
              spinTiming={{ duration: 360, easing: EASE_FN }}
              opacityTiming={{ duration: 180, easing: EASE_FN }}
            />
            <Animated.Text style={[styles.note, caption]}>{active.note}</Animated.Text>
          </Animated.View>

          {TIERS.map((t) => (
            <LabelRow
              key={t.level}
              tier={t}
              top={geo.tiers[t.level].midY - GAP * t.level - 21}
              left={labelX}
              sepA={sepA}
              sepB={sepB}
              lift={lift[t.level]}
              focus={focus[t.level]}
              appear={labelIn[t.level]}
              reduced={reduced}
              onPress={() => select(t.level)}
            />
          ))}

          <Animated.View style={[styles.replayWrap, replayStyle]}>
            <Pressable
              onPressIn={() => {
                replay.value = withTiming(0.97, { duration: 100, easing: EASE });
              }}
              onPressOut={() => {
                replay.value = withSpring(1, { dampingRatio: 1, duration: 300 });
              }}
              onPress={play}
              hitSlop={12}
              style={styles.replay}
            >
              <Text style={styles.replayIcon}>↻</Text>
            </Pressable>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#111113',
  },
  header: {
    position: 'absolute',
    left: 18,
    top: 18,
    maxWidth: 250,
  },
  kicker: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 2.2, // small caps want positive tracking
    color: '#6E7278',
    marginBottom: 8,
  },
  big: {
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.2, // display sizes want it back
    color: '#F5F6F7',
  },
  note: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 17,
    color: '#8A8E95',
  },
  rowHit: {
    position: 'absolute',
    height: 42,
    justifyContent: 'center',
    paddingRight: 12,
  },
  rowName: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  rowValue: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  replayWrap: {
    position: 'absolute',
    left: 16,
    bottom: 16,
  },
  replay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  replayIcon: {
    color: '#B9BDC3',
    fontSize: 15,
    marginTop: -1,
  },
});
