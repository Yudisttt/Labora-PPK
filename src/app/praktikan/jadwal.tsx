import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardCapsule, DashboardTabs } from '@/components/dashboard-ui';
import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import { subscribeToPermissionRequestsForUser } from '@/services/permission-requests';
import type { AttendanceRecord, PermissionRequest, Schedule, Session } from '@/types';
import { formatDate, formatDateTime } from '@/utils/format';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const CALENDAR_PAGE_SIZE = 30;
const CALENDAR_INITIAL_INDEX = CALENDAR_PAGE_SIZE;
const CALENDAR_ITEM_WIDTH = 66;

function getCalendarDays(startDate: Date, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
    const day = DAY_NAMES[date.getDay()];
    return { day, shortDay: day.slice(0, 3), dateNumber: date.getDate(), date };
  });
}

function getTimePeriod(time: string): 'Pagi' | 'Siang' | 'Sore' {
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return 'Pagi';
  if (hour < 15) return 'Siang';
  return 'Sore';
}

function getDayName(date: string) {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '';
  return DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function getHistoryStatus(
  record: AttendanceRecord | undefined,
  session: Session,
  requests: PermissionRequest[],
  sessionDate: string,
  todayDateKey: string,
): 'Hadir' | 'Izin' | 'Sakit' | 'Alpha' | null {
  if (record?.status === 'present') return 'Hadir';
  if (record?.status === 'absent') return 'Alpha';
  if (record?.status === 'excused') {
    if (record.manualReason) return record.manualReason === 'sakit' ? 'Sakit' : 'Izin';
    const reason = record.permissionRequestId
      ? requests.find((request) => request.id === record.permissionRequestId)?.reason ?? ''
      : '';
    return /sakit|dokter|medis/i.test(reason) ? 'Sakit' : 'Izin';
  }
  return session.status === 'closed' || sessionDate.slice(0, 10) < todayDateKey ? 'Alpha' : null;
}

type WeeklySchedule = {
  key: string;
  praktikum: string;
  kelas: string;
  ruang: string;
  startTime: string;
  endTime: string;
  days: Set<string>;
  entries: Schedule[];
};

type DashboardFilter = 'alpha' | null;

function groupWeeklySchedules(schedules: Schedule[]) {
  const groups = new Map<string, WeeklySchedule>();
  for (const schedule of schedules) {
    const key = [schedule.praktikum, schedule.kelas, schedule.ruang, schedule.startTime, schedule.endTime].join('|');
    const group = groups.get(key) ?? {
      key,
      praktikum: schedule.praktikum,
      kelas: schedule.kelas,
      ruang: schedule.ruang,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      days: new Set<string>(),
      entries: [],
    };
    const dayName = getDayName(schedule.date);
    if (dayName) group.days.add(dayName);
    group.entries.push(schedule);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    const firstDayA = a.days.values().next().value;
    const firstDayB = b.days.values().next().value;
    return DAY_NAMES.indexOf(firstDayA ?? '') - DAY_NAMES.indexOf(firstDayB ?? '') ||
      a.startTime.localeCompare(b.startTime);
  });
}

