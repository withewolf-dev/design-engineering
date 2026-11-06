import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Messages } from './components/Messages';
import { TAB_BAR_H, TabBar, TABS } from './components/TabBar';
import { DEFAULT_TUNING, haptic, TuneSheet } from './components/TuneSheet';

const PAGES = TABS.length;
const CHATS = 1;

export default function App() {
  return (
    <SafeAreaProvider>
      <Pager />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

// One page per tab, side by side. Swipe or tap a tab; the app opens on Chats.
function Pager() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [active, setActive] = useState(CHATS);
  const [tuning, setTuning] = useState(DEFAULT_TUNING);
  const [tuneOpen, setTuneOpen] = useState(false);
  const page = useRef(CHATS); // page we're resting on
  const armed = useRef(CHATS); // page a release would land on right now
  const dragging = useRef(false);
  const hitWall = useRef(false);

  const go = (i: number) => {
    if (i === armed.current) return;
    page.current = armed.current = i;
    setActive(i);
    haptic(tuning.hapticTap);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        bounces={tuning.bounces}
        decelerationRate={tuning.fastDeceleration ? 'fast' : 'normal'}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentOffset={{ x: CHATS * width, y: 0 }}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          dragging.current = true;
          hitWall.current = false;
        }}
        onScrollEndDrag={() => {
          dragging.current = false;
        }}
        onScroll={(e) => {
          if (!dragging.current) return;
          const x = e.nativeEvent.contentOffset.x;
          // Detent: tick each time the drag crosses the halfway point into a new page (or back out).
          const nearest = Math.min(Math.max(Math.round(x / width), 0), PAGES - 1);
          if (nearest !== armed.current) {
            armed.current = nearest;
            if (tuning.switchAt === 'halfway') setActive(nearest);
            haptic(tuning.hapticDetent);
          }
          // Wall: one firm bump when you pull past the first or last page.
          if (!hitWall.current && (x < -tuning.wallPx || x > (PAGES - 1) * width + tuning.wallPx)) {
            hitWall.current = true;
            haptic(tuning.hapticWall);
          }
        }}
        onMomentumScrollEnd={(e) => {
          // Landing: a soft thud as the new page settles into place.
          const next = Math.round(e.nativeEvent.contentOffset.x / width);
          if (next !== page.current) haptic(tuning.hapticLand);
          page.current = armed.current = next;
          setActive(next);
        }}
      >
        {TABS.map((tab, i) =>
          i === CHATS ? (
            <View key={tab.label} style={{ width }}>
              <Messages topOffset={insets.top + TAB_BAR_H} />
            </View>
          ) : (
            <Placeholder key={tab.label} label={tab.label} width={width} />
          ),
        )}
      </ScrollView>
      <TabBar
        active={active}
        onPress={go}
        onAvatarPress={() => setTuneOpen((o) => !o)}
        topInset={insets.top}
        tuning={tuning}
      />
      {tuneOpen && <TuneSheet tuning={tuning} onChange={setTuning} onClose={() => setTuneOpen(false)} />}
    </View>
  );
}

function Placeholder({ label, width }: { label: string; width: number }) {
  return (
    <View style={[styles.placeholder, { width }]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F2F7' },
  label: { fontSize: 17, color: '#8E8E93' },
});
