import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { DashboardCapsule } from '@/components/dashboard-ui';
import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import { getAttendanceLocation } from '@/services/attendance-location';
import { getLaboratoryForRoom } from '@/services/sessions';
import type { CheckInFailureReason, Schedule } from '@/types';
import { formatDate, formatTime } from '@/utils/format';
import { calculateDistanceMeters } from '@/utils/geo';

type AttendanceQr = { app: 'labora'; type: 'attendance'; sessionId: string; code: string };

function parseAttendanceQr(value: string): AttendanceQr | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' && parsed !== null &&
      'app' in parsed && parsed.app === 'labora' &&
      'type' in parsed && parsed.type === 'attendance' &&
      'sessionId' in parsed && typeof parsed.sessionId === 'string' &&
      'code' in parsed && typeof parsed.code === 'string'
    ) {
      return parsed as AttendanceQr;
    }
  } catch {
    return null;
  }
  return null;
}

const FAILURE_MESSAGES: Record<CheckInFailureReason, string> = {
  unauthorized: 'Akun ini tidak memiliki akses presensi.',
  'invalid-role': 'Hanya praktikan yang dapat melakukan presensi.',
  'unknown-session': 'Sesi praktikum tidak ditemukan.',
  'not-open': 'Sesi belum dibuka atau sudah ditutup.',
  'outside-window': 'Waktu praktikum sudah berakhir.',
  excused: 'Izinmu sudah disetujui. Presensi manual tidak diperlukan.',
  'already-checked-in': 'Kamu sudah presensi pada sesi ini.',
  'invalid-qr': 'QR tidak valid atau sudah tidak berlaku. Pindai QR dari sesi yang sedang dibuka.',
  'outside-radius': 'Kamu berada di luar radius laboratorium.',
  'location-unavailable': 'Lokasi perangkat tidak tersedia.',
  'location-inaccurate': 'Lokasi belum cukup akurat. Aktifkan lokasi presisi lalu coba lagi.',
  'laboratory-unconfigured': 'Lokasi laboratorium belum diatur.',
};

type LocationCheck = { distance: number; radius: number; accuracy: number; withinRadius: boolean };

function isNetworkFailure(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code).toLowerCase()
    : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return ['unavailable', 'network-request-failed', 'deadline-exceeded', 'network', 'offline']
    .some((value) => code.includes(value) || message.includes(value));
}

