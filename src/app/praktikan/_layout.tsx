import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { FloatingNavBar, type TabItem } from '@/components/floating-nav-bar';
import { useAuth } from '@/state/auth-context';

const praktikanTabs: TabItem[] = [
  {
    key: 'jadwal',
    label: 'Jadwal',
    iconName: 'calendar-outline',
    route: '/praktikan/jadwal',
  },
  {
    key: 'presensi',
    label: 'Scan QR Presensi',
    iconName: 'qr-code-outline',
    route: '/praktikan/presensi',
    isCenter: true,
  },
  {
    key: 'izin',
    label: 'Izin',
    iconName: 'document-text',
    route: '/praktikan/izin',
  },
];

export default function PraktikanLayout() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#354024" />
      </View>
    );
  }

  if (!currentUser || currentUser.role !== 'praktikan') {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false }} />
      <FloatingNavBar tabs={praktikanTabs} />
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
    backgroundColor: '#E5D7C4',
  },
});
