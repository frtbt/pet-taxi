/**
 * Book a Ride — Uber-style layout
 * Pickup/dropoff route card, auto fare, sticky confirm CTA
 */
import { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import taxiApi from '../src/api/taxiClient';
import Colors from '../src/theme/colors';

export default function CreateRequestScreen() {
    const router = useRouter();

    const [dogs, setDogs]             = useState([]);
    const [dogsLoading, setDogsLoading] = useState(true);
    const [selectedDog, setSelectedDog] = useState(null);

    const [pickup,  setPickup]  = useState({ address: '', city: '', district: '', lat: null, lon: null });
    const [dropoff, setDropoff] = useState({ address: '', city: '', district: '', lat: null, lon: null });

    const [type, setType]                 = useState('anlik');
    const [departureTime, setDepartureTime] = useState(new Date(Date.now() + 30 * 60000));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [notes, setNotes]               = useState('');

    const [fare, setFare]               = useState(null);
    const [fareBreakdown, setFareBreakdown] = useState(null); // { acilis, km, kmRate, kmUcreti }
    const [tolls, setTolls]             = useState([]);       // mevcut geçiş ücretleri
    const [selectedTolls, setSelectedTolls] = useState({});   // { id: true/false }
    const [distance, setDistance]       = useState(null);
    const [fareLoading, setFareLoading] = useState(false);
    const [locLoading, setLocLoading]   = useState(false);
    const [geoLoading, setGeoLoading]   = useState({ pickup: false, dropoff: false });
    const [submitting, setSubmitting]   = useState(false);

    useEffect(() => {
        taxiApi.getMyDogs().then(res => {
            const list = res.dogs ?? [];
            setDogs(list);
            if (list.length === 1) setSelectedDog(list[0]);
            setDogsLoading(false);
        });
    }, []);

    // Auto-calculate fare whenever both coordinates are available
    useEffect(() => {
        if (pickup.lat && dropoff.lat) computeFare();
    }, [pickup.lat, pickup.lon, dropoff.lat, dropoff.lon]);

    async function geocodeLocation(type) {
        const loc = type === 'pickup' ? pickup : dropoff;
        if (!loc.address && !loc.city) return;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        setGeoLoading(prev => ({ ...prev, [type]: true }));
        try {
            const query = [loc.address, loc.district, loc.city, 'Türkiye'].filter(Boolean).join(', ');
            const results = await Location.geocodeAsync(query);
            if (results.length > 0) {
                const { latitude, longitude } = results[0];
                if (type === 'pickup') {
                    setPickup(p => ({ ...p, lat: latitude, lon: longitude }));
                } else {
                    setDropoff(p => ({ ...p, lat: latitude, lon: longitude }));
                }
            }
        } catch {}
        setGeoLoading(prev => ({ ...prev, [type]: false }));
    }

    async function computeFare() {
        setFareLoading(true);
        try {
            // Haversine — sunucu OSRM ile override eder, bu sadece fallback
            const R = 6371;
            const toRad = d => d * Math.PI / 180;
            const dLat = toRad(dropoff.lat - pickup.lat);
            const dLon = toRad(dropoff.lon - pickup.lon);
            const a = Math.sin(dLat/2)**2
                + Math.cos(toRad(pickup.lat)) * Math.cos(toRad(dropoff.lat)) * Math.sin(dLon/2)**2;
            const haversineKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            setDistance(haversineKm.toFixed(1));

            // Sunucuya koordinatları gönder — OSRM ile gerçek yol km hesaplar
            const res = await taxiApi.getFareEstimate(
                haversineKm.toFixed(2),
                pickup.lat, pickup.lon, dropoff.lat, dropoff.lon
            );
            if (res.success) {
                setFare(res.tahmini_ucret);
                setDistance(Number(res.km).toFixed(1));
                setFareBreakdown({
                    acilis:   res.acilis_ucreti,
                    km:       res.km,
                    kmRate:   res.km_basi_ucret,
                    kmUcreti: res.km_ucreti,
                });
                if (res.gecis_ucretleri?.length) {
                    setTolls(res.gecis_ucretleri);
                    setSelectedTolls(prev => {
                        const next = {};
                        res.gecis_ucretleri.forEach(t => {
                            next[t.id] = t.otomatik ? true : (prev[t.id] ?? false);
                        });
                        return next;
                    });
                }
            }
        } catch {}
        setFareLoading(false);
    }

    // Seçili geçişlerin toplamı
    const tollTotal = tolls.reduce((sum, t) => sum + (selectedTolls[t.id] ? t.ucret : 0), 0);
    const totalFare = fare !== null ? Number(fare) + tollTotal : null;

    async function useCurrentLocation() {
        setLocLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('İzin Gerekli', 'Konum izni gereklidir.');
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const { latitude, longitude } = loc.coords;
            const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
            if (geo.length > 0) {
                const g = geo[0];
                setPickup({
                    address:  [g.street, g.streetNumber].filter(Boolean).join(' ') || g.name || '',
                    city:     g.city ?? '',
                    district: g.district ?? g.subregion ?? '',
                    lat: latitude, lon: longitude,
                });
            }
        } catch (e) {
            Alert.alert('Error', e.message);
        }
        setLocLoading(false);
    }

    async function handleSubmit() {
        if (!selectedDog)                         { Alert.alert('Köpek Seçin', 'Hangi köpeğin seyahat edeceğini seçin.'); return; }
        if (!pickup.address || !pickup.city)      { Alert.alert('Alış Adresi Gerekli', 'Alış adresinizi girin.'); return; }
        if (!dropoff.address || !dropoff.city)    { Alert.alert('Bırakış Adresi Gerekli', 'Hedef adresini girin.'); return; }

        setSubmitting(true);
        const res = await taxiApi.createRequest({
            kopek_id:          selectedDog.id,
            kalkis_zamani:     departureTime.toISOString().slice(0, 19).replace('T', ' '),
            baslangic_noktasi: pickup.address,
            baslangic_sehir:   pickup.city,
            baslangic_ilce:    pickup.district || pickup.city,
            baslangic_lat:     pickup.lat,
            baslangic_lon:     pickup.lon,
            varis_noktasi:     dropoff.address,
            varis_sehir:       dropoff.city,
            varis_ilce:        dropoff.district || dropoff.city,
            varis_lat:         dropoff.lat,
            varis_lon:         dropoff.lon,
            toplam_ucret:      totalFare ?? fare,
            tip:               type,
            ozel_talepler:     notes || null,
        });
        setSubmitting(false);

        if (res.success) {
            router.replace('/(tabs)');
        } else {
            Alert.alert('Hata', res.error ?? 'Talep oluşturulamadı.');
        }
    }

    if (dogsLoading) {
        return <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    }

    const canConfirm = !!selectedDog && !!pickup.address && !!dropoff.address && !submitting;

    return (
        <View style={s.root}>
            <ScrollView
                style={s.scroll}
                contentContainerStyle={s.content}
                keyboardShouldPersistTaps="handled"
            >
                {/* ── Dog Selection ──────────────────────────────────── */}
                {dogs.length === 0 ? (
                    <View style={s.warningCard}>
                        <Ionicons name="paw-outline" size={22} color={Colors.warning} />
                        <Text style={s.warningText}>Kayıtlı köpek yok. Köpeklerim sekmesinden ekleyin.</Text>
                    </View>
                ) : (
                    <View style={s.section}>
                        <Text style={s.sectionLabel}>YOLCULUK EDECEK</Text>
                        <View style={s.dogRow}>
                            {dogs.map(dog => (
                                <TouchableOpacity
                                    key={dog.id}
                                    style={[s.dogChip, selectedDog?.id === dog.id && s.dogChipActive]}
                                    onPress={() => setSelectedDog(dog)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={s.dogChipEmoji}>🐾</Text>
                                    <View>
                                        <Text style={[s.dogChipName, selectedDog?.id === dog.id && { color: Colors.darker }]}>
                                            {dog.isim}
                                        </Text>
                                        {dog.irk ? (
                                            <Text style={[s.dogChipBreed, selectedDog?.id === dog.id && { color: Colors.darker, opacity: 0.7 }]}>
                                                {dog.irk}
                                            </Text>
                                        ) : null}
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* ── Route Card ─────────────────────────────────────── */}
                <View style={s.routeCard}>
                    {/* Pickup row */}
                    <View style={s.routeRow}>
                        <View style={s.routeIconCol}>
                            <View style={s.dotGreen} />
                            <View style={s.routeLine} />
                        </View>
                        <View style={s.routeFields}>
                            <Text style={s.routeFieldLabel}>ALIŞ</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <TextInput
                                    style={[s.routeMainInput, { flex: 1 }]}
                                    placeholder="Sokak adresi"
                                    placeholderTextColor={Colors.textMuted}
                                    value={pickup.address}
                                    onChangeText={v => setPickup(p => ({ ...p, address: v, lat: null, lon: null }))}
                                    onBlur={() => geocodeLocation('pickup')}
                                />
                                {geoLoading.pickup
                                    ? <ActivityIndicator size="small" color={Colors.primary} />
                                    : pickup.lat
                                        ? <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                                        : <Ionicons name="ellipse-outline" size={16} color={Colors.border} />
                                }
                            </View>
                            <View style={s.cityRow}>
                                <TextInput
                                    style={[s.cityInput, { flex: 1 }]}
                                    placeholder="Şehir"
                                    placeholderTextColor={Colors.textMuted}
                                    value={pickup.city}
                                    onChangeText={v => setPickup(p => ({ ...p, city: v, lat: null, lon: null }))}
                                    onBlur={() => geocodeLocation('pickup')}
                                />
                                <TextInput
                                    style={[s.cityInput, { flex: 1 }]}
                                    placeholder="İlçe"
                                    placeholderTextColor={Colors.textMuted}
                                    value={pickup.district}
                                    onChangeText={v => setPickup(p => ({ ...p, district: v, lat: null, lon: null }))}
                                />
                            </View>
                        </View>
                        <TouchableOpacity style={s.gpsBtn} onPress={useCurrentLocation} disabled={locLoading} activeOpacity={0.7}>
                            {locLoading
                                ? <ActivityIndicator size="small" color={Colors.primary} />
                                : <Ionicons name="locate-outline" size={20} color={Colors.primary} />
                            }
                        </TouchableOpacity>
                    </View>

                    {/* Dropoff row */}
                    <View style={s.routeRow}>
                        <View style={s.routeIconCol}>
                            <View style={s.dotAmber} />
                        </View>
                        <View style={s.routeFields}>
                            <Text style={s.routeFieldLabel}>BIRAKIŞ</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <TextInput
                                    style={[s.routeMainInput, { flex: 1 }]}
                                    placeholder="Varış adresi"
                                    placeholderTextColor={Colors.textMuted}
                                    value={dropoff.address}
                                    onChangeText={v => setDropoff(p => ({ ...p, address: v, lat: null, lon: null }))}
                                    onBlur={() => geocodeLocation('dropoff')}
                                />
                                {geoLoading.dropoff
                                    ? <ActivityIndicator size="small" color={Colors.primary} />
                                    : dropoff.lat
                                        ? <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                                        : <Ionicons name="ellipse-outline" size={16} color={Colors.border} />
                                }
                            </View>
                            <View style={s.cityRow}>
                                <TextInput
                                    style={[s.cityInput, { flex: 1 }]}
                                    placeholder="Şehir"
                                    placeholderTextColor={Colors.textMuted}
                                    value={dropoff.city}
                                    onChangeText={v => setDropoff(p => ({ ...p, city: v, lat: null, lon: null }))}
                                    onBlur={() => geocodeLocation('dropoff')}
                                />
                                <TextInput
                                    style={[s.cityInput, { flex: 1 }]}
                                    placeholder="İlçe"
                                    placeholderTextColor={Colors.textMuted}
                                    value={dropoff.district}
                                    onChangeText={v => setDropoff(p => ({ ...p, district: v, lat: null, lon: null }))}
                                />
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── Timing ─────────────────────────────────────────── */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>ZAMANLAMA</Text>
                    <View style={s.typeRow}>
                        {[
                            { val: 'anlik',  label: 'Hemen',  icon: 'flash-outline' },
                            { val: 'planli', label: 'Planla', icon: 'calendar-outline' },
                        ].map(({ val, label, icon }) => (
                            <TouchableOpacity
                                key={val}
                                style={[s.typeBtn, type === val && s.typeBtnActive]}
                                onPress={() => setType(val)}
                                activeOpacity={0.8}
                            >
                                <Ionicons name={icon} size={16} color={type === val ? Colors.darker : Colors.textMuted} />
                                <Text style={[s.typeBtnText, type === val && s.typeBtnTextActive]}>{label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {type === 'planli' && (
                        <TouchableOpacity
                            style={s.dateBtn}
                            onPress={() => {
                                if (Platform.OS === 'android') {
                                    DateTimePickerAndroid.open({
                                        value: departureTime,
                                        mode: 'date',
                                        minimumDate: new Date(),
                                        onChange: (ev, selectedDate) => {
                                            if (ev.type === 'set' && selectedDate) {
                                                DateTimePickerAndroid.open({
                                                    value: selectedDate,
                                                    mode: 'time',
                                                    is24Hour: true,
                                                    onChange: (e2, selectedTime) => {
                                                        if (e2.type === 'set' && selectedTime) {
                                                            setDepartureTime(selectedTime);
                                                        }
                                                    },
                                                });
                                            }
                                        },
                                    });
                                } else {
                                    setShowDatePicker(true);
                                }
                            }}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                            <Text style={s.dateBtnText}>
                                {departureTime.toLocaleString('tr-TR', {
                                    weekday: 'short', day: '2-digit', month: 'short',
                                    hour: '2-digit', minute: '2-digit',
                                })}
                            </Text>
                        </TouchableOpacity>
                    )}
                    {showDatePicker && Platform.OS === 'ios' && (
                        <DateTimePicker
                            value={departureTime}
                            mode="datetime"
                            minimumDate={new Date()}
                            onChange={(_, date) => {
                                setShowDatePicker(false);
                                if (date) setDepartureTime(date);
                            }}
                        />
                    )}
                </View>

                {/* ── Notes ──────────────────────────────────────────── */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>NOTLAR (İSTEĞE BAĞLI)</Text>
                    <TextInput
                        style={s.notesInput}
                        placeholder="Ör: köpek endişeli, saat 15'te ilaç alması gerekiyor..."
                        placeholderTextColor={Colors.textMuted}
                        value={notes}
                        onChangeText={setNotes}
                        multiline
                    />
                </View>

                {/* ── Fare Card ──────────────────────────────────────── */}
                {(fareLoading || fare !== null) && (
                    <View style={s.fareCard}>
                        <View style={s.fareTopRow}>
                            <Text style={s.fareTitle}>Tahmini Ücret</Text>
                            {distance && (
                                <View style={s.distancePill}>
                                    <Ionicons name="map-outline" size={12} color={Colors.textMuted} />
                                    <Text style={s.distanceText}>{distance} km</Text>
                                </View>
                            )}
                        </View>

                        {fareLoading ? (
                            <View style={s.fareLoadingRow}>
                                <ActivityIndicator color={Colors.primary} />
                                <Text style={s.fareCalcText}>Hesaplanıyor...</Text>
                            </View>
                        ) : (
                            <>
                                {/* Döküm */}
                                {fareBreakdown && (
                                    <View style={s.breakdown}>
                                        <View style={s.breakdownRow}>
                                            <Text style={s.breakdownLabel}>Açılış ücreti</Text>
                                            <Text style={s.breakdownValue}>₺{fareBreakdown.acilis?.toFixed(2)}</Text>
                                        </View>
                                        <View style={s.breakdownRow}>
                                            <Text style={s.breakdownLabel}>{fareBreakdown.km?.toFixed(1)} km × ₺{fareBreakdown.kmRate?.toFixed(2)}</Text>
                                            <Text style={s.breakdownValue}>₺{fareBreakdown.kmUcreti?.toFixed(2)}</Text>
                                        </View>
                                        {tollTotal > 0 && (
                                            <View style={s.breakdownRow}>
                                                <Text style={s.breakdownLabel}>Geçiş ücretleri</Text>
                                                <Text style={s.breakdownValue}>₺{tollTotal.toFixed(2)}</Text>
                                            </View>
                                        )}
                                        <View style={[s.breakdownRow, s.breakdownTotal]}>
                                            <Text style={s.breakdownTotalLabel}>Toplam</Text>
                                            <Text style={s.fareAmount}>₺{(totalFare ?? fare).toFixed(2)}</Text>
                                        </View>
                                    </View>
                                )}
                                {!fareBreakdown && (
                                    <Text style={s.fareAmount}>₺{Number(fare).toFixed(2)}</Text>
                                )}
                            </>
                        )}

                        {/* Geçiş Ücretleri — 3 bölüm: Otomatik / Hızlı Güzergah / Opsiyonel */}
                        {!fareLoading && tolls.length > 0 && (() => {
                            const autoTolls    = tolls.filter(t => t.otomatik);
                            const expressTolls = tolls.filter(t => !t.otomatik && t.express);
                            const optTolls     = tolls.filter(t => !t.otomatik && !t.express);
                            const TollRow = ({ toll, locked }) => (
                                <TouchableOpacity
                                    key={toll.id}
                                    style={s.tollRow}
                                    onPress={() => !locked && setSelectedTolls(prev => ({ ...prev, [toll.id]: !prev[toll.id] }))}
                                    activeOpacity={locked ? 1 : 0.7}
                                >
                                    <View style={[s.checkbox, selectedTolls[toll.id] && s.checkboxChecked, locked && s.checkboxLocked]}>
                                        {selectedTolls[toll.id]
                                            ? <Ionicons name={locked ? 'navigate' : 'checkmark'} size={12} color={Colors.darker} />
                                            : null
                                        }
                                    </View>
                                    <Text style={[s.tollName, locked && { color: Colors.text }]}>{toll.ad}</Text>
                                    {locked && <Text style={s.tollRouteTag}>güzergahta</Text>}
                                    {toll.gece && <Text style={s.tollNight}>🌙</Text>}
                                    <Text style={[s.tollPrice, locked && { color: Colors.text }]}>₺{Number(toll.ucret).toFixed(2)}</Text>
                                </TouchableOpacity>
                            );
                            return (
                                <>
                                    {autoTolls.length > 0 && (
                                        <View style={s.tollSection}>
                                            <Text style={s.tollSectionLabel}>📍 GEÇİŞLER (GÜZERGAHTA DAHİL)</Text>
                                            {autoTolls.map(toll => <TollRow key={toll.id} toll={toll} locked />)}
                                        </View>
                                    )}
                                    {expressTolls.length > 0 && (
                                        <View style={[s.tollSection, s.tollSectionExpress]}>
                                            <Text style={[s.tollSectionLabel, { color: Colors.primary }]}>⚡ HIZLI GÜZERGAH SEÇENEĞİ</Text>
                                            <Text style={s.tollExpressHint}>Sürücü standart köprü yerine tüneli kullanır</Text>
                                            {expressTolls.map(toll => <TollRow key={toll.id} toll={toll} locked={false} />)}
                                        </View>
                                    )}
                                    {optTolls.length > 0 && (
                                        <View style={s.tollSection}>
                                            <Text style={s.tollSectionLabel}>GEÇİŞ ÜCRETLERİ</Text>
                                            {optTolls.map(toll => <TollRow key={toll.id} toll={toll} locked={false} />)}
                                        </View>
                                    )}
                                </>
                            );
                        })()}

                        <Text style={s.fareSub}>Gerçek mesafeye göre nihai fiyat belirlenir</Text>
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* ── Sticky Bottom CTA ──────────────────────────────────── */}
            <View style={s.bottomBar}>
                <TouchableOpacity
                    style={[s.confirmBtn, !canConfirm && s.confirmBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={!canConfirm}
                    activeOpacity={0.88}
                >
                    {submitting ? (
                        <ActivityIndicator color={Colors.darker} />
                    ) : (
                        <View style={s.confirmBtnInner}>
                            <Text style={s.confirmBtnText}>
                                {totalFare !== null
                                    ? `Yolculuğu Onayla · ₺${totalFare.toFixed(2)}`
                                    : 'Yolculuğu Onayla'
                                }
                            </Text>
                            {fareLoading && (
                                <ActivityIndicator size="small" color={Colors.darker} style={{ marginLeft: 10 }} />
                            )}
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: Colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
    scroll: { flex: 1 },
    content:{ padding: 16, gap: 16, paddingBottom: 20 },

    warningCard: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#2a1f00', borderRadius: 12, padding: 14,
        borderWidth: 1, borderColor: Colors.warning + '44',
    },
    warningText: { color: Colors.warning, fontSize: 13, flex: 1 },

    sectionLabel: {
        color: Colors.textMuted, fontSize: 10, fontWeight: '700',
        letterSpacing: 1.5, marginBottom: 6,
    },
    section: { gap: 4 },

    // Dog chips
    dogRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dogChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: Colors.card, borderRadius: 28,
        paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1.5, borderColor: Colors.border,
    },
    dogChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    dogChipEmoji:  { fontSize: 18 },
    dogChipName:   { color: Colors.text, fontWeight: '700', fontSize: 14 },
    dogChipBreed:  { color: Colors.textMuted, fontSize: 11 },

    // Route card
    routeCard: {
        backgroundColor: Colors.card, borderRadius: 18,
        padding: 16, gap: 0,
    },
    routeRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
    routeIconCol:{ width: 14, alignItems: 'center', paddingTop: 14 },
    dotGreen:    { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.success },
    dotAmber:    { width: 14, height: 14, borderRadius: 3, backgroundColor: Colors.primary },
    routeLine:   { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 4, minHeight: 40 },
    routeFields: { flex: 1, gap: 8 },
    routeFieldLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
    routeMainInput: {
        color: Colors.text, fontSize: 15, fontWeight: '600',
        paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    cityRow: { flexDirection: 'row', gap: 8 },
    cityInput: {
        backgroundColor: Colors.surface, borderRadius: 8,
        paddingHorizontal: 10, paddingVertical: 8,
        color: Colors.text, fontSize: 13,
    },
    gpsBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: Colors.surface,
        alignItems: 'center', justifyContent: 'center',
        marginTop: 12,
    },

    // Timing
    typeRow:         { flexDirection: 'row', gap: 10 },
    typeBtn:         {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: Colors.card, borderRadius: 10, paddingVertical: 13,
        borderWidth: 1.5, borderColor: Colors.border,
    },
    typeBtnActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
    typeBtnText:     { color: Colors.textMuted, fontWeight: '700', fontSize: 14 },
    typeBtnTextActive: { color: Colors.darker },
    dateBtn:         {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: Colors.card, borderRadius: 10, padding: 13,
        borderWidth: 1, borderColor: Colors.primary,
    },
    dateBtnText:     { color: Colors.primary, fontWeight: '600' },

    // Notes
    notesInput: {
        backgroundColor: Colors.card, borderRadius: 12, padding: 13,
        color: Colors.text, fontSize: 14, minHeight: 70, textAlignVertical: 'top',
    },

    // Fare card
    fareCard: {
        backgroundColor: Colors.darker, borderRadius: 16, padding: 18, gap: 12,
        borderWidth: 1, borderColor: Colors.primary + '55',
    },
    fareTopRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    fareTitle:      { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
    distancePill:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.card, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
    distanceText:   { color: Colors.textMuted, fontSize: 12 },
    fareLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
    fareCalcText:   { color: Colors.textMuted, fontSize: 14 },
    fareAmount:     { color: Colors.primary, fontSize: 36, fontWeight: '900' },
    fareSub:        { color: Colors.textMuted, fontSize: 11 },

    // Fare breakdown
    breakdown:          { backgroundColor: Colors.card, borderRadius: 10, padding: 12, gap: 6 },
    breakdownRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    breakdownLabel:     { color: Colors.textMuted, fontSize: 13 },
    breakdownValue:     { color: Colors.text, fontSize: 13, fontWeight: '600' },
    breakdownTotal:     { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, marginTop: 4 },
    breakdownTotalLabel:{ color: Colors.text, fontSize: 14, fontWeight: '700' },

    // Toll selection
    tollSection:        { backgroundColor: Colors.card, borderRadius: 10, padding: 12, gap: 8 },
    tollSectionExpress: { borderWidth: 1, borderColor: Colors.primary + '55' },
    tollSectionLabel:   { color: Colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    tollExpressHint:    { color: Colors.textMuted, fontSize: 11, marginTop: -4 },
    tollRow:            { flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkbox:           {
        width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    checkboxChecked:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
    checkboxLocked:     { backgroundColor: Colors.success + 'cc', borderColor: Colors.success },
    tollName:           { flex: 1, color: Colors.textMuted, fontSize: 14 },
    tollRouteTag:       { color: Colors.success, fontSize: 10, fontWeight: '700' },
    tollNight:          { color: Colors.warning, fontSize: 11 },
    tollPrice:          { color: Colors.primary, fontSize: 14, fontWeight: '700' },

    // Bottom bar
    bottomBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Colors.background,
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28,
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    confirmBtn: {
        backgroundColor: Colors.primary, borderRadius: 14,
        paddingVertical: 17, alignItems: 'center', justifyContent: 'center',
    },
    confirmBtnDisabled: { opacity: 0.45 },
    confirmBtnInner: { flexDirection: 'row', alignItems: 'center' },
    confirmBtnText:  { color: Colors.darker, fontWeight: '800', fontSize: 18 },
});
