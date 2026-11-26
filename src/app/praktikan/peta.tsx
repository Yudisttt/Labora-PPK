import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SessionStatusBadge } from '@/components/session-status-badge';
import { LaboratoryMapView } from '@/components/laboratory-map-view';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/state/app-context';
import { useUserLocation } from '@/hooks/use-user-location';
import {
  subscribeLaboratories,
  calculateDistanceMeters,
  formatDistance,
} from '@/services/laboratories';
import { getLaboratoryActivity } from '@/utils/lab-activity';
import type { Laboratory } from '@/types';

export default function PraktikanPetaScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { schedules, sessions } = useApp();
  const { userLocation } = useUserLocation();

  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [activityTime, setActivityTime] = useState(() => Date.now());

  // Subscribe to real-time laboratories from Firestore (SRS-09, SRS-15)
  useEffect(() => {
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

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/praktikan/jadwal')}
            style={({ pressed }) => [styles.roundIconBtn, pressed && styles.pressed]}>
            <Ionicons name="arrow-back" size={20} color="#354024" />
          </Pressable>

          <View style={styles.headerTitleGroup}>
            <ThemedText type="smallBold" style={styles.headerTitle}>
              Peta Laboratorium
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.headerSub}>
              Cek lokasi lab & jadwal praktikum
            </ThemedText>
          </View>
        </View>

        {/* Live Interactive Map View (SRS-11, SRS-12, SRS-13) */}
        <View style={styles.mapContainer}>
          <LaboratoryMapView
            laboratories={laboratories}
            userLocation={userLocation}
            selectedLabId={selectedLabId}
            onSelectLab={(id) => setSelectedLabId(id)}
            onMapClick={(coords) => {
              const clickedLab = laboratories.find((lab) => {
                const d = calculateDistanceMeters(coords.latitude, coords.longitude, lab.latitude, lab.longitude);
                return d <= Math.max(lab.radius, 40);
              });
              if (clickedLab) {
                setSelectedLabId(clickedLab.id);
              }
            }}
            isAssistantMode={false}
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
                          Dalam Radius Presensi
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
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    color: '#262D1B',
  },
  headerSub: {
    fontSize: 11,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
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
});
