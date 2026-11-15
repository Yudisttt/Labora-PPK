import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const app =
  getApps().length > 0
    ? getApp()
    : initializeApp({
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
      });

export const db = getFirestore(app);
