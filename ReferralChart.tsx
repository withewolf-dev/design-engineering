import {
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  Fill,
  Group,
  Line,
  LinearGradient,
  Path,
  Shader,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const DURATION = 1400;
const PHASE = [0.06, 0.22]; // animation start per column index (stagger)

// worklet helpers — windowed, eased progress off the single master clock
function winProg(t: number, a: number, b: number) {
  'worklet';
  const x = (t - a) / (b - a);
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c); // smoothstep
}

// grainy dark background with a soft top-center vignette
const BG_SKSL = `
uniform float2 res;
float hash(float2 p){ p=fract(p*float2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(float2 p){
  float2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+float2(1,0)), c=hash(i+float2(0,1)), d=hash(i+float2(1,1));
  float2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(float2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.02; a*=0.5;} return s; }
half4 main(float2 xy){
  float2 uv = xy/res;
  float3 col = float3(0.050, 0.058, 0.050);
  float dist = distance(uv, float2(0.5, 0.32));
  col += float3(0.020, 0.026, 0.020) * (1.0 - smoothstep(0.0, 0.9, dist));
  col += (fbm(xy*0.9) - 0.5) * 0.045; // grain
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

type Col = {
  xl: number;
  xr: number;
  yFlat: number;
  cornerFrac: number;
  yRight: number;
  dotY: number;
  stroke: string;
  fillTop: string;
  fillBot: string;
  divider: string;
  glow: number;
};

const COLS: Col[] = [
  {
    xl: 0.17,
    xr: 0.47,
    yFlat: 0.7,
    cornerFrac: 0.62,
    yRight: 0.755,
    dotY: 0.53,
    stroke: '#EDEDED',
    fillTop: 'rgba(214,218,214,0.16)',
    fillBot: 'rgba(214,218,214,0)',
    divider: 'rgba(255,255,255,0.06)',
    glow: 0,
  },
  {
    xl: 0.595,
    xr: 0.895,
    yFlat: 0.35,
    cornerFrac: 0.66,
    yRight: 0.425,
    dotY: 0.205,
    stroke: '#8BEF5A',
    fillTop: 'rgba(92,208,62,0.42)',
    fillBot: 'rgba(92,208,62,0)',
    divider: 'rgba(120,240,90,0.1)',
    glow: 1,
  },
];

function buildColumn(c: Col, w: number, h: number) {
  const xl = c.xl * w;
  const xr = c.xr * w;
  const yFlat = c.yFlat * h;
  const yRight = c.yRight * h;
  const xc = xl + c.cornerFrac * (xr - xl);

  const top = Skia.Path.Make();
  top.moveTo(xl, yFlat);
  top.lineTo(xc, yFlat);
  top.lineTo(xr, yRight);

  const fill = Skia.Path.Make();
  fill.moveTo(xl, yFlat);
  fill.lineTo(xc, yFlat);
  fill.lineTo(xr, yRight);
  fill.lineTo(xr, h);
  fill.lineTo(xl, h);
  fill.close();

  const leader = Skia.Path.Make();
  leader.moveTo(xl, c.dotY * h);
  leader.lineTo(xl, yFlat);

  return { top, fill, leader, xl, xr, xc, yFlat, yRight, dotY: c.dotY * h };
}

// One column, fully driven on the UI thread by derived values off `t`.
function AnimatedColumn({
  c,
  g,
  index,
  t,
  h,
}: {
  c: Col;
  g: ReturnType<typeof buildColumn>;
  index: number;
  t: SharedValue<number>;
  h: number;
}) {
  const start = PHASE[index];
  const reveal = useDerivedValue(() => winProg(t.value, start, start + 0.5));
  const leaderP = useDerivedValue(() => winProg(t.value, start + 0.36, start + 0.62));
  const dotP = useDerivedValue(() => winProg(t.value, start, start + 0.14));
  const dotR = useDerivedValue(() => 4 * dotP.value);

  return (
    <Group>
      {/* gradient body */}
      <Path path={g.fill} opacity={reveal}>
        <LinearGradient
          start={vec(0, g.yFlat)}
          end={vec(0, h)}
          colors={[c.fillTop, c.fillBot]}
        />
      </Path>

      {/* faint vertical dividers */}
      <Line p1={vec(g.xc, g.yFlat)} p2={vec(g.xc, h)} color={c.divider} strokeWidth={1} opacity={reveal} />
      <Line p1={vec(g.xr, g.yRight)} p2={vec(g.xr, h)} color={c.divider} strokeWidth={1} opacity={reveal} />

      {/* glow under the top edge (green) */}
      {c.glow > 0 && (
        <Path
          path={g.top}
          end={reveal}
          style="stroke"
          strokeWidth={13}
          strokeJoin="round"
          strokeCap="round"
          color={c.stroke}
          opacity={0.5}
        >
          <BlurMask blur={14} style="normal" />
        </Path>
      )}

      {/* crisp glossy top edge — draws on via path trim */}
      <Path
        path={g.top}
        end={reveal}
        style="stroke"
        strokeWidth={c.glow > 0 ? 5 : 4}
        strokeJoin="round"
        strokeCap="round"
        color={c.stroke}
      />

      {/* dotted leader line grows down to the column */}
      <Path
        path={g.leader}
        end={leaderP}
        style="stroke"
        strokeWidth={2}
        strokeCap="round"
        color={c.stroke}
        opacity={0.85}
      >
        <DashPathEffect intervals={[1.5, 7]} />
      </Path>

      {/* leader dot pops in */}
      <Circle cx={g.xl} cy={g.dotY} r={dotR} color={c.stroke} opacity={dotP} />
    </Group>
  );
}

// UI-thread counting number via TextInput + useAnimatedProps
function AnimatedCount({
  t,
  to,
  a,
  b,
  color,
}: {
  t: SharedValue<number>;
  to: number;
  a: number;
  b: number;
  color: string;
}) {
  const props = useAnimatedProps(() => {
    const v = Math.round(to * winProg(t.value, a, b));
    return { text: `${v}%` } as any;
  });
  return (
    <AnimatedTextInput
      editable={false}
      allowFontScaling={false}
      caretHidden
      underlineColorAndroid="transparent"
      defaultValue="0%"
      animatedProps={props}
      style={[styles.pct, styles.pctInput, { color }]}
    />
  );
}

export default function ReferralChart() {
  const [{ w, h }, setDim] = useState({ w: 0, h: 0 });
  const bg = useMemo(() => Skia.RuntimeEffect.Make(BG_SKSL), []);
  const geo = useMemo(
    () => (w && h ? COLS.map((c) => ({ c, g: buildColumn(c, w, h) })) : []),
    [w, h],
  );

  const t = useSharedValue(0);
  const started = useRef(false);

  const play = () => {
    t.value = 0;
    t.value = withTiming(1, { duration: DURATION, easing: Easing.linear });
  };

  useEffect(() => {
    if (w > 0 && h > 0 && !started.current) {
      started.current = true;
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);

  return (
    <Pressable
      style={styles.root}
      onPress={play}
      onLayout={(e) =>
        setDim({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
    >
      {w > 0 && h > 0 && (
        <>
          <Canvas style={{ width: w, height: h }}>
            <Fill>{bg && <Shader source={bg} uniforms={{ res: [w, h] }} />}</Fill>
            {geo.map(({ c, g }, i) => (
              <AnimatedColumn key={i} c={c} g={g} index={i} t={t} h={h} />
            ))}
          </Canvas>

          {/* text overlays */}
          <View
            style={[styles.label, { left: 0.165 * w, top: 0.315 * h, width: 0.32 * w }]}
            pointerEvents="none"
          >
            <AnimatedCount t={t} to={10} a={PHASE[0] + 0.04} b={PHASE[0] + 0.54} color="#EDEDED" />
            <Text style={[styles.cap, { color: '#9AA39A' }]}>
              of second-level referrals deposits
            </Text>
          </View>

          <View
            style={[styles.label, { left: 0.595 * w, top: 0.055 * h, width: 0.36 * w }]}
            pointerEvents="none"
          >
            <AnimatedCount t={t} to={25} a={PHASE[1] + 0.04} b={PHASE[1] + 0.54} color="#8BEF5A" />
            <Text style={[styles.cap, { color: '#83B673' }]}>
              of direct referrals deposits
            </Text>
          </View>

          {/* floating side buttons */}
          <View style={[styles.fab, { top: 0.78 * h }]} pointerEvents="none">
            <Text style={styles.fabIcon}>↙</Text>
          </View>
          <View style={[styles.fab, { top: 0.9 * h }]} pointerEvents="none">
            <Text style={styles.fabIcon}>⌕</Text>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#0B0C0B',
  },
  label: {
    position: 'absolute',
  },
  pct: {
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  pctInput: {
    padding: 0,
    margin: 0,
    height: 56,
  },
  cap: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  fab: {
    position: 'absolute',
    right: -22,
    width: 52,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(40,44,40,0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    color: '#D8DCD8',
    fontSize: 20,
    marginRight: 14,
  },
});
