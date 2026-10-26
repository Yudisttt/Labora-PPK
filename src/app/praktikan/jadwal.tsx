import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RoleSwitcher } from '@/components/role-switcher';
import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useApp } from '@/state/app-context';
import { formatDate } from '@/utils/format';

export default function PraktikanJadwalScreen() {
  const {
    currentUser,
    schedules,
    sessions,
    getAttendanceForUser,
    getSessionsForSchedule,
  } = useApp();

  const attendanceCount = currentUser
    ? getAttendanceForUser(currentUser.id).length
    : 0;
  const openSessionCount = sessions.filter(
    (session) => session.status === 'open',
  ).length;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <RoleSwitcher />

          <View style={styles.header}>
            <ThemedText type="subtitle">Jadwal Praktikan</ThemedText>
            <ThemedText themeColor="textSecondary">
              Halo {currentUser?.name ?? 'Praktikan'}. Halaman ini masih
              placeholder untuk SRS-01.
            </ThemedText>
          </View>

          <View style={styles.statsRow}>
            <ThemedView type="backgroundElement" style={styles.statCard}>
              <ThemedText type="subtitle" style={styles.statValue}>
                {schedules.length}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Jadwal
              </ThemedText>
            </ThemedView>

            <ThemedView type="backgroundElement" style={styles.statCard}>
              <ThemedText type="subtitle" style={styles.statValue}>
                {openSessionCount}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Sesi dibuka
              </ThemedText>
            </ThemedView>

            <ThemedView type="backgroundElement" style={styles.statCard}>
              <ThemedText type="subtitle" style={styles.statValue}>
                {attendanceCount}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Kehadiran saya
              </ThemedText>
            </ThemedView>
          </View>

          {schedules.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText type="smallBold">Belum ada jadwal</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Jadwal praktikum akan muncul di sini setelah data dummy
                ditambahkan.
              </ThemedText>
            </ThemedView>
          ) : (
            <View style={styles.list}>
              {schedules.map((schedule) => {
                const session = getSessionsForSchedule(schedule.id)[0];

                return (
                  <ThemedView
                    key={schedule.id}
                    type="backgroundElement"
                    style={styles.card}>
                    <View style={styles.cardHeader}>
                      <ThemedText type="smallBold">
                        {schedule.praktikum}
                      </ThemedText>
                      <SessionStatusBadge
                        status={session?.status ?? 'scheduled'}
                      />
                    </View>

                    <ThemedText type="small" themeColor="textSecondary">
                      {schedule.kelas} · {schedule.ruang}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDate(schedule.date)} · {schedule.startTime}-
                      {schedule.endTime}
                    </ThemedText>
                  </ThemedView>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 96,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
  statValue: {
    fontSize: 28,
    lineHeight: 32,
  },
  list: {
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  empty: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
