import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardCapsule } from '@/components/dashboard-ui';
import { PaginatedCards } from '@/components/paginated-cards';
import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import type { Schedule } from '@/types';

const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function scheduleDateKey(date: string) {
  return date.slice(0, 10);
}

export default function KelolaJadwalScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { schedules, getSessionsForSchedule, getUser } = useApp();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const calendarCells = useMemo(() => {
    const firstDay = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1,
    );
    const gridStart = new Date(
      firstDay.getFullYear(),
      firstDay.getMonth(),
      1 - firstDay.getDay(),
    );

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index,
      );
      const key = toDateKey(date);
      return {
        date,
        key,
        inMonth: date.getMonth() === calendarMonth.getMonth(),
        hasSchedule: schedules.some(
          (schedule) => scheduleDateKey(schedule.date) === key,
        ),
      };
    });
  }, [calendarMonth, schedules]);

  const todayKey = toDateKey(new Date());
  const monthLabel = calendarMonth.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
  const selectedSchedules = useMemo(
    () =>
      selectedDate
        ? schedules
            .filter((schedule) => scheduleDateKey(schedule.date) === selectedDate)
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
        : [],
    [schedules, selectedDate],
  );

  function changeMonth(offset: number) {
    setCalendarMonth(
      (month) => new Date(month.getFullYear(), month.getMonth() + offset, 1),
    );
  }

  function selectCalendarDate(key: string, date: Date, inMonth: boolean) {
    setSelectedDate(key);
    if (!inMonth) {
      setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 110 },
          ]}>
          <DashboardCapsule
            title="Kelola Jadwal"
            subtitle="Pilih tanggal untuk melihat jadwal praktikum"
            showGreeting={false}
            stats={[]}
            backAction={{
              label: 'Kembali',
              onPress: () => router.canGoBack() ? router.back() : router.replace('/asisten/jadwal'),
            }}
          />

          <View
            style={[
              styles.calendarCard,
              {
                backgroundColor: theme.glassCard,
                borderColor: theme.glassBorder,
              },
            ]}>
            <View style={styles.calendarHeader}>
              <View style={styles.calendarHeading}>
                <ThemedText type="smallBold">Kalender Praktikum</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Titik hijau menandai tanggal yang memiliki jadwal
                </ThemedText>
              </View>
              <View style={styles.monthControls}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Bulan sebelumnya"
                  onPress={() => changeMonth(-1)}
                  style={styles.monthButton}>
                  <Ionicons name="chevron-back" size={17} color={theme.primary} />
                </Pressable>
                <ThemedText type="smallBold" style={styles.monthLabel}>
                  {monthLabel}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Bulan berikutnya"
                  onPress={() => changeMonth(1)}
                  style={styles.monthButton}>
                  <Ionicons name="chevron-forward" size={17} color={theme.primary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.calendarGrid}>
              {WEEKDAYS.map((day) => (
                <View key={day} style={styles.calendarCell}>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.weekdayLabel}>
                    {day}
                  </ThemedText>
                </View>
              ))}
              {calendarCells.map(({ date, key, inMonth, hasSchedule }) => {
                const isSelected = selectedDate === key;
                const isToday = todayKey === key;

                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`${date.getDate()} ${date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}${hasSchedule ? ', ada jadwal' : ''}`}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => selectCalendarDate(key, date, inMonth)}
                    style={({ pressed }) => [
                      styles.calendarDay,
                      isSelected && { backgroundColor: theme.primary },
                      isToday &&
                        !isSelected && {
                          borderColor: theme.moss,
                          borderWidth: 1,
                        },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText
                      type={isSelected ? 'smallBold' : 'small'}
                      style={{
                        color: isSelected
                          ? theme.primaryText
                          : inMonth
                            ? theme.text
                            : theme.textSecondary,
                        opacity: inMonth ? 1 : 0.42,
                      }}>
                      {date.getDate()}
                    </ThemedText>
                    <View
                      style={[
                        styles.calendarDot,
                        {
                          backgroundColor: hasSchedule
                            ? theme.moss
                            : 'transparent',
                        },
                        isSelected &&
                          hasSchedule && {
                            backgroundColor: theme.primaryText,
                          },
                      ]}
                    />
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.calendarFooter}>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedDate
                  ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
                      'id-ID',
                      { day: 'numeric', month: 'long', year: 'numeric' },
                    )
                  : 'Pilih tanggal untuk melihat sesi praktikum'}
              </ThemedText>
              {selectedDate ? (
                <Pressable onPress={() => setSelectedDate(null)}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    Hapus pilihan
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.scheduleSection}>
            <View style={styles.sectionHeading}>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                {selectedDate ? 'Jadwal pada tanggal ini' : 'Jadwal Praktikum'}
              </ThemedText>
              {selectedDate ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {selectedSchedules.length} sesi
                </ThemedText>
              ) : null}
            </View>

            {!selectedDate ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: theme.glassCard,
                    borderColor: theme.glassBorder,
                  },
                ]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Ketuk salah satu tanggal di kalender untuk menampilkan jadwal.
                </ThemedText>
              </View>
            ) : selectedSchedules.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: theme.glassCard,
                    borderColor: theme.glassBorder,
                  },
                ]}>
                <ThemedText type="smallBold">Belum ada jadwal</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Tidak ada praktikum pada tanggal yang dipilih.
                </ThemedText>
              </View>
            ) : (
              <PaginatedCards
                items={selectedSchedules}
                keyExtractor={(schedule) => schedule.id}
                renderItem={(schedule) => (
                  <ScheduleDateCard
                    schedule={schedule}
                    getUser={getUser}
                    getSessionsForSchedule={getSessionsForSchedule}
                  />
                )}
              />
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ScheduleDateCard({
  schedule,
  getUser,
  getSessionsForSchedule,
}: {
  schedule: Schedule;
  getUser: ReturnType<typeof useApp>['getUser'];
  getSessionsForSchedule: ReturnType<typeof useApp>['getSessionsForSchedule'];
}) {
  const theme = useTheme();
  const session = getSessionsForSchedule(schedule.id)[0];
  const assistant = getUser(schedule.assistantId);

  return (
    <View
      style={[
        styles.scheduleCard,
        {
          backgroundColor: theme.glassCard,
          borderColor: theme.glassBorder,
        },
      ]}>
      <View style={styles.scheduleHeader}>
        <View style={{ flex: 1, gap: Spacing.half }}>
          <ThemedText type="smallBold" style={styles.scheduleTitle}>
            {schedule.praktikum}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {schedule.kelas} · {schedule.ruang}
          </ThemedText>
        </View>
        <SessionStatusBadge status={session?.status ?? 'scheduled'} />
      </View>

      <View style={styles.scheduleDetails}>
        <View style={styles.detailItem}>
          <ThemedText type="small" themeColor="textSecondary">
            Waktu
          </ThemedText>
          <ThemedText type="smallBold">
            {schedule.startTime}–{schedule.endTime}
          </ThemedText>
        </View>
        <View style={styles.detailDivider} />
        <View style={styles.detailItem}>
          <ThemedText type="small" themeColor="textSecondary">
            Asisten
          </ThemedText>
          <ThemedText type="smallBold" numberOfLines={1}>
            {assistant?.name ?? '—'}
          </ThemedText>
        </View>
      </View>
    </View>
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
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
  },
  backButton: {
    alignSelf: 'center',
    minWidth: 136,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
  },
  calendarCard: {
    padding: Spacing.three,
    borderWidth: 1.5,
    borderRadius: 26,
    gap: Spacing.two,
    shadowColor: '#4C3D19',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  calendarHeader: {
    gap: Spacing.two,
  },
  calendarHeading: {
    gap: 2,
  },
  monthControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  monthButton: {
    width: 38,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F7F1E7',
  },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.2857%',
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayLabel: {
    fontSize: 10,
    fontFamily: Fonts.medium,
  },
  calendarDay: {
    width: '14.2857%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  calendarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
  calendarFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  scheduleSection: {
    gap: Spacing.two,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
  },
  scheduleCard: {
    borderWidth: 1.5,
    borderRadius: 24,
    padding: Spacing.three,
    gap: Spacing.three,
    shadowColor: '#4C3D19',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  scheduleTitle: {
    fontSize: 16,
  },
  scheduleDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderRadius: 16,
    backgroundColor: '#F7F1E7',
  },
  detailItem: {
    flex: 1,
    gap: 2,
  },
  detailDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#C8B995',
    marginHorizontal: Spacing.two,
  },
  pressed: {
    opacity: 0.75,
  },
});
