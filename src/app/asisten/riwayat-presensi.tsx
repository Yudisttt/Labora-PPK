import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import { formatDate, formatTime } from '@/utils/format';

export default function RiwayatPresensiScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { attendance, sessions, users, getSchedule } = useApp();

  const sessionHistory = useMemo(() => sessions
    .filter((session) => session.openedAt !== null || session.status !== 'scheduled')
    .sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? ''))
    .map((session) => {
      const schedule = getSchedule(session.scheduleId);
      const present = attendance
        .filter((record) => record.sessionId === session.id && record.status === 'present')
        .map((record) => ({ record, user: users.find((item) => item.id === record.userId) }))
        .filter((item): item is typeof item & { user: NonNullable<typeof item.user> } => Boolean(item.user))
        .sort((a, b) => (a.record.checkedInAt ?? '').localeCompare(b.record.checkedInAt ?? ''));
      return { session, schedule, present };
    }), [attendance, getSchedule, sessions, users]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
          <View style={styles.heading}>
            <ThemedText type="title">Riwayat Presensi</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Daftar praktikan yang hadir pada sesi yang pernah dibuka.
            </ThemedText>
          </View>

          {sessionHistory.length === 0 ? (
            <BlurView intensity={42} tint="light" style={[styles.glassCard, { borderColor: theme.glassBorder }]}>
              <ThemedText type="smallBold">Belum ada sesi dibuka</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Riwayat peserta hadir akan muncul setelah sesi presensi dibuka.
              </ThemedText>
            </BlurView>
          ) : sessionHistory.map(({ session, schedule, present }) => (
            <BlurView key={session.id} intensity={42} tint="light" style={[styles.glassCard, { borderColor: theme.glassBorder }]}>
              <View style={styles.sessionHeader}>
                <View style={styles.sessionTitle}>
                  <ThemedText type="subtitle">{schedule?.praktikum ?? 'Sesi praktikum'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {schedule ? `${schedule.kelas} · ${schedule.ruang}` : 'Jadwal tidak ditemukan'}
                  </ThemedText>
                </View>
                <SessionStatusBadge status={session.status} />
              </View>

              <ThemedText type="small" themeColor="textSecondary">
                {schedule ? `${formatDate(schedule.date)} · ${schedule.startTime}–${schedule.endTime}` : 'Tanggal tidak tersedia'}
              </ThemedText>

              <View style={[styles.summary, { backgroundColor: 'rgba(255,255,255,0.38)' }]}>
                <Ionicons name="people-outline" size={16} color={theme.primary} />
                <ThemedText type="smallBold">{present.length} hadir</ThemedText>
              </View>

              {present.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Belum ada praktikan yang presensi pada sesi ini.
                </ThemedText>
              ) : present.map(({ record, user }) => (
                <View key={record.id} style={[styles.personRow, { borderColor: theme.glassBorder }]}>
                  <View style={[styles.avatar, { backgroundColor: theme.glassGreenLight }]}>
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>
                      {user.name.trim().charAt(0).toUpperCase() || '?'}
                    </ThemedText>
                  </View>
                  <View style={styles.personDetails}>
                    <ThemedText type="smallBold">{user.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{user.identityNumber}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatTime(record.checkedInAt)}
                  </ThemedText>
                </View>
              ))}
            </BlurView>
          ))}

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
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.three, gap: Spacing.three },
  heading: { gap: Spacing.one },
  glassCard: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.28)',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object : {}),
  },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionTitle: { flex: 1, gap: Spacing.half },
  summary: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 999 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  avatar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  personDetails: { flex: 1, gap: 1 },
  backButton: { alignSelf: 'center', minWidth: 136, alignItems: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: 999, borderWidth: 1 },
  pressed: { opacity: 0.75 },
});
