import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { colors, radius } from '@/src/theme';

export interface PickedPlace {
  latitude: number;
  longitude: number;
  address: string;
}

// Interactive OpenStreetMap picker rendered inside a WebView (works in Expo
// Go — no native map SDK needed). Tap or drag the pin to choose a spot;
// "My location" centres on the device GPS. The chosen point is
// reverse-geocoded (expo-location) to pre-fill the address text.
const HYDERABAD = { lat: 17.385, lng: 78.4867 };

function leafletHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0}</style>
</head><body><div id="map"></div><script>
  var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  var marker = L.marker([${lat}, ${lng}], { draggable: true }).addTo(map);
  function send(ll){
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ lat: ll.lat, lng: ll.lng }));
  }
  marker.on('dragend', function(){ send(marker.getLatLng()); });
  map.on('click', function(e){ marker.setLatLng(e.latlng); send(e.latlng); });
  window.setMarker = function(la, ln){
    marker.setLatLng([la, ln]); map.setView([la, ln], 16); send({ lat: la, lng: ln });
  };
  send(marker.getLatLng());
</script></body></html>`;
}

export default function MapPicker({
  visible,
  initial,
  onClose,
  onPick,
}: {
  visible: boolean;
  initial?: { latitude?: number | null; longitude?: number | null } | null;
  onClose: () => void;
  onPick: (place: PickedPlace) => void;
}) {
  const { t } = useTranslation();
  const webRef = useRef<WebView>(null);
  const start = useMemo(
    () => ({
      lat: initial?.latitude ?? HYDERABAD.lat,
      lng: initial?.longitude ?? HYDERABAD.lng,
    }),
    // only when the sheet (re)opens
    [visible], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [coords, setCoords] = useState<{ lat: number; lng: number }>(start);
  const [address, setAddress] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setCoords(start);
      setAddress('');
      setMapReady(false);
    }
  }, [visible, start]);

  const reverseGeocode = async (lat: number, lng: number) => {
    setGeoBusy(true);
    try {
      const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const r = rev?.[0];
      setAddress(
        r
          ? [r.name, r.street, r.district, r.city, r.region, r.postalCode].filter(Boolean).join(', ')
          : `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      );
    } catch {
      setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      setGeoBusy(false);
    }
  };

  const onMessage = (e: any) => {
    try {
      const { lat, lng } = JSON.parse(e.nativeEvent.data);
      if (typeof lat === 'number' && typeof lng === 'number') {
        setMapReady(true);
        setCoords({ lat, lng });
        reverseGeocode(lat, lng);
      }
    } catch {
      /* ignore malformed */
    }
  };

  const useMyLocation = async () => {
    setLocBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      webRef.current?.injectJavaScript(`window.setMarker(${latitude}, ${longitude}); true;`);
    } catch {
      /* no-op */
    } finally {
      setLocBusy(false);
    }
  };

  const confirm = () => {
    onPick({
      latitude: coords.lat,
      longitude: coords.lng,
      address: address || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible && (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.iconBtn} testID="map-close">
            <Ionicons name="close" size={22} color={colors.gray700} />
          </Pressable>
          <Text style={styles.title}>{t('book.mapTitle')}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html: leafletHtml(start.lat, start.lng) }}
            onMessage={onMessage}
            style={{ flex: 1 }}
            javaScriptEnabled
            domStorageEnabled
          />
          {!mapReady && (
            <View style={styles.mapLoading} pointerEvents="none">
              <ActivityIndicator color={colors.orange} />
            </View>
          )}
          <Pressable onPress={useMyLocation} style={styles.myLoc} testID="map-my-location">
            {locBusy ? (
              <ActivityIndicator size="small" color={colors.orange} />
            ) : (
              <Ionicons name="locate" size={18} color={colors.orange} />
            )}
            <Text style={styles.myLocText}>{t('book.myLocation')}</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.addrLabel}>{t('book.selectedLocation')}</Text>
          <View style={styles.addrRow}>
            {geoBusy && <ActivityIndicator size="small" color={colors.gray400} />}
            <Text style={styles.addr} numberOfLines={2}>
              {address || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`}
            </Text>
          </View>
          <Pressable onPress={confirm} style={styles.cta} testID="map-confirm">
            <Text style={styles.ctaText}>{t('book.useThisLocation')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.gray100 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  title: { fontSize: 16, fontWeight: '800', color: colors.navy },
  mapLoading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)' },
  myLoc: { position: 'absolute', right: 14, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: colors.gray200, elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  myLocText: { fontSize: 12, fontWeight: '800', color: colors.orange },
  footer: { padding: 16, borderTopWidth: 1, borderColor: colors.gray100, gap: 8 },
  addrLabel: { fontSize: 11, fontWeight: '800', color: colors.gray400, letterSpacing: 0.6 },
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 },
  addr: { flex: 1, fontSize: 13, color: colors.gray800, fontWeight: '600' },
  cta: { backgroundColor: colors.orange, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
