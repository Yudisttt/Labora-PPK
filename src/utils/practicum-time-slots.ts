import type { Schedule } from '@/types';

export type PracticumTimeSlot = {
  startTime: string;
  endTime: string;
};

const SESSION_DURATION_MINUTES = 100;

const OPERATING_WINDOWS = [
  { label: 'Pagi', startTime: '07:40', endTime: '11:40' },
  { label: 'Siang', startTime: '13:00', endTime: '17:40' },
  { label: 'Malam', startTime: '18:10', endTime: '19:50' },
] as const;

function timeToMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export const PRACTICUM_TIME_GROUPS = OPERATING_WINDOWS.map((window) => {
  const windowStart = timeToMinutes(window.startTime);
  const windowEnd = timeToMinutes(window.endTime);

  if (windowStart === null || windowEnd === null) {
    throw new Error(`Jam operasional tidak valid: ${window.label}`);
  }

  const slots: PracticumTimeSlot[] = [];

  for (
    let start = windowStart;
    start + SESSION_DURATION_MINUTES <= windowEnd;
    start += SESSION_DURATION_MINUTES
  ) {
    slots.push({
      startTime: minutesToTime(start),
      endTime: minutesToTime(start + SESSION_DURATION_MINUTES),
    });
  }

  return { label: window.label, slots };
});

export const PRACTICUM_TIME_SLOTS = PRACTICUM_TIME_GROUPS.flatMap(
  (group) => group.slots,
);

type ExistingSchedule = Pick<
  Schedule,
  'id' | 'date' | 'ruang' | 'startTime' | 'endTime' | 'status'
>;

export function hasPracticumTimeConflict(
  room: string,
  date: string,
  slot: PracticumTimeSlot,
  schedules: ExistingSchedule[],
  excludedScheduleId?: string | null,
) {
  const normalizedRoom = room.trim().replace(/\s+/g, ' ').toLowerCase();
  const slotStart = timeToMinutes(slot.startTime);
  const slotEnd = timeToMinutes(slot.endTime);

  if (!normalizedRoom || !date || slotStart === null || slotEnd === null) {
    return false;
  }

  return schedules.some((schedule) => {
    if (
      schedule.id === excludedScheduleId ||
      schedule.status === 'cancelled' ||
      schedule.status === 'rescheduled' ||
      schedule.date !== date ||
      schedule.ruang.trim().replace(/\s+/g, ' ').toLowerCase() !== normalizedRoom
    ) {
      return false;
    }

    const existingStart = timeToMinutes(schedule.startTime);
    const existingEnd = timeToMinutes(schedule.endTime);

    if (existingStart === null || existingEnd === null) {
      return true;
    }

    return slotStart < existingEnd && existingStart < slotEnd;
  });
}
