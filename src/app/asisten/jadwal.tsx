import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { createSession } from '@/services/sessions';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { SessionStatusBadge } from '@/components/session-status-badge';
import { DashboardCapsule } from '@/components/dashboard-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import type {
  AttendanceRecord,
  Schedule,
  Session,
  SessionStatus,
  User,
} from '@/types';
import {
  formatDate,
  formatDateTimeWithSeconds,
  formatTimeWithSeconds,
} from '@/utils/format';
import {
  getPracticumWindowState,
  getSessionButtonLabel,
} from '@/utils/practicum-window';

type TabMode = 'jadwal' | 'rekap';
type StatusFilter = 'all' | SessionStatus;

type ConfirmActionState = {
  type: 'open' | 'close' | 'reopen';
  session: Session;
  schedule: Schedule;
} | null;

export default function AsistenJadwalScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const {
    users,
    schedules,
    attendance,
    openSession,
    closeSession,
    getUser,
    getSessionsForSchedule,
  } = useApp();

  // Navigation & Filter States
  const [activeTab, setActiveTab] = useState<TabMode>('jadwal');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Detail States
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(
    null,
  );

  // Global Rekap Tab States
  const [rekapSelectedScheduleId, setRekapSelectedScheduleId] =
    useState<string>('all');
  const [rekapSearchPraktikan, setRekapSearchPraktikan] = useState('');
  const [rekapSearchQuery, setRekapSearchQuery] = useState('');
  const [rekapFilterOpen, setRekapFilterOpen] = useState(false);
  const [expandedRekapScheduleId, setExpandedRekapScheduleId] =
    useState<string | null>(null);

  // Confirmation & Feedback States
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [reportModalText, setReportModalText] = useState<string | null>(null);

  // List of all registered practitioners
  const praktikanUsers = useMemo(
    () => users.filter((u) => u.role === 'praktikan'),
    [users],
  );

  // Quick Stats
  const openSessionsCount = schedules.filter(
    (schedule) => getSessionsForSchedule(schedule.id)[0]?.status === 'open',
  ).length;
  const closedSessionsCount = schedules.filter(
    (schedule) => getSessionsForSchedule(schedule.id)[0]?.status === 'closed',
  ).length;
  const scheduledSessionsCount =
    schedules.length - openSessionsCount - closedSessionsCount;
  function showToast(message: string) {
    setFeedbackToast(message);
    setTimeout(() => {
      setFeedbackToast(null);
    }, 3500);
  }

  function getSessionActionError(error: unknown, action: string) {
    const code =
      error instanceof Error && 'code' in error
        ? String(error.code)
        : '';

    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      return 'Firebase menolak akses. Publikasikan aturan dari firestore.rules di Firebase Console, lalu coba lagi.';
    }

    if (code === 'not-found') {
      return 'Dokumen sesi belum ada. Tekan “Buat Sesi” terlebih dahulu.';
    }

    return error instanceof Error
      ? `${action}: ${error.message}`
      : `${action}. Periksa koneksi lalu coba lagi.`;
  }

  // Filter schedules based on status, assistant, and search query
  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      const session = getSessionsForSchedule(schedule.id)[0];

      if (
        statusFilter !== 'all' &&
        (session?.status ?? 'scheduled') !== statusFilter
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesPraktikum = schedule.praktikum
          .toLowerCase()
          .includes(query);
        const matchesKelas = schedule.kelas.toLowerCase().includes(query);
        const matchesRuang = schedule.ruang.toLowerCase().includes(query);
        if (!matchesPraktikum && !matchesKelas && !matchesRuang) {
          return false;
        }
      }

      return true;
    });
  }, [
    getSessionsForSchedule,
    schedules,
    searchQuery,
    statusFilter,
  ]);

  // Session action handlers
  function handleOpenSession(session: Session, schedule: Schedule) {
    // Tutup modal detail agar hanya satu modal yang tampil
    setSelectedSchedule(null);
    setConfirmAction({
      type: session.status === 'closed' ? 'reopen' : 'open',
      session,
      schedule,
    });
  }

  function handleCloseSession(session: Session, schedule: Schedule) {
    // Tutup modal detail 
    setSelectedSchedule(null);
    setConfirmAction({
      type: 'close',
      session,
      schedule,
    });
  }

  async function handleCreateSession(scheduleId: string) {
    try {
      await createSession(scheduleId);
      showToast(
        'Sesi berhasil dibuat. Tekan "Buka Sesi Presensi" untuk memulai presensi.',
      );
    } catch (error) {
      showToast(getSessionActionError(error, 'Gagal membuat sesi'));
    }
  }

  async function executeConfirmedAction() {
    if (!confirmAction) return;

    const { type, session, schedule } = confirmAction;

    try {
      if (type === 'open' || type === 'reopen') {
        await openSession(session.id);
        showToast(
          type === 'open'
            ? `Sesi ${schedule.praktikum} (${schedule.kelas}) berhasil dibuka! Praktikan kini dapat melakukan presensi.`
            : `Sesi ${schedule.praktikum} (${schedule.kelas}) berhasil dibuka kembali.`,
        );
      } else if (type === 'close') {
        await closeSession(session.id);
        showToast(
          `Sesi ${schedule.praktikum} (${schedule.kelas}) berhasil ditutup. Praktikan tidak dapat lagi presensi.`,
        );
      }
    } catch (error) {
      showToast(getSessionActionError(error, 'Gagal memperbarui sesi'));
    } finally {
      setConfirmAction(null);
    }
  }


  // Kelompokkan presensi per sesi 
  const attendanceBySessionId = useMemo(() => {
    const grouped = new Map<string, AttendanceRecord[]>();

    attendance.forEach((record) => {
      const existing = grouped.get(record.sessionId);

      if (existing) {
        existing.push(record);
      } else {
        grouped.set(record.sessionId, [record]);
      }
    });

    return grouped;
  }, [attendance]);

  // Build attendance data for a given session
  function getSessionAttendanceData(session: Session) {
    const sessionRecords = attendanceBySessionId.get(session.id) ?? [];

    const recordByUserId = new Map<string, AttendanceRecord>();

    sessionRecords.forEach((record) => {
      recordByUserId.set(record.userId, record);
    });

    const attendedUsers: { user: User; checkedInAt: string }[] = [];
    const excusedUsers: { user: User; excusedAt: string | null }[] = [];
    const absentUsers: User[] = [];

    praktikanUsers.forEach((praktikan) => {
      const record = recordByUserId.get(praktikan.id);
      if (record?.status === 'present' && record.checkedInAt) {
        attendedUsers.push({
          user: praktikan,
          checkedInAt: record.checkedInAt,
        });
      } else if (record?.status === 'excused') {
        excusedUsers.push({ user: praktikan, excusedAt: record.excusedAt });
      } else {
        absentUsers.push(praktikan);
      }
    });

    const totalStudents = praktikanUsers.length;
    const attendedCount = attendedUsers.length;
    const excusedCount = excusedUsers.length;
    const coveragePercent =
      totalStudents > 0
        ? Math.round(((attendedCount + excusedCount) / totalStudents) * 100)
        : 0;
    const percentage =
      totalStudents > 0
        ? Math.round((attendedCount / totalStudents) * 100)
        : 0;

    return {
      attendedUsers,
      excusedUsers,
      absentUsers,
      attendedCount,
      excusedCount,
      coveragePercent,
      totalStudents,
      percentage,
    };
  }

  // Generate structured report text for export/copy
  function generateReportText(schedule: Schedule, session: Session) {
    const {
      attendedUsers,
      excusedUsers,
      absentUsers,
      attendedCount,
      totalStudents,
      percentage,
    } = getSessionAttendanceData(session);

    const assistant = getUser(schedule.assistantId);
    const sessionStatusLabel =
      session.status === 'open'
        ? 'DIBUKA (Aktif)'
        : session.status === 'closed'
          ? 'DITUTUP (Selesai)'
          : 'TERJADWAL (Belum Dibuka)';

    const lines = [
      '========================================',
      '     REKAP PRESENSI PRAKTIKUM LABORA',
      '========================================',
      `Mata Praktikum : ${schedule.praktikum}`,
      `Kelas          : ${schedule.kelas}`,
      `Ruang          : ${schedule.ruang}`,
      `Tanggal        : ${formatDate(schedule.date)}`,
      `Waktu          : ${schedule.startTime} - ${schedule.endTime} WIB`,
      `Asisten Pengampu: ${assistant?.name ?? '-'}`,
      `Status Sesi    : ${sessionStatusLabel}`,
      session.openedAt
        ? `Waktu Dibuka   : ${formatDateTimeWithSeconds(session.openedAt)} WIB`
        : null,
      session.closedAt
        ? `Waktu Ditutup  : ${formatDateTimeWithSeconds(session.closedAt)} WIB`
        : null,
      '----------------------------------------',
      `RINGKASAN: ${attendedCount} hadir · ${excusedUsers.length} izin · ${absentUsers.length} belum hadir dari ${totalStudents} mahasiswa (${percentage}% hadir)`,
      '----------------------------------------',
      '',
      `DAFTAR HADIR (${attendedUsers.length}):`,
      attendedUsers.length === 0
        ? '  (Belum ada praktikan yang presensi)'
        : attendedUsers
            .map(
              (item, idx) =>
                `  ${idx + 1}. ${item.user.name} (${item.user.identityNumber}) - Hadir pukul ${formatTimeWithSeconds(item.checkedInAt)} WIB`,
            )
            .join('\n'),
      '',
      `DAFTAR IZIN DISETUJUI (${excusedUsers.length}):`,
      excusedUsers.length === 0
        ? '  (Belum ada izin yang disetujui)'
        : excusedUsers
            .map(
              (item, idx) =>
                `  ${idx + 1}. ${item.user.name} (${item.user.identityNumber})${item.excusedAt ? ` - Disetujui ${formatDateTimeWithSeconds(item.excusedAt)} WIB` : ''}`,
            )
            .join('\n'),
      '',
      `DAFTAR BELUM HADIR (${absentUsers.length}):`,
      absentUsers.length === 0
        ? '  (Semua praktikan telah hadir)'
        : absentUsers
            .map(
              (user, idx) =>
                `  ${idx + 1}. ${user.name} (${user.identityNumber})`,
            )
            .join('\n'),
      '',
      '========================================',
      `Dicetak pada: ${formatDateTimeWithSeconds(new Date().toISOString())} WIB`,
      '========================================',
    ];

    return lines.filter((l) => l !== null).join('\n');
  }

  function handleCopyReport(schedule: Schedule, session: Session) {
    const text = generateReportText(schedule, session);

    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard
    ) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          showToast('Rekap presensi berhasil disalin ke clipboard!');
        })
        .catch(() => {
          setReportModalText(text);
        });
    } else {
      setReportModalText(text);
      showToast('Teks rekap presensi siap dilihat/disalin');
    }
  }

  // Active session for modal
  const activeModalSession = selectedSchedule
    ? getSessionsForSchedule(selectedSchedule.id)[0]
    : null;

  const dashboardShortcuts: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }[] = [
    { label: 'Perizinan', icon: 'document-text-outline', onPress: () => router.push('/asisten/izin') },
    { label: 'Jadwal', icon: 'calendar-outline', onPress: () => router.push('/asisten/kelola-jadwal') },
    { label: 'Kelola Data', icon: 'albums-outline', onPress: () => router.push('/asisten/kelola-data') },
    { label: 'Peta', icon: 'map-outline', onPress: () => router.push('/asisten/peta') },
    { label: 'Presensi', icon: 'finger-print-outline', onPress: () => router.push('/asisten/presensi') },
    {
      label: 'Rekap Presensi',
      icon: 'stats-chart-outline',
      onPress: () => setActiveTab('rekap'),
    },
  ];

  const filterChipSurface = (selected: boolean) => ({
    backgroundColor: selected ? theme.primary : theme.glassGreenLight,
    backgroundImage: selected
      ? `linear-gradient(145deg, ${theme.moss} 0%, ${theme.primary} 100%)`
      : `linear-gradient(145deg, ${theme.glassCard} 0%, ${theme.glassGreenSheen} 38%, ${theme.glassGreenLight} 100%)`,
    borderColor: selected ? theme.glassBorderHighlight : theme.glassBorder,
  });

  const rekapSearchKey = rekapSearchPraktikan.trim().toLowerCase();
  const rekapMatchesSearch = (name: string, identityNumber: string) =>
    !rekapSearchKey ||
    name.toLowerCase().includes(rekapSearchKey) ||
    identityNumber.toLowerCase().includes(rekapSearchKey);

  const rekapQueryKey = rekapSearchQuery.trim().toLowerCase();
  const rekapMatchesQuery = (praktikum: string, ruang: string) =>
    !rekapQueryKey ||
    praktikum.toLowerCase().includes(rekapQueryKey) ||
    ruang.toLowerCase().includes(rekapQueryKey);

  const visibleRekapRows = schedules
    .filter((schedule) =>
      rekapSelectedScheduleId === 'all'
        ? true
        : schedule.id === rekapSelectedScheduleId,
    )
    .filter((schedule) =>
      rekapMatchesQuery(schedule.praktikum, schedule.ruang),
    )
    .flatMap((schedule) => {
      const session = getSessionsForSchedule(schedule.id)[0];
      if (!session) return [];

      const data = getSessionAttendanceData(session);

      return [
        {
          schedule,
          session,
          ...data,
          attended: data.attendedUsers.filter((item) =>
            rekapMatchesSearch(item.user.name, item.user.identityNumber),
          ),
          excused: data.excusedUsers.filter((item) =>
            rekapMatchesSearch(item.user.name, item.user.identityNumber),
          ),
          absent: data.absentUsers.filter((user) =>
            rekapMatchesSearch(user.name, user.identityNumber),
          ),
        },
      ];
    });

  const expandedRekapRow = expandedRekapScheduleId
    ? visibleRekapRows.find(
        (row) => row.schedule.id === expandedRekapScheduleId,
      )
    : undefined;

  const averagePresencePercent =
    visibleRekapRows.length === 0
      ? 0
      : Math.round(
          visibleRekapRows.reduce((total, row) => total + row.percentage, 0) /
            visibleRekapRows.length,
        );

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {/* Feedback Toast */}
          {feedbackToast ? (
            <View
              style={[
                styles.feedbackToast,
                {
                  backgroundColor: theme.primary,
                  borderColor: theme.border,
                },
              ]}>
              <ThemedText style={styles.feedbackToastText}>
                {feedbackToast}
              </ThemedText>
            </View>
          ) : null}

          {activeTab === 'jadwal' ? (
            <>
              {/* Top Big Capsule Container Asisten */}
              <DashboardCapsule
                title="Kelola Data"
                subtitle="Kelola sesi dan presensimu hari ini"
              />

              <View style={styles.shortcutGrid}>
                {dashboardShortcuts.map((shortcut) => (
                  <Pressable
                    key={shortcut.label}
                    accessibilityRole="button"
                    onPress={shortcut.onPress}
                    style={({ pressed }) => [
                      styles.shortcutTile,
                      {
                        backgroundColor: theme.glassGreenLight,
                        backgroundImage: `linear-gradient(145deg, ${theme.glassBorderHighlight} 0%, ${theme.glassGreenSheen} 32%, ${theme.glassGreenLight} 100%)`,
                        borderColor: theme.glassBorderHighlight,
                        shadowColor: theme.primary,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons
                      name={shortcut.icon}
                      size={23}
                      color={theme.primary}
                    />
                    <ThemedText
                      type="smallBold"
                      numberOfLines={2}
                      style={{ color: theme.text, textAlign: 'center' }}>
                      {shortcut.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveTab('jadwal')}
              style={({ pressed }) => [
                styles.backButton,
                { borderColor: '#C8B995' },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                ← Kembali
              </ThemedText>
            </Pressable>
          )}

          {/* ============================================================== */}
          {/* TAB 1: JADWAL & KONTROL SESI (SRS-04 & SRS-05)                  */}
          {/* ============================================================== */}
          {activeTab === 'jadwal' && (
            <View style={styles.tabContent}>
              {/* Search & Filter Controls */}
              <View style={styles.filterSection}>
                {/* Search Bar */}
                <View
                  style={[
                    styles.searchBox,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}>
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Cari mata praktikum, kelas, ruang..."
                    placeholderTextColor="#7F735B"
                    style={[styles.searchInput, { color: theme.text }]}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable
                      onPress={() => setSearchQuery('')}
                      style={styles.searchClearButton}>
                      <ThemedText type="small" themeColor="textSecondary">
                        ✕
                      </ThemedText>
                    </Pressable>
                  )}
                </View>

                {/* Status Filters */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterChipsScroll}
                  contentContainerStyle={styles.filterChipsContainer}>
                    <Pressable
                      onPress={() => setStatusFilter('all')}
                      style={[
                        styles.chip,
                        filterChipSurface(statusFilter === 'all'),
                      ]}>
                      <ThemedText
                        type="smallBold"
                        numberOfLines={1}
                        style={{
                          color:
                            statusFilter === 'all'
                              ? theme.primaryText
                              : theme.text,
                        }}>
                        Semua Status
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => setStatusFilter('open')}
                      style={[
                        styles.chip,
                        filterChipSurface(statusFilter === 'open'),
                      ]}>
                      <ThemedText
                        type="smallBold"
                        numberOfLines={1}
                        style={{
                          color:
                            statusFilter === 'open'
                              ? theme.primaryText
                              : theme.text,
                        }}>
                        Dibuka ({openSessionsCount})
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => setStatusFilter('scheduled')}
                      style={[
                        styles.chip,
                        filterChipSurface(statusFilter === 'scheduled'),
                      ]}>
                      <ThemedText
                        type="smallBold"
                        numberOfLines={1}
                        style={{
                          color:
                            statusFilter === 'scheduled'
                              ? theme.primaryText
                              : theme.text,
                        }}>
                        Terjadwal ({scheduledSessionsCount})
                      </ThemedText>
                    </Pressable>

                    <Pressable
                      onPress={() => setStatusFilter('closed')}
                      style={[
                        styles.chip,
                        filterChipSurface(statusFilter === 'closed'),
                      ]}>
                      <ThemedText
                        type="smallBold"
                        numberOfLines={1}
                        style={{
                          color:
                            statusFilter === 'closed'
                              ? theme.primaryText
                              : theme.text,
                        }}>
                        Ditutup ({closedSessionsCount})
                      </ThemedText>
                    </Pressable>
                </ScrollView>
              </View>

              {/* Schedules List */}
              {filteredSchedules.length === 0 ? (
                <ThemedView
                  type="backgroundElement"
                  style={[styles.emptyContainer, { borderColor: theme.border }]}>
                  <ThemedText type="smallBold" style={styles.emptyTitle}>
                    Tidak Ada Jadwal Praktikum
                  </ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.emptySubtitle}>
                    {searchQuery
                      ? 'Tidak ada jadwal yang cocok dengan kata kunci pencarian.'
                      : 'Belum ada sesi praktikum yang sesuai dengan filter yang dipilih.'}
                  </ThemedText>
                  {(statusFilter !== 'all' || searchQuery) && (
                    <Pressable
                      onPress={() => {
                        setStatusFilter('all');
                        setSearchQuery('');
                      }}
                      style={[
                        styles.resetFilterButton,
                        { backgroundColor: theme.primary },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: theme.primaryText }}>
                        Reset Semua Filter
                      </ThemedText>
                    </Pressable>
                  )}
                </ThemedView>
              ) : (
                <View style={styles.scheduleList}>
                  {filteredSchedules.map((schedule) => {
                    const session = getSessionsForSchedule(schedule.id)[0];
                    const assistant = getUser(schedule.assistantId);

                    const attendanceData = session
                      ? getSessionAttendanceData(session)
                      : {
                          attendedCount: 0,
                          excusedCount: 0,
                          coveragePercent: 0,
                          totalStudents: praktikanUsers.length,
                          percentage: 0,
                        };

                    const isOpen = session?.status === 'open';
                    const isScheduled = session?.status === 'scheduled';
                    const isClosed = session?.status === 'closed';
                    const sessionWindow = getPracticumWindowState(schedule);
                    const canOpenSession = sessionWindow.phase === 'open';
                    const openSessionLabel = getSessionButtonLabel(
                      sessionWindow.phase,
                      schedule.startTime,
                      'Buka Sesi Presensi',
                    );

                    return (
                      <ThemedView
                        key={schedule.id}
                        type="glassCard"
                        style={[
                          styles.scheduleCard,
                          {
                            borderColor: isOpen ? theme.moss : theme.glassBorder,
                          },
                          isOpen && styles.scheduleCardActive,
                        ]}>
                        {/* Card Header */}
                        <View style={styles.scheduleCardHeader}>
                          <View style={{ flex: 1, gap: Spacing.half }}>
                            <View style={styles.praktikumTitleRow}>
                              <ThemedText
                                type="subtitle"
                                style={styles.praktikumTitleText}>
                                {schedule.praktikum}
                              </ThemedText>
                            </View>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                              style={styles.scheduleSubMeta}>
                              {schedule.kelas} · {schedule.ruang}
                            </ThemedText>
                          </View>
                          <SessionStatusBadge
                            status={session?.status ?? 'scheduled'}
                          />
                        </View>

                        {/* Schedule Timing & Assistant */}
                        <View
                          style={[
                            styles.scheduleInfoBox,
                            {
                              backgroundColor: theme.glassCard,
                              borderColor: theme.glassBorder,
                            },
                          ]}>
                          <View style={styles.infoCol}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                              style={styles.infoColLabel}>
                              Tanggal
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {new Date(`${schedule.date.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </ThemedText>
                          </View>

                          <View style={styles.infoDivider} />

                          <View style={styles.infoCol}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                              style={styles.infoColLabel}>
                              Jam Pelaksanaan
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {schedule.startTime} - {schedule.endTime} WIB
                            </ThemedText>
                          </View>

                          <View style={styles.infoDivider} />

                          <View style={styles.infoCol}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                              style={styles.infoColLabel}>
                              Asisten PJ
                            </ThemedText>
                            <ThemedText type="smallBold" numberOfLines={1}>
                              {assistant?.name ?? '-'}
                            </ThemedText>
                          </View>
                        </View>

                        {/* Session Status Banner with Timing Info (SRS-04 & SRS-05) */}
                        <View
                          style={[
                            styles.sessionStatusBanner,
                            {
                              backgroundColor: isClosed
                                ? theme.dangerSoft
                                : theme.glassInput,
                              borderColor: isOpen
                                ? theme.primary
                                : isClosed
                                  ? theme.danger
                                  : theme.border,
                            },
                          ]}>
                          <View style={styles.statusBannerTextRow}>
                            <ThemedText
                              type="smallBold"
                              style={{
                                color: isOpen
                                  ? theme.primary
                                  : isClosed
                                    ? theme.danger
                                    : theme.text,
                              }}>
                              {isOpen
                                ? '● Sesi Sedang Dibuka'
                                : isClosed
                                  ? '■ Sesi Telah Ditutup'
                                  : '○ Sesi Belum Dibuka'}
                            </ThemedText>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              {isOpen && session?.openedAt
                                ? `Dibuka sejak ${formatTimeWithSeconds(session.openedAt)} WIB`
                                : isClosed && session?.closedAt
                                  ? `Ditutup pada ${formatTimeWithSeconds(session.closedAt)} WIB`
                                  : 'Praktikan menunggu sesi dibuka'}
                            </ThemedText>
                          </View>
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                            style={styles.sessionBannerExplanation}>
                            {isOpen
                              ? 'Presensi sedang aktif. Praktikan dapat melakukan check-in saat ini.'
                              : isClosed
                                ? 'Presensi telah selesai. Praktikan tidak dapat lagi melakukan presensi.'
                                : 'Praktikan belum dapat melakukan presensi hingga Anda membuka sesi ini.'}
                          </ThemedText>
                        </View>

                        {/* Live Attendance Progress */}
                        <View style={styles.attendanceProgressSection}>
                          <View style={styles.attendanceProgressMeta}>
                            <ThemedText
                              type="smallBold"
                              themeColor="textSecondary">
                              Kehadiran Praktikan:
                            </ThemedText>
                            <ThemedText type="smallBold" style={{ flexShrink: 1 }}>
                              {attendanceData.attendedCount} hadir ·{' '}
                              {attendanceData.excusedCount} izin ·{' '}
                              {Math.max(0, attendanceData.totalStudents - attendanceData.attendedCount - attendanceData.excusedCount)} belum hadir
                            </ThemedText>
                          </View>
                          <ThemedText type="small" themeColor="textSecondary">
                            {attendanceData.percentage}% hadir dari {attendanceData.totalStudents} praktikan
                          </ThemedText>
                          <View
                            style={[
                              styles.progressBarTrack,
                              {
                                backgroundColor: theme.background,
                                borderColor: theme.border,
                              },
                            ]}>
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  width: `${attendanceData.coveragePercent}%`,
                                  backgroundColor:
                                    attendanceData.percentage >= 100
                                      ? theme.primary
                                      : theme.moss,
                                },
                              ]}
                            />
                          </View>
                        </View>

                        {/* Action Buttons Row */}
                        <View style={styles.cardActionsRow}>
                          {/* Button: Lihat Detail Sesi */}
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setSelectedSchedule(schedule);
                            }}
                            style={({ pressed }) => [
                              styles.detailActionButton,
                              {
                                borderColor: theme.primary,
                                backgroundColor: theme.backgroundSelected,
                              },
                              pressed && styles.pressed,
                            ]}>
                            <ThemedText
                              type="smallBold"
                              style={{ color: theme.primary }}>
                              Detail
                            </ThemedText>
                          </Pressable>
                          {!session && (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => handleCreateSession(schedule.id)}
                              style={({ pressed }) => [
                                styles.sessionActionButton,
                                { backgroundColor: theme.primary },
                                pressed && styles.pressed,
                              ]}>
                              <ThemedText
                                type="smallBold"
                                style={{ color: theme.primaryText }}>
                                Buat Sesi
                              </ThemedText>
                            </Pressable>
                          )}

                          {/* Quick Session Toggle Button*/}
                          {session && (
                            <>
                              {isScheduled && (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityState={{
                                    disabled: !canOpenSession,
                                  }}
                                  disabled={!canOpenSession}
                                  onPress={() =>
                                    handleOpenSession(session, schedule)
                                  }
                                  style={({ pressed }) => [
                                    styles.sessionActionButton,
                                    {
                                      backgroundColor: canOpenSession
                                        ? theme.primary
                                        : theme.backgroundSelected,
                                      borderColor: canOpenSession
                                        ? theme.primary
                                        : theme.border,
                                    },
                                    !canOpenSession && styles.disabledButton,
                                    pressed && canOpenSession && styles.pressed,
                                  ]}>
                                  <ThemedText
                                    type="smallBold"
                                    style={{
                                      color: canOpenSession
                                        ? theme.primaryText
                                        : theme.textSecondary,
                                    }}>
                                    {openSessionLabel}
                                  </ThemedText>
                                </Pressable>
                              )}

                              {isOpen && (
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() =>
                                    handleCloseSession(session, schedule)
                                  }
                                  style={({ pressed }) => [
                                    styles.sessionActionButton,
                                    {
                                      backgroundColor: theme.danger,
                                      borderColor: theme.danger,
                                    },
                                    pressed && styles.pressed,
                                  ]}>
                                  <ThemedText
                                    type="smallBold"
                                    style={{ color: '#FFFFFF' }}>
                                    Tutup Sesi Presensi
                                  </ThemedText>
                                </Pressable>
                              )}

                              {isClosed && (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityState={{
                                    disabled: !canOpenSession,
                                  }}
                                  disabled={!canOpenSession}
                                  onPress={() =>
                                    handleOpenSession(session, schedule)
                                  }
                                  style={({ pressed }) => [
                                    styles.sessionActionButton,
                                    {
                                      backgroundColor: canOpenSession
                                        ? theme.primary
                                        : theme.backgroundSelected,
                                      borderColor: canOpenSession
                                        ? theme.primary
                                        : theme.border,
                                      borderWidth: 1,
                                    },
                                    !canOpenSession && styles.disabledButton,
                                    pressed && canOpenSession && styles.pressed,
                                  ]}>
                                  <ThemedText
                                    type="smallBold"
                                    style={{
                                      color: canOpenSession
                                        ? theme.primaryText
                                        : theme.textSecondary,
                                    }}>
                                    {getSessionButtonLabel(
                                      sessionWindow.phase,
                                      schedule.startTime,
                                      'Buka Kembali',
                                    )}
                                  </ThemedText>
                                </Pressable>
                              )}
                            </>
                            
                          )}
                        </View>
                      </ThemedView>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ============================================================== */}
          {/* REKAP PRESENSI KESELURUHAN */}
          {/* ============================================================== */}
          {activeTab === 'rekap' && (
            <View style={styles.tabContent}>
              <View style={styles.rekapHeadingBlock}>
                <ThemedText type="smallBold" style={styles.rekapEyebrow}>
                  REKAP PRESENSI
                </ThemedText>
                <ThemedText type="subtitle" style={styles.rekapHeading}>
                  Kehadiran Praktikan
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Ringkasan kehadiran seluruh praktikan pada praktikum yang kamu
                  ampu.
                </ThemedText>
              </View>

              {/* Statistik ringkas */}
              <View
                style={[
                  styles.rekapStatPanel,
                  { backgroundColor: '#F7F1E7', borderColor: '#C8B995' },
                ]}>
                <View style={styles.rekapStatPanelItem}>
                  <Ionicons
                    name="calendar-outline"
                    size={24}
                    color={theme.primary}
                  />
                  <ThemedText
                    type="smallBold"
                    style={[styles.rekapStatNumber, { color: theme.primary }]}>
                    {visibleRekapRows.length}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Jadwal
                  </ThemedText>
                </View>

                <View
                  style={[
                    styles.rekapStatDivider,
                    { backgroundColor: '#C8B995' },
                  ]}
                />

                <View style={styles.rekapStatPanelItem}>
                  <Ionicons
                    name="radio-button-on-outline"
                    size={24}
                    color={theme.moss}
                  />
                  <ThemedText
                    type="smallBold"
                    style={[styles.rekapStatNumber, { color: theme.moss }]}>
                    {visibleRekapRows.filter((row) => row.session.status === 'open').length}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Sesi Dibuka
                  </ThemedText>
                </View>

                <View
                  style={[
                    styles.rekapStatDivider,
                    { backgroundColor: '#C8B995' },
                  ]}
                />

                <View style={styles.rekapStatPanelItem}>
                  <Ionicons
                    name="stats-chart-outline"
                    size={24}
                    color={theme.primary}
                  />
                  <ThemedText
                    type="smallBold"
                    style={[styles.rekapStatNumber, { color: theme.primary }]}>
                    {averagePresencePercent}%
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Rata-rata Hadir
                  </ThemedText>
                </View>
              </View>

              <ThemedText type="smallBold" style={styles.rekapListHeading}>
                Daftar Rekap
              </ThemedText>

              {/* Search mata kuliah / lab */}
              <View style={styles.rekapSearchRow}>
                <View
                  style={[
                    styles.searchBox,
                    styles.rekapSearchField,
                    { backgroundColor: '#F7F1E7', borderColor: '#C8B995' },
                  ]}>
                  <TextInput
                    value={rekapSearchQuery}
                    onChangeText={setRekapSearchQuery}
                    placeholder="Cari mata kuliah atau lab"
                    placeholderTextColor="#7F735B"
                    style={[styles.searchInput, { color: theme.text }]}
                  />
                  {rekapSearchQuery.length > 0 && (
                    <Pressable
                      onPress={() => setRekapSearchQuery('')}
                      style={styles.searchClearButton}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: theme.primary }}>
                        ✕
                      </ThemedText>
                    </Pressable>
                  )}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: rekapFilterOpen }}
                  onPress={() => setRekapFilterOpen((open) => !open)}
                  style={({ pressed }) => [
                    styles.rekapFilterButton,
                    { backgroundColor: theme.primary },
                    pressed && styles.pressed,
                  ]}>
                  <Ionicons
                    name="funnel-outline"
                    size={16}
                    color={theme.primaryText}
                  />
                  <ThemedText
                    type="smallBold"
                    style={{ color: theme.primaryText }}>
                    Filter
                  </ThemedText>
                </Pressable>
              </View>

              {rekapFilterOpen && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rekapScheduleFilterList}>
                  <Pressable
                    onPress={() => setRekapSelectedScheduleId('all')}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          rekapSelectedScheduleId === 'all'
                            ? theme.primary
                            : '#F7F1E7',
                        borderColor: '#C8B995',
                      },
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={{
                        color:
                          rekapSelectedScheduleId === 'all'
                            ? theme.primaryText
                            : theme.text,
                      }}>
                      Semua Praktikum
                    </ThemedText>
                  </Pressable>

                  {schedules.map((schedule) => (
                    <Pressable
                      key={schedule.id}
                      onPress={() => setRekapSelectedScheduleId(schedule.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            rekapSelectedScheduleId === schedule.id
                              ? theme.primary
                              : '#F7F1E7',
                          borderColor: '#C8B995',
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{
                          color:
                            rekapSelectedScheduleId === schedule.id
                              ? theme.primaryText
                              : theme.text,
                        }}>
                        {schedule.praktikum} ({schedule.kelas})
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {/* Daftar Rekap per Jadwal */}
              {visibleRekapRows.length === 0 ? (
                <ThemedView
                  type="backgroundElement"
                  style={[styles.rekapTableEmpty, { borderColor: '#C8B995' }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Tidak ada jadwal yang cocok dengan filter.
                  </ThemedText>
                </ThemedView>
              ) : (
                <View style={styles.rekapList}>
                  {visibleRekapRows.map((row) => {
                    const expanded =
                      expandedRekapScheduleId === row.schedule.id;

                    return (
                      <ThemedView
                        key={row.schedule.id}
                        style={[
                          styles.rekapCard,
                          {
                            backgroundColor: '#F7F1E7',
                            borderColor: expanded ? theme.primary : '#C8B995',
                          },
                        ]}>
                        <View style={styles.rekapCardHeaderRow}>
                          <View style={styles.flex}>
                            <ThemedText type="smallBold" style={styles.rekapCardTitle}>
                              {row.schedule.praktikum}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {row.schedule.kelas} · {row.schedule.ruang}
                            </ThemedText>
                          </View>
                          <SessionStatusBadge status={row.session.status} />
                        </View>

                        <View style={styles.rekapCardMetaRow}>
                          <View style={styles.rekapCardMetaItem}>
                            <ThemedText type="small" themeColor="textSecondary">
                              Tanggal
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {formatDate(row.schedule.date)}
                            </ThemedText>
                          </View>
                          <View style={styles.rekapCardMetaItem}>
                            <ThemedText type="small" themeColor="textSecondary">
                              Hadir
                            </ThemedText>
                            <ThemedText
                              type="smallBold"
                              style={{ color: theme.primary }}>
                              {row.attendedCount}/{row.totalStudents} ({row.percentage}%)
                            </ThemedText>
                          </View>
                        </View>

                        <View style={styles.rekapCardFooter}>
                          <View
                            style={[
                              styles.progressBarTrack,
                              styles.rekapCardProgress,
                              {
                                backgroundColor: '#EDE4D5',
                                borderColor: '#C8B995',
                              },
                            ]}>
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  width: `${row.percentage}%`,
                                  backgroundColor: theme.primary,
                                },
                              ]}
                            />
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Lihat rekap ${row.schedule.praktikum}`}
                            onPress={() =>
                              setExpandedRekapScheduleId(
                                expanded ? null : row.schedule.id,
                              )
                            }
                            style={({ pressed }) => [
                              styles.detailButton,
                              {
                                borderColor: theme.primary,
                                backgroundColor: expanded
                                  ? theme.primary
                                  : 'transparent',
                              },
                              pressed && styles.pressed,
                            ]}>
                            <ThemedText
                              type="smallBold"
                              style={{
                                color: expanded
                                  ? theme.primaryText
                                  : theme.primary,
                              }}>
                              {expanded ? 'Tutup Detail' : 'Lihat Detail'}
                            </ThemedText>
                            <ThemedText
                              type="smallBold"
                              style={{
                                color: expanded
                                  ? theme.primaryText
                                  : theme.primary,
                              }}>
                              {expanded ? '∨' : '›'}
                            </ThemedText>
                          </Pressable>
                        </View>
                      </ThemedView>
                    );
                  })}
                </View>
              )}

            </View>
          )}

          {/* ============================================================== */}
          {/* MODAL DETAIL SESI (SRS-04, 05)   */}
          {/* ============================================================== */}
          <Modal
            visible={!!selectedSchedule}
            transparent
            animationType="slide"
            onRequestClose={() => setSelectedSchedule(null)}>
            <View style={styles.modalBackdrop}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setSelectedSchedule(null)}
              />

              <ThemedView
                style={[
                  styles.modalSheet,
                  {
                    backgroundColor: theme.backgroundElement,
                    paddingBottom: insets.bottom + Spacing.four,
                  },
                ]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tutup detail sesi"
                  hitSlop={8}
                  onPress={() => setSelectedSchedule(null)}
                  style={styles.modalHandlePressable}>
                  <View
                  style={[
                    styles.modalHandle,
                    { backgroundColor: theme.border },
                  ]}
                  />
                </Pressable>

                {selectedSchedule && activeModalSession && (
                  <ScrollView
                    contentContainerStyle={styles.modalScrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled">
                    {/* Modal Header */}
                    <View style={styles.modalHeader}>
                      <View style={{ flex: 1, gap: Spacing.half }}>
                        <ThemedText type="subtitle" style={{ fontSize: 20 }}>
                          {selectedSchedule.praktikum}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          themeColor="textSecondary">
                          {selectedSchedule.kelas} · {selectedSchedule.ruang}
                        </ThemedText>
                      </View>
                      <SessionStatusBadge status={activeModalSession.status} />
                    </View>

                    {/* DETAIL SESI & KONTROL (SRS-04 & SRS-05) */}
                    <View style={styles.modalTabBody}>
                        {/* Section Spesifikasi Jadwal Praktikum (SRS-04) */}
                        <View
                          style={[
                            styles.modalSectionCard,
                            {
                              backgroundColor: theme.background,
                              borderColor: theme.border,
                            },
                          ]}>
                          <ThemedText
                            type="smallBold"
                            style={styles.modalSectionHeading}>
                            Informasi Jadwal Praktikum
                          </ThemedText>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              Mata Kuliah / Praktikum
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {selectedSchedule.praktikum}
                            </ThemedText>
                          </View>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              Kelas
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {selectedSchedule.kelas}
                            </ThemedText>
                          </View>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              Ruang Laboratorium
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {selectedSchedule.ruang}
                            </ThemedText>
                          </View>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              Hari & Tanggal
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {formatDate(selectedSchedule.date)}
                            </ThemedText>
                          </View>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              Waktu Praktikum
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {selectedSchedule.startTime} -{' '}
                              {selectedSchedule.endTime} WIB
                            </ThemedText>
                          </View>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              Asisten Penanggung Jawab
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {getUser(selectedSchedule.assistantId)?.name ??
                                '-'}
                            </ThemedText>
                          </View>
                        </View>

                        {/* Kontrol Sesi Presensi: Buka & Tutup (SRS-05) */}
                        <View
                          style={[
                            styles.sessionControlCard,
                            {
                              backgroundColor:
                                activeModalSession.status === 'open'
                                  ? '#E8F0DC'
                                  : activeModalSession.status === 'closed'
                                    ? '#F8EAEA'
                                    : '#F2EADB',
                              borderColor:
                                activeModalSession.status === 'open'
                                  ? theme.primary
                                  : activeModalSession.status === 'closed'
                                    ? theme.danger
                                    : theme.border,
                            },
                          ]}>
                          <ThemedText
                            type="smallBold"
                            style={{
                              fontSize: 15,
                              color:
                                activeModalSession.status === 'open'
                                  ? theme.primary
                                  : activeModalSession.status === 'closed'
                                    ? theme.danger
                                    : theme.text,
                            }}>
                            {activeModalSession.status === 'open'
                              ? 'Presensi Sedang Berlangsung'
                              : activeModalSession.status === 'closed'
                                ? 'Sesi Telah Selesai & Ditutup'
                                : 'Sesi Belum Dibuka'}
                          </ThemedText>

                          <ThemedText
                            type="small"
                            themeColor="textSecondary">
                            {activeModalSession.status === 'open'
                              ? 'Praktikan saat ini diizinkan untuk mencatat kehadiran. Tekan "Tutup Sesi" di bawah ini setelah batas waktu kehadiran berakhir.'
                              : activeModalSession.status === 'closed'
                                ? 'Presensi sudah tidak dapat diakses oleh praktikan. Jika ada praktikan yang membutuhkan dispensasi, Anda dapat membuka kembali sesi ini.'
                                : 'Praktikan kelas ini belum dapat melakukan presensi. Buka sesi sekarang agar praktikan dapat melakukan check-in.'}
                          </ThemedText>

                          {activeModalSession.status === 'scheduled' && (() => {
                            const modalWindow =
                              getPracticumWindowState(selectedSchedule);
                            const canOpen = modalWindow.phase === 'open';

                            return (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !canOpen }}
                                disabled={!canOpen}
                                onPress={() =>
                                  handleOpenSession(
                                    activeModalSession,
                                    selectedSchedule,
                                  )
                                }
                                style={({ pressed }) => [
                                  styles.primaryActionButton,
                                  {
                                    backgroundColor: canOpen
                                      ? theme.primary
                                      : theme.backgroundSelected,
                                    borderColor: canOpen
                                      ? theme.primary
                                      : theme.border,
                                  },
                                  !canOpen && styles.disabledButton,
                                  pressed && canOpen && styles.pressed,
                                ]}>
                                <ThemedText
                                  type="smallBold"
                                  style={{
                                    color: canOpen
                                      ? theme.primaryText
                                      : theme.textSecondary,
                                    fontSize: 15,
                                  }}>
                                  {getSessionButtonLabel(
                                    modalWindow.phase,
                                    selectedSchedule.startTime,
                                    'Buka Sesi Presensi Sekarang',
                                  )}
                                </ThemedText>
                              </Pressable>
                            );
                          })()}

                          {activeModalSession.status === 'open' && (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                handleCloseSession(
                                  activeModalSession,
                                  selectedSchedule,
                                )
                              }
                              style={({ pressed }) => [
                                styles.primaryActionButton,
                                {
                                  backgroundColor: theme.danger,
                                  borderColor: theme.danger,
                                },
                                pressed && styles.pressed,
                              ]}>
                              <ThemedText
                                type="smallBold"
                                style={{
                                  color: '#FFFFFF',
                                  fontSize: 15,
                                }}>
                                Tutup Sesi Presensi Sekarang
                              </ThemedText>
                            </Pressable>
                          )}

                          {activeModalSession.status === 'closed' && (() => {
                            const modalWindow =
                              getPracticumWindowState(selectedSchedule);
                            const canReopen = modalWindow.phase === 'open';

                            return (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !canReopen }}
                                disabled={!canReopen}
                                onPress={() =>
                                  handleOpenSession(
                                    activeModalSession,
                                    selectedSchedule,
                                  )
                                }
                                style={({ pressed }) => [
                                  styles.primaryActionButton,
                                  {
                                    backgroundColor: canReopen
                                      ? theme.primary
                                      : theme.backgroundSelected,
                                    borderColor: canReopen
                                      ? theme.primary
                                      : theme.border,
                                  },
                                  !canReopen && styles.disabledButton,
                                  pressed && canReopen && styles.pressed,
                                ]}>
                                <ThemedText
                                  type="smallBold"
                                  style={{
                                    color: canReopen
                                      ? theme.primaryText
                                      : theme.textSecondary,
                                    fontSize: 15,
                                  }}>
                                  {getSessionButtonLabel(
                                    modalWindow.phase,
                                    selectedSchedule.startTime,
                                    'Buka Kembali Sesi Presensi',
                                  )}
                                </ThemedText>
                              </Pressable>
                            );
                          })()}
                        </View>
                      </View>

                    {/* Modal Close Button */}
                  </ScrollView>
                )}
              </ThemedView>
            </View>
          </Modal>

          {/* ============================================================== */}
          {/* MODAL KONFIRMASI BUKA / TUTUP SESI                    */}
          {/* ============================================================== */}
          <Modal
            visible={!!confirmAction}
            transparent
            animationType="fade"
            onRequestClose={() => setConfirmAction(null)}>
            <View style={styles.confirmBackdrop}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setConfirmAction(null)}
              />

              <ThemedView
                style={[
                  styles.confirmCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}>
                <ThemedText type="subtitle" style={styles.confirmTitle}>
                  {confirmAction?.type === 'close'
                    ? 'Tutup Sesi Praktikum?'
                    : confirmAction?.type === 'reopen'
                      ? 'Buka Kembali Sesi?'
                      : 'Buka Sesi Praktikum?'}
                </ThemedText>

                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={styles.confirmMessage}>
                  {confirmAction?.type === 'close'
                    ? `Anda akan menutup sesi praktikum "${confirmAction.schedule.praktikum}" (${confirmAction.schedule.kelas}). Setelah ditutup, praktikan tidak akan dapat melakukan presensi kehadiran lagi.`
                    : confirmAction?.type === 'reopen'
                      ? `Anda akan membuka kembali sesi praktikum "${confirmAction.schedule.praktikum}" (${confirmAction.schedule.kelas}). Praktikan dapat kembali melakukan presensi kehadiran.`
                      : `Anda akan membuka sesi praktikum "${confirmAction?.schedule.praktikum}" (${confirmAction?.schedule.kelas}). Praktikan kelas ini dapat langsung melakukan presensi kehadiran.`}
                </ThemedText>

                <View style={styles.confirmActionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setConfirmAction(null)}
                    style={({ pressed }) => [
                      styles.confirmCancelButton,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="smallBold">Batal</ThemedText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={executeConfirmedAction}
                    style={({ pressed }) => [
                      styles.confirmOkButton,
                      {
                        backgroundColor:
                          confirmAction?.type === 'close'
                            ? theme.danger
                            : theme.primary,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={{ color: '#FFFFFF' }}>
                      {confirmAction?.type === 'close'
                        ? 'Ya, Tutup Sesi'
                        : confirmAction?.type === 'reopen'
                          ? 'Ya, Buka Kembali'
                          : 'Ya, Buka Sesi'}
                    </ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            </View>
          </Modal>

          {/* ============================================================== */}
          {/* MODAL TEKS REKAP LAPORAN PRESENSI                    */}
          {/* ============================================================== */}
          <Modal
            visible={!!reportModalText}
            transparent
            animationType="slide"
            onRequestClose={() => setReportModalText(null)}>
            <View style={styles.confirmBackdrop}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setReportModalText(null)}
              />

              <ThemedView
                style={[
                  styles.reportModalCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}>
                <ThemedText type="subtitle" style={{ fontSize: 18 }}>
                  Teks Rekapitulasi Presensi
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Salin teks laporan presensi di bawah ini untuk dibagikan ke
                  grup chat atau dokumen laporan praktikum.
                </ThemedText>

                <TextInput
                  value={reportModalText ?? ''}
                  multiline
                  editable={false}
                  selectTextOnFocus
                  style={[
                    styles.reportTextInput,
                    {
                      backgroundColor: theme.background,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                />

                <View style={styles.reportModalButtons}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setReportModalText(null)}
                    style={({ pressed }) => [
                      styles.confirmCancelButton,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="smallBold">Tutup</ThemedText>
                  </Pressable>

                  {Platform.OS === 'web' && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (
                          reportModalText &&
                          typeof navigator !== 'undefined' &&
                          navigator.clipboard
                        ) {
                          navigator.clipboard.writeText(reportModalText);
                          showToast('Teks berhasil disalin ke clipboard!');
                          setReportModalText(null);
                        }
                      }}
                      style={({ pressed }) => [
                        styles.confirmOkButton,
                        { backgroundColor: theme.primary },
                        pressed && styles.pressed,
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: theme.primaryText }}>
                        Salin ke Clipboard
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              </ThemedView>
            </View>
          </Modal>
        </ScrollView>

          {/* Detail Rekap (Modal) */}
          <Modal
                visible={!!expandedRekapRow}
                  transparent
                  animationType="slide"
                  onRequestClose={() => setExpandedRekapScheduleId(null)}>
                  <View style={styles.rekapDetailBackdrop}>
                    <Pressable
                      style={StyleSheet.absoluteFill}
                      onPress={() => setExpandedRekapScheduleId(null)}
                    />

                    {expandedRekapRow && (
                      <ThemedView
                        style={[
                          styles.rekapDetailSheet,
                          {
                            backgroundColor: '#F7F1E7',
                            borderColor: '#C8B995',
                            paddingBottom: insets.bottom + Spacing.four,
                          },
                        ]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Tutup detail rekap"
                          hitSlop={8}
                          onPress={() => setExpandedRekapScheduleId(null)}
                          style={styles.modalHandlePressable}>
                          <View
                            style={[
                              styles.modalHandle,
                              { backgroundColor: theme.border },
                            ]}
                          />
                        </Pressable>

                        <View style={styles.rekapDetailHeader}>
                          <View style={styles.flex}>
                            <ThemedText type="smallBold" style={{ fontSize: 16 }}>
                              Rekap {expandedRekapRow.schedule.praktikum}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {expandedRekapRow.schedule.kelas} ·{' '}
                              {expandedRekapRow.schedule.ruang} ·{' '}
                              {formatDate(expandedRekapRow.schedule.date)}
                            </ThemedText>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Tutup rekap"
                            onPress={() => setExpandedRekapScheduleId(null)}
                            style={({ pressed }) => [
                              styles.closeDetailButton,
                              {
                                backgroundColor: '#F7F1E7',
                                borderColor: '#C8B995',
                              },
                              pressed && styles.pressed,
                            ]}>
                            <ThemedText
                              type="smallBold"
                              style={{ color: theme.primary }}>
                              Tutup
                            </ThemedText>
                          </Pressable>
                        </View>

                        <View style={styles.rekapDetailSummary}>
                          <ThemedText type="smallBold">
                            {expandedRekapRow.attendedCount} hadir ·{' '}
                            {expandedRekapRow.excusedCount} izin ·{' '}
                            {Math.max(
                              0,
                              expandedRekapRow.totalStudents -
                                expandedRekapRow.attendedCount -
                                expandedRekapRow.excusedCount,
                            )}{' '}
                            belum hadir ({expandedRekapRow.percentage}% hadir)
                          </ThemedText>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              handleCopyReport(
                                expandedRekapRow.schedule,
                                expandedRekapRow.session,
                              )
                            }
                            style={({ pressed }) => [
                              styles.copyMiniButton,
                              { backgroundColor: theme.primary },
                              pressed && styles.pressed,
                            ]}>
                            <ThemedText
                              type="smallBold"
                              style={{
                                color: theme.primaryText,
                                fontSize: 11,
                              }}>
                              Salin Rekap
                            </ThemedText>
                          </Pressable>
                        </View>

                        <View
                          style={[
                            styles.progressBarTrack,
                            {
                              backgroundColor: '#EDE4D5',
                              borderColor: '#C8B995',
                            },
                          ]}>
                          <View
                            style={[
                              styles.progressBarFill,
                              {
                                width: `${expandedRekapRow.percentage}%`,
                                backgroundColor: theme.primary,
                              },
                            ]}
                          />
                        </View>

                        <View
                          style={[
                            styles.searchBox,
                            {
                              backgroundColor: '#F7F1E7',
                              borderColor: '#C8B995',
                            },
                          ]}>
                          <TextInput
                            value={rekapSearchPraktikan}
                            onChangeText={setRekapSearchPraktikan}
                            placeholder="Cari nama atau NIM praktikan..."
                            placeholderTextColor="#7F735B"
                            style={[styles.searchInput, { color: theme.text }]}
                          />
                          {rekapSearchPraktikan.length > 0 && (
                            <Pressable
                              onPress={() => setRekapSearchPraktikan('')}
                              style={styles.searchClearButton}>
                              <ThemedText
                                type="smallBold"
                                style={{ color: theme.primary }}>
                                ✕
                              </ThemedText>
                            </Pressable>
                          )}
                        </View>

                        <ScrollView
                          style={styles.rekapDetailScroll}
                          contentContainerStyle={styles.rekapDetailScrollContent}
                          showsVerticalScrollIndicator>
                          {expandedRekapRow.attended.length === 0 &&
                          expandedRekapRow.excused.length === 0 &&
                          expandedRekapRow.absent.length === 0 ? (
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                              style={styles.noPraktikanMatch}>
                              {rekapSearchKey
                                ? 'Tidak ada praktikan yang cocok dengan pencarian.'
                                : 'Belum ada praktikan pada kelas ini.'}
                            </ThemedText>
                          ) : null}

                          {expandedRekapRow.attended.map((item) => (
                            <View key={item.user.id} style={styles.rekapDetailRow}>
                              <View style={styles.rekapDetailRowMeta}>
                                <ThemedText type="smallBold">
                                  {item.user.name}
                                </ThemedText>
                                <ThemedText
                                  type="small"
                                  themeColor="textSecondary">
                                  {item.user.identityNumber}
                                </ThemedText>
                              </View>
                              <View style={styles.rekapDetailRowStatus}>
                                <View
                                  style={[
                                    styles.statusPill,
                                    { backgroundColor: theme.primary },
                                  ]}>
                                  <ThemedText
                                    type="small"
                                    style={{ color: theme.primaryText }}>
                                    Hadir
                                  </ThemedText>
                                </View>
                                <ThemedText type="small" themeColor="textSecondary">
                                  {formatTimeWithSeconds(item.checkedInAt)} WIB
                                </ThemedText>
                              </View>
                            </View>
                          ))}

                          {expandedRekapRow.excused.map((item) => (
                            <View key={item.user.id} style={styles.rekapDetailRow}>
                              <View style={styles.rekapDetailRowMeta}>
                                <ThemedText type="smallBold">
                                  {item.user.name}
                                </ThemedText>
                                <ThemedText
                                  type="small"
                                  themeColor="textSecondary">
                                  {item.user.identityNumber}
                                </ThemedText>
                              </View>
                              <View style={styles.rekapDetailRowStatus}>
                                <View
                                  style={[
                                    styles.statusPill,
                                    {
                                      backgroundColor: 'rgba(136, 144, 99, 0.35)',
                                    },
                                  ]}>
                                  <ThemedText
                                    type="small"
                                    style={{ color: theme.text }}>
                                    Izin
                                  </ThemedText>
                                </View>
                                <ThemedText type="small" themeColor="textSecondary">
                                  {item.excusedAt
                                    ? `${formatTimeWithSeconds(item.excusedAt)} WIB`
                                    : 'Disetujui'}
                                </ThemedText>
                              </View>
                            </View>
                          ))}

                          {expandedRekapRow.absent.map((user) => (
                            <View key={user.id} style={styles.rekapDetailRow}>
                              <View style={styles.rekapDetailRowMeta}>
                                <ThemedText type="smallBold">
                                  {user.name}
                                </ThemedText>
                                <ThemedText
                                  type="small"
                                  themeColor="textSecondary">
                                  {user.identityNumber}
                                </ThemedText>
                              </View>
                              <View style={styles.rekapDetailRowStatus}>
                                <View
                                  style={[
                                    styles.statusPill,
                                    { backgroundColor: 'rgba(53, 64, 36, 0.15)' },
                                  ]}>
                                  <ThemedText
                                    type="small"
                                    themeColor="textSecondary">
                                    Belum
                                  </ThemedText>
                                </View>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      </ThemedView>
                    )}
                  </View>
                </Modal>

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
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    paddingBottom: 110,
    gap: Spacing.four,
  },
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    maxWidth: 360,
    justifyContent: 'space-between',
    alignSelf: 'center',
    gap: Spacing.two,
  },
  shortcutTile: {
    position: 'relative',
    width: '30%',
    flexBasis: '30%',
    flexGrow: 0,
    aspectRatio: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  topBigCapsule: {
    backgroundColor: '#354024',
    borderRadius: 36,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    shadowColor: '#1A2111',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  innerTitleBox: {
    backgroundColor: '#27301B',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
    gap: 4,
  },
  innerBoxTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Fonts.bold,
  },
  innerBoxSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: Fonts.regular,
  },
  actionPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionPillButton: {
    backgroundColor: '#27301B',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    paddingVertical: 10,
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
  },
  actionPillText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    fontFamily: Fonts.bold,
  },
  pillStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: 4,
  },
  ovalStatPill: {
    flex: 1,
    backgroundColor: '#445130',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    gap: 2,
  },
  ovalStatPillActive: {
    backgroundColor: '#27301B',
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  ovalStatNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Fonts.bold,
  },
  ovalStatLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: Fonts.medium,
    textAlign: 'center',
  },
  asymmetricTabsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 4,
  },
  asymTabPill: {
    paddingVertical: 12,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  asymTabActive: {
    backgroundColor: '#354024',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 6,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  asymTabInactive: {
    backgroundColor: 'transparent',
  },
  asymTabText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
  asymTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  asymTabTextInactive: {
    color: '#4C3D19',
    fontWeight: '500',
  },
  feedbackToast: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    alignItems: 'center',
  },
  feedbackToastText: {
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: '47%',
    maxWidth: '49%',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: Spacing.half,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  statValue: {
    fontSize: 26,
    lineHeight: 30,
    fontFamily: Fonts.bold,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  tabNavContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    padding: Spacing.half,
    borderWidth: 1,
    borderRadius: 18,
  },
  tabNavButton: {
    flexGrow: 1,
    flexBasis: 150,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: 12,
  },
  tabContent: {
    gap: Spacing.three,
  },
  filterSection: {
    gap: Spacing.two,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#C8B995',
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Platform.OS === 'ios' ? Spacing.two : Spacing.one,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.regular,
    paddingVertical: 4,
  },
  searchClearButton: {
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
  },
  filterChipsScroll: {
    width: '100%',
    flexGrow: 0,
  },
  filterChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: Spacing.one,
    paddingVertical: Spacing.half,
  },
  chip: {
    minHeight: 34,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two + 4,
    borderRadius: 15,
    borderWidth: 1.2,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 1,
  },
  emptyContainer: {
    padding: Spacing.five,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: Spacing.two,
  },
  emptyTitle: {
    fontSize: 16,
  },
  emptySubtitle: {
    textAlign: 'center',
    maxWidth: 320,
  },
  resetFilterButton: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 14,
  },
  scheduleList: {
    gap: Spacing.three,
  },
  scheduleCard: {
    padding: Spacing.four,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    borderBottomLeftRadius: 24,
    borderWidth: 1.5,
    gap: Spacing.three,
    shadowColor: '#4C3D19',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  scheduleCardActive: {
    borderWidth: 2,
  },
  scheduleCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  praktikumTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  praktikumTitleText: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.bold,
  },
  scheduleSubMeta: {
    fontSize: 13,
  },
  scheduleInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  infoColLabel: {
    fontSize: 11,
  },
  infoDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#889063',
    opacity: 0.4,
    marginHorizontal: Spacing.one,
  },
  sessionStatusBanner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.three,
    gap: 4,
  },
  statusBannerTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  sessionBannerExplanation: {
    fontSize: 12,
    lineHeight: 16,
  },
  attendanceProgressSection: {
    gap: 6,
  },
  attendanceProgressMeta: {
    gap: 2,
  },
  attendanceErrorBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  detailActionButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    borderWidth: 1,
  },
  sessionActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    borderWidth: 1,
  },
  flex: {
    flex: 1,
  },
  rekapHeadingBlock: {
    gap: Spacing.half,
  },
  rekapEyebrow: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  rekapHeading: {
    fontSize: 22,
    lineHeight: 28,
  },
  rekapStatPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.four,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  rekapStatPanelItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  rekapStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: Spacing.two,
  },
  rekapStatNumber: {
    fontSize: 26,
    lineHeight: 32,
  },
  rekapListHeading: {
    fontSize: 20,
    lineHeight: 26,
  },
  rekapSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rekapSearchField: {
    flex: 1,
  },
  rekapFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
  },
  rekapList: {
    gap: Spacing.two,
  },
  rekapCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rekapCardTitle: {
    fontSize: 15,
  },
  rekapCardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  rekapCardMetaItem: {
    gap: 2,
  },
  rekapCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rekapCardProgress: {
    flex: 1,
  },
  rekapTableCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#C8B995',
    overflow: 'hidden',
    backgroundColor: '#F7F1E7',
  },
  rekapTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200, 185, 149, 0.6)',
  },
  rekapTableHeaderRow: {
    backgroundColor: 'rgba(136, 144, 99, 0.3)',
  },
  rekapTableRowZebra: {
    backgroundColor: 'rgba(136, 144, 99, 0.08)',
  },
  rekapCellSchedule: {
    flex: 1,
    gap: 2,
  },
  rekapCellDate: {
    width: 116,
  },
  rekapCellStatus: {
    width: 92,
  },
  rekapCellCount: {
    width: 64,
    gap: 2,
  },
  rekapCellAction: {
    width: 76,
    alignItems: 'flex-end',
  },
  rekapTableEmpty: {
    padding: Spacing.four,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  rekapDetailCard: {
    padding: Spacing.four,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: Spacing.three,
  },
  rekapDetailBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  rekapDetailSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  rekapDetailScroll: {
    flexShrink: 1,
  },
  rekapDetailScrollContent: {
    gap: Spacing.one,
  },
  rekapDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rekapDetailSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  rekapDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200, 185, 149, 0.5)',
  },
  rekapDetailRowMeta: {
    flex: 1,
    gap: 2,
  },
  rekapDetailRowStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
  },
  detailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  closeDetailButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    borderWidth: 1,
  },
  rekapFilterSection: {
    marginTop: Spacing.two,
    gap: Spacing.one,
  },
  rekapScheduleFilterList: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingVertical: 4,
  },
  rekapCard: {
    padding: Spacing.four,
    borderRadius: 16,
    borderWidth: 1,
    gap: Spacing.three,
  },
  rekapCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rekapSummaryBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  rekapSummaryTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  copyMiniButton: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
    borderRadius: 6,
  },
  rekapPraktikanSection: {
    gap: Spacing.two,
  },
  rekapPraktikanSectionTitle: {
    fontSize: 13,
  },
  noPraktikanMatch: {
    fontStyle: 'italic',
    paddingVertical: Spacing.two,
  },
  praktikanRowsList: {
    maxHeight: 360,
    flexGrow: 0,
  },
  praktikanRowsContent: {
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  praktikanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two,
    borderWidth: 1,
    borderRadius: 10,
    gap: Spacing.two,
  },
  praktikanAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  praktikanMeta: {
    flex: 1,
    gap: 2,
  },
  praktikanAttendanceStatus: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statusChipHadir: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusChipBelumHadir: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  timestampText: {
    fontSize: 11,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  modalHandle: {
    width: 48,
    height: 5,
    borderRadius: 3,
  },
  modalHandlePressable: {
    width: 64,
    height: 44,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  modalScrollContent: {
    gap: Spacing.four,
    paddingBottom: Spacing.five,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  modalTabBody: {
    gap: Spacing.three,
  },
  modalSectionCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  modalSectionHeading: {
    fontSize: 14,
    marginBottom: 4,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  sessionControlCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  primaryActionButton: {
    marginTop: Spacing.one,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  modalRekapMetricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  confirmTitle: {
    fontSize: 20,
    lineHeight: 24,
  },
  confirmMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  confirmCancelButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 8,
    borderWidth: 1,
  },
  confirmOkButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 8,
  },
  reportModalCard: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '80%',
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  reportTextInput: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    padding: Spacing.three,
    borderWidth: 1,
    borderRadius: 8,
    height: 280,
    textAlignVertical: 'top',
  },
  reportModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.75,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
