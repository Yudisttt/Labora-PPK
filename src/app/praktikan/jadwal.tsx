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

  function handleCheckIn(session: Session, schedule: Schedule) {
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

    const result = checkIn(session.id, currentUser.id);

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

          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="subtitle">Jadwal Praktikan</ThemedText>
            <ThemedText themeColor="textSecondary">
              Halo {currentUser?.name ?? "Praktikan"}.
            </ThemedText>
          </View>

          {/* Statistik Cards */}
          <View style={styles.statsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: scheduleFilter === "all" }}
              onPress={() => selectScheduleFilter("all")}
              style={({ pressed }) => [
                styles.statCard,
                {
                  backgroundColor:
                    scheduleFilter === "all" ? theme.primary : theme.moss,
                  borderColor:
                    scheduleFilter === "all" ? theme.primary : theme.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                type="subtitle"
                style={[styles.statValue, { color: theme.primaryText }]}
              >
                {schedules.length}
              </ThemedText>
              <ThemedText
                type="small"
                style={{
                  color: theme.primaryText,
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
                    scheduleFilter === "open" ? theme.primary : theme.moss,
                  borderColor:
                    scheduleFilter === "open" ? theme.primary : theme.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                type="subtitle"
                style={[styles.statValue, { color: theme.primaryText }]}
              >
                {openSessionCount}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.primaryText }}>
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
                    scheduleFilter === "attended" ? theme.primary : theme.moss,
                  borderColor:
                    scheduleFilter === "attended"
                      ? theme.primary
                      : theme.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                type="subtitle"
                style={[styles.statValue, { color: theme.primaryText }]}
              >
                {myAttendance.length}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.primaryText }}>
                Sudah Presensi
              </ThemedText>
            </Pressable>
          </View>

          {/* Tab Filter Antara Jadwal & Riwayat */}
          <View style={styles.tabContainer}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "jadwal" }}
              onPress={() => setActiveTab("jadwal")}
              style={({ pressed }) => [
                styles.tabButton,
                {
                  backgroundColor:
                    activeTab === "jadwal" ? theme.primary : theme.moss,
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                Jadwal
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
                    activeTab === "riwayat" ? theme.primary : theme.moss,
                },
                pressed && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
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
                    <ThemedView
                      key={schedule.id}
                      type="backgroundElement"
                      style={[
                        styles.card,
                        { borderColor: isOpen ? theme.success : theme.border },
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
                    </ThemedView>
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
                          backgroundColor: theme.backgroundElement,
                          borderColor: isExpanded
                            ? theme.primary
                            : theme.border,
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
                <View
                  style={[
                    styles.modalHandle,
                    { backgroundColor: theme.primaryText },
                  ]}
                />

                {selectedSchedule && (
                  <ScrollView
                    contentContainerStyle={styles.modalScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.modalHeader}>
                      <View style={{ flex: 1, gap: Spacing.one }}>
                        <ThemedText
                          type="subtitle"
                          style={{ color: theme.primaryText }}
                        >
                          {selectedSchedule.praktikum}
                        </ThemedText>
                        <ThemedText style={{ color: theme.primaryText }}>
                          Detail informasi sesi praktikum & absensi
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
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Kelas
                        </ThemedText>
                        <ThemedText type="smallBold">
                          {selectedSchedule.kelas}
                        </ThemedText>
                      </View>

                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Ruang Laboratorium
                        </ThemedText>
                        <ThemedText type="smallBold">
                          {selectedSchedule.ruang}
                        </ThemedText>
                      </View>

                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Tanggal Pelaksanaan
                        </ThemedText>
                        <ThemedText type="smallBold">
                          {formatDate(selectedSchedule.date)}
                        </ThemedText>
                      </View>

                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Jam Praktikum
                        </ThemedText>
                        <ThemedText type="smallBold">
                          {selectedSchedule.startTime} -{" "}
                          {selectedSchedule.endTime} WIB
                        </ThemedText>
                      </View>

                      <View style={styles.detailItemRow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Asisten Laboratorium
                        </ThemedText>
                        <ThemedText type="smallBold">
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
                              ? theme.successSoft
                              : theme.backgroundElement,
                          borderColor:
                            activeModalSession?.status === "open"
                              ? theme.success
                              : theme.border,
                        },
                      ]}
                    >
                      <ThemedText
                        type="smallBold"
                        style={{
                          color:
                            activeModalSession?.status === "open"
                              ? theme.success
                              : theme.text,
                        }}
                      >
                        {activeModalSession?.status === "open"
                          ? "Sesi Sedang Dibuka"
                          : activeModalSession?.status === "closed"
                            ? "Sesi Telah Ditutup"
                            : "Sesi Belum Dibuka"}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
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
  header: {
    gap: Spacing.one,
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
    paddingVertical: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    gap: Spacing.half,
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  statValue: {
    fontSize: 28,
    lineHeight: 32,
  },
  tabContainer: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  tabButton: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  list: {
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    gap: Spacing.three,
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  cardHighlight: {
    borderLeftWidth: 4,
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
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.one,
  },
  infoItem: {
    flex: 1,
    gap: Spacing.half,
  },
  infoDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#D7DAE0",
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
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  checkInButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  checkedInBadge: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  historyCard: {
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    gap: Spacing.two,
    shadowColor: "#4C3D19",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
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
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  historyRecords: {
    gap: Spacing.one,
  },
  historyRecord: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
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
    borderRadius: Spacing.three,
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
    maxHeight: "85%",
    borderTopLeftRadius: Spacing.five,
    borderTopRightRadius: Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    alignSelf: "center",
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
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    gap: Spacing.two,
  },
  detailItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.half,
  },
  detailStatusNotice: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    gap: Spacing.one,
  },
  modalCheckInButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCheckedInBanner: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.75,
  },
});
