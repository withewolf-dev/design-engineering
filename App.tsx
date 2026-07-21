import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import WalletScreen from './WalletScreen';

export default function App() {
  return (
    <View style={styles.container}>
      <WalletScreen />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0F13',
  },
});
