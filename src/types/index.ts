export type Role = 'praktikan' | 'asisten';

export type User = {
  id: string;
  name: string;
  role: Role;
  identityNumber: string;
  program: string;
};

export type Schedule = {
  id: string;
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
  checkedInAt: string;
};

export type CheckInFailureReason =
  | 'unknown-session'
  | 'not-open'
  | 'already-checked-in';

export type CheckInResult =
  | { ok: true; record: AttendanceRecord }
  | { ok: false; reason: CheckInFailureReason };
