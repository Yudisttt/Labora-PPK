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
import type { Unsubscribe } from 'firebase/firestore';

import {
  listenAssistantProfiles,
  listenPraktikanProfiles,
  listenSchedules,
  listenSchedulesForUser,
} from '@/services/practicum-data';
import {
  subscribeToAllAttendance,
  subscribeToAttendanceForUser,
  subscribeToSessions,
  checkIn as writeCheckIn,
  closeSession as writeCloseSession,
  openSession as writeOpenSession,
} from '@/services/sessions';
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
  attendanceError: string | null;
  currentUser: User | null;
  openSession: (sessionId: string) => Promise<void>;
  closeSession: (sessionId: string) => Promise<void>;
  checkIn: (sessionId: string, userId: string) => Promise<CheckInResult>;
  getUser: (userId: string) => User | undefined;
  getSchedule: (scheduleId: string) => Schedule | undefined;
  getScheduleForSession: (sessionId: string) => Schedule | undefined;
  getSessionsForSchedule: (scheduleId: string) => Session[];
  hasCheckedIn: (sessionId: string, userId: string) => boolean;
  isExcused: (sessionId: string, userId: string) => boolean;
  getAttendanceForSession: (sessionId: string) => AttendanceRecord[];
  getAttendanceForUser: (userId: string) => AttendanceRecord[];
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceError, setAttendanceError] = useState<{
    userId: string;
    message: string;
  } | null>(null);
  const [dataOwner, setDataOwner] = useState<User | null>(null);
  const dataOwnerUserId = useRef<string | null>(null);
  const profileOwnerUserId = useRef<string | null>(null);
  const attendanceRef = useRef<AttendanceRecord[]>([]);

  useEffect(() => {
    if (!currentUser) {
      dataOwnerUserId.current = null;
      profileOwnerUserId.current = null;
      attendanceRef.current = [];
      return;
    }

    const user = currentUser;
    let active = true;
    const subscriptions: Unsubscribe[] = [];
    const sameOwnerAtStart = dataOwnerUserId.current === user.id;
    if (!sameOwnerAtStart) {
      dataOwnerUserId.current = user.id;
      attendanceRef.current = [];
    }
    let receivedInitialSchedules = false;
    const handleError = (error: Error) => {
      if (active) {
        console.warn('Gagal memuat data praktikum dari Firebase', error);
      }
    };
    const handleAttendanceError = (error: Error) => {
      if (active) {
        const code = 'code' in error ? String(error.code) : '';
        setAttendanceError({ userId: user.id, message: code || error.message });
        console.warn('Gagal memuat data presensi dari Firebase', error);
      }
    };

    function receiveSchedules(nextSchedules: Schedule[]) {
      if (!active) return;

      const sameOwner = dataOwnerUserId.current === user.id;
      dataOwnerUserId.current = user.id;
      setDataOwner(user);

      if (!receivedInitialSchedules) {
        receivedInitialSchedules = true;
        if (user.role !== 'asisten' || profileOwnerUserId.current !== user.id) {
          setUsers([user]);
        }
      }

      setSchedules(nextSchedules);
      const nextAttendance = sameOwner ? attendanceRef.current : [];
      attendanceRef.current = nextAttendance;
      setAttendance(nextAttendance);
    }

    try {
      subscriptions.push(
  subscribeToSessions((nextSessions) => {
    if (active) setSessions(nextSessions);
  }, handleError),

  user.role === 'asisten'
    ? subscribeToAllAttendance((nextAttendance) => {
        if (active) {
          attendanceRef.current = nextAttendance;
          setAttendance(nextAttendance);
          setAttendanceError((current) =>
            current?.userId === user.id ? null : current,
          );
        }
      }, handleAttendanceError)
    : subscribeToAttendanceForUser(user.id, (nextAttendance) => {
        if (active) {
          attendanceRef.current = nextAttendance;
          setAttendance(nextAttendance);
          setAttendanceError((current) =>
            current?.userId === user.id ? null : current,
          );
        }
      }, handleAttendanceError),

  user.role === 'asisten'
    ? listenSchedules(receiveSchedules, handleError)
    : listenSchedulesForUser(user.id, receiveSchedules, handleError),
);

      if (user.role === 'asisten') {
        let praktikanProfiles: User[] = [];
        let assistantProfiles: User[] = [];
        const updateProfiles = () => {
          if (!active) return;
          profileOwnerUserId.current = user.id;
          const uniqueProfiles = new Map(
            [...praktikanProfiles, ...assistantProfiles, user].map(
              (profile) => [profile.id, profile],
            ),
          );
          setUsers([...uniqueProfiles.values()]);
        };

        subscriptions.push(
          listenPraktikanProfiles((profiles) => {
            praktikanProfiles = profiles;
            updateProfiles();
          }, handleError),
          listenAssistantProfiles((profiles) => {
            assistantProfiles = profiles;
            updateProfiles();
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
    currentUser !== null && dataOwner === currentUser;
  const visibleUsers = useMemo(
    () => {
      if (currentUserDataIsLoaded) return users;
      return currentUser ? [currentUser] : [];
    },
    [currentUser, currentUserDataIsLoaded, users],
  );
  const visibleSchedules = useMemo(
    () =>
      currentUserDataIsLoaded
        ? schedules.filter((schedule) => schedule.status !== 'cancelled')
        : [],
    [currentUserDataIsLoaded, schedules],
  );
  const visibleSessions = useMemo(() => {
    if (!currentUserDataIsLoaded) return [];

    const scheduleIds = new Set(visibleSchedules.map((schedule) => schedule.id));
    return sessions.filter((session) => scheduleIds.has(session.scheduleId));
  }, [currentUserDataIsLoaded, sessions, visibleSchedules]);
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
    async (sessionId: string, userId: string): Promise<CheckInResult> => {
      if (!currentUser || currentUser.id !== userId) {
        return { ok: false, reason: 'unauthorized' };
      }

      if (currentUser.role !== 'praktikan') {
        return { ok: false, reason: 'invalid-role' };
      }

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
      attendanceError:
        attendanceError && attendanceError.userId === currentUser?.id
          ? attendanceError.message
          : null,
      currentUser,
      openSession,
      closeSession,
      checkIn,
      getUser,
      getSchedule,
      getScheduleForSession: (sessionId) => {
        const session = visibleSessions.find((item) => item.id === sessionId);
        return session ? getSchedule(session.scheduleId) : undefined;
      },
      getSessionsForSchedule: (scheduleId) =>
        visibleSessions
          .filter((session) => session.scheduleId === scheduleId)
          .sort((a, b) => {
            const statusPriority = { open: 0, scheduled: 1, closed: 2 };
            const priorityDifference =
              statusPriority[a.status] - statusPriority[b.status];
            if (priorityDifference !== 0) return priorityDifference;
            return (b.openedAt ?? b.closedAt ?? '').localeCompare(
              a.openedAt ?? a.closedAt ?? '',
            );
          }),
      hasCheckedIn: (sessionId, userId) =>
        visibleAttendance.some(
          (record) =>
            record.sessionId === sessionId &&
            record.userId === userId &&
            record.status === 'present',
        ),
      isExcused: (sessionId, userId) =>
        visibleAttendance.some(
          (record) =>
            record.sessionId === sessionId &&
            record.userId === userId &&
            record.status === 'excused',
        ),
      getAttendanceForSession: (sessionId) =>
        visibleAttendance
          .filter((record) => record.sessionId === sessionId)
          .sort((a, b) =>
            (a.checkedInAt ?? a.excusedAt ?? '').localeCompare(
              b.checkedInAt ?? b.excusedAt ?? '',
            ),
          ),
      getAttendanceForUser: (userId) =>
        visibleAttendance
          .filter((record) => record.userId === userId)
          .sort((a, b) =>
            (b.checkedInAt ?? b.excusedAt ?? '').localeCompare(
              a.checkedInAt ?? a.excusedAt ?? '',
            ),
          ),
    };
  }, [
    checkIn,
    closeSession,
    currentUser,
    attendanceError,
    openSession,
    visibleAttendance,
    visibleSchedules,
    visibleSessions,
    visibleUsers,
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