export default function PresensiScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const { currentUser, schedules, sessions, checkIn, getScheduleForSession, getAttendanceForUser, getUser } = useApp();
  const [busy, setBusy] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(true);
  const [message, setMessage] = useState('Pilih sesi yang dibuka untuk memeriksa lokasi dan melakukan presensi.');
  const [isError, setIsError] = useState(false);
  const [checkedInSessionId, setCheckedInSessionId] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [locationChecks, setLocationChecks] = useState<Record<string, LocationCheck>>({});
  const [checkingSessionId, setCheckingSessionId] = useState<string | null>(null);
  const [retrySessionId, setRetrySessionId] = useState<string | null>(null);
  const [locationSettingsNeeded, setLocationSettingsNeeded] = useState(false);
  const scanLock = useRef(false);
  const openSessions = sessions.filter((session) => session.status === 'open');
  const openSchedules = schedules.filter((schedule) =>
    openSessions.some((session) => session.scheduleId === schedule.id),
  );
  const myAttendance = currentUser ? getAttendanceForUser(currentUser.id) : [];
  const now = new Date();
  const todayDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const alphaCount = schedules.filter((schedule) => {
    const session = sessions.find((item) => item.scheduleId === schedule.id);
    if (!session) return false;
    const record = myAttendance.find((item) => item.sessionId === session.id);
    return !record && (session.status === 'closed' || schedule.date.slice(0, 10) < todayDateKey);
  }).length;

  async function performCheckIn(sessionId: string, attendanceCode?: string) {
    setRetrySessionId(null);
    setLocationSettingsNeeded(false);
    setIsError(false);
    if (!currentUser) {
      setMessage('Sesi login berakhir. Masuk kembali untuk presensi.');
      setIsError(true);
      return;
    }

    try {
      const schedule = getScheduleForSession(sessionId);
      const session = sessions.find((item) => item.id === sessionId);
      if (!session || session.status !== 'open') {
        setMessage(FAILURE_MESSAGES['not-open']);
        setIsError(true);
        return;
      }
      if (!schedule) {
        setMessage(FAILURE_MESSAGES['unknown-session']);
        setIsError(true);
        return;
      }

      const locationResult = await getAttendanceLocation();
      if (!locationResult.ok) {
        const locationMessages = {
          'permission-denied': locationResult.canAskAgain
            ? 'Izin lokasi belum diberikan. Izinkan akses lokasi untuk melakukan presensi.'
            : 'Izin lokasi ditolak permanen. Buka Pengaturan aplikasi dan izinkan akses lokasi untuk presensi.',
          'services-disabled': 'GPS/lokasi perangkat sedang nonaktif. Aktifkan layanan lokasi, lalu coba lagi.',
          'coordinates-unavailable': 'Koordinat perangkat belum tersedia. Pastikan GPS aktif dan tunggu sebentar, lalu coba lagi.',
        } as const;
        setMessage(locationMessages[locationResult.reason]);
        setLocationSettingsNeeded(
          locationResult.reason === 'permission-denied' && locationResult.canAskAgain === false,
        );
        setRetrySessionId(sessionId);
        setIsError(true);
        return;
      }
      const accuracy = locationResult.accuracy;
      if (accuracy === null || accuracy > 50) {
        setMessage(FAILURE_MESSAGES['location-inaccurate']);
        setRetrySessionId(sessionId);
        setIsError(true);
        return;
      }
      const location = {
        latitude: locationResult.latitude,
        longitude: locationResult.longitude,
        accuracy,
      };
      const laboratory = await getLaboratoryForRoom(schedule.ruang);
      if (!laboratory) {
        setMessage(FAILURE_MESSAGES['laboratory-unconfigured']);
        setIsError(true);
        return;
      }

      const distance = calculateDistanceMeters(location, laboratory);
      const withinRadius = distance <= laboratory.radius;
      setLocationChecks((current) => ({
        ...current,
        [sessionId]: { distance, radius: laboratory.radius, accuracy, withinRadius },
      }));
      if (!withinRadius) {
        setMessage(`Kamu berada di luar radius ${laboratory.name}. Jarak ${Math.round(distance)} m, batas ${laboratory.radius} m.`);
        setIsError(true);
        return;
      }

      const outcome = await checkIn(sessionId, currentUser.id, location, attendanceCode);
      if (!outcome.ok) {
        setMessage(FAILURE_MESSAGES[outcome.reason]);
        setIsError(true);
      } else {
        setCheckedInSessionId(sessionId);
        setMessage(`Presensi ${schedule?.praktikum ?? 'praktikum'} berhasil tercatat${outcome.record.checkedInAt ? ` pukul ${formatTime(outcome.record.checkedInAt)}` : ''}.`);
        setIsError(false);
      }
    } catch (error) {
      if (isNetworkFailure(error)) {
        setMessage('Koneksi internet terganggu. Presensi belum tersimpan. Periksa koneksi, lalu tekan Coba lagi.');
        setRetrySessionId(sessionId);
      } else {
        setMessage('Presensi gagal disimpan. Silakan coba kembali setelah memeriksa sesi dan akses akun.');
      }
      setIsError(true);
    }
  }

  async function handleScan(result: BarcodeScanningResult) {
    if (scanLock.current || openSessions.length === 0) return;
    scanLock.current = true;
    setScanPaused(true);
    setBusy(true);
    setIsError(false);
    const qr = parseAttendanceQr(result.data);
    if (!qr) {
      setMessage('QR tidak dikenali. Pastikan kamu memindai QR presensi dari aplikasi Labora.');
      setIsError(true);
      setBusy(false);
      return;
    }
    setCheckingSessionId(qr.sessionId);
    await performCheckIn(qr.sessionId, qr.code);
    setCheckingSessionId(null);
    setBusy(false);
  }

  async function handleSessionCheckIn(sessionId: string) {
    if (checkingSessionId) return;
    setCheckingSessionId(sessionId);
    setIsError(false);
    await performCheckIn(sessionId);
    setCheckingSessionId(null);
  }

  function scanAgain() {
    scanLock.current = false;
    setRetrySessionId(null);
    setLocationSettingsNeeded(false);
    setCheckedInSessionId(null);
    setMessage('Pilih sesi yang dibuka untuk memeriksa lokasi dan melakukan presensi.');
    setIsError(false);
    setScanPaused(false);
  }

  return (
    <ThemedView style={[styles.screen, { backgroundImage: `linear-gradient(180deg, ${theme.glassInput} 0%, ${theme.background} 58%, ${theme.primary} 100%)` }]}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}>
          <DashboardCapsule
            title="Presensi Praktikan"
            subtitle="Periksa lokasi dan lakukan presensi saat sesi dibuka."
            stats={[
              { label: 'Semua Jadwal', value: schedules.length, onPress: () => router.navigate('/praktikan/jadwal') },
              { label: 'Sesi Dibuka', value: openSessions.length, active: true, onPress: () => router.navigate('/praktikan/presensi') },
              { label: 'Absensi', value: alphaCount, onPress: () => router.navigate({ pathname: '/praktikan/jadwal', params: { view: 'alpha' } }) },
            ]}
          />

          <View style={styles.heading}>
            <ThemedText type="title">Presensi Praktikan</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Presensi aktif setelah sesi dibuka dan lokasi berada dalam radius laboratorium. Koordinat dan akurasi lokasi disimpan bersama catatan presensi.</ThemedText>
          </View>

          {openSessions.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.notice}>
              <ThemedText type="smallBold">Belum ada sesi yang dibuka</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Tombol presensi dan pemindai QR akan tersedia setelah asisten membuka sesi.</ThemedText>
            </ThemedView>
          ) : !permission ? (
            <ThemedView type="backgroundElement" style={styles.notice}>
              <ThemedText type="small" themeColor="textSecondary">Memeriksa izin kamera untuk opsi pemindaian QR…</ThemedText>
            </ThemedView>
          ) : !permission.granted ? (
            <ThemedView type="backgroundElement" style={styles.notice}>
              <ThemedText type="smallBold">QR opsional</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Kamu tetap bisa presensi dengan tombol di kartu sesi. Izinkan kamera jika ingin memakai QR.</ThemedText>
              <ActionButton label="Aktifkan pemindai QR" onPress={requestPermission} />
              {!permission.canAskAgain ? (
                <Pressable onPress={() => Linking.openSettings()}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>Buka Pengaturan</ThemedText>
                </Pressable>
              ) : null}
            </ThemedView>
          ) : (
            <View style={styles.qrSection}>
              <View style={styles.scannerHeader}>
                <ThemedText type="smallBold">Atau pindai QR presensi</ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={scannerVisible ? 'Tutup pemindai QR' : 'Buka pemindai QR'}
                  disabled={busy}
                  onPress={() => setScannerVisible((visible) => !visible)}
                  style={({ pressed }) => [styles.scannerToggle, { borderColor: theme.glassBorder, backgroundColor: theme.glassCard }, pressed && styles.pressed, busy && styles.disabled]}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>{scannerVisible ? 'Tutup' : 'Buka'}</ThemedText>
                </Pressable>
              </View>
              {scannerVisible ? <View style={[styles.cameraFrame, { borderColor: theme.glassBorder }]}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={scanPaused || busy || checkingSessionId !== null ? undefined : handleScan}
                />
                {!scanPaused ? <View pointerEvents="none" style={styles.scanGuide} /> : null}
                {busy ? (
                  <View style={styles.cameraOverlay}>
                    <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>Memeriksa lokasi & QR…</ThemedText>
                  </View>
                ) : null}
              </View> : null}
            </View>
          )}

          <ThemedView type="backgroundElement" style={styles.resultCard}>
            <ThemedText type="smallBold" style={{ color: isError ? theme.danger : theme.success }}>{checkedInSessionId ? 'Presensi tercatat' : 'Hasil pemeriksaan'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{message}</ThemedText>
            {locationSettingsNeeded ? (
              <ActionButton label="Buka Pengaturan Lokasi" variant="secondary" onPress={() => void Linking.openSettings()} />
            ) : retrySessionId ? (
              <ActionButton
                label="Coba lagi"
                variant="secondary"
                disabled={checkingSessionId !== null}
                loading={checkingSessionId === retrySessionId}
                onPress={() => void handleSessionCheckIn(retrySessionId)}
              />
            ) : null}
            {scanPaused && !busy ? <ActionButton label="Pindai QR lagi" variant="secondary" onPress={scanAgain} /> : null}
          </ThemedView>

          <View style={styles.activeSessionsSection}>
            <View style={styles.activeSessionsHeading}>
              <ThemedText type="subtitle">Sesi Praktikum</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Tombol presensi hanya tampil pada sesi yang sedang dibuka.</ThemedText>
            </View>
            {openSchedules.length === 0 ? (
              <BlurView intensity={62} tint="light" style={[styles.sessionCard, styles.noOpenSession, { borderColor: theme.glassBorderHighlight }]}>
                <ThemedText type="smallBold">Belum ada sesi yang dibuka</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Sesi akan muncul di sini setelah asisten membukanya.</ThemedText>
              </BlurView>
            ) : openSchedules.map((schedule) => {
              const session = sessions.find((item) => item.scheduleId === schedule.id);
              const sessionStatus = session?.status ?? 'scheduled';
              const record = session ? myAttendance.find((item) => item.sessionId === session.id) : undefined;
              const attendanceLabel = record?.status === 'present'
                ? 'Hadir'
                : record?.status === 'absent'
                  ? 'Alpha'
                : record?.status === 'excused'
                  ? record.manualReason === 'sakit' ? 'Sakit' : 'Izin Disetujui'
                  : sessionStatus === 'closed' || schedule.date.slice(0, 10) < todayDateKey
                    ? 'Alpha'
                    : sessionStatus === 'open'
                      ? 'Belum Presensi'
                      : 'Menunggu Sesi Dibuka';
              return (
                <BlurView key={schedule.id} intensity={62} tint="light" style={[styles.sessionCard, { borderColor: sessionStatus === 'open' ? theme.primary : theme.glassBorderHighlight }]}>
                  <View style={styles.sessionCardHeader}>
                    <View style={styles.sessionCopy}>
                      <ThemedText type="subtitle">{schedule.praktikum}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{schedule.kelas} · {schedule.ruang}</ThemedText>
                    </View>
                    <SessionStatusBadge status={sessionStatus} />
                  </View>
                  <View style={[styles.scheduleInfoBox, { borderColor: theme.glassBorder }]}>
                    <View style={styles.scheduleInfoColumn}>
                      <ThemedText type="small" themeColor="textSecondary">Waktu</ThemedText>
                      <ThemedText type="smallBold">{schedule.startTime}–{schedule.endTime} WIB</ThemedText>
                    </View>
                    <View style={[styles.scheduleInfoDivider, { backgroundColor: theme.glassBorder }]} />
                    <View style={styles.scheduleInfoColumn}>
                      <ThemedText type="small" themeColor="textSecondary">Tanggal</ThemedText>
                      <ThemedText type="smallBold">{formatDate(schedule.date)}</ThemedText>
                    </View>
                  </View>
                  {sessionStatus === 'open' && !record ? (
                    <ActionButton
                      label={checkingSessionId === session?.id ? 'Memeriksa lokasi…' : 'Periksa lokasi & presensi'}
                      loading={checkingSessionId === session?.id}
                      disabled={checkingSessionId !== null}
                      onPress={() => session && void handleSessionCheckIn(session.id)}
                    />
                  ) : null}
                  {session && locationChecks[session.id] ? (
                    <View style={[styles.locationResult, { backgroundColor: locationChecks[session.id].withinRadius ? theme.successSoft : theme.dangerSoft }]}>
                      <ThemedText type="smallBold" style={{ color: locationChecks[session.id].withinRadius ? theme.success : theme.danger }}>
                        {locationChecks[session.id].withinRadius ? 'Lokasi dalam radius' : 'Lokasi di luar radius'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Jarak {Math.round(locationChecks[session.id].distance)} m · batas {locationChecks[session.id].radius} m · akurasi ±{Math.round(locationChecks[session.id].accuracy)} m
                      </ThemedText>
                    </View>
                  ) : null}
                  <View style={styles.sessionActions}>
                    <Pressable onPress={() => setSelectedSchedule(schedule)} style={({ pressed }) => [styles.detailButton, { borderColor: theme.glassBorder, backgroundColor: 'rgba(255,255,255,0.62)' }, pressed && styles.pressed]}>
                      <ThemedText type="smallBold" style={{ color: theme.primary }}>Lihat Detail Sesi</ThemedText>
                    </Pressable>
                    <View style={[styles.attendancePill, { backgroundColor: attendanceLabel === 'Hadir' ? theme.successSoft : attendanceLabel === 'Alpha' ? theme.dangerSoft : attendanceLabel === 'Izin Disetujui' ? theme.warningSoft : 'rgba(255,255,255,0.54)' }]}>
                      <ThemedText type="smallBold" style={{ color: attendanceLabel === 'Hadir' ? theme.success : attendanceLabel === 'Alpha' ? theme.danger : theme.primary }}>{attendanceLabel}</ThemedText>
                    </View>
                  </View>
                </BlurView>
              );
            })}
          </View>
        </ScrollView>
        <Modal visible={selectedSchedule !== null} transparent animationType="slide" onRequestClose={() => setSelectedSchedule(null)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Tutup detail sesi" onPress={() => setSelectedSchedule(null)} />
            {selectedSchedule ? (() => {
              const session = sessions.find((item) => item.scheduleId === selectedSchedule.id);
              const record = session ? myAttendance.find((item) => item.sessionId === session.id) : undefined;
              const assistant = getUser(selectedSchedule.assistantId);
              const sessionStatus = session?.status ?? 'scheduled';
              const statusMessage = record?.status === 'present'
                ? 'Presensimu sudah tercatat sebagai hadir.'
                : record?.status === 'absent'
                  ? 'Asisten mencatat presensimu sebagai alpha.'
                : record?.status === 'excused'
                  ? record.manualReason === 'sakit'
                    ? 'Asisten mencatat status sakit untuk sesi ini.'
                    : 'Izinmu disetujui atau dicatat asisten untuk sesi ini.'
                  : sessionStatus === 'open'
                    ? 'Sesi sedang dibuka. Pindai QR untuk melakukan presensi.'
                    : sessionStatus === 'closed'
                      ? 'Sesi telah ditutup.'
                      : 'Menunggu sesi dibuka oleh asisten.';
              return (
                <View style={[styles.detailSheet, { backgroundColor: theme.primary, borderColor: theme.glassBorderHighlight, paddingBottom: insets.bottom + Spacing.three }]}>
                  <View style={styles.sheetHandle} />
                  <View style={styles.detailSheetHeader}>
                    <ThemedText type="title" style={{ color: theme.primaryText }}>{selectedSchedule.praktikum}</ThemedText>
                    <SessionStatusBadge status={sessionStatus} />
                  </View>
                  <ThemedText type="small" style={{ color: theme.primaryText }}>{selectedSchedule.kelas} · {selectedSchedule.ruang}</ThemedText>
                  <View style={[styles.detailInfoCard, { backgroundColor: 'rgba(255,255,255,0.88)', borderColor: theme.glassBorderHighlight }]}>
                    <DetailRow label="Kelas" value={selectedSchedule.kelas} />
                    <DetailRow label="Ruang Laboratorium" value={selectedSchedule.ruang} />
                    <DetailRow label="Tanggal Pelaksanaan" value={formatDate(selectedSchedule.date)} />
                    <DetailRow label="Jam Praktikum" value={`${selectedSchedule.startTime}–${selectedSchedule.endTime} WIB`} />
                    <DetailRow label="Asisten Laboratorium" value={assistant?.name ?? '-'} />
                  </View>
                  <View style={[styles.statusNotice, { backgroundColor: record?.status === 'present' ? theme.successSoft : record?.status === 'absent' ? theme.dangerSoft : record?.status === 'excused' ? theme.warningSoft : 'rgba(255,255,255,0.78)' }]}>
                    <ThemedText type="smallBold">{record?.status === 'present' ? 'Hadir' : record?.status === 'absent' ? 'Alpha' : record?.status === 'excused' ? record.manualReason === 'sakit' ? 'Sakit' : 'Izin' : sessionStatus === 'open' ? 'Sesi Dibuka' : sessionStatus === 'closed' ? 'Sesi Ditutup' : 'Menunggu Sesi Dibuka'}</ThemedText>
                    <ThemedText type="small">{statusMessage}</ThemedText>
                  </View>
                  <Pressable onPress={() => setSelectedSchedule(null)} style={[styles.closeButton, { backgroundColor: theme.primaryText }]}>
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>Tutup</ThemedText>
                  </Pressable>
                </View>
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
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: Spacing.three, gap: Spacing.three },
  activeSessionsSection: { gap: Spacing.two },
  activeSessionsHeading: { gap: Spacing.half, paddingHorizontal: Spacing.half },
  sessionCard: { padding: Spacing.three, gap: Spacing.one, borderWidth: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.62)', shadowColor: '#FFFFFF', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.26, shadowRadius: 16, elevation: 4 },
  noOpenSession: { minHeight: 90, justifyContent: 'center' },
  sessionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionCopy: { flex: 1, gap: Spacing.half },
  heading: { gap: Spacing.one },
  qrSection: { gap: Spacing.two },
  scannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  scannerToggle: { minHeight: 36, justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: 999, borderWidth: 1 },
  disabled: { opacity: 0.55 },
  notice: { padding: Spacing.three, borderRadius: 22, gap: Spacing.two },
  cameraFrame: { height: 360, borderWidth: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: '#171914' },
  camera: { flex: 1 },
  scanGuide: { position: 'absolute', width: 220, height: 220, alignSelf: 'center', top: 70, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 28 },
  cameraOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.42)' },
  resultCard: { padding: Spacing.three, borderRadius: 22, gap: Spacing.two },
  locationResult: { padding: Spacing.two, borderRadius: 12, gap: Spacing.half },
  scheduleInfoBox: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderRadius: 18, padding: Spacing.two, gap: Spacing.two, backgroundColor: 'rgba(255,255,255,0.44)' },
  scheduleInfoColumn: { flex: 1, justifyContent: 'center', gap: Spacing.half },
  scheduleInfoDivider: { width: 1 },
  sessionActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  detailButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three, borderWidth: 1.5, borderRadius: 18 },
  attendancePill: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: 18 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,26,20,0.48)' },
  detailSheet: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderWidth: 1, gap: Spacing.two },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.82)', marginBottom: Spacing.one },
  detailSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  detailInfoCard: { padding: Spacing.three, borderWidth: 1, borderRadius: 22, gap: Spacing.one },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two, paddingVertical: Spacing.one, borderBottomWidth: StyleSheet.hairlineWidth },
  detailLabel: { flex: 1 },
  detailValue: { flex: 1, textAlign: 'right' },
  statusNotice: { padding: Spacing.three, borderRadius: 20, gap: Spacing.one },
  closeButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  pressed: { opacity: 0.78 },
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
