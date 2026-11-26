import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { FSM_UNDIP_LOCATION } from '@/constants/locations';
import type { Laboratory } from '@/types';
import type { UserLocation } from '@/hooks/use-user-location';

type LaboratoryMapViewProps = {
  laboratories: Laboratory[];
  userLocation: UserLocation | null;
  selectedLabId: string | null;
  onSelectLab: (labId: string) => void;
  onMapClick?: (coords: { latitude: number; longitude: number }) => void;
  editLocation?: { latitude: number; longitude: number } | null;
  editRadius?: number;
  isAssistantMode?: boolean;
};

// Generate standalone interactive HTML for Leaflet
function generateLeafletHtml(
  laboratories: Laboratory[],
  userLocation: UserLocation | null,
  selectedLabId: string | null,
  editLocation?: { latitude: number; longitude: number } | null,
  editRadius?: number,
  isAssistantMode?: boolean,
): string {
  const initialCenter = FSM_UNDIP_LOCATION;
  const initialZoom = 17;
  const serializeForInlineScript = (value: unknown) =>
    JSON.stringify(value).replace(/</g, '\\u003c');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Labora Maps</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #map { width: 100%; height: 100%; background: #E5D7C4; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

    /* User Location Pulsing Dot */
    .user-pulse-container {
      position: relative;
      width: 22px;
      height: 22px;
    }
    .user-pulse-dot {
      width: 18px;
      height: 18px;
      background: #2563EB;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      position: absolute;
      top: 2px;
      left: 2px;
      z-index: 2;
    }
    .user-pulse-ring {
      width: 32px;
      height: 32px;
      border: 2px solid rgba(37, 99, 235, 0.6);
      background: rgba(37, 99, 235, 0.2);
      border-radius: 50%;
      position: absolute;
      top: -5px;
      left: -5px;
      animation: userPulse 2s ease-out infinite;
      z-index: 1;
    }
    @keyframes userPulse {
      0% { transform: scale(0.6); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    /* Lab Marker Pin */
    .lab-marker-pin {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    }
    .lab-marker-badge {
      background: #354024;
      color: #FFFFFF;
      border: 2px solid #E5D7C4;
      border-radius: 20px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      margin-bottom: 2px;
      transition: transform 0.2s;
    }
    .lab-marker-badge.selected {
      background: #C5A880;
      color: #262D1B;
      border-color: #FFFFFF;
      transform: scale(1.08);
      box-shadow: 0 6px 16px rgba(53,64,36,0.45);
    }
    .lab-marker-icon {
      width: 32px;
      height: 32px;
      background: #354024;
      border: 2.5px solid #FDFBF7;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      font-size: 15px;
    }
    .lab-marker-icon.selected {
      background: #889063;
      border-color: #C5A880;
      transform: scale(1.1);
    }

    /* Edit Target Marker */
    .edit-target-pin {
      width: 24px;
      height: 24px;
      background: #DC2626;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      animation: bounce 1.2s infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    /* Recenter Button */
    .recenter-btn {
      position: absolute;
      bottom: 24px;
      right: 18px;
      z-index: 1000;
      background: rgba(253, 251, 247, 0.94);
      border: 1px solid rgba(136, 144, 99, 0.35);
      border-radius: 50px;
      padding: 10px 16px;
      font-size: 12px;
      font-weight: 600;
      color: #354024;
      box-shadow: 0 6px 18px rgba(0,0,0,0.18);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <button class="recenter-btn" onclick="centerOnUser()">
    📍 Lokasi Saya
  </button>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', {
      center: [${initialCenter.latitude}, ${initialCenter.longitude}],
      zoom: ${initialZoom},
      zoomControl: true,
      attributionControl: false
    });

    // OpenStreetMap Tile Layer
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    let labMarkers = {};
    let labCircles = {};
    let userMarker = null;
    let editMarker = null;
    let editCircle = null;

    function emitMessage(data) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(data, '*');
      }
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    // Render Laboratory Markers and Presence Circles (SRS-09, SRS-10, SRS-11)
    function renderLaboratories(labs, selectedId) {
      // Clear existing
      Object.values(labMarkers).forEach(m => map.removeLayer(m));
      Object.values(labCircles).forEach(c => map.removeLayer(c));
      labMarkers = {};
      labCircles = {};

      labs.forEach(lab => {
        const isSelected = lab.id === selectedId;

        // Presence Radius Circle
        const circle = L.circle([lab.latitude, lab.longitude], {
          radius: lab.radius || 50,
          color: isSelected ? '#C5A880' : '#354024',
          weight: isSelected ? 2.5 : 1.5,
          fillColor: isSelected ? '#C5A880' : '#586E37',
          fillOpacity: isSelected ? 0.28 : 0.15,
          dashArray: isSelected ? '4, 4' : null
        }).addTo(map);
        labCircles[lab.id] = circle;

        // Spread collocated lab pins horizontally so every marker remains individually tappable.
        const sameLocation = labs.filter(
          other =>
            other.latitude === lab.latitude &&
            other.longitude === lab.longitude
        );
        const markerWidth = Math.max(72, Math.min(140, lab.name.length * 7 + 20));
        const groupWidths = sameLocation.map(other =>
          Math.max(72, Math.min(140, other.name.length * 7 + 20))
        );
        const totalGroupWidth = groupWidths.reduce((total, width) => total + width + 8, -8);
        const groupIndex = sameLocation.findIndex(other => other.id === lab.id);
        const precedingWidth = groupWidths
          .slice(0, groupIndex)
          .reduce((total, width) => total + width + 8, 0);
        const horizontalOffset =
          precedingWidth + markerWidth / 2 - totalGroupWidth / 2;
        const safeLabName = String(lab.name).replace(/[&<>"']/g, character => {
          switch (character) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            default: return '&#39;';
          }
        });

        // Custom HTML Marker Pin
        const icon = L.divIcon({
          className: 'custom-lab-icon',
          html: \`
            <div class="lab-marker-pin">
              <div class="lab-marker-badge \${isSelected ? 'selected' : ''}">\${safeLabName}</div>
              <div class="lab-marker-icon \${isSelected ? 'selected' : ''}">🏛️</div>
            </div>
          \`,
          iconSize: [markerWidth, 60],
          iconAnchor: [markerWidth / 2 - horizontalOffset, 74]
        });

        const marker = L.marker([lab.latitude, lab.longitude], { icon })
          .addTo(map)
          .on('click', () => {
            emitMessage({ type: 'SELECT_LAB', labId: lab.id });
          });

        labMarkers[lab.id] = marker;
      });
    }

    // User Location Marker (SRS-12)
    function updateUserLocation(loc) {
      if (!loc) return;
      if (!userMarker) {
        const userIcon = L.divIcon({
          className: 'custom-user-icon',
          html: \`
            <div class="user-pulse-container">
              <div class="user-pulse-ring"></div>
              <div class="user-pulse-dot"></div>
            </div>
          \`,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        userMarker = L.marker([loc.latitude, loc.longitude], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      } else {
        userMarker.setLatLng([loc.latitude, loc.longitude]);
      }
    }

    // Edit Target for Assistant (SRS-10)
    function updateEditTarget(location, radius) {
      if (editMarker) map.removeLayer(editMarker);
      if (editCircle) map.removeLayer(editCircle);
      editMarker = null;
      editCircle = null;

      if (!location) return;

      editCircle = L.circle([location.latitude, location.longitude], {
        radius: radius || 50,
        color: '#DC2626',
        weight: 2,
        fillColor: '#EF4444',
        fillOpacity: 0.25,
        dashArray: '6, 6'
      }).addTo(map);

      const targetIcon = L.divIcon({
        className: 'custom-edit-target',
        html: '<div class="edit-target-pin"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      editMarker = L.marker([location.latitude, location.longitude], {
        icon: targetIcon,
        zIndexOffset: 999
      }).addTo(map);
    }

    // Map Click Listener
    map.on('click', function(e) {
      emitMessage({
        type: 'MAP_CLICK',
        latitude: e.latlng.lat,
        longitude: e.latlng.lng
      });
    });

    window.centerOnUser = function() {
      if (userMarker) {
        const latLng = userMarker.getLatLng();
        map.flyTo(latLng, 18, { duration: 1 });
      }
    };

    window.panToLocation = function(lat, lng) {
      map.flyTo([lat, lng], 18, { duration: 1 });
    };

    // Initial render
    const initialLabs = ${serializeForInlineScript(laboratories)};
    const initialUser = ${serializeForInlineScript(userLocation)};
    const initialSelectedId = ${serializeForInlineScript(selectedLabId)};
    const initialEditLoc = ${serializeForInlineScript(editLocation || null)};
    const initialEditRad = ${serializeForInlineScript(editRadius || 30)};

    renderLaboratories(initialLabs, initialSelectedId);
    if (initialUser) updateUserLocation(initialUser);
    if (initialEditLoc) updateEditTarget(initialEditLoc, initialEditRad);

    // Handle messages from React Native / Parent
    window.receiveMapMessage = function(input) {
      let data = input;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) { return; }
      }
      if (!data || !data.type) return;

      if (data.type === 'UPDATE_USER_LOCATION') {
        updateUserLocation(data.location);
      } else if (data.type === 'UPDATE_LABS') {
        renderLaboratories(data.laboratories, data.selectedLabId);
      } else if (data.type === 'UPDATE_EDIT_TARGET') {
        updateEditTarget(data.location, data.radius);
      } else if (data.type === 'FLY_TO') {
        map.flyTo([data.latitude, data.longitude], 18, { duration: 1 });
      }
    };

    window.addEventListener('message', event => window.receiveMapMessage(event.data));
  </script>
</body>
</html>
  `;
}

export function LaboratoryMapView({
  laboratories,
  userLocation,
  selectedLabId,
  onSelectLab,
  onMapClick,
  editLocation,
  editRadius,
  isAssistantMode,
}: LaboratoryMapViewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const webViewRef = useRef<WebView<object>>(null);
  const mapReadyRef = useRef(false);
  const currentPropsRef = useRef({
    laboratories,
    userLocation,
    selectedLabId,
    editLocation,
    editRadius,
  });

  const sendMapMessage = useCallback((message: Record<string, unknown>) => {
    if (!mapReadyRef.current) return;

    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(message, '*');
      return;
    }

    const serialized = JSON.stringify(message);
    webViewRef.current?.injectJavaScript(
      `window.receiveMapMessage?.(${serialized}); true;`,
    );
  }, []);

  const syncMap = useCallback(() => {
    const current = currentPropsRef.current;
    sendMapMessage({
      type: 'UPDATE_LABS',
      laboratories: current.laboratories,
      selectedLabId: current.selectedLabId,
    });
    sendMapMessage({
      type: 'UPDATE_USER_LOCATION',
      location: current.userLocation,
    });
    sendMapMessage({
      type: 'UPDATE_EDIT_TARGET',
      location: current.editLocation,
      radius: current.editRadius,
    });
  }, [sendMapMessage]);

  useEffect(() => {
    currentPropsRef.current = {
      laboratories,
      userLocation,
      selectedLabId,
      editLocation,
      editRadius,
    };
  }, [laboratories, userLocation, selectedLabId, editLocation, editRadius]);

  const handleMapLoad = useCallback(() => {
    mapReadyRef.current = true;
    syncMap();
  }, [syncMap]);

  useEffect(() => {
    sendMapMessage({
      type: 'UPDATE_LABS',
      laboratories,
      selectedLabId,
    });
  }, [laboratories, selectedLabId, sendMapMessage]);

  useEffect(() => {
    sendMapMessage({ type: 'UPDATE_USER_LOCATION', location: userLocation });
  }, [userLocation, sendMapMessage]);

  useEffect(() => {
    sendMapMessage({
      type: 'UPDATE_EDIT_TARGET',
      location: editLocation,
      radius: editRadius,
    });
  }, [editLocation, editRadius, sendMapMessage]);

  // Listen to messages from Leaflet map
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    function handleWindowMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'SELECT_LAB' && typeof data.labId === 'string') {
        onSelectLab(data.labId);
      } else if (data.type === 'MAP_CLICK' && typeof data.latitude === 'number') {
        onMapClick?.({ latitude: data.latitude, longitude: data.longitude });
      }
    }

    window.addEventListener('message', handleWindowMessage);
    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [onSelectLab, onMapClick]);

  const htmlContent = useMemo(
    () =>
      generateLeafletHtml(
        laboratories,
        userLocation,
        selectedLabId,
        editLocation,
        editRadius,
        isAssistantMode,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          onLoad={handleMapLoad}
          style={styles.webIframe}
          title="Laboratory Map"
          loading="lazy"
        />
      </View>
    );
  }

  // Native fallback with react-native-webview
  return (
    <View style={styles.container}>
      <WebView<object>
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.nativeWebView}
        onLoadEnd={handleMapLoad}
        onMessage={(event: { nativeEvent: { data: string } }) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'SELECT_LAB') {
              onSelectLab(data.labId);
            } else if (data.type === 'MAP_CLICK') {
              onMapClick?.({
                latitude: data.latitude,
                longitude: data.longitude,
              });
            }
          } catch (err) {
            console.warn('Failed to parse webview message:', err);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#E5D7C4',
    overflow: 'hidden',
  },
  webIframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  } as any,
  nativeWebView: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#E5D7C4',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
