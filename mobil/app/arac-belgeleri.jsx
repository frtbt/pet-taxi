import { useState, useEffect, useMemo } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    Alert, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import taxiApi from '../src/api/taxiClient';
import { compressImage } from '../src/utils/compressImage';

export default function AracBelgeleriScreen() {
    const router             = useRouter();
    const { colors: C }      = useTheme();
    const { user, refreshUser } = useAuth();
    const styles             = useMemo(() => makeStyles(C), [C]);

    const [loading,     setLoading]     = useState(false);
    const [muayeneUri,  setMuayeneUri]  = useState(null);
    const [muayeneB64,  setMuayeneB64]  = useState(null);
    const [sigortaUri,  setSigortaUri]  = useState(null);
    const [sigortaB64,  setSigortaB64]  = useState(null);

    const durum      = user?.arac_belgeler_durum ?? 'yok';
    const redNedeni  = user?.arac_belge_red_nedeni;
    const deadline   = user?.arac_belgeler_deadline;

    let daysLeft = null;
    if (deadline) {
        daysLeft = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
    }

    async function pickImage(type) {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('İzin Gerekli', 'Galeri erişim izni vermeniz gerekiyor.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1,
        });
        if (result.canceled) return;
        let asset;
        try { asset = await compressImage(result.assets[0]); }
        catch { Alert.alert('Hata', 'Fotoğraf işlenemedi. Lütfen tekrar deneyin.'); return; }
        if (type === 'muayene') {
            setMuayeneUri(asset.uri);
            setMuayeneB64(asset.base64);
        } else {
            setSigortaUri(asset.uri);
            setSigortaB64(asset.base64);
        }
    }

    async function handleSubmit() {
        if (!muayeneB64 && !sigortaB64) {
            Alert.alert('Eksik Belge', 'En az bir belge seçmelisiniz.');
            return;
        }
        // Warn if only one is selected but neither currently exists
        const curMuayene = user?.arac_muayene_belge;
        const curSigorta = user?.trafik_sigortasi_belge;
        if (!muayeneB64 && !curMuayene) {
            Alert.alert('Eksik Belge', 'Araç muayene belgesini seçmelisiniz.');
            return;
        }
        if (!sigortaB64 && !curSigorta) {
            Alert.alert('Eksik Belge', 'Trafik sigortası belgesini seçmelisiniz.');
            return;
        }

        setLoading(true);
        try {
            // Sunucu büyük istekleri reddettiği için belgeler tek tek gönderilir
            let res = { success: true };
            if (muayeneB64) res = await taxiApi.uploadAracBelgeleri(muayeneB64, null);
            if (res.success && sigortaB64) res = await taxiApi.uploadAracBelgeleri(null, sigortaB64);
            if (res.success) {
                if (res.user) refreshUser(res.user);
                Alert.alert(
                    'Belgeler Yüklendi',
                    'Araç belgeleriniz inceleme için gönderildi. Onay sonrası aktif olacaksınız.',
                    [{ text: 'Tamam', onPress: () => router.back() }]
                );
            } else {
                Alert.alert('Hata', res.error ?? 'Yükleme başarısız.');
            }
        } catch {
            Alert.alert('Hata', 'Bağlantı hatası oluştu.');
        } finally {
            setLoading(false);
        }
    }

    const canSubmit = (muayeneB64 || user?.arac_muayene_belge) &&
                      (sigortaB64 || user?.trafik_sigortasi_belge);

    return (
        <View style={styles.root}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: C.border }]}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color={C.text} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: C.text }]}>Araç Belgeleri</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Status banner */}
                {durum === 'yuklendi' && (
                    <View style={[styles.statusBox, { backgroundColor: '#1e3a5f' }]}>
                        <Text style={styles.statusIcon}>⏳</Text>
                        <Text style={styles.statusText}>Belgeleriniz inceleniyor. Onay sonrası işlem yapabilirsiniz.</Text>
                    </View>
                )}
                {durum === 'reddedildi' && (
                    <View style={[styles.statusBox, { backgroundColor: '#7f1d1d' }]}>
                        <Text style={styles.statusIcon}>✗</Text>
                        <Text style={styles.statusText}>
                            {redNedeni ? `Reddedildi: ${redNedeni}` : 'Belgeleriniz reddedildi. Lütfen tekrar yükleyin.'}
                        </Text>
                    </View>
                )}
                {(durum === 'yok' || durum == null) && daysLeft !== null && daysLeft >= 0 && (
                    <View style={[styles.statusBox, { backgroundColor: '#78350f' }]}>
                        <Text style={styles.statusIcon}>⚠️</Text>
                        <Text style={styles.statusText}>{daysLeft} gün içinde belgeleri yüklemeniz gerekiyor.</Text>
                    </View>
                )}

                <Text style={[styles.sectionTitle, { color: C.text }]}>Araç Muayene Belgesi</Text>
                <Text style={[styles.hint, { color: C.textMuted }]}>Güncel araç muayene belgenizin net fotoğrafını yükleyin.</Text>
                <PickerBox
                    C={C}
                    styles={styles}
                    uri={muayeneUri}
                    existingUrl={user?.arac_muayene_belge}
                    label="Muayene Belgesi Seç"
                    onPick={() => pickImage('muayene')}
                />

                <Text style={[styles.sectionTitle, { color: C.text, marginTop: 20 }]}>Trafik Sigortası Belgesi</Text>
                <Text style={[styles.hint, { color: C.textMuted }]}>Güncel trafik sigortası poliçenizin net fotoğrafını yükleyin.</Text>
                <PickerBox
                    C={C}
                    styles={styles}
                    uri={sigortaUri}
                    existingUrl={user?.trafik_sigortasi_belge}
                    label="Sigorta Belgesi Seç"
                    onPick={() => pickImage('sigorta')}
                />

                <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: C.primary }, (!canSubmit || loading) && { opacity: 0.5 }]}
                    onPress={handleSubmit}
                    disabled={!canSubmit || loading}
                    activeOpacity={0.85}
                >
                    {loading
                        ? <ActivityIndicator size="small" color={C.darker} />
                        : <Text style={[styles.submitText, { color: C.darker }]}>Belgeleri Gönder</Text>
                    }
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

