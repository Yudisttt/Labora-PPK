import { useEffect } from 'react';
import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';
import {
  getInitialNotification,
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
} from '@react-native-firebase/messaging';
import notifee, { EventType } from 'react-native-notify-kit';

import { registerPushToken } from '@/services/push-notifications';
import { useAuth } from '@/state/auth-context';

function openNotificationDestination(data?: { destination?: unknown }) {
  const destination = data?.destination;
  if (destination === 'praktikan/jadwal') {
    router.push('/praktikan/jadwal');
  } else if (destination === 'praktikan/izin') {
    router.push('/praktikan/izin');
  }
}

export function PushNotificationManager() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser || Platform.OS === 'web') return;

    let active = true;
    const messaging = getMessaging();
    const foregroundSubscription = onMessage(messaging, async (remoteMessage) => {
      if (!remoteMessage.notification) return;
      try {
        await notifee.displayNotification({
          title: remoteMessage.notification.title ?? 'Labora',
          body: remoteMessage.notification.body ?? '',
          data: remoteMessage.data,
          android: {
            channelId: 'default',
            pressAction: { id: 'default' },
          },
        });
      } catch (error) {
        console.warn('Notifikasi foreground gagal ditampilkan:', error);
      }
    });
    const openedSubscription = onNotificationOpenedApp(messaging, (remoteMessage) => {
      openNotificationDestination(remoteMessage.data);
    });
    const localPressSubscription = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        openNotificationDestination(detail.notification?.data as { destination?: unknown } | undefined);
      }
    });

    void getInitialNotification(messaging)
      .then((remoteMessage) => {
        if (active && remoteMessage) openNotificationDestination(remoteMessage.data);
      })
      .catch((error: unknown) => console.warn('Pemeriksaan notifikasi terakhir gagal:', error));

    void registerPushToken(currentUser.id)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        if (message.startsWith('Izin notifikasi')) {
          Alert.alert(
            'Notifikasi belum diizinkan',
            'Aktifkan notifikasi Labora melalui Pengaturan perangkat agar kabar muncul langsung. Kamu tetap dapat melihat pemberitahuan di menu Pemberitahuan dalam aplikasi.',
          );
          return;
        }
        console.warn('Pendaftaran notifikasi gagal:', error);
        Alert.alert(
          'Push notification tidak tersedia',
          'Pemberitahuan sesi, jadwal, dan izin tetap tersimpan di menu Pemberitahuan dalam aplikasi.',
        );
      });

    return () => {
      active = false;
      foregroundSubscription();
      openedSubscription();
      localPressSubscription();
    };
  }, [currentUser]);

  return null;
}
