import {
  Timestamp,
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/services/firebase';
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
      collection(db, 'permissionRequests'),
      where('userId', '==', userId),
    ),
    (snapshot) => onData(collectPermissionRequests(snapshot)),
    (error) => onError(error),
  );
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

  const request = await addDoc(collection(db, 'permissionRequests'), {
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
