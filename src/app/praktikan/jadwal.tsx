import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { SessionStatusBadge } from "@/components/session-status-badge";
import {
  DashboardCapsule,
  DashboardTabs,
} from "@/components/dashboard-ui";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing, Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { getAttendanceLocation } from "@/services/attendance-location";
import { useApp } from "@/state/app-context";
import type { Schedule, Session } from "@/types";
import { formatDate, formatDateTime, formatTime } from "@/utils/format";

type TabMode = "jadwal" | "riwayat";
type ScheduleFilter = "all" | "open" | "recorded";

export default function PraktikanJadwalScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    schedules,
    sessions,
    checkIn,
    hasCheckedIn,
    isExcused,
    getUser,
    getSessionsForSchedule,
    getAttendanceForUser,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TabMode>("jadwal");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("all");
  const [expandedHistoryScheduleId, setExpandedHistoryScheduleId] = useState<
    string | null
  >(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(
    null,
  );
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [retryableCheckIn, setRetryableCheckIn] = useState<{
    session: Session;
    schedule: Schedule;
  } | null>(null);

  const myAttendance = currentUser ? getAttendanceForUser(currentUser.id) : [];
  const historyGroups = new Map<
    string,
    { schedule: Schedule; scheduleIds: Set<string> }
  >();
  schedules.forEach((schedule) => {
    const key = `${schedule.praktikum.trim().toLocaleLowerCase()}::${schedule.kelas.trim().toLocaleLowerCase()}`;
    const existingGroup = historyGroups.get(key);
    if (existingGroup) {
      existingGroup.scheduleIds.add(schedule.id);
    } else {
      historyGroups.set(key, {
        schedule,
        scheduleIds: new Set([schedule.id]),
      });
    }
  });
  const historyBySchedule = [...historyGroups.values()].map(
    ({ schedule, scheduleIds }) => ({
      schedule,
      records: myAttendance.filter((record) => {
        const session = sessions.find((item) => item.id === record.sessionId);
        return session ? scheduleIds.has(session.scheduleId) : false;
      }),
    }),
  );

  const openSessions = sessions.filter((s) => s.status === "open");
  const openSessionCount = openSessions.length;
  const recordedScheduleCount = schedules.filter((schedule) => {
    const session = getSessionsForSchedule(schedule.id)[0];
    return Boolean(
      session &&
        currentUser &&
        (hasCheckedIn(session.id, currentUser.id) ||
          isExcused(session.id, currentUser.id)),
    );
  }).length;
  const filteredSchedules = schedules.filter((schedule) => {
    if (scheduleFilter === "all") return true;

    const session = getSessionsForSchedule(schedule.id)[0];
    if (scheduleFilter === "open") return session?.status === "open";

    return Boolean(
      session &&
        currentUser &&
        (hasCheckedIn(session.id, currentUser.id) ||
          isExcused(session.id, currentUser.id)),
    );
  });

  function selectScheduleFilter(filter: ScheduleFilter) {
    setScheduleFilter(filter);
    setActiveTab("jadwal");
  }

  const activeModalSession = selectedSchedule
    ? getSessionsForSchedule(selectedSchedule.id)[0]
    : null;

  const isCheckedInForActiveModal =
    activeModalSession && currentUser
      ? hasCheckedIn(activeModalSession.id, currentUser.id)
      : false;
  const isExcusedForActiveModal =
    activeModalSession && currentUser
      ? isExcused(activeModalSession.id, currentUser.id)
      : false;

  function showMessage(title: string, message: string) {
    setRetryableCheckIn(null);
    if (Platform.OS === "web") {
      setFeedbackMessage(`${title}: ${message}`);
      setTimeout(() => setFeedbackMessage(null), 3500);
    } else {
      Alert.alert(title, message);
    }
  }

  function showCheckInNetworkError(session: Session, schedule: Schedule) {
    const message = 'Koneksi jaringan terganggu. Periksa koneksi lalu coba presensi lagi.';
    if (Platform.OS === 'web') {
      setFeedbackMessage(message);
      setRetryableCheckIn({ session, schedule });
      return;
    }

    Alert.alert('Jaringan Terganggu', message, [
      { text: 'Tutup', style: 'cancel' },
      {
        text: 'Coba lagi',
        onPress: () => void handleCheckIn(session, schedule),
      },
    ]);
  }

  async function handleCheckIn(session: Session, schedule: Schedule) {
    if (!currentUser) return;

    if (session.status !== "open") {
      showMessage(
        "Presensi Belum Dibuka",
        "Sesi praktikum ini belum dibuka oleh asisten lab.",
      );
      return;
    }

    if (hasCheckedIn(session.id, currentUser.id)) {
      showMessage(
        "Sudah Presensi",
        "Anda sudah melakukan presensi pada sesi ini sebelumnya.",
      );
      return;
    }
    if (isExcused(session.id, currentUser.id)) {
      showMessage(
        'Izin Disetujui',
        'Pengajuan izin untuk sesi ini sudah disetujui. Kamu tidak perlu presensi manual.',
      );
      return;
    }

    const locationResult = await getAttendanceLocation();
    if (!locationResult.ok) {
      if (locationResult.reason === 'permission-denied') {
        showMessage(
          'Izin Lokasi Diperlukan',
          locationResult.canAskAgain
            ? 'Izinkan Labora mengakses lokasi saat aplikasi digunakan untuk melakukan presensi. Tekan tombol presensi lagi setelah memberi izin.'
            : 'Izin lokasi ditolak. Aktifkan melalui Pengaturan perangkat: Aplikasi > Labora > Izin > Lokasi, lalu coba presensi lagi.',
        );
      } else if (locationResult.reason === 'services-disabled') {
        showMessage(
          'GPS Tidak Aktif',
          'Aktifkan Lokasi/GPS pada perangkat, lalu tekan tombol presensi lagi.',
        );
      } else {
        showMessage(
          'Lokasi Belum Tersedia',
          'Koordinat perangkat belum berhasil diperoleh. Periksa pengaturan lokasi dan coba lagi.',
        );
      }
      return;
    }

    let result: Awaited<ReturnType<typeof checkIn>>;
    try {
      result = await checkIn(session.id, currentUser.id);
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error
          ? String(error.code)
          : '';
      if (['unavailable', 'network-request-failed', 'deadline-exceeded'].includes(code)) {
        showCheckInNetworkError(session, schedule);
        return;
      }
      showMessage(
        code === 'permission-denied'
          ? 'Presensi ditolak oleh Firestore'
          : 'Presensi gagal',
        code === 'permission-denied'
          ? 'Aturan Firestore untuk attendance menolak pembacaan atau penyimpanan. Pastikan firestore.rules terbaru sudah dipublikasikan pada project labora-89bf3.'
          : error instanceof Error
            ? error.message
            : 'Periksa koneksi lalu coba lagi.',
      );
      return;
    }

    if (result.ok) {
      showMessage(
        "Presensi Berhasil",
        `Kehadiran Anda pada ${schedule.praktikum} (${schedule.kelas}) tercatat pada ${formatTime(result.record.checkedInAt ?? new Date().toISOString())}.`,
      );
      return;
    }

    if (result.reason === "already-checked-in") {
      showMessage(
        "Sudah Presensi",
        "Kamu sudah melakukan presensi pada sesi ini.",
      );
    } else if (result.reason === "not-open") {
      showMessage(
        "Presensi Belum Dibuka",
        "Sesi praktikum belum dibuka atau sudah ditutup.",
      );
    } else if (result.reason === "unknown-session") {
      showMessage("Gagal", "Sesi praktikum tidak ditemukan.");
    } else if (result.reason === "excused") {
      showMessage(
        'Izin Disetujui',
        'Kamu sudah berstatus izin untuk sesi ini dan tidak perlu presensi manual.',
      );
    } else if (result.reason === "unauthorized") {
      showMessage(
        "Akses Ditolak",
        "Kamu tidak memiliki akses untuk melakukan presensi.",
      );
    }  else if (result.reason === "outside-window") {
      showMessage(
        "Waktu Habis",
        "Waktu praktikum sudah berakhir. Presensi tidak dapat dilakukan.",
      );
    } else if (result.reason === "invalid-role") {
      showMessage(
        "Akses Ditolak",
        "Hanya praktikan yang dapat melakukan presensi.",
      );
    }
  }

  return (
    <ThemedView
      style={[
        styles.screen,
        {
          backgroundImage: `linear-gradient(180deg, ${theme.glassInput} 0%, ${theme.background} 58%, ${theme.primary} 100%)`,
        },
      ]}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 90 },
          ]}
        >
          {/* Top Big Dark Capsule Container (Persis Desain Figma) */}
          <DashboardCapsule
            title="Jadwal & Presensi"
            subtitle="Pantau kehadiran dan sesi aktifmu hari ini"
            actions={[
              {
                label: 'Ajukan Izin',
                onPress: () => router.push('/praktikan/izin'),
              },
              {
                label: 'Pemberitahuan',
                onPress: () => router.push('/praktikan/notifikasi'),
              },
            ]}
            stats={[
              { label: 'Semua Jadwal', value: schedules.length, active: scheduleFilter === 'all', onPress: () => selectScheduleFilter('all') },
              { label: 'Sesi Dibuka', value: openSessionCount, active: scheduleFilter === 'open', onPress: () => selectScheduleFilter('open') },
              { label: 'Absensi', value: recordedScheduleCount, active: scheduleFilter === 'recorded', onPress: () => selectScheduleFilter('recorded') },
            ]}
          />

          {/* Feedback toast */}
          {feedbackMessage ? (
            <View
              style={[
                styles.feedbackToast,
                { backgroundColor: theme.primary, borderColor: theme.border },
              ]}
            >
              <ThemedText style={styles.feedbackToastText}>
                {feedbackMessage}
              </ThemedText>
              {retryableCheckIn ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleCheckIn(retryableCheckIn.session, retryableCheckIn.schedule)}
                  style={styles.feedbackRetryButton}
                >
                  <ThemedText type="smallBold" style={styles.feedbackRetryText}>
                    Coba lagi
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Asymmetric Nav Tabs Container (Jadwal Praktikum vs Riwayat Kehadiran) */}
          <DashboardTabs
            tabs={[
              { key: 'jadwal', label: 'Jadwal Praktikum', active: activeTab === 'jadwal', onPress: () => setActiveTab('jadwal') },
              { key: 'riwayat', label: 'Riwayat Kehadiran', active: activeTab === 'riwayat', onPress: () => setActiveTab('riwayat') },
            ]}
          />

          {/* TAB CONTENT: JADWAL & DETAIL SESI */}
          {activeTab === "jadwal" && (
            <View style={styles.list}>
              {filteredSchedules.length === 0 ? (
                <ThemedView type="backgroundElement" style={styles.empty}>
                  <ThemedText type="smallBold">
                    {schedules.length === 0
                      ? "Belum ada jadwal praktikum"
                      : "Tidak ada jadwal untuk filter ini"}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {schedules.length === 0
                      ? "Jadwal praktikum akan ditampilkan di sini."
                      : "Pilih ringkasan lain untuk melihat jadwal."}
                  </ThemedText>
                </ThemedView>
              ) : (
                filteredSchedules.map((schedule) => {
                  const session = getSessionsForSchedule(schedule.id)[0];
                  const isOpen = session?.status === "open";
                  const isCheckedIn =
                    session && currentUser
                      ? hasCheckedIn(session.id, currentUser.id)
                      : false;
                  const isExcusedForSchedule =
                    session && currentUser
                      ? isExcused(session.id, currentUser.id)
                      : false;
                  const assistant = getUser(schedule.assistantId);

                  return (
                    <View
                      key={schedule.id}
                      style={[
                        styles.card,
                        {
                          backgroundColor: 'rgba(247, 241, 231, 0.62)',
                          backgroundImage: `linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(247, 241, 231, 0.78) 36%, rgba(237, 228, 213, 0.72) 100%)`,
                          borderColor: theme.glassBorderHighlight,
                          ...(Platform.OS === 'web'
                            ? ({ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object)
                            : {}),
                        },
                        isOpen && styles.cardHighlight,
                      ]}
                    >
                      {/* Header Card */}
                      <View style={styles.cardHeader}>
                        <View style={styles.cardHeaderTitle}>
                          <ThemedText
                            type="subtitle"
                            style={styles.praktikumTitle}
                          >
                            {schedule.praktikum}
                          </ThemedText>
                          <ThemedText type="small" style={{ color: theme.textSecondary, opacity: 0.82 }}>
                            {schedule.kelas} · {schedule.ruang}
                          </ThemedText>
                        </View>
                        <SessionStatusBadge
                          status={session?.status ?? "scheduled"}
                        />
                      </View>

                      {/* Detail Info Waktu & Tanggal */}
                      <View style={styles.infoRow}>
                        <View style={styles.infoItem}>
                          <ThemedText type="small" style={{ color: theme.textSecondary, opacity: 0.82 }}>
                            Waktu
                          </ThemedText>
                          <ThemedText type="smallBold" style={{ color: theme.primary }}>
                            {schedule.startTime} - {schedule.endTime} WIB
                          </ThemedText>
                        </View>
                        <View style={styles.infoDivider} />
                        <View style={styles.infoItem}>
                          <ThemedText type="small" style={{ color: theme.textSecondary, opacity: 0.82 }}>
                            Tanggal
                          </ThemedText>
                          <ThemedText type="smallBold" style={{ color: theme.primary }}>
                            {formatDate(schedule.date)}
                          </ThemedText>
                        </View>
                      </View>

                      {/* Asisten Lab */}
                      {assistant ? (
                        <View style={styles.assistantBadge}>
                          <ThemedText type="small" style={{ color: theme.textSecondary, opacity: 0.82 }}>
                            Asisten Pengampu:
                          </ThemedText>
                          <ThemedText type="smallBold" style={{ color: theme.primary }}>
                            {assistant.name}
                          </ThemedText>
                        </View>
                      ) : null}

                      {/* Action Buttons: Detail & Presensi */}
                      <View style={styles.actionRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSelectedSchedule(schedule)}
                          style={({ pressed }) => [
                            styles.detailButton,
                            pressed && styles.pressed,
                          ]}
                        >
                          <ThemedText type="smallBold" style={{ color: theme.primary }}>
                            Lihat Detail Sesi
                          </ThemedText>
                        </Pressable>

                        {/* Tombol Presensi Realtime */}
                        {isExcusedForSchedule ? (
                          <View
                            style={[
                              styles.checkedInBadge,
                              { backgroundColor: theme.warningSoft },
                            ]}>
                            <ThemedText
                              type="smallBold"
                              style={{ color: theme.text }}>
                              Izin Disetujui
                            </ThemedText>
                          </View>
                        ) : isOpen ? (
                          isCheckedIn ? (
                            <View
                              style={[
                                styles.checkedInBadge,
                                { backgroundColor: theme.successSoft },
                              ]}
                            >
                              <ThemedText
                                type="smallBold"
                                style={{ color: theme.success }}
                              >
                                Sudah Presensi
                              </ThemedText>
                            </View>
                          ) : (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() =>
                                session && handleCheckIn(session, schedule)
                              }
                              style={({ pressed }) => [
                                styles.checkInButton,
                                { backgroundColor: theme.success },
                                pressed && styles.pressed,
                              ]}
                            >
                              <ThemedText
                                type="smallBold"
                                style={{ color: "#FFFFFF" }}
                              >
                                Presensi Sekarang
                              </ThemedText>
                            </Pressable>
                          )
                        ) : session?.status === "closed" ? (
                          isCheckedIn ? (
                            <View
                              style={[
                                styles.checkedInBadge,
                                { backgroundColor: theme.successSoft },
                              ]}
                            >
                              <ThemedText
                                type="smallBold"
                                style={{ color: theme.success }}
                              >
                                Hadir
                              </ThemedText>
                            </View>
                          ) : (
                            <View
                              style={[
                                styles.checkedInBadge,
                                { backgroundColor: theme.dangerSoft },
                              ]}
                            >
                              <ThemedText
                                type="smallBold"
                                style={{ color: theme.danger }}
                              >
                                Tidak Hadir (Sesi Ditutup)
                              </ThemedText>
                            </View>
                          )
                        ) : (
                          <View
                            style={[
                              styles.checkedInBadge,
                              { backgroundColor: theme.backgroundSelected },
                            ]}
                          >
                            <ThemedText type="small" themeColor="textSecondary">
                              Menunggu Sesi Dibuka
                            </ThemedText>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* TAB CONTENT: CATATAN & RIWAYAT KEHADIRAN */}
          {activeTab === "riwayat" && (
            <View style={styles.list}>
              {schedules.length === 0 ? (
                <ThemedView type="backgroundElement" style={styles.empty}>
                  <ThemedText type="smallBold">
                    Belum Ada Jadwal Praktikum
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Jadwal praktikum akan ditampilkan di sini.
                  </ThemedText>
                </ThemedView>
              ) : (
                historyBySchedule.map(({ schedule, records }) => {
                  const isExpanded = expandedHistoryScheduleId === schedule.id;
                  return (
                    <Pressable
                      key={schedule.id}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isExpanded }}
                      onPress={() =>
                        setExpandedHistoryScheduleId(
                          isExpanded ? null : schedule.id,
                        )
                      }
                      style={({ pressed }) => [
                        styles.historyCard,
                        {
                          backgroundColor: theme.glassInput,
                          borderColor: isExpanded
                            ? theme.primary
                            : theme.glassBorder,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.historyHeader}>
                        <View style={{ flex: 1, gap: Spacing.half }}>
                          <ThemedText
                            type="smallBold"
                            style={styles.historyTitle}
                          >
                            {schedule.praktikum}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {schedule.kelas} · {schedule.ruang}
                          </ThemedText>
                        </View>
                        <View
                          style={[
                            styles.historyCount,
                            {
                              backgroundColor: isExpanded
                                ? theme.primary
                                : theme.moss,
                            },
                          ]}
                        >
                          <ThemedText
                            type="smallBold"
                            style={{ color: theme.primaryText }}
                          >
                            {records.length} catatan
                          </ThemedText>
                        </View>
                      </View>

                      {isExpanded ? (
                        records.length === 0 ? (
                          <ThemedText
                            type="small"
                            themeColor="textSecondary"
                            style={styles.emptyHistoryMessage}
                          >
                            Belum ada riwayat presensi untuk praktikum ini.
                          </ThemedText>
                        ) : (
                          <View style={styles.historyRecords}>
                            {records.map((record) => {
                              const session = sessions.find(
                                (item) => item.id === record.sessionId,
                              );

                              return (
                                <View
                                  key={record.id}
                                  style={[
                                    styles.historyRecord,
                                    {
                                      backgroundColor: theme.background,
                                      borderColor: theme.border,
                                    },
                                  ]}
                                >
                                  <View style={styles.historyMetaRow}>
                                    <ThemedText
                                      type="small"
                                      themeColor="textSecondary"
                                    >
                                      {record.status === 'excused'
                                        ? 'Status Izin'
                                        : 'Waktu Presensi'}
                                    </ThemedText>
                                    <ThemedText
                                      type="smallBold"
                                      style={{
                                        flexShrink: 1,
                                        maxWidth: '70%',
                                        textAlign: 'right',
                                      }}>
                                      {record.status === 'excused'
                                        ? 'Disetujui'
                                        : record.checkedInAt
                                          ? `${formatDateTime(record.checkedInAt)} WIB`
                                          : 'Waktu tidak tersedia'}
                                    </ThemedText>
                                  </View>
                                  <View style={styles.historyMetaRow}>
                                    <ThemedText
                                      type="small"
                                      themeColor="textSecondary"
                                    >
                                      Status Sesi
                                    </ThemedText>
                                    <SessionStatusBadge
                                      status={session?.status ?? "scheduled"}
                                    />
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </View>
          )}

          {/* MODAL DETAIL SESI PRAKTIKUM */}
          <Modal
            visible={!!selectedSchedule}
            transparent
            animationType="slide"
            onRequestClose={() => setSelectedSchedule(null)}
          >
            <View style={styles.modalBackdrop}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setSelectedSchedule(null)}
              />

              <ThemedView
                style={[
                  styles.modalSheet,
                  {
                    backgroundColor: theme.moss,
                    paddingBottom: insets.bottom + Spacing.four,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tutup detail sesi"
                  hitSlop={8}
                  onPress={() => setSelectedSchedule(null)}
                  style={styles.modalHandlePressable}>
                  <View
                  style={[
                    styles.modalHandle,
                    { backgroundColor: theme.primaryText },
                  ]}
                  />
                </Pressable>

                {selectedSchedule && (
                  <ScrollView
                    contentContainerStyle={styles.modalScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.modalHeader}>
                      <View style={{ flex: 1, gap: Spacing.half }}>
                        <ThemedText
                          type="subtitle"
                          style={{ color: '#FFFFFF', fontSize: 24 }}
                        >
                          {selectedSchedule.praktikum}
                        </ThemedText>
                        <ThemedText style={{ color: '#FFFFFF', opacity: 0.9, fontSize: 13 }}>
                          {selectedSchedule.kelas} · {selectedSchedule.ruang}
                        </ThemedText>
                      </View>
                      <SessionStatusBadge
                        status={activeModalSession?.status ?? "scheduled"}
                      />
                    </View>

                    {/* Section Spesifikasi */}
                    <View
                      style={[
                        styles.detailSection,
                        {
                          backgroundColor: theme.glassCard,
                          borderColor: theme.glassBorder,
                        },
                      ]}
                    >
                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" style={{ color: theme.primary, opacity: 0.8, flex: 1 }}>
                          Kelas
                        </ThemedText>
                        <ThemedText type="smallBold" style={{ color: theme.primary, flex: 1, textAlign: "right" }}>
                          {selectedSchedule.kelas}
                        </ThemedText>
                      </View>

                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" style={{ color: theme.primary, opacity: 0.8, flex: 1 }}>
                          Ruang Laboratorium
                        </ThemedText>
                        <ThemedText type="smallBold" style={{ color: theme.primary, flex: 1, textAlign: "right" }}>
                          {selectedSchedule.ruang}
                        </ThemedText>
                      </View>

                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" style={{ color: theme.primary, opacity: 0.8, flex: 1 }}>
                          Tanggal Pelaksanaan
                        </ThemedText>
                        <ThemedText type="smallBold" style={{ color: theme.primary, flex: 1, textAlign: "right" }}>
                          {formatDate(selectedSchedule.date)}
                        </ThemedText>
                      </View>

                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" style={{ color: theme.primary, opacity: 0.8, flex: 1 }}>
                          Jam Praktikum
                        </ThemedText>
                        <ThemedText type="smallBold" style={{ color: theme.primary, flex: 1, textAlign: "right" }}>
                          {selectedSchedule.startTime} -{" "}
                          {selectedSchedule.endTime} WIB
                        </ThemedText>
                      </View>

                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" style={{ color: theme.primary, opacity: 0.8, flex: 1 }}>
                          Asisten Laboratorium
                        </ThemedText>
                        <ThemedText type="smallBold" style={{ color: theme.primary, flex: 1, textAlign: "right" }}>
                          {getUser(selectedSchedule.assistantId)?.name ?? "-"}
                        </ThemedText>
                      </View>
                    </View>

                    {/* Status Sesi & Keterangan */}
                    <View
                      style={[
                        styles.detailStatusNotice,
                        {
                          backgroundColor:
                            activeModalSession?.status === "open"
                              ? '#E5EAD8'
                              : theme.glassInput,
                          borderColor:
                            activeModalSession?.status === "open"
                              ? theme.moss
                              : theme.glassBorder,
                        },
                      ]}
                    >
                      <ThemedText
                        type="smallBold"
                        style={{
                          color: theme.primary,
                          fontWeight: '700',
                        }}
                      >
                        {isExcusedForActiveModal
                          ? 'Izin Disetujui'
                          : activeModalSession?.status === "open"
                          ? "Sesi Sedang Dibuka"
                          : activeModalSession?.status === "closed"
                            ? "Sesi Telah Ditutup"
                          : "Sesi Belum Dibuka"}
                      </ThemedText>
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        {isExcusedForActiveModal
                          ? 'Pengajuan izinmu sudah disetujui asisten. Presensi manual tidak diperlukan.'
                          : activeModalSession?.status === "open"
                          ? "Silakan tekan tombol presensi di bawah untuk mencatat kehadiran Anda sekarang."
                          : activeModalSession?.status === "closed"
                            ? "Sesi praktikum telah selesai. Presensi sudah tidak dapat dilakukan."
                            : "Presensi hanya dapat dilakukan jika asisten laboratorium telah membuka sesi ini."}
                      </ThemedText>
                    </View>

                    {/* Tombol Presensi di Dalam Modal */}
                    {isExcusedForActiveModal ? (
                      <View
                        style={[
                          styles.modalCheckedInBanner,
                          styles.excusedStatusBanner,
                          { backgroundColor: theme.warningSoft },
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={{ color: theme.text }}>
                          Izin Anda disetujui. Presensi manual tidak diperlukan.
                        </ThemedText>
                      </View>
                    ) : activeModalSession?.status === "open" &&
                      (isCheckedInForActiveModal ? (
                        <View
                          style={[
                            styles.modalCheckedInBanner,
                            { backgroundColor: theme.successSoft },
                          ]}
                        >
                          <ThemedText
                            type="smallBold"
                            style={{ color: theme.success }}
                          >
                            Anda Sudah Presensi Pada Sesi Ini
                          </ThemedText>
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            if (activeModalSession && selectedSchedule) {
                              handleCheckIn(
                                activeModalSession,
                                selectedSchedule,
                              );
                            }
                          }}
                          style={({ pressed }) => [
                            styles.modalCheckInButton,
                            { backgroundColor: theme.success },
                            pressed && styles.pressed,
                          ]}
                        >
                          <ThemedText
                            type="smallBold"
                            style={{ color: "#FFFFFF", fontSize: 16 }}
                          >
                            Presensi Kehadiran Sekarang
                          </ThemedText>
                        </Pressable>
                      ))}

                  </ScrollView>
                )}
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
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.four,
  },
  feedbackToast: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  feedbackToastText: {
    color: "#FFFFFF",
    fontWeight: "600",
    textAlign: "center",
  },
  feedbackRetryButton: {
    alignSelf: 'flex-start',
    paddingTop: Spacing.one,
  },
  feedbackRetryText: {
    color: '#E5D7C4',
    textDecorationLine: 'underline',
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
  actionPillButton: {
    alignSelf: 'flex-start',
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
  list: {
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.four,
    backgroundColor: '#354024',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    borderBottomLeftRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    gap: Spacing.three,
    shadowColor: '#27301B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
  },
  cardHighlight: {
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  cardHeaderTitle: {
    flex: 1,
    gap: Spacing.half,
  },
  praktikumTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: '#354024',
    fontWeight: '700',
    flexShrink: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    backgroundColor: 'rgba(255, 255, 255, 0.46)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.78)',
  },
  infoItem: {
    flex: 1,
    gap: 2,
  },
  infoDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    marginHorizontal: Spacing.two,
  },
  assistantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  detailButton: {
    paddingHorizontal: Spacing.three + 2,
    paddingVertical: Spacing.two,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.82)',
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
  },
  checkInButton: {
    paddingHorizontal: Spacing.three + 2,
    paddingVertical: Spacing.two,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#889063',
  },
  checkedInBadge: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 14,
  },
  historyCard: {
    padding: Spacing.four,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  historyTitle: {
    fontSize: 16,
  },
  historyCount: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  historyRecords: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  historyRecord: {
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    gap: Spacing.one,
  },
  emptyHistoryMessage: {
    paddingTop: Spacing.one,
  },
  historyMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  empty: {
    padding: Spacing.five,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.one,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalSheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "85%",
    alignSelf: "center",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1.5,
    borderColor: '#C8B995',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  modalHandlePressable: {
    width: 64,
    height: 44,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  modalScrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  detailSection: {
    padding: Spacing.four,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  detailItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  detailStatusNotice: {
    padding: Spacing.four,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: Spacing.one,
  },
  modalCheckInButton: {
    paddingVertical: Spacing.three,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: '#C8B995',
  },
  modalCheckedInBanner: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  excusedStatusBanner: {
    marginTop: Spacing.three,
  },
  pressed: {
    opacity: 0.75,
  },
});
