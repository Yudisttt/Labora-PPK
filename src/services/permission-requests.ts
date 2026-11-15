import {
  Timestamp,
  addDoc,
  collection,
  onSnapshot,
  query,
  doc,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { getFirebaseDb } from '@/services/firebase';
import type {
  PermissionAiPrediction,
  PermissionRequest,
  ReasonAssessmentLabel,
} from '@/types';

type PermissionRequestDocument = {
  sessionId?: unknown;
  userId?: unknown;
  userName?: unknown;
  reason?: unknown;
  aiPrediction?: unknown;
  status?: unknown;
  submittedAt?: unknown;
  decisionBy?: unknown;
  decisionAt?: unknown;
};

export type NewPermissionRequest = {
  sessionId: string;
  userId: string;
  userName: string;
  reason: string;
  aiPrediction: PermissionAiPrediction;
};

function toIsoString(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toPermissionRequest(
  id: string,
  data: PermissionRequestDocument,
): PermissionRequest | null {
  if (
    typeof data.sessionId !== 'string' ||
    typeof data.userId !== 'string' ||
    typeof data.userName !== 'string' ||
    typeof data.reason !== 'string'
  ) {
    return null;
  }

  const status =
    data.status === 'approved' || data.status === 'rejected'
      ? data.status
      : 'pending';

  const aiPrediction = toAiPrediction(data.aiPrediction);

  return {
    id,
    sessionId: data.sessionId,
    userId: data.userId,
    userName: data.userName,
    reason: data.reason,
    aiPrediction,
    status,
    submittedAt: toIsoString(data.submittedAt),
    decisionBy:
      typeof data.decisionBy === 'string' ? data.decisionBy : null,
    decisionAt: toIsoString(data.decisionAt),
  };
}

function toAiPrediction(value: unknown): PermissionAiPrediction | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const validLabels: (ReasonAssessmentLabel | null)[] = [
    'negatif',
    'netral',
    'positif',
    null,
  ];
  const validStatuses = [
    'predicted',
    'unknown_vocabulary',
    'empty_input',
    'error',
  ];
  const validScoreTypes = ['none', 'decision_margin', 'log_score'];
  const modelVersion =
    candidate.modelVersion === 'permission-reason-v1'
      ? 'permission-reason-v1'
      : 'edom-sentiment-v1';

  if (
    !validLabels.includes(candidate.label as ReasonAssessmentLabel | null) ||
    !validStatuses.includes(String(candidate.status)) ||
    !validScoreTypes.includes(String(candidate.scoreType)) ||
    typeof candidate.experimental !== 'boolean'
  ) {
    return null;
  }

  return {
    label: candidate.label as ReasonAssessmentLabel | null,
    status: candidate.status as PermissionAiPrediction['status'],
    experimental: candidate.experimental,
    scoreType: candidate.scoreType as PermissionAiPrediction['scoreType'],
    modelVersion,
  };
}

function collectPermissionRequests(
  snapshot: QuerySnapshot<DocumentData, DocumentData>,
): PermissionRequest[] {
  return snapshot.docs
    .map((item) =>
      toPermissionRequest(
        item.id,
        item.data() as PermissionRequestDocument,
      ),
    )
    .filter((item): item is PermissionRequest => item !== null)
    .sort((a, b) =>
      (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''),
    );
}

export function subscribeToPermissionRequestsForUser(
  userId: string,
  onData: (requests: PermissionRequest[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(getFirebaseDb(), 'permissionRequests'),
      where('userId', '==', userId),
    ),
    (snapshot) => onData(collectPermissionRequests(snapshot)),
    (error) => onError(error),
  );
}

export function subscribeToAllPermissionRequests(
  onData: (requests: PermissionRequest[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), 'permissionRequests'),
    (snapshot) => onData(collectPermissionRequests(snapshot)),
    (error) => onError(error),
  );
}

export async function decidePermissionRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  assistantId: string,
): Promise<void> {
  if (!requestId || !assistantId) {
    throw new Error('Identitas pengajuan atau asisten belum tersedia.');
  }

  const db = getFirebaseDb();
  const requestRef = doc(db, 'permissionRequests', requestId);

  await runTransaction(db, async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);

    if (!requestSnapshot.exists()) {
      throw new Error('Pengajuan izin tidak ditemukan.');
    }

    if (requestSnapshot.data().status !== 'pending') {
      throw new Error('Pengajuan ini sudah diputuskan oleh asisten lain.');
    }

    const requestData = requestSnapshot.data();
    if (decision === 'approved') {
      const sessionId =
        typeof requestData.sessionId === 'string' ? requestData.sessionId : '';
      const userId =
        typeof requestData.userId === 'string' ? requestData.userId : '';

      if (!sessionId || !userId) {
        throw new Error('Data sesi atau praktikan pada pengajuan tidak valid.');
      }

      const sessionRef = doc(db, 'sessions', sessionId);
      const attendanceRef = doc(db, 'attendance', `${sessionId}_${userId}`);
      const sessionSnapshot = await transaction.get(sessionRef);
      const attendanceSnapshot = await transaction.get(attendanceRef);

      if (!sessionSnapshot.exists()) {
        throw new Error('Sesi praktikum pada pengajuan tidak ditemukan.');
      }

      if (attendanceSnapshot.exists()) {
        throw new Error(
          attendanceSnapshot.data().status === 'excused'
            ? 'Praktikan sudah memiliki status izin pada sesi ini.'
            : 'Praktikan sudah presensi; status kehadiran tidak dapat diubah menjadi izin.',
        );
      }

      transaction.set(attendanceRef, {
        sessionId,
        userId,
        status: 'excused',
        checkedInAt: null,
        excusedAt: serverTimestamp(),
        approvedBy: assistantId,
        permissionRequestId: requestId,
      });
    }

    transaction.update(requestRef, {
      status: decision,
      decisionBy: assistantId,
      decisionAt: serverTimestamp(),
    });
  });
}

export async function submitPermissionRequest(
  input: NewPermissionRequest,
): Promise<string> {
  const reason = input.reason.trim();

  if (!input.sessionId || !input.userId || !input.userName.trim()) {
    throw new Error('Informasi sesi atau identitas praktikan belum tersedia.');
  }

  if (!reason) {
    throw new Error('Alasan izin wajib diisi.');
  }

  if (reason.length > 1000) {
    throw new Error('Alasan izin maksimal 1000 karakter.');
  }

  const request = await addDoc(collection(getFirebaseDb(), 'permissionRequests'), {
    sessionId: input.sessionId,
    userId: input.userId,
    userName: input.userName.trim(),
    reason,
    aiPrediction: input.aiPrediction,
    status: 'pending',
    submittedAt: serverTimestamp(),
  });

  return request.id;
}
