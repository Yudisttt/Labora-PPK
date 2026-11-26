import * as Location from 'expo-location';

export type AttendanceLocationResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      accuracy: number | null;
    }
  | {
      ok: false;
      reason: 'permission-denied' | 'services-disabled' | 'coordinates-unavailable';
      canAskAgain?: boolean;
    };

export async function getAttendanceLocation(): Promise<AttendanceLocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return {
        ok: false,
        reason: 'permission-denied',
        canAskAgain: permission.canAskAgain,
      };
    }

    if (!(await Location.hasServicesEnabledAsync())) {
      return { ok: false, reason: 'services-disabled' };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
    });
    const { latitude, longitude } = position.coords;
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) {
      return { ok: false, reason: 'coordinates-unavailable' };
    }

    return { ok: true, latitude, longitude, accuracy: position.coords.accuracy };
  } catch {
    return { ok: false, reason: 'coordinates-unavailable' };
  }
}
