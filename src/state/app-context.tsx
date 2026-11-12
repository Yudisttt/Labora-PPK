import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { dummySchedules, dummyUsers } from '@/data/dummy';
import {
  checkIn as writeCheckIn,
  closeSession as writeCloseSession,
  openSession as writeOpenSession,
  subscribeToAllAttendance,
  subscribeToSessions,
} from '@/services/sessions';
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
  openSession: (sessionId: string) => Promise<void>;
  closeSession: (sessionId: string) => Promise<void>;
  checkIn: (sessionId: string, userId: string) => Promise<CheckInResult>;
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  // Sesi praktikum dibaca langsung dari Firestore dan diperbarui real-time
  useEffect(() => {
    const unsubscribe = subscribeToSessions(
      setSessions,
      (error) => console.warn('Gagal berlangganan sesi', error),
    );

    return unsubscribe;
  }, []);

  // Rekap presensi bersifat real-time lintas perangkat
  useEffect(() => {
    const unsubscribe = subscribeToAllAttendance(
      setAttendance,
      (error) => console.warn('Gagal berlangganan presensi', error),
    );

    return unsubscribe;
  }, []);

  const selectUser = useCallback((userId: string) => {
    setCurrentUser(
      dummyUsers.find((user) => user.id === userId) ?? null,
    );
  }, []);

  const signOut = useCallback(() => {
    setCurrentUser(null);
  }, []);

  const openSession = useCallback(async (sessionId: string) => {
    await writeOpenSession(sessionId);
  }, []);

  const closeSession = useCallback(async (sessionId: string) => {
    await writeCloseSession(sessionId);
  }, []);

  const checkIn = useCallback(
    async (
      sessionId: string,
      userId: string,
    ): Promise<CheckInResult> => {
      // Pastikan ada user yang sedang login dan ID-nya sesuai
      if (!currentUser || currentUser.id !== userId) {
        return { ok: false, reason: 'unauthorized' };
      }

      // Pastikan user memiliki role praktikan
      if (currentUser.role !== 'praktikan') {
        return { ok: false, reason: 'invalid-role' };
      }

      // Validasi sesi, status open, dan duplikasi dilakukan di Firestore
      return writeCheckIn(sessionId, userId);
    },
    [currentUser],
  );

  const value = useMemo<AppContextValue>(() => {
    const getUser = (userId: string) =>
      dummyUsers.find((user) => user.id === userId);

    const getSchedule = (scheduleId: string) =>
      dummySchedules.find(
        (schedule) => schedule.id === scheduleId,
      );

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
        const session = sessions.find(
          (item) => item.id === sessionId,
        );

        return session
          ? getSchedule(session.scheduleId)
          : undefined;
      },

      getSessionsForSchedule: (scheduleId) =>
        sessions.filter(
          (session) => session.scheduleId === scheduleId,
        ),

      hasCheckedIn: (sessionId, userId) =>
        attendance.some(
          (record) =>
            record.sessionId === sessionId &&
            record.userId === userId,
        ),

      getAttendanceForSession: (sessionId) =>
        attendance
          .filter((record) => record.sessionId === sessionId)
          .sort((a, b) =>
            a.checkedInAt.localeCompare(b.checkedInAt),
          ),

      getAttendanceForUser: (userId) =>
        attendance
          .filter((record) => record.userId === userId)
          .sort((a, b) =>
            b.checkedInAt.localeCompare(a.checkedInAt),
          ),
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

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error(
      'useApp harus dipakai di dalam AppProvider',
    );
  }

  return context;
}
