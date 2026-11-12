import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, Alert, ActivityIndicator, Platform, Modal, FlatList,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import taxiApi from '../src/api/taxiClient';
import { useTheme } from '../src/context/ThemeContext';

export default function CreateRequestScreen() {
    const router = useRouter();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);

    const [dogs, setDogs]               = useState([]);
    const [dogsLoading, setDogsLoading] = useState(true);
    const [selectedDog, setSelectedDog] = useState(null);

    const [pickup,  setPickup]  = useState({ address: '', city: '', district: '', lat: null, lon: null });
    const [dropoff, setDropoff] = useState({ address: '', city: '', district: '', lat: null, lon: null });
    const [dropoffLocked, setDropoffLocked] = useState(false);
    const [dropoffNote,   setDropoffNote]   = useState('');

    const [savedAddresses, setSavedAddresses] = useState([]);
    const [addrPicker, setAddrPicker]         = useState(null);

    const [dropoffQuery,   setDropoffQuery]   = useState('');
    const [placeSuggestions, setPlaceSuggestions] = useState([]);
    const [placesLoading,  setPlacesLoading]  = useState(false);
    const searchTimeout = useRef(null);

    const [routeType, setRouteType]         = useState('normal');
    const [type, setType]                   = useState('anlik');
    const [departureTime, setDepartureTime] = useState(new Date(Date.now() + 30 * 60000));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [notes, setNotes]                 = useState('');

    const [agresyonVar,      setAgresyonVar]      = useState(null);  // null | true | false
    const [agresyonAciklama, setAgresyonAciklama] = useState('');
    const [agizlikTaahhut,   setAgizlikTaahhut]   = useState(false);
    const [ekipmanTaahhut,   setEkipmanTaahhut]   = useState(false);

    const [fare, setFare]               = useState(null);
    const [fareBreakdown, setFareBreakdown] = useState(null);
    const [tolls, setTolls]             = useState([]);
    const [distance, setDistance]       = useState(null);
    const [fareLoading, setFareLoading] = useState(false);
    const [locLoading, setLocLoading]   = useState(false);
    const [geoLoading, setGeoLoading]   = useState({ pickup: false, dropoff: false });
    const [submitting, setSubmitting]   = useState(false);

    const loadDogs = useCallback(async () => {
        setDogsLoading(true);
        const res = await taxiApi.getMyDogs();
        const list = res.dogs ?? [];
        setDogs(list);
        if (list.length === 1) setSelectedDog(list[0]);
        setDogsLoading(false);
    }, []);

    useFocusEffect(useCallback(() => { loadDogs(); }, [loadDogs]));

    useEffect(() => {
        if (pickup.lat && dropoff.lat) computeFare();
    }, [pickup.lat, pickup.lon, dropoff.lat, dropoff.lon]);

    const expressTolls = tolls.filter(t => t.express || t.otomatik);
    const autoTolls    = tolls.filter(t => t.otomatik && !t.express);
    const tollTotal    = routeType === 'hizli'
        ? tolls.filter(t => t.otomatik || t.express).reduce((s, t) => s + t.ucret, 0)
        : autoTolls.reduce((s, t) => s + t.ucret, 0);
    const totalFare    = fare !== null ? Number(fare) + tollTotal : null;

    async function geocodePickup() {
        if (!pickup.address && !pickup.city) return;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        setGeoLoading(prev => ({ ...prev, pickup: true }));
        try {
            const query = [pickup.address, pickup.district, pickup.city, 'Türkiye'].filter(Boolean).join(', ');
            const results = await Location.geocodeAsync(query);
            if (results.length > 0) {
                const { latitude, longitude } = results[0];
                setPickup(p => ({ ...p, lat: latitude, lon: longitude }));
            }
        } catch {}
        setGeoLoading(prev => ({ ...prev, pickup: false }));
    }

    async function useCurrentLocation() {
        setLocLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { Alert.alert('İzin Gerekli', 'Konum izni gereklidir.'); return; }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const { latitude, longitude } = loc.coords;
            const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (geo.length > 0) {
                const g = geo[0];
                setPickup({
                    address:  [g.street, g.streetNumber].filter(Boolean).join(' ') || g.name || '',
                    city:     g.city || g.region || '',
                    district: g.district || g.subregion || '',
                    lat: latitude, lon: longitude,
                });
            }
        } catch (e) { Alert.alert('Hata', e.message); }
        setLocLoading(false);
    }

    async function searchPlaces(text) {
        setDropoffQuery(text);
        clearTimeout(searchTimeout.current);
        if (text.length < 3) { setPlaceSuggestions([]); return; }
        searchTimeout.current = setTimeout(async () => {
            setPlacesLoading(true);
            try {
                const params = { q: text };
                if (pickup.lat) { params.lat = pickup.lat; params.lon = pickup.lon; }
                const res = await taxiApi.request('places_search', { params });
                setPlaceSuggestions(res.predictions ?? []);
            } catch {}
            setPlacesLoading(false);
        }, 350);
    }

    function selectPlace(prediction) {
        setPlaceSuggestions([]);
        setDropoffQuery(prediction.description);
        setDropoff({
            address:  prediction.description,
            city:     prediction._city || '',
            district: prediction._district || '',
            lat:      prediction._lat ? Number(prediction._lat) : null,
            lon:      prediction._lon ? Number(prediction._lon) : null,
        });
        setDropoffLocked(true);
    }

    function clearDropoff() {
        setDropoff({ address: '', city: '', district: '', lat: null, lon: null });
        setDropoffQuery('');
        setDropoffNote('');
        setDropoffLocked(false);
        setPlaceSuggestions([]);
        setFare(null);
        setFareBreakdown(null);
        setTolls([]);
        setDistance(null);
    }

    async function openAddressPicker(side) {
        const res = await taxiApi.getMyAddresses();
        setSavedAddresses(res.addresses ?? []);
        setAddrPicker(side);
    }

    async function selectSavedAddress(addr) {
        const side = addrPicker;
        setAddrPicker(null);
        const lat = addr.lat ? Number(addr.lat) : null;
        const lon = addr.lon ? Number(addr.lon) : null;
        if (side === 'pickup') {
            setPickup({ address: addr.adres, city: addr.sehir || '', district: addr.ilce || '', lat, lon });
            if (!lat) {
                setGeoLoading(prev => ({ ...prev, pickup: true }));
                try {
                    const q = [addr.adres, addr.ilce, addr.sehir, 'Türkiye'].filter(Boolean).join(', ');
                    const results = await Location.geocodeAsync(q);
                    if (results.length > 0) {
                        const { latitude, longitude } = results[0];
                        setPickup(p => ({ ...p, lat: latitude, lon: longitude }));
                    }
                } catch {}
                setGeoLoading(prev => ({ ...prev, pickup: false }));
            }
        } else {
            setDropoffQuery(addr.adres);
            setDropoff({ address: addr.adres, city: addr.sehir || '', district: addr.ilce || '', lat, lon });
            setDropoffLocked(true);
            if (!lat) {
                setGeoLoading(prev => ({ ...prev, dropoff: true }));
                try {
                    const q = [addr.adres, addr.ilce, addr.sehir, 'Türkiye'].filter(Boolean).join(', ');
                    const results = await Location.geocodeAsync(q);
                    if (results.length > 0) {
                        const { latitude, longitude } = results[0];
                        setDropoff(d => ({ ...d, lat: latitude, lon: longitude }));
                    }
                } catch {}
                setGeoLoading(prev => ({ ...prev, dropoff: false }));
            }
        }
    }

    async function computeFare() {
        setFareLoading(true);
        try {
            const R = 6371;
            const toRad = d => d * Math.PI / 180;
            const dLat = toRad(dropoff.lat - pickup.lat);
            const dLon = toRad(dropoff.lon - pickup.lon);
            const a = Math.sin(dLat/2)**2 + Math.cos(toRad(pickup.lat)) * Math.cos(toRad(dropoff.lat)) * Math.sin(dLon/2)**2;
            const haversineKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            setDistance(haversineKm.toFixed(1));
            const res = await taxiApi.getFareEstimate(haversineKm.toFixed(2), pickup.lat, pickup.lon, dropoff.lat, dropoff.lon);
            if (res.success) {
                setFare(res.tahmini_ucret);
                setDistance(Number(res.km).toFixed(1));
                setFareBreakdown({ acilis: res.acilis_ucreti, km: res.km, kmRate: res.km_basi_ucret, kmUcreti: res.km_ucreti });
                if (res.gecis_ucretleri?.length) {
                    setTolls(res.gecis_ucretleri);
                    const hasAuto = res.gecis_ucretleri.some(t => t.otomatik);
                    if (hasAuto) setRouteType('hizli');
                }
            }
        } catch {}
        setFareLoading(false);
    }

    function buildRequestPayload() {
        const selectedTollIds = routeType === 'hizli'
            ? tolls.filter(t => t.otomatik || t.express).map(t => t.id)
            : tolls.filter(t => t.otomatik).map(t => t.id);
        const dropoffAddress = dropoff.address + (dropoffNote.trim() ? ' ' + dropoffNote.trim() : '');
        return {
            kopek_id:          selectedDog.id,
            kalkis_zamani:     type === 'anlik'
                ? new Date().toISOString().slice(0, 19).replace('T', ' ')
                : departureTime.toISOString().slice(0, 19).replace('T', ' '),
            baslangic_noktasi: pickup.address,
            baslangic_sehir:   pickup.city,
            baslangic_ilce:    pickup.district || pickup.city,
            baslangic_lat:     pickup.lat,
            baslangic_lon:     pickup.lon,
            varis_noktasi:     dropoffAddress,
            varis_sehir:       dropoff.city || dropoff.district || dropoff.address,
            varis_ilce:        dropoff.district || dropoff.city || dropoff.address,
            varis_lat:         dropoff.lat,
            varis_lon:         dropoff.lon,
            tahmini_mesafe:    distance ? parseFloat(distance) : null,
            toplam_ucret:      totalFare ?? fare,
            tip:               type,
            guzergah_tipi:     routeType,
            secili_gecisler:   selectedTollIds,
            ozel_talepler:     notes || null,
            agresyon_gecmisi:  agresyonVar ? 1 : 0,
            agresyon_aciklama: agresyonVar ? (agresyonAciklama.trim() || null) : null,
            agizlik_taahhut:   agizlikTaahhut ? 1 : 0,
            ekipman_taahhut:   ekipmanTaahhut ? 1 : 0,
        };
    }

    async function handleSubmit() {
        if (!selectedDog)              { Alert.alert('Köpek Seçin', 'Hangi köpeğin seyahat edeceğini seçin.'); return; }
        if (!pickup.address || !pickup.city) { Alert.alert('Alış Adresi Eksik', 'Alış adresinizi girin.'); return; }
        if (!dropoff.lat)              { Alert.alert('Varış Adresi Eksik', 'Listeden bir varış adresi seçin.'); return; }
        if (agresyonVar === null)      { Alert.alert('Beyan Gerekli', 'Lütfen ısırma/saldırma geçmişi beyanını doldurun.'); return; }
        if (agresyonVar && !agresyonAciklama.trim()) { Alert.alert('Açıklama Gerekli', 'Lütfen ısırma/saldırma geçmişini kısaca açıklayın.'); return; }
        if (selectedDog?.huylu === 'agresif' && !agizlikTaahhut) { Alert.alert('Ağızlık Taahhüdü', 'Agresif ırk için seyahat süresince ağızlık takacağınızı onaylamanız zorunludur.'); return; }
        if (!ekipmanTaahhut) { Alert.alert('Ekipman Taahhüdü', 'Hayvanınızı güvenli taşıma kutusu/kafes/göğüs tasması ile teslim edeceğinizi onaylamanız zorunludur (Madde 5/4).'); return; }

        setSubmitting(true);
        const payload = buildRequestPayload();
        const res = await taxiApi.createRequest(payload);

        if (res.success) {
            setSubmitting(false);
            router.replace('/(tabs)');
            return;
        }

        if (res.error_code === 'INSUFFICIENT_BALANCE') {
            const gereken = Number(res.gereken ?? totalFare ?? 0);
            const mevcut  = Number(res.bakiye ?? 0);
            const eksik   = Math.max(gereken - mevcut, 10);
            const topupRes = await taxiApi.walletTopupInit(Math.ceil(eksik));
            setSubmitting(false);
            if (!topupRes.success) { Alert.alert('Ödeme Başlatılamadı', topupRes.error ?? 'Lütfen tekrar deneyin.'); return; }
            const result = await WebBrowser.openAuthSessionAsync(topupRes.payment_url, 'pet-taxi://');
            if (result.type === 'success' && (result.url ?? '').includes('status=success')) {
                setSubmitting(true);
                const retry = await taxiApi.createRequest(payload);
                setSubmitting(false);
                if (retry.success) {
                    router.replace('/(tabs)');
                    setTimeout(() => {
                        Alert.alert('💡 İpucu', 'Cüzdanınıza önceden bakiye yükleyerek bir sonraki seyahatte ödeme adımı olmadan anında rezervasyon yapabilirsiniz!', [{ text: 'Anladım' }]);
                    }, 500);
                } else {
                    Alert.alert('Hata', retry.error ?? 'Talep oluşturulamadı. Bakiyeniz yüklendi, lütfen tekrar deneyin.');
                }
            } else if (result.type !== 'cancel') {
                Alert.alert('Ödeme Başarısız', 'Ödeme tamamlanamadı, lütfen tekrar deneyin.');
            }
            return;
        }

        setSubmitting(false);
        Alert.alert('Hata', res.error ?? 'Talep oluşturulamadı.');
    }

    if (dogsLoading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;

    const canConfirm = !!selectedDog && !!pickup.address && !!dropoff.lat && !submitting && !geoLoading.dropoff && !geoLoading.pickup
        && agresyonVar !== null
        && (agresyonVar === false || !!agresyonAciklama.trim())
        && (selectedDog?.huylu !== 'agresif' || agizlikTaahhut)
        && ekipmanTaahhut;

    return (
        <View style={styles.root}>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                {dogs.length === 0 ? (
                    <TouchableOpacity
                        style={styles.warningCard}
                        onPress={() => router.push({ pathname: '/(tabs)/dogs', params: { returnTo: '/create-request' } })}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="paw-outline" size={22} color={C.warning} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.warningText}>Kayıtlı köpeğiniz yok.</Text>
                            <Text style={[styles.warningText, { fontWeight: '800', marginTop: 2 }]}>Köpek eklemek için dokunun →</Text>
                        </View>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>YOLCULUK EDECEK</Text>
                        <View style={styles.dogRow}>
                            {dogs.map(dog => (
                                <TouchableOpacity
                                    key={dog.id}
                                    style={[styles.dogChip, selectedDog?.id === dog.id && styles.dogChipActive]}
                                    onPress={() => setSelectedDog(dog)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.dogChipEmoji}>🐾</Text>
                                    <View>
                                        <Text style={[styles.dogChipName, selectedDog?.id === dog.id && { color: C.darker }]}>{dog.isim}</Text>
                                        {dog.irk ? <Text style={[styles.dogChipBreed, selectedDog?.id === dog.id && { color: C.darker, opacity: 0.7 }]}>{dog.irk}</Text> : null}
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {selectedDog && (
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>SAĞLIK & GÜVENLİK BEYANI</Text>
                        <View style={styles.declarationCard}>
                            <Text style={styles.declarationQ}>Bu seyahatte hayvanın ısırma veya saldırma davranışı bekleniyor mu?</Text>
                            <View style={styles.declarationBtns}>
                                <TouchableOpacity
                                    style={[styles.declBtn, agresyonVar === false && { borderColor: C.success, backgroundColor: C.success + '22' }]}
                                    onPress={() => setAgresyonVar(false)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.declBtnText, agresyonVar === false && { color: C.success }]}>✓ Hayır</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.declBtn, agresyonVar === true && { borderColor: C.danger, backgroundColor: C.danger + '22' }]}
                                    onPress={() => setAgresyonVar(true)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.declBtnText, agresyonVar === true && { color: C.danger }]}>⚠ Evet</Text>
                                </TouchableOpacity>
                            </View>
                            {agresyonVar === true && (
                                <TextInput
                                    style={styles.declInput}
                                    placeholder="Lütfen geçmişi kısaca açıklayın..."
                                    placeholderTextColor={C.textMuted}
                                    value={agresyonAciklama}
                                    onChangeText={setAgresyonAciklama}
                                    multiline
                                />
                            )}
                            {selectedDog?.huylu === 'agresif' && (
                                <TouchableOpacity
                                    style={styles.muzzleRow}
                                    onPress={() => setAgizlikTaahhut(v => !v)}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.checkboxBox, agizlikTaahhut && { backgroundColor: C.primary, borderColor: C.primary }]}>
                                        {agizlikTaahhut && <Ionicons name="checkmark" size={14} color={C.darker} />}
                                    </View>
                                    <Text style={styles.muzzleText}>Seyahat süresince hayvanıma ağızlık takacağımı taahhüt ediyorum</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={styles.muzzleRow}
                                onPress={() => setEkipmanTaahhut(v => !v)}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.checkboxBox, ekipmanTaahhut && { backgroundColor: C.primary, borderColor: C.primary }]}>
                                    {ekipmanTaahhut && <Ionicons name="checkmark" size={14} color={C.darker} />}
                                </View>
                                <Text style={styles.muzzleText}>Hayvanımı güvenli bir taşıma kutusu, kafes veya göğüs tasması ile teslim edeceğimi taahhüt ediyorum</Text>
                            </TouchableOpacity>

                            {(agresyonVar === null || !ekipmanTaahhut) && (
                                <Text style={styles.declHint}>* Bu beyanlar zorunludur</Text>
                            )}
                        </View>
                    </View>
                )}

                <View style={styles.routeCard}>
                    <View style={styles.routeRow}>
                        <View style={styles.routeIconCol}>
                            <View style={styles.dotGreen} />
                            <View style={styles.routeLine} />
                        </View>
                        <View style={styles.routeFields}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.routeFieldLabel}>ALIŞ</Text>
                                <TouchableOpacity onPress={() => openAddressPicker('pickup')} activeOpacity={0.7}>
                                    <Text style={styles.savedBtn}>📍 Kayıtlı</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <TextInput
                                    style={[styles.routeMainInput, { flex: 1 }]}
                                    placeholder="Sokak adresi"
                                    placeholderTextColor={C.textMuted}
                                    value={pickup.address}
                                    onChangeText={v => setPickup(p => ({ ...p, address: v, lat: null, lon: null }))}
                                    onBlur={geocodePickup}
                                />
                                {geoLoading.pickup
                                    ? <ActivityIndicator size="small" color={C.primary} />
                                    : pickup.lat
                                        ? <Ionicons name="checkmark-circle" size={16} color={C.success} />
                                        : <Ionicons name="ellipse-outline" size={16} color={C.border} />
                                }
                            </View>
                            <View style={styles.cityRow}>
                                <TextInput
                                    style={[styles.cityInput, { flex: 1 }]}
                                    placeholder="Şehir"
                                    placeholderTextColor={C.textMuted}
                                    value={pickup.city}
                                    onChangeText={v => setPickup(p => ({ ...p, city: v, lat: null, lon: null }))}
                                    onBlur={geocodePickup}
                                />
                                <TextInput
                                    style={[styles.cityInput, { flex: 1 }]}
                                    placeholder="İlçe"
                                    placeholderTextColor={C.textMuted}
                                    value={pickup.district}
                                    onChangeText={v => setPickup(p => ({ ...p, district: v, lat: null, lon: null }))}
                                />
                            </View>
                        </View>
                        <TouchableOpacity style={styles.gpsBtn} onPress={useCurrentLocation} disabled={locLoading} activeOpacity={0.7}>
                            {locLoading ? <ActivityIndicator size="small" color={C.primary} /> : <Ionicons name="locate-outline" size={20} color={C.primary} />}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.routeRow}>
                        <View style={styles.routeIconCol}>
                            <View style={styles.dotAmber} />
                        </View>
                        <View style={[styles.routeFields, { zIndex: 100, elevation: 10 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.routeFieldLabel}>VARIŞ</Text>
                                <TouchableOpacity onPress={() => openAddressPicker('dropoff')} activeOpacity={0.7}>
                                    <Text style={styles.savedBtn}>📍 Kayıtlı</Text>
                                </TouchableOpacity>
                            </View>

                            {dropoffLocked ? (
                                <View style={styles.lockedBox}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.lockedAddr} numberOfLines={2}>{dropoff.address}</Text>
                                        {geoLoading.dropoff ? (
                                            <View style={styles.autoFilledRow}>
                                                <ActivityIndicator size="small" color={C.primary} />
                                                <Text style={[styles.autoFilledText, { color: C.textMuted }]}>Konum hesaplanıyor...</Text>
                                            </View>
                                        ) : (dropoff.district || dropoff.city) ? (
                                            <View style={styles.autoFilledRow}>
                                                <Ionicons name="location" size={12} color={C.success} />
                                                <Text style={styles.autoFilledText}>{[dropoff.district, dropoff.city].filter(Boolean).join(', ')}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                    <TouchableOpacity onPress={clearDropoff} style={styles.changeBtn} activeOpacity={0.7}>
                                        <Text style={styles.changeBtnText}>Değiştir</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <TextInput
                                            style={[styles.routeMainInput, { flex: 1 }]}
                                            placeholder="Varış adresi ara..."
                                            placeholderTextColor={C.textMuted}
                                            value={dropoffQuery}
                                            onChangeText={searchPlaces}
                                            autoCorrect={false}
                                        />
                                        {placesLoading
                                            ? <ActivityIndicator size="small" color={C.primary} />
                                            : <Ionicons name="search-outline" size={16} color={C.border} />
                                        }
                                    </View>
                                    {placeSuggestions.length > 0 && (
                                        <View style={styles.suggestionBox}>
                                            {placeSuggestions.map(p => (
                                                <TouchableOpacity
                                                    key={p.place_id}
                                                    style={styles.suggestionRow}
                                                    onPress={() => selectPlace(p)}
                                                    activeOpacity={0.75}
                                                >
                                                    <Ionicons name="location-outline" size={14} color={C.textMuted} style={{ marginTop: 1 }} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.suggestionMain} numberOfLines={1}>{p.structured_formatting?.main_text ?? p.description}</Text>
                                                        {p.structured_formatting?.secondary_text ? (
                                                            <Text style={styles.suggestionSub} numberOfLines={1}>{p.structured_formatting.secondary_text}</Text>
                                                        ) : null}
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </>
                            )}

                            {dropoffLocked && !hasApartmentInfo(dropoff.address) && (
                                <TextInput
                                    style={styles.noteInput}
                                    placeholder="Daire / kat / kapı notu (opsiyonel)"
                                    placeholderTextColor={C.textMuted}
                                    value={dropoffNote}
                                    onChangeText={setDropoffNote}
                                />
                            )}
                        </View>
                    </View>
                </View>

                {fare !== null && !fareLoading && (
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>GÜZERGAH TİPİ</Text>
                        <View style={styles.typeRow}>
                            {[
                                { val: 'normal', label: 'Normal',  icon: 'car-outline',   sub: 'Standart güzergah' },
                                { val: 'hizli',  label: 'Hızlı',   icon: 'flash-outline', sub: expressTolls.length ? `+₺${expressTolls.reduce((s,t)=>s+t.ucret,0).toFixed(0)} geçiş dahil` : 'En hızlı yol' },
                            ].map(({ val, label, icon, sub }) => (
                                <TouchableOpacity
                                    key={val}
                                    style={[styles.routeTypeBtn, routeType === val && styles.routeTypeBtnActive]}
                                    onPress={() => setRouteType(val)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name={icon} size={20} color={routeType === val ? C.darker : C.textMuted} />
                                    <Text style={[styles.routeTypeName, routeType === val && { color: C.darker }]}>{label}</Text>
                                    <Text style={[styles.routeTypeSub, routeType === val && { color: C.darker, opacity: 0.7 }]}>{sub}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>ZAMANLAMA</Text>
                    <View style={styles.typeRow}>
                        {[
                            { val: 'anlik',  label: 'Hemen',  icon: 'flash-outline' },
                            { val: 'planli', label: 'Planla', icon: 'calendar-outline' },
                        ].map(({ val, label, icon }) => (
                            <TouchableOpacity
                                key={val}
                                style={[styles.typeBtn, type === val && styles.typeBtnActive]}
                                onPress={() => setType(val)}
                                activeOpacity={0.8}
                            >
                                <Ionicons name={icon} size={16} color={type === val ? C.darker : C.textMuted} />
                                <Text style={[styles.typeBtnText, type === val && styles.typeBtnTextActive]}>{label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {type === 'planli' && (
                        <TouchableOpacity
                            style={styles.dateBtn}
                            onPress={() => {
                                if (Platform.OS === 'android') {
                                    DateTimePickerAndroid.open({
                                        value: departureTime, mode: 'date', minimumDate: new Date(),
                                        onChange: (ev, d) => {
                                            if (ev.type === 'set' && d) DateTimePickerAndroid.open({
                                                value: d, mode: 'time', is24Hour: true,
                                                onChange: (e2, t) => { if (e2.type === 'set' && t) setDepartureTime(t); },
                                            });
                                        },
                                    });
                                } else setShowDatePicker(true);
                            }}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="calendar-outline" size={16} color={C.primary} />
                            <Text style={styles.dateBtnText}>{departureTime.toLocaleString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                        </TouchableOpacity>
                    )}
                    {showDatePicker && Platform.OS === 'ios' && (
                        <DateTimePicker value={departureTime} mode="datetime" minimumDate={new Date()} onChange={(_, d) => { setShowDatePicker(false); if (d) setDepartureTime(d); }} />
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>NOTLAR (İSTEĞE BAĞLI)</Text>
                    <TextInput
                        style={styles.notesInput}
                        placeholder="Ör: köpek endişeli, saat 15'te ilaç alması gerekiyor..."
                        placeholderTextColor={C.textMuted}
                        value={notes}
                        onChangeText={setNotes}
                        multiline
                    />
                </View>

                {(fareLoading || fare !== null) && (
                    <View style={styles.fareCard}>
                        <View style={styles.fareTopRow}>
                            <Text style={styles.fareTitle}>Tahmini Ücret</Text>
                            {distance && (
                                <View style={styles.distancePill}>
                                    <Ionicons name="map-outline" size={12} color={C.textMuted} />
                                    <Text style={styles.distanceText}>{distance} km</Text>
                                </View>
                            )}
                        </View>
                        {fareLoading ? (
                            <View style={styles.fareLoadingRow}>
                                <ActivityIndicator color={C.primary} />
                                <Text style={styles.fareCalcText}>Hesaplanıyor...</Text>
                            </View>
                        ) : (
                            <>
                                {fareBreakdown && (
                                    <View style={styles.breakdown}>
                                        <BRow styles={styles} label="Açılış ücreti" value={`₺${fareBreakdown.acilis?.toFixed(2)}`} />
                                        <BRow styles={styles} label={`${fareBreakdown.km?.toFixed(1)} km × ₺${fareBreakdown.kmRate?.toFixed(2)}`} value={`₺${fareBreakdown.kmUcreti?.toFixed(2)}`} />
                                        {tollTotal > 0 && (
                                            <BRow
                                                styles={styles}
                                                label={routeType === 'hizli' ? '⚡ Hızlı güzergah geçişleri' : '📍 Otomatik geçişler'}
                                                value={`₺${tollTotal.toFixed(2)}`}
                                            />
                                        )}
                                        <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                                            <Text style={styles.breakdownTotalLabel}>Toplam</Text>
                                            <Text style={styles.fareAmount}>₺{(totalFare ?? fare).toFixed(2)}</Text>
                                        </View>
                                    </View>
                                )}
                                {!fareBreakdown && <Text style={styles.fareAmount}>₺{Number(fare).toFixed(2)}</Text>}
                            </>
                        )}
                        <Text style={styles.fareSub}>Gerçek mesafeye göre nihai fiyat belirlenir</Text>
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={!canConfirm}
                    activeOpacity={0.88}
                >
                    {submitting ? (
                        <ActivityIndicator color={C.darker} />
                    ) : (
                        <View style={styles.confirmBtnInner}>
                            <Text style={styles.confirmBtnText}>
                                {totalFare !== null ? `Yolculuğu Onayla · ₺${totalFare.toFixed(2)}` : 'Yolculuğu Onayla'}
                            </Text>
                            {fareLoading && <ActivityIndicator size="small" color={C.darker} style={{ marginLeft: 10 }} />}
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            <Modal visible={addrPicker !== null} transparent animationType="slide" onRequestClose={() => setAddrPicker(null)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.addrPickerSheet}>
                        <View style={styles.addrPickerHeader}>
                            <Text style={styles.addrPickerTitle}>📍 Kayıtlı Adresler</Text>
                            <TouchableOpacity onPress={() => setAddrPicker(null)} activeOpacity={0.7}>
                                <Ionicons name="close" size={22} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        {savedAddresses.length === 0 ? (
                            <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
                                <Text style={{ color: C.textMuted, fontSize: 14 }}>Kayıtlı adres yok</Text>
                                <TouchableOpacity onPress={() => { setAddrPicker(null); router.push('/my-addresses'); }} activeOpacity={0.8}>
                                    <Text style={{ color: C.primary, fontWeight: '700' }}>Adres Ekle →</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <FlatList
                                data={savedAddresses}
                                keyExtractor={item => String(item.id)}
                                style={{ maxHeight: 320 }}
                                renderItem={({ item }) => (
                                    <TouchableOpacity style={styles.addrPickerRow} onPress={() => selectSavedAddress(item)} activeOpacity={0.7}>
                                        <Text style={{ fontSize: 22 }}>
                                            {item.ad.toLowerCase().includes('ev') ? '🏠' :
                                             item.ad.toLowerCase().includes('iş') ? '🏢' : '📍'}
                                        </Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.addrPickerName}>{item.ad}</Text>
                                            <Text style={styles.addrPickerAddr} numberOfLines={1}>{item.adres}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                                    </TouchableOpacity>
                                )}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function hasApartmentInfo(address = '') {
    const lower = address.toLowerCase();
    return (
        /daire\s*\d/i.test(lower) ||
        /\bd\.\s*\d/i.test(lower) ||
        /\bkat\s*\d/i.test(lower) ||
        /\bk\.\s*\d/i.test(lower) ||
        /no\s*[:]\s*\d+\/\d+/i.test(lower) ||
        /\b\d+\/\d+\b/.test(lower)
    );
}

function BRow({ styles, label, value }) {
    return (
        <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>{label}</Text>
            <Text style={styles.breakdownValue}>{value}</Text>
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
    scroll: { flex: 1 },
    content:{ padding: 16, gap: 16, paddingBottom: 20 },

    warningCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.warning + '22', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.warning + '44' },
    warningText: { color: C.warning, fontSize: 13, flex: 1 },

    sectionLabel: { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
    section: { gap: 4 },

    dogRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dogChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 28, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: C.border },
    dogChipActive: { backgroundColor: C.primary, borderColor: C.primary },
    dogChipEmoji: { fontSize: 18 },
    dogChipName:  { color: C.text, fontWeight: '700', fontSize: 14 },
    dogChipBreed: { color: C.textMuted, fontSize: 11 },

    routeCard:    { backgroundColor: C.card, borderRadius: 18, padding: 16, gap: 0 },
    routeRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
    routeIconCol: { width: 14, alignItems: 'center', paddingTop: 14 },
    dotGreen:     { width: 14, height: 14, borderRadius: 7, backgroundColor: C.success },
    dotAmber:     { width: 14, height: 14, borderRadius: 3, backgroundColor: C.primary },
    routeLine:    { width: 2, flex: 1, backgroundColor: C.border, marginVertical: 4, minHeight: 40 },
    routeFields:  { flex: 1, gap: 8 },
    routeFieldLabel: { color: C.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
    routeMainInput: { color: C.text, fontSize: 15, fontWeight: '600', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    cityRow:      { flexDirection: 'row', gap: 8 },
    cityInput:    { backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: C.text, fontSize: 13 },
    gpsBtn:       { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginTop: 12 },

    savedBtn: { color: C.primary, fontSize: 12, fontWeight: '700' },

    lockedBox:   { backgroundColor: C.surface, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: C.success + '80' },
    lockedAddr:  { color: C.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
    changeBtn:   { backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
    changeBtnText:{ color: C.textMuted, fontSize: 12, fontWeight: '700' },
    noteInput:   { backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: C.text, fontSize: 13, borderWidth: 1, borderColor: C.border },

    suggestionBox: { backgroundColor: C.surface, borderRadius: 10, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginTop: 2 },
    suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    suggestionMain:{ color: C.text, fontSize: 13, fontWeight: '600' },
    suggestionSub: { color: C.textMuted, fontSize: 11, marginTop: 1 },
    autoFilledRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    autoFilledText:{ color: C.success, fontSize: 12, fontWeight: '600' },

    routeTypeBtn:      { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card, gap: 4 },
    routeTypeBtnActive:{ backgroundColor: C.primary, borderColor: C.primary },
    routeTypeName:     { color: C.textMuted, fontWeight: '700', fontSize: 15 },
    routeTypeSub:      { color: C.textMuted, fontSize: 11 },

    typeRow:   { flexDirection: 'row', gap: 10 },
    typeBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.card, borderRadius: 10, paddingVertical: 13, borderWidth: 1.5, borderColor: C.border },
    typeBtnActive:    { backgroundColor: C.primary, borderColor: C.primary },
    typeBtnText:      { color: C.textMuted, fontWeight: '700', fontSize: 14 },
    typeBtnTextActive:{ color: C.darker },
    dateBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 10, padding: 13, borderWidth: 1, borderColor: C.primary },
    dateBtnText:{ color: C.primary, fontWeight: '600' },

    notesInput: { backgroundColor: C.card, borderRadius: 12, padding: 13, color: C.text, fontSize: 14, minHeight: 70, textAlignVertical: 'top' },

    declarationCard:  { backgroundColor: C.card, borderRadius: 14, padding: 14, gap: 12 },
    declarationQ:     { color: C.text, fontSize: 13, fontWeight: '600', lineHeight: 20 },
    declarationBtns:  { flexDirection: 'row', gap: 10 },
    declBtn:          { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: C.border },
    declBtnText:      { color: C.textMuted, fontWeight: '700', fontSize: 14 },
    declInput:        { backgroundColor: C.surface, borderRadius: 10, padding: 12, color: C.text, fontSize: 13, minHeight: 60, textAlignVertical: 'top', borderWidth: 1, borderColor: C.danger + '44' },
    muzzleRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#f59e0b44' },
    checkboxBox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    muzzleText:       { color: C.text, fontSize: 12, flex: 1, lineHeight: 18 },
    declHint:         { color: C.danger, fontSize: 11 },

    fareCard:     { backgroundColor: C.darker, borderRadius: 16, padding: 18, gap: 12, borderWidth: 1, borderColor: C.primary + '55' },
    fareTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    fareTitle:    { color: C.textMuted, fontSize: 12, fontWeight: '600' },
    distancePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
    distanceText: { color: C.textMuted, fontSize: 12 },
    fareLoadingRow:{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
    fareCalcText: { color: C.textMuted, fontSize: 14 },
    fareAmount:   { color: C.primary, fontSize: 36, fontWeight: '900' },
    fareSub:      { color: C.textMuted, fontSize: 11 },

    breakdown:          { backgroundColor: C.card, borderRadius: 10, padding: 12, gap: 6 },
    breakdownRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    breakdownLabel:     { color: C.textMuted, fontSize: 13 },
    breakdownValue:     { color: C.text, fontSize: 13, fontWeight: '600' },
    breakdownTotal:     { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8, marginTop: 4 },
    breakdownTotalLabel:{ color: C.text, fontSize: 14, fontWeight: '700' },

    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.background, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: C.border },
    confirmBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
    confirmBtnDisabled: { opacity: 0.45 },
    confirmBtnInner:    { flexDirection: 'row', alignItems: 'center' },
    confirmBtnText:     { color: C.darker, fontWeight: '800', fontSize: 18 },

    modalOverlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    addrPickerSheet:  { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
    addrPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    addrPickerTitle:  { color: C.text, fontSize: 18, fontWeight: '800' },
    addrPickerRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: C.border },
    addrPickerName:   { color: C.text, fontSize: 14, fontWeight: '700' },
    addrPickerAddr:   { color: C.textMuted, fontSize: 12, marginTop: 2 },
});
