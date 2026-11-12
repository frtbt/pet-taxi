import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Alert, ActivityIndicator, ScrollView, Linking, Platform, Image, TextInput,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import taxiApi from '../src/api/taxiClient';
import { useAuth } from '../src/context/AuthContext';
import { useNotifications } from '../src/context/NotificationContext';
import { useTheme } from '../src/context/ThemeContext';

const PHOTO_POLL_INTERVAL  = 8000;
const GPS_INTERVAL         = 5000;
const TRACK_INTERVAL       = 5000;
const STATUS_POLL_INTERVAL = 4000;

export default function ActiveTripScreen() {
    const { match_id, talep_id } = useLocalSearchParams();
    const matchId = Number(match_id);
    const talepId = Number(talep_id) || null;
    const router  = useRouter();
    const { isDriver } = useAuth();
    const { setActiveTripPolling } = useNotifications();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);
    const insets  = useSafeAreaInsets();
    const mapRef  = useRef(null);

    const [detail, setDetail]         = useState(null);
    const [loading, setLoading]       = useState(true);
    const [tripStatus, setTripStatus] = useState(null);
    const [myLoc, setMyLoc]           = useState(null);
    const [driverLoc, setDriverLoc]   = useState(null);
    const [totalKm, setTotalKm]       = useState(0);
    const [elapsed, setElapsed]       = useState(0);
    const [actionLoading, setActionLoading] = useState(false);
    const [routeCoords, setRouteCoords]     = useState([]);

    const [photoRequested, setPhotoRequested]   = useState(false);
    const [receivedPhoto, setReceivedPhoto]     = useState(null);
    const [photoRequesting, setPhotoRequesting] = useState(false);
    const [driverPhotoNeeded, setDriverPhotoNeeded] = useState(false);
    const [sendingPhoto, setSendingPhoto]       = useState(false);
    const [uploadingCheckin, setUploadingCheckin] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [arriving, setArriving] = useState(false);
    const [noshowLoading, setNoshowLoading] = useState(false);
    const [nowTick, setNowTick] = useState(Date.now());

    const gpsRef              = useRef(null);
    const timerRef            = useRef(null);
    const trackRef            = useRef(null);
    const lastLocRef          = useRef(null);
    const photoRef            = useRef(null);
    const statusPollRef       = useRef(null);
    const pollStartedRef      = useRef(false);
    const gpsStartedRef       = useRef(false);
    const trackStartedRef     = useRef(false);
    const timerStartedRef     = useRef(false);
    const tamamlandiHandledRef = useRef(false);
    const prevStatusRef        = useRef(null);

    function fetchRoute(oLat, oLon, dLat, dLon) {
        if (!oLat || !oLon || !dLat || !dLon) return;
        setRouteCoords([
            { latitude: Number(oLat), longitude: Number(oLon) },
            { latitude: Number(dLat), longitude: Number(dLon) },
        ]);
    }

    const loadDetail = useCallback(async () => {
        if (isDriver) {
            const res = await taxiApi.getMyJobs();
            const job = (res.jobs ?? []).find(j => j.id === matchId);
            if (job) {
                setDetail(job);
                setTripStatus(job.durum);
                return job.durum;
            }
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
                    surucu_telefon:    t.surucu_telefon,
                    surucu_id:         t.match_surucu_id,
                    toplam_ucret:      t.toplam_ucret,
                    match_id:          t.match_id,
                });
                const status = t.match_durum ?? t.durum;
                setTripStatus(status);
                return status;
            }
        }
        return null;
    }, [matchId, talepId, isDriver]);

    useEffect(() => {
        (async () => {
            await loadDetail();
            setLoading(false);
        })();
    }, []);

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
                mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 800);
            } catch (_) {}
        }, GPS_INTERVAL);
    }, [matchId]);

    const startTimer = useCallback(() => {
        timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    }, []);

    const startTracking = useCallback(async () => {
        const tick = async () => {
            const currentStatus = await loadDetail();
            if (currentStatus === 'teslim_bekleniyor') {
                clearInterval(trackRef.current);
                return;
            }
            const res = await taxiApi.getLiveLocation(matchId);
            if (res.success && res.location) {
                const loc = { latitude: Number(res.location.lat), longitude: Number(res.location.lon) };
                setDriverLoc(loc);
                mapRef.current?.animateToRegion({ ...loc, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 800);
            }
        };
        await tick();
        trackRef.current = setInterval(tick, TRACK_INTERVAL);
    }, [matchId, loadDetail]);

    const startStatusPoll = useCallback(() => {
        statusPollRef.current = setInterval(async () => {
            if (tamamlandiHandledRef.current) { clearInterval(statusPollRef.current); return; }
            const newStatus = await loadDetail();
            if (newStatus === 'tamamlandi' && !tamamlandiHandledRef.current) {
                tamamlandiHandledRef.current = true;
                clearInterval(statusPollRef.current);
                if (isDriver) {
                    router.replace('/(tabs)');
                    setTimeout(() => {
                        Alert.alert('💰 Ödeme Alındı!', 'Sahip teslimi onayladı. Kazancınız cüzdanınıza eklendi.');
                    }, 400);
                }
            }
        }, STATUS_POLL_INTERVAL);
    }, [loadDetail, isDriver, router]);

    const startPhotoPoll = useCallback(() => {
        const poll = async () => {
            if (isDriver) {
                const res = await taxiApi.checkPhotoRequest(matchId);
                if (res.success && res.requested) setDriverPhotoNeeded(true);
            } else {
                const res = await taxiApi.getPhoto(matchId);
                if (res.success && res.foto_url) setReceivedPhoto(res.foto_url);
            }
        };
        poll();
        photoRef.current = setInterval(poll, PHOTO_POLL_INTERVAL);
    }, [matchId, isDriver]);

    useEffect(() => {
        setActiveTripPolling(true);
        return () => {
            setActiveTripPolling(false);
            clearInterval(gpsRef.current);
            clearInterval(timerRef.current);
            clearInterval(trackRef.current);
            clearInterval(photoRef.current);
            clearInterval(statusPollRef.current);
        };
    }, []);

    useEffect(() => {
        if (receivedPhoto) setPhotoRequested(false);
    }, [receivedPhoto]);

    useEffect(() => {
        if (!isDriver || !detail?.surucu_vardi_at || tripStatus !== 'kabul_edildi') return;
        const id = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, [isDriver, detail?.surucu_vardi_at, tripStatus]);

    useEffect(() => {
        if (!isDriver && tripStatus === 'teslim_bekleniyor' && prevStatusRef.current === 'devam_ediyor') {
            Alert.alert(
                '🐾 Hayvan Teslim Edildi!',
                'Sürücünüz hayvanınızı teslim etti. Lütfen aşağıdaki "Hayvanı Teslim Aldım" butonuna basarak ödemeyi onaylayın.',
                [{ text: 'Tamam' }]
            );
        }
        prevStatusRef.current = tripStatus;
    }, [tripStatus, isDriver]);

    useEffect(() => {
        if (!tripStatus || !detail) return;
        if (tripStatus === 'kabul_edildi') {
            if (isDriver && !gpsStartedRef.current) { gpsStartedRef.current = true; startGPS(); }
            if (!isDriver && !trackStartedRef.current) { trackStartedRef.current = true; startTracking(); }
        }
        if (tripStatus === 'devam_ediyor') {
            if (isDriver) {
                if (!gpsStartedRef.current) { gpsStartedRef.current = true; startGPS(); }
                if (!timerStartedRef.current) { timerStartedRef.current = true; lastLocRef.current = null; startTimer(); }
            }
            if (!isDriver && !trackStartedRef.current) { trackStartedRef.current = true; startTracking(); }
            startPhotoPoll();
        }
        if (tripStatus === 'teslim_bekleniyor' && !pollStartedRef.current) {
            pollStartedRef.current = true;
            clearInterval(gpsRef.current);
            clearInterval(timerRef.current);
            clearInterval(trackRef.current);
            clearInterval(photoRef.current);
            startStatusPoll();
        }
    }, [tripStatus, detail, isDriver]);

    useEffect(() => {
        if (!detail) return;
        const destLat = detail.varis_lat  ? +detail.varis_lat  : null;
        const destLon = detail.varis_lon  ? +detail.varis_lon  : null;
        const srcLat  = myLoc?.latitude   ?? (detail.baslangic_lat ? +detail.baslangic_lat : null);
        const srcLon  = myLoc?.longitude  ?? (detail.baslangic_lon ? +detail.baslangic_lon : null);
        fetchRoute(srcLat, srcLon, destLat, destLon);
    }, [detail, myLoc?.latitude]);

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

    const HAKLI_RET_SEBEPLER = [
        { key: 'asisiz',            label: 'Hayvan aşısız' },
        { key: 'saldirganlik',      label: 'Hayvan saldırgan davranış sergiliyor' },
        { key: 'tasima_kutusu_yok', label: 'Güvenli taşıma kutusu/kafes yok' },
        { key: 'kacma_riski',       label: 'Kaçma riski mevcut' },
    ];

    async function submitDriverCancel(sebep) {
        setActionLoading(true);
        const res = await taxiApi.post('driver_cancel_job', { match_id: matchId, sebep: sebep || '' });
        setActionLoading(false);
        if (!res.success) { Alert.alert('Hata', res.error ?? 'İptal edilemedi.'); return; }
        if (res.tip === 'hakli_ret') {
            Alert.alert(
                'İş İptal Edildi',
                `Taban iptal ücreti (₺${Number(res.iptal_ucreti).toFixed(2)}) sahipten tahsil edildi, kalan bakiye iade edildi.`,
                [{ text: 'Tamam', onPress: () => router.replace('/(tabs)') }]
            );
        } else {
            router.replace('/(tabs)');
        }
    }

    function handleDriverCancel() {
        Alert.alert(
            'İşi İptal Et',
            'İptal sebebinizi seçin:',
            [
                { text: 'Hayvan şartlara uymuyor', onPress: () => {
                    Alert.alert('Sebep Seçin', 'Hangi şart karşılanmıyor?', [
                        ...HAKLI_RET_SEBEPLER.map(s => ({ text: s.label, onPress: () => submitDriverCancel(s.key) })),
                        { text: 'Geri', style: 'cancel' },
                    ]);
                }},
                { text: 'Başka bir sebep (iş iptali)', style: 'destructive', onPress: () => {
                    Alert.alert(
                        'Keyfi İptal',
                        'Haklı bir sebep olmadan iptal ederseniz sahipten kesinti yapılmaz, talep havuza döner. Puanınız olumsuz etkilenir ve tekrarlayan iptallerde hesabınız askıya alınabilir (Madde 7/2). Devam edilsin mi?',
                        [
                            { text: 'Vazgeç', style: 'cancel' },
                            { text: 'Evet, İptal Et', style: 'destructive', onPress: () => submitDriverCancel('') },
                        ]
                    );
                }},
                { text: 'Vazgeç', style: 'cancel' },
            ]
        );
    }

    async function handleDriverArrived() {
        setArriving(true);
        const res = await taxiApi.driverArrived(matchId);
        setArriving(false);
        if (res.success) {
            setDetail(prev => ({ ...prev, surucu_vardi_at: new Date().toISOString().replace('T', ' ').slice(0, 19) }));
        } else {
            Alert.alert('Hata', res.error ?? 'İşlem başarısız.');
        }
    }

    async function handleNoshowCancel() {
        Alert.alert(
            'Sahip Gelmedi — İptal Et',
            'Hayvan sahibi 15 dakikadır adreste hazır değil. Talebi iptal edip iptal ücretini (taban ücret veya %50) uygulamak istiyor musunuz?',
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'İptal Et', style: 'destructive', onPress: async () => {
                        setNoshowLoading(true);
                        const res = await taxiApi.driverCancelNoshow(matchId);
                        setNoshowLoading(false);
                        if (res.success) {
                            Alert.alert('İptal Edildi', `İptal ücreti: ₺${Number(res.iptal_ucreti).toFixed(2)}`, [
                                { text: 'Tamam', onPress: () => router.replace('/(tabs)') },
                            ]);
                        } else {
                            Alert.alert('Hata', res.error ?? 'İptal edilemedi.');
                        }
                    },
                },
            ]
        );
    }

    async function handleCheckinPhoto() {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
            Alert.alert('Kamera İzni', 'Fotoğraf çekmek için kamera izni gereklidir.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            base64: true,
        });
        if (result.canceled || !result.assets?.[0]) return;
        setUploadingCheckin(true);
        const b64 = 'data:image/jpeg;base64,' + result.assets[0].base64;
        const res = await taxiApi.uploadCheckinPhoto(matchId, b64);
        setUploadingCheckin(false);
        if (res.success) {
            setDetail(prev => ({ ...prev, checkin_foto: res.foto_url }));
            Alert.alert('Fotoğraf Yüklendi', 'Teslim alma fotoğrafı kaydedildi. Yolculuğu başlatabilirsiniz.');
        } else {
            Alert.alert('Hata', res.error ?? 'Fotoğraf yüklenemedi.');
        }
    }

    async function handleStartTrip() {
        if (!detail?.checkin_foto) {
            Alert.alert(
                'Fotoğraf Zorunlu',
                'Yolculuğu başlatmadan önce hayvanın teslim alma fotoğrafını yüklemelisiniz (Madde 4/1).'
            );
            return;
        }
        Alert.alert('Yolculuğu Başlat', 'Hayvanı teslim aldınız mı?', [
            { text: 'Hayır', style: 'cancel' },
            { text: 'Evet, Başlat', onPress: async () => {
                setActionLoading(true);
                const res = await taxiApi.startTrip(matchId);
                setActionLoading(false);
                if (res.success) {
                    setTripStatus('devam_ediyor');
                    fetchRoute(detail.baslangic_lat, detail.baslangic_lon, detail.varis_lat, detail.varis_lon);
                } else { Alert.alert('Hata', res.error ?? 'Yolculuk başlatılamadı.'); }
            }},
        ]);
    }

    async function handleFinishTrip() {
        if (pinInput.length !== 4) {
            Alert.alert('Teslimat Kodu Gerekli', 'Hayvanı teslim etmeden önce sahibin uygulamasında gösterilen 4 haneli teslimat kodunu girmelisiniz (Madde 4/4).');
            return;
        }
        Alert.alert('Teslim Et', `Hayvanı teslim ettiniz mi?\nMesafe: ${totalKm.toFixed(2)} km`, [
            { text: 'Hayır', style: 'cancel' },
            { text: 'Evet, Teslim Ettim', style: 'destructive', onPress: async () => {
                clearInterval(gpsRef.current);
                clearInterval(timerRef.current);
                setActionLoading(true);
                const res = await taxiApi.finishTrip(matchId, parseFloat(totalKm.toFixed(2)), pinInput);
                setActionLoading(false);
                if (res.success) {
                    setTripStatus('teslim_bekleniyor');
                } else {
                    Alert.alert('Hata', res.error ?? 'Tamamlanamadı.');
                    setPinInput('');
                }
            }},
        ]);
    }

    async function handleConfirmDelivery() {
        Alert.alert('🐾 Teslimi Onayla', 'Hayvanınızı teslim aldığınızı ve sürücüye ödeme yapılmasını onaylıyor musunuz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Evet, Onayla', onPress: async () => {
                setActionLoading(true);
                const effectiveMatchId = matchId || detail?.match_id;
                const res = await taxiApi.confirmDelivery(effectiveMatchId);
                setActionLoading(false);
                if (res.success) {
                    clearInterval(statusPollRef.current);
                    Alert.alert('✅ Teslim Onaylandı', 'Sürücüye ödeme yapıldı. Yolculuğunuz tamamlandı.', [
                        { text: 'Tamam', onPress: () => router.replace('/(tabs)') },
                    ]);
                } else { Alert.alert('Hata', res.error ?? 'Onaylama başarısız.'); }
            }},
        ]);
    }

    async function handleRequestPhoto() {
        setPhotoRequesting(true);
        const res = await taxiApi.requestPhoto(matchId);
        setPhotoRequesting(false);
        if (res.success) { setPhotoRequested(true); Alert.alert('İstek Gönderildi', 'Sürücüye fotoğraf isteği gönderildi.'); }
        else { Alert.alert('Hata', res.error ?? 'Fotoğraf isteği gönderilemedi.'); }
    }

    async function handleSendPhoto() {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') { Alert.alert('Kamera İzni', 'Fotoğraf çekmek için kamera izni gereklidir.'); return; }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, base64: true });
        if (result.canceled || !result.assets?.[0]) return;
        setSendingPhoto(true);
        const base64 = 'data:image/jpeg;base64,' + result.assets[0].base64;
        const res = await taxiApi.sendPhoto(matchId, base64);
        setSendingPhoto(false);
        if (res.success) { setDriverPhotoNeeded(false); Alert.alert('Gönderildi!', 'Fotoğraf sahibine iletildi.'); }
        else { Alert.alert('Hata', res.error ?? 'Fotoğraf gönderilemedi.'); }
    }

    function openNavigation() {
        if (!detail) return;
        const isStarted = tripStatus === 'devam_ediyor';
        const destLat   = isStarted ? (detail.varis_lat     || null) : (detail.baslangic_lat || null);
        const destLon   = isStarted ? (detail.varis_lon     || null) : (detail.baslangic_lon || null);
        const destName  = isStarted
            ? `${detail.varis_noktasi}, ${detail.varis_ilce}`
            : `${detail.baslangic_noktasi}, ${detail.baslangic_ilce}`;
        const coordStr    = destLat ? `${destLat},${destLon}` : encodeURIComponent(destName);
        const encodedName = encodeURIComponent(destName);
        const apps = [
            { label: 'Google Maps', url: `https://www.google.com/maps/dir/?api=1&destination=${coordStr}&travelmode=driving` },
            { label: 'Yandex Maps', url: destLat ? `yandexmaps://maps.yandex.ru/?rtext=~${destLat},${destLon}&rtt=auto` : `https://yandex.com.tr/maps/?text=${encodedName}` },
            { label: 'Waze', url: destLat ? `https://waze.com/ul?ll=${destLat},${destLon}&navigate=yes` : `https://waze.com/ul?q=${encodedName}&navigate=yes` },
            ...(Platform.OS === 'ios' ? [{ label: 'Apple Maps', url: `maps://?daddr=${coordStr}` }] : []),
        ];
        Alert.alert(
            isStarted ? '🏁 Hedefe Yönlendir' : '📍 Alış Noktasına Git',
            `Hedef: ${destName}`,
            [...apps.map(app => ({ text: app.label, onPress: () => Linking.openURL(app.url).catch(() => {}) })), { text: 'İptal', style: 'cancel' }]
        );
    }

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;
    if (!detail) {
        return (
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
                <Text style={styles.errorText}>Yolculuk bulunamadı.</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>Geri Dön</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const isActive          = tripStatus === 'devam_ediyor';
    const isPendingDelivery = tripStatus === 'teslim_bekleniyor';
    const isDone            = tripStatus === 'tamamlandi';

    const minutesSinceArrival = detail.surucu_vardi_at
        ? (nowTick - parseServerDate(detail.surucu_vardi_at).getTime()) / 60000
        : null;
    const noshowReady = minutesSinceArrival !== null && minutesSinceArrival >= 15;
    const noshowSecsLeft = minutesSinceArrival !== null
        ? Math.max(0, Math.ceil(15 * 60 - minutesSinceArrival * 60))
        : 0;

    const startCoord = detail.baslangic_lat
        ? { latitude: +detail.baslangic_lat, longitude: +detail.baslangic_lon }
        : null;
    const endCoord = detail.varis_lat
        ? { latitude: +detail.varis_lat, longitude: +detail.varis_lon }
        : null;
    const initialRegion = startCoord
        ? { ...startCoord, latitudeDelta: 0.05, longitudeDelta: 0.05 }
        : { latitude: 41.0082, longitude: 28.9784, latitudeDelta: 0.1, longitudeDelta: 0.1 };

    const statusBg = isDone ? C.success
        : isPendingDelivery ? '#92400e'
        : isActive ? '#7c3aed'
        : C.card;

    return (
        <View style={styles.root}>
            <View style={styles.mapContainer}>
                <MapView
                    ref={mapRef}
                    style={styles.map}
                    provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                    initialRegion={initialRegion}
                    showsUserLocation={isDriver}
                    showsMyLocationButton={false}
                >
                    {startCoord && (
                        <Marker coordinate={startCoord} title="Alış" description={detail.baslangic_noktasi}>
                            <View style={styles.markerStart}><Ionicons name="location" size={22} color="#fff" /></View>
                        </Marker>
                    )}
                    {endCoord && (
                        <Marker coordinate={endCoord} title="Varış" description={detail.varis_noktasi}>
                            <View style={styles.markerEnd}><Ionicons name="flag" size={18} color="#fff" /></View>
                        </Marker>
                    )}
                    {!isDriver && driverLoc && (
                        <Marker coordinate={driverLoc} title="Sürücü">
                            <View style={styles.markerDriver}><Ionicons name="car" size={16} color={C.darker} /></View>
                        </Marker>
                    )}
                    {routeCoords.length >= 2 && (
                        <Polyline coordinates={routeCoords} strokeColor={C.primary} strokeWidth={4} />
                    )}
                </MapView>

                {isDriver && (isActive || tripStatus === 'kabul_edildi') && (
                    <TouchableOpacity style={styles.openMapsBtn} onPress={openNavigation} activeOpacity={0.85}>
                        <Ionicons name="navigate" size={16} color={C.darker} />
                        <Text style={styles.openMapsText}>
                            {isActive ? 'Hedefe Git' : 'Alış Noktasına Git'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={[styles.statusBar, { backgroundColor: statusBg }]}>
                <View>
                    <Text style={[styles.statusTitle, !isDone && !isActive && !isPendingDelivery && { color: C.text }]}>
                        {isDone ? '✅ Tamamlandı'
                            : isPendingDelivery ? (isDriver ? '⏳ Teslim Onayı Bekleniyor' : '🐾 Hayvanınız Teslim Edildi')
                            : isActive ? (isDriver ? '🚕 Yolculuk Devam Ediyor' : '🚕 Sürücü Yolda')
                            : '⏳ Başlamayı Bekliyor'}
                    </Text>
                    {isActive && isDriver && (
                        <Text style={styles.statusSub}>{formatTime(elapsed)} · {totalKm.toFixed(2)} km</Text>
                    )}
                    {isPendingDelivery && !isDriver && (
                        <Text style={styles.statusSub}>Aşağıdaki butona basarak teslimi onaylayın</Text>
                    )}
                </View>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Güzergah</Text>
                    <View style={styles.routeRow}>
                        <View style={[styles.dot, { backgroundColor: C.success }]} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.routeLabel}>ALIŞ</Text>
                            <Text style={styles.routeMain}>{detail.baslangic_ilce}, {detail.baslangic_sehir}</Text>
                            <Text style={styles.routeSub} numberOfLines={2}>{detail.baslangic_noktasi}</Text>
                        </View>
                    </View>
                    <View style={styles.routeDivider} />
                    <View style={styles.routeRow}>
                        <View style={[styles.dot, { backgroundColor: C.danger }]} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.routeLabel}>BIRAKIŞ</Text>
                            <Text style={styles.routeMain}>{detail.varis_ilce}, {detail.varis_sehir}</Text>
                            <Text style={styles.routeSub} numberOfLines={2}>{detail.varis_noktasi}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{isDriver ? 'Yolcu Bilgisi' : 'Sürücü Bilgisi'}</Text>
                    {isDriver
                        ? <InfoRow styles={styles} C={C} icon="person"  label="Sahip"  value={detail.sahip_adi} />
                        : <InfoRow styles={styles} C={C} icon="car"     label="Sürücü" value={detail.surucu_adi ?? '-'} />
                    }
                    {!isDriver && detail.surucu_telefon && (
                        <TouchableOpacity onPress={() => Linking.openURL(`tel:${detail.surucu_telefon}`).catch(() => {})} activeOpacity={0.7}>
                            <InfoRow styles={styles} C={C} icon="call" label="Telefon" value={detail.surucu_telefon} highlight />
                        </TouchableOpacity>
                    )}
                    <InfoRow styles={styles} C={C} icon="paw"    label="Hayvan" value={detail.kopek_adi} />
                    <InfoRow styles={styles} C={C} icon="wallet" label="Ücret"  value={`${Number(detail.toplam_ucret).toLocaleString('tr-TR')} ₺`} highlight />
                </View>

                {!isDriver && (tripStatus === 'kabul_edildi' || isActive) && detail.teslim_pin && (
                    <View style={[styles.card, { borderWidth: 1.5, borderColor: C.primary }]}>
                        <Text style={styles.cardTitle}>🔐 Teslimat Kodu</Text>
                        <Text style={styles.photoCaption}>
                            Sürücü hayvanınızı size teslim ederken bu kodu isteyecektir. Kodu yalnızca hayvanı gerçekten teslim alacak kişiye verin (Madde 4/4).
                        </Text>
                        <Text style={styles.pinDisplay}>{detail.teslim_pin}</Text>
                    </View>
                )}

                {!isDriver && tripStatus === 'kabul_edildi' && detail.surucu_vardi_at && (
                    <View style={[styles.card, { borderWidth: 1.5, borderColor: '#f59e0b' }]}>
                        <Text style={styles.cardTitle}>🚖 Sürücünüz Adrese Vardı</Text>
                        <Text style={styles.photoCaption}>
                            Lütfen hayvanınızla birlikte hazır olun. 15 dakika içinde hazır bulunulmazsa iptal ücreti uygulanabilir (Madde 7/1).
                        </Text>
                    </View>
                )}

                {!isDriver && isActive && (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Fotoğraf</Text>
                        {detail.checkin_foto && (
                            <>
                                <Text style={styles.photoCaption}>📸 Teslim alma fotoğrafı (sürücü tarafından çekildi):</Text>
                                <Image source={{ uri: detail.checkin_foto }} style={styles.photoImg} resizeMode="cover" />
                            </>
                        )}
                        {receivedPhoto ? (
                            <>
                                <Text style={[styles.photoCaption, { marginTop: detail.checkin_foto ? 12 : 0 }]}>Sürücüden gelen güncel fotoğraf:</Text>
                                <Image source={{ uri: receivedPhoto }} style={styles.photoImg} resizeMode="cover" />
                            </>
                        ) : (
                            <Text style={styles.photoCaption}>
                                {photoRequested ? '⏳ Fotoğraf bekleniyor...' : 'Sürücüden hayvanınızın güncel fotoğrafını isteyin.'}
                            </Text>
                        )}
                        <TouchableOpacity
                            style={[styles.photoBtn, photoRequested && { opacity: 0.6 }]}
                            onPress={handleRequestPhoto}
                            disabled={photoRequesting || photoRequested}
                            activeOpacity={0.85}
                        >
                            {photoRequesting
                                ? <ActivityIndicator color={C.darker} size="small" />
                                : <Text style={styles.photoBtnText}>📸 {photoRequested ? 'İstek Gönderildi' : 'Fotoğraf İste'}</Text>
                            }
                        </TouchableOpacity>
                    </View>
                )}

                {isDriver && tripStatus === 'kabul_edildi' && (
                    <View style={[styles.card, { borderWidth: 1.5, borderColor: detail.surucu_vardi_at ? C.success : C.primary }]}>
                        <Text style={styles.cardTitle}>📍 Adrese Varış</Text>
                        {!detail.surucu_vardi_at ? (
                            <>
                                <Text style={styles.photoCaption}>
                                    Alış adresine vardığınızda bildirin. Sahip 15 dakika içinde hazır olmazsa iptal ücreti uygulayabilirsiniz (Madde 7/1).
                                </Text>
                                <TouchableOpacity
                                    style={[styles.photoBtn, arriving && { opacity: 0.6 }]}
                                    onPress={handleDriverArrived}
                                    disabled={arriving}
                                    activeOpacity={0.85}
                                >
                                    {arriving
                                        ? <ActivityIndicator color={C.darker} size="small" />
                                        : <Text style={styles.photoBtnText}>📍 Adrese Vardım</Text>
                                    }
                                </TouchableOpacity>
                            </>
                        ) : noshowReady ? (
                            <>
                                <Text style={[styles.photoCaption, { color: C.danger }]}>
                                    ⚠️ 15 dakika doldu, sahip hazır değil. İptal ederseniz taban ücret / %50 iptal ücreti uygulanır.
                                </Text>
                                <TouchableOpacity
                                    style={[styles.photoBtn, { backgroundColor: C.danger }, noshowLoading && { opacity: 0.6 }]}
                                    onPress={handleNoshowCancel}
                                    disabled={noshowLoading}
                                    activeOpacity={0.85}
                                >
                                    {noshowLoading
                                        ? <ActivityIndicator color="#fff" size="small" />
                                        : <Text style={[styles.photoBtnText, { color: '#fff' }]}>Sahip Gelmedi — İptal Et</Text>
                                    }
                                </TouchableOpacity>
                            </>
                        ) : (
                            <Text style={[styles.photoCaption, { color: C.success }]}>
                                ✅ Vardınız. Sahip hazırlanıyor — {Math.floor(noshowSecsLeft / 60)}:{String(noshowSecsLeft % 60).padStart(2, '0')} sonra "sahip gelmedi" iptali açılır.
                            </Text>
                        )}
                    </View>
                )}

                {isDriver && tripStatus === 'kabul_edildi' && (
                    <View style={[styles.card, { borderWidth: 1.5, borderColor: detail.checkin_foto ? C.success : C.danger }]}>
                        <Text style={styles.cardTitle}>📸 Teslim Alma Fotoğrafı</Text>
                        {detail.checkin_foto ? (
                            <>
                                <Text style={[styles.photoCaption, { color: C.success }]}>✅ Fotoğraf yüklendi. Yolculuğu başlatabilirsiniz.</Text>
                                <Image source={{ uri: detail.checkin_foto }} style={styles.photoImg} resizeMode="cover" />
                            </>
                        ) : (
                            <>
                                <Text style={styles.photoCaption}>
                                    Zorunlu — Hayvanı teslim almadan önce mevcut sağlık durumunu belgeleyin (Madde 4/1).
                                </Text>
                                <TouchableOpacity
                                    style={[styles.photoBtn, { backgroundColor: C.danger }, uploadingCheckin && { opacity: 0.6 }]}
                                    onPress={handleCheckinPhoto}
                                    disabled={uploadingCheckin}
                                    activeOpacity={0.85}
                                >
                                    {uploadingCheckin
                                        ? <ActivityIndicator color="#fff" size="small" />
                                        : <Text style={[styles.photoBtnText, { color: '#fff' }]}>📷 Fotoğraf Çek (Zorunlu)</Text>
                                    }
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}

                {isDriver && isActive && (
                    <View style={[styles.card, { borderWidth: 1.5, borderColor: pinInput.length === 4 ? C.success : C.primary }]}>
                        <Text style={styles.cardTitle}>🔐 Teslimat Kodu Girin</Text>
                        <Text style={styles.photoCaption}>
                            Hayvanı sahibine (veya bildirilen yetkili alıcıya) teslim ederken, onun uygulamasında gösterilen 4 haneli kodu girin (Madde 4/4). Kod girilmeden teslim tamamlanamaz.
                        </Text>
                        <TextInput
                            style={styles.pinInput}
                            value={pinInput}
                            onChangeText={t => setPinInput(t.replace(/[^0-9]/g, '').slice(0, 4))}
                            keyboardType="number-pad"
                            maxLength={4}
                            placeholder="••••"
                            placeholderTextColor={C.textMuted}
                            textAlign="center"
                        />
                    </View>
                )}

                {isDriver && isActive && driverPhotoNeeded && (
                    <View style={[styles.card, { borderWidth: 1.5, borderColor: C.primary }]}>
                        <Text style={styles.cardTitle}>📸 Fotoğraf İsteği</Text>
                        <Text style={styles.photoCaption}>Hayvan sahibi fotoğraf istiyor.</Text>
                        <TouchableOpacity
                            style={[styles.photoBtn, sendingPhoto && { opacity: 0.6 }]}
                            onPress={handleSendPhoto}
                            disabled={sendingPhoto}
                            activeOpacity={0.85}
                        >
                            {sendingPhoto
                                ? <ActivityIndicator color={C.darker} size="small" />
                                : <Text style={styles.photoBtnText}>📷 Fotoğraf Çek ve Gönder</Text>
                            }
                        </TouchableOpacity>
                    </View>
                )}

                {isDriver && isPendingDelivery && (
                    <View style={[styles.card, { borderWidth: 1.5, borderColor: '#f59e0b' }]}>
                        <Text style={styles.cardTitle}>⏳ Onay Bekleniyor</Text>
                        <Text style={styles.photoCaption}>
                            Hayvan sahibinin teslimi onaylaması bekleniyor. Onay geldiğinde ödeme otomatik olarak cüzdanınıza eklenecek.
                        </Text>
                        <ActivityIndicator color={C.primary} style={{ marginTop: 8 }} />
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                {isDone ? (
                    <>
                        {!isDriver && detail.surucu_id && talepId && (
                            <TouchableOpacity
                                style={[styles.actionBtn, { marginBottom: 8 }]}
                                onPress={() => router.push({ pathname: '/reviews', params: { talep_id: talepId, degerlendirilen_id: detail.surucu_id } })}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="star" size={20} color={C.darker} />
                                <Text style={styles.actionBtnText}>Sürücüyü Değerlendir</Text>
                            </TouchableOpacity>
                        )}
                        {isDriver && detail.sahip_id && detail.talep_id && (
                            <TouchableOpacity
                                style={[styles.actionBtn, { marginBottom: 8 }]}
                                onPress={() => router.push({ pathname: '/reviews', params: { talep_id: detail.talep_id, degerlendirilen_id: detail.sahip_id } })}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="star" size={20} color={C.darker} />
                                <Text style={styles.actionBtnText}>Sahibi Değerlendir</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: C.card, borderWidth: 1, borderColor: C.border }]}
                            onPress={() => router.replace('/(tabs)')}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="home-outline" size={20} color={C.text} />
                            <Text style={[styles.actionBtnText, { color: C.text }]}>Ana Sayfaya Dön</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        {isDriver && tripStatus === 'kabul_edildi' && (
                            <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.danger, marginBottom: 8 }]}
                                onPress={handleDriverCancel}
                                disabled={actionLoading}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="close-circle-outline" size={18} color={C.danger} />
                                <Text style={[styles.actionBtnText, { color: C.danger }]}>İşi İptal Et</Text>
                            </TouchableOpacity>
                        )}
                        {isDriver && tripStatus === 'kabul_edildi' && (
                            <TouchableOpacity
                                style={[styles.actionBtn, !detail?.checkin_foto && { opacity: 0.45 }]}
                                onPress={handleStartTrip}
                                disabled={actionLoading || !detail?.checkin_foto}
                                activeOpacity={0.85}
                            >
                                {actionLoading
                                    ? <ActivityIndicator color={C.darker} />
                                    : <><Ionicons name="rocket" size={20} color={C.darker} /><Text style={styles.actionBtnText}>Yolculuğu Başlat</Text></>
                                }
                            </TouchableOpacity>
                        )}
                        {isDriver && isActive && (
                            <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: C.success }, pinInput.length !== 4 && { opacity: 0.45 }]}
                                onPress={handleFinishTrip}
                                disabled={actionLoading || pinInput.length !== 4}
                                activeOpacity={0.85}
                            >
                                {actionLoading
                                    ? <ActivityIndicator color="#fff" />
                                    : <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={[styles.actionBtnText, { color: '#fff' }]}>Hayvanı Teslim Ettim</Text></>
                                }
                            </TouchableOpacity>
                        )}
                        {!isDriver && isPendingDelivery && (
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.success }]} onPress={handleConfirmDelivery} disabled={actionLoading} activeOpacity={0.85}>
                                {actionLoading
                                    ? <ActivityIndicator color="#fff" />
                                    : <><Ionicons name="checkmark-done-circle" size={20} color="#fff" /><Text style={[styles.actionBtnText, { color: '#fff' }]}>Hayvanı Teslim Aldım ✓</Text></>
                                }
                            </TouchableOpacity>
                        )}
                    </>
                )}
            </View>
        </View>
    );
}

