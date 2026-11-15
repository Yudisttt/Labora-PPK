import {
  Timestamp,
  collection,
  addDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/services/firebase';
import type {
  AttendanceRecord,
  CheckInResult,
  Session,
  SessionStatus,
} from '@/types';

type SessionDocument = {
  scheduleId?: unknown;
  status?: unknown;
  openedAt?: unknown;
  closedAt?: unknown;
};

type AttendanceDocument = {
  sessionId?: unknown;
  userId?: unknown;
  checkedInAt?: unknown;
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

  if (!sessionId || !userId || !checkedInAt) {
    return null;
  }

  return { id, sessionId, userId, checkedInAt };
}

function collectAttendance(
  snapshot: QuerySnapshot<DocumentData, DocumentData>,
): AttendanceRecord[] {
  return snapshot.docs
    .map((item) => toAttendance(item.id, item.data() as AttendanceDocument))
    .filter((item): item is AttendanceRecord => item !== null)
    .sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
}

export function subscribeToSessions(
  onData: (sessions: Session[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'sessions'),
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
    query(collection(db, 'attendance'), where('sessionId', '==', sessionId)),
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
    query(collection(db, 'attendance'), where('userId', '==', userId)),
    (snapshot) => onData(collectAttendance(snapshot)),
    (error) => onError(error),
  );
}

export async function openSession(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'open',
    openedAt: serverTimestamp(),
    closedAt: null,
  });
}

export async function closeSession(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'closed',
    closedAt: serverTimestamp(),
  });
}

export async function createSession(scheduleId: string): Promise<void> {
  await addDoc(collection(db, 'sessions'), {
    scheduleId,
    status: 'scheduled',
    openedAt: null,
    closedAt: null,
  });
}
export async function checkIn(
  sessionId: string,
  userId: string,
): Promise<CheckInResult> {
  const sessionRef = doc(db, 'sessions', sessionId);
  const attendanceRef = doc(db, 'attendance', `${sessionId}_${userId}`);

  const outcome = await runTransaction(
    db,
    async (transaction): Promise<CheckInResult | { ok: true }> => {
      const sessionSnapshot = await transaction.get(sessionRef);

      if (!sessionSnapshot.exists()) {
        return { ok: false, reason: 'unknown-session' };
      }

      if (toSessionStatus(sessionSnapshot.data().status) !== 'open') {
        return { ok: false, reason: 'not-open' };
      }

      const attendanceSnapshot = await transaction.get(attendanceRef);

      if (attendanceSnapshot.exists()) {
        return { ok: false, reason: 'already-checked-in' };
      }

      transaction.set(attendanceRef, {
        sessionId,
        userId,
        checkedInAt: serverTimestamp(),
      });

      return { ok: true };
    },
  );

  if (!outcome.ok) {
    return outcome;
  }

  const saved = await getDoc(attendanceRef);
  const record = saved.exists()
    ? toAttendance(saved.id, saved.data() as AttendanceDocument)
    : null;

  if (!record) {
    throw new Error('Presensi tersimpan tetapi gagal dibaca ulang.');
  }

  return { ok: true, record };
}

export function subscribeToAllAttendance(
  onData: (records: AttendanceRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'attendance'),
    (snapshot) => onData(collectAttendance(snapshot)),
    (error) => onError(error),
  );
}
