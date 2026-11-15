import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { checkIn } from '@/services/sessions';
import type { CheckInFailureReason, Session } from '@/types';
import { formatTime } from '@/utils/format';

const FAILURE_MESSAGES: Record<CheckInFailureReason, string> = {
   unauthorized: 'Kamu belum masuk. Silakan login ulang.',
  'invalid-role': 'Hanya praktikan yang dapat melakukan presensi.',
  'unknown-session': 'Sesi tidak ditemukan.',
  'not-open': 'Sesi belum dibuka asisten.',
  'already-checked-in': 'Kamu sudah melakukan presensi pada sesi ini.',
};

type CheckInButtonProps = {
  session: Session | undefined;
  userId: string;
  checkedInAt: string | null;
};

export function CheckInButton({
  session,
  userId,
  checkedInAt,
}: CheckInButtonProps) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = session?.status === 'open';

  async function handlePress() {
    if (!session) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await checkIn(session.id, userId);

      if (!result.ok) {
        setError(FAILURE_MESSAGES[result.reason]);
      }
    } catch {
      setError('Presensi gagal. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  if (checkedInAt) {
    return (
      <View style={styles.done}>
        <ThemedText type="smallBold" style={{ color: theme.success }}>
          Presensi tercatat
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Pukul {formatTime(checkedInAt)}
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActionButton
        label={isOpen ? 'Lakukan presensi' : 'Sesi belum dibuka'}
        disabled={!isOpen || !userId}
        loading={busy}
        onPress={handlePress}
      />

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  done: {
    gap: Spacing.half,
    paddingTop: Spacing.two,
  },
});
