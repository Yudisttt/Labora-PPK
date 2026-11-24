const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');

initializeApp();

const db = getFirestore();
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_BATCH_SIZE = 100;

async function getPushTargets(userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const snapshots = await Promise.all(
    uniqueUserIds.map((userId) =>
      db.collection('users').doc(userId).collection('pushTokens').get(),
    ),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.flatMap((tokenDoc) => {
      const token = tokenDoc.data().token;
      return typeof token === 'string' && token.startsWith('ExponentPushToken[')
        ? [{ token, ref: tokenDoc.ref }]
        : [];
    }),
  );
}

async function sendPushNotifications(userIds, notification) {
  const targets = await getPushTargets(userIds);
  for (let offset = 0; offset < targets.length; offset += EXPO_PUSH_BATCH_SIZE) {
    const batch = targets.slice(offset, offset + EXPO_PUSH_BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        batch.map(({ token }) => ({
          to: token,
          sound: 'default',
          channelId: 'default',
          title: notification.title,
          body: notification.body,
          data: notification.data,
        })),
      ),
    });

    if (!response.ok) {
      throw new Error(`Layanan push menolak pengiriman (${response.status}).`);
    }

    const result = await response.json();
    const tickets = Array.isArray(result.data) ? result.data : [];
    await Promise.all(
      tickets.map((ticket, index) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
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
    title: 'Presensi dibuka',
    body: `${schedule.praktikum} · ${schedule.kelas}: presensi sudah dibuka.`,
    data: { type: 'session_open', destination: 'praktikan/jadwal' },
  });
});

async function notifyScheduleChange(scheduleId, schedule) {
  const userIds = await getClassParticipantIds(schedule.classId);
  await sendPushNotifications(userIds, {
    title: 'Perubahan jadwal praktikum',
    body: `${schedule.praktikum} · ${schedule.kelas}: jadwal berubah. Periksa jadwal terbaru.`,
    data: { type: 'schedule_changed', scheduleId, destination: 'praktikan/jadwal' },
  });
}

exports.notifyWhenScheduleCreated = onDocumentCreated('schedules/{scheduleId}', async (event) => {
  const schedule = event.data.data();
  await notifyScheduleChange(event.params.scheduleId, schedule);
});

exports.notifyWhenScheduleChanges = onDocumentUpdated('schedules/{scheduleId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const scheduleFields = [
    'classId', 'praktikum', 'kelas', 'ruang', 'date', 'startTime', 'endTime', 'status',
  ];
  const changed = scheduleFields.some((field) => before[field] !== after[field]);
  if (!changed) return;
  await notifyScheduleChange(event.params.scheduleId, after);
});

exports.notifyWhenPermissionIsDecided = onDocumentUpdated(
  'permissionRequests/{requestId}',
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status !== 'pending' || !['approved', 'rejected'].includes(after.status)) return;

    const approved = after.status === 'approved';
    await sendPushNotifications([after.userId], {
      title: approved ? 'Pengajuan izin diterima' : 'Pengajuan izin ditolak',
      body: approved
        ? 'Pengajuan izin praktikum kamu telah diterima.'
        : 'Pengajuan izin praktikum kamu ditolak. Buka aplikasi untuk melihat statusnya.',
      data: { type: 'permission_decided', destination: 'praktikan/izin' },
    });
  },
);
