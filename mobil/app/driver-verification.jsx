import { useState, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, Image, TextInput, Switch,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import taxiApi from '../src/api/taxiClient';
import { compressImage } from '../src/utils/compressImage';
import { useTheme } from '../src/context/ThemeContext';

const ALAN_BILGI = {
    profil_foto:       { step: 1, label: 'Profil Fotoğrafı' },
    ehliyet_on:        { step: 1, label: 'Ehliyet Ön Yüz' },
    ehliyet_arka:      { step: 1, label: 'Ehliyet Arka Yüz' },
    adli_sicil:        { step: 1, label: 'Adli Sicil Belgesi' },
    arac_bilgileri:    { step: 2, label: 'Araç Bilgileri' },
    ruhsat_foto:       { step: 2, label: 'Araç Ruhsatı' },
    ic_gorseller:      { step: 2, label: 'Araç İçi Görseller' },
    hayvan_tercihleri: { step: 3, label: 'Hayvan Türleri & Ekipmanlar' },
};

const STEPS = [
    { title: 'Kimlik',    icon: 'id-card-outline' },
    { title: 'Araç',      icon: 'car-outline' },
    { title: 'Hayvanlar', icon: 'paw-outline' },
    { title: 'Onay',      icon: 'shield-checkmark-outline' },
];

const PET_RULES = [
    '1. Klima / Havalandırma: Tüm yolculuk boyunca araç içi hava dolaşımı sağlanmalıdır.',
    '2. Güvenli taşıma: Hayvan emniyet kemeri, koltuk kutusu veya taşıma kafesiyle sabitlenmelidir.',
    '3. Acil iletişim: Kaza veya sağlık acilinde sürücü hayvan sahibini ve gerekirse veterineri aramalıdır.',
    '4. Temizlik sorumluluğu: Yolculuk kaynaklı kir/hasar için ek temizlik ücreti sahibe yansıtılabilir.',
    '5. Bildirim zorunluluğu: Agresif, tedavisiz veya aşısız hayvanlar önceden beyan edilmelidir.',
    '6. Sürüş güvenliği: Hareket halindeyken hayvanla etkileşim sürücünün dikkatini dağıtmamalıdır.',
    '7. Hijyen: Araç içinde sigara, alkol veya yoğun koku içeren maddeler bulundurulamaz.',
    '8. Sorumluluk: Sürücü, yolculuk boyunca hayvanın fiziksel güvenliğini sağlamakla yükümlüdür.',
    '9. İptal politikası: Yolculuk başladıktan sonra iptallerde ücretin %50\'si sürücüye ödenir.',
    '10. Gizlilik: Hayvan ve sahip bilgileri üçüncü şahıslarla paylaşılamaz.',
];

export default function DriverVerification() {
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);

    const [loading,       setLoading]       = useState(true);
    const [saving,        setSaving]        = useState(false);
    const [currentStep,   setCurrentStep]   = useState(1);
    const [completedStep, setCompletedStep] = useState(0);
    const [driverDurum,   setDriverDurum]   = useState('taslak');
    const [errors,        setErrors]        = useState([]);
    const [eksikAlanlar,  setEksikAlanlar]  = useState([]);

    const [kvkkRiza, setKvkkRiza] = useState(false);

    const [animalTypes,   setAnimalTypes]   = useState([]);
    const [equipmentList, setEquipmentList] = useState([]);

    const [photos, setPhotos] = useState({
        profil_foto:  null,
        ehliyet_on:   null,
        ehliyet_arka: null,
        adli_sicil:   null,
        ruhsat_foto:  null,
        ic_gorseller: [],
    });
    const b64 = useRef({
        profil_foto:  null,
        ehliyet_on:   null,
        ehliyet_arka: null,
        adli_sicil:   null,
        ruhsat_foto:  null,
        ic_gorseller: [],
    });
    const uploadedPhotoUrls = useRef({});

    const [form, setForm] = useState({
        marka: '', model: '', yil: '', plaka: '',
        klima_taahhut:  false,
        hayvan_turleri: [],
        ekipmanlar:     [],
        allerji_beyan:  false,
        kurallar_kabul: false,
    });

    const isReadOnly = driverDurum === 'onaylandi';
    const hasEksik   = eksikAlanlar.length > 0;
    const isEksik    = (alan) => eksikAlanlar.includes(alan);
    const canJumpTo  = (step) => hasEksik && !isReadOnly && completedStep >= step - 1;

    useFocusEffect(useCallback(() => {
        let active = true;
        (async () => {
            setLoading(true);
            const res = await taxiApi.getDriverOnboardingConfig();
            if (!active) return;
            setLoading(false);
            if (!res.success) return;

            setAnimalTypes(res.animal_types ?? []);
            setEquipmentList(res.equipments ?? []);

            const driver  = res.driver;
            const vehicle = res.vehicle;
            const vPhotos = res.vehicle_photos ?? [];

            if (driver) {
                setDriverDurum(driver.durum);
                const done = parseInt(driver.adim_tamamlanan ?? 0);
                setCompletedStep(done);

                const ea = driver.eksik_alanlar
                    ? (typeof driver.eksik_alanlar === 'string'
                        ? JSON.parse(driver.eksik_alanlar)
                        : driver.eksik_alanlar)
                    : [];
                setEksikAlanlar(ea);
                const firstProblematicStep = ea.length > 0
                    ? Math.min(...ea.map(a => ALAN_BILGI[a]?.step ?? 4))
                    : null;
                setCurrentStep(firstProblematicStep ?? Math.min(done + 1, 4));

                setPhotos({
                    profil_foto:  driver.profil_foto  ? { uri: driver.profil_foto,   isExisting: true } : null,
                    ehliyet_on:   driver.ehliyet_on   ? { uri: driver.ehliyet_on,    isExisting: true } : null,
                    ehliyet_arka: driver.ehliyet_arka ? { uri: driver.ehliyet_arka,  isExisting: true } : null,
                    adli_sicil:   driver.adli_sicil   ? { uri: driver.adli_sicil,    isExisting: true } : null,
                    ruhsat_foto:  vehicle?.ruhsat_foto ? { uri: vehicle.ruhsat_foto, isExisting: true } : null,
                    ic_gorseller: vPhotos.map(p => ({ uri: p.foto_url, isExisting: true })),
                });

                setForm(f => ({
                    ...f,
                    marka:         vehicle?.marka  ?? '',
                    model:         vehicle?.model  ?? '',
                    yil:           vehicle?.yil    ? String(vehicle.yil) : '',
                    plaka:         vehicle?.plaka  ?? '',
                    klima_taahhut: !!vehicle?.klima_taahhut,
                    hayvan_turleri: (res.allowed_animals  ?? []).map(Number),
                    ekipmanlar:    (res.driver_equipments ?? []).map(Number),
                    allerji_beyan: !!driver.allerji_beyan,
                }));
            }
        })();
        return () => { active = false; };
    }, []));

    async function applyPhoto(field, picked) {
        let asset;
        try { asset = await compressImage(picked); }
        catch { Alert.alert('Hata', 'Fotoğraf işlenemedi. Lütfen tekrar deneyin.'); return; }
        b64.current[field] = asset.base64 ?? null;
        setPhotos(p => ({ ...p, [field]: { uri: asset.uri, isExisting: false } }));
    }

    async function pickPhoto(field) {
        if (isReadOnly) return;
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        const cameraOk = status === 'granted';
        Alert.alert(
            'Fotoğraf Seç',
            cameraOk ? 'Nasıl yüklemek istersiniz?' : 'Kamera izni yok. Galeriden seçebilirsiniz.',
            [
                ...(cameraOk ? [{ text: 'Kamera', onPress: async () => {
                    const r = await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: true, aspect: [4, 3] });
                    if (!r.canceled) applyPhoto(field, r.assets[0]);
                } }] : []),
                { text: 'Galeriden Seç', onPress: async () => {
                    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, allowsEditing: true, aspect: [4, 3] });
                    if (!r.canceled) applyPhoto(field, r.assets[0]);
                } },
                { text: 'İptal', style: 'cancel' },
            ]
        );
    }

    async function pickAdliSicil() {
        if (isReadOnly) return;
        Alert.alert(
            'Adli Sicil Belgesi',
            'Nasıl yüklemek istersiniz?',
            [
                { text: 'Fotoğraf / Galeriden', onPress: () => pickPhoto('adli_sicil') },
                { text: 'PDF Dosyası', onPress: async () => {
                    try {
                        const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
                        if (result.canceled) return;
                        const file = result.assets[0];
                        // Sunucu ~1 MB üstü istekleri reddediyor; base64 boyutu ~%33 artırır
                        if (file.size > 700_000) { Alert.alert('Dosya Çok Büyük', "Lütfen 700 KB'den küçük bir PDF seçin ya da belgenin fotoğrafını yükleyin."); return; }
                        const response = await fetch(file.uri);
                        const blob = await response.blob();
                        const reader = new FileReader();
                        reader.onload = () => {
                            const base64 = reader.result.split(',')[1];
                            b64.current['adli_sicil'] = 'pdf:' + base64;
                            setPhotos(p => ({ ...p, adli_sicil: { uri: file.uri, isExisting: false, isPdf: true, name: file.name } }));
                        };
                        reader.readAsDataURL(blob);
                    } catch {
                        Alert.alert('Hata', 'PDF seçilirken bir sorun oluştu.');
                    }
                }},
                { text: 'İptal', style: 'cancel' },
            ]
        );
    }

    async function addVehiclePhoto() {
        if (isReadOnly) return;
        if (photos.ic_gorseller.length >= 6) {
            Alert.alert('Limit Doldu', 'En fazla 6 araç içi görsel ekleyebilirsiniz.');
            return;
        }
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1, allowsEditing: true, aspect: [4, 3] });
        if (r.canceled) return;
        let asset;
        try { asset = await compressImage(r.assets[0]); }
        catch { Alert.alert('Hata', 'Fotoğraf işlenemedi. Lütfen tekrar deneyin.'); return; }
        b64.current.ic_gorseller = [...b64.current.ic_gorseller, asset.base64 ?? null];
        setPhotos(p => ({ ...p, ic_gorseller: [...p.ic_gorseller, { uri: asset.uri, isExisting: false }] }));
    }

    function removeVehiclePhoto(idx) {
        if (isReadOnly) return;
        if (photos.ic_gorseller[idx]?.isExisting) {
            Alert.alert('Uyarı', 'Sunucuya yüklü görsel silinemez. Üzerine yeni bir görsel ekleyebilirsiniz.');
            return;
        }
        b64.current.ic_gorseller = b64.current.ic_gorseller.filter((_, i) => i !== idx);
        setPhotos(p => ({ ...p, ic_gorseller: p.ic_gorseller.filter((_, i) => i !== idx) }));
    }

    async function uploadNewPhotos(step) {
        const singleFields = step === 1
            ? ['profil_foto', 'ehliyet_on', 'ehliyet_arka', 'adli_sicil']
            : ['ruhsat_foto'];

        for (const field of singleFields) {
            if (!b64.current[field]) continue;
            const res = await taxiApi.uploadDriverPhoto(b64.current[field], field);
            if (!res.success) return res.error ?? `${field} yüklenemedi.`;
            uploadedPhotoUrls.current[field] = res.url;
            b64.current[field] = null;
        }

        if (step === 2) {
            const newB64s = b64.current.ic_gorseller.filter(Boolean);
            if (newB64s.length) {
                const newUrls = [];
                for (let i = 0; i < newB64s.length; i++) {
                    const res = await taxiApi.uploadDriverPhoto(newB64s[i], `ic_gorsel_${i}`);
                    if (!res.success) return res.error ?? 'Araç içi görsel yüklenemedi.';
                    newUrls.push(res.url);
                }
                b64.current.ic_gorseller = [];
                uploadedPhotoUrls.current.ic_gorseller = newUrls;
                setPhotos(p => ({
                    ...p,
                    ic_gorseller: [
                        ...p.ic_gorseller.filter(ph => ph.isExisting),
                        ...newUrls.map(url => ({ uri: url, isExisting: true })),
                    ],
                }));
            }
        }

        return null;
    }

    function validateStep(step) {
        const e = [];
        if (step === 1) {
            if (!photos.profil_foto)  e.push('Profil fotoğrafı zorunludur.');
            if (!photos.ehliyet_on)   e.push('Ehliyet ön yüzü zorunludur.');
            if (!photos.ehliyet_arka) e.push('Ehliyet arka yüzü zorunludur.');
            if (!photos.adli_sicil)   e.push('Adli sicil belgesi zorunludur.');
            if (!kvkkRiza)            e.push('Adli sicil belgesi için KVKK kapsamında açık rıza vermeniz zorunludur.');
        }
        if (step === 2) {
            if (!form.marka.trim())   e.push('Araç markası zorunludur.');
            if (!form.model.trim())   e.push('Araç modeli zorunludur.');
            const y = parseInt(form.yil);
            const minYear = new Date().getFullYear() - 20;
            if (isNaN(y) || y < minYear || y > new Date().getFullYear() + 1) e.push(`Araç modeli en fazla 20 yaşında olmalıdır (en eski ${minYear} model kabul edilir).`);
            const plaka = form.plaka.trim().toUpperCase().replace(/\s/g, '');
            if (!/^\d{2}[A-Z]{1,3}\d{2,4}$/.test(plaka)) e.push('Geçerli bir plaka girin (örn: 34ABC123).');
            if (!photos.ruhsat_foto)           e.push('Araç ruhsatı fotoğrafı zorunludur.');
            if (!photos.ic_gorseller.length)   e.push('En az 1 araç içi görsel zorunludur.');
            if (!form.klima_taahhut)           e.push('Klima/havalandırma taahhüdü zorunludur.');
        }
        if (step === 3) {
            if (!form.hayvan_turleri.length)   e.push('En az bir hayvan türü seçmelisiniz.');
            if (!form.allerji_beyan)           e.push('Alerji beyanı zorunludur.');
        }
        if (step === 4) {
            if (!form.kurallar_kabul)          e.push('Kuralları kabul etmeniz zorunludur.');
        }
        return e;
    }

    function buildPayload(step) {
        if (step === 1) {
            const p = { kvkk_adli_sicil_riza: true };
            for (const field of ['profil_foto', 'ehliyet_on', 'ehliyet_arka', 'adli_sicil']) {
                const uploadedUrl = uploadedPhotoUrls.current[field];
                if (uploadedUrl)                       p[field]             = uploadedUrl;
                else if (b64.current[field])           p[field]             = b64.current[field];
                else if (photos[field]?.isExisting)    p[field + '_mevcut'] = true;
            }
            return p;
        }
        if (step === 2) {
            const p = {
                marka:         form.marka.trim(),
                model:         form.model.trim(),
                yil:           parseInt(form.yil),
                plaka:         form.plaka.trim().toUpperCase().replace(/\s/g, ''),
                klima_taahhut: form.klima_taahhut,
            };
            const uploadedRuhsat = uploadedPhotoUrls.current.ruhsat_foto;
            if (uploadedRuhsat)                         p.ruhsat_foto        = uploadedRuhsat;
            else if (b64.current.ruhsat_foto)           p.ruhsat_foto        = b64.current.ruhsat_foto;
            else if (photos.ruhsat_foto?.isExisting)    p.ruhsat_foto_mevcut = true;
            const newIcUrls = uploadedPhotoUrls.current.ic_gorseller ?? [];
            if (newIcUrls.length)                       p.ic_gorseller       = newIcUrls;
            if (photos.ic_gorseller.some(ph => ph.isExisting)) p.ic_gorseller_mevcut = [true];
            return p;
        }
        if (step === 3) {
            return { hayvan_turleri: form.hayvan_turleri, ekipmanlar: form.ekipmanlar, allerji_beyan: true };
        }
        if (step === 4) {
            return { kurallar_kabul: true };
        }
        return {};
    }

    async function handleNext() {
        if (isReadOnly) return;
        const errs = validateStep(currentStep);
        if (errs.length) { setErrors(errs); return; }
        setErrors([]);
        setSaving(true);

        if (currentStep === 1 || currentStep === 2) {
            const uploadErr = await uploadNewPhotos(currentStep);
            if (uploadErr) {
                setSaving(false);
                setErrors([uploadErr]);
                return;
            }
        }

        const res = await taxiApi.saveDriverStep(currentStep, buildPayload(currentStep));
        setSaving(false);
        if (!res.success) {
            setErrors(res.errors ?? [res.error ?? 'Bir hata oluştu.']);
            return;
        }
        if (res.is_final) {
            setDriverDurum('beklemede');
            Alert.alert(
                'Başvuru Tamamlandı!',
                'Belgeleriniz incelemeye alındı. En kısa sürede size dönülecektir.',
                [{ text: 'Tamam', onPress: () => router.back() }]
            );
        } else {
            setCompletedStep(currentStep);
            setCurrentStep(s => s + 1);
        }
    }

    function toggleAnimal(id) {
        if (isReadOnly) return;
        setForm(f => ({
            ...f,
            hayvan_turleri: f.hayvan_turleri.includes(id)
                ? f.hayvan_turleri.filter(x => x !== id)
                : [...f.hayvan_turleri, id],
        }));
    }

    function toggleEquipment(id) {
        if (isReadOnly) return;
        setForm(f => ({
            ...f,
            ekipmanlar: f.ekipmanlar.includes(id)
                ? f.ekipmanlar.filter(x => x !== id)
                : [...f.ekipmanlar, id],
        }));
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={styles.loadingText}>Profil yükleniyor…</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                <View style={styles.progressWrap}>
                    {STEPS.map((st, idx) => {
                        const n = idx + 1;
                        const done    = n <= completedStep;
                        const active  = n === currentStep;
                        const hasWarn = eksikAlanlar.some(a => ALAN_BILGI[a]?.step === n);
                        const jumpable = canJumpTo(n);
                        return (
                            <TouchableOpacity
                                key={n}
                                style={styles.progressItem}
                                onPress={() => jumpable ? setCurrentStep(n) : undefined}
                                activeOpacity={jumpable ? 0.7 : 1}
                            >
                                <View style={[styles.progressCircle, done && styles.progressDone, active && styles.progressActive, hasWarn && styles.progressWarn]}>
                                    {hasWarn
                                        ? <Ionicons name="alert" size={14} color="#fff" />
                                        : done
                                            ? <Ionicons name="checkmark" size={14} color={C.darker} />
                                            : <Text style={[styles.progressNum, (active || done) && { color: C.darker }]}>{n}</Text>
                                    }
                                </View>
                                <Text style={[styles.progressLabel, active && { color: C.primary }, hasWarn && { color: '#f59e0b' }]}>{st.title}</Text>
                                {idx < STEPS.length - 1 && (
                                    <View style={[styles.progressLine, done && styles.progressLineDone]} />
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {driverDurum === 'beklemede' && (
                    <View style={[styles.banner, { backgroundColor: '#92400e33' }]}>
                        <Ionicons name="time-outline" size={18} color="#fbbf24" />
                        <Text style={[styles.bannerText, { color: '#fbbf24' }]}>Belgeleriniz inceleniyor. Onaylanana kadar beklemeniz yeterli.</Text>
                    </View>
                )}
                {driverDurum === 'onaylandi' && (
                    <View style={[styles.banner, { backgroundColor: C.success + '22' }]}>
                        <Ionicons name="checkmark-circle-outline" size={18} color={C.success} />
                        <Text style={[styles.bannerText, { color: C.success }]}>Sürücü hesabınız onaylandı. Belgeler değiştirilemez.</Text>
                    </View>
                )}
                {driverDurum === 'reddedildi' && eksikAlanlar.length === 0 && (
                    <View style={[styles.banner, { backgroundColor: C.danger + '22' }]}>
                        <Ionicons name="close-circle-outline" size={18} color={C.danger} />
                        <Text style={[styles.bannerText, { color: C.danger }]}>Başvuru reddedildi. Belgeleri güncelleyip tekrar gönderin.</Text>
                    </View>
                )}
                {eksikAlanlar.length > 0 && (
                    <View style={[styles.banner, { backgroundColor: '#92400e33', flexDirection: 'column', gap: 6 }]}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            <Ionicons name="alert-circle-outline" size={18} color="#f59e0b" />
                            <Text style={[styles.bannerText, { color: '#f59e0b', fontWeight: '700' }]}>Düzeltilmesi gereken alanlar:</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {eksikAlanlar.map(alan => (
                                <TouchableOpacity
                                    key={alan}
                                    style={styles.eksikChip}
                                    onPress={() => setCurrentStep(ALAN_BILGI[alan]?.step ?? 1)}
                                >
                                    <Text style={styles.eksikChipText}>{ALAN_BILGI[alan]?.label ?? alan}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={{ color: '#fbbf24', fontSize: 11, marginTop: 2 }}>Chip'lere basarak ilgili adıma gidebilirsiniz.</Text>
                    </View>
                )}

                {errors.length > 0 && (
                    <View style={styles.errorBox}>
                        {errors.map((e, i) => <Text key={i} style={styles.errorText}>• {e}</Text>)}
                    </View>
                )}

                {currentStep === 1 && (
                    <StepCard styles={styles} title="Kimlik & Güvenlik" subtitle="Ehliyet, adli sicil kaydı ve profil fotoğrafınızı yükleyin.">

                        <Text style={[styles.fieldLabel, isEksik('profil_foto') && styles.fieldLabelWarn]}>Profil Fotoğrafı {isEksik('profil_foto') && '⚠️'}</Text>
                        <PhotoCard C={C} styles={styles} label="Net selfie veya portre" photo={photos.profil_foto} onPress={() => pickPhoto('profil_foto')} isReadOnly={isReadOnly} warn={isEksik('profil_foto')} />

                        <Text style={[styles.fieldLabel, { marginTop: 16 }, (isEksik('ehliyet_on') || isEksik('ehliyet_arka')) && styles.fieldLabelWarn]}>
                            Ehliyet {(isEksik('ehliyet_on') || isEksik('ehliyet_arka')) && '⚠️'}
                        </Text>
                        <View style={styles.photoRow}>
                            <PhotoCard C={C} styles={styles} label="Ön Yüz"  photo={photos.ehliyet_on}   onPress={() => pickPhoto('ehliyet_on')}   isReadOnly={isReadOnly} half warn={isEksik('ehliyet_on')} />
                            <PhotoCard C={C} styles={styles} label="Arka Yüz" photo={photos.ehliyet_arka} onPress={() => pickPhoto('ehliyet_arka')} isReadOnly={isReadOnly} half warn={isEksik('ehliyet_arka')} />
                        </View>

                        <Text style={[styles.fieldLabel, { marginTop: 16 }, isEksik('adli_sicil') && styles.fieldLabelWarn]}>Adli Sicil Kaydı {isEksik('adli_sicil') && '⚠️'}</Text>
                        <PhotoCard C={C} styles={styles} label="E-devlet çıktısı, ekran görüntüsü veya PDF" photo={photos.adli_sicil} onPress={pickAdliSicil} isReadOnly={isReadOnly} warn={isEksik('adli_sicil')} />

                        {/* KVKK Özel Rıza */}
                        <TouchableOpacity
                            style={[styles.kvkkRow, { borderColor: kvkkRiza ? C.primary : C.border, backgroundColor: kvkkRiza ? C.primary + '10' : C.surface }]}
                            onPress={() => !isReadOnly && setKvkkRiza(v => !v)}
                            activeOpacity={isReadOnly ? 1 : 0.8}
                        >
                            <View style={[styles.kvkkCheck, { borderColor: kvkkRiza ? C.primary : C.border, backgroundColor: kvkkRiza ? C.primary : 'transparent' }]}>
                                {kvkkRiza && <Ionicons name="checkmark" size={13} color={C.darker} />}
                            </View>
                            <Text style={[styles.kvkkText, { color: C.textMuted }]}>
                                <Text style={{ color: C.primary, fontWeight: '700' }}>KVKK Açık Rıza: </Text>
                                Adli sicil belgemi yalnızca platform güvenliği ve sürücü onboarding incelemesi amacıyla işlenmesine, 6698 sayılı Kanun'un 6. maddesi kapsamında açık rıza veriyorum.
                            </Text>
                        </TouchableOpacity>
                    </StepCard>
                )}

                {currentStep === 2 && (
                    <StepCard styles={styles} title="Araç Bilgileri" subtitle="Aracınızın bilgilerini girin ve fotoğraflarını yükleyin.">

                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.fieldLabel}>Marka</Text>
                                <TextInput style={styles.input} value={form.marka} onChangeText={v => setForm(f => ({ ...f, marka: v }))} placeholder="Toyota" placeholderTextColor={C.textMuted} editable={!isReadOnly} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.fieldLabel}>Model</Text>
                                <TextInput style={styles.input} value={form.model} onChangeText={v => setForm(f => ({ ...f, model: v }))} placeholder="Corolla" placeholderTextColor={C.textMuted} editable={!isReadOnly} />
                            </View>
                        </View>

                        <View style={styles.row}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.fieldLabel}>Yıl</Text>
                                <TextInput style={styles.input} value={form.yil} onChangeText={v => setForm(f => ({ ...f, yil: v }))} placeholder="2020" placeholderTextColor={C.textMuted} keyboardType="numeric" editable={!isReadOnly} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.fieldLabel}>Plaka</Text>
                                <TextInput style={styles.input} value={form.plaka} onChangeText={v => setForm(f => ({ ...f, plaka: v.toUpperCase() }))} placeholder="34ABC123" placeholderTextColor={C.textMuted} autoCapitalize="characters" editable={!isReadOnly} />
                            </View>
                        </View>

                        <Text style={[styles.fieldLabel, { marginTop: 12 }, isEksik('ruhsat_foto') && styles.fieldLabelWarn]}>Araç Ruhsatı {isEksik('ruhsat_foto') && '⚠️'}</Text>
                        <PhotoCard C={C} styles={styles} label="Ruhsat fotoğrafı" photo={photos.ruhsat_foto} onPress={() => pickPhoto('ruhsat_foto')} isReadOnly={isReadOnly} warn={isEksik('ruhsat_foto')} />

                        <Text style={[styles.fieldLabel, { marginTop: 16 }, isEksik('ic_gorseller') && styles.fieldLabelWarn]}>
                            Araç İçi Görseller {isEksik('ic_gorseller') && '⚠️ '}
                            <Text style={styles.fieldHint}>({photos.ic_gorseller.length}/6 — en az 1 zorunlu)</Text>
                        </Text>
                        <View style={styles.photoGrid}>
                            {photos.ic_gorseller.map((ph, idx) => (
                                <View key={idx} style={styles.gridThumb}>
                                    <Image source={{ uri: ph.uri }} style={styles.gridImg} />
                                    {!isReadOnly && !ph.isExisting && (
                                        <TouchableOpacity style={styles.gridRemove} onPress={() => removeVehiclePhoto(idx)}>
                                            <Ionicons name="close-circle" size={20} color={C.danger} />
                                        </TouchableOpacity>
                                    )}
                                    {ph.isExisting && (
                                        <View style={styles.gridExisting}>
                                            <Ionicons name="checkmark-circle" size={16} color={C.success} />
                                        </View>
                                    )}
                                </View>
                            ))}
                            {!isReadOnly && photos.ic_gorseller.length < 6 && (
                                <TouchableOpacity style={styles.gridAdd} onPress={addVehiclePhoto}>
                                    <Ionicons name="add" size={28} color={C.textMuted} />
                                    <Text style={styles.gridAddText}>Ekle</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.toggleRow} onPress={() => !isReadOnly && setForm(f => ({ ...f, klima_taahhut: !f.klima_taahhut }))} activeOpacity={isReadOnly ? 1 : 0.8}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.toggleLabel}>Klima / Havalandırma Taahhüdü <Text style={{ color: C.danger }}>*</Text></Text>
                                <Text style={styles.toggleSub}>Aracımda aktif klima veya havalandırma sistemi bulunmaktadır ve tüm yolculuklarda kullanacağım.</Text>
                            </View>
                            <Switch value={form.klima_taahhut} onValueChange={v => !isReadOnly && setForm(f => ({ ...f, klima_taahhut: v }))} disabled={isReadOnly} thumbColor={form.klima_taahhut ? C.darker : C.textMuted} trackColor={{ false: C.border, true: C.primary }} />
                        </TouchableOpacity>
                    </StepCard>
                )}

                {currentStep === 3 && (
                    <StepCard styles={styles} title="Pet Tercihleri" subtitle="Taşıyabileceğiniz hayvan türlerini ve ekipmanlarınızı seçin.">

                        <Text style={styles.fieldLabel}>Taşıyabileceğim Hayvan Türleri <Text style={{ color: C.danger }}>*</Text></Text>
                        <Text style={[styles.fieldHint, { marginBottom: 10 }]}>En az 1 seçim zorunludur</Text>
                        <View style={styles.chipGrid}>
                            {animalTypes.map(at => {
                                const sel = form.hayvan_turleri.includes(at.id);
                                return (
                                    <TouchableOpacity key={at.id} style={[styles.chip, sel && styles.chipSelected]} onPress={() => toggleAnimal(at.id)} activeOpacity={isReadOnly ? 1 : 0.8}>
                                        <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={16} color={sel ? C.primary : C.textMuted} />
                                        <Text style={[styles.chipText, sel && styles.chipTextSelected]}>{at.ad}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Sahip Olduğum Ekipmanlar</Text>
                        <Text style={[styles.fieldHint, { marginBottom: 10 }]}>Opsiyonel — daha fazla talep almanızı sağlar</Text>
                        {equipmentList.map(eq => {
                            const sel = form.ekipmanlar.includes(eq.id);
                            return (
                                <TouchableOpacity key={eq.id} style={styles.eqRow} onPress={() => toggleEquipment(eq.id)} activeOpacity={isReadOnly ? 1 : 0.8}>
                                    <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={22} color={sel ? C.primary : C.textMuted} />
                                    <Text style={styles.eqText}>{eq.ad}</Text>
                                </TouchableOpacity>
                            );
                        })}

                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.toggleRow} onPress={() => !isReadOnly && setForm(f => ({ ...f, allerji_beyan: !f.allerji_beyan }))} activeOpacity={isReadOnly ? 1 : 0.8}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.toggleLabel}>Alerji Beyanı <Text style={{ color: C.danger }}>*</Text></Text>
                                <Text style={styles.toggleSub}>Evcil hayvan tüyüne karşı tıbbi bir alerjim olmadığını beyan ederim.</Text>
                            </View>
                            <Switch value={form.allerji_beyan} onValueChange={v => !isReadOnly && setForm(f => ({ ...f, allerji_beyan: v }))} disabled={isReadOnly} thumbColor={form.allerji_beyan ? C.darker : C.textMuted} trackColor={{ false: C.border, true: C.primary }} />
                        </TouchableOpacity>
                    </StepCard>
                )}

                {currentStep === 4 && (
                    <StepCard styles={styles} title="Kurallar & Onay" subtitle="Pet taşıma kurallarını okuyun ve kabul edin.">

                        <View style={styles.rulesBox}>
                            <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled showsVerticalScrollIndicator>
                                {PET_RULES.map((rule, i) => (
                                    <Text key={i} style={styles.ruleText}>{rule}</Text>
                                ))}
                            </ScrollView>
                        </View>

                        <View style={styles.divider} />
                        <TouchableOpacity style={styles.toggleRow} onPress={() => !isReadOnly && setForm(f => ({ ...f, kurallar_kabul: !f.kurallar_kabul }))} activeOpacity={isReadOnly ? 1 : 0.8}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.toggleLabel}>Kuralları okudum, kabul ediyorum <Text style={{ color: C.danger }}>*</Text></Text>
                            </View>
                            <Switch value={form.kurallar_kabul} onValueChange={v => !isReadOnly && setForm(f => ({ ...f, kurallar_kabul: v }))} disabled={isReadOnly} thumbColor={form.kurallar_kabul ? C.darker : C.textMuted} trackColor={{ false: C.border, true: C.primary }} />
                        </TouchableOpacity>
                    </StepCard>
                )}

                <View style={styles.btnRow}>
                    {currentStep > 1 && !isReadOnly && (
                        <TouchableOpacity style={styles.backBtn} onPress={() => { setErrors([]); setCurrentStep(s => s - 1); }}>
                            <Ionicons name="arrow-back" size={18} color={C.textMuted} />
                            <Text style={styles.backText}>Geri</Text>
                        </TouchableOpacity>
                    )}
                    {!isReadOnly && (
                        <TouchableOpacity
                            style={[styles.nextBtn, saving && { opacity: 0.65 }, currentStep === 4 && !form.kurallar_kabul && { opacity: 0.45 }]}
                            onPress={handleNext}
                            disabled={saving || (currentStep === 4 && !form.kurallar_kabul)}
                            activeOpacity={0.85}
                        >
                            {saving
                                ? <ActivityIndicator color={C.darker} size="small" />
                                : <>
                                    <Text style={styles.nextText}>{currentStep === 4 ? 'Başvuruyu Tamamla' : 'Kaydet ve Devam Et'}</Text>
                                    <Ionicons name={currentStep === 4 ? 'send-outline' : 'arrow-forward'} size={18} color={C.darker} />
                                  </>
                            }
                        </TouchableOpacity>
                    )}
                </View>

            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function StepCard({ styles, title, subtitle, children }) {
    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSub}>{subtitle}</Text>
            <View style={styles.cardDivider} />
            {children}
        </View>
    );
}

function PhotoCard({ C, styles, label, photo, onPress, isReadOnly, half = false, warn = false }) {
    return (
        <TouchableOpacity
            style={[styles.photoCard, half && styles.photoCardHalf, warn && styles.photoCardWarn]}
            onPress={isReadOnly ? undefined : onPress}
            activeOpacity={isReadOnly ? 1 : 0.8}
        >
            {photo ? (
                <>
                    {photo.isPdf ? (
                        <View style={[styles.photoPlaceholder, half && styles.photoPlaceholderHalf, { backgroundColor: '#fef3c7' }]}>
                            <Ionicons name="document-outline" size={28} color="#f59e0b" />
                            <Text style={[styles.photoLabel, { color: '#92400e' }]} numberOfLines={1}>{photo.name ?? 'PDF Dosyası'}</Text>
                            <Text style={[styles.photoHint, { color: '#f59e0b' }]}>Seçildi</Text>
                        </View>
                    ) : (
                        <Image source={{ uri: photo.uri }} style={[styles.photoImg, half && styles.photoImgHalf]} resizeMode="cover" />
                    )}
                    <View style={styles.photoOverlay}>
                        <Ionicons name={photo.isExisting ? 'cloud-done-outline' : 'checkmark-circle'} size={18} color={C.success} />
                        <Text style={styles.photoOverlayText}>{photo.isExisting ? 'Sunucuda mevcut' : 'Seçildi'}</Text>
                    </View>
                </>
            ) : (
                <View style={[styles.photoPlaceholder, half && styles.photoPlaceholderHalf]}>
                    <Ionicons name="camera-outline" size={28} color={warn ? '#f59e0b' : C.textMuted} />
                    <Text style={[styles.photoLabel, warn && { color: '#f59e0b' }]}>{label}</Text>
                    <Text style={[styles.photoHint, warn && { color: '#f59e0b' }]}>Fotoğraf / PDF Ekle</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:        { flex: 1, backgroundColor: C.background },
    scroll:      { padding: 20, paddingBottom: 48, gap: 16 },
    center:      { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background, gap: 12 },
    loadingText: { color: C.textMuted, fontSize: 14 },

    progressWrap:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginBottom: 4 },
    progressItem:    { alignItems: 'center', flex: 1, position: 'relative' },
    progressLine:    { position: 'absolute', top: 15, left: '55%', right: '-55%', height: 2, backgroundColor: C.border, zIndex: -1 },
    progressLineDone:{ backgroundColor: C.primary },
    progressCircle:  { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surface, borderWidth: 2, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
    progressDone:    { backgroundColor: C.primary, borderColor: C.primary },
    progressActive:  { backgroundColor: C.primary, borderColor: C.primary },
    progressNum:     { color: C.textMuted, fontSize: 12, fontWeight: '700' },
    progressLabel:   { color: C.textMuted, fontSize: 10, marginTop: 4, fontWeight: '600' },

    banner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 14 },
    bannerText: { flex: 1, fontSize: 13, lineHeight: 20, fontWeight: '500' },

    errorBox:  { backgroundColor: C.danger + '22', borderRadius: 12, padding: 14, gap: 4 },
    errorText: { color: C.danger, fontSize: 13, lineHeight: 20 },

    card:       { backgroundColor: C.card, borderRadius: 16, padding: 18, gap: 8 },
    cardTitle:  { color: C.text, fontSize: 17, fontWeight: '800' },
    cardSub:    { color: C.textMuted, fontSize: 13, lineHeight: 18 },
    cardDivider:{ height: 1, backgroundColor: C.border, marginVertical: 8 },

    fieldLabel: { color: C.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
    fieldHint:  { color: C.textMuted, fontSize: 11 },
    row:        { flexDirection: 'row', gap: 10 },
    input:      { backgroundColor: C.surface, color: C.text, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1.5, borderColor: C.border, marginBottom: 4 },

    photoCard:           { backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: C.border },
    photoCardHalf:       { flex: 1 },
    photoImg:            { width: '100%', height: 110 },
    photoImgHalf:        { height: 90 },
    photoOverlay:        { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', padding: 8 },
    photoOverlayText:    { color: '#fff', fontSize: 11, fontWeight: '600' },
    photoPlaceholder:    { height: 110, justifyContent: 'center', alignItems: 'center', gap: 4 },
    photoPlaceholderHalf:{ height: 90 },
    photoLabel:          { color: C.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
    photoHint:           { color: C.primary, fontSize: 11 },
    photoRow:            { flexDirection: 'row', gap: 10 },

    photoGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    gridThumb:   { width: 88, height: 68, borderRadius: 8, position: 'relative' },
    gridImg:     { width: 88, height: 68, borderRadius: 8 },
    gridRemove:  { position: 'absolute', top: -7, right: -7, backgroundColor: C.background, borderRadius: 10 },
    gridExisting:{ position: 'absolute', bottom: 3, right: 3 },
    gridAdd:     { width: 88, height: 68, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 2 },
    gridAddText: { color: C.textMuted, fontSize: 11 },

    toggleRow:  { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
    toggleLabel:{ color: C.text, fontSize: 14, fontWeight: '700' },
    toggleSub:  { color: C.textMuted, fontSize: 12, marginTop: 2, lineHeight: 18 },

    chipGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip:            { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.surface, borderRadius: 10, borderWidth: 1.5, borderColor: C.border },
    chipSelected:    { backgroundColor: C.primary + '22', borderColor: C.primary },
    chipText:        { color: C.textMuted, fontSize: 13, fontWeight: '600' },
    chipTextSelected:{ color: C.primary, fontWeight: '700' },

    eqRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    eqText: { color: C.text, fontSize: 14 },

    divider: { height: 1, backgroundColor: C.border, marginVertical: 8 },

    progressWarn:   { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
    fieldLabelWarn: { color: '#f59e0b' },
    photoCardWarn:  { borderColor: '#f59e0b', borderWidth: 2 },
    eksikChip:      { backgroundColor: '#f59e0b22', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#f59e0b' },
    eksikChipText:  { color: '#fbbf24', fontSize: 12, fontWeight: '700' },

    rulesBox: { backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
    ruleText: { color: C.textMuted, fontSize: 13, lineHeight: 22, marginBottom: 4 },

    kvkkRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 14, padding: 14, borderRadius: 12, borderWidth: 1.5 },
    kvkkCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
    kvkkText:  { flex: 1, fontSize: 12, lineHeight: 18 },

    btnRow:  { flexDirection: 'row', gap: 12, marginTop: 8 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.border },
    backText:{ color: C.textMuted, fontWeight: '700', fontSize: 14 },
    nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14, backgroundColor: C.primary },
    nextText:{ color: C.darker, fontWeight: '900', fontSize: 15 },
});