function PickerBox({ C, styles, uri, existingUrl, label, onPick }) {
    const hasNew      = !!uri;
    const hasExisting = !!existingUrl;

    return (
        <TouchableOpacity
            style={[styles.pickerBox, { borderColor: hasNew ? C.primary : C.border, backgroundColor: C.card }]}
            onPress={onPick}
            activeOpacity={0.8}
        >
            {hasNew ? (
                <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
            ) : hasExisting ? (
                <View style={styles.existingWrap}>
                    <Ionicons name="checkmark-circle" size={32} color="#22c55e" />
                    <Text style={[styles.existingText, { color: C.textMuted }]}>Mevcut belge var — değiştirmek için dokun</Text>
                </View>
            ) : (
                <View style={styles.placeholder}>
                    <Ionicons name="cloud-upload-outline" size={36} color={C.textMuted} />
                    <Text style={[styles.placeholderText, { color: C.textMuted }]}>{label}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 4 },
    title:   { fontSize: 18, fontWeight: '800' },

    scroll: { padding: 20, paddingBottom: 48 },

    statusBox: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
    statusIcon: { fontSize: 20 },
    statusText: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },

    sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
    hint:         { fontSize: 12, marginBottom: 10 },

    pickerBox: {
        borderWidth: 2, borderRadius: 16, borderStyle: 'dashed',
        height: 160, justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    },
    preview:  { width: '100%', height: '100%' },
    existingWrap: { alignItems: 'center', gap: 8, padding: 16 },
    existingText: { fontSize: 12, textAlign: 'center' },
    placeholder:  { alignItems: 'center', gap: 8 },
    placeholderText: { fontSize: 13 },

    submitBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 32 },
    submitText: { fontSize: 15, fontWeight: '800' },
});
