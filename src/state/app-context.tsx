import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  listenAssistantProfiles,
  listenPraktikanProfiles,
  listenSchedules,
  listenSchedulesForUser,
} from '@/services/practicum-data';
import { useAuth } from '@/state/auth-context';
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
  const { currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [dataUserId, setDataUserId] = useState<string | null>(null);

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  // Menyimpan data presensi terbaru secara langsung.
  // Digunakan agar pengecekan duplikasi tidak hanya bergantung
  // pada state React yang pembaruannya asynchronous.
  const attendanceRef = useRef<AttendanceRecord[]>([]);
  const dataOwnerUserId = useRef<string | null>(null);
  const profileOwnerUserId = useRef<string | null>(null);

  useEffect(() => {
    if (currentUser === null) {
      return;
    }
    const user: User = currentUser;

    let active = true;
    const subscriptions: (() => void)[] = [];

    function handleError(error: Error) {
      if (active) {
        console.error('Gagal memuat data jadwal praktikum dari Firebase.', error);
      }
    }

    function receiveSchedules(nextSchedules: Schedule[]) {
      if (!active) {
        return;
      }

      const sameOwner = dataOwnerUserId.current === user.id;
      dataOwnerUserId.current = user.id;
      setDataUserId(user.id);
      if (
        !sameOwner &&
        (user.role !== 'asisten' ||
          profileOwnerUserId.current !== user.id)
      ) {
        setUsers([user]);
      }

      setSchedules(nextSchedules);
      setSessions((previousSessions) => {
        const byScheduleId = new Map(
          (sameOwner ? previousSessions : []).map((session) => [
            session.scheduleId,
            session,
          ]),
        );

        return nextSchedules.map(
          (schedule) =>
            byScheduleId.get(schedule.id) ?? {
              id: `session-${schedule.id}`,
              scheduleId: schedule.id,
              status: 'scheduled',
              openedAt: null,
              closedAt: null,
            },
        );
      });

      const sessionIds = new Set(
        nextSchedules.map((schedule) => `session-${schedule.id}`),
      );
      const nextAttendance = (sameOwner ? attendanceRef.current : []).filter(
        (record) => sessionIds.has(record.sessionId),
      );
      attendanceRef.current = nextAttendance;
      setAttendance(nextAttendance);
    }

    try {
      subscriptions.push(
        user.role === 'asisten'
          ? listenSchedules(receiveSchedules, handleError)
          : listenSchedulesForUser(
              user.id,
              receiveSchedules,
              handleError,
            ),
      );

      if (user.role === 'asisten') {
        let praktikanProfiles: User[] = [];
        let assistantProfiles: User[] = [];
        const updateProfiles = () => {
          profileOwnerUserId.current = user.id;
          const uniqueProfiles = new Map(
            [...praktikanProfiles, ...assistantProfiles, user].map(
              (user) => [user.id, user],
            ),
          );
          setUsers([...uniqueProfiles.values()]);
        };

        subscriptions.push(
          listenPraktikanProfiles((profiles) => {
            if (active) {
              praktikanProfiles = profiles;
              updateProfiles();
            }
          }, handleError),
          listenAssistantProfiles((profiles) => {
            if (active) {
              assistantProfiles = profiles;
              updateProfiles();
            }
          }, handleError),
        );
      }
    } catch (subscriptionError) {
      handleError(
        subscriptionError instanceof Error
          ? subscriptionError
          : new Error('Tidak dapat memulai pemuatan data Firebase.'),
      );
    }

    return () => {
      active = false;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentUser]);

  const currentUserDataIsLoaded =
    currentUser !== null && dataUserId === currentUser.id;
  const visibleUsers = useMemo(
    () =>
      currentUserDataIsLoaded
        ? users
        : currentUser
          ? [currentUser]
          : [],
    [currentUser, currentUserDataIsLoaded, users],
  );
  const visibleSchedules = useMemo(
    () => (currentUserDataIsLoaded ? schedules : []),
    [currentUserDataIsLoaded, schedules],
  );
  const visibleSessions = useMemo(
    () => (currentUserDataIsLoaded ? sessions : []),
    [currentUserDataIsLoaded, sessions],
  );
  const visibleAttendance = useMemo(
    () => (currentUserDataIsLoaded ? attendance : []),
    [attendance, currentUserDataIsLoaded],
  );

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
      // Pastikan user yang melakukan check-in sama dengan user yang sedang login.
      if (!currentUser || currentUser.id !== userId) {
        return { ok: false, reason: 'unauthorized' };
      }

      // Pastikan user memiliki role praktikan
      if (currentUser.role !== 'praktikan') {
        return { ok: false, reason: 'invalid-role' };
      }

      // Pastikan sesi tersedia
      const session = visibleSessions.find(
        (item) => item.id === sessionId,
      );

      if (!session) {
        return { ok: false, reason: 'unknown-session' };
      }

      // Pastikan sesi dibuka
      if (session.status !== 'open') {
        return { ok: false, reason: 'not-open' };
      }

      // Periksa apa praktikan sudah melakukan check-in, menggunakan ref agar langsung membaca data terbaru
      const alreadyCheckedIn = attendanceRef.current.some(
        (record) =>
          record.sessionId === sessionId &&
          record.userId === userId,
      );

      if (alreadyCheckedIn) {
        return { ok: false, reason: 'already-checked-in' };
      }

      // Buat catatan presensi baru
      const record: AttendanceRecord = {
        id: `attendance-${sessionId}-${userId}`,
        sessionId,
        userId,
        checkedInAt: new Date().toISOString(),
      };

      // Perbarui ref terlebih dahulu agar pemanggilan check-in berikutnya langsung mengetahui data terbaru
      const updatedAttendance = [
        ...attendanceRef.current,
        record,
      ];

      attendanceRef.current = updatedAttendance;

      // Perbarui state agar tampilan ikut berubah
      setAttendance(updatedAttendance);

      return { ok: true, record };
    },
    [currentUser, visibleSessions],
  );

  const value = useMemo<AppContextValue>(() => {
    const getUser = (userId: string) =>
      visibleUsers.find((user) => user.id === userId);

    const getSchedule = (scheduleId: string) =>
      visibleSchedules.find((schedule) => schedule.id === scheduleId);

    return {
      users: visibleUsers,
      schedules: visibleSchedules,
      sessions: visibleSessions,
      attendance: visibleAttendance,
      currentUser,
      openSession,
      closeSession,
      checkIn,

      getUser,

      getSchedule,

      getScheduleForSession: (sessionId) => {
        const session = visibleSessions.find(
          (item) => item.id === sessionId,
        );

        return session
          ? getSchedule(session.scheduleId)
          : undefined;
      },

      getSessionsForSchedule: (scheduleId) =>
        visibleSessions.filter(
          (session) => session.scheduleId === scheduleId,
        ),

      hasCheckedIn: (sessionId, userId) =>
        visibleAttendance.some(
          (record) =>
            record.sessionId === sessionId &&
            record.userId === userId,
        ),

      getAttendanceForSession: (sessionId) =>
        visibleAttendance
          .filter((record) => record.sessionId === sessionId)
          .sort((a, b) =>
            a.checkedInAt.localeCompare(b.checkedInAt),
          ),

      getAttendanceForUser: (userId) =>
        visibleAttendance
          .filter((record) => record.userId === userId)
          .sort((a, b) =>
            b.checkedInAt.localeCompare(a.checkedInAt),
          ),
    };
  }, [
    checkIn,
    closeSession,
    currentUser,
    openSession,
    visibleAttendance,
    visibleSchedules,
    visibleSessions,
    visibleUsers,
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