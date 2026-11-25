import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BlurView } from 'expo-blur';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import { getOrCreateSessionQrCode } from '@/services/sessions';
import { formatDate } from '@/utils/format';

export default function AsistenPresensiScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { sessions, getScheduleForSession } = useApp();
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const openSessions = useMemo(() => sessions.filter((session) => session.status === 'open'), [sessions]);

  useEffect(() => {
    let active = true;
    openSessions.forEach((session) => {
      getOrCreateSessionQrCode(session.id).then((code) => {
        if (active) {
          setQrCodes((current) => ({ ...current, [session.id]: code }));
          setError(null);
        }
      }).catch(() => {
        if (active) setError('QR gagal disiapkan. Pastikan sesi masih terbuka dan coba muat ulang.');
      });
    });
    return () => { active = false; };
  // Re-run when the set of currently open sessions changes.
  }, [openSessions]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
          <View style={styles.heading}>
            <ThemedText type="title">QR Presensi</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Tampilkan QR ini agar praktikan dapat memindai dan mencatat kehadiran.</ThemedText>
          </View>
          {error ? (
            <BlurView intensity={42} tint="light" style={[styles.card, styles.glassCard, { borderColor: theme.danger }]}>
              <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText>
            </BlurView>
          ) : null}
          {openSessions.length === 0 ? (
            <BlurView intensity={42} tint="light" style={[styles.card, styles.glassCard, { borderColor: theme.glassBorder }]}>
              <ThemedText type="smallBold">Belum ada sesi yang dibuka</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Buka sesi dari halaman Sesi untuk menampilkan QR presensi.</ThemedText>
            </BlurView>
          ) : openSessions.map((session) => {
            const schedule = getScheduleForSession(session.id);
            const code = qrCodes[session.id];
            return (
              <BlurView key={session.id} intensity={42} tint="light" style={[styles.card, styles.glassCard, { borderColor: theme.glassBorder }]}>
                <View style={styles.cardHeading}>
                  <View style={styles.titleBlock}>
                    <ThemedText type="subtitle">{schedule?.praktikum ?? 'Praktikum'}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{schedule?.kelas ?? '-'} · {schedule?.ruang ?? '-'}</ThemedText>
                  </View>
                  <SessionStatusBadge status={session.status} />
                </View>
                {schedule ? (
                  <ThemedText type="small" themeColor="textSecondary">{formatDate(schedule.date)} · {schedule.startTime}–{schedule.endTime}</ThemedText>
                ) : null}
                {code ? (
                  <View style={styles.qrContainer}>
                    <QRCode
                      value={JSON.stringify({ app: 'labora', type: 'attendance', sessionId: session.id, code })}
                      size={220}
                      color="#27301B"
                      backgroundColor="#FFFFFF"
                    />
                  </View>
                ) : (
                  <View style={[styles.qrLoading, { borderColor: theme.glassBorder }]}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {error ?? 'Menyiapkan QR sesi…'}
                    </ThemedText>
                  </View>
                )}
                <ThemedText type="small" themeColor="textSecondary" style={styles.helper}>
                  QR berlaku untuk sesi ini selama sesi masih dibuka.
                </ThemedText>
              </BlurView>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/asisten/jadwal')}
            style={({ pressed }) => [styles.backButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassCard }, pressed && styles.pressed]}
          >
            <ThemedText type="smallBold" style={{ color: theme.primary }}>← Kembali</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: Spacing.three, gap: Spacing.three },
  heading: { gap: Spacing.one },
  card: { padding: Spacing.three, borderWidth: 1, borderRadius: 20, gap: Spacing.two, overflow: 'hidden' },
  glassCard: { backgroundColor: 'rgba(255,255,255,0.28)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object : {}) },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titleBlock: { flex: 1, gap: Spacing.half },
  qrContainer: { width: '100%', maxWidth: 280, aspectRatio: 1, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', padding: Spacing.three, borderRadius: 20, backgroundColor: '#FFFFFF' },
  qrLoading: { minHeight: 64, alignItems: 'center', justifyContent: 'center', padding: Spacing.two, borderRadius: 14, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  backButton: { alignSelf: 'center', minWidth: 136, alignItems: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: 999, borderWidth: 1 },
  pressed: { opacity: 0.75 },
  helper: { textAlign: 'center' },
});
