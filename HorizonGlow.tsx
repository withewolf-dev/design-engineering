import { BlurMask, Canvas, Circle, Fill } from '@shopify/react-native-skia';
import { useState } from 'react';
import { View } from 'react-native';
import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

// Atmosphere horizon: three concentric arc bands (white / purple / indigo).
// Optionally animatable via shared values — the canvas repaints only while
// they change, so the static case costs nothing:
//   reveal — 0→1 entrance: the light blooms in with the rise
//   lift   — 0→1 while the user pulls the dawn upward: the white rim
//            brightens and thickens like the sun about to break
export default function HorizonGlow({
  reveal,
  lift,
}: {
  reveal?: SharedValue<number>;
  lift?: SharedValue<number>;
}) {
  const [{ w, h }, setDim] = useState({ w: 0, h: 0 });

  const R = w * 1.35; // curvature — bigger = flatter horizon
  const cx = w / 2;
  const whiteSW = 30;
  const purpleSW = 52;
  const indigoSW = 50;
  const whiteTop = h * 0.5;
  const purpleTop = whiteTop + whiteSW;
  const indigoTop = purpleTop + purpleSW;
  const cyFor = (top: number, sw: number) => top + R + sw / 2;

  // light responds to entrance + pull; all default to the static full look
  const bandOpacity = useDerivedValue(() => reveal?.value ?? 1);
  const whiteOpacity = useDerivedValue(() => {
    const r = reveal?.value ?? 1;
    const l = lift?.value ?? 0;
    return Math.min(1, r * (0.88 + 0.24 * l));
  });
  const whiteWidth = useDerivedValue(
    () => whiteSW * (1 + 0.35 * (lift?.value ?? 0)),
  );
  const purpleWidth = useDerivedValue(
    () => purpleSW * (1 + 0.15 * (lift?.value ?? 0)),
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
          <Fill color="#181824" />

          <Circle
            cx={cx}
            cy={cyFor(indigoTop, indigoSW)}
            r={R}
            style="stroke"
            strokeWidth={indigoSW}
            color="#4822E5"
            opacity={bandOpacity}
          >
            <BlurMask blur={36} style="normal" />
          </Circle>

          <Circle
            cx={cx}
            cy={cyFor(purpleTop, purpleSW)}
            r={R}
            style="stroke"
            strokeWidth={purpleWidth}
            color="#A556FB"
            opacity={bandOpacity}
          >
            <BlurMask blur={16} style="normal" />
          </Circle>

          <Circle
            cx={cx}
            cy={cyFor(whiteTop, whiteSW)}
            r={R}
            style="stroke"
            strokeWidth={whiteWidth}
            color="#FFFFFF"
            blendMode="plus"
            opacity={whiteOpacity}
          >
            <BlurMask blur={10} style="inner" />
          </Circle>
        </Canvas>
      )}
    </View>
  );
}
