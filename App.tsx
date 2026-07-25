import { StatusBar } from 'expo-status-bar';
import { type ReactNode } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import AnimatedGradient from './AnimatedGradient';
import CoachTaskCard from './CoachTaskCard';
import CurrencyFormatting from './CurrencyFormatting';
import HorizonGlow from './HorizonGlow';
import ReferralChart from './ReferralChart';
import SegmentedTabs from './SegmentedTabs';
import StreakCard from './StreakCard';
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
  children,
}: {
  title: string;
  tone?: Tone;
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.frame}>
      <Text style={styles.frameTitle}>{title}</Text>
      <View
        style={[
          styles.stage,
          tone === 'dark' && styles.stageDark,
          fill && styles.stageFill,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.h1}>Component Library</Text>
        <Text style={styles.sub}>Everything we've built — nothing gets removed.</Text>

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
      <StatusBar style="light" />
    </SafeAreaView>
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
