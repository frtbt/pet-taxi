import { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import taxiApi from '../src/api/taxiClient';
import { useTheme } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';

const STATUS_MAP = {
    bekliyor:   { label: 'Bekliyor',     color: '#f59e0b' },
    eslesti:    { label: 'Eşleşti',      color: '#60a5fa' },
    basladi:    { label: 'Yolda',        color: '#8b5cf6' },
    tamamlandi: { label: 'Tamamlandı',   color: '#22c55e' },
    iptal:      { label: 'İptal Edildi', color: '#ef4444' },
};

const HUYLAR = { sakin: '😌 Sakin', enerjik: '⚡ Enerjik', endiseli: '😟 Endişeli', agresif: '⚠️ Agresif' };

export default function RequestDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);
    const { isOwner } = useAuth();

    const [request, setRequest]     = useState(null);
    const [dogProfile, setDogProfile] = useState(null);
    const [loading, setLoading]     = useState(true);
    const [cancelling, setCancelling] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await taxiApi.getRequestDetail(Number(id));
            if (res.success) {
                setRequest(res.request);
                if (res.request?.kopek_id) {
                    const dp = await taxiApi.getDogProfile(res.request.kopek_id);
                    if (dp.success) setDogProfile(dp.dog);
                }
            }
            setLoading(false);
        })();
    }, [id]);

    async function handleCancel() {
        setCancelling(true);
        const feeRes = await taxiApi.getCancelFee(Number(id));
        setCancelling(false);

        if (!feeRes.success) {
            Alert.alert('Hata', feeRes.error ?? 'İptal bilgisi alınamadı.');
            return;
        }

        const { fee, refund, free, reason, seconds_left } = feeRes;
        let feeMsg = '';
        if (free) {
            if (reason === 'within_window') {
                const minsLeft = Math.ceil((seconds_left ?? 0) / 60);
                feeMsg = `✅ Ücretsiz iptal (${minsLeft} dk pencere dolmadı)\n\nİade: tam ücret cüzdanınıza geri yüklenecek.`;
            } else {
                feeMsg = '✅ Ücretsiz iptal\n\nİade: tam ücret cüzdanınıza geri yüklenecek.';
            }
        } else if (reason === 'at_door') {
            feeMsg = `⚠️ Kapıda iptal\n\nSürücü adrese ulaştı. İptal ücreti: ₺${Number(fee).toFixed(2)} (transfer bedelinin %50'si ya da taban ücret, hangisi büyükse)\nCüzdanınıza iade: ₺${Number(refund).toFixed(2)}\n\n(Madde 7/1)`;
        } else {
            feeMsg = `⚠️ Ücretli iptal\n\nİptal ücreti: ₺${Number(fee).toFixed(2)} (taban ücret)\nCüzdanınıza iade: ₺${Number(refund).toFixed(2)}\n\nSürücü eşleşmesinden 5 dakika sonra iptal taban ücrete tabidir (Madde 7).`;
        }

        Alert.alert(
            'Talebi İptal Et',
            feeMsg,
            [
                { text: 'Geri Dön', style: 'cancel' },
                {
                    text: 'İptal Et',
                    style: 'destructive',
                    onPress: async () => {
                        setCancelling(true);
                        const res = await taxiApi.cancelRequest(Number(id));
                        setCancelling(false);
                        if (res.success) {
                            const iadeMsg = Number(res.iade) > 0
                                ? `₺${Number(res.iade).toFixed(2)} cüzdanınıza iade edildi.`
                                : 'İade yapılmadı (taban ücret kesildi).';
                            Alert.alert('İptal Edildi', iadeMsg, [
                                { text: 'Tamam', onPress: () => router.back() },
                            ]);
                        } else {
                            Alert.alert('Hata', res.error ?? 'İptal edilemedi.');
                        }
                    },
                },
            ]
        );
    }

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;
    if (!request) return <View style={styles.center}><Text style={styles.errorText}>Talep bulunamadı.</Text></View>;

    const status = STATUS_MAP[request.durum] ?? { label: request.durum, color: C.textMuted };
    const canCancel = !['tamamlandi', 'iptal', 'basladi', 'teslim_bekleniyor'].includes(request.durum);
    const isActive  = ['eslesti','basladi'].includes(request.durum);

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>

            <View style={[styles.statusCard, { borderColor: status.color }]}>
                <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
                <Text style={styles.statusDate}>
                    {new Date(request.kalkis_zamani).toLocaleString('tr-TR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                </Text>
            </View>

            {request.teslim_pin && ['eslesti','basladi'].includes(request.durum) && (
                <View style={[styles.card, { borderWidth: 1.5, borderColor: C.primary }]}>
                    <Text style={styles.cardTitle}>🔐 Teslimat Kodu</Text>
                    <Text style={styles.noteText}>
                        Sürücü hayvanınızı size teslim ederken bu kodu isteyecek. Kodu yalnızca hayvanı gerçekten teslim alacak kişiye verin.
                    </Text>
                    <Text style={{ fontSize: 36, fontWeight: '900', color: C.primary, textAlign: 'center', letterSpacing: 10, marginTop: 4 }}>
                        {request.teslim_pin}
                    </Text>
                </View>
            )}

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Güzergah</Text>
                <LocationRow
                    styles={styles}
                    color={C.success}
                    label="ALIŞ"
                    main={`${request.baslangic_ilce}, ${request.baslangic_sehir}`}
                    sub={request.baslangic_noktasi}
                />
                <View style={styles.divider} />
                <LocationRow
                    styles={styles}
                    color={C.danger}
                    label="BIRAKIŞ"
                    main={`${request.varis_ilce}, ${request.varis_sehir}`}
                    sub={request.varis_noktasi}
                />
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Detaylar</Text>
                <InfoRow styles={styles} C={C} label="🐕 Köpek"  value={request.kopek_adi} />
                <InfoRow styles={styles} C={C} label="📏 Mesafe" value={request.tahmini_mesafe ? `${Number(request.tahmini_mesafe).toFixed(1)} km` : '-'} />
                <InfoRow styles={styles} C={C} label="💰 Ücret"  value={`${Number(request.toplam_ucret).toLocaleString('tr-TR')} ₺`} highlight />
                <InfoRow styles={styles} C={C} label="🚗 Tür"    value={request.tip === 'anlik' ? 'Anlık' : 'Planlanmış'} />
            </View>

            {dogProfile && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Köpek Profili</Text>
                    {dogProfile.huylu && (
                        <InfoRow styles={styles} C={C} label="🐾 Huyu" value={HUYLAR[dogProfile.huylu] ?? dogProfile.huylu} />
                    )}
                    <InfoRow styles={styles} C={C} label="💉 Aşı"      value={dogProfile.asili ? '✅ Aşılı' : '❌ Aşısız'} />
                    <InfoRow styles={styles} C={C} label="📡 Mikroçip" value={dogProfile.mikrocip_no || '⚠️ Belirtilmemiş'} />
                    <InfoRow styles={styles} C={C} label="💉 Kuduz Aşısı" value={dogProfile.kuduz_asi_tarihi ? new Date(dogProfile.kuduz_asi_tarihi).toLocaleDateString('tr-TR') : '⚠️ Belirtilmemiş'} />
                    <InfoRow styles={styles} C={C} label="💉 Karma Aşı"   value={dogProfile.karma_asi_tarihi ? new Date(dogProfile.karma_asi_tarihi).toLocaleDateString('tr-TR') : '⚠️ Belirtilmemiş'} />
                    {dogProfile.saglik_notu ? (
                        <View style={styles.noteBlock}>
                            <Text style={styles.noteBlockLabel}>🏥 Sağlık Notu</Text>
                            <Text style={styles.noteText}>{dogProfile.saglik_notu}</Text>
                        </View>
                    ) : null}
                    {dogProfile.surucu_notu ? (
                        <View style={styles.noteBlock}>
                            <Text style={styles.noteBlockLabel}>🚗 Sürücüye Not</Text>
                            <Text style={styles.noteText}>{dogProfile.surucu_notu}</Text>
                        </View>
                    ) : null}
                </View>
            )}

            {request.surucu_adi && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Sürücü</Text>
                    <InfoRow styles={styles} C={C} label="👤 Ad"     value={request.surucu_adi} />
                    {request.surucu_telefon && (
                        <InfoRow styles={styles} C={C} label="📞 Telefon" value={request.surucu_telefon} />
                    )}
                    {isActive && request.match_id && (
                        <TouchableOpacity
                            style={styles.trackBtn}
                            onPress={() => router.push({ pathname: '/active-trip', params: { match_id: request.match_id, talep_id: id } })}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.trackBtnText}>🗺️ Sürücüyü Takip Et</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Güvenlik Beyanı</Text>
                <InfoRow styles={styles} C={C}
                    label="🦷 Isırma Geçmişi"
                    value={Number(request.agresyon_gecmisi) ? '⚠️ Evet' : '✅ Hayır'}
                />
                {Number(request.agresyon_gecmisi) && request.agresyon_aciklama ? (
                    <View style={styles.noteBlock}>
                        <Text style={styles.noteBlockLabel}>Açıklama</Text>
                        <Text style={styles.noteText}>{request.agresyon_aciklama}</Text>
                    </View>
                ) : null}
                {Number(request.agizlik_taahhut) ? (
                    <InfoRow styles={styles} C={C} label="😮 Ağızlık" value="✅ Takılacak" />
                ) : null}
                <InfoRow styles={styles} C={C}
                    label="📦 Ekipman"
                    value={Number(request.ekipman_taahhut) ? '✅ Kutu/Kafes/Tasma Taahhüt Edildi' : '⚠️ Belirtilmemiş'}
                />
            </View>

            {request.checkin_foto && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Teslim Alma Fotoğrafı</Text>
                    <Text style={styles.noteBlockLabel}>Sürücü tarafından yolculuk başında çekildi</Text>
                    <Image
                        source={{ uri: request.checkin_foto }}
                        style={{ width: '100%', height: 200, borderRadius: 10, marginTop: 6 }}
                        resizeMode="cover"
                    />
                </View>
            )}

            {request.ozel_talepler && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Notlar</Text>
                    <Text style={styles.noteText}>{request.ozel_talepler}</Text>
                </View>
            )}

            {request.durum === 'tamamlandi' && isOwner && (
                <TouchableOpacity
                    style={styles.reviewBtn}
                    onPress={() => router.push({ pathname: '/reviews', params: { talep_id: id, degerlendirilen_id: request.match_surucu_id } })}
                    activeOpacity={0.85}
                >
                    <Text style={styles.reviewBtnText}>⭐ Sürücüyü Değerlendir</Text>
                </TouchableOpacity>
            )}

            {canCancel && (
                <>
                    <TouchableOpacity
                        style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
                        onPress={handleCancel}
                        disabled={cancelling}
                        activeOpacity={0.85}
                    >
                        {cancelling
                            ? <ActivityIndicator color={C.danger} />
                            : <Text style={styles.cancelBtnText}>Talebi İptal Et</Text>
                        }
                    </TouchableOpacity>
                    <Text style={styles.cancelPolicy}>
                        {request.durum === 'bekliyor'
                            ? '✅ Eşleşme öncesi iptal ücretsizdir.'
                            : request.surucu_vardi_at
                                ? '⚠️ Sürücü adrese vardı — iptalde %50 (veya taban ücret) kesinti uygulanır (Madde 7/1).'
                                : '⚠️ Eşleşmeden 5 dk sonra iptal taban ücrete tabidir (Madde 7).'
                        }
                    </Text>
                </>
            )}

            {request.durum !== 'bekliyor' && (
                <TouchableOpacity
                    style={styles.incidentBtn}
                    onPress={() => router.push({ pathname: '/incident-report', params: { talep_id: id } })}
                    activeOpacity={0.85}
                >
                    <Text style={styles.incidentBtnText}>⚠️ Hasar/Olay Bildir</Text>
                </TouchableOpacity>
            )}
        </ScrollView>
    );
}

