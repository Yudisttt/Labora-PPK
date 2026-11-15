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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { RoleSwitcher } from '@/components/role-switcher';
import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import type { Schedule, Session, SessionStatus, User } from '@/types';
import {
  formatDate,
  formatDateTimeWithSeconds,
  formatTimeWithSeconds,
  initials,
} from '@/utils/format';

type TabMode = 'jadwal' | 'rekap';
type StatusFilter = 'all' | SessionStatus;
type ModalSubTab = 'detail' | 'rekap';
type AttendanceFilter = 'all' | 'attended' | 'excused' | 'absent';

type ConfirmActionState = {
  type: 'open' | 'close' | 'reopen';
  session: Session;
  schedule: Schedule;
} | null;

export default function AsistenJadwalScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    users,
    schedules,
    openSession,
    closeSession,
    attendanceError,
    getUser,
    getSessionsForSchedule,
    getAttendanceForSession,
  } = useApp();

  // Navigation & Filter States
  const [activeTab, setActiveTab] = useState<TabMode>('jadwal');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [onlyMySchedules, setOnlyMySchedules] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Detail & Rekap States
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(
    null,
  );
  const [modalSubTab, setModalSubTab] = useState<ModalSubTab>('detail');
  const [modalAttendanceFilter, setModalAttendanceFilter] =
    useState<AttendanceFilter>('all');
  const [modalSearchPraktikan, setModalSearchPraktikan] = useState('');

  // Global Rekap Tab States
  const [rekapSelectedScheduleId, setRekapSelectedScheduleId] =
    useState<string>('all');
  const [rekapSearchPraktikan, setRekapSearchPraktikan] = useState('');

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
  const attendancePermissionDenied =
    attendanceError?.includes('permission-denied') ?? false;

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

      if (onlyMySchedules && currentUser && schedule.assistantId !== currentUser.id) {
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
    currentUser,
    getSessionsForSchedule,
    onlyMySchedules,
    schedules,
    searchQuery,
    statusFilter,
  ]);

  // Session action handlers (SRS-05)
  function handleOpenSession(session: Session, schedule: Schedule) {
    setConfirmAction({
      type: session.status === 'closed' ? 'reopen' : 'open',
      session,
      schedule,
    });
  }

  function handleCloseSession(session: Session, schedule: Schedule) {
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


  // Build attendance data for a given session (SRS-06)
  function getSessionAttendanceData(session: Session) {
    const sessionRecords = getAttendanceForSession(session.id);

    const attendedUsers: { user: User; checkedInAt: string }[] = [];
    const excusedUsers: { user: User; excusedAt: string | null }[] = [];
    const absentUsers: User[] = [];

    praktikanUsers.forEach((praktikan) => {
      const record = sessionRecords.find((r) => r.userId === praktikan.id);
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

  // Generate structured report text for export/copy (SRS-06)
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

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {/* Role Switcher */}
          <RoleSwitcher />

          {/* Tombol kembali */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali ke pemilihan peran"
            onPress={() => router.replace('/')}
            style={({ pressed }) => [
              styles.backButton,
              { borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              ← Kembali
            </ThemedText>
          </Pressable>

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

          {/* Tinted Green Glass Header Portal Asisten */}
          <View
            style={[
              styles.headerGlassCard,
              {
                backgroundColor: theme.primary,
                borderColor: theme.primary,
              },
            ]}>
            <View style={styles.headerBadge}>
              <ThemedText
                type="smallBold"
                style={{ color: '#FFFFFF', letterSpacing: 1.2, fontSize: 11, fontWeight: '700' }}>
                PORTAL ASISTEN LABORATORIUM
              </ThemedText>
            </View>
            <ThemedText type="subtitle" style={[styles.headerTitle, { color: '#FFFFFF', fontSize: 28, lineHeight: 36, fontWeight: '700' }]}>
              Halo, {currentUser?.name ?? "Asisten Lab"}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/asisten/izin' as Parameters<typeof router.push>[0])}
              style={({ pressed }) => [
                styles.permissionRequestsButton,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.primary }}>
                Periksa pengajuan izin
              </ThemedText>
            </Pressable>
            <View style={styles.headerUserPill}>
              <ThemedText style={{ color: '#FFFFFF', fontSize: 13, opacity: 0.95 }}>
                Kelola sesi praktikum dan pantau kehadiran mahasiswa
              </ThemedText>
            </View>
          </View>

          {attendanceError ? (
            <View
              style={[
                styles.attendanceErrorBanner,
                { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.danger }}>
                Rekap presensi gagal dimuat
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.danger }}>
                {attendancePermissionDenied
                  ? 'Firebase menolak akses baca attendance untuk akun asisten. Publikasikan firestore.rules terbaru di project labora-89bf3.'
                  : 'Periksa koneksi Firebase lalu muat ulang halaman.'}
              </ThemedText>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/asisten/kelola-data')}
            style={({ pressed }) => [
              styles.manageDataButton,
              {
                backgroundColor: theme.glassCard,
                borderColor: theme.glassBorder,
              },
              pressed && styles.pressed,
            ]}>
            <ThemedText
              type="smallBold"
              style={[styles.manageDataButtonText, { color: theme.primary }]}>
              Kelola kelas, peserta, dan jadwal praktikum
            </ThemedText>
            <ThemedText
              type="smallBold"
              style={[styles.manageDataButtonArrow, { color: theme.primary }]}>
              →
            </ThemedText>
          </Pressable>

          {/* Stat Cards Row (SRS-04) - Tinted Moss Glass */}
          <View style={styles.statsRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setStatusFilter('all')}
              style={({ pressed }) => [
                styles.statCard,
                {
                  backgroundColor:
                    statusFilter === 'all'
                      ? theme.primary
                      : theme.glassCard,
                  borderColor:
                    statusFilter === 'all'
                      ? theme.primary
                      : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="subtitle"
                style={[
                  styles.statValue,
                  {
                    color:
                      statusFilter === 'all'
                        ? theme.primaryText
                        : theme.primary,
                  },
                ]}>
                {schedules.length}
              </ThemedText>
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    statusFilter === 'all'
                      ? theme.primaryText
                      : theme.textSecondary,
                  fontSize: 11,
                }}>
                Semua Jadwal
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setStatusFilter('open')}
              style={({ pressed }) => [
                styles.statCard,
                {
                  backgroundColor:
                    statusFilter === 'open'
                      ? theme.primary
                      : theme.glassCard,
                  borderColor:
                    statusFilter === 'open'
                      ? theme.primary
                      : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <View style={styles.statValueRow}>
                <ThemedText
                  type="subtitle"
                  style={[
                    styles.statValue,
                    {
                      color:
                        statusFilter === 'open'
                          ? theme.primaryText
                          : theme.primary,
                    },
                  ]}>
                  {openSessionsCount}
                </ThemedText>
                {openSessionsCount > 0 && (
                  <View style={styles.pulseDot} />
                )}
              </View>
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    statusFilter === 'open'
                      ? theme.primaryText
                      : theme.textSecondary,
                  fontSize: 11,
                }}>
                Sesi Dibuka
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setStatusFilter('scheduled')}
              style={({ pressed }) => [
                styles.statCard,
                {
                  backgroundColor:
                    statusFilter === 'scheduled'
                      ? theme.primary
                      : theme.glassCard,
                  borderColor:
                    statusFilter === 'scheduled'
                      ? theme.primary
                      : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="subtitle"
                style={[
                  styles.statValue,
                  {
                    color:
                      statusFilter === 'scheduled'
                        ? theme.primaryText
                        : theme.primary,
                  },
                ]}>
                {scheduledSessionsCount}
              </ThemedText>
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    statusFilter === 'scheduled'
                      ? theme.primaryText
                      : theme.textSecondary,
                  fontSize: 11,
                }}>
                Terjadwal
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setStatusFilter('closed')}
              style={({ pressed }) => [
                styles.statCard,
                {
                  backgroundColor:
                    statusFilter === 'closed'
                      ? theme.primary
                      : theme.glassCard,
                  borderColor:
                    statusFilter === 'closed'
                      ? theme.primary
                      : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="subtitle"
                style={[
                  styles.statValue,
                  {
                    color:
                      statusFilter === 'closed'
                        ? theme.primaryText
                        : theme.primary,
                  },
                ]}>
                {closedSessionsCount}
              </ThemedText>
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    statusFilter === 'closed'
                      ? theme.primaryText
                      : theme.textSecondary,
                  fontSize: 11,
                }}>
                Ditutup
              </ThemedText>
            </Pressable>
          </View>

          {/* Main Navigation Tabs */}
          <View
            style={[
              styles.tabNavContainer,
              {
                backgroundColor: theme.glassCard,
                borderColor: theme.border,
              },
            ]}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'jadwal' }}
              onPress={() => setActiveTab('jadwal')}
              style={({ pressed }) => [
                styles.tabNavButton,
                {
                  backgroundColor:
                    activeTab === 'jadwal' ? theme.primary : 'transparent',
                },
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    activeTab === 'jadwal'
                      ? theme.primaryText
                      : theme.text,
                }}>
                Jadwal & Sesi Praktikum
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'rekap' }}
              onPress={() => setActiveTab('rekap')}
              style={({ pressed }) => [
                styles.tabNavButton,
                {
                  backgroundColor:
                    activeTab === 'rekap' ? theme.primary : 'transparent',
                },
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    activeTab === 'rekap'
                      ? theme.primaryText
                      : theme.text,
                }}>
                Rekap Presensi Mahasiswa
              </ThemedText>
            </Pressable>
          </View>

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

                {/* Filter Chips & PJ Toggle */}
                <View style={styles.filterRow}>
                  <View style={styles.filterChipsScroll}>
                    <View style={styles.filterChipsContainer}>
                    <Pressable
                      onPress={() => setStatusFilter('all')}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            statusFilter === 'all'
                              ? theme.primary
                              : theme.backgroundElement,
                          borderColor: theme.border,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
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
                        {
                          backgroundColor:
                            statusFilter === 'open'
                              ? theme.primary
                              : theme.backgroundElement,
                          borderColor: theme.border,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
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
                        {
                          backgroundColor:
                            statusFilter === 'scheduled'
                              ? theme.primary
                              : theme.backgroundElement,
                          borderColor: theme.border,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
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
                        {
                          backgroundColor:
                            statusFilter === 'closed'
                              ? theme.primary
                              : theme.backgroundElement,
                          borderColor: theme.border,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{
                          color:
                            statusFilter === 'closed'
                              ? theme.primaryText
                              : theme.text,
                        }}>
                        Ditutup ({closedSessionsCount})
                      </ThemedText>
                    </Pressable>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: onlyMySchedules }}
                    onPress={() => setOnlyMySchedules((prev) => !prev)}
                    style={[
                      styles.mySchedulesToggle,
                      {
                        backgroundColor: onlyMySchedules
                          ? theme.primary
                          : theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={{
                        color: onlyMySchedules
                          ? theme.primaryText
                          : theme.text,
                      }}>
                      {onlyMySchedules ? '✓ Jadwal Saya' : 'Jadwal Saya'}
                    </ThemedText>
                  </Pressable>
                </View>
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
                  {(statusFilter !== 'all' ||
                    onlyMySchedules ||
                    searchQuery) && (
                    <Pressable
                      onPress={() => {
                        setStatusFilter('all');
                        setOnlyMySchedules(false);
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
                    const isMySchedule = currentUser?.id === schedule.assistantId;

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

                    return (
                      <ThemedView
                        key={schedule.id}
                        type="backgroundElement"
                        style={[
                          styles.scheduleCard,
                          {
                            borderColor: isOpen
                              ? theme.primary
                              : theme.border,
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
                              {isMySchedule && (
                                <View
                                  style={[
                                    styles.pjBadge,
                                    { backgroundColor: theme.moss },
                                  ]}>
                                  <ThemedText
                                    type="smallBold"
                                    style={{
                                      color: theme.primaryText,
                                      fontSize: 10,
                                    }}>
                                    PJ SAYA
                                  </ThemedText>
                                </View>
                              )}
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
                              backgroundColor: theme.background,
                              borderColor: theme.border,
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
                              backgroundColor: isOpen
                                ? '#E8F0DC'
                                : isClosed
                                  ? '#F8EAEA'
                                  : '#F2EADB',
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

                        {/* Live Attendance Progress (SRS-06) */}
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

                        {/* Action Buttons Row (SRS-04, SRS-05, SRS-06) */}
                        <View style={styles.cardActionsRow}>
                          {/* Button: Lihat Detail Sesi & Rekap (SRS-04 & SRS-06) */}
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                              setSelectedSchedule(schedule);
                              setModalSubTab('detail');
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
                              Detail & Rekap
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

                          {/* Quick Session Toggle Button (SRS-05) */}
                          {session && (
                            <>
                              {isScheduled && (
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() =>
                                    handleOpenSession(session, schedule)
                                  }
                                  style={({ pressed }) => [
                                    styles.sessionActionButton,
                                    { backgroundColor: theme.primary },
                                    pressed && styles.pressed,
                                  ]}>
                                  <ThemedText
                                    type="smallBold"
                                    style={{ color: theme.primaryText }}>
                                    Buka Sesi Presensi
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
                                    { backgroundColor: theme.danger },
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
                                  onPress={() =>
                                    handleOpenSession(session, schedule)
                                  }
                                  style={({ pressed }) => [
                                    styles.sessionActionButton,
                                    {
                                      backgroundColor: theme.primary,
                                      borderColor: theme.primary,
                                      borderWidth: 1,
                                    },
                                    pressed && styles.pressed,
                                  ]}>
                                  <ThemedText
                                    type="smallBold"
                                    style={{ color: theme.primaryText }}>
                                    Buka Kembali
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
          {/* TAB 2: REKAP PRESENSI KESELURUHAN (SRS-06)                      */}
          {/* ============================================================== */}
          {activeTab === 'rekap' && (
            <View style={styles.tabContent}>
              {/* Rekap Header & Global Controls */}
              <View style={styles.rekapHeaderCard}>
                <ThemedText type="smallBold" style={{ fontSize: 16 }}>
                  Rekapitulasi Kehadiran Praktikan
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Pantau kehadiran seluruh praktikan di setiap jadwal praktikum
                  yang diselenggarakan.
                </ThemedText>

                {/* Filter Schedule Selector */}
                <View style={styles.rekapFilterSection}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Pilih Mata Praktikum:
                  </ThemedText>
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
                              : theme.backgroundElement,
                          borderColor: theme.border,
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
                        Semua Sesi
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
                                : theme.backgroundElement,
                            borderColor: theme.border,
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

                  {/* Praktikan Search */}
                  <View
                    style={[
                      styles.searchBox,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.border,
                        marginTop: Spacing.two,
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
                        <ThemedText type="small" themeColor="textSecondary">
                          ✕
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>

              {/* Rekap List per Schedule */}
              <View style={styles.scheduleList}>
                {schedules
                  .filter((schedule) =>
                    rekapSelectedScheduleId === 'all'
                      ? true
                      : schedule.id === rekapSelectedScheduleId,
                  )
                  .map((schedule) => {
                    const session = getSessionsForSchedule(schedule.id)[0];
                    if (!session) return null;

                    const {
                      attendedUsers,
                      excusedUsers,
                      absentUsers,
                      attendedCount,
                      excusedCount,
                      totalStudents,
                      percentage,
                    } = getSessionAttendanceData(session);

                    const filteredAttended = attendedUsers.filter((item) => {
                      if (!rekapSearchPraktikan.trim()) return true;
                      const q = rekapSearchPraktikan.toLowerCase();
                      return (
                        item.user.name.toLowerCase().includes(q) ||
                        item.user.identityNumber.toLowerCase().includes(q)
                      );
                    });

                    const filteredAbsent = absentUsers.filter((user) => {
                      if (!rekapSearchPraktikan.trim()) return true;
                      const q = rekapSearchPraktikan.toLowerCase();
                      return (
                        user.name.toLowerCase().includes(q) ||
                        user.identityNumber.toLowerCase().includes(q)
                      );
                    });
                    const filteredExcused = excusedUsers.filter((item) => {
                      if (!rekapSearchPraktikan.trim()) return true;
                      const q = rekapSearchPraktikan.toLowerCase();
                      return (
                        item.user.name.toLowerCase().includes(q) ||
                        item.user.identityNumber.toLowerCase().includes(q)
                      );
                    });

                    return (
                      <ThemedView
                        key={schedule.id}
                        type="backgroundElement"
                        style={[styles.rekapCard, { borderColor: theme.border }]}>
                        {/* Rekap Card Header */}
                        <View style={styles.rekapCardHeader}>
                          <View style={{ flex: 1, gap: Spacing.half }}>
                            <ThemedText type="subtitle">
                              {schedule.praktikum}
                            </ThemedText>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              {schedule.kelas} · {schedule.ruang} ·{' '}
                              {formatDate(schedule.date)} (
                              {schedule.startTime} - {schedule.endTime} WIB)
                            </ThemedText>
                          </View>
                          <SessionStatusBadge status={session.status} />
                        </View>

                        {/* Attendance Summary Bar */}
                        <View
                          style={[
                            styles.rekapSummaryBox,
                            {
                              backgroundColor: theme.background,
                              borderColor: theme.border,
                            },
                          ]}>
                          <View style={styles.rekapSummaryTextRow}>
                            <ThemedText type="smallBold">
                              {attendedCount} hadir · {excusedCount} izin ·{' '}
                              {Math.max(0, totalStudents - attendedCount - excusedCount)} belum hadir ({percentage}% hadir)
                            </ThemedText>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                handleCopyReport(schedule, session)
                              }
                              style={({ pressed }) => [
                                styles.copyMiniButton,
                                {
                                  backgroundColor: theme.primary,
                                },
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
                                backgroundColor: theme.backgroundElement,
                                borderColor: theme.border,
                              },
                            ]}>
                            <View
                              style={[
                                styles.progressBarFill,
                                {
                                  width: `${percentage}%`,
                                  backgroundColor: theme.primary,
                                },
                              ]}
                            />
                          </View>
                        </View>

                        {/* Praktikan List */}
                        <View style={styles.rekapPraktikanSection}>
                          <ThemedText
                            type="smallBold"
                            style={styles.rekapPraktikanSectionTitle}>
                            Daftar Mahasiswa & Waktu Kehadiran (SRS-06):
                          </ThemedText>

                          {filteredAttended.length === 0 &&
                          filteredExcused.length === 0 &&
                          filteredAbsent.length === 0 ? (
                            <ThemedText
                              type="small"
                              themeColor="textSecondary"
                              style={styles.noPraktikanMatch}>
                              Tidak ada praktikan yang cocok dengan pencarian.
                            </ThemedText>
                          ) : (
                            <View style={styles.praktikanRowsList}>
                              {/* Hadir List */}
                              {filteredAttended.map((item) => (
                                <View
                                  key={item.user.id}
                                  style={[
                                    styles.praktikanRow,
                                    {
                                      backgroundColor: '#F0F6E8',
                                      borderColor: theme.primary,
                                    },
                                  ]}>
                                  <View
                                    style={[
                                      styles.praktikanAvatar,
                                      {
                                        backgroundColor: theme.primary,
                                      },
                                    ]}>
                                    <ThemedText
                                      type="smallBold"
                                      style={{
                                        color: theme.primaryText,
                                        fontSize: 12,
                                      }}>
                                      {initials(item.user.name)}
                                    </ThemedText>
                                  </View>

                                  <View style={styles.praktikanMeta}>
                                    <ThemedText type="smallBold">
                                      {item.user.name}
                                    </ThemedText>
                                    <ThemedText
                                      type="small"
                                      themeColor="textSecondary">
                                      {item.user.identityNumber} ·{' '}
                                      {item.user.program}
                                    </ThemedText>
                                  </View>

                                  <View style={styles.praktikanAttendanceStatus}>
                                    <View
                                      style={[
                                        styles.statusChipHadir,
                                        {
                                          backgroundColor: theme.primary,
                                        },
                                      ]}>
                                      <ThemedText
                                        type="smallBold"
                                        style={{
                                          color: theme.primaryText,
                                          fontSize: 11,
                                        }}>
                                        ✓ Hadir
                                      </ThemedText>
                                    </View>
                                    <ThemedText
                                      type="smallBold"
                                      style={styles.timestampText}>
                                      {formatTimeWithSeconds(item.checkedInAt)}{' '}
                                      WIB
                                    </ThemedText>
                                  </View>
                                </View>
                              ))}

                              {filteredExcused.map((item) => (
                                <View key={item.user.id} style={[styles.praktikanRow, { backgroundColor: '#F8F1D9', borderColor: theme.moss }]}>
                                  <View style={[styles.praktikanAvatar, { backgroundColor: theme.moss }]}><ThemedText type="smallBold" style={{ color: theme.primaryText, fontSize: 12 }}>{initials(item.user.name)}</ThemedText></View>
                                  <View style={styles.praktikanMeta}><ThemedText type="smallBold">{item.user.name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{item.user.identityNumber} · {item.user.program}</ThemedText></View>
                                  <View style={styles.praktikanAttendanceStatus}><View style={[styles.statusChipBelumHadir, { backgroundColor: '#E9E2C8', borderColor: theme.moss }]}><ThemedText type="smallBold" style={{ color: theme.text, fontSize: 11 }}>✓ Izin Disetujui</ThemedText></View><ThemedText type="small" themeColor="textSecondary" style={styles.timestampText}>{item.excusedAt ? `${formatTimeWithSeconds(item.excusedAt)} WIB` : 'Disetujui'}</ThemedText></View>
                                </View>
                              ))}

                              {/* Belum Hadir List */}
                              {filteredAbsent.map((user) => (
                                <View
                                  key={user.id}
                                  style={[
                                    styles.praktikanRow,
                                    {
                                      backgroundColor: theme.background,
                                      borderColor: theme.border,
                                    },
                                  ]}>
                                  <View
                                    style={[
                                      styles.praktikanAvatar,
                                      {
                                        backgroundColor: theme.moss,
                                      },
                                    ]}>
                                    <ThemedText
                                      type="smallBold"
                                      style={{
                                        color: theme.primaryText,
                                        fontSize: 12,
                                      }}>
                                      {initials(user.name)}
                                    </ThemedText>
                                  </View>

                                  <View style={styles.praktikanMeta}>
                                    <ThemedText type="smallBold">
                                      {user.name}
                                    </ThemedText>
                                    <ThemedText
                                      type="small"
                                      themeColor="textSecondary">
                                      {user.identityNumber} · {user.program}
                                    </ThemedText>
                                  </View>

                                  <View style={styles.praktikanAttendanceStatus}>
                                    <View
                                      style={[
                                        styles.statusChipBelumHadir,
                                        {
                                          backgroundColor: '#EAE4D7',
                                          borderColor: theme.border,
                                        },
                                      ]}>
                                      <ThemedText
                                        type="small"
                                        themeColor="textSecondary"
                                        style={{ fontSize: 11 }}>
                                        Belum Hadir
                                      </ThemedText>
                                    </View>
                                    <ThemedText
                                      type="small"
                                      themeColor="textSecondary"
                                      style={styles.timestampText}>
                                      -
                                    </ThemedText>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      </ThemedView>
                    );
                  })}
              </View>
            </View>
          )}

          {/* ============================================================== */}
          {/* MODAL DETAIL SESI & REKAP KEHADIRAN LENGKAP (SRS-04, 05, 06)   */}
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

                    {/* Modal Sub-Tabs Navigation */}
                    <View style={styles.modalSubTabContainer}>
                      <Pressable
                        accessibilityRole="tab"
                        onPress={() => setModalSubTab('detail')}
                        style={[
                          styles.modalSubTabButton,
                          {
                            backgroundColor:
                              modalSubTab === 'detail'
                                ? theme.primary
                                : theme.background,
                            borderColor: theme.border,
                          },
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={{
                            color:
                              modalSubTab === 'detail'
                                ? theme.primaryText
                                : theme.text,
                          }}>
                          Detail & Kontrol Sesi
                        </ThemedText>
                      </Pressable>

                      <Pressable
                        accessibilityRole="tab"
                        onPress={() => setModalSubTab('rekap')}
                        style={[
                          styles.modalSubTabButton,
                          {
                            backgroundColor:
                              modalSubTab === 'rekap'
                                ? theme.primary
                                : theme.background,
                            borderColor: theme.border,
                          },
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={{
                            color:
                              modalSubTab === 'rekap'
                                ? theme.primaryText
                                : theme.text,
                          }}>
                          Rekap Presensi Sesi
                        </ThemedText>
                      </Pressable>
                    </View>

                    {/* SUBTAB 1: DETAIL SESI & KONTROL (SRS-04 & SRS-05) */}
                    {modalSubTab === 'detail' && (
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

                        {/* Section Status & Waktu Sesi (SRS-04 & SRS-05) */}
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
                            Status Sesi & Waktu Operasional
                          </ThemedText>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              ID Sesi
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {activeModalSession.id}
                            </ThemedText>
                          </View>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              Status Presensi
                            </ThemedText>
                            <SessionStatusBadge
                              status={activeModalSession.status}
                            />
                          </View>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              Waktu Sesi Dibuka
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {activeModalSession.openedAt
                                ? `${formatDateTimeWithSeconds(activeModalSession.openedAt)} WIB`
                                : '-'}
                            </ThemedText>
                          </View>

                          <View style={styles.modalDetailRow}>
                            <ThemedText
                              type="small"
                              themeColor="textSecondary">
                              Waktu Sesi Ditutup
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {activeModalSession.closedAt
                                ? `${formatDateTimeWithSeconds(activeModalSession.closedAt)} WIB`
                                : '-'}
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

                          {activeModalSession.status === 'scheduled' && (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                handleOpenSession(
                                  activeModalSession,
                                  selectedSchedule,
                                )
                              }
                              style={({ pressed }) => [
                                styles.primaryActionButton,
                                { backgroundColor: theme.primary },
                                pressed && styles.pressed,
                              ]}>
                              <ThemedText
                                type="smallBold"
                                style={{
                                  color: theme.primaryText,
                                  fontSize: 15,
                                }}>
                                Buka Sesi Presensi Sekarang
                              </ThemedText>
                            </Pressable>
                          )}

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
                                { backgroundColor: theme.danger },
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

                          {activeModalSession.status === 'closed' && (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                handleOpenSession(
                                  activeModalSession,
                                  selectedSchedule,
                                )
                              }
                              style={({ pressed }) => [
                                styles.primaryActionButton,
                                {
                                  backgroundColor: theme.primary,
                                },
                                pressed && styles.pressed,
                              ]}>
                              <ThemedText
                                type="smallBold"
                                style={{
                                  color: theme.primaryText,
                                  fontSize: 15,
                                }}>
                                Buka Kembali Sesi Presensi
                              </ThemedText>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    )}

                    {/* SUBTAB 2: REKAP PRESENSI SESI (SRS-06) */}
                    {modalSubTab === 'rekap' && (
                      <View style={styles.modalTabBody}>
                        {(() => {
                          const {
                            attendedUsers,
                            excusedUsers,
                            absentUsers,
                            attendedCount,
                            excusedCount,
                            totalStudents,
                            percentage,
                          } = getSessionAttendanceData(activeModalSession);

                          const filteredAttended = attendedUsers.filter(
                            (item) => {
                              if (!modalSearchPraktikan.trim()) return true;
                              const q = modalSearchPraktikan.toLowerCase();
                              return (
                                item.user.name.toLowerCase().includes(q) ||
                                item.user.identityNumber
                                  .toLowerCase()
                                  .includes(q)
                              );
                            },
                          );

                          const filteredAbsent = absentUsers.filter((user) => {
                            if (!modalSearchPraktikan.trim()) return true;
                            const q = modalSearchPraktikan.toLowerCase();
                            return (
                              user.name.toLowerCase().includes(q) ||
                              user.identityNumber.toLowerCase().includes(q)
                            );
                          });
                          const filteredExcused = excusedUsers.filter((item) => {
                            if (!modalSearchPraktikan.trim()) return true;
                            const q = modalSearchPraktikan.toLowerCase();
                            return (
                              item.user.name.toLowerCase().includes(q) ||
                              item.user.identityNumber.toLowerCase().includes(q)
                            );
                          });

                          return (
                            <>
                              {/* Rekap Metrics Card */}
                              <View
                                style={[
                                  styles.modalSectionCard,
                                  {
                                    backgroundColor: theme.background,
                                    borderColor: theme.border,
                                  },
                                ]}>
                                <View style={styles.modalRekapMetricHeader}>
                                  <View style={{ flex: 1 }}>
                                    <ThemedText type="smallBold">
                                      Tingkat Kehadiran Kelas
                                    </ThemedText>
                                    <ThemedText
                                      type="small"
                                      themeColor="textSecondary">
                                      {attendedCount} hadir · {excusedCount} izin ·{' '}
                                      {Math.max(0, totalStudents - attendedCount - excusedCount)} belum hadir ({percentage}% hadir)
                                    </ThemedText>
                                  </View>
                                  <Pressable
                                    accessibilityRole="button"
                                    onPress={() =>
                                      handleCopyReport(
                                        selectedSchedule,
                                        activeModalSession,
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
                                      backgroundColor: theme.backgroundElement,
                                      borderColor: theme.border,
                                    },
                                  ]}>
                                  <View
                                    style={[
                                      styles.progressBarFill,
                                      {
                                        width: `${percentage}%`,
                                        backgroundColor: theme.primary,
                                      },
                                    ]}
                                  />
                                </View>
                              </View>

                              {/* Search & Status Filter Inside Modal */}
                              <View style={styles.modalSearchSection}>
                                <View
                                  style={[
                                    styles.searchBox,
                                    {
                                      backgroundColor: theme.background,
                                      borderColor: theme.border,
                                    },
                                  ]}>
                                  <TextInput
                                    value={modalSearchPraktikan}
                                    onChangeText={setModalSearchPraktikan}
                                    placeholder="Cari nama atau NIM mahasiswa..."
                                    placeholderTextColor="#7F735B"
                                    style={[
                                      styles.searchInput,
                                      { color: theme.text },
                                    ]}
                                  />
                                </View>

                                <View style={styles.filterChipsContainer}>
                                  <Pressable
                                    onPress={() =>
                                      setModalAttendanceFilter('all')
                                    }
                                    style={[
                                      styles.chip,
                                      {
                                        backgroundColor:
                                          modalAttendanceFilter === 'all'
                                            ? theme.primary
                                            : theme.background,
                                        borderColor: theme.border,
                                      },
                                    ]}>
                                    <ThemedText
                                      type="smallBold"
                                      style={{
                                        color:
                                          modalAttendanceFilter === 'all'
                                            ? theme.primaryText
                                            : theme.text,
                                      }}>
                                      Semua ({totalStudents})
                                    </ThemedText>
                                  </Pressable>

                                  <Pressable
                                    onPress={() =>
                                      setModalAttendanceFilter('attended')
                                    }
                                    style={[
                                      styles.chip,
                                      {
                                        backgroundColor:
                                          modalAttendanceFilter === 'attended'
                                            ? theme.primary
                                            : theme.background,
                                        borderColor: theme.border,
                                      },
                                    ]}>
                                    <ThemedText
                                      type="smallBold"
                                      style={{
                                        color:
                                          modalAttendanceFilter === 'attended'
                                            ? theme.primaryText
                                            : theme.text,
                                      }}>
                                      Hadir ({attendedCount})
                                    </ThemedText>
                                  </Pressable>

                                  <Pressable
                                    onPress={() => setModalAttendanceFilter('excused')}
                                    style={[styles.chip, { backgroundColor: modalAttendanceFilter === 'excused' ? theme.primary : theme.background, borderColor: theme.border }]}>
                                    <ThemedText type="smallBold" style={{ color: modalAttendanceFilter === 'excused' ? theme.primaryText : theme.text }}>
                                      Izin ({excusedCount})
                                    </ThemedText>
                                  </Pressable>

                                  <Pressable
                                    onPress={() =>
                                      setModalAttendanceFilter('absent')
                                    }
                                    style={[
                                      styles.chip,
                                      {
                                        backgroundColor:
                                          modalAttendanceFilter === 'absent'
                                            ? theme.primary
                                            : theme.background,
                                        borderColor: theme.border,
                                      },
                                    ]}>
                                    <ThemedText
                                      type="smallBold"
                                      style={{
                                        color:
                                          modalAttendanceFilter === 'absent'
                                            ? theme.primaryText
                                            : theme.text,
                                      }}>
                                      Belum Hadir ({absentUsers.length})
                                    </ThemedText>
                                  </Pressable>
                                </View>
                              </View>

                              {/* Praktikan List in Modal */}
                              <View style={styles.modalPraktikanList}>
                                {(modalAttendanceFilter === 'all' ||
                                  modalAttendanceFilter === 'attended') &&
                                  filteredAttended.map((item) => (
                                    <View
                                      key={item.user.id}
                                      style={[
                                        styles.praktikanRow,
                                        {
                                          backgroundColor: '#F0F6E8',
                                          borderColor: theme.primary,
                                        },
                                      ]}>
                                      <View
                                        style={[
                                          styles.praktikanAvatar,
                                          { backgroundColor: theme.primary },
                                        ]}>
                                        <ThemedText
                                          type="smallBold"
                                          style={{
                                            color: theme.primaryText,
                                            fontSize: 12,
                                          }}>
                                          {initials(item.user.name)}
                                        </ThemedText>
                                      </View>

                                      <View style={styles.praktikanMeta}>
                                        <ThemedText type="smallBold">
                                          {item.user.name}
                                        </ThemedText>
                                        <ThemedText
                                          type="small"
                                          themeColor="textSecondary">
                                          {item.user.identityNumber} ·{' '}
                                          {item.user.program}
                                        </ThemedText>
                                      </View>

                                      <View
                                        style={styles.praktikanAttendanceStatus}>
                                        <View
                                          style={[
                                            styles.statusChipHadir,
                                            { backgroundColor: theme.primary },
                                          ]}>
                                          <ThemedText
                                            type="smallBold"
                                            style={{
                                              color: theme.primaryText,
                                              fontSize: 11,
                                            }}>
                                            ✓ Hadir
                                          </ThemedText>
                                        </View>
                                        <ThemedText
                                          type="smallBold"
                                          style={styles.timestampText}>
                                          {formatTimeWithSeconds(
                                            item.checkedInAt,
                                          )}{' '}
                                          WIB
                                        </ThemedText>
                                      </View>
                                    </View>
                                  ))}

                                {(modalAttendanceFilter === 'all' || modalAttendanceFilter === 'excused') &&
                                  filteredExcused.map((item) => (
                                    <View key={item.user.id} style={[styles.praktikanRow, { backgroundColor: '#F8F1D9', borderColor: theme.moss }]}>
                                      <View style={[styles.praktikanAvatar, { backgroundColor: theme.moss }]}><ThemedText type="smallBold" style={{ color: theme.primaryText, fontSize: 12 }}>{initials(item.user.name)}</ThemedText></View>
                                      <View style={styles.praktikanMeta}><ThemedText type="smallBold">{item.user.name}</ThemedText><ThemedText type="small" themeColor="textSecondary">{item.user.identityNumber} · {item.user.program}</ThemedText></View>
                                      <View style={styles.praktikanAttendanceStatus}><View style={[styles.statusChipBelumHadir, { backgroundColor: '#E9E2C8', borderColor: theme.moss }]}><ThemedText type="smallBold" style={{ color: theme.text, fontSize: 11 }}>✓ Izin Disetujui</ThemedText></View><ThemedText type="small" themeColor="textSecondary" style={styles.timestampText}>{item.excusedAt ? `${formatTimeWithSeconds(item.excusedAt)} WIB` : 'Disetujui'}</ThemedText></View>
                                    </View>
                                  ))}

                                {(modalAttendanceFilter === 'all' ||
                                  modalAttendanceFilter === 'absent') &&
                                  filteredAbsent.map((user) => (
                                    <View
                                      key={user.id}
                                      style={[
                                        styles.praktikanRow,
                                        {
                                          backgroundColor: theme.background,
                                          borderColor: theme.border,
                                        },
                                      ]}>
                                      <View
                                        style={[
                                          styles.praktikanAvatar,
                                          { backgroundColor: theme.moss },
                                        ]}>
                                        <ThemedText
                                          type="smallBold"
                                          style={{
                                            color: theme.primaryText,
                                            fontSize: 12,
                                          }}>
                                          {initials(user.name)}
                                        </ThemedText>
                                      </View>

                                      <View style={styles.praktikanMeta}>
                                        <ThemedText type="smallBold">
                                          {user.name}
                                        </ThemedText>
                                        <ThemedText
                                          type="small"
                                          themeColor="textSecondary">
                                          {user.identityNumber} · {user.program}
                                        </ThemedText>
                                      </View>

                                      <View
                                        style={styles.praktikanAttendanceStatus}>
                                        <View
                                          style={[
                                            styles.statusChipBelumHadir,
                                            {
                                              backgroundColor: '#EAE4D7',
                                              borderColor: theme.border,
                                            },
                                          ]}>
                                          <ThemedText
                                            type="small"
                                            themeColor="textSecondary"
                                            style={{ fontSize: 11 }}>
                                            Belum Hadir
                                          </ThemedText>
                                        </View>
                                        <ThemedText
                                          type="small"
                                          themeColor="textSecondary"
                                          style={styles.timestampText}>
                                          -
                                        </ThemedText>
                                      </View>
                                    </View>
                                  ))}

                                {filteredAttended.length === 0 &&
                                  filteredExcused.length === 0 &&
                                  filteredAbsent.length === 0 && (
                                    <ThemedText
                                      type="small"
                                      themeColor="textSecondary"
                                      style={styles.noPraktikanMatch}>
                                      Tidak ada mahasiswa yang cocok.
                                    </ThemedText>
                                  )}
                              </View>
                            </>
                          );
                        })()}
                      </View>
                    )}

                    {/* Modal Close Button */}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSelectedSchedule(null)}
                      style={({ pressed }) => [
                        styles.modalCloseButton,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                        },
                        pressed && styles.pressed,
                      ]}>
                      <ThemedText type="smallBold">Tutup Modal</ThemedText>
                    </Pressable>
                  </ScrollView>
                )}
              </ThemedView>
            </View>
          </Modal>

          {/* ============================================================== */}
          {/* MODAL KONFIRMASI BUKA / TUTUP SESI (SRS-05)                     */}
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
          {/* MODAL TEKS REKAP LAPORAN PRESENSI (SRS-06)                     */}
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
  headerGlassCard: {
    padding: Spacing.four,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  headerUserPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#889063',
    borderWidth: 1,
    borderColor: '#AAB18B',
  },
  manageDataButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 16,
    borderWidth: 1,
    gap: Spacing.two,
  },
  manageDataButtonText: {
    flex: 1,
  },
  manageDataButtonArrow: {
    fontSize: 18,
  },
  header: {
    gap: Spacing.half,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    borderWidth: 1,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    backgroundColor: '#889063',
    borderWidth: 1,
    borderColor: '#AAB18B',
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 28,
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  permissionRequestsButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginTop: Spacing.two,
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
  filterRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  filterChipsScroll: {
    width: '100%',
  },
  filterChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingVertical: Spacing.half,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  mySchedulesToggle: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1.5,
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
    borderRadius: 22,
    borderWidth: 1.5,
    gap: Spacing.three,
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
  pjBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
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
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
  },
  rekapHeaderCard: {
    gap: Spacing.one,
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
    gap: Spacing.two,
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
  modalSubTabContainer: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  modalSubTabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 8,
    borderWidth: 1,
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
    borderRadius: 8,
  },
  modalRekapMetricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  modalSearchSection: {
    gap: Spacing.two,
  },
  modalPraktikanList: {
    gap: Spacing.two,
  },
  modalCloseButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: Spacing.two,
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
});
