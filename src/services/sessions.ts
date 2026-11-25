import {
  Timestamp,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  getDoc,
  updateDoc,
  where,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { getFirebaseDb } from '@/services/firebase';
import { getPracticumWindowState } from '@/utils/practicum-window';

import type {
  AttendanceRecord,
  CheckInLocation,
  Coordinates,
  CheckInResult,
  LaboratoryLocation,
  Session,
  SessionStatus,
} from '@/types';
import { calculateDistanceMeters } from '@/utils/geo';

type SessionDocument = {
  scheduleId?: unknown;
  status?: unknown;
  openedAt?: unknown;
  closedAt?: unknown;
};

export async function getLaboratoryLocation(
  laboratoryId: string,
): Promise<LaboratoryLocation | null> {
  const snapshot = await getDoc(doc(getFirebaseDb(), 'laboratories', laboratoryId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const latitude = data.latitude;
  const longitude = data.longitude;
  const radius = data.radius;
  if (
    typeof latitude !== 'number' || !Number.isFinite(latitude) ||
    typeof longitude !== 'number' || !Number.isFinite(longitude) ||
    typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0
  ) return null;
  return {
    id: snapshot.id,
    name: typeof data.name === 'string' ? data.name : laboratoryId,
    latitude,
    longitude,
    radius,
  };
}

export function getScheduleLaboratoryId(schedule: {
  laboratoryId?: string;
  classId?: string;
}): string | null {
  return schedule.laboratoryId || schedule.classId || null;
}

export async function saveLaboratoryLocation(
  laboratoryId: string,
  name: string,
  location: Coordinates,
  radius: number,
): Promise<void> {
  await setDoc(doc(getFirebaseDb(), 'laboratories', laboratoryId), {
    name,
    latitude: location.latitude,
    longitude: location.longitude,
    radius,
    updatedAt: serverTimestamp(),
  });
}

type AttendanceDocument = {
  sessionId?: unknown;
  userId?: unknown;
  status?: unknown;
  checkedInAt?: unknown;
  excusedAt?: unknown;
  permissionRequestId?: unknown;
};

function toIsoString(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return null;
}

function toSessionStatus(value: unknown): SessionStatus {
  if (value === 'open' || value === 'closed') {
    return value;
  }

  return 'scheduled';
}

function toSession(id: string, data: SessionDocument): Session {
  return {
    id,
    scheduleId: typeof data.scheduleId === 'string' ? data.scheduleId : '',
    status: toSessionStatus(data.status),
    openedAt: toIsoString(data.openedAt),
    closedAt: toIsoString(data.closedAt),
  };
}

function toAttendance(
  id: string,
  data: AttendanceDocument,
): AttendanceRecord | null {
  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : '';
  const userId = typeof data.userId === 'string' ? data.userId : '';
  const checkedInAt = toIsoString(data.checkedInAt);
  const status = data.status === 'excused' ? 'excused' : 'present';
  const excusedAt = toIsoString(data.excusedAt);

  if (!sessionId || !userId || (status === 'present' && !checkedInAt)) {
    return null;
  }

  return {
    id,
    sessionId,
    userId,
    status,
    checkedInAt,
    excusedAt,
    permissionRequestId:
      typeof data.permissionRequestId === 'string'
        ? data.permissionRequestId
        : null,
  };
}

function collectAttendance(
  snapshot: QuerySnapshot<DocumentData, DocumentData>,
): AttendanceRecord[] {
  return snapshot.docs
    .map((item) => toAttendance(item.id, item.data() as AttendanceDocument))
    .filter((item): item is AttendanceRecord => item !== null)
    .sort((a, b) =>
      (a.checkedInAt ?? a.excusedAt ?? '').localeCompare(
        b.checkedInAt ?? b.excusedAt ?? '',
      ),
    );
}

export function subscribeToSessions(
  onData: (sessions: Session[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), 'sessions'),
    (snapshot) => {
      onData(
        snapshot.docs.map((item) =>
          toSession(item.id, item.data() as SessionDocument),
        ),
      );
    },
    (error) => onError(error),
  );
}

export function subscribeToAttendanceForSession(
  sessionId: string,
  onData: (records: AttendanceRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(getFirebaseDb(), 'attendance'), where('sessionId', '==', sessionId)),
    (snapshot) => onData(collectAttendance(snapshot)),
    (error) => onError(error),
  );
}

export function subscribeToAttendanceForUser(
  userId: string,
  onData: (records: AttendanceRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(getFirebaseDb(), 'attendance'), where('userId', '==', userId)),
    (snapshot) => onData(collectAttendance(snapshot)),
    (error) => onError(error),
  );
}

