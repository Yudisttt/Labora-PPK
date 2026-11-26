import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SessionStatusBadge } from '@/components/session-status-badge';
import { LaboratoryMapView } from '@/components/laboratory-map-view';
import { FSM_UNDIP_LOCATION } from '@/constants/locations';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import { useUserLocation } from '@/hooks/use-user-location';
import {
  subscribeLaboratories,
  saveLaboratory,
  calculateDistanceMeters,
  formatDistance,
  migrateAndSeedLaboratories,
} from '@/services/laboratories';
import { getLaboratoryActivity } from '@/utils/lab-activity';
import type { Laboratory } from '@/types';

export default function AsistenPetaScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { schedules, sessions } = useApp();
  const { userLocation } = useUserLocation();

  // Firestore Laboratories state (SRS-09)
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);

  // Edit / Determine Location & Radius state (SRS-10)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLabId, setEditingLabId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editRadius, setEditRadius] = useState('30');
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activityTime, setActivityTime] = useState(() => Date.now());

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

  // Subscribe to real-time laboratories from Firestore (SRS-09, SRS-15)
  useEffect(() => {
    migrateAndSeedLaboratories().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Gagal memperbarui data laboratorium.';
      Alert.alert('Gagal Memuat Laboratorium', message);
    });

    const unsubscribe = subscribeLaboratories(
      (labs) => {
        setLaboratories(labs);
        setSelectedLabId((currentId) =>
          currentId && labs.some((lab) => lab.id === currentId)
            ? currentId
            : labs[0]?.id ?? null,
        );
      },
      (error) => Alert.alert('Gagal Memuat Laboratorium', error.message),
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setActivityTime(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const selectedLab = useMemo(() => {
    return laboratories.find((l) => l.id === selectedLabId) || laboratories[0] || null;
  }, [laboratories, selectedLabId]);

  // Real-time Practicum Activity for the selected lab (SRS-14, SRS-15)
  const labActivity = useMemo(() => {
    if (!selectedLab) return null;
    return getLaboratoryActivity(selectedLab.name, schedules, sessions, new Date(activityTime));
  }, [selectedLab, schedules, sessions, activityTime]);

  // Distance from device location to selected laboratory
  const distanceFromUser = useMemo(() => {
    if (!userLocation || !selectedLab) return null;
    return calculateDistanceMeters(
      userLocation.latitude,
      userLocation.longitude,
      selectedLab.latitude,
      selectedLab.longitude,
    );
  }, [userLocation, selectedLab]);

  const isUserWithinRadius = useMemo(() => {
    if (distanceFromUser === null || !selectedLab) return false;
    return distanceFromUser <= selectedLab.radius;
  }, [distanceFromUser, selectedLab]);

  // Open Edit Modal for existing lab or new lab (SRS-10)
  function handleOpenEdit(lab?: Laboratory) {
    if (lab) {
      setEditingLabId(lab.id);
      setEditName(lab.name);
      setEditDescription(lab.description || '');
      setEditLat(String(lab.latitude));
      setEditLng(String(lab.longitude));
      setEditRadius(String(lab.radius));
    } else {
      setEditingLabId(null);
      setEditName('');
      setEditDescription('');
      setEditLat(userLocation ? String(userLocation.latitude) : String(FSM_UNDIP_LOCATION.latitude));
      setEditLng(userLocation ? String(userLocation.longitude) : String(FSM_UNDIP_LOCATION.longitude));
      setEditRadius('30');
    }
    setIsEditModalOpen(true);
  }

  // Set coordinates from current device location (SRS-10)
  function handleUseCurrentLocation() {
    if (userLocation) {
      setEditLat(String(userLocation.latitude));
      setEditLng(String(userLocation.longitude));
      showToast('Koordinat diisi dengan lokasi GPS perangkat saat ini');
    } else {
      Alert.alert('Lokasi Belum Tersedia', 'Pastikan izin GPS perangkat telah diaktifkan.');
    }
  }

  // Handle Map Click to pick coordinates (SRS-10)
  function handleMapClick(coords: { latitude: number; longitude: number }) {
    if (isEditModalOpen) {
      setEditLat(coords.latitude.toFixed(6));
      setEditLng(coords.longitude.toFixed(6));
      showToast(`Titik koordinat dipilih: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
    } else {
      // Find nearest lab to click, or keep current
      const clickedLab = laboratories.find((lab) => {
        const d = calculateDistanceMeters(coords.latitude, coords.longitude, lab.latitude, lab.longitude);
        return d <= Math.max(lab.radius, 40);
      });
      if (clickedLab) {
        setSelectedLabId(clickedLab.id);
      }
    }
  }

  // Save Laboratory to Firestore (SRS-09, SRS-10)
  async function handleSaveLaboratory() {
    const name = editName.trim();
    const lat = parseFloat(editLat);
    const lng = parseFloat(editLng);
    const rad = parseFloat(editRadius);

    if (!name) {
      Alert.alert('Validasi Gagal', 'Nama laboratorium tidak boleh kosong.');
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      Alert.alert('Validasi Gagal', 'Koordinat lintang dan bujur harus berupa angka valid.');
      return;
    }
    if (!Number.isFinite(rad) || rad <= 0) {
      Alert.alert('Validasi Gagal', 'Radius presensi harus lebih dari 0 meter.');
      return;
    }

    try {
      setIsSaving(true);
      const savedId = await saveLaboratory(
        {
          name,
          latitude: lat,
          longitude: lng,
          radius: rad,
          description: editDescription.trim(),
        },
        editingLabId || undefined,
      );

      setIsEditModalOpen(false);
      setSelectedLabId(savedId);
      showToast(`Lokasi & radius ${name} berhasil disimpan ke Firestore!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan ke Firestore';
      Alert.alert('Gagal Menyimpan', msg);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Floating Header */}
        <View style={styles.headerBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/asisten/jadwal')}
            style={({ pressed }) => [styles.roundIconBtn, pressed && styles.pressed]}>
            <Ionicons name="arrow-back" size={20} color="#354024" />
          </Pressable>

          <View style={styles.headerTitleGroup}>
            <ThemedText type="smallBold" style={styles.headerTitle}>
              Peta Laboratorium
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.headerSub}>
              {laboratories.length} Laboratorium Terdaftar
            </ThemedText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Atur Lokasi"
            onPress={() => handleOpenEdit()}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <ThemedText type="smallBold" style={{ color: '#FFFFFF', fontSize: 12 }}>
              Tambah Lab
            </ThemedText>
          </Pressable>
        </View>

        {/* Feedback Toast */}
        {toastMessage ? (
          <View style={styles.toastContainer}>
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <ThemedText type="smallBold" style={styles.toastText}>
              {toastMessage}
            </ThemedText>
          </View>
        ) : null}

        {/* Live Map View (SRS-11, SRS-12, SRS-13) */}
        <View style={styles.mapContainer}>
          <LaboratoryMapView
            laboratories={laboratories}
            userLocation={userLocation}
            selectedLabId={selectedLabId}
            onSelectLab={(id) => setSelectedLabId(id)}
            onMapClick={handleMapClick}
            editLocation={
              isEditModalOpen && !isNaN(parseFloat(editLat)) && !isNaN(parseFloat(editLng))
                ? { latitude: parseFloat(editLat), longitude: parseFloat(editLng) }
                : null
            }
            editRadius={isEditModalOpen && !isNaN(parseFloat(editRadius)) ? parseFloat(editRadius) : undefined}
            isAssistantMode={true}
          />
        </View>

        {/* Bottom Horizontal Lab Selector & Detail Info Card (SRS-13, SRS-14, SRS-15) */}
        <View style={[styles.bottomDrawer, { paddingBottom: Math.max(insets.bottom, 16) + 70 }]}>
          {/* Horizontal Chips to switch selected laboratory */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.labChipsScroll}>
            {laboratories.map((lab) => {
              const isSelected = lab.id === selectedLabId;
              return (
                <Pressable
                  key={lab.id}
                  accessibilityRole="button"
                  onPress={() => setSelectedLabId(lab.id)}
                  style={[
                    styles.labChip,
                    isSelected && { backgroundColor: theme.primary, borderColor: theme.glassBorderHighlight },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: isSelected ? theme.primaryText : theme.text, fontSize: 12 }}>
                    🏛️ {lab.name}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Selected Laboratory Detail Card (SRS-13, SRS-14) */}
          {selectedLab ? (
            <View style={styles.labDetailCard}>
              {/* Header row */}
              <View style={styles.labDetailHeader}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ThemedText type="subtitle" style={styles.labNameText}>
                      {selectedLab.name}
                    </ThemedText>
                    {isUserWithinRadius ? (
                      <View style={styles.withinRadiusBadge}>
                        <ThemedText type="smallBold" style={styles.withinRadiusText}>
                          Dalam Radius
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {selectedLab.description || 'Gedung Laboratorium Praktikum'} · Radius {selectedLab.radius}m
                  </ThemedText>
                  {distanceFromUser !== null ? (
                    <ThemedText type="small" style={{ color: theme.moss, fontWeight: '600' }}>
                      📍 Jarak dari lokasimu: {formatDistance(distanceFromUser)}
                    </ThemedText>
                  ) : null}
                </View>

                {/* Assistant Edit Button (SRS-10) */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Ubah Lokasi & Radius"
                  onPress={() => handleOpenEdit(selectedLab)}
                  style={({ pressed }) => [styles.editLabBtn, pressed && styles.pressed]}>
                  <Ionicons name="create-outline" size={16} color="#354024" />
                  <ThemedText type="smallBold" style={{ color: '#354024', fontSize: 12 }}>
                    Ubah
                  </ThemedText>
                </Pressable>
              </View>

              {/* Practicum Activity Section (SRS-14, SRS-15) */}
              <View style={styles.activitySection}>
                {/* 1. Praktikum Sedang Berlangsung */}
                <View style={styles.activityBox}>
                  <View style={styles.activityBoxHeader}>
                    <ThemedText type="smallBold" style={styles.activityTitle}>
                      Praktikum Sedang Berlangsung:
                    </ThemedText>
                    {labActivity?.ongoing ? (
                      <SessionStatusBadge status={labActivity.ongoing.sessionStatus} />
                    ) : null}
                  </View>
                  {labActivity?.ongoing ? (
                    <View style={styles.activityContent}>
                      <ThemedText type="smallBold" style={{ fontSize: 14 }}>
                        {labActivity.ongoing.praktikum}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Kelas {labActivity.ongoing.kelas} · {labActivity.ongoing.timeRange}
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText type="small" style={styles.emptyNotice}>
                      Tidak ada praktikum yang sedang berlangsung saat ini.
                    </ThemedText>
                  )}
                </View>

                {/* 2. Praktikum Berikutnya */}
                <View style={styles.activityBox}>
                  <View style={styles.activityBoxHeader}>
                    <ThemedText type="smallBold" style={styles.activityTitle}>
                      Praktikum Berikutnya:
                    </ThemedText>
                    {labActivity?.upcoming ? (
                      <SessionStatusBadge status={labActivity.upcoming.sessionStatus} />
                    ) : null}
                  </View>
                  {labActivity?.upcoming ? (
                    <View style={styles.activityContent}>
                      <ThemedText type="smallBold" style={{ fontSize: 14 }}>
                        {labActivity.upcoming.praktikum}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Kelas {labActivity.upcoming.kelas} · {labActivity.upcoming.timeRange}
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText type="small" style={styles.emptyNotice}>
                      Tidak ada praktikum berikutnya yang dijadwalkan.
                    </ThemedText>
                  )}
                </View>
              </View>
            </View>
          ) : null}
        </View>

        {/* Modal Tentukan Lokasi dan Radius Laboratorium (SRS-10) */}
        <Modal
          visible={isEditModalOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setIsEditModalOpen(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <ThemedText type="subtitle" style={{ fontSize: 18 }}>
                  {editingLabId ? 'Ubah Lokasi & Radius Lab' : 'Tambah Laboratorium Baru'}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsEditModalOpen(false)}
                  style={styles.modalCloseBtn}>
                  <Ionicons name="close" size={20} color="#354024" />
                </Pressable>
              </View>

              <ScrollView
                style={{ maxHeight: 420 }}
                contentContainerStyle={{ gap: Spacing.three }}
                keyboardShouldPersistTaps="handled">
                {/* Nama Lab */}
                <View style={styles.formGroup}>
                  <ThemedText type="smallBold">Nama Laboratorium</ThemedText>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Contoh: Lab Komputer A"
                    style={styles.formInput}
                  />
                </View>

                {/* Keterangan Gedung / Lokasi */}
                <View style={styles.formGroup}>
                  <ThemedText type="smallBold">Keterangan / Lokasi Gedung</ThemedText>
                  <TextInput
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Contoh: Gedung E FSM UNDIP"
                    style={styles.formInput}
                  />
                </View>

                {/* Koordinat Lintang & Bujur */}
                <View style={styles.formGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <ThemedText type="smallBold">Koordinat Titik Lokasi</ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleUseCurrentLocation}
                      style={styles.useGpsButton}>
                      <Ionicons name="locate" size={14} color="#354024" />
                      <ThemedText type="smallBold" style={{ fontSize: 11, color: '#354024' }}>
                        Gunakan GPS Saya
                      </ThemedText>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', gap: Spacing.two }}>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, marginBottom: 2 }}>
                        Latitude (Lintang)
                      </ThemedText>
                      <TextInput
                        value={editLat}
                        onChangeText={setEditLat}
                        placeholder="-7.0486749"
                        keyboardType="numeric"
                        style={styles.formInput}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11, marginBottom: 2 }}>
                        Longitude (Bujur)
                      </ThemedText>
                      <TextInput
                        value={editLng}
                        onChangeText={setEditLng}
                        placeholder="110.4410376"
                        keyboardType="numeric"
                        style={styles.formInput}
                      />
                    </View>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                    💡 Tip: Kamu juga dapat mengklik langsung area peta di latar belakang untuk menempatkan titik koordinat.
                  </ThemedText>
                </View>

                {/* Radius Presensi (meter) */}
                <View style={styles.formGroup}>
                  <ThemedText type="smallBold">Radius Presensi (Meter)</ThemedText>
                  <TextInput
                    value={editRadius}
                    onChangeText={setEditRadius}
                    placeholder="50"
                    keyboardType="numeric"
                    style={styles.formInput}
                  />

                  {/* Preset Quick Chips */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    {['25', '50', '75', '100'].map((val) => (
                      <Pressable
                        key={`preset-${val}`}
                        accessibilityRole="button"
                        onPress={() => setEditRadius(val)}
                        style={[
                          styles.presetChip,
                          editRadius === val && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={{
                            fontSize: 11,
                            color: editRadius === val ? '#FFFFFF' : '#354024',
                          }}>
                          {val}m
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 11 }}>
                    Praktikan hanya dapat melakukan presensi jika berada di dalam radius ini.
                  </ThemedText>
                </View>
              </ScrollView>

              {/* Submit Buttons */}
              <View style={styles.modalActionRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsEditModalOpen(false)}
                  style={styles.modalCancelBtn}>
                  <ThemedText type="smallBold" style={{ color: '#555' }}>
                    Batal
                  </ThemedText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={isSaving}
                  onPress={handleSaveLaboratory}
                  style={[styles.modalSaveBtn, isSaving && { opacity: 0.6 }]}>
                  <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
                    {isSaving ? 'Menyimpan...' : 'Simpan ke Firestore'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#E5D7C4',
  },
  safeArea: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(253, 251, 247, 0.92)',
    borderBottomWidth: 1,
    borderColor: 'rgba(136, 144, 99, 0.25)',
    zIndex: 10,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as any)
      : {}),
  },
  roundIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EDDFCD',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(136, 144, 99, 0.3)',
  },
  headerTitleGroup: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    color: '#262D1B',
  },
  headerSub: {
    fontSize: 11,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#354024',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  toastContainer: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: '#354024',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 12,
    flex: 1,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  bottomDrawer: {
    backgroundColor: 'rgba(253, 251, 247, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderColor: '#C5A880',
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: '#3A2E12',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as any)
      : {}),
  },
  labChipsScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  labChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#EDDFCD',
    borderWidth: 1,
    borderColor: 'rgba(136, 144, 99, 0.3)',
  },
  labDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(136, 144, 99, 0.25)',
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  labDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  labNameText: {
    fontSize: 18,
    color: '#262D1B',
  },
  withinRadiusBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#81C784',
  },
  withinRadiusText: {
    fontSize: 10,
    color: '#2E7D32',
  },
  editLabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#EDDFCD',
    borderWidth: 1,
    borderColor: 'rgba(136, 144, 99, 0.3)',
  },
  activitySection: {
    gap: 8,
  },
  activityBox: {
    backgroundColor: '#FAF7F2',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#EFE7DA',
    gap: 4,
  },
  activityBoxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityTitle: {
    fontSize: 12,
    color: '#655B49',
  },
  activityContent: {
    marginTop: 2,
  },
  emptyNotice: {
    fontSize: 12,
    color: '#8A7E6C',
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FDFBF7',
    borderRadius: 24,
    padding: 20,
    gap: 14,
    borderWidth: 1.5,
    borderColor: '#C5A880',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#EFE7DA',
    paddingBottom: 10,
  },
  modalCloseBtn: {
    padding: 4,
  },
  formGroup: {
    gap: 6,
  },
  formInput: {
    backgroundColor: '#F4ECE1',
    borderWidth: 1,
    borderColor: '#D8C7B0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#262D1B',
  },
  useGpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E5D7C4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C5A880',
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F4ECE1',
    borderWidth: 1,
    borderColor: '#D8C7B0',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#EFE7DA',
  },
  modalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#354024',
    shadowColor: '#354024',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
