import { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = Math.min(SCREEN_W * 0.62, 250);

const INITIAL = [
  { label: 'Complete the development', done: false },
  { label: 'Conduct testing and fix', done: false },
  { label: 'Discuss new ideas for improving', done: true },
  { label: 'Prepare a report on the work completed', done: false },
];

export default function TasksCard() {
  const [items, setItems] = useState(INITIAL);

  const toggle = (i: number) =>
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it)),
    );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks Project</Text>
        <Text style={styles.chevron}>⌃</Text>
      </View>

      <View style={styles.divider} />

      {items.map((it, i) => (
        <Pressable
          key={it.label}
          style={styles.row}
          onPress={() => toggle(i)}
          hitSlop={6}
        >
          <View style={[styles.box, it.done && styles.boxDone]}>
            {it.done && <Text style={styles.check}>✓</Text>}
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#202124',
  },
  chevron: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9AA0A6',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E8EAED',
    marginHorizontal: -16,
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#D0D3D6',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxDone: {
    backgroundColor: '#1C1C1E',
    borderColor: '#1C1C1E',
  },
  check: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 15,
  },
  label: {
    flex: 1,
    fontSize: 13.5,
    color: '#3C4043',
  },
});
