import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { useAuth } from '@/state/auth-context';

export default function AsistenLayout() {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <ActivityIndicator />;
  }

  if (!currentUser || currentUser.role !== 'asisten') {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
