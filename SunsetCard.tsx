import {
  Canvas,
  LinearGradient,
  RoundedRect,
  Shader,
  Shadow,
  Skia,
  useClock,
  vec,
} from '@shopify/react-native-skia';
import { type ReactNode, useMemo } from 'react';
import { Dimensions, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W * 0.82, 330);
const CARD_H = Math.round(CARD_W * 1.5);
const RAD = 28;
const PAD = 40; // canvas room for the drop shadow
const CANVAS_W = CARD_W + PAD * 2;
const CANVAS_H = CARD_H + PAD * 2;

// sunset: near-black top → burnt orange → warm cream bloom at the bottom, + grain
const SUNSET_SKSL = `
uniform float2 org;   // card origin within the canvas
uniform float2 sz;    // card size
uniform float t;      // seconds — drives the breathing bloom

float hash(float2 p){ p=fract(p*float2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(float2 p){
  float2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+float2(1,0)), c=hash(i+float2(0,1)), d=hash(i+float2(1,1));
  float2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(float2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.02; a*=0.5;} return s; }

half4 main(float2 xy){
  float2 uv = (xy - org) / sz;   // 0..1 within the card
  float y = uv.y;

  float3 black = float3(0.030, 0.020, 0.014);
  float3 dark  = float3(0.165, 0.065, 0.022);
  float3 orange= float3(0.820, 0.340, 0.060);
  float3 cream = float3(1.000, 0.780, 0.420);

  float3 col;
  if (y < 0.5)       col = mix(black, dark,   smoothstep(0.0, 0.5, y));
  else if (y < 0.82) col = mix(dark,  orange, smoothstep(0.5, 0.82, y));
  else               col = mix(orange, cream, smoothstep(0.82, 1.0, y));

  // warm bloom near the bottom — centre drifts slowly, intensity breathes
  float2 bloomC = float2(
    0.40 + 0.07 * sin(t * 0.35),
    1.02 + 0.025 * sin(t * 0.50 + 1.7)
  );
  float breath = 0.55 + 0.14 * sin(t * 0.60);
  float spread = 0.72 + 0.05 * sin(t * 0.45 + 0.8);
  float glow = 1.0 - smoothstep(0.0, spread, distance(uv, bloomC));
  col += float3(1.0, 0.82, 0.45) * glow * breath;

  // fine film grain
  col += (fbm(xy * 0.9) - 0.5) * 0.03;

  return half4(half3(clamp(col, 0.0, 1.0)), 1.0);
}
`;

export default function SunsetCard({ children }: { children?: ReactNode }) {
  const effect = useMemo(() => Skia.RuntimeEffect.Make(SUNSET_SKSL), []);
  const clock = useClock(); // UI-thread ms clock
  const uniforms = useDerivedValue(() => ({
    org: [PAD, PAD],
    sz: [CARD_W, CARD_H],
    t: clock.value / 1000,
  }));

  return (
    <View style={{ width: CANVAS_W, height: CANVAS_H }}>
      <Canvas style={{ width: CANVAS_W, height: CANVAS_H }}>
        {/* card background — sunset shader + soft drop shadow */}
        <RoundedRect x={PAD} y={PAD} width={CARD_W} height={CARD_H} r={RAD}>
          <Shadow dx={0} dy={14} blur={28} color="rgba(0,0,0,0.28)" />
          {effect && <Shader source={effect} uniforms={uniforms} />}
        </RoundedRect>

        {/* card border — light-catching rim at top, fading down */}
        <RoundedRect
          x={PAD}
          y={PAD}
          width={CARD_W}
          height={CARD_H}
          r={RAD}
          style="stroke"
          strokeWidth={1.5}
        >
          <LinearGradient
            start={vec(PAD, PAD)}
            end={vec(PAD, PAD + CARD_H)}
            colors={[
              'rgba(255,255,255,0.38)',
              'rgba(255,255,255,0.10)',
              'rgba(255,220,180,0.16)',
            ]}
          />
        </RoundedRect>
      </Canvas>

      {/* overlay content, centered within the card area */}
      {children != null && (
        <View
          style={{
            position: 'absolute',
            top: PAD,
            left: PAD,
            width: CARD_W,
            height: CARD_H,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
