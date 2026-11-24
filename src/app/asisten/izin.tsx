import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  decidePermissionRequest,
  subscribeToAllPermissionRequests,
} from '@/services/permission-requests';
import { useApp } from '@/state/app-context';
import type { PermissionDecision, PermissionRequest, PermissionRequestStatus } from '@/types';
import { formatDateTime } from '@/utils/format';

type RequestFilter = 'all' | PermissionRequestStatus;
type PendingDecision = { request: PermissionRequest; decision: PermissionDecision } | null;

const STATUS_LABELS: Record<PermissionRequestStatus, string> = {
  pending: 'Menunggu pemeriksaan',
  approved: 'Izin diterima',
  rejected: 'Izin ditolak',
};

const CATEGORY_LABELS = {
  negatif: 'Negatif',
  netral: 'Netral',
  positif: 'Positif',
} as const;

const EMPTY_REQUESTS: PermissionRequest[] = [];

function errorMessage(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  const message = error instanceof Error ? error.message : '';

  if (code === 'permission-denied' || message.includes('permission-denied')) {
    return 'Akses Firestore ditolak. Periksa akun dan aturan akses Firebase.';
  }
  if (
    code === 'unavailable' ||
    code === 'network-request-failed' ||
    message.includes('network')
  ) {
    return 'Tidak dapat terhubung ke Firestore. Periksa koneksi lalu coba lagi.';
  }
  return message || 'Terjadi kesalahan saat memproses pengajuan.';
}

