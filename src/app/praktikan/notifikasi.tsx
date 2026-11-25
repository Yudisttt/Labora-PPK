import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { subscribeToInAppNotifications, type InAppNotification } from '@/services/in-app-notifications';
import { useAuth } from '@/state/auth-context';

export default function PraktikanNotifikasiScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    return subscribeToInAppNotifications(
      currentUser.id,
      (nextNotifications) => {
        setNotifications(nextNotifications);
        setLoading(false);
      },
      () => {
        setError('Pemberitahuan belum dapat dimuat. Periksa koneksi lalu coba lagi.');
        setLoading(false);
      },
    );
  }, [currentUser, retryKey]);

  return (
    <ThemedView style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>‹ Kembali</ThemedText>
          </Pressable>
          <ThemedText type="subtitle" style={styles.title}>Pemberitahuan</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Kabar sesi, perubahan jadwal, dan keputusan pengajuan izin.
          </ThemedText>

          {loading ? (
            <ActivityIndicator style={styles.state} color={theme.primary} />
          ) : error ? (
            <View style={[styles.card, { backgroundColor: theme.dangerSoft }]}>
              <ThemedText>{error}</ThemedText>
              <Pressable accessibilityRole="button" onPress={() => {
                setLoading(true);
                setError(null);
                setRetryKey((key) => key + 1);
              }} style={styles.retry}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>Coba lagi</ThemedText>
              </Pressable>
            </View>
          ) : notifications.length === 0 ? (
            <View style={[styles.card, { backgroundColor: theme.glassInput }]}>
              <ThemedText type="smallBold">Belum ada pemberitahuan</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Pemberitahuan akan muncul di sini meskipun notifikasi perangkat tidak aktif.
              </ThemedText>
            </View>
          ) : notifications.map((notification) => (
            <Pressable
              key={notification.id}
              accessibilityRole="button"
              onPress={() => router.push(notification.destination === 'praktikan/izin' ? '/praktikan/izin' : '/praktikan/jadwal')}
              style={({ pressed }) => [styles.card, { backgroundColor: theme.glassInput, borderColor: theme.border }, pressed && styles.pressed]}>
              <ThemedText type="smallBold">{notification.title}</ThemedText>
              <ThemedText type="small">{notification.body}</ThemedText>
              {notification.createdAt ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {notification.createdAt.toLocaleString('id-ID')}
                </ThemedText>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: { gap: Spacing.three, padding: Spacing.four },
  title: { marginTop: Spacing.two },
  state: { marginTop: Spacing.five },
  card: { gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: Spacing.three },
  retry: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  pressed: { opacity: 0.75 },
});
