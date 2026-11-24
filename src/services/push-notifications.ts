import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type DocumentData,
} from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import { getFirebaseDb } from '@/services/firebase';

export async function registerPushToken(userId: string) {
  if (Platform.OS === 'web') return null;

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) {
    throw new Error('Izin notifikasi belum diberikan. Aktifkan melalui pengaturan perangkat.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifikasi Labora',
      importance: AndroidImportance.DEFAULT,
    });
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('Project ID Expo belum tersedia untuk pendaftaran notifikasi.');
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const tokenRef = await savePushToken(userId, token, Platform.OS);
  registeredPushTokenRef = tokenRef;

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
    updatedAt: serverTimestamp(),
  });
  return tokenRef;
}

let registeredPushTokenRef: DocumentReference<DocumentData> | null = null;

export async function unregisterRegisteredPushToken() {
  const tokenRef = registeredPushTokenRef;
  if (!tokenRef) return;

  await deleteDoc(tokenRef);
  if (registeredPushTokenRef === tokenRef) {
    registeredPushTokenRef = null;
  }
}
