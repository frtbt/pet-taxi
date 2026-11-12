import { useState, useMemo, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet,
    TouchableOpacity, TextInput, Alert, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import taxiApi from '../src/api/taxiClient';
import { useTheme } from '../src/context/ThemeContext';

const TURLER = [
    { key: 'yaralanma',   label: '🩹 Yaralanma' },
    { key: 'kayip',       label: '🔍 Kayıp' },
    { key: 'olum',        label: '💔 Ölüm' },
    { key: 'arac_hasari', label: '🚗 Araç Hasarı' },
    { key: 'diger',       label: '📋 Diğer' },
];

const DURUM_LABEL = { beklemede: 'Beklemede', inceleniyor: 'İnceleniyor', kapatildi: 'Kapatıldı' };

export default function IncidentReportScreen() {
    const { talep_id } = useLocalSearchParams();
    const router = useRouter();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);

    const [tur, setTur]             = useState(null);
    const [aciklama, setAciklama]   = useState('');
    const [photos, setPhotos]       = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [reports, setReports]     = useState([]);
    const [loadingReports, setLoadingReports] = useState(true);

    const load = useCallback(async () => {
        const res = await taxiApi.getIncidentReports(Number(talep_id));
        if (res.success) setReports(res.reports ?? []);
        setLoadingReports(false);
    }, [talep_id]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    async function addFromCamera() {
        if (photos.length >= 5) { Alert.alert('Limit', 'En fazla 5 fotoğraf ekleyebilirsiniz.'); return; }
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') { Alert.alert('Kamera İzni', 'Fotoğraf çekmek için kamera izni gereklidir.'); return; }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, base64: true });
        if (result.canceled || !result.assets?.[0]) return;
        setPhotos(p => [...p, { uri: result.assets[0].uri, base64: 'data:image/jpeg;base64,' + result.assets[0].base64 }]);
    }

    async function addFromGallery() {
        if (photos.length >= 5) { Alert.alert('Limit', 'En fazla 5 fotoğraf ekleyebilirsiniz.'); return; }
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== 'granted') { Alert.alert('Galeri İzni', 'Fotoğraf seçmek için galeri izni gereklidir.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.6,
            base64: true,
            allowsMultipleSelection: true,
            selectionLimit: 5 - photos.length,
        });
        if (result.canceled || !result.assets?.length) return;
        const picked = result.assets
            .filter(a => a.base64)
            .slice(0, 5 - photos.length)
            .map(a => ({ uri: a.uri, base64: 'data:image/jpeg;base64,' + a.base64 }));
        setPhotos(p => [...p, ...picked]);
    }

    function pickPhoto() {
        Alert.alert('Kanıt Fotoğrafı Ekle', '', [
            { text: 'Kamera', onPress: addFromCamera },
            { text: 'Galeriden Seç', onPress: addFromGallery },
            { text: 'Vazgeç', style: 'cancel' },
        ]);
    }

    function removePhoto(idx) {
        setPhotos(p => p.filter((_, i) => i !== idx));
    }

    async function handleSubmit() {
        if (!tur) { Alert.alert('Eksik Bilgi', 'Lütfen olay türünü seçin.'); return; }
        if (!aciklama.trim()) { Alert.alert('Eksik Bilgi', 'Lütfen olayı açıklayın.'); return; }
        if (photos.length === 0) { Alert.alert('Kanıt Gerekli', 'En az 1 kanıt fotoğrafı eklemelisiniz (Madde 10/1).'); return; }

        setSubmitting(true);
        const res = await taxiApi.createIncidentReport(
            Number(talep_id), tur, aciklama.trim(), photos.map(p => p.base64)
        );
        setSubmitting(false);

        if (res.success) {
            Alert.alert('Bildirim Alındı', 'Olay bildiriminiz destek ekibimize ulaştı. En kısa sürede inceleyip sizinle iletişime geçeceğiz.', [
                { text: 'Tamam', onPress: () => router.back() },
            ]);
        } else {
            Alert.alert('Hata', res.error ?? 'Bildirim gönderilemedi.');
        }
    }

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <Text style={styles.title}>⚠️ Hasar / Olay Bildir</Text>
            <Text style={styles.subtitle}>
                Evcil hayvanın yaralanması, kaybolması, ölümü veya araç hasarı gibi durumları transferin
                bitişinden itibaren en geç 48 saat içinde, fotoğraflı olarak bildirmeniz gerekir (Madde 10/1).
            </Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Olay Türü</Text>
                <View style={styles.turRow}>
                    {TURLER.map(t => (
                        <TouchableOpacity
                            key={t.key}
                            style={[styles.turBtn, tur === t.key && { backgroundColor: C.primary, borderColor: C.primary }]}
                            onPress={() => setTur(t.key)}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.turBtnText, tur === t.key && { color: C.darker }]}>{t.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Açıklama</Text>
                <TextInput
                    style={styles.textArea}
                    value={aciklama}
                    onChangeText={setAciklama}
                    placeholder="Olayı detaylı şekilde anlatın…"
                    placeholderTextColor={C.textMuted}
                    multiline
                    numberOfLines={5}
                    maxLength={1500}
                />
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Kanıt Fotoğrafları ({photos.length}/5)</Text>
                <View style={styles.photoRow}>
                    {photos.map((p, i) => (
                        <View key={i} style={styles.photoWrap}>
                            <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                            <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(i)}>
                                <Text style={styles.photoRemoveText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                    {photos.length < 5 && (
                        <TouchableOpacity style={styles.photoAdd} onPress={pickPhoto} activeOpacity={0.8}>
                            <Text style={styles.photoAddText}>+</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
            >
                {submitting
                    ? <ActivityIndicator color={C.darker} />
                    : <Text style={styles.submitBtnText}>Bildirimi Gönder</Text>
                }
            </TouchableOpacity>

            {!loadingReports && reports.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Önceki Bildirimler</Text>
                    {reports.map(r => (
                        <View key={r.id} style={styles.reportItem}>
                            <Text style={styles.reportType}>
                                {TURLER.find(t => t.key === r.tur)?.label ?? r.tur} · {DURUM_LABEL[r.durum] ?? r.durum}
                            </Text>
                            <Text style={styles.reportDesc} numberOfLines={3}>{r.aciklama}</Text>
                            <Text style={styles.reportDate}>
                                {new Date(r.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:    { flex: 1, backgroundColor: C.background },
    content: { padding: 16, gap: 12, paddingBottom: 40 },

    title:    { color: C.text, fontSize: 18, fontWeight: '800' },
    subtitle: { color: C.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 4 },

    card:      { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 10 },
    cardTitle: { color: C.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

    turRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    turBtn:      { borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
    turBtnText:  { color: C.text, fontSize: 13, fontWeight: '600' },

    textArea: {
        backgroundColor: C.background, borderRadius: 10, borderWidth: 1, borderColor: C.border,
        padding: 12, color: C.text, fontSize: 14, minHeight: 100, textAlignVertical: 'top',
    },

    photoRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    photoWrap: { position: 'relative' },
    photoThumb: { width: 80, height: 80, borderRadius: 10 },
    photoRemove: {
        position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center',
    },
    photoRemoveText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    photoAdd: {
        width: 80, height: 80, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed',
        justifyContent: 'center', alignItems: 'center',
    },
    photoAddText: { color: C.textMuted, fontSize: 28, fontWeight: '300' },

    submitBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
    submitBtnText: { color: C.darker, fontWeight: '800', fontSize: 15 },

    reportItem: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, gap: 4 },
    reportType: { color: C.text, fontSize: 13, fontWeight: '700' },
    reportDesc: { color: C.textMuted, fontSize: 12, lineHeight: 17 },
    reportDate: { color: C.textMuted, fontSize: 10 },
});
