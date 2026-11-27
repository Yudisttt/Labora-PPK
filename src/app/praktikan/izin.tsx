import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardCapsule } from '@/components/dashboard-ui';
import { PaginatedCards } from '@/components/paginated-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { subscribeToPermissionRequestsForUser } from '@/services/permission-requests';
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
  const [requestState, setRequestState] = useState<{
    userId: string;
    requests: PermissionRequest[];
    error: string | null;
  } | null>(null);
  const [retryKey, setRetryKey] = useState(0);

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
  }, [currentUser, retryKey]);

  const requestStateIsCurrent = requestState?.userId === currentUser?.id;
  const requests = requestStateIsCurrent ? requestState?.requests ?? [] : [];
  const requestsLoading = Boolean(currentUser && !requestStateIsCurrent);
  const requestsError = requestStateIsCurrent ? requestState?.error ?? null : null;

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
            { paddingBottom: insets.bottom + 160 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <DashboardCapsule
            title="Perizinan"
            subtitle="Pantau status pengajuan izin praktikummu."
            tone="light"
            stats={[
              { label: 'Sesi Tersedia', value: availableSessions.length },
              { label: 'Pengajuan Saya', value: requests.length },
              { label: 'Disetujui', value: requests.filter((item) => item.status === 'approved').length },
            ]}
          />
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
                <Pressable accessibilityRole="button" onPress={() => setRetryKey((key) => key + 1)}>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>Coba lagi</ThemedText>
                </Pressable>
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
                <PaginatedCards
                  items={requests}
                  keyExtractor={(request) => request.id}
                  renderItem={(request) => {
                  const requestSession = sessions.find(
                    (session) => session.id === request.sessionId,
                  );
                  const requestSchedule = requestSession
                    ? getSchedule(requestSession.scheduleId)
                    : undefined;

                  return (
                    <View
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
                  }}
                />
              </View>
            )}
          </View>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajukan izin baru"
          onPress={() => router.push('/praktikan/ajukan-izin')}
          style={({ pressed }) => [
            styles.fab,
            {
              bottom: Math.max(insets.bottom, 16) + 86,
              backgroundColor: theme.primary,
              borderColor: theme.glassBorderHighlight,
            },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="add" size={22} color={theme.primaryText} />
          <ThemedText type="smallBold" style={{ color: theme.primaryText }}>Ajukan Izin Baru</ThemedText>
        </Pressable>
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
    paddingHorizontal: Spacing.three,
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
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  requestHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  requestHeading: { alignSelf: 'stretch', gap: 2 },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 999,
  },
  detailBox: {
    padding: Spacing.two,
    borderRadius: 10,
    borderWidth: 1,
    gap: Spacing.half,
  },
  requestMetaRow: { gap: 2 },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 50,
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
    borderWidth: 1.5,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 9,
    zIndex: 20,
  },
  pressed: { opacity: 0.75 },
});
