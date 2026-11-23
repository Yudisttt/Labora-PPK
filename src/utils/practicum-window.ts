import type { Schedule } from '@/types';

export type PracticumWindowState =
  | { phase: 'before'; minutesUntilStart: number }
  | { phase: 'open'; minutesUntilEnd: number }
  | { phase: 'after' }
  | { phase: 'invalid' };

export type PracticumWindowPhase = PracticumWindowState['phase'];

export function getSessionButtonLabel(
  phase: PracticumWindowPhase,
  startTime: string,
  activeLabel: string,
): string {
  switch (phase) {
    case 'before':
      return `Buka pukul ${startTime}`;
    case 'after':
      return 'Waktu berakhir';
    case 'invalid':
      return 'Jadwal tidak valid';
    default:
      return activeLabel;
  }
}

function timeToMinutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getPracticumWindowState(
  schedule: Pick<Schedule, 'date' | 'startTime' | 'endTime'>,
  now: Date = new Date(),
): PracticumWindowState {
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);

  if (start === null || end === null || end <= start) {
    return { phase: 'invalid' };
  }

  const [year, month, day] = schedule.date.slice(0, 10).split('-').map(Number);

  if (!year || !month || !day) {
    return { phase: 'invalid' };
  }

  const startAt = new Date(year, month - 1, day, 0, start);
  const endAt = new Date(year, month - 1, day, 0, end);

  if (now < startAt) {
    return {
      phase: 'before',
      minutesUntilStart: Math.ceil((startAt.getTime() - now.getTime()) / 60000),
    };
  }

  if (now >= endAt) {
    return { phase: 'after' };
  }

  return {
    phase: 'open',
    minutesUntilEnd: Math.ceil((endAt.getTime() - now.getTime()) / 60000),
  };
}

export function describePracticumWindow(
  schedule: Pick<Schedule, 'date' | 'startTime' | 'endTime'>,
  now: Date = new Date(),
): string {
  const state = getPracticumWindowState(schedule, now);

  switch (state.phase) {
    case 'before':
      return `Belum dibuka. Mulai pukul ${schedule.startTime}.`;
    case 'open':
      return `Sedang berlangsung. Berakhir pukul ${schedule.endTime}.`;
    case 'after':
      return `Waktu praktikum sudah berakhir (${schedule.endTime}).`;
    default:
      return 'Jadwal praktikum tidak valid.';
  }
}
