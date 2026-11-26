import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  deleteDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import { getFirebaseDb } from '@/services/firebase';
import { ACINTYA_PRASADA_LOCATION, FSM_UNDIP_LOCATION } from '@/constants/locations';
import type { Laboratory } from '@/types';

export const DEFAULT_LABORATORIES: Omit<Laboratory, 'id'>[] = [
  {
    name: 'Lab Komputer A',
    ...ACINTYA_PRASADA_LOCATION,
    radius: 30,
    description: 'Gedung Acintya Prasada FSM UNDIP, Tembalang',
  },
  {
    name: 'Lab B',
    ...FSM_UNDIP_LOCATION,
    radius: 30,
    description: 'Gedung E FSM UNDIP, Tembalang',
  },
  {
    name: 'Lab C',
    ...FSM_UNDIP_LOCATION,
    radius: 30,
    description: 'Gedung E FSM UNDIP, Tembalang',
  },
  {
    name: 'Lab D',
    ...FSM_UNDIP_LOCATION,
    radius: 30,
    description: 'Gedung E FSM UNDIP, Tembalang',
  },
  {
    name: 'Lab Jaringan',
    ...ACINTYA_PRASADA_LOCATION,
    radius: 30,
    description: 'Gedung Acintya Prasada FSM UNDIP, Tembalang',
  },
];

const LEGACY_LAB_NAMES: Record<string, number> = {
  'lab komputer a': 0,
  'lab komputer b': 1,
  'lab komputer c': 2,
  'lab multimedia': 3,
  'lab jaringan': 4,
  'lab b': 1,
  'lab c': 2,
  'lab d': 3,
};

const LEGACY_DEFAULT_IDS: Record<string, number> = {
  'lab-1': 0,
  'lab-2': 1,
  'lab-3': 2,
  'lab-4': 3,
  'lab-5': 4,
};

const DEFAULT_LAB_IDS = [
  'fsm-default-lab-acintya',
  'fsm-default-lab-b',
  'fsm-default-lab-c',
  'fsm-default-lab-d',
  'fsm-default-lab-jaringan',
];

const LEGACY_TELKOM_BOUNDS = {
  minLatitude: -6.98,
  maxLatitude: -6.96,
  minLongitude: 107.62,
  maxLongitude: 107.64,
};

