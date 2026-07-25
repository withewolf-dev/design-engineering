import {
  Canvas,
  Fill,
  Shader,
  Skia,
  useClock,
} from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

// Flowing aurora gradient. A Skia clock (shared value, UI thread) drives a
// time uniform into the shader — the JS thread does no per-frame work.
// Domain-warped fbm makes the colors drift and fold instead of sliding.
const AURORA_SKSL = `
uniform float2 res;
uniform float t;

float hash(float2 p){ p=fract(p*float2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(float2 p){
  float2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+float2(1,0)), c=hash(i+float2(0,1)), d=hash(i+float2(1,1));
  float2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(float2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.02; a*=0.5;} return s; }

half4 main(float2 xy){
  float2 uv = xy / res;
  float2 p = uv * float2(1.6, 2.2);

  // two layers of noise, the second warped by the first (domain warping)
  float n1 = fbm(p + float2(t * 0.060, -t * 0.045));
  float n2 = fbm(p * 1.7 - float2(t * 0.050, t * 0.070) + n1 * 1.4);

  float3 base   = float3(0.030, 0.038, 0.080); // deep navy
  float3 teal   = float3(0.050, 0.650, 0.600);
  float3 violet = float3(0.450, 0.200, 0.850);
  float3 pink   = float3(0.950, 0.350, 0.600);

  float3 col = base;
  col = mix(col, teal,   smoothstep(0.35, 0.75, n1) * 0.80);
  col = mix(col, violet, smoothstep(0.40, 0.85, n2) * 0.85);
  col += pink * pow(max(n1 * n2, 0.0), 2.0) * 0.90;

  // fine grain so the bands never look flat
  col += (hash(xy) - 0.5) * 0.025;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

export default function AnimatedGradient() {
  const [{ w, h }, setDim] = useState({ w: 0, h: 0 });
  const effect = useMemo(() => Skia.RuntimeEffect.Make(AURORA_SKSL), []);
  const clock = useClock(); // ms, ticks on the UI thread

  const uniforms = useDerivedValue(
    () => ({ res: [w, h], t: clock.value / 1000 }),
    [w, h],
  );

  return (
    <View
      style={{ flex: 1, alignSelf: 'stretch' }}
      onLayout={(e) =>
        setDim({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {w > 0 && h > 0 && (
        <Canvas style={{ width: w, height: h }}>
          <Fill>
            {effect && <Shader source={effect} uniforms={uniforms} />}
          </Fill>
        </Canvas>
      )}
    </View>
  );
}
