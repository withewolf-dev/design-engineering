import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const HAS_GLASS = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

// Liquid Glass on iOS 26; a frosted white pill with a soft shadow elsewhere.
export function Glass({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }) {
  return HAS_GLASS ? (
    <GlassView isInteractive style={style}>
      {children}
    </GlassView>
  ) : (
    <View style={[style, styles.fallback]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
