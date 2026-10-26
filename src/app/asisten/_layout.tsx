import { Redirect, Stack } from 'expo-router';

import { useApp } from '@/state/app-context';

export default function AsistenLayout() {
  const { currentUser } = useApp();

  if (!currentUser || currentUser.role !== 'asisten') {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
