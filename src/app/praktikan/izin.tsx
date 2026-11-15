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
import { useApp } from '@/state/app-context';
import { classifyPermissionReason } from '@/services/permission-sentiment';
import { submitPermissionRequest, subscribeToPermissionRequestsForUser } from '@/services/permission-requests';
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
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Spacing.five },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              ‹ Kembali ke jadwal
            </ThemedText>
          </Pressable>

          <View style={styles.header}>
            <ThemedText type="subtitle">Pengajuan Izin</ThemedText>
            <ThemedText themeColor="textSecondary">
              Pilih sesi praktikum dan jelaskan alasan ketidakhadiranmu.
            </ThemedText>
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
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
                            ? theme.backgroundSelected
                            : theme.background,
                          borderColor: selected ? theme.primary : theme.border,
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
                  backgroundColor: theme.background,
                  borderColor: theme.border,
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
            <ThemedText type="subtitle" style={styles.sectionTitle}>
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
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
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

                  return (
                    <View
                      key={request.id}
                      style={[
                        styles.requestCard,
                        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                      ]}
                    >
                      <View style={styles.requestHeader}>
                        <ThemedText type="smallBold" style={styles.requestTitle}>
                          {requestSession ? sessionTitle(requestSession) : 'Sesi praktikum'}
                        </ThemedText>
                        <ThemedText
                          type="smallBold"
                          style={{
                            color:
                              request.status === 'approved'
                                ? theme.success
                                : request.status === 'rejected'
                                  ? theme.danger
                                  : theme.warning,
                          }}
                        >
                          {STATUS_LABELS[request.status]}
                        </ThemedText>
                      </View>
                      <ThemedText type="small">{request.reason}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {request.aiPrediction?.modelVersion === 'permission-reason-v1'
                          ? `Klasifikasi alasan: ${predictionLabel(request.aiPrediction)}`
                          : request.aiPrediction
                            ? `Sentimen EDOM versi lama: ${predictionLabel(request.aiPrediction)}`
                            : 'Klasifikasi alasan: Belum tersedia'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Prediksi hanya informasi pendukung; keputusan ditentukan asisten.
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Diajukan: {formatDateTime(request.submittedAt)}
                      </ThemedText>
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
  backButton: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  header: { gap: Spacing.one },
  formCard: {
    padding: Spacing.three,
    gap: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 1,
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
  sectionTitle: { fontSize: 24, lineHeight: 32 },
  emptyState: { padding: Spacing.three, gap: Spacing.one, borderRadius: Spacing.three, borderWidth: 1 },
  requestList: { gap: Spacing.two },
  requestCard: { padding: Spacing.three, gap: Spacing.two, borderRadius: Spacing.three, borderWidth: 1 },
  requestHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.two },
  requestTitle: { flex: 1 },
  pressed: { opacity: 0.75 },
});
