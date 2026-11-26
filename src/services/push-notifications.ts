import { Platform } from 'react-native';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type DocumentData,
} from 'firebase/firestore';
import { getMessaging, getToken, onTokenRefresh } from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AuthorizationStatus } from 'react-native-notify-kit';

import { getFirebaseDb } from '@/services/firebase';

export async function registerPushToken(userId: string) {
  if (Platform.OS === 'web') return null;

  const permission = await notifee.requestPermission();
  if (permission.authorizationStatus < AuthorizationStatus.AUTHORIZED) {
    throw new Error('Izin notifikasi belum diberikan. Aktifkan melalui pengaturan perangkat.');
  }

  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: 'default',
      name: 'Notifikasi Labora',
      importance: AndroidImportance.DEFAULT,
    });
  }

  const messagingInstance = getMessaging();
  const token = await getToken(messagingInstance);
  const tokenRef = await savePushToken(userId, token, Platform.OS);
  registeredPushTokenRef = tokenRef;

  const unsubscribe = onTokenRefresh(messagingInstance, (refreshedToken) => {
    void savePushToken(userId, refreshedToken, Platform.OS)
      .then((refreshedRef) => {
        registeredPushTokenRef = refreshedRef;
      })
      .catch((error: unknown) => {
        console.warn('Pembaruan token FCM gagal:', error);
      });
  });
  tokenRefreshUnsubscribe?.();
  tokenRefreshUnsubscribe = unsubscribe;

  return { token, tokenRef };
}

export async function savePushToken(
  userId: string,
  token: string,
  platform: string,
) {
  const tokenId = encodeURIComponent(token);
  const tokenRef = doc(
    collection(getFirebaseDb(), 'users', userId, 'pushTokens'),
    tokenId,
  );
  await setDoc(tokenRef, {
    token,
    platform,
    provider: 'fcm',
    updatedAt: serverTimestamp(),
  });
  return tokenRef;
}

let registeredPushTokenRef: DocumentReference<DocumentData> | null = null;
let tokenRefreshUnsubscribe: (() => void) | null = null;

export async function unregisterRegisteredPushToken() {
  const tokenRef = registeredPushTokenRef;
  if (!tokenRef) return;

  await deleteDoc(tokenRef);
  tokenRefreshUnsubscribe?.();
  tokenRefreshUnsubscribe = null;
  if (registeredPushTokenRef === tokenRef) {
    registeredPushTokenRef = null;
  }
}
