import { useState } from 'react';
import * as Location from 'expo-location';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/action-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { checkInWithLocation, getLaboratoryForRoom } from '@/services/sessions';
import type { CheckInFailureReason, Session } from '@/types';
import { formatTime } from '@/utils/format';
import { calculateDistanceMeters } from '@/utils/geo';

const FAILURE_MESSAGES: Record<CheckInFailureReason, string> = {
  unauthorized: 'Kamu belum masuk. Silakan login ulang.',
  'invalid-role': 'Hanya praktikan yang dapat melakukan presensi.',
  'unknown-session': 'Sesi tidak ditemukan.',
  'not-open': 'Sesi belum dibuka asisten.',
  'outside-window': 'Waktu praktikum sudah berakhir. Presensi ditutup.',
  excused: 'Kamu tercatat izin pada sesi ini.',
  'already-checked-in': 'Kamu sudah melakukan presensi pada sesi ini.',
  'outside-radius': 'Kamu berada di luar radius laboratorium.',
  'location-unavailable': 'Lokasi perangkat tidak tersedia.',
  'location-inaccurate': 'Lokasi belum cukup akurat. Aktifkan lokasi presisi lalu coba lagi.',
  'laboratory-unconfigured': 'Koordinat laboratorium belum diatur.',
  'invalid-qr': 'QR sesi tidak valid atau sudah kedaluwarsa.',
};


type CheckInButtonProps = {
  session: Session | undefined;
  userId: string;
  attendanceCode: string;
  roomName: string;
  checkedInAt: string | null;
};

export function CheckInButton({
  session,
  userId,
  attendanceCode,
  roomName,
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
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Izin lokasi ditolak. Izinkan akses lokasi untuk presensi.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const accuracy = position.coords.accuracy;
      if (accuracy === null || accuracy > 50) {
        setError(FAILURE_MESSAGES['location-inaccurate']);
        return;
      }
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy,
      };
      const laboratory = await getLaboratoryForRoom(roomName);
      if (!laboratory) {
        setError(FAILURE_MESSAGES['laboratory-unconfigured']);
        return;
      }
      if (accuracy > laboratory.radius) {
        setError(FAILURE_MESSAGES['location-inaccurate']);
        return;
      }
      if (calculateDistanceMeters(location, laboratory) > laboratory.radius) {
        setError(FAILURE_MESSAGES['outside-radius']);
        return;
      }

      const result = await checkInWithLocation(session.id, userId, location, attendanceCode);

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
