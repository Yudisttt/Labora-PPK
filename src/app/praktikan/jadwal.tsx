import { router } from "expo-router";
import { useState } from "react";
import { router } from "expo-router";
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

import { RoleSwitcher } from "@/components/role-switcher";
import { SessionStatusBadge } from "@/components/session-status-badge";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useApp } from "@/state/app-context";
import type { Schedule, Session } from "@/types";
import { formatDate, formatDateTime, formatTime } from "@/utils/format";

type TabMode = "jadwal" | "riwayat";
type ScheduleFilter = "all" | "open" | "attended";

export default function PraktikanJadwalScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    schedules,
    sessions,
    checkIn,
    hasCheckedIn,
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

  const myAttendance = currentUser ? getAttendanceForUser(currentUser.id) : [];
  const historyBySchedule = schedules.map((schedule) => ({
    schedule,
    records: myAttendance.filter((record) => {
      const session = sessions.find((item) => item.id === record.sessionId);
      return session?.scheduleId === schedule.id;
    }),
  }));

  const openSessions = sessions.filter((s) => s.status === "open");
  const openSessionCount = openSessions.length;
  const filteredSchedules = schedules.filter((schedule) => {
    if (scheduleFilter === "all") return true;

    const session = getSessionsForSchedule(schedule.id)[0];
    if (scheduleFilter === "open") return session?.status === "open";

    return Boolean(
      session && currentUser && hasCheckedIn(session.id, currentUser.id),
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

  function showMessage(title: string, message: string) {
    if (Platform.OS === "web") {
      setFeedbackMessage(`${title}: ${message}`);
      setTimeout(() => setFeedbackMessage(null), 3500);
    } else {
      Alert.alert(title, message);
    }
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

    const result = await checkIn(session.id, currentUser.id);

    if (result.ok) {
      showMessage(
        "Presensi Berhasil",
        `Kehadiran Anda pada ${schedule.praktikum} (${schedule.kelas}) tercatat pada ${formatTime(result.record.checkedInAt)}.`,
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
    } else if (result.reason === "unauthorized") {
      showMessage(
        "Akses Ditolak",
        "Kamu tidak memiliki akses untuk melakukan presensi.",
      );
    } else if (result.reason === "invalid-role") {
      showMessage(
        "Akses Ditolak",
        "Hanya praktikan yang dapat melakukan presensi.",
      );
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Spacing.six },
          ]}
        >
          {/* Header Switcher Role & Akun */}
          <RoleSwitcher />

          {/* Tombol kembali */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali ke pemilihan peran"
            onPress={() => router.replace("/")}
            style={({ pressed }) => [
              styles.backButton,
              { borderColor: theme.border },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              ← Kembali
            </ThemedText>
          </Pressable>

          {/* Feedback banner untuk web/mobile */}
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
            </View>
          ) : null}

          {/* Tinted Green Glass Header Banner */}
          <View
            style={[
              styles.headerGlassCard,
              {
                backgroundColor: 'rgba(53, 64, 36, 0.78)',
                borderColor: 'rgba(255, 255, 255, 0.35)',
              },
            ]}>
            <View style={styles.headerGlassBadge}>
              <ThemedText
                type="smallBold"
                style={{ color: '#FFFFFF', letterSpacing: 1.2, fontSize: 11, fontWeight: '700' }}>
                PORTAL PRAKTIKAN
              </ThemedText>
            </View>
            <ThemedText type="subtitle" style={[styles.headerTitleText, { color: '#FFFFFF' }]}>
              Halo, {currentUser?.name ?? "Praktikan"}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push("/praktikan/izin" as Parameters<typeof router.push>[0])
              }
              style={({ pressed }) => [
                styles.permissionButton,
                { backgroundColor: theme.primary },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                Ajukan Izin
              </ThemedText>
            </Pressable>
            <View style={styles.headerUserPill}>
              <ThemedText type="small" style={{ color: '#FFFFFF', opacity: 0.95 }}>
                Lihat jadwal & presensi saya
              </ThemedText>
            </View>
          </View>

          {/* Statistik Cards Tinted Glass */}
          <View style={styles.statsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: scheduleFilter === "all" }}
              onPress={() => selectScheduleFilter("all")}
              style={({ pressed }) => [
                styles.statCard,
                {
                  backgroundColor:
                    scheduleFilter === "all"
                      ? 'rgba(53, 64, 36, 0.85)'
                      : 'rgba(136, 144, 99, 0.25)',
                  borderColor:
                    scheduleFilter === "all"
                      ? theme.primary
                      : 'rgba(53, 64, 36, 0.35)',
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                type="subtitle"
                style={[
                  styles.statValue,
                  {
                    color:
                      scheduleFilter === "all"
                        ? theme.primaryText
                        : theme.primary,
                  },
                ]}
              >
                {schedules.length}
              </ThemedText>
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    scheduleFilter === "all"
                      ? theme.primaryText
                      : theme.textSecondary,
                  fontSize: 11,
                }}
              >
                Semua Jadwal
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: scheduleFilter === "open" }}
              onPress={() => selectScheduleFilter("open")}
              style={({ pressed }) => [
                styles.statCard,
                {
                  backgroundColor:
                    scheduleFilter === "open"
                      ? 'rgba(53, 64, 36, 0.85)'
                      : 'rgba(136, 144, 99, 0.25)',
                  borderColor:
                    scheduleFilter === "open"
                      ? theme.primary
                      : 'rgba(53, 64, 36, 0.35)',
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                type="subtitle"
                style={[
                  styles.statValue,
                  {
                    color:
                      scheduleFilter === "open"
                        ? theme.primaryText
                        : theme.primary,
                  },
                ]}
              >
                {openSessionCount}
              </ThemedText>
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    scheduleFilter === "open"
                      ? theme.primaryText
                      : theme.textSecondary,
                  fontSize: 11,
                }}
              >
                Sesi Dibuka
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: scheduleFilter === "attended" }}
              onPress={() => selectScheduleFilter("attended")}
              style={({ pressed }) => [
                styles.statCard,
                {
                  backgroundColor:
                    scheduleFilter === "attended"
                      ? 'rgba(53, 64, 36, 0.85)'
                      : 'rgba(136, 144, 99, 0.25)',
                  borderColor:
                    scheduleFilter === "attended"
                      ? theme.primary
                      : 'rgba(53, 64, 36, 0.35)',
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                type="subtitle"
                style={[
                  styles.statValue,
                  {
                    color:
                      scheduleFilter === "attended"
                        ? theme.primaryText
                        : theme.primary,
                  },
                ]}
              >
                {myAttendance.length}
              </ThemedText>
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    scheduleFilter === "attended"
                      ? theme.primaryText
                      : theme.textSecondary,
                  fontSize: 11,
                }}
              >
                Sudah Presensi
              </ThemedText>
            </Pressable>
          </View>

          {/* Tab Filter Antara Jadwal & Riwayat */}
          <View
            style={[
              styles.tabContainer,
              {
                backgroundColor: 'rgba(136, 144, 99, 0.2)',
                borderColor: 'rgba(53, 64, 36, 0.3)',
              },
            ]}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "jadwal" }}
              onPress={() => setActiveTab("jadwal")}
              style={({ pressed }) => [
                styles.tabButton,
                {
                  backgroundColor:
                    activeTab === "jadwal" ? theme.primary : "transparent",
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    activeTab === "jadwal"
                      ? theme.primaryText
                      : theme.text,
                }}>
                Jadwal Praktikum
              </ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "riwayat" }}
              onPress={() => setActiveTab("riwayat")}
              style={({ pressed }) => [
                styles.tabButton,
                {
                  backgroundColor:
                    activeTab === "riwayat" ? theme.primary : "transparent",
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                type="smallBold"
                style={{
                  color:
                    activeTab === "riwayat"
                      ? theme.primaryText
                      : theme.text,
                }}>
                Riwayat Kehadiran
              </ThemedText>
            </Pressable>
          </View>

          {/* TAB CONTENT: JADWAL & DETAIL SESI (SRS-01 & SRS-02) */}
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
                  const assistant = getUser(schedule.assistantId);

                  return (
                    <View
                      key={schedule.id}
                      style={[
                        styles.card,
                        {
                          backgroundColor: 'rgba(255, 248, 238, 0.45)',
                          borderColor: isOpen ? theme.success : 'rgba(255, 255, 255, 0.65)',
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
                          <ThemedText type="small" themeColor="textSecondary">
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
                          <ThemedText type="small" themeColor="textSecondary">
                            Waktu
                          </ThemedText>
                          <ThemedText type="smallBold">
                            {schedule.startTime} - {schedule.endTime} WIB
                          </ThemedText>
                        </View>
                        <View style={styles.infoDivider} />
                        <View style={styles.infoItem}>
                          <ThemedText type="small" themeColor="textSecondary">
                            Tanggal
                          </ThemedText>
                          <ThemedText type="smallBold">
                            {formatDate(schedule.date)}
                          </ThemedText>
                        </View>
                      </View>

                      {/* Asisten Lab */}
                      {assistant ? (
                        <View style={styles.assistantBadge}>
                          <ThemedText type="small" themeColor="textSecondary">
                            Asisten Pengampu:
                          </ThemedText>
                          <ThemedText type="smallBold">
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
                            {
                              borderColor: theme.border,
                              backgroundColor: theme.backgroundSelected,
                            },
                            pressed && styles.pressed,
                          ]}
                        >
                          <ThemedText type="smallBold">
                            Lihat Detail Sesi
                          </ThemedText>
                        </Pressable>

                        {/* Tombol Presensi Realtime (SRS-02) */}
                        {isOpen ? (
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

          {/* TAB CONTENT: CATATAN & RIWAYAT KEHADIRAN (SRS-03) */}
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
                          backgroundColor: 'rgba(255, 248, 238, 0.45)',
                          borderColor: isExpanded
                            ? theme.primary
                            : 'rgba(255, 255, 255, 0.65)',
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
                                      Waktu Presensi
                                    </ThemedText>
                                    <ThemedText type="smallBold">
                                      {formatDateTime(record.checkedInAt)} WIB
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

          {/* MODAL DETAIL SESI PRAKTIKUM (SRS-01) */}
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

                    {/* Section Spesifikasi - Glass Cream */}
                    <View
                      style={[
                        styles.detailSection,
                        {
                          backgroundColor: 'rgba(255, 248, 238, 0.38)',
                          borderColor: 'rgba(255, 255, 255, 0.45)',
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

                    {/* Status Sesi & Keterangan - Glass Cream */}
                    <View
                      style={[
                        styles.detailStatusNotice,
                        {
                          backgroundColor:
                            activeModalSession?.status === "open"
                              ? 'rgba(53, 64, 36, 0.25)'
                              : 'rgba(255, 248, 238, 0.35)',
                          borderColor:
                            activeModalSession?.status === "open"
                              ? 'rgba(255, 255, 255, 0.5)'
                              : 'rgba(255, 255, 255, 0.4)',
                        },
                      ]}
                    >
                      <ThemedText
                        type="smallBold"
                        style={{
                          color: '#FFFFFF',
                          fontWeight: '700',
                        }}
                      >
                        {activeModalSession?.status === "open"
                          ? "Sesi Sedang Dibuka"
                          : activeModalSession?.status === "closed"
                            ? "Sesi Telah Ditutup"
                            : "Sesi Belum Dibuka"}
                      </ThemedText>
                      <ThemedText type="small" style={{ color: '#FFFFFF', opacity: 0.9 }}>
                        {activeModalSession?.status === "open"
                          ? "Silakan tekan tombol presensi di bawah untuk mencatat kehadiran Anda sekarang."
                          : activeModalSession?.status === "closed"
                            ? "Sesi praktikum telah selesai. Presensi sudah tidak dapat dilakukan."
                            : "Presensi hanya dapat dilakukan jika asisten laboratorium telah membuka sesi ini."}
                      </ThemedText>
                    </View>

                    {/* Tombol Presensi di Dalam Modal */}
                    {activeModalSession?.status === "open" &&
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

                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setSelectedSchedule(null)}
                      style={({ pressed }) => [
                        styles.modalCloseButton,
                        { backgroundColor: theme.primary },
                        pressed && styles.pressed,
                      ]}
                    >
                      <ThemedText
                        type="smallBold"
                        style={{ color: theme.primaryText }}
                      >
                        Tutup
                      </ThemedText>
                    </Pressable>
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
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
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
  headerGlassCard: {
    padding: Spacing.four,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: Spacing.two,
    shadowColor: '#4C3D19',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  headerGlassBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  headerTitleText: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
  },
  headerUserPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  header: {
    gap: Spacing.one,
  },
  permissionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 8,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 96,
    alignItems: "center",
    paddingVertical: Spacing.three + 2,
    paddingHorizontal: Spacing.two,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: Spacing.half,
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
  statValue: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  tabButton: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 52,
    paddingHorizontal: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  list: {
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.four,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: Spacing.three,
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 2,
  },
  cardHighlight: {
    borderLeftWidth: 5,
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
    flexShrink: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  infoItem: {
    flex: 1,
    gap: 2,
  },
  infoDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(136, 144, 99, 0.3)",
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  checkInButton: {
    paddingHorizontal: Spacing.three + 2,
    paddingVertical: Spacing.two,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
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
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
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
    alignItems: "center",
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
    borderColor: 'rgba(255, 255, 255, 0.75)',
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
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  modalCheckedInBanner: {
    paddingVertical: Spacing.three,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseButton: {
    paddingVertical: Spacing.three,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.75,
  },
});
