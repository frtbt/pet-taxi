/**
 * Active Trip Screen
 * — Driver: sends GPS, shows route, start/finish
 * — Owner:  tracks driver's live location on map
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Alert, ActivityIndicator, ScrollView, Linking, Platform,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import taxiApi from '../src/api/taxiClient';
import { useAuth } from '../src/context/AuthContext';
import Colors from '../src/theme/colors';

const GPS_INTERVAL   = 5000;
const TRACK_INTERVAL = 5000;

export default function ActiveTripScreen() {
    const { match_id, talep_id } = useLocalSearchParams();
    const matchId = Number(match_id);
    const talepId = Number(talep_id) || null;
    const router  = useRouter();
    const { isDriver } = useAuth();
    const mapRef  = useRef(null);

    const [detail, setDetail]         = useState(null);
    const [loading, setLoading]       = useState(true);
    const [tripStatus, setTripStatus] = useState(null);
    const [myLoc, setMyLoc]           = useState(null);
    const [driverLoc, setDriverLoc]   = useState(null);
    const [totalKm, setTotalKm]       = useState(0);
    const [elapsed, setElapsed]       = useState(0);
    const [actionLoading, setActionLoading] = useState(false);

    const gpsRef     = useRef(null);
    const timerRef   = useRef(null);
    const trackRef   = useRef(null);
    const lastLocRef = useRef(null);

    // ── Load detail ────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            if (isDriver) {
                const res = await taxiApi.getMyJobs();
                const job = (res.jobs ?? []).find(j => j.id === matchId);
                if (job) { setDetail(job); setTripStatus(job.durum); }
            } else {
                const res = talepId ? await taxiApi.getRequestDetail(talepId) : null;
                if (res?.success) {
                    const t = res.request;
                    setDetail({
                        baslangic_noktasi: t.baslangic_noktasi,
                        baslangic_ilce:    t.baslangic_ilce,
                        baslangic_sehir:   t.baslangic_sehir,
                        baslangic_lat:     t.baslangic_lat,
                        baslangic_lon:     t.baslangic_lon,
                        varis_noktasi:     t.varis_noktasi,
                        varis_ilce:        t.varis_ilce,
                        varis_sehir:       t.varis_sehir,
                        varis_lat:         t.varis_lat,
                        varis_lon:         t.varis_lon,
                        kopek_adi:         t.kopek_adi,
                        sahip_adi:         t.sahip_adi,
                        surucu_adi:        t.surucu_adi,
                        toplam_ucret:      t.toplam_ucret,
                    });
                    setTripStatus(t.match_durum ?? t.durum);
                }
            }
            setLoading(false);
        })();
    }, [matchId, talepId, isDriver]);

    // ── GPS (driver) ───────────────────────────────────────────────
    const startGPS = useCallback(async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Konum İzni', 'GPS takibi için konum izni gereklidir.');
            return;
        }
        gpsRef.current = setInterval(async () => {
            try {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                const { latitude, longitude, speed } = loc.coords;
                setMyLoc({ latitude, longitude });

                if (lastLocRef.current) {
                    const km = haversine(lastLocRef.current.latitude, lastLocRef.current.longitude, latitude, longitude);
                    setTotalKm(prev => prev + km);
                }
                lastLocRef.current = { latitude, longitude };
                await taxiApi.updateLocation(matchId, latitude, longitude, speed ? speed * 3.6 : null);

                mapRef.current?.animateToRegion({
                    latitude, longitude,
                    latitudeDelta: 0.015, longitudeDelta: 0.015,
                }, 800);
            } catch (_) {}
        }, GPS_INTERVAL);
    }, [matchId]);

    const startTimer = useCallback(() => {
        timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    }, []);

    // ── Live location tracking (owner) ─────────────────────────────
    const startTracking = useCallback(async () => {
        const fetch = async () => {
            const res = await taxiApi.getLiveLocation(matchId);
            if (res.success && res.location) {
                const loc = {
                    latitude:  Number(res.location.lat),
                    longitude: Number(res.location.lon),
                };
                setDriverLoc(loc);
                mapRef.current?.animateToRegion({
                    ...loc,
                    latitudeDelta: 0.015,
                    longitudeDelta: 0.015,
                }, 800);
            }
        };
        await fetch();
        trackRef.current = setInterval(fetch, TRACK_INTERVAL);
    }, [matchId]);

    // ── Cleanup ────────────────────────────────────────────────────
    useEffect(() => () => {
        clearInterval(gpsRef.current);
        clearInterval(timerRef.current);
        clearInterval(trackRef.current);
    }, []);

    // ── Start based on tripStatus ──────────────────────────────────
    useEffect(() => {
        if (tripStatus === 'devam_ediyor') {
            if (isDriver) { startGPS(); startTimer(); }
            else          { startTracking(); }
        }
    }, [tripStatus, isDriver]);

    // ── Fit map on initial load ────────────────────────────────────
    useEffect(() => {
        if (!detail) return;
        const coords = [];
        if (detail.baslangic_lat && detail.baslangic_lon)
            coords.push({ latitude: +detail.baslangic_lat, longitude: +detail.baslangic_lon });
        if (detail.varis_lat && detail.varis_lon)
            coords.push({ latitude: +detail.varis_lat, longitude: +detail.varis_lon });
        if (coords.length >= 2) {
            setTimeout(() => mapRef.current?.fitToCoordinates(coords, {
                edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
                animated: true,
            }), 500);
        }
    }, [detail]);

    // ── Action handlers ────────────────────────────────────────────
    async function handleStartTrip() {
        Alert.alert('Yolculuğu Başlat', 'Köpeği aldınız mı?', [
            { text: 'Hayır', style: 'cancel' },
            {
                text: 'Evet, Başlat',
                onPress: async () => {
                    setActionLoading(true);
                    const res = await taxiApi.startTrip(matchId);
                    setActionLoading(false);
                    if (res.success) {
                        setTripStatus('devam_ediyor');
                        startGPS(); startTimer();
                    } else {
                        Alert.alert('Hata', res.error ?? 'Yolculuk başlatılamadı.');
                    }
                },
            },
        ]);
    }

    async function handleFinishTrip() {
        Alert.alert('Yolculuğu Tamamla', `Hedefe ulaştınız mı?\nToplam: ${totalKm.toFixed(2)} km`, [
            { text: 'Hayır', style: 'cancel' },
            {
                text: 'Evet, Tamamla',
                style: 'destructive',
                onPress: async () => {
                    clearInterval(gpsRef.current);
                    clearInterval(timerRef.current);
                    setActionLoading(true);
                    const res = await taxiApi.finishTrip(matchId, parseFloat(totalKm.toFixed(2)));
                    setActionLoading(false);
                    if (res.success) {
                        setTripStatus('tamamlandi');
                        Alert.alert(
                            'Yolculuk Tamamlandı! 🎉',
                            `Toplam: ${totalKm.toFixed(2)} km\nÖdeme cüzdanınıza eklendi.`,
                            [{ text: 'Ana Sayfaya Git', onPress: () => router.replace('/(tabs)') }]
                        );
                    } else {
                        Alert.alert('Hata', res.error ?? 'Tamamlanamadı.');
                    }
                },
            },
        ]);
    }

    function openNavigation() {
        if (!detail) return;

        const isStarted = tripStatus === 'devam_ediyor';
        const destLat = isStarted ? (detail.varis_lat || null)     : (detail.baslangic_lat || null);
        const destLon = isStarted ? (detail.varis_lon || null)     : (detail.baslangic_lon || null);
        const destName = isStarted
            ? `${detail.varis_noktasi}, ${detail.varis_ilce}`
            : `${detail.baslangic_noktasi}, ${detail.baslangic_ilce}`;

        if (!destLat || !destLon) {
            Alert.alert('Koordinat Yok', 'Bu talep için GPS koordinatı bulunamadı. Adresle yönlendiriliyor...');
        }

        const coordStr    = destLat ? `${destLat},${destLon}` : encodeURIComponent(destName);
        const encodedName = encodeURIComponent(destName);

        const apps = [
            {
                label: 'Google Maps',
                url: `https://www.google.com/maps/dir/?api=1&destination=${coordStr}&travelmode=driving`,
            },
            {
                label: 'Yandex Maps',
                url: destLat
                    ? `yandexmaps://maps.yandex.ru/?rtext=~${destLat},${destLon}&rtt=auto`
                    : `https://yandex.com.tr/maps/?text=${encodedName}`,
            },
            {
                label: 'Waze',
                url: destLat
                    ? `https://waze.com/ul?ll=${destLat},${destLon}&navigate=yes`
                    : `https://waze.com/ul?q=${encodedName}&navigate=yes`,
            },
            ...(Platform.OS === 'ios' ? [{
                label: 'Apple Maps',
                url: `maps://?daddr=${coordStr}`,
            }] : []),
        ];

        Alert.alert(
            isStarted ? '🏁 Hedefe Yönlendir' : '📍 Alış Noktasına Git',
            `Hedef: ${destName}`,
            [
                ...apps.map(app => ({
                    text: app.label,
                    onPress: () => Linking.openURL(app.url).catch(() =>
                        Alert.alert('Hata', `${app.label} açılamadı.`)
                    ),
                })),
                { text: 'İptal', style: 'cancel' },
            ]
        );
    }

    // ── Loading / error ────────────────────────────────────────────
    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    }
    if (!detail) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.errorText}>Yolculuk bulunamadı.</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>Geri Dön</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const isActive = tripStatus === 'devam_ediyor';
    const isDone   = tripStatus === 'tamamlandi';

    const startCoord = detail.baslangic_lat
        ? { latitude: +detail.baslangic_lat, longitude: +detail.baslangic_lon }
        : null;
    const endCoord = detail.varis_lat
        ? { latitude: +detail.varis_lat, longitude: +detail.varis_lon }
        : null;

    const polylineCoords = [
        ...(myLoc || driverLoc ? [myLoc || driverLoc] : []),
        ...(startCoord ? [startCoord] : []),
        ...(endCoord   ? [endCoord]   : []),
    ].filter(Boolean);

    const initialRegion = startCoord
        ? { ...startCoord, latitudeDelta: 0.05, longitudeDelta: 0.05 }
        : { latitude: 41.0082, longitude: 28.9784, latitudeDelta: 0.1, longitudeDelta: 0.1 };

    return (
        <View style={styles.root}>
            {/* ── Map ── */}
            <View style={styles.mapContainer}>
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    provider={PROVIDER_GOOGLE}
                    initialRegion={initialRegion}
                    showsUserLocation={isDriver}
                    showsMyLocationButton={false}
                >
                    {startCoord && (
                        <Marker coordinate={startCoord} title="Alış" description={detail.baslangic_noktasi}>
                            <View style={styles.markerStart}>
                                <Ionicons name="location" size={22} color="#fff" />
                            </View>
                        </Marker>
                    )}

                    {endCoord && (
                        <Marker coordinate={endCoord} title="Varış" description={detail.varis_noktasi}>
                            <View style={styles.markerEnd}>
                                <Ionicons name="flag" size={18} color="#fff" />
                            </View>
                        </Marker>
                    )}

                    {!isDriver && driverLoc && (
                        <Marker coordinate={driverLoc} title="Sürücü">
                            <View style={styles.markerDriver}>
                                <Ionicons name="car" size={16} color={Colors.darker} />
                            </View>
                        </Marker>
                    )}

                    {polylineCoords.length >= 2 && (
                        <Polyline
                            coordinates={polylineCoords}
                            strokeColor={Colors.primary}
                            strokeWidth={3}
                            lineDashPattern={[8, 4]}
                        />
                    )}
                </MapView>

                {/* Navigation button (driver only) */}
                {isDriver && (
                    <TouchableOpacity style={styles.openMapsBtn} onPress={openNavigation} activeOpacity={0.85}>
                        <Ionicons name="navigate" size={16} color={Colors.darker} />
                        <Text style={styles.openMapsText}>
                            {tripStatus === 'devam_ediyor' ? 'Hedefe Git' : 'Alış Noktasına Git'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ── Status Banner ── */}
            <View style={[styles.statusBar, {
                backgroundColor: isDone ? Colors.success : isActive ? '#7c3aed' : Colors.card,
            }]}>
                <View>
                    <Text style={[styles.statusTitle, !isDone && !isActive && { color: Colors.text }]}>
                        {isDone ? '✅ Tamamlandı'
                            : isActive ? (isDriver ? '🚕 Yolculuk Devam Ediyor' : '🚕 Sürücü Yolda')
                            : '⏳ Başlamayı Bekliyor'}
                    </Text>
                    {isActive && isDriver && (
                        <Text style={styles.statusSub}>
                            {formatTime(elapsed)} · {totalKm.toFixed(2)} km
                        </Text>
                    )}
                </View>
            </View>

            {/* ── Detail cards ── */}
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                {/* Route */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Güzergah</Text>
                    <View style={styles.routeRow}>
                        <View style={[styles.dot, { backgroundColor: Colors.success }]} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.routeLabel}>ALIŞ</Text>
                            <Text style={styles.routeMain}>{detail.baslangic_ilce}, {detail.baslangic_sehir}</Text>
                            <Text style={styles.routeSub} numberOfLines={2}>{detail.baslangic_noktasi}</Text>
                        </View>
                    </View>
                    <View style={styles.routeDivider} />
                    <View style={styles.routeRow}>
                        <View style={[styles.dot, { backgroundColor: Colors.danger }]} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.routeLabel}>BIRAKIŞ</Text>
                            <Text style={styles.routeMain}>{detail.varis_ilce}, {detail.varis_sehir}</Text>
                            <Text style={styles.routeSub} numberOfLines={2}>{detail.varis_noktasi}</Text>
                        </View>
                    </View>
                </View>

                {/* Info */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{isDriver ? 'Yolcu Bilgisi' : 'Sürücü Bilgisi'}</Text>
                    {isDriver
                        ? <InfoRow icon="person"  label="Sahip"  value={detail.sahip_adi} />
                        : <InfoRow icon="car"     label="Sürücü" value={detail.surucu_adi ?? '-'} />
                    }
                    <InfoRow icon="paw"    label="Köpek"  value={detail.kopek_adi} />
                    <InfoRow icon="wallet" label="Ücret"  value={`${Number(detail.toplam_ucret).toLocaleString('tr-TR')} ₺`} highlight />
                </View>
            </ScrollView>

            {/* ── Action buttons (driver only) ── */}
            {isDriver && !isDone && (
                <View style={styles.actionBar}>
                    {tripStatus === 'kabul_edildi' && (
                        <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={handleStartTrip}
                            disabled={actionLoading}
                            activeOpacity={0.85}
                        >
                            {actionLoading
                                ? <ActivityIndicator color={Colors.darker} />
                                : <>
                                    <Ionicons name="rocket" size={20} color={Colors.darker} />
                                    <Text style={styles.actionBtnText}>Yolculuğu Başlat</Text>
                                </>
                            }
                        </TouchableOpacity>
                    )}
                    {tripStatus === 'devam_ediyor' && (
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: Colors.success }]}
                            onPress={handleFinishTrip}
                            disabled={actionLoading}
                            activeOpacity={0.85}
                        >
                            {actionLoading
                                ? <ActivityIndicator color="#fff" />
                                : <>
                                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                                    <Text style={[styles.actionBtnText, { color: '#fff' }]}>Hedefe Ulaştı</Text>
                                </>
                            }
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
}

function InfoRow({ icon, label, value, highlight }) {
    return (
        <View style={styles.infoRow}>
            <Ionicons name={`${icon}-outline`} size={16} color={Colors.textMuted} />
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={[styles.infoValue, highlight && { color: Colors.primary, fontWeight: '800' }]}>{value}</Text>
        </View>
    );
}

function formatTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const styles = StyleSheet.create({
    root:   { flex: 1, backgroundColor: Colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, gap: 12 },
    errorText: { color: Colors.textMuted, fontSize: 15 },
    backBtn:   { backgroundColor: Colors.card, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
    backBtnText: { color: Colors.primary, fontWeight: '700' },

    mapContainer: { height: 280, position: 'relative' },
    map:          { flex: 1 },

    markerStart:  { backgroundColor: Colors.success, borderRadius: 20, padding: 6, borderWidth: 2, borderColor: '#fff' },
    markerEnd:    { backgroundColor: Colors.danger,  borderRadius: 20, padding: 7, borderWidth: 2, borderColor: '#fff' },
    markerDriver: { backgroundColor: Colors.primary, borderRadius: 20, padding: 7, borderWidth: 2, borderColor: '#fff' },

    openMapsBtn: {
        position: 'absolute', bottom: 12, right: 12,
        backgroundColor: Colors.primary, borderRadius: 20,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8,
        elevation: 4,
    },
    openMapsText: { color: Colors.darker, fontWeight: '700', fontSize: 13 },

    statusBar:   { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    statusTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
    statusSub:   { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

    scroll:        { flex: 1 },
    scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },

    card:      { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 10 },
    cardTitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

    routeRow:    { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    dot:         { width: 12, height: 12, borderRadius: 6, marginTop: 4, flexShrink: 0 },
    routeLabel:  { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
    routeMain:   { color: Colors.text, fontSize: 14, fontWeight: '700' },
    routeSub:    { color: Colors.textMuted, fontSize: 12 },
    routeDivider:{ height: 1, backgroundColor: Colors.border, marginLeft: 24 },

    infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
    infoLabel: { color: Colors.textMuted, fontSize: 13, flex: 1 },
    infoValue: { color: Colors.text, fontSize: 13, fontWeight: '600' },

    actionBar:     { padding: 16, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border },
    actionBtn:     { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
    actionBtnText: { color: Colors.darker, fontWeight: '800', fontSize: 16 },
});
