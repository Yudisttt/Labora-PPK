import { useEffect, useState } from 'react';

import {
  closeSession,
  openSession,
  subscribeToAttendanceForSession,
  subscribeToAttendanceForUser,
  subscribeToSessions,
} from '@/services/sessions';
import type { AttendanceRecord, Session } from '@/types';

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToSessions(
      (next) => {
        setSessions(next);
        setError(null);
        setLoading(false);
      },
      () => {
        setError('Gagal memuat sesi praktikum.');
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  return { sessions, loading, error, openSession, closeSession };
}

export function useSessionAttendance(sessionId: string | null) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const unsubscribe = subscribeToAttendanceForSession(
      sessionId,
      (next) => {
        setRecords(next);
        setError(null);
        setLoadedFor(sessionId);
      },
      () => {
        setError('Gagal memuat rekap kehadiran.');
        setLoadedFor(sessionId);
      },
    );

    return unsubscribe;
  }, [sessionId]);

  const ready = sessionId !== null && loadedFor === sessionId;

  return {
    records: ready ? records : [],
    loading: sessionId !== null && !ready,
    error: ready ? error : null,
  };
}

export function useMyAttendance(userId: string | null) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const unsubscribe = subscribeToAttendanceForUser(
      userId,
      (next) => {
        setRecords(next);
        setError(null);
        setLoadedFor(userId);
      },
      () => {
        setError('Gagal memuat riwayat kehadiran.');
        setLoadedFor(userId);
      },
    );

    return unsubscribe;
  }, [userId]);

  const ready = userId !== null && loadedFor === userId;

  return {
    records: ready ? records : [],
    loading: userId !== null && !ready,
    error: ready ? error : null,
  };
}
