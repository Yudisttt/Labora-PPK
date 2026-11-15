import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { SessionStatusBadge } from '@/components/session-status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Schedule, Session } from '@/types';
import { formatDate, formatDateTime } from '@/utils/format';

type SessionCardProps = {
  schedule: Schedule;
  session: Session | undefined;
  busy: boolean;
  recapExpanded: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggleRecap: () => void;
};

export function SessionCard({
  schedule,
  session,
  busy,
  recapExpanded,
  onOpen,
  onClose,
  onToggleRecap,
}: SessionCardProps) {
  const isOpen = session?.status === 'open';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold">{schedule.praktikum}</ThemedText>
        <SessionStatusBadge status={session?.status ?? 'scheduled'} />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {schedule.kelas} · {schedule.ruang}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDate(schedule.date)} · {schedule.startTime}-{schedule.endTime}
      </ThemedText>

      {session?.openedAt ? (
        <ThemedText type="small" themeColor="textSecondary">
          Dibuka {formatDateTime(session.openedAt)}
        </ThemedText>
      ) : null}

      {session?.closedAt ? (
        <ThemedText type="small" themeColor="textSecondary">
          Ditutup {formatDateTime(session.closedAt)}
        </ThemedText>
      ) : null}

      {session ? (
        <View style={styles.actions}>
          {isOpen ? (
            <ActionButton
              label="Tutup sesi"
              variant="danger"
              loading={busy}
              onPress={onClose}
              style={styles.action}
            />
          ) : (
            <ActionButton
              label={session.status === 'closed' ? 'Buka ulang sesi' : 'Buka sesi'}
              loading={busy}
              onPress={onOpen}
              style={styles.action}
            />
          )}

          <ActionButton
            label={recapExpanded ? 'Sembunyikan rekap' : 'Lihat rekap'}
            variant="secondary"
            onPress={onToggleRecap}
            style={styles.action}
          />
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Sesi belum dibuat untuk jadwal ini.
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  action: {
    flexGrow: 1,
    flexBasis: 140,
  },
});
