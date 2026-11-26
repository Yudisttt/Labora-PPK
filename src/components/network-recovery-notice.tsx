import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';

export function NetworkRecoveryNotice() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { dataSyncError, retryDataSync } = useApp();
  const [retrying, setRetrying] = useState(false);

  if (!dataSyncError) return null;

  function handleRetry() {
    setRetrying(true);
    retryDataSync();
    setTimeout(() => setRetrying(false), 1200);
  }

  return (
    <View style={[styles.outer, { paddingTop: insets.top + Spacing.two }]}>
      <View style={[styles.card, { backgroundColor: theme.dangerSoft, borderColor: theme.glassBorder }]}>
        <View style={styles.copy}>
          <Ionicons name="cloud-offline-outline" size={20} color={theme.danger} />
          <View style={styles.text}>
            <ThemedText type="smallBold" style={{ color: theme.danger }}>Koneksi terganggu</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{dataSyncError}</ThemedText>
          </View>
        </View>
        <ActionButton
          label="Coba lagi"
          variant="secondary"
          loading={retrying}
          onPress={handleRetry}
          style={styles.retry}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  card: {
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 20,
    borderWidth: 1,
  },
  copy: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  text: { flex: 1, gap: Spacing.one },
  retry: { minWidth: 104, borderRadius: 999 },
});
