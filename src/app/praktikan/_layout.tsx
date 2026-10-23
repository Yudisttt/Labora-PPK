import { Redirect, Stack } from 'expo-router';

import { useApp } from '@/state/app-context';

export default function PraktikanLayout() {
  const { currentUser } = useApp();

  if (!currentUser || currentUser.role !== 'praktikan') {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
