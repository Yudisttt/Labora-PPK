import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BlurView } from 'expo-blur';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import { listenParticipants } from '@/services/practicum-data';
import { getOrCreateSessionQrCode, markAttendanceManually } from '@/services/sessions';
import type { ClassParticipant } from '@/services/practicum-data';
import { formatDate } from '@/utils/format';

type ManualStatus = 'present' | 'absent' | 'excused';
const MANUAL_OPTIONS: { label: string; status: ManualStatus; reason?: 'izin' | 'sakit' }[] = [
  { label: 'Hadir', status: 'present' },
  { label: 'Alpha', status: 'absent' },
  { label: 'Izin', status: 'excused', reason: 'izin' },
  { label: 'Sakit', status: 'excused', reason: 'sakit' },
];

export default function AsistenPresensiScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser, users, sessions, attendance, getScheduleForSession } = useApp();
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ClassParticipant[]>([]);
  const [manualBusyId, setManualBusyId] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualTarget, setManualTarget] = useState<{ sessionId: string; participantId: string; participantName: string } | null>(null);
  const openSessions = useMemo(() => sessions.filter((session) => session.status === 'open'), [sessions]);

  useEffect(() => listenParticipants(
    setParticipants,
    () => setManualError('Daftar peserta gagal dimuat. Muat ulang halaman lalu coba lagi.'),
  ), []);

  useEffect(() => {
    let active = true;
    openSessions.forEach((session) => {
      getOrCreateSessionQrCode(session.id).then((code) => {
        if (active) {
          setQrCodes((current) => ({ ...current, [session.id]: code }));
          setError(null);
        }
      }).catch(() => {
        if (active) setError('QR gagal disiapkan. Pastikan sesi masih terbuka dan coba muat ulang.');
      });
    });
    return () => { active = false; };
  // Re-run when the set of currently open sessions changes.
  }, [openSessions]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
          <View style={styles.heading}>
            <ThemedText type="title">QR Presensi</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Tampilkan QR ini agar praktikan dapat memindai dan mencatat kehadiran.</ThemedText>
          </View>
          {error ? (
            <BlurView intensity={42} tint="light" style={[styles.card, styles.glassCard, { borderColor: theme.danger }]}>
              <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText>
            </BlurView>
          ) : null}
          {openSessions.length === 0 ? (
            <BlurView intensity={42} tint="light" style={[styles.card, styles.glassCard, { borderColor: theme.glassBorder }]}>
              <ThemedText type="smallBold">Belum ada sesi yang dibuka</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Buka sesi dari halaman Sesi untuk menampilkan QR presensi.</ThemedText>
            </BlurView>
          ) : openSessions.map((session) => {
            const schedule = getScheduleForSession(session.id);
            const code = qrCodes[session.id];
            return (
              <BlurView key={session.id} intensity={42} tint="light" style={[styles.card, styles.glassCard, { borderColor: theme.glassBorder }]}>
                <View style={styles.cardHeading}>
                  <View style={styles.titleBlock}>
                    <ThemedText type="subtitle">{schedule?.praktikum ?? 'Praktikum'}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{schedule?.kelas ?? '-'} · {schedule?.ruang ?? '-'}</ThemedText>
                  </View>
                  <SessionStatusBadge status={session.status} />
                </View>
                {schedule ? (
                  <ThemedText type="small" themeColor="textSecondary">{formatDate(schedule.date)} · {schedule.startTime}–{schedule.endTime}</ThemedText>
                ) : null}
                {code ? (
                  <View style={styles.qrContainer}>
                    <QRCode
                      value={JSON.stringify({ app: 'labora', type: 'attendance', sessionId: session.id, code })}
                      size={220}
                      color="#27301B"
                      backgroundColor="#FFFFFF"
                    />
                  </View>
                ) : (
                  <View style={[styles.qrLoading, { borderColor: theme.glassBorder }]}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {error ?? 'Menyiapkan QR sesi…'}
                    </ThemedText>
                  </View>
                )}
                <ThemedText type="small" themeColor="textSecondary" style={styles.helper}>
                  QR berlaku untuk sesi ini selama sesi masih dibuka.
                </ThemedText>
              </BlurView>
            );
          })}
          {openSessions.map((session) => {
            const schedule = getScheduleForSession(session.id);
            if (!schedule?.classId) return null;
            const sessionParticipants = participants
              .filter((participant) => participant.classId === schedule.classId)
              .map((participant) => users.find((user) => user.id === participant.userId))
              .filter((user): user is NonNullable<typeof user> => user?.role === 'praktikan')
              .sort((a, b) => a.name.localeCompare(b.name));

            return (
              <BlurView key={`manual-${session.id}`} intensity={42} tint="light" style={[styles.card, styles.glassCard, { borderColor: theme.glassBorder }]}>
                <View style={styles.manualHeading}>
                  <View style={styles.titleBlock}>
                    <ThemedText type="subtitle">Presensi Manual</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{schedule.praktikum} · {schedule.kelas}</ThemedText>
                  </View>
                  <SessionStatusBadge status={session.status} />
                </View>
                {manualError ? <ThemedText type="small" style={{ color: theme.danger }}>{manualError}</ThemedText> : null}
                {sessionParticipants.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">Belum ada praktikan terdaftar pada kelas ini.</ThemedText>
                ) : sessionParticipants.map((participant) => {
                  const record = attendance.find((item) => item.sessionId === session.id && item.userId === participant.id);
                  const busy = manualBusyId === `${session.id}_${participant.id}`;
                  const statusLabel = record?.status === 'present'
                    ? 'Hadir'
                    : record?.status === 'absent'
                      ? 'Alpha'
                      : record?.status === 'excused'
                        ? record.manualReason === 'sakit' ? 'Sakit' : 'Izin'
                        : null;
                  return (
                    <View key={participant.id} style={[styles.participantRow, { borderTopColor: theme.glassBorder }]}>
                      <View style={styles.titleBlock}>
                        <ThemedText type="smallBold">{participant.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">{participant.identityNumber}</ThemedText>
                      </View>
                      {statusLabel ? (
                        <ThemedText type="smallBold" style={{ color: record?.status === 'present' ? theme.success : record?.status === 'absent' ? theme.danger : theme.warning }}>{statusLabel}</ThemedText>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Pilih status presensi ${participant.name}`}
                          disabled={manualBusyId !== null || !currentUser}
                          onPress={() => { setManualError(null); setManualTarget({ sessionId: session.id, participantId: participant.id, participantName: participant.name }); }}
                          style={({ pressed }) => [styles.manualButton, { backgroundColor: theme.primary }, pressed && styles.pressed, manualBusyId !== null && styles.disabled]}>
                          <ThemedText type="smallBold" style={{ color: theme.primaryText }}>{busy ? 'Menyimpan…' : 'Pilih status'}</ThemedText>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </BlurView>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/asisten/jadwal')}
            style={({ pressed }) => [styles.backButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassCard }, pressed && styles.pressed]}
          >
            <ThemedText type="smallBold" style={{ color: theme.primary }}>← Kembali</ThemedText>
          </Pressable>
        </ScrollView>
        <Modal visible={manualTarget !== null} transparent animationType="fade" onRequestClose={() => { if (manualBusyId === null) setManualTarget(null); }}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Tutup pilihan status" onPress={() => { if (manualBusyId === null) setManualTarget(null); }} />
            <View style={[styles.statusPopup, { backgroundColor: theme.background, borderColor: theme.glassBorder }]}>
              <ThemedText type="subtitle">Status Presensi</ThemedText>
              {manualTarget ? <ThemedText type="small" themeColor="textSecondary">{manualTarget.participantName}</ThemedText> : null}
              {manualError ? <ThemedText type="small" style={{ color: theme.danger }}>{manualError}</ThemedText> : null}
              {MANUAL_OPTIONS.map((option) => (
                <Pressable key={option.label} accessibilityRole="button" disabled={manualBusyId !== null || !currentUser || !manualTarget}
                  onPress={() => {
                    if (!currentUser || !manualTarget) return;
                    const target = manualTarget;
                    setManualBusyId(`${target.sessionId}_${target.participantId}`);
                    setManualError(null);
                    void markAttendanceManually(target.sessionId, target.participantId, currentUser.id, option.status, option.reason)
                      .then(() => setManualTarget(null))
                      .catch((caught: unknown) => {
                        const code = caught instanceof Error && 'code' in caught ? String(caught.code) : '';
                        setManualError(code === 'permission-denied'
                          ? 'Firebase menolak perubahan ini. Pastikan firestore.rules terbaru sudah dipublikasikan.'
                          : caught instanceof Error ? caught.message : 'Presensi manual gagal disimpan.');
                      })
                      .finally(() => setManualBusyId(null));
                  }}
                  style={({ pressed }) => [styles.statusOption, { borderColor: theme.glassBorder, backgroundColor: theme.glassCard }, pressed && styles.pressed, manualBusyId !== null && styles.disabled]}>
                  <ThemedText type="smallBold">{manualBusyId ? 'Menyimpan…' : option.label}</ThemedText>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" disabled={manualBusyId !== null} onPress={() => setManualTarget(null)} style={styles.cancelOption}>
                <ThemedText type="smallBold" themeColor="textSecondary">Batal</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: Spacing.three, gap: Spacing.three },
  heading: { gap: Spacing.one },
  card: { padding: Spacing.three, borderWidth: 1, borderRadius: 20, gap: Spacing.two, overflow: 'hidden' },
  glassCard: { backgroundColor: 'rgba(255,255,255,0.28)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object : {}) },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  titleBlock: { flex: 1, gap: Spacing.half },
  qrContainer: { width: '100%', maxWidth: 280, aspectRatio: 1, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', padding: Spacing.three, borderRadius: 20, backgroundColor: '#FFFFFF' },
  qrLoading: { minHeight: 64, alignItems: 'center', justifyContent: 'center', padding: Spacing.two, borderRadius: 14, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.45)' },
  backButton: { alignSelf: 'center', minWidth: 136, alignItems: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: 999, borderWidth: 1 },
  pressed: { opacity: 0.75 },
  helper: { textAlign: 'center' },
  manualHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  participantRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, borderTopWidth: 1, paddingTop: Spacing.two },
  manualButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: Spacing.two, borderRadius: 14 },
  disabled: { opacity: 0.6 },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.three, backgroundColor: 'rgba(20,24,15,0.42)' },
  statusPopup: { width: '100%', maxWidth: 360, padding: Spacing.three, gap: Spacing.two, borderRadius: 24, borderWidth: 1 },
  statusOption: { minHeight: 48, justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: 14, borderWidth: 1 },
  cancelOption: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
});
