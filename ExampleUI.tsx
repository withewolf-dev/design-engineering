import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Recreation of the shared './ExampleUI' helper the number-flow docs examples
// import: a dark, centered layout + a titled button.

export function ExampleLayout({ children }: { children: ReactNode }) {
  return <View style={styles.layout}>{children}</View>;
}

export function Button({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  layout: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    padding: 24,
    backgroundColor: '#0B0B0F',
  },
  button: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1E1E24',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
