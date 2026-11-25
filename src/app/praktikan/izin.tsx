import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { submitPermissionRequest, subscribeToPermissionRequestsForUser } from '@/services/permission-requests';
import { classifyPermissionReason } from '@/services/permission-sentiment';
import { useApp } from '@/state/app-context';
import type { PermissionAiPrediction, PermissionRequest, Session } from '@/types';
import { formatDate, formatDateTime } from '@/utils/format';

const STATUS_LABELS = {
  pending: 'Menunggu pemeriksaan',
  approved: 'Izin diterima',
  rejected: 'Izin ditolak',
} as const;

const SENTIMENT_LABELS = {
  negatif: 'Negatif',
  netral: 'Netral',
  positif: 'Positif',
} as const;

function predictionLabel(prediction: PermissionAiPrediction) {
  if (prediction.label) {
    return SENTIMENT_LABELS[prediction.label];
  }

  if (prediction.status === 'error') {
    return 'Model tidak dapat memproses alasan';
  }

  return 'Belum dapat dianalisis';
}

function getErrorMessage(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  const message = error instanceof Error ? error.message : '';

  if (code === 'permission-denied' || message.includes('permission-denied')) {
    return 'Akses Firestore ditolak. Pastikan akun dan aturan akses sudah disiapkan.';
  }

  if (
    code === 'unavailable' ||
    code === 'network-request-failed' ||
    message.includes('unavailable') ||
    message.includes('network')
  ) {
    return 'Tidak dapat terhubung ke Firestore. Periksa koneksi internet lalu coba lagi.';
  }

  return message || 'Terjadi kesalahan. Silakan coba lagi.';
}

