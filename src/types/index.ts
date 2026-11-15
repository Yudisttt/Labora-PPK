export type Role = 'praktikan' | 'asisten';

export type User = {
  id: string;
  name: string;
  email?: string;
  role: Role;
  identityNumber: string;
  program: string;
};

export type Schedule = {
  id: string;
  classId?: string;
  praktikum: string;
  kelas: string;
  ruang: string;
  date: string;
  startTime: string;
  endTime: string;
  assistantId: string;
};

export type SessionStatus = 'scheduled' | 'open' | 'closed';

export type Session = {
  id: string;
  scheduleId: string;
  status: SessionStatus;
  openedAt: string | null;
  closedAt: string | null;
};

export type AttendanceRecord = {
  id: string;
  sessionId: string;
  userId: string;
  status: 'present' | 'excused';
  checkedInAt: string | null;
  excusedAt: string | null;
  permissionRequestId: string | null;
};

export type PermissionRequestStatus = 'pending' | 'approved' | 'rejected';

export type ReasonAssessmentLabel = 'negatif' | 'netral' | 'positif';

export type PermissionAiPrediction = {
  label: ReasonAssessmentLabel | null;
  status:
    | 'predicted'
    | 'unknown_vocabulary'
    | 'empty_input'
    | 'error';
  experimental: boolean;
  scoreType: 'none' | 'decision_margin' | 'log_score';
  modelVersion: 'edom-sentiment-v1' | 'permission-reason-v1';
};

export type PermissionDecision = 'approved' | 'rejected';

export type PermissionRequest = {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  reason: string;
  aiPrediction: PermissionAiPrediction | null;
  status: PermissionRequestStatus;
  submittedAt: string | null;
  decisionBy: string | null;
  decisionAt: string | null;
};

export type CheckInFailureReason =
  | 'unknown-session'
  | 'not-open'
  | 'excused'
  | 'already-checked-in'
  | 'unauthorized'
  | 'invalid-role';

export type CheckInResult =
  | { ok: true; record: AttendanceRecord }
  | { ok: false; reason: CheckInFailureReason };