export default function AsistenIzinScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser, sessions, getSchedule } = useApp();
  const [requestsState, setRequestsState] = useState<{
    requests: PermissionRequest[];
    error: string | null;
  } | null>(null);
  const [filter, setFilter] = useState<RequestFilter>('pending');
  const [pendingDecision, setPendingDecision] = useState<PendingDecision>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() =>
    subscribeToAllPermissionRequests(
      (requests) => setRequestsState({ requests, error: null }),
      (error) => setRequestsState({ requests: [], error: errorMessage(error) }),
    ),
  []);

  const requests = requestsState?.requests ?? EMPTY_REQUESTS;
  const filteredRequests = useMemo(
    () => filter === 'all' ? requests : requests.filter((request) => request.status === filter),
    [filter, requests],
  );
  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((request) => request.status === 'pending').length,
    approved: requests.filter((request) => request.status === 'approved').length,
    rejected: requests.filter((request) => request.status === 'rejected').length,
  }), [requests]);

  async function confirmDecision() {
    if (!pendingDecision || !currentUser) return;
    setSaving(true);
    setActionError(null);
    try {
      await decidePermissionRequest(
        pendingDecision.request.id,
        pendingDecision.decision,
        currentUser.id,
      );
      setPendingDecision(null);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}
        >
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>‹ Kembali ke jadwal</ThemedText>
          </Pressable>

          <View style={styles.header}>
            <ThemedText type="subtitle">Pemeriksaan Pengajuan Izin</ThemedText>
            <ThemedText themeColor="textSecondary">
              Tinjau alasan dan hasil klasifikasi AI. Keputusan izin tetap ditentukan oleh asisten.
            </ThemedText>
          </View>

          <View style={styles.filters}>
            {(['pending', 'all', 'approved', 'rejected'] as const).map((item) => {
              const selected = filter === item;
              const label = item === 'all' ? 'Semua' : STATUS_LABELS[item];
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(item)}
                  style={[styles.filterButton, { backgroundColor: selected ? theme.primary : theme.backgroundElement, borderColor: selected ? theme.primary : theme.border }]}
                >
                  <ThemedText type="smallBold" style={{ color: selected ? theme.primaryText : theme.text }}>
                    {label} ({counts[item]})
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {!requestsState ? (
            <View style={[styles.messageCard, { borderColor: theme.border }]}>
              <ThemedText themeColor="textSecondary">Memuat pengajuan izin…</ThemedText>
            </View>
          ) : requestsState.error ? (
            <View style={[styles.messageCard, styles.errorCard]}>
              <ThemedText style={{ color: theme.danger }}>{requestsState.error}</ThemedText>
            </View>
          ) : filteredRequests.length === 0 ? (
            <View style={[styles.messageCard, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">Belum ada pengajuan</ThemedText>
              <ThemedText themeColor="textSecondary">
                {filter === 'pending' ? 'Pengajuan baru akan muncul di sini secara langsung.' : 'Tidak ada pengajuan pada kategori ini.'}
              </ThemedText>
            </View>
          ) : filteredRequests.map((request) => {
            const session = sessions.find((item) => item.id === request.sessionId);
            const schedule = session ? getSchedule(session.scheduleId) : undefined;
            const prediction = request.aiPrediction;
            const category = prediction?.label ? CATEGORY_LABELS[prediction.label] : null;
            const oldModel = prediction?.modelVersion === 'edom-sentiment-v1';
            return (
              <View key={request.id} style={[styles.requestCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeading}>
                    <ThemedText type="smallBold">{request.userName}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Sesi: {request.sessionId}</ThemedText>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: request.status === 'approved' ? theme.successSoft : request.status === 'rejected' ? theme.dangerSoft : theme.warningSoft }]}>
                    <ThemedText type="smallBold">{STATUS_LABELS[request.status]}</ThemedText>
                  </View>
                </View>

                {schedule ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {schedule.praktikum} · {schedule.kelas} · {schedule.date}
                  </ThemedText>
                ) : null}

                <View style={styles.detailBlock}>
                  <ThemedText type="smallBold">Alasan izin</ThemedText>
                  <ThemedText>{request.reason}</ThemedText>
                </View>

                <View style={styles.aiBlock}>
                  <ThemedText type="smallBold">Klasifikasi AI</ThemedText>
                  <ThemedText themeColor="textSecondary">
                    {category ?? (prediction?.status === 'error' ? 'Tidak dapat dianalisis' : 'Belum tersedia')}
                    {oldModel ? ' · Model EDOM lama' : ''}
                  </ThemedText>
                </View>

                <ThemedText type="small" themeColor="textSecondary">
                  Diajukan: {request.submittedAt ? formatDateTime(request.submittedAt) : 'Waktu belum tersedia'}
                </ThemedText>

                {request.status === 'pending' ? (
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => { setActionError(null); setPendingDecision({ request, decision: 'approved' }); }}
                      style={[styles.actionButton, { backgroundColor: theme.primary }]}
                    >
                      <ThemedText type="smallBold" style={{ color: theme.primaryText }}>Terima izin</ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => { setActionError(null); setPendingDecision({ request, decision: 'rejected' }); }}
                      style={[styles.actionButton, styles.rejectButton, { borderColor: theme.danger }]}
                    >
                      <ThemedText type="smallBold" style={{ color: theme.danger }}>Tolak izin</ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Diputuskan oleh {request.decisionBy ?? 'asisten'}{request.decisionAt ? ` · ${formatDateTime(request.decisionAt)}` : ''}
                  </ThemedText>
                )}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <Modal
        transparent
        visible={Boolean(pendingDecision)}
        animationType="fade"
        onRequestClose={() => {
          if (!saving) setPendingDecision(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="subtitle">
              {pendingDecision?.decision === 'approved' ? 'Terima pengajuan izin?' : 'Tolak pengajuan izin?'}
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              Keputusan ini akan langsung tersimpan dan terlihat oleh praktikan.
            </ThemedText>
            {actionError ? <ThemedText style={{ color: theme.danger }}>{actionError}</ThemedText> : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => setPendingDecision(null)} style={[styles.actionButton, { borderColor: theme.border, borderWidth: 1 }]}>
                <ThemedText type="smallBold">Batal</ThemedText>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={confirmDecision} style={[styles.actionButton, { backgroundColor: theme.primary, opacity: saving ? 0.65 : 1 }]}>
                <ThemedText type="smallBold" style={{ color: theme.primaryText }}>{saving ? 'Menyimpan…' : 'Konfirmasi'}</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    padding: Spacing.four,
    paddingBottom: 110,
    gap: Spacing.three,
  },
  backButton: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  header: { gap: Spacing.half },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filterButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  messageCard: { padding: Spacing.three, borderRadius: 14, borderWidth: 1, gap: Spacing.one },
  errorCard: { borderColor: '#B42318', backgroundColor: '#FDECEA' },
  requestCard: { padding: Spacing.three, borderRadius: 16, borderWidth: 1, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  cardHeading: { flex: 1, gap: Spacing.half },
  statusPill: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  detailBlock: { gap: Spacing.one },
  aiBlock: { gap: Spacing.one, padding: Spacing.two, borderRadius: 10, backgroundColor: '#EDE4D5' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  actionButton: { flexGrow: 1, minWidth: 120, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 10 },
  rejectButton: { borderWidth: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.four },
  modalCard: { width: '100%', maxWidth: 440, alignSelf: 'center', borderWidth: 1, borderRadius: 18, padding: Spacing.four, gap: Spacing.three },
});
