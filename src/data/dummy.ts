import type { AttendanceRecord, Schedule, Session, User } from '@/types';

export const dummyUsers: User[] = [
  {
    id: 'user-asisten-1',
    name: 'Syifa Aeni',
    role: 'asisten',
    identityNumber: 'NIP 198704152021011003',
    program: 'Asisten Laboratorium',
  },
  {
    id: 'user-praktikan-1',
    name: 'Revalina Salwa',
    role: 'praktikan',
    identityNumber: 'NIM 240601241000',
    program: 'Informatika',
  },
  {
    id: 'user-praktikan-2',
    name: 'Ida Bagus',
    role: 'praktikan',
    identityNumber: 'NIM 240601241001',
    program: 'Informatika',
  },
  {
    id: 'user-praktikan-3',
    name: 'Andhika Rama',
    role: 'praktikan',
    identityNumber: 'NIM 240601241002',
    program: 'Informatika',
  },
];

export const dummySchedules: Schedule[] = [
  {
    id: 'schedule-1',
    praktikum: 'Pengembangan Platform Khusus',
    kelas: 'Kelas A',
    ruang: 'Lab Komputer A',
    date: '2026-10-23',
    startTime: '08:00',
    endTime: '10:00',
    assistantId: 'user-asisten-1',
  },
  {
    id: 'schedule-2',
    praktikum: 'Basis Data',
    kelas: 'Kelas B',
    ruang: 'Lab Komputer B',
    date: '2026-10-26',
    startTime: '10:00',
    endTime: '12:00',
    assistantId: 'user-asisten-1',
  },
  {
    id: 'schedule-3',
    praktikum: 'Jaringan Komputer',
    kelas: 'Kelas C',
    ruang: 'Lab Komputer C',
    date: '2026-10-22',
    startTime: '13:00',
    endTime: '15:00',
    assistantId: 'user-asisten-1',
  },
];

export const dummySessions: Session[] = [
  {
    id: 'session-1',
    scheduleId: 'schedule-1',
    status: 'open',
    openedAt: '2026-10-23T07:55:00',
    closedAt: null,
  },
  {
    id: 'session-2',
    scheduleId: 'schedule-2',
    status: 'scheduled',
    openedAt: null,
    closedAt: null,
  },
  {
    id: 'session-3',
    scheduleId: 'schedule-3',
    status: 'closed',
    openedAt: '2026-10-22T12:55:00',
    closedAt: '2026-10-22T15:05:00',
  },
];

export const dummyAttendance: AttendanceRecord[] = [
  {
    id: 'attendance-1',
    sessionId: 'session-1',
    userId: 'user-praktikan-3',
    checkedInAt: '2026-10-23T08:12:00',
  },
  {
    id: 'attendance-2',
    sessionId: 'session-3',
    userId: 'user-praktikan-1',
    checkedInAt: '2026-10-22T13:04:00',
  },
  {
    id: 'attendance-3',
    sessionId: 'session-3',
    userId: 'user-praktikan-2',
    checkedInAt: '2026-10-22T13:10:00',
  },
];