function InfoRow({ styles, C, icon, label, value, highlight }) {
    return (
        <View style={styles.infoRow}>
            <Ionicons name={`${icon}-outline`} size={16} color={C.textMuted} />
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={[styles.infoValue, highlight && { color: C.primary, fontWeight: '800' }]}>{value}</Text>
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

function parseServerDate(s) {
    if (!s) return null;
    return new Date(String(s).replace(' ', 'T'));
}

function haversine(lat1, lon1, lat2, lon2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background, gap: 12 },
    errorText:   { color: C.textMuted, fontSize: 15 },
    backBtn:     { backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
    backBtnText: { color: C.primary, fontWeight: '700' },

    mapContainer: { height: 280, position: 'relative' },
    map:          { flex: 1 },

    markerStart:  { backgroundColor: C.success, borderRadius: 20, padding: 6, borderWidth: 2, borderColor: '#fff' },
    markerEnd:    { backgroundColor: C.danger,  borderRadius: 20, padding: 7, borderWidth: 2, borderColor: '#fff' },
    markerDriver: { backgroundColor: C.primary, borderRadius: 20, padding: 7, borderWidth: 2, borderColor: '#fff' },

    openMapsBtn: {
        position: 'absolute', bottom: 12, right: 12,
        backgroundColor: C.primary, borderRadius: 20,
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8, elevation: 4,
    },
    openMapsText: { color: C.darker, fontWeight: '700', fontSize: 13 },

    statusBar:   { flexDirection: 'row', alignItems: 'center', padding: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.border },
    statusTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
    statusSub:   { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

    scroll:        { flex: 1 },
    scrollContent: { padding: 16, gap: 12, paddingBottom: 24 },

    card:      { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 10 },
    cardTitle: { color: C.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

    routeRow:    { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    dot:         { width: 12, height: 12, borderRadius: 6, marginTop: 4, flexShrink: 0 },
    routeLabel:  { color: C.textMuted, fontSize: 10, fontWeight: '700' },
    routeMain:   { color: C.text, fontSize: 14, fontWeight: '700' },
    routeSub:    { color: C.textMuted, fontSize: 12 },
    routeDivider:{ height: 1, backgroundColor: C.border, marginLeft: 24 },

    infoRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
    infoLabel: { color: C.textMuted, fontSize: 13, flex: 1 },
    infoValue: { color: C.text, fontSize: 13, fontWeight: '600' },

    actionBar:     { padding: 16, paddingTop: 12, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border },
    actionBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
    actionBtnText: { color: C.darker, fontWeight: '800', fontSize: 16 },

    photoCaption: { color: C.textMuted, fontSize: 13, lineHeight: 18 },
    photoBtn:     { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    photoBtnText: { color: C.darker, fontWeight: '700', fontSize: 14 },
    photoImg:     { width: '100%', height: 200, borderRadius: 10, marginTop: 8 },

    pinDisplay: { fontSize: 40, fontWeight: '900', color: C.primary, textAlign: 'center', letterSpacing: 10, marginTop: 10 },
    pinInput:   { backgroundColor: C.surface, borderRadius: 12, paddingVertical: 14, color: C.text, fontSize: 28, fontWeight: '800', letterSpacing: 12, borderWidth: 1.5, borderColor: C.border, marginTop: 8 },
});
