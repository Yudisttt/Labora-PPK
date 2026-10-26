import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  dummyAttendance,
  dummySchedules,
  dummySessions,
  dummyUsers,
} from '@/data/dummy';
import type {
  AttendanceRecord,
  CheckInResult,
  Schedule,
  Session,
  User,
} from '@/types';

type AppContextValue = {
  users: User[];
  schedules: Schedule[];
  sessions: Session[];
  attendance: AttendanceRecord[];
  currentUser: User | null;
  selectUser: (userId: string) => void;
  signOut: () => void;
  openSession: (sessionId: string) => void;
  closeSession: (sessionId: string) => void;
  checkIn: (sessionId: string, userId: string) => CheckInResult;
  getUser: (userId: string) => User | undefined;
  getSchedule: (scheduleId: string) => Schedule | undefined;
  getScheduleForSession: (sessionId: string) => Schedule | undefined;
  getSessionsForSchedule: (scheduleId: string) => Session[];
  hasCheckedIn: (sessionId: string, userId: string) => boolean;
  getAttendanceForSession: (sessionId: string) => AttendanceRecord[];
  getAttendanceForUser: (userId: string) => AttendanceRecord[];
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<Session[]>(dummySessions);
  const [attendance, setAttendance] =
    useState<AttendanceRecord[]>(dummyAttendance);

  const selectUser = useCallback((userId: string) => {
    setCurrentUser(dummyUsers.find((user) => user.id === userId) ?? null);
  }, []);

  const signOut = useCallback(() => {
    setCurrentUser(null);
  }, []);

  const openSession = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId && session.status !== 'open'
          ? {
              ...session,
              status: 'open',
              openedAt: new Date().toISOString(),
              closedAt: null,
            }
          : session,
      ),
    );
  }, []);

  const closeSession = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId && session.status === 'open'
          ? {
              ...session,
              status: 'closed',
              closedAt: new Date().toISOString(),
            }
          : session,
      ),
    );
  }, []);

  const checkIn = useCallback(
    (sessionId: string, userId: string): CheckInResult => {
      const session = sessions.find((item) => item.id === sessionId);

      if (!session) {
        return { ok: false, reason: 'unknown-session' };
      }

      if (session.status !== 'open') {
        return { ok: false, reason: 'not-open' };
      }

      const alreadyCheckedIn = attendance.some(
        (record) =>
          record.sessionId === sessionId && record.userId === userId,
      );

      if (alreadyCheckedIn) {
        return { ok: false, reason: 'already-checked-in' };
      }

      const record: AttendanceRecord = {
        id: `attendance-${sessionId}-${userId}`,
        sessionId,
        userId,
        checkedInAt: new Date().toISOString(),
      };

      setAttendance((prev) => [...prev, record]);

      return { ok: true, record };
    },
    [attendance, sessions],
  );

  const value = useMemo<AppContextValue>(() => {
    const getUser = (userId: string) =>
      dummyUsers.find((user) => user.id === userId);

    const getSchedule = (scheduleId: string) =>
      dummySchedules.find((schedule) => schedule.id === scheduleId);

    return {
      users: dummyUsers,
      schedules: dummySchedules,
      sessions,
      attendance,
      currentUser,
      selectUser,
      signOut,
      openSession,
      closeSession,
      checkIn,
      getUser,
      getSchedule,
      getScheduleForSession: (sessionId) => {
        const session = sessions.find((item) => item.id === sessionId);
        return session ? getSchedule(session.scheduleId) : undefined;
      },
      getSessionsForSchedule: (scheduleId) =>
        sessions.filter((session) => session.scheduleId === scheduleId),
      hasCheckedIn: (sessionId, userId) =>
        attendance.some(
          (record) =>
            record.sessionId === sessionId && record.userId === userId,
        ),
      getAttendanceForSession: (sessionId) =>
        attendance
          .filter((record) => record.sessionId === sessionId)
          .sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt)),
      getAttendanceForUser: (userId) =>
        attendance
          .filter((record) => record.userId === userId)
          .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt)),
    };
  }, [
    attendance,
    checkIn,
    closeSession,
    currentUser,
    openSession,
    selectUser,
    sessions,
    signOut,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useApp harus dipakai di dalam AppProvider');
  }

  return context;
}
