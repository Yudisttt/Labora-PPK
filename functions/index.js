const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');

initializeApp();

const db = getFirestore();
const FCM_BATCH_SIZE = 500;

async function getPushTargets(userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const snapshots = await Promise.all(
    uniqueUserIds.map((userId) =>
      db.collection('users').doc(userId).collection('pushTokens').get(),
    ),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.flatMap((tokenDoc) => {
      const tokenData = tokenDoc.data();
      const token = tokenData.token;
      return tokenData.provider === 'fcm' && typeof token === 'string'
        ? [{ token, ref: tokenDoc.ref }]
        : [];
    }),
  );
}

async function saveInAppNotifications(userIds, notification) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const eventKey = encodeURIComponent(notification.eventId);
  await Promise.all(
    uniqueUserIds.map((userId) =>
      db.collection('users').doc(userId).collection('notifications').doc(eventKey).set({
        title: notification.title,
        body: notification.body,
        type: notification.data.type,
        destination: notification.data.destination,
        createdAt: new Date(),
      }, { merge: true }),
    ),
  );
}

async function sendPushNotifications(userIds, notification) {
  await saveInAppNotifications(userIds, notification);
  const targets = await getPushTargets(userIds);
  for (let offset = 0; offset < targets.length; offset += FCM_BATCH_SIZE) {
    const batch = targets.slice(offset, offset + FCM_BATCH_SIZE);
    const result = await getMessaging().sendEachForMulticast({
      tokens: batch.map(({ token }) => token),
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data,
      android: {
        priority: 'high',
        notification: { channelId: 'default' },
      },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    await Promise.all(
      result.responses.map((response, index) => {
        const code = response.error?.code;
        if (code === 'messaging/registration-token-not-registered'
          || code === 'messaging/invalid-registration-token') {
          return batch[index].ref.delete();
        }
        return Promise.resolve();
      }),
    );
  }
}

async function getClassParticipantIds(classId) {
  if (typeof classId !== 'string' || !classId) return [];
  const participants = await db
    .collection('participants')
    .where('classId', '==', classId)
    .get();
  return participants.docs
    .map((participant) => participant.data().userId)
    .filter((userId) => typeof userId === 'string');
}

exports.notifyWhenSessionOpens = onDocumentUpdated('sessions/{sessionId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === 'open' || after.status !== 'open') return;

  const scheduleSnapshot = await db.collection('schedules').doc(after.scheduleId).get();
  if (!scheduleSnapshot.exists) return;
  const schedule = scheduleSnapshot.data();
  const userIds = await getClassParticipantIds(schedule.classId);

  await sendPushNotifications(userIds, {
    eventId: event.id,
    title: 'Presensi dibuka',
    body: `${schedule.praktikum} · ${schedule.kelas}: presensi sudah dibuka.`,
    data: { type: 'session_open', destination: 'praktikan/jadwal' },
  });
});

async function notifyScheduleChange(scheduleId, schedule, eventId) {
  const userIds = await getClassParticipantIds(schedule.classId);
  await sendPushNotifications(userIds, {
    eventId,
    title: 'Perubahan jadwal praktikum',
    body: `${schedule.praktikum} · ${schedule.kelas}: jadwal berubah. Periksa jadwal terbaru.`,
    data: { type: 'schedule_changed', scheduleId, destination: 'praktikan/jadwal' },
  });
}

exports.notifyWhenScheduleCreated = onDocumentCreated('schedules/{scheduleId}', async (event) => {
  const schedule = event.data.data();
  await notifyScheduleChange(event.params.scheduleId, schedule, event.id);
});

exports.notifyWhenScheduleChanges = onDocumentUpdated('schedules/{scheduleId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const scheduleFields = [
    'classId', 'praktikum', 'kelas', 'ruang', 'date', 'startTime', 'endTime', 'status',
  ];
  const changed = scheduleFields.some((field) => before[field] !== after[field]);
  if (!changed) return;
  await notifyScheduleChange(event.params.scheduleId, after, event.id);
});

exports.notifyWhenPermissionIsDecided = onDocumentUpdated(
  'permissionRequests/{requestId}',
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status !== 'pending' || !['approved', 'rejected'].includes(after.status)) return;

    const approved = after.status === 'approved';
    await sendPushNotifications([after.userId], {
      eventId: event.id,
      title: approved ? 'Pengajuan izin diterima' : 'Pengajuan izin ditolak',
      body: approved
        ? 'Pengajuan izin praktikum kamu telah diterima.'
        : 'Pengajuan izin praktikum kamu ditolak. Buka aplikasi untuk melihat statusnya.',
      data: { type: 'permission_decided', destination: 'praktikan/izin' },
    });
  },
);
