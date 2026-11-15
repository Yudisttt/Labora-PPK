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
      backgroundColor: 'rgba(255, 255, 255, 0.45)',
      borderColor: 'rgba(255, 255, 255, 0.7)',
      color: theme.textSecondary,
    },
    open: {
      backgroundColor: 'rgba(53, 64, 36, 0.12)',
      borderColor: 'rgba(53, 64, 36, 0.4)',
      color: theme.primary,
    },
    closed: {
      backgroundColor: theme.dangerSoft,
      borderColor: 'rgba(180, 35, 24, 0.3)',
      color: theme.danger,
    },
  }[status];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
      ]}>
      {status === 'open' ? (
        <View style={[styles.dotLive, { backgroundColor: theme.primary }]} />
      ) : null}
      <ThemedText type="smallBold" style={{ color: palette.color, fontSize: 11, letterSpacing: 0.3 }}>
        {LABELS[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  dotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