function LocationRow({ styles, color, label, main, sub }) {
    return (
        <View style={styles.locRow}>
            <View style={[styles.locDot, { backgroundColor: color }]} />
            <View style={{ flex: 1 }}>
                <Text style={styles.locLabel}>{label}</Text>
                <Text style={styles.locMain}>{main}</Text>
                {sub && <Text style={styles.locSub} numberOfLines={2}>{sub}</Text>}
            </View>
        </View>
    );
}

function InfoRow({ styles, C, label, value, highlight }) {
    return (
        <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={[styles.infoValue, highlight && { color: C.primary, fontWeight: '800' }]}>{value}</Text>
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:      { flex: 1, backgroundColor: C.background },
    center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
    errorText: { color: C.textMuted, fontSize: 15 },
    content:   { padding: 16, gap: 12, paddingBottom: 40 },

    statusCard: {
        backgroundColor: C.card, borderRadius: 14,
        padding: 16, borderLeftWidth: 4,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    statusLabel: { fontSize: 16, fontWeight: '800' },
    statusDate:  { color: C.textMuted, fontSize: 12 },

    card:      { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 10 },
    cardTitle: { color: C.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

    locRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    locDot:   { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
    locLabel: { color: C.textMuted, fontSize: 10, fontWeight: '700' },
    locMain:  { color: C.text, fontSize: 14, fontWeight: '700' },
    locSub:   { color: C.textMuted, fontSize: 12 },
    divider:  { height: 1, backgroundColor: C.border, marginLeft: 24 },

    infoRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel: { color: C.textMuted, fontSize: 13 },
    infoValue: { color: C.text, fontSize: 13, fontWeight: '600' },

    noteText:       { color: C.text, fontSize: 13, lineHeight: 20 },
    noteBlock:      { gap: 4 },
    noteBlockLabel: { color: C.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },

    trackBtn:     { backgroundColor: '#60a5fa22', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#60a5fa' },
    trackBtnText: { color: '#60a5fa', fontWeight: '700' },

    reviewBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    reviewBtnText: { color: C.darker, fontWeight: '800', fontSize: 15 },

    cancelBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: C.danger },
    cancelBtnText: { color: C.danger, fontWeight: '700', fontSize: 15 },
    cancelPolicy:  { color: C.textMuted, fontSize: 11, textAlign: 'center', marginTop: 6, lineHeight: 16 },

    incidentBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#f59e0b', marginTop: 4 },
    incidentBtnText: { color: '#f59e0b', fontWeight: '700', fontSize: 14 },
});
