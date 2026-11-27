import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardCapsule } from '@/components/dashboard-ui';
import { PaginatedCards } from '@/components/paginated-cards';
import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listenParticipants, type ClassParticipant } from '@/services/practicum-data';
import { useApp } from '@/state/app-context';
import { formatDate, formatTime } from '@/utils/format';
import { getPracticumWindowState } from '@/utils/practicum-window';

type AttendanceView = 'present' | 'izin' | 'sakit' | 'alpha' | 'pending';
const STATUS_ORDER: Record<AttendanceView, number> = { present: 0, izin: 1, sakit: 2, alpha: 3, pending: 4 };
const STATUS_LABEL: Record<AttendanceView, string> = { present: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpha: 'Alpha', pending: 'Belum hadir' };

export default function RiwayatPresensiScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { attendance, sessions, users, getSchedule } = useApp();

  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);
  const [classParticipants, setClassParticipants] = useState<ClassParticipant[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => listenParticipants(setClassParticipants, () => {}), []);
  // Segarkan tiap menit supaya sesi yang waktunya habis langsung terbaca alpha.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const sessionHistory = useMemo(() => sessions
    .filter((session) => session.openedAt !== null || session.status !== 'scheduled')
    .sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? ''))
    .map((session) => {
      const schedule = getSchedule(session.scheduleId);
      const records = attendance.filter((record) => record.sessionId === session.id);
      const recordByUser = new Map(records.map((record) => [record.userId, record]));
      // Sesi dianggap selesai bila ditutup asisten atau jam praktikum sudah lewat.
      const ended = session.status === 'closed'
        || (schedule ? getPracticumWindowState(schedule, now).phase === 'after' : false);

      const enrolledIds = schedule?.classId
        ? classParticipants.filter((item) => item.classId === schedule.classId).map((item) => item.userId)
        : [];
      // Gabungkan peserta terdaftar + siapa pun yang punya catatan di sesi ini.
      const userIds = [...new Set([...enrolledIds, ...records.map((record) => record.userId)])];

      const people = userIds
        .map((userId) => {
          const user = users.find((item) => item.id === userId);
          if (!user) return null;
          const record = recordByUser.get(userId);
          let status: AttendanceView;
          if (record?.status === 'present') status = 'present';
          else if (record?.status === 'excused') status = record.manualReason === 'sakit' ? 'sakit' : 'izin';
          else if (record?.status === 'absent' || ended) status = 'alpha';
          else status = 'pending';
          return { user, record, status };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          || (a.record?.checkedInAt ?? '').localeCompare(b.record?.checkedInAt ?? '')
          || a.user.name.localeCompare(b.user.name));

      const count = (status: AttendanceView) => people.filter((item) => item.status === status).length;
      return {
        session, schedule, people,
        present: people.filter((item) => item.status === 'present'),
        counts: { present: count('present'), izin: count('izin'), sakit: count('sakit'), alpha: count('alpha'), pending: count('pending') },
      };
    }), [attendance, classParticipants, getSchedule, now, sessions, users]);

  const detail = detailSessionId
    ? (sessionHistory.find((item) => item.session.id === detailSessionId) ?? null)
    : null;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
          <DashboardCapsule
            style={{ paddingTop: Spacing.four }}
            title="Riwayat Presensi"
            subtitle="Daftar praktikan yang hadir pada sesi yang pernah dibuka."
            tone="pastel"
            showGreeting={false}
            backAction={{ label: 'Kembali ke jadwal', onPress: () => router.canGoBack() ? router.back() : router.replace('/asisten/jadwal') }}
          />

          {sessionHistory.length === 0 ? (
            <BlurView intensity={56} tint="light" style={[styles.glassCard, { borderColor: 'rgba(255,255,255,0.88)' }]}>
              <ThemedText type="smallBold">Belum ada sesi dibuka</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Riwayat peserta hadir akan muncul setelah sesi presensi dibuka.
              </ThemedText>
            </BlurView>
          ) : (
            <PaginatedCards
              items={sessionHistory}
              keyExtractor={({ session }) => session.id}
              renderItem={({ session, schedule, present, counts }) => (
            <BlurView intensity={56} tint="light" style={[styles.glassCard, { borderColor: 'rgba(255,255,255,0.88)' }]}>
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

              <View style={styles.summaryRow}>
                <View style={[styles.summary, { backgroundColor: 'rgba(255,255,255,0.68)' }]}>
                  <Ionicons name="people-outline" size={16} color={theme.primary} />
                  <ThemedText type="smallBold">{present.length} hadir</ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Lihat detail peserta hadir ${schedule?.praktikum ?? 'sesi praktikum'}`}
                  onPress={() => setDetailSessionId(session.id)}
                  style={({ pressed }) => [
                    styles.detailButton,
                    { borderColor: theme.primary },
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>Lihat Detail</ThemedText>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>›</ThemedText>
                </Pressable>
              </View>
              {counts.izin + counts.sakit + counts.alpha + counts.pending > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {[
                    counts.izin ? `${counts.izin} izin` : null,
                    counts.sakit ? `${counts.sakit} sakit` : null,
                    counts.alpha ? `${counts.alpha} alpha` : null,
                    counts.pending ? `${counts.pending} belum hadir` : null,
                  ].filter(Boolean).join(' · ')}
                </ThemedText>
              ) : null}
            </BlurView>
              )}
            />
          )}

        </ScrollView>

        <Modal
          visible={detail !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setDetailSessionId(null)}>
          <View style={styles.modalBackdrop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tutup detail kehadiran"
              style={StyleSheet.absoluteFill}
              onPress={() => setDetailSessionId(null)}
            />
            <ThemedView
              type="backgroundElement"
              style={[styles.modalCard, { backgroundColor: theme.glassCard, borderColor: theme.glassBorder }]}>
              <View style={styles.modalHeader}>
                <View style={styles.sessionTitle}>
                  <ThemedText type="smallBold">{detail?.schedule?.praktikum ?? 'Sesi praktikum'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {detail?.schedule ? `${detail.schedule.kelas} · ${detail.schedule.ruang} · ` : ''}
                    {detail?.present.length ?? 0} hadir dari {detail?.people.length ?? 0} peserta
                  </ThemedText>
                  {detail?.schedule ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDate(detail.schedule.date)} · {detail.schedule.startTime}–{detail.schedule.endTime}
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDetailSessionId(null)}
                  style={({ pressed }) => [styles.closeButton, { borderColor: theme.border }, pressed && styles.pressed]}>
                  <ThemedText type="smallBold">Tutup</ThemedText>
                </Pressable>
              </View>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator>
                {detail && detail.people.length > 0 ? (
                  detail.people.map(({ record, user, status }, index) => (
                    <View key={user.id} style={[styles.personRow, { borderColor: theme.glassBorder }]}>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.number}>
                        {index + 1}.
                      </ThemedText>
                      <View style={styles.personDetails}>
                        <ThemedText type="smallBold">{user.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">{user.identityNumber}</ThemedText>
                      </View>
                      <View style={styles.statusCol}>
                        <ThemedText
                          type="smallBold"
                          style={{ color: status === 'present' ? theme.success : status === 'alpha' ? theme.danger : status === 'pending' ? theme.textSecondary : theme.warning }}>
                          {STATUS_LABEL[status]}
                        </ThemedText>
                        {status === 'present' ? (
                          <ThemedText type="small" themeColor="textSecondary">{formatTime(record?.checkedInAt ?? null)}</ThemedText>
                        ) : null}
                      </View>
                    </View>
                  ))
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Belum ada peserta terdaftar pada praktikum ini.
                  </ThemedText>
                )}
              </ScrollView>
            </ThemedView>
          </View>
        </Modal>
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
    backgroundColor: 'rgba(245, 248, 242, 0.62)',
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(145deg, rgba(255, 255, 255, 0.68) 0%, rgba(136, 144, 99, 0.06) 100%)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
        } as object)
      : {}),
  },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionTitle: { flex: 1, gap: Spacing.half },
  summary: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 999 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  detailButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: 999, borderWidth: 1.5 },
  pressed: { opacity: 0.65 },
  number: { width: 28 },
  statusCol: { alignItems: 'flex-end' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: Spacing.four, backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  modalCard: { alignSelf: 'center', width: '100%', maxWidth: 420, maxHeight: '80%', padding: Spacing.four, borderRadius: 24, borderWidth: 1.5, gap: Spacing.three },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  modalScroll: { flexGrow: 0 },
  closeButton: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  personDetails: { flex: 1, gap: 1 },
});