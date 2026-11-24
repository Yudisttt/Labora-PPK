import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';

export default function PresensiScreen() {
  return <ThemedView style={styles.screen} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
