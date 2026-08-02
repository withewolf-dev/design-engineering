import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import PushScreen from './PushScreen';
import AnimatedGradient from './AnimatedGradient';
import AudiencePyramid from './AudiencePyramid';
import ChargeWindow from './ChargeWindow';
import CoachTaskCard from './CoachTaskCard';
import CurrencyFormatting from './CurrencyFormatting';
import HorizonGlow from './HorizonGlow';
import ReferralChart from './ReferralChart';
import SeatPicker, { useTrailer } from './SeatPicker';
import SegmentedTabs from './SegmentedTabs';
import StreakCard from './StreakCard';
import SunriseDone from './SunriseDone';
import SunsetCard from './SunsetCard';
import TasksCard from './TasksCard';

// Component library gallery. Each component lives in its own titled Frame.
// Adding a component = add a new <Frame>. Nothing here gets removed to make
// room for something new.

type Tone = 'light' | 'dark';

function Frame({
  title,
  tone = 'light',
  fill = false,
  height,
  action,
  children,
}: {
  title: string;
  tone?: Tone;
  fill?: boolean;
  height?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.frame}>
      <View style={styles.frameHead}>
        <Text style={styles.frameTitle}>{title}</Text>
        {action}
      </View>
      <View
        style={[
          styles.stage,
          tone === 'dark' && styles.stageDark,
          fill && styles.stageFill,
          height != null && { height },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

// iOS safe areas for a screen that paints edge to edge. No safe-area-context
// in this project, so these are the modern-iPhone constants.
const INSET_TOP = Platform.OS === 'ios' ? 58 : 26;
const INSET_BOTTOM = Platform.OS === 'ios' ? 30 : 16;

function OpenButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.open}>
      <Text style={styles.openText}>Open screen</Text>
    </Pressable>
  );
}

export default function App() {
  // a component that owns a drag gesture locks the gallery's scroll for the
  // length of that gesture — otherwise the page slides out from under the finger
  const [locked, setLocked] = useState(false);

  // full-screen routes. One shared value drives both layers of the push, so
  // the gallery sliding back and the screen arriving can never drift apart.
  const [route, setRoute] = useState<'gallery' | 'seats'>('gallery');
  const push = useSharedValue(0);

  // The trailer is owned here, where nothing ever unmounts. Skia's useVideo
  // disposes its native player on unmount while the frame callback is still
  // scheduled, so a component that mounts and unmounts (the pushed screen)
  // cannot own one. Both SeatPickers read the same decoded frame.
  const trailer = useTrailer();
  const reduced = useReducedMotion();
  const w = Dimensions.get('window').width;

  const galleryStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reduced ? 0 : -w * 0.22 * push.value }],
    opacity: 1 - 0.45 * push.value,
  }));

  return (
    <View style={styles.root}>
      <Animated.View
        style={[styles.root, galleryStyle]}
        pointerEvents={route === 'gallery' ? 'auto' : 'none'}
      >
        <SafeAreaView style={styles.root}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!locked}
          >
            <Text style={styles.h1}>Component Library</Text>
            <Text style={styles.sub}>Everything we've built — nothing gets removed.</Text>

        <Frame
          title="Seat Picker — The Odyssey"
          tone="dark"
          fill
          height={822}
          action={<OpenButton onPress={() => setRoute('seats')} />}
        >
          {/* live preview — the tile itself is the second way in. Unmounted
              while the full screen is up: two instances means two video-driven
              canvases repainting every frame, one of them invisible. That's
              pure heat. The gallery is behind the pushed screen anyway. */}
          <Pressable style={styles.previewTap} onPress={() => setRoute('seats')}>
            <View style={styles.preview} pointerEvents="none">
              {route === 'gallery' ? <SeatPicker frame={trailer} /> : null}
            </View>
          </Pressable>
        </Frame>

        <Frame title="Charge Window">
          <ChargeWindow onDragChange={setLocked} />
        </Frame>

        <Frame title="Audience Pyramid" tone="dark" fill>
          <AudiencePyramid />
        </Frame>

        <Frame title="Coach Task Card">
          <CoachTaskCard />
        </Frame>

        <Frame title="Animated Gradient" tone="dark" fill>
          <AnimatedGradient />
        </Frame>

        <Frame title="Segmented Tabs">
          <SegmentedTabs />
        </Frame>

        <Frame title="Streak Card" tone="dark">
          <StreakCard />
        </Frame>

        <Frame title="Referral Chart" tone="dark" fill>
          <ReferralChart />
        </Frame>

        <Frame title="Sunset Card">
          <SunsetCard />
        </Frame>

        <Frame title="Sunrise — Day Complete" tone="dark" fill>
          <SunriseDone />
        </Frame>

        <Frame title="Horizon Glow" tone="dark" fill>
          <HorizonGlow />
        </Frame>

        <Frame title="Currency Flow" tone="dark" fill>
          <CurrencyFormatting />
        </Frame>

        <Frame title="Tasks Card">
          <TasksCard />
        </Frame>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>

      <PushScreen visible={route === 'seats'} progress={push}>
        <SeatPicker
          frame={trailer}
          onClose={() => setRoute('gallery')}
          insetTop={INSET_TOP}
          insetBottom={INSET_BOTTOM}
        />
      </PushScreen>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0E0E10',
  },
  scroll: {
    padding: 16,
    paddingBottom: 60,
  },
  h1: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginTop: 8,
  },
  sub: {
    fontSize: 13,
    color: '#9A9A9A',
    marginTop: 4,
    marginBottom: 20,
  },
  frame: {
    marginBottom: 26,
  },
  frameHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  open: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  openText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EDEDEF',
  },
  previewTap: {
    flex: 1,
    alignSelf: 'stretch',
  },
  preview: {
    flex: 1,
  },
  frameTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#8A8F94',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  stage: {
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F1F1F2',
  },
  stageDark: {
    backgroundColor: '#0A0B0C',
  },
  stageFill: {
    height: 400,
    padding: 0,
    alignItems: 'stretch',
  },
});
