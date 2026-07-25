import { Canvas, RoundedRect, Shader, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const TAB_WIDTH = 120;
const THUMB_H = 38;
const RAD = THUMB_H / 2;
const PAD = 4;
const SPRING = { damping: 18, stiffness: 200, mass: 0.8 };

// procedural matte-leather grain: grayish-green black, pebbled micro-texture,
// concave (hollow) lighting — top darker, bottom rim-light, edge occlusion
const GRAIN_SKSL = `
uniform float2 res;
uniform float rad;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(float2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return s;
}
float sdRoundRect(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

half4 main(float2 xy) {
  float2 c = res * 0.5;
  float d = sdRoundRect(xy - c, c, rad);
  float3 base = float3(0.094, 0.125, 0.106);
  float grain = fbm(xy * 0.6);
  float micro = vnoise(xy * 2.6);
  float tex = mix(grain, micro, 0.45) - 0.5;
  float3 col = base * (1.0 + 0.42 * tex);
  float vy = clamp(xy.y / res.y, 0.0, 1.0);
  col *= mix(0.72, 1.16, vy);
  float rimDark = smoothstep(-6.0, 0.0, d);
  col *= 1.0 - 0.42 * rimDark;
  float bottomRim = smoothstep(-5.0, -1.0, d) * smoothstep(0.5, 1.0, vy);
  col += float3(0.10, 0.14, 0.115) * bottomRim;
  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

function SegLabel({
  label,
  index,
  pos,
}: {
  label: string;
  index: number;
  pos: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    color: interpolateColor(
      pos.value,
      [index - 1, index, index + 1],
      ['#7C837E', '#F2F6F3', '#7C837E'],
    ),
  }));
  return <Animated.Text style={[styles.tabLabel, style]}>{label}</Animated.Text>;
}

export default function SegmentedTabs({
  tabs = ['Write', 'Streak'],
  onChange,
}: {
  tabs?: string[];
  onChange?: (index: number) => void;
}) {
  const [, setActive] = useState(0);
  const pos = useSharedValue(0);
  const effect = useMemo(() => Skia.RuntimeEffect.Make(GRAIN_SKSL), []);

  const select = (index: number) => {
    setActive(index);
    pos.value = withSpring(index, SPRING);
    onChange?.(index);
  };

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * TAB_WIDTH }],
  }));

  return (
    <View style={styles.tabBar}>
      <View style={styles.segment}>
        <Animated.View style={[styles.thumb, thumbStyle]}>
          <Canvas style={{ width: TAB_WIDTH, height: THUMB_H }}>
            {effect && (
              <RoundedRect x={0} y={0} width={TAB_WIDTH} height={THUMB_H} r={RAD}>
                <Shader
                  source={effect}
                  uniforms={{ res: [TAB_WIDTH, THUMB_H], rad: RAD }}
                />
              </RoundedRect>
            )}
          </Canvas>
        </Animated.View>
        {tabs.map((tab, index) => (
          <Pressable key={tab} style={styles.tab} onPress={() => select(index)}>
            <SegLabel label={tab} index={index} pos={pos} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  segment: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#E8EBE9',
    borderRadius: 999,
    padding: PAD,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  thumb: {
    position: 'absolute',
    left: PAD,
    top: PAD,
    width: TAB_WIDTH,
    height: THUMB_H,
  },
  tab: {
    width: TAB_WIDTH,
    height: THUMB_H,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
