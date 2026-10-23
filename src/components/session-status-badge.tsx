import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SessionStatus } from '@/types';

const LABELS: Record<SessionStatus, string> = {
  scheduled: 'Terjadwal',
  open: 'Dibuka',
  closed: 'Ditutup',
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const theme = useTheme();

  const palette = {
    scheduled: {
      backgroundColor: theme.backgroundSelected,
      color: theme.textSecondary,
    },
    open: {
      backgroundColor: theme.successSoft,
      color: theme.success,
    },
    closed: {
      backgroundColor: theme.dangerSoft,
      color: theme.danger,
    },
  }[status];

  return (
    <View
      style={[styles.badge, { backgroundColor: palette.backgroundColor }]}>
      <ThemedText type="smallBold" style={{ color: palette.color }}>
        {LABELS[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.five,
  },
});