function parseLaboratory(id: string, data: Record<string, unknown>): Laboratory | null {
  if (
    typeof data.name !== 'string' ||
    typeof data.latitude !== 'number' ||
    typeof data.longitude !== 'number' ||
    typeof data.radius !== 'number'
  ) {
    return null;
  }

  return {
    id,
    name: data.name,
    latitude: data.latitude,
    longitude: data.longitude,
    radius: data.radius,
    description: typeof data.description === 'string' ? data.description : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

function normalizeLabName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\./g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Nama jadwal bisa ditulis "Laboratorium D", "Lab D", atau "Lab Komputer A".
// Inti nama membuang awalan ruang agar keduanya bisa dibandingkan setara.
function labCoreName(name: string): string {
  let core = normalizeLabName(name);
  const prefix = /^(laboratorium|ruang praktikum|ruang|lab)\s+/;
  while (prefix.test(core)) {
    core = core.replace(prefix, '');
  }
  return core;
}

function getDefaultLaboratories(): Laboratory[] {
  return DEFAULT_LABORATORIES.map((lab, index) => ({
    ...lab,
    id: `default-lab-${index + 1}`,
  }));
}

const LAB_CORE_ALIASES: Record<string, string[]> = {
  a: ['komputer a'],
  'komputer a': ['a'],
  b: ['komputer b'],
  'komputer b': ['b'],
  c: ['komputer c'],
  'komputer c': ['c'],
  d: ['multimedia'],
  multimedia: ['d'],
};

export function resolveLaboratoryForRoom(
  laboratories: Laboratory[],
  roomName: string,
): Laboratory | null {
  const targetCore = labCoreName(roomName);
  if (!targetCore) return null;

  const acceptedCores = new Set([
    targetCore,
    ...(LAB_CORE_ALIASES[targetCore] ?? []),
  ]);

  return laboratories.find((lab) => acceptedCores.has(labCoreName(lab.name))) ?? null;
}

export async function fetchLaboratories(): Promise<Laboratory[]> {
  const snapshot = await getDocs(collection(getFirebaseDb(), 'laboratories'));
  const labs = snapshot.docs
    .map((item) => parseLaboratory(item.id, item.data()))
    .filter((item): item is Laboratory => item !== null);

  return labs.length > 0 ? labs : getDefaultLaboratories();
}

export function subscribeLaboratories(
  callback: (laboratories: Laboratory[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseDb();
  const labsCollection = collection(db, 'laboratories');

  return onSnapshot(
    labsCollection,
    (snapshot) => {
      if (snapshot.empty) {
        callback(getDefaultLaboratories());
        return;
      }

      const labs: Laboratory[] = [];
      snapshot.forEach((docSnap) => {
        const parsed = parseLaboratory(docSnap.id, docSnap.data());
        if (parsed) {
          labs.push(parsed);
        } else {
          console.warn(`Data laboratorium ${docSnap.id} tidak valid dan tidak ditampilkan.`);
        }
      });

      if (labs.length === 0) {
        console.warn('Tidak ada data laboratorium valid; lokasi default akan ditampilkan.');
        callback(getDefaultLaboratories());
        return;
      }

      labs.sort((a, b) => a.name.localeCompare(b.name));
      callback(labs);
    },
    (error) => {
      console.warn('Gagal berlangganan data laboratorium:', error);
      callback(getDefaultLaboratories());
      onError?.(error);
    },
  );
}

function isLegacyTelkomLocation(data: Record<string, unknown>): boolean {
  return (
    typeof data.latitude === 'number' &&
    typeof data.longitude === 'number' &&
    data.latitude >= LEGACY_TELKOM_BOUNDS.minLatitude &&
    data.latitude <= LEGACY_TELKOM_BOUNDS.maxLatitude &&
    data.longitude >= LEGACY_TELKOM_BOUNDS.minLongitude &&
    data.longitude <= LEGACY_TELKOM_BOUNDS.maxLongitude
  );
}

export async function migrateAndSeedLaboratories(): Promise<void> {
  const db = getFirebaseDb();
  const labsCollection = collection(db, 'laboratories');
  const snapshot = await getDocs(labsCollection);

  if (snapshot.empty) {
    for (const [index, lab] of DEFAULT_LABORATORIES.entries()) {
      const docId = `lab-${index + 1}`;
      await setDoc(doc(db, 'laboratories', docId), {
        ...lab,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  const existingTargetLabs = new Set<string>();

  for (const labSnapshot of snapshot.docs) {
    const data = labSnapshot.data();
    const name = typeof data.name === 'string' ? normalizeLabName(data.name) : '';
    const defaultIndex = LEGACY_DEFAULT_IDS[labSnapshot.id] ?? LEGACY_LAB_NAMES[name];
    const legacyLocation = isLegacyTelkomLocation(data);
    const parsedLaboratory = parseLaboratory(labSnapshot.id, data);

    if (defaultIndex !== undefined && (!parsedLaboratory || legacyLocation)) {
      const target = DEFAULT_LABORATORIES[defaultIndex];
      await setDoc(
        labSnapshot.ref,
        {
          ...target,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      existingTargetLabs.add(normalizeLabName(target.name));
      continue;
    }

    if (name && parsedLaboratory) {
      existingTargetLabs.add(name);
    }
  }

  for (const [index, lab] of DEFAULT_LABORATORIES.entries()) {
    const targetName = normalizeLabName(lab.name);
    const legacyName = Object.entries(LEGACY_LAB_NAMES).find(
      ([, defaultIndex]) => defaultIndex === index,
    )?.[0];
    if (existingTargetLabs.has(targetName) || (legacyName && existingTargetLabs.has(legacyName))) {
      continue;
    }

    const canonicalId = DEFAULT_LAB_IDS[index];
    if (!snapshot.docs.some((labSnapshot) => labSnapshot.id === canonicalId)) {
      await setDoc(doc(db, 'laboratories', canonicalId), {
        ...lab,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

export async function saveLaboratory(
  data: {
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    description?: string;
  },
  id?: string,
): Promise<string> {
  const db = getFirebaseDb();
  const name = data.name.trim();
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  const radius = Number(data.radius);

  if (
    !name ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(radius) ||
    radius <= 0
  ) {
    throw new Error('Data laboratorium tidak valid.');
  }

  const labId = id && !id.startsWith('default-lab-')
    ? id
    : `lab-${Date.now()}`;

  const payload: Record<string, unknown> = {
    name,
    latitude,
    longitude,
    radius,
    updatedAt: new Date().toISOString(),
  };

  if (data.description !== undefined) {
    payload.description = data.description.trim();
  }

  await setDoc(doc(db, 'laboratories', labId), payload, { merge: true });
  return labId;
}

export async function deleteLaboratory(id: string): Promise<void> {
  const db = getFirebaseDb();
  await deleteDoc(doc(db, 'laboratories', id));
}

/**
 * Calculates distance between two coordinates in meters using Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
