import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useAuth } from '@/state/auth-context';

export default function PraktikanLayout() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <ActivityIndicator />;
  }

  if (!currentUser || currentUser.role !== 'praktikan') {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
