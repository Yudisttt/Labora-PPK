import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import { getLaboratoryLocation, getScheduleLaboratoryId, saveLaboratoryLocation } from '@/services/sessions';
import type { LaboratoryLocation } from '@/types';

type LabRow = { id: string; name: string; courseNames: string[] };

export default function PetaScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { schedules } = useApp();
  const [locations, setLocations] = useState<Record<string, LaboratoryLocation | null>>({});
  const [radii, setRadii] = useState<Record<string, string>>({});
  const [busyLabId, setBusyLabId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labs = useMemo(() => {
    const grouped = new Map<string, LabRow>();
    schedules.forEach((schedule) => {
      const id = getScheduleLaboratoryId(schedule);
      if (!id) return;
      const row = grouped.get(id);
      if (row) {
        if (!row.courseNames.includes(schedule.praktikum)) row.courseNames.push(schedule.praktikum);
      } else {
        grouped.set(id, { id, name: schedule.ruang, courseNames: [schedule.praktikum] });
      }
    });
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [schedules]);

  useEffect(() => {
    let active = true;
    Promise.all(labs.map(async (lab) => [lab.id, await getLaboratoryLocation(lab.id)] as const))
      .then((entries) => {
        if (!active) return;
        setLocations(Object.fromEntries(entries));
        setRadii(Object.fromEntries(entries.map(([id, location]) => [id, String(location?.radius ?? 50)])));
      })
      .catch(() => {
        if (active) setError('Konfigurasi lokasi laboratorium gagal dimuat. Periksa koneksi lalu coba lagi.');
      });
    return () => { active = false; };
  }, [labs]);

  async function captureLabLocation(lab: LabRow) {
    const radius = Number(radii[lab.id]);
    if (!Number.isFinite(radius) || radius < 1 || radius > 5000) {
      setError('Radius harus antara 1 sampai 5.000 meter.');
      setMessage(null);
      return;
    }

    setBusyLabId(lab.id);
    setError(null);
    setMessage(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Izin lokasi ditolak. Izinkan akses lokasi untuk menyimpan titik laboratorium.');
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (position.coords.accuracy === null || position.coords.accuracy > 50) {
        throw new Error('Lokasi perangkat kurang akurat untuk menetapkan titik lab. Coba lagi di area terbuka.');
      }
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      await saveLaboratoryLocation(lab.id, lab.name, coordinates, radius);
      setLocations((current) => ({ ...current, [lab.id]: { id: lab.id, name: lab.name, ...coordinates, radius } }));
      setMessage(`Lokasi ${lab.name} tersimpan dengan radius ${radius} m.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Lokasi laboratorium gagal disimpan.');
    } finally {
      setBusyLabId(null);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
          <View style={styles.heading}>
            <ThemedText type="title">Lokasi Laboratorium</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Atur titik lokasi dan radius presensi untuk setiap laboratorium. Simpan titik saat berada di area lab.
            </ThemedText>
          </View>

          {error ? <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText> : null}
          {message ? <ThemedText type="small" style={{ color: theme.success }}>{message}</ThemedText> : null}

          {labs.length === 0 ? (
            <BlurView intensity={45} tint="light" style={[styles.card, styles.glass, { borderColor: theme.glassBorder }]}>
              <ThemedText type="smallBold">Belum ada laboratorium terjadwal</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Buat jadwal terlebih dahulu agar lokasi lab dapat dikonfigurasi.</ThemedText>
            </BlurView>
          ) : labs.map((lab) => {
            const location = locations[lab.id];
            const isBusy = busyLabId === lab.id;
            return (
              <BlurView key={lab.id} intensity={45} tint="light" style={[styles.card, styles.glass, { borderColor: theme.glassBorder }]}>
                <ThemedText type="subtitle">{lab.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{lab.courseNames.join(' · ')}</ThemedText>
                {location ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Tersimpan · {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)} · radius {location.radius} m
                  </ThemedText>
                ) : (
                  <ThemedText type="small" style={{ color: theme.warning }}>Lokasi belum dikonfigurasi</ThemedText>
                )}
                <View style={styles.radiusRow}>
                  <ThemedText type="smallBold">Radius presensi</ThemedText>
                  <TextInput
                    accessibilityLabel={`Radius presensi ${lab.name} dalam meter`}
                    keyboardType="number-pad"
                    value={radii[lab.id] ?? '50'}
                    onChangeText={(value) => setRadii((current) => ({ ...current, [lab.id]: value.replace(/[^0-9]/g, '') }))}
                    style={[styles.radiusInput, { color: theme.text, borderColor: theme.glassBorder, backgroundColor: 'rgba(255,255,255,0.55)' }]}
                  />
                  <ThemedText type="small" themeColor="textSecondary">meter</ThemedText>
                </View>
                <ActionButton
                  label={isBusy ? 'Mengambil lokasi…' : location ? 'Perbarui titik dari lokasi saya' : 'Atur titik dari lokasi saya'}
                  loading={isBusy}
                  disabled={busyLabId !== null}
                  onPress={() => void captureLabLocation(lab)}
                />
                {isBusy ? <ActivityIndicator color={theme.primary} /> : null}
              </BlurView>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/asisten/jadwal')}
            style={({ pressed }) => [styles.backButton, { borderColor: theme.glassBorder, backgroundColor: theme.glassCard }, pressed && styles.pressed]}
          >
            <ThemedText type="smallBold" style={{ color: theme.primary }}>← Kembali</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.three, gap: Spacing.three },
  heading: { gap: Spacing.one },
  card: { padding: Spacing.three, gap: Spacing.two, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  glass: { backgroundColor: 'rgba(255,255,255,0.3)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object : {}) },
  radiusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  radiusInput: { minWidth: 84, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 10, borderWidth: 1, textAlign: 'center' },
  backButton: { alignSelf: 'center', minWidth: 136, alignItems: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.two, borderRadius: 999, borderWidth: 1 },
  pressed: { opacity: 0.75 },
});
