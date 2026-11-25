import { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type UserLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const webWatchIdRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function startLocationTracking() {
      try {
        if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
          // Web geolocation handling
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isMounted) return;
              setPermissionGranted(true);
              setIsTracking(true);
              setErrorMsg(null);
              setUserLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            },
            (err) => {
              if (!isMounted) return;
              console.warn('Geolocation warning on web:', err.message);
              setPermissionGranted(false);
              setIsTracking(false);
              setUserLocation(null);
              setErrorMsg('Izin lokasi ditolak atau GPS tidak aktif.');
            },
            { enableHighAccuracy: true, timeout: 10000 },
          );

          // Watch live position updates on web
          webWatchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              if (!isMounted) return;
              setPermissionGranted(true);
              setIsTracking(true);
              setErrorMsg(null);
              setUserLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
            },
            (err) => {
              console.warn('watchPosition error on web:', err.message);
            },
            { enableHighAccuracy: true, maximumAge: 1000 },
          );
          return;
        }

        // Native (iOS / Android) via expo-location
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;

        if (status !== 'granted') {
          setPermissionGranted(false);
          setErrorMsg('Izin lokasi perangkat tidak diberikan.');
          setUserLocation(null);
          return;
        }

        setPermissionGranted(true);
        setIsTracking(true);

        // Get initial location
        const initialLoc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (isMounted) {
          setUserLocation({
            latitude: initialLoc.coords.latitude,
            longitude: initialLoc.coords.longitude,
            accuracy: initialLoc.coords.accuracy ?? undefined,
          });
        }

        // Watch live position changes
        subscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 1,
          },
          (newLoc) => {
            if (!isMounted) return;
            setUserLocation({
              latitude: newLoc.coords.latitude,
              longitude: newLoc.coords.longitude,
              accuracy: newLoc.coords.accuracy ?? undefined,
            });
          },
        );
      } catch (err) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Gagal mengakses GPS perangkat';
        setPermissionGranted(false);
        setIsTracking(false);
        setErrorMsg(msg);
        setUserLocation(null);
      }
    }

    startLocationTracking();

    return () => {
      isMounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      if (webWatchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(webWatchIdRef.current);
        webWatchIdRef.current = null;
      }
    };
  }, []);

  return {
    userLocation,
    permissionGranted,
    errorMsg,
    isTracking,
  };
}
