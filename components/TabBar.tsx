import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Glass } from './Glass';
import { labelEnter, labelExit, pillTransition, type Tuning } from './TuneSheet';

export const TABS: { label: string; icon: SFSymbol; activeIcon: SFSymbol }[] = [
  { label: 'Home', icon: 'house', activeIcon: 'house.fill' },
  { label: 'Chats', icon: 'bubble.left', activeIcon: 'bubble.left.fill' },
  { label: 'Calendar', icon: 'calendar', activeIcon: 'calendar' },
  { label: 'Inbox', icon: 'tray', activeIcon: 'tray.fill' },
];
export const TAB_BAR_H = 64;

type Props = { active: number; onPress: (i: number) => void; onAvatarPress: () => void; topInset: number; tuning: Tuning };

export function TabBar({ active, onPress, onAvatarPress, topInset, tuning }: Props) {
  const layout = pillTransition(tuning);
  return (
    <View style={[styles.bar, { paddingTop: topInset }]}>
      <Pressable style={styles.avatar} onPress={onAvatarPress} accessibilityLabel="Tune animations">
        <Text style={styles.avatarText}>G</Text>
      </Pressable>
      {TABS.map((tab, i) => {
        const on = i === active;
        return (
          // The active pill grows to show its label; the others shrink to icon-only.
          <Animated.View key={tab.label} layout={layout} style={on && styles.activeWrap}>
            <Glass style={styles.pill}>
              <Pressable style={styles.pillInner} onPress={() => onPress(i)} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: on }}>
                <SymbolView name={on ? tab.activeIcon : tab.icon} size={22} tintColor={on ? '#000' : '#8E8E93'} />
                {on && (
                  <Animated.Text entering={labelEnter(tuning)} exiting={labelExit(tuning)} style={styles.label} numberOfLines={1}>
                    {tab.label}
                  </Animated.Text>
                )}
              </Pressable>
            </Glass>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E5E5EA',
    borderWidth: 3,
    borderColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '500', color: '#636366' },
  activeWrap: { flex: 1 },
  pill: { height: 48, minWidth: 56, borderRadius: 24 },
  pillInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  label: { fontSize: 17, fontWeight: '600', color: '#000' },
});
