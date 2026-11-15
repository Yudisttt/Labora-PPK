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