export async function openSession(sessionId: string): Promise<void> {
  const db = getFirebaseDb();
  const sessionRef = doc(db, 'sessions', sessionId);

  await runTransaction(db, async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);

    if (!sessionSnapshot.exists()) {
      throw new Error('Sesi tidak ditemukan.');
    }

    if (toSessionStatus(sessionSnapshot.data().status) === 'open') {
      throw new Error('Sesi sudah dibuka.');
    }

    const scheduleId = sessionSnapshot.data().scheduleId;

    if (typeof scheduleId !== 'string' || !scheduleId) {
      throw new Error('Sesi tidak memiliki jadwal yang valid.');
    }

    const scheduleSnapshot = await transaction.get(
      doc(db, 'schedules', scheduleId),
    );

    if (!scheduleSnapshot.exists()) {
      throw new Error('Jadwal sesi tidak ditemukan.');
    }

    const scheduleData = scheduleSnapshot.data();
    const date = scheduleData.date;
    const startTime = scheduleData.startTime;
    const endTime = scheduleData.endTime;

    if (
      typeof date !== 'string' ||
      typeof startTime !== 'string' ||
      typeof endTime !== 'string'
    ) {
      throw new Error('Jadwal sesi tidak lengkap.');
    }

    const window = getPracticumWindowState({ date, startTime, endTime });

    if (window.phase === 'before') {
      throw new Error(
        `Sesi belum dapat dibuka. Praktikum dimulai pukul ${startTime}.`,
      );
    }

    if (window.phase === 'after') {
      throw new Error(
        `Waktu praktikum sudah berakhir pukul ${endTime}. Sesi tidak dapat dibuka.`,
      );
    }

    if (window.phase === 'invalid') {
      throw new Error('Jadwal sesi tidak valid sehingga sesi tidak dapat dibuka.');
    }

    transaction.update(sessionRef, {
      status: 'open',
      openedAt: serverTimestamp(),
      closedAt: null,
    });
  });
}


export async function closeSession(sessionId: string): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), 'sessions', sessionId), {
    status: 'closed',
    closedAt: serverTimestamp(),
  });
}

export async function getOrCreateSessionQrCode(sessionId: string): Promise<string> {
  const db = getFirebaseDb();
  const sessionSnapshot = await getDoc(doc(db, 'sessions', sessionId));
  if (!sessionSnapshot.exists() || toSessionStatus(sessionSnapshot.data().status) !== 'open') {
    throw new Error('Buka sesi terlebih dahulu untuk menampilkan QR presensi.');
  }
  const openedAt = sessionSnapshot.data().openedAt;
  if (!(openedAt instanceof Timestamp)) {
    throw new Error('Waktu buka sesi belum tersinkron. Coba lagi sebentar.');
  }

  const codes = collection(db, 'sessions', sessionId, 'attendanceCodes');
  const activeCodes = await getDocs(query(codes, where('openedAt', '==', openedAt)));
  if (!activeCodes.empty) return activeCodes.docs[0].id;

  const codeRef = doc(codes);
  await setDoc(codeRef, {
    sessionId,
    openedAt,
    createdAt: serverTimestamp(),
  });
  return codeRef.id;
}

export async function createSession(scheduleId: string): Promise<void> {
  const db = getFirebaseDb();
  const sessionRef = doc(db, 'sessions', `session_${scheduleId}`);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(sessionRef);

    if (existing.exists()) {
      return;
    }

    transaction.set(sessionRef, {
      scheduleId,
      status: 'scheduled',
      openedAt: null,
      closedAt: null,
    });
  });
}
export async function checkInWithLocation(
  sessionId: string,
  userId: string,
  location: CheckInLocation,
  attendanceCode?: string,
): Promise<CheckInResult> {
  if (
    !Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 ||
    !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180 ||
    !Number.isFinite(location.accuracy) || location.accuracy < 0
  ) {
    return { ok: false, reason: 'location-unavailable' };
  }
  if (location.accuracy > 50) {
    return { ok: false, reason: 'location-inaccurate' };
  }

  const db = getFirebaseDb();
  const sessionRef = doc(db, 'sessions', sessionId);
  const attendanceRef = doc(db, 'attendance', `${sessionId}_${userId}`);
  const checkedInAt = new Date().toISOString();

  const outcome = await runTransaction(
    db,
    async (transaction): Promise<CheckInResult> => {
      const sessionSnapshot = await transaction.get(sessionRef);

      if (!sessionSnapshot.exists()) {
        return { ok: false, reason: 'unknown-session' };
      }

            if (toSessionStatus(sessionSnapshot.data().status) !== 'open') {
        return { ok: false, reason: 'not-open' };
      }

      const sessionScheduleId = sessionSnapshot.data().scheduleId;
      const scheduleSnapshot =
        typeof sessionScheduleId === 'string' && sessionScheduleId
          ? await transaction.get(doc(db, 'schedules', sessionScheduleId))
          : null;

      if (!scheduleSnapshot || !scheduleSnapshot.exists()) {
        return { ok: false, reason: 'unknown-session' };
      }

      const scheduleData = scheduleSnapshot.data();

      const laboratoryId = typeof scheduleData.laboratoryId === 'string' && scheduleData.laboratoryId
        ? scheduleData.laboratoryId
        : typeof scheduleData.classId === 'string' && scheduleData.classId
          ? scheduleData.classId
          : null;
      if (!laboratoryId) {
        return { ok: false, reason: 'laboratory-unconfigured' };
      }

      const laboratorySnapshot = await transaction.get(doc(db, 'laboratories', laboratoryId));
      if (!laboratorySnapshot.exists()) {
        return { ok: false, reason: 'laboratory-unconfigured' };
      }
      const laboratoryData = laboratorySnapshot.data();
      const laboratoryLatitude = laboratoryData.latitude;
      const laboratoryLongitude = laboratoryData.longitude;
      const laboratoryRadius = laboratoryData.radius;
      if (
        typeof laboratoryLatitude !== 'number' || !Number.isFinite(laboratoryLatitude) ||
        typeof laboratoryLongitude !== 'number' || !Number.isFinite(laboratoryLongitude) ||
        typeof laboratoryRadius !== 'number' || !Number.isFinite(laboratoryRadius) || laboratoryRadius <= 0
      ) {
        return { ok: false, reason: 'laboratory-unconfigured' };
      }

      if (location.accuracy > laboratoryRadius) {
        return { ok: false, reason: 'location-inaccurate' };
      }

      const distance = calculateDistanceMeters(location, {
        latitude: laboratoryLatitude,
        longitude: laboratoryLongitude,
      });
      if (distance > laboratoryRadius) {
        return { ok: false, reason: 'outside-radius' };
      }

      if (attendanceCode) {
        const codeRef = doc(db, 'sessions', sessionId, 'attendanceCodes', attendanceCode);
        const codeSnapshot = await transaction.get(codeRef);
        const sessionOpenedAt = sessionSnapshot.data().openedAt;
        const codeOpenedAt = codeSnapshot.exists() ? codeSnapshot.data().openedAt : null;
        const sameOpenSession = sessionOpenedAt instanceof Timestamp &&
          codeOpenedAt instanceof Timestamp &&
          sessionOpenedAt.isEqual(codeOpenedAt);
        if (
          !codeSnapshot.exists() ||
          codeSnapshot.data().sessionId !== sessionId ||
          !sameOpenSession
        ) {
          return { ok: false, reason: 'invalid-qr' };
        }
      }

      if (
        typeof scheduleData.date !== 'string' ||
        typeof scheduleData.startTime !== 'string' ||
        typeof scheduleData.endTime !== 'string'
      ) {
        return { ok: false, reason: 'unknown-session' };
      }

      const window = getPracticumWindowState({
        date: scheduleData.date,
        startTime: scheduleData.startTime,
        endTime: scheduleData.endTime,
      });

      if (window.phase !== 'open') {
        return { ok: false, reason: 'outside-window' };
      }

      const attendanceSnapshot = await transaction.get(attendanceRef);

      if (attendanceSnapshot.exists()) {
        if (attendanceSnapshot.data().status === 'excused') {
          return { ok: false, reason: 'excused' };
        }
        return { ok: false, reason: 'already-checked-in' };
      }

      transaction.set(attendanceRef, {
        sessionId,
        userId,
        status: 'present',
        checkedInAt: serverTimestamp(),
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        ...(attendanceCode ? { attendanceCode } : {}),
      });

      return {
        ok: true,
        record: {
          id: attendanceRef.id,
          sessionId,
          userId,
          status: 'present',
          checkedInAt,
          excusedAt: null,
          permissionRequestId: null,
        },
      };
    },
  );

  return outcome;
}

export function subscribeToAllAttendance(
  onData: (records: AttendanceRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), 'attendance'),
    (snapshot) => onData(collectAttendance(snapshot)),
    (error) => onError(error),
  );
}
