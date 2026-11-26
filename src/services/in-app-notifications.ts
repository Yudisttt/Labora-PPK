import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { getFirebaseDb } from '@/services/firebase';

export type InAppNotification = {
  id: string;
  title: string;
  body: string;
  destination: 'praktikan/jadwal' | 'praktikan/izin';
  createdAt: Date | null;
};

export function subscribeToInAppNotifications(
  userId: string,
  onNotifications: (notifications: InAppNotification[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const notificationsQuery = query(
    collection(getFirebaseDb(), 'users', userId, 'notifications'),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      onNotifications(
        snapshot.docs.flatMap((notificationDoc) => {
          const data = notificationDoc.data();
          if (
            typeof data.title !== 'string' ||
            typeof data.body !== 'string' ||
            (data.destination !== 'praktikan/jadwal' && data.destination !== 'praktikan/izin')
          ) {
            return [];
          }

          return [{
            id: notificationDoc.id,
            title: data.title,
            body: data.body,
            destination: data.destination,
            createdAt: data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : null,
          }];
        }),
      );
    },
    (error) => onError(error),
  );
}
