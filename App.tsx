import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import ThreeScene from './ThreeScene';

export default function App() {
  return (
    <View style={styles.container}>
      <ThreeScene />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101014',
  },
});