export default function PraktikanIzinScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser, sessions, getSchedule } = useApp();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [requestState, setRequestState] = useState<{
    userId: string;
    requests: PermissionRequest[];
    error: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [aiPrediction, setAiPrediction] = useState<PermissionAiPrediction | null>(null);

  const availableSessions = useMemo(() => {
    const currentSessionBySchedule = new Map<string, Session>();

    sessions.forEach((session) => {
      if (session.status === 'closed' || !getSchedule(session.scheduleId)) {
        return;
      }

      const current = currentSessionBySchedule.get(session.scheduleId);
      if (!current || session.status === 'open') {
        currentSessionBySchedule.set(session.scheduleId, session);
      }
    });

    return [...currentSessionBySchedule.values()];
  }, [getSchedule, sessions]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'praktikan') {
      return;
    }

    return subscribeToPermissionRequestsForUser(
      currentUser.id,
      (nextRequests) => {
        setRequestState({
          userId: currentUser.id,
          requests: nextRequests,
          error: null,
        });
      },
      (error) => {
        setRequestState({
          userId: currentUser.id,
          requests: [],
          error: getErrorMessage(error),
        });
      },
    );
  }, [currentUser]);

  const requestStateIsCurrent = requestState?.userId === currentUser?.id;
  const requests = requestStateIsCurrent ? requestState?.requests ?? [] : [];
  const requestsLoading = Boolean(currentUser && !requestStateIsCurrent);
  const requestsError = requestStateIsCurrent ? requestState?.error ?? null : null;

  const selectedSession = availableSessions.find(
    (session) => session.id === selectedSessionId,
  );

  async function handleSubmit() {
    if (!currentUser || currentUser.role !== 'praktikan') {
      setSubmitMessage('Hanya praktikan yang dapat mengajukan izin.');
      return;
    }

    if (!selectedSession) {
      setSubmitMessage('Pilih sesi praktikum yang akan diajukan izinnya.');
      return;
    }

    if (!reason.trim()) {
      setSubmitMessage('Tuliskan alasan izin terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    setSubmitMessage(null);
    const prediction = classifyPermissionReason(reason);
    setAiPrediction(prediction);

    try {
      await submitPermissionRequest({
        sessionId: selectedSession.id,
        userId: currentUser.id,
        userName: currentUser.name,
        reason,
        aiPrediction: prediction,
      });
      setReason('');
      setSelectedSessionId(null);
      setSubmitMessage('Pengajuan izin berhasil dikirim. Statusnya menunggu pemeriksaan asisten.');
    } catch (error) {
      setSubmitMessage(
        getErrorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function sessionTitle(session: Session) {
    const schedule = getSchedule(session.scheduleId);
    return schedule
      ? `${schedule.praktikum} · ${schedule.kelas}`
      : 'Jadwal praktikum tidak ditemukan';
  }

  return (
    <ThemedView
      style={[
        styles.screen,
        {
          backgroundImage: `linear-gradient(180deg, ${theme.glassInput} 0%, ${theme.background} 58%, ${theme.primary} 100%)`,
        },
      ]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 95 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              { borderColor: '#C8B995' },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              ← Kembali
            </ThemedText>
          </Pressable>

          <View
            style={[
              styles.headerCard,
              { backgroundColor: '#F7F1E7', borderColor: '#C8B995' },
            ]}
          >
            <ThemedText type="subtitle" style={styles.headerTitle}>
              Pengajuan Izin
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Pilih sesi praktikum dan jelaskan alasan ketidakhadiranmu.
            </ThemedText>

            <View style={styles.headerStatRow}>
              {[
                { label: 'Sesi Tersedia', value: availableSessions.length },
                { label: 'Pengajuan Saya', value: requests.length },
                {
                  label: 'Disetujui',
                  value: requests.filter((item) => item.status === 'approved')
                    .length,
                },
              ].map((stat) => (
                <View
                  key={stat.label}
                  style={[
                    styles.headerStatCard,
                    { backgroundColor: '#F7F1E7', borderColor: '#C8B995' },
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={[styles.headerStatValue, { color: theme.primary }]}
                  >
                    {stat.value}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {stat.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: '#F7F1E7', borderColor: '#C8B995' },
            ]}
          >
            <ThemedText type="smallBold">Pilih sesi</ThemedText>
            {availableSessions.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Belum ada sesi yang dapat dipilih.
              </ThemedText>
            ) : (
              <View style={styles.sessionList}>
                {availableSessions.map((session) => {
                  const schedule = getSchedule(session.scheduleId);
                  const selected = session.id === selectedSessionId;

                  return (
                    <Pressable
                      key={session.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedSessionId(session.id)}
                      style={({ pressed }) => [
                        styles.sessionOption,
                        {
                          backgroundColor: selected
                            ? 'rgba(136, 144, 99, 0.24)'
                            : 'rgba(255, 255, 255, 0.42)',
                          backgroundImage: selected
                            ? `linear-gradient(145deg, rgba(255, 255, 255, 0.82) 0%, rgba(136, 144, 99, 0.24) 100%)`
                            : 'linear-gradient(145deg, rgba(255, 255, 255, 0.78) 0%, rgba(237, 228, 213, 0.5) 100%)',
                          borderColor: selected ? theme.glassBorderHighlight : 'rgba(255, 255, 255, 0.82)',
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.sessionCopy}>
                        <ThemedText type="smallBold">{sessionTitle(session)}</ThemedText>
                        {schedule ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {formatDate(schedule.date)} · {schedule.startTime}–{schedule.endTime} WIB
                          </ThemedText>
                        ) : null}
                      </View>
                      <SessionStatusBadge status={session.status} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.reasonHeader}>
              <ThemedText type="smallBold">Alasan izin</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {reason.length}/1000
              </ThemedText>
            </View>
            <TextInput
              accessibilityLabel="Alasan pengajuan izin"
              value={reason}
              onChangeText={(value) => {
                setReason(value);
                setAiPrediction(null);
              }}
              placeholder="Ceritakan alasan kamu tidak dapat mengikuti praktikum..."
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={1000}
              textAlignVertical="top"
              style={[
                styles.reasonInput,
                {
                  color: theme.text,
                  backgroundColor: 'rgba(247, 241, 231, 0.58)',
                  backgroundImage: 'linear-gradient(145deg, rgba(255, 255, 255, 0.8) 0%, rgba(237, 228, 213, 0.52) 100%)',
                  borderColor: theme.glassBorderHighlight,
                },
              ]}
            />

            {aiPrediction ? (
              <View style={[styles.aiBox, { backgroundColor: theme.warningSoft }]}>
                <ThemedText type="smallBold">
                  Klasifikasi alasan AI: {predictionLabel(aiPrediction)}
                </ThemedText>
                <ThemedText type="small">
                  Hasil klasifikasi ini hanya informasi pendukung. Asisten tetap memeriksa alasan dan menentukan keputusan izin.
                </ThemedText>
              </View>
            ) : null}

            {submitMessage ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.messageBox,
                  {
                    backgroundColor: submitMessage.startsWith('Pengajuan')
                      ? theme.successSoft
                      : theme.dangerSoft,
                  },
                ]}
              >
                <ThemedText type="small">{submitMessage}</ThemedText>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              disabled={submitting}
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: theme.primary, opacity: submitting ? 0.65 : 1 },
                pressed && !submitting && styles.pressed,
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                {submitting ? 'Mengirim...' : 'Kirim Pengajuan Izin'}
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.historySection}>
            <ThemedText type="smallBold" style={styles.sectionTitle}>
              Pengajuan Saya
            </ThemedText>
            {requestsLoading ? (
              <ThemedText type="small" themeColor="textSecondary">
                Memuat pengajuan izin...
              </ThemedText>
            ) : requestsError ? (
              <View style={[styles.messageBox, { backgroundColor: theme.dangerSoft }]}>
                <ThemedText type="small">{requestsError}</ThemedText>
              </View>
            ) : requests.length === 0 ? (
              <View
                style={[
                  styles.emptyState,
                  { backgroundColor: '#F7F1E7', borderColor: '#C8B995' },
                ]}
              >
                <ThemedText type="smallBold">Belum ada pengajuan izin</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Pengajuan yang kamu kirim akan tampil di sini.
                </ThemedText>
              </View>
            ) : (
              <View style={styles.requestList}>
                {requests.map((request) => {
                  const requestSession = sessions.find(
                    (session) => session.id === request.sessionId,
                  );
                  const requestSchedule = requestSession
                    ? getSchedule(requestSession.scheduleId)
                    : undefined;

                  return (
                    <View
                      key={request.id}
                      style={[
                        styles.requestCard,
                        { backgroundColor: '#F7F1E7', borderColor: '#C8B995' },
                      ]}
                    >
                      <View style={styles.requestHeader}>
                        <View style={styles.requestHeading}>
                          <ThemedText type="smallBold">
                            {requestSession ? sessionTitle(requestSession) : 'Sesi praktikum'}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {requestSchedule
                              ? `${formatDate(requestSchedule.date)} · ${requestSchedule.startTime}–${requestSchedule.endTime} WIB`
                              : 'Jadwal tidak ditemukan'}
                          </ThemedText>
                        </View>
                        <View
                          style={[
                            styles.statusPill,
                            {
                              backgroundColor:
                                request.status === 'approved'
                                  ? theme.primary
                                  : request.status === 'rejected'
                                    ? theme.danger
                                    : 'rgba(136, 144, 99, 0.35)',
                            },
                          ]}
                        >
                          <ThemedText
                            type="small"
                            style={{
                              color:
                                request.status === 'pending'
                                  ? theme.text
                                  : theme.primaryText,
                            }}
                          >
                            {STATUS_LABELS[request.status]}
                          </ThemedText>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.detailBox,
                          { backgroundColor: '#EDE4D5', borderColor: '#C8B995' },
                        ]}
                      >
                        <ThemedText type="smallBold">Alasan izin</ThemedText>
                        <ThemedText type="small">{request.reason}</ThemedText>
                      </View>

                      <View style={styles.requestMetaRow}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Klasifikasi AI:{' '}
                          {request.aiPrediction
                            ? predictionLabel(request.aiPrediction)
                            : 'Belum tersedia'}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          Diajukan: {formatDateTime(request.submittedAt)}
                        </ThemedText>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerCard: {
    padding: Spacing.four,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: Spacing.two,
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 28,
  },
  headerStatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  headerStatCard: {
    flexGrow: 1,
    flexBasis: 90,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
  },
  headerStatValue: {
    fontSize: 20,
    lineHeight: 26,
  },
  formCard: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  sessionList: { gap: Spacing.two },
  sessionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    padding: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
  },
  sessionCopy: { flex: 1, gap: Spacing.half },
  reasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reasonInput: {
    minHeight: 128,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
  },
  messageBox: { padding: Spacing.two, borderRadius: Spacing.two },
  aiBox: { padding: Spacing.two, borderRadius: Spacing.two, gap: Spacing.one },
  submitButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  historySection: { gap: Spacing.two },
  sectionTitle: { fontSize: 14 },
  emptyState: { padding: Spacing.three, gap: Spacing.one, borderRadius: 16, borderWidth: 1.5 },
  requestList: { gap: Spacing.two },
  requestCard: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  requestHeading: { flex: 1, gap: 2 },
  statusPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 999,
  },
  detailBox: {
    padding: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    gap: Spacing.half,
  },
  requestMetaRow: { gap: 2 },
  pressed: { opacity: 0.75 },
});
