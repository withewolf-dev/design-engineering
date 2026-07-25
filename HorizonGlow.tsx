import { BlurMask, Canvas, Circle, Fill } from '@shopify/react-native-skia';
import { useState } from 'react';
import { View } from 'react-native';

// Atmosphere horizon: three concentric arc bands (white / purple / indigo),
// each a stroked circle with a Layer Blur. White uses Plus Lighter (blendMode
// "plus") and an inner blur so it stays a crisp rim without bleeding upward.
export default function HorizonGlow() {
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
          >
            <BlurMask blur={36} style="normal" />
          </Circle>

          <Circle
            cx={cx}
            cy={cyFor(purpleTop, purpleSW)}
            r={R}
            style="stroke"
            strokeWidth={purpleSW}
            color="#A556FB"
          >
            <BlurMask blur={16} style="normal" />
          </Circle>

          <Circle
            cx={cx}
            cy={cyFor(whiteTop, whiteSW)}
            r={R}
            style="stroke"
            strokeWidth={whiteSW}
            color="#FFFFFF"
            blendMode="plus"
          >
            <BlurMask blur={10} style="inner" />
          </Circle>
        </Canvas>
      )}
    </View>
  );
}
