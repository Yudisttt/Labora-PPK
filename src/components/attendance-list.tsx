import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSessionAttendance } from '@/hooks/use-sessions';
import { useTheme } from '@/hooks/use-theme';
import type { User } from '@/types';
import { formatTime } from '@/utils/format';

type AttendanceListProps = {
  sessionId: string;
  participants: User[];
};

export function AttendanceList({
  sessionId,
  participants,
}: AttendanceListProps) {
  const theme = useTheme();
  const { records, loading, error } = useSessionAttendance(sessionId);

  const attendanceByUser = useMemo(() => {
    const map = new Map<string, string>();

    records.forEach((record) => map.set(record.userId, record.checkedInAt));

    return map;
  }, [records]);

  const presentCount = participants.filter((participant) =>
    attendanceByUser.has(participant.id),
  ).length;

  return (
    <ThemedView type="backgroundElement" style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="smallBold">Rekap kehadiran</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {presentCount}/{participants.length} hadir
        </ThemedText>
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}

      {loading ? (
        <ThemedText type="small" themeColor="textSecondary">
          Memuat rekap...
        </ThemedText>
      ) : null}

      {participants.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Belum ada praktikan terdaftar pada kelas ini.
        </ThemedText>
      ) : (
        participants.map((participant) => {
          const checkedInAt = attendanceByUser.get(participant.id);

          return (
            <View key={participant.id} style={styles.row}>
              <View style={styles.rowMeta}>
                <ThemedText type="smallBold">{participant.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {participant.identityNumber}
                </ThemedText>
              </View>

              <ThemedText
                type="smallBold"
                style={{
                  color: checkedInAt ? theme.success : theme.textSecondary,
                }}>
                {checkedInAt ? formatTime(checkedInAt) : 'Belum'}
              </ThemedText>
            </View>
          );
        })
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  rowMeta: {
    flex: 1,
    gap: Spacing.half,
  },
});