export default function PraktikanJadwalScreen() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser, schedules, sessions, getAttendanceForUser, getUser } = useApp();
  const [activeTab, setActiveTab] = useState<'jadwal' | 'riwayat'>('jadwal');
  const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>(null);
  const currentFilter: DashboardFilter = view === 'alpha' ? 'alpha' : dashboardFilter;
  const currentTab = view === 'alpha' ? 'riwayat' : activeTab;
  const [expandedPracticum, setExpandedPracticum] = useState<string | null>(null);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequest[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [calendarStartDate, setCalendarStartDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - CALENDAR_INITIAL_INDEX);
  });
  const [calendarDayCount, setCalendarDayCount] = useState(CALENDAR_PAGE_SIZE * 2 + 1);
  const calendarRef = useRef<ScrollViewInstance>(null);
  const scrollOffset = useRef(0);
  const scrollCorrection = useRef<number | null>(null);
  const didSetInitialScroll = useRef(false);
  const updatingCalendar = useRef(false);
  const calendarDays = getCalendarDays(calendarStartDate, calendarDayCount);
  const selectedDay = DAY_NAMES[selectedDate.getDay()];
  const selectedDateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const todayDateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const weeklySchedules = groupWeeklySchedules(schedules);
  const openSessionCount = sessions.filter((session) => session.status === 'open').length;
  const myAttendance = currentUser ? getAttendanceForUser(currentUser.id) : [];
  const practicumSchedules = schedules.filter((schedule) =>
    schedule.status !== 'cancelled' && !schedule.replacementScheduleId,
  );
  const allPracticumMeetings = practicumSchedules.map((schedule) => {
    const session = sessions.find((item) => item.scheduleId === schedule.id) ?? {
      id: `session_${schedule.id}`,
      scheduleId: schedule.id,
      status: 'scheduled' as const,
      openedAt: null,
      closedAt: null,
    };
    const record = myAttendance.find((item) => item.sessionId === session.id);
    return { schedule, session, record };
  }).sort((a, b) => `${a.schedule.date}${a.schedule.startTime}`.localeCompare(`${b.schedule.date}${b.schedule.startTime}`));
  const meetingHistory = allPracticumMeetings
    .filter(({ schedule }) => schedule.date.slice(0, 10) <= todayDateKey)
    .sort((a, b) => `${a.schedule.date}${a.schedule.startTime}`.localeCompare(`${b.schedule.date}${b.schedule.startTime}`));
  const historyGroups = new Map<string, { schedules: Schedule[]; meetings: typeof meetingHistory }>();
  allPracticumMeetings.forEach((meeting) => {
    const group = historyGroups.get(meeting.schedule.praktikum) ?? { schedules: [], meetings: [] };
    group.schedules.push(meeting.schedule);
    if (meeting.schedule.date.slice(0, 10) <= todayDateKey) group.meetings.push(meeting);
    historyGroups.set(meeting.schedule.praktikum, group);
  });
  const historyByPracticum = [...historyGroups.entries()].map(([praktikum, group]) => ({ praktikum, ...group }));
  const alphaCount = meetingHistory.filter(({ schedule, session, record }) =>
    getHistoryStatus(record, session, permissionRequests, schedule.date, todayDateKey) === 'Alpha',
  ).length;
  const visibleHistoryGroups = historyByPracticum
    .map(({ praktikum, schedules: practicumEntries, meetings }) => ({
      praktikum,
      schedules: practicumEntries,
      meetings: currentFilter === 'alpha'
        ? meetings.filter(({ schedule, session, record }) =>
            getHistoryStatus(record, session, permissionRequests, schedule.date, todayDateKey) === 'Alpha',
          )
        : meetings,
    }))
    .filter(({ meetings }) => currentFilter !== 'alpha' || meetings.length > 0);
  const availableSchedules = weeklySchedules.filter((schedule) =>
    schedule.days.has(selectedDay),
  );
  const periods = (['Pagi', 'Siang', 'Sore'] as const).map((period) => ({
    period,
    schedules: availableSchedules.filter((schedule) => getTimePeriod(schedule.startTime) === period),
  })).filter((group) => group.schedules.length > 0);

  useEffect(() => {
    if (!currentUser) return;
    return subscribeToPermissionRequestsForUser(
      currentUser.id,
      setPermissionRequests,
      () => setPermissionRequests([]),
    );
  }, [currentUser]);

  useEffect(() => {
    if (scrollCorrection.current !== null) {
      const correctedOffset = Math.max(0, scrollOffset.current + scrollCorrection.current);
      scrollOffset.current = correctedOffset;
      calendarRef.current?.scrollTo({ x: correctedOffset, animated: false });
      scrollCorrection.current = null;
      updatingCalendar.current = false;
    }
  }, [calendarStartDate, calendarDayCount]);

  function handleCalendarScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollOffset.current = contentOffset.x;
    if (updatingCalendar.current) return;

    if (contentOffset.x < 160) {
      updatingCalendar.current = true;
      scrollCorrection.current = CALENDAR_PAGE_SIZE * CALENDAR_ITEM_WIDTH;
      setCalendarStartDate((start) => new Date(start.getFullYear(), start.getMonth(), start.getDate() - CALENDAR_PAGE_SIZE));
      setCalendarDayCount((count) => count + CALENDAR_PAGE_SIZE);
    } else if (contentSize.width - (contentOffset.x + layoutMeasurement.width) < 160) {
      updatingCalendar.current = true;
      scrollCorrection.current = 0;
      setCalendarDayCount((count) => count + CALENDAR_PAGE_SIZE);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 128 }]}>
          <DashboardCapsule
            title="Jadwal & Presensi"
            subtitle="Pantau kehadiran dan sesi aktifmu hari ini"
            stats={[
              { label: 'Semua Jadwal', value: schedules.length, active: currentTab === 'jadwal' && currentFilter !== 'alpha', onPress: () => { router.setParams({ view: undefined }); setDashboardFilter(null); setActiveTab('jadwal'); } },
              { label: 'Sesi Dibuka', value: openSessionCount, active: false, onPress: () => router.navigate('/praktikan/presensi') },
              { label: 'Absensi', value: alphaCount, active: currentFilter === 'alpha', onPress: () => router.setParams({ view: 'alpha' }) },
            ]}
          />

          {currentFilter !== 'alpha' ? <ScrollView
            ref={calendarRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.daySelector}
            scrollEventThrottle={16}
            onScroll={handleCalendarScroll}
            onContentSizeChange={() => {
              if (!didSetInitialScroll.current) {
                const initialOffset = CALENDAR_INITIAL_INDEX * CALENDAR_ITEM_WIDTH;
                calendarRef.current?.scrollTo({ x: initialOffset, animated: false });
                scrollOffset.current = initialOffset;
                didSetInitialScroll.current = true;
              }
            }}>
            {calendarDays.map(({ shortDay, dateNumber, date }) => {
              const selected = selectedDate.toDateString() === date.toDateString();
              const monthLabel = date.toLocaleDateString('id-ID', { month: 'short' }).replace(/\./g, '');
              return (
                <Pressable
                  key={date.toISOString()}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedDate(date)}
                  style={[styles.dayChip, selected && styles.dayChipSelected, {
                    backgroundColor: selected ? theme.primary : 'rgba(255, 255, 255, 0.14)',
                    borderColor: selected ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.52)',
                    ...(Platform.OS === 'web' && !selected ? ({ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } as object) : {}),
                  }]}>
                  <ThemedText type="smallBold" style={{ color: selected ? theme.primaryText : theme.primary }}>{shortDay}</ThemedText>
                  <ThemedText type="smallBold" style={{ color: selected ? theme.primaryText : theme.primary }}>{dateNumber}</ThemedText>
                  <ThemedText type="small" style={{ color: selected ? theme.primaryText : theme.primary, fontSize: 9, lineHeight: 11 }}>{monthLabel}</ThemedText>
                </Pressable>
              );
            })}
          </ScrollView> : null}

          <DashboardTabs
            tabs={[
              { key: 'jadwal', label: 'Jadwal Praktikum', active: currentTab === 'jadwal', onPress: () => { router.setParams({ view: undefined }); setDashboardFilter(null); setActiveTab('jadwal'); } },
              { key: 'riwayat', label: 'Riwayat Presensi', active: currentTab === 'riwayat', onPress: () => { router.setParams({ view: undefined }); setDashboardFilter(null); setActiveTab('riwayat'); } },
            ]}
          />

          {currentTab === 'riwayat' ? (
            <View style={styles.historyList}>
              {visibleHistoryGroups.length === 0 ? (
                <ThemedView type="backgroundElement" style={styles.empty}>
                  <ThemedText type="smallBold">{currentFilter === 'alpha' ? 'Tidak ada absensi alpha' : 'Belum ada riwayat presensi'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{currentFilter === 'alpha' ? 'Sesi berstatus alpha akan muncul di sini.' : 'Riwayat pertemuan akan muncul setelah tanggal sesinya tiba.'}</ThemedText>
                </ThemedView>
              ) : visibleHistoryGroups.map(({ praktikum, schedules: practicumEntries, meetings }) => {
                const expanded = expandedPracticum === praktikum;
                const presentCount = meetings.filter(({ record, session, schedule }) => getHistoryStatus(record, session, permissionRequests, schedule.date, todayDateKey) === 'Hadir').length;
                const excusedCount = meetings.filter(({ record, session, schedule }) => getHistoryStatus(record, session, permissionRequests, schedule.date, todayDateKey) === 'Izin').length;
                const sickCount = meetings.filter(({ record, session, schedule }) => getHistoryStatus(record, session, permissionRequests, schedule.date, todayDateKey) === 'Sakit').length;
                const absentCount = meetings.filter(({ record, session, schedule }) => getHistoryStatus(record, session, permissionRequests, schedule.date, todayDateKey) === 'Alpha').length;
                const classes = [...new Set(practicumEntries.map((schedule) => schedule.kelas))].join(', ');
                const laboratories = [...new Set(practicumEntries.map((schedule) => schedule.ruang))].join(', ');

                return (
                  <BlurView key={praktikum} intensity={68} tint="light" style={[styles.historyCard, { backgroundColor: 'rgba(255,255,255,0.54)', borderColor: expanded ? '#FFFFFF' : 'rgba(255,255,255,0.96)' }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => setExpandedPracticum(expanded ? null : praktikum)}
                      style={styles.historyToggle}>
                      <View style={styles.historyTitleBlock}>
                        <ThemedText type="smallBold">{praktikum}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">{classes}{laboratories ? ` · ${laboratories}` : ''}</ThemedText>
                      </View>
                      <ThemedText type="smallBold" themeColor="textSecondary">{expanded ? '⌃' : '⌄'}</ThemedText>
                    </Pressable>
                    <View style={styles.historySummary}>
                      <ThemedText type="small" style={{ color: theme.success }}>{presentCount} hadir</ThemedText>
                      <ThemedText type="small" style={{ color: theme.warning }}>{excusedCount} izin</ThemedText>
                      {sickCount > 0 ? <ThemedText type="small" style={{ color: theme.warning }}>{sickCount} sakit</ThemedText> : null}
                      <ThemedText type="small" style={{ color: theme.danger }}>{absentCount} alpha</ThemedText>
                    </View>
                    {expanded ? (
                      <View style={styles.meetingList}>
                        {meetings.length === 0 ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            Pertemuan akan muncul setelah tanggal pelaksanaannya tiba.
                          </ThemedText>
                        ) : meetings.map(({ schedule, session, record }, index) => {
                          const matchingSeries = meetings.filter((meeting) => schedule.seriesId
                            ? meeting.schedule.seriesId === schedule.seriesId
                            : meeting.schedule.kelas === schedule.kelas &&
                              meeting.schedule.ruang === schedule.ruang &&
                              meeting.schedule.startTime === schedule.startTime &&
                              meeting.schedule.endTime === schedule.endTime &&
                              getDayName(meeting.schedule.date) === getDayName(schedule.date));
                          const inferredMeetingNumber = matchingSeries.findIndex((meeting) => meeting.schedule.id === schedule.id) + 1;
                          const meetingNumber = inferredMeetingNumber || schedule.seriesIndex || index + 1;
                          const status = getHistoryStatus(record, session, permissionRequests, schedule.date, todayDateKey);
                          const statusColor = status === 'Hadir'
                            ? theme.success
                            : status === 'Izin' || status === 'Sakit'
                              ? theme.warning
                              : status === 'Alpha'
                                ? theme.danger
                                : theme.textSecondary;
                          const permissionReason = record?.permissionRequestId
                            ? permissionRequests.find((request) => request.id === record.permissionRequestId)?.reason
                            : null;

                          return (
                            <View key={session.id} style={[styles.meetingRow, { borderTopColor: theme.glassBorder }]}>
                              <View style={styles.meetingInfo}>
                                <ThemedText type="smallBold">Pertemuan {meetingNumber}</ThemedText>
                                <ThemedText type="small" themeColor="textSecondary">
                                  {formatDate(schedule.date)} · {schedule.startTime}–{schedule.endTime}
                                </ThemedText>
                              {status === 'Izin' || status === 'Sakit' ? (
                                <ThemedText type="small" themeColor="textSecondary">
                                  {permissionReason ? `Alasan: ${permissionReason}` : 'Izin disetujui'}
                                </ThemedText>
                              ) : null}
                                {record?.checkedInAt && record.status === 'present' ? (
                                  <ThemedText type="small" themeColor="textSecondary">Presensi {formatDateTime(record.checkedInAt)}</ThemedText>
                                ) : null}
                              </View>
                              {status ? <ThemedText type="smallBold" style={{ color: statusColor }}>{status}</ThemedText> : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </BlurView>
                );
              })}
            </View>
          ) : weeklySchedules.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText type="smallBold">Belum ada jadwal praktikum</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Jadwal hari, waktu, dan laboratorium akan tampil di sini.</ThemedText>
            </ThemedView>
          ) : periods.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText type="smallBold">Tidak ada jadwal di waktu ini</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Pilih hari atau rentang waktu yang lain.</ThemedText>
            </ThemedView>
          ) : periods.map(({ period, schedules: periodSchedules }) => (
            <View key={period} style={styles.agendaGroup}>
              <View style={styles.groupHeading}>
                <View style={[styles.periodDot, { backgroundColor: theme.primary }]} />
                <ThemedText type="smallBold">{period}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">· {formatDate(selectedDateKey)}</ThemedText>
              </View>
              {periodSchedules.map((schedule) => (
                <View key={schedule.key} style={styles.agendaRow}>
                  <View style={styles.timeRail}>
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>{schedule.startTime}</ThemedText>
                    <View style={[styles.timeline, { backgroundColor: theme.border }]} />
                    <ThemedText type="small" themeColor="textSecondary">{schedule.endTime}</ThemedText>
                  </View>
                  <View
                    style={[
                      styles.eventCard,
                      {
                        backgroundColor: theme.glassCard,
                        borderColor: 'rgba(255, 255, 255, 0.82)',
                      },
                    ]}>
                    <ThemedText type="smallBold" style={styles.course}>{schedule.praktikum}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{schedule.kelas}</ThemedText>
                    <View style={styles.eventFooter}>
                      <ThemedText type="smallBold" style={{ color: theme.primary }}>⌖  {schedule.ruang}</ThemedText>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        const entry = schedule.entries.find((item) => getDayName(item.date) === selectedDay) ?? schedule.entries[0];
                        if (entry) setSelectedSchedule(entry);
                      }}
                      style={({ pressed }) => [styles.detailButton, { borderColor: theme.glassBorderHighlight, backgroundColor: 'rgba(255,255,255,0.5)' }, pressed && styles.pressed]}>
                      <ThemedText type="smallBold" style={{ color: theme.primary }}>Detail Sesi</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
        <Modal visible={selectedSchedule !== null} transparent animationType="slide" onRequestClose={() => setSelectedSchedule(null)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Tutup detail sesi" onPress={() => setSelectedSchedule(null)} />
            {selectedSchedule ? (() => {
              const session = sessions.find((item) => item.scheduleId === selectedSchedule.id);
              const assistant = getUser(selectedSchedule.assistantId);
              const sessionStatus = session?.status ?? 'scheduled';
              return (
                <ThemedView type="backgroundElement" style={[styles.detailSheet, { borderColor: theme.glassBorderHighlight, paddingBottom: insets.bottom + Spacing.three }]}>
                  <View style={styles.sheetHandle} />
                  <View style={styles.detailHeader}>
                    <View style={styles.historyTitleBlock}>
                      <ThemedText type="title">Detail Sesi</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">Informasi jadwal praktikum</ThemedText>
                    </View>
                    <SessionStatusBadge status={sessionStatus} />
                  </View>
                  <ThemedText type="subtitle">{selectedSchedule.praktikum}</ThemedText>
                  <View style={styles.detailInfo}>
                    {selectedSchedule.seriesIndex ? <DetailRow label="Pertemuan" value={`Pertemuan ${selectedSchedule.seriesIndex}${selectedSchedule.seriesCount ? ` dari ${selectedSchedule.seriesCount}` : ''}`} /> : null}
                    <DetailRow label="Kelas" value={selectedSchedule.kelas} />
                    <DetailRow label="Laboratorium" value={selectedSchedule.ruang} />
                    <DetailRow label="Tanggal" value={formatDate(selectedSchedule.date)} />
                    <DetailRow label="Waktu Praktikum" value={`${selectedSchedule.startTime} – ${selectedSchedule.endTime} WIB`} />
                    <DetailRow label="Asisten Laboratorium" value={assistant?.name ?? '-'} />
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {sessionStatus === 'open'
                      ? 'Sesi sedang dibuka. Presensi tersedia melalui pemindaian QR.'
                      : sessionStatus === 'closed'
                        ? 'Sesi telah ditutup.'
                        : 'Sesi belum dibuka oleh asisten.'}
                  </ThemedText>
                  <Pressable onPress={() => setSelectedSchedule(null)} style={[styles.closeButton, { backgroundColor: theme.primary }]}>
                    <ThemedText type="smallBold" style={{ color: theme.primaryText }}>Tutup</ThemedText>
                  </Pressable>
                </ThemedView>
              );
            })() : null}
          </View>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.three },
  daySelector: { gap: Spacing.two, paddingVertical: Spacing.one },
  dayChip: { width: 58, alignItems: 'center', gap: Spacing.half, paddingHorizontal: Spacing.one, paddingVertical: Spacing.two, borderWidth: 1, borderRadius: 19, overflow: 'hidden' },
  dayChipSelected: { shadowColor: '#354024', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  agendaGroup: { gap: Spacing.two },
  historyList: { gap: Spacing.three },
  historyCard: { padding: Spacing.three, borderWidth: 1, borderRadius: 23, gap: Spacing.one, overflow: 'hidden', shadowColor: '#FFFFFF', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 14, elevation: 3 },
  historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, minHeight: 40 },
  historyTitleBlock: { flex: 1, gap: Spacing.half },
  historySummary: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  meetingList: { gap: Spacing.two },
  meetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, borderTopWidth: 1, paddingTop: Spacing.two },
  meetingInfo: { flex: 1, gap: Spacing.half },
  groupHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  periodDot: { width: 9, height: 9, borderRadius: 5 },
  agendaRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two },
  timeRail: { width: 52, alignItems: 'center', paddingTop: Spacing.two, gap: Spacing.one },
  timeline: { flex: 1, width: 1, minHeight: 22, opacity: 0.55 },
  eventCard: { flex: 1, padding: Spacing.three, borderWidth: 1, borderRadius: 23, gap: Spacing.one, overflow: 'hidden', shadowColor: '#354024', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  course: { flexShrink: 1 },
  eventFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  detailButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, marginTop: Spacing.one },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24, 26, 20, 0.42)' },
  detailSheet: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, gap: Spacing.two },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: 'rgba(80,80,70,0.3)', marginBottom: Spacing.one },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  detailInfo: { gap: Spacing.one, paddingVertical: Spacing.one },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.one },
  detailLabel: { flex: 1 },
  detailValue: { flex: 1, textAlign: 'right' },
  closeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 16, marginTop: Spacing.one },
  empty: { padding: Spacing.four, borderRadius: 24, gap: Spacing.two },
  pressed: { opacity: 0.8 },
});

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.detailRow, { borderBottomColor: theme.glassBorder }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.detailLabel}>{label}</ThemedText>
      <ThemedText type="smallBold" style={styles.detailValue}>{value}</ThemedText>
    </View>
  );
}
