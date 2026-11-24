import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';

import { registerPushToken } from '@/services/push-notifications';
import { useAuth } from '@/state/auth-context';

function openNotificationDestination(response: Notifications.NotificationResponse) {
  const destination = response.notification.request.content.data?.destination;
  if (destination === 'praktikan/jadwal') {
    router.push('/praktikan/jadwal');
  } else if (destination === 'praktikan/izin') {
    router.push('/praktikan/izin');
  }
}

export function PushNotificationManager() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    let active = true;
    let handledResponseId: string | null = null;

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      if (handledResponseId === responseId) return;
      handledResponseId = responseId;
      openNotificationDestination(response);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response) handleResponse(response);
      })
      .catch((error: unknown) => {
        console.warn(
          'Pemeriksaan notifikasi terakhir gagal:',
          error instanceof Error ? error.message : error,
        );
      });

    void registerPushToken(currentUser.id)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        if (message.startsWith('Izin notifikasi')) {
          Alert.alert(
            'Notifikasi belum diizinkan',
            'Aktifkan notifikasi Labora melalui Pengaturan perangkat agar kamu menerima kabar sesi, jadwal, dan pengajuan izin.',
          );
          return;
        }
        console.warn(
          'Pendaftaran notifikasi gagal:',
          error instanceof Error ? error.message : error,
        );
      });

    return () => {
      active = false;
      responseSubscription.remove();
    };
  }, [currentUser]);

  return null;
}
