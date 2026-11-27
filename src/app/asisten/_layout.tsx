import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { FloatingNavBar, type TabItem } from '@/components/floating-nav-bar';
import { useAuth } from '@/state/auth-context';

const asistenTabs: TabItem[] = [
  {
    key: 'jadwal',
    label: 'Sesi',
    iconName: 'calendar-outline',
    route: '/asisten/jadwal',
  },
  {
    key: 'riwayat-presensi',
    label: 'Riwayat',
    iconName: 'time-outline',
    route: '/asisten/riwayat-presensi',
    isCenter: true,
  },
  {
    key: 'izin',
    label: 'Izin Mhs',
    iconName: 'checkbox-outline',
    route: '/asisten/izin',
  },
];

export default function AsistenLayout() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#354024" />
      </View>
    );
  }

  if (!currentUser || currentUser.role !== 'asisten') {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false }} />
      <FloatingNavBar tabs={asistenTabs} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E6D8',
  },
});
