import { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import taxiApi from '../src/api/taxiClient';
import Colors from '../src/theme/colors';

const STATUS_MAP = {
    bekliyor:     { label: 'Bekliyor',     color: Colors.warning },
    eslesti:      { label: 'Eşleşti',      color: Colors.info },
    basladi:      { label: 'Yolda',        color: '#8b5cf6' },
    tamamlandi:   { label: 'Tamamlandı',   color: Colors.success },
    iptal:        { label: 'İptal Edildi', color: Colors.danger },
};

export default function RequestDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [request, setRequest]   = useState(null);
    const [loading, setLoading]   = useState(true);
    const [cancelling, setCancelling] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await taxiApi.getRequestDetail(Number(id));
            if (res.success) setRequest(res.request);
            setLoading(false);
        })();
    }, [id]);

    async function handleCancel() {
        Alert.alert('Talebi İptal Et', 'Bu talebi iptal etmek istediğinizden emin misiniz?', [
            { text: 'Geri Dön', style: 'cancel' },
            {
                text: 'Talebi İptal Et',
                style: 'destructive',
                onPress: async () => {
                    setCancelling(true);
                    const res = await taxiApi.cancelRequest(Number(id));
                    setCancelling(false);
                    if (res.success) {
                        Alert.alert('İptal Edildi', 'Talebiniz iptal edildi.', [
                            { text: 'Tamam', onPress: () => router.back() },
                        ]);
                    } else {
                        Alert.alert('Hata', res.error ?? 'İptal edilemedi.');
                    }
                },
            },
        ]);
    }

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    if (!request) return <View style={styles.center}><Text style={styles.errorText}>Talep bulunamadı.</Text></View>;

    const status = STATUS_MAP[request.durum] ?? { label: request.durum, color: Colors.textMuted };
    const canCancel = !['tamamlandi', 'iptal'].includes(request.durum);
    const isActive  = ['eslesti','basladi'].includes(request.durum);

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>

            {/* Status */}
            <View style={[styles.statusCard, { borderColor: status.color }]}>
                <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
                <Text style={styles.statusDate}>
                    {new Date(request.kalkis_zamani).toLocaleString('tr-TR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                </Text>
            </View>

            {/* Route */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Güzergah</Text>
                <LocationRow
                    icon="📍"
                    color={Colors.success}
                    label="ALIŞ"
                    main={`${request.baslangic_ilce}, ${request.baslangic_sehir}`}
                    sub={request.baslangic_noktasi}
                />
                <View style={styles.divider} />
                <LocationRow
                    icon="🏁"
                    color={Colors.danger}
                    label="BIRAKIŞ"
                    main={`${request.varis_ilce}, ${request.varis_sehir}`}
                    sub={request.varis_noktasi}
                />
            </View>

            {/* Details */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Detaylar</Text>
                <InfoRow label="🐕 Köpek"   value={request.kopek_adi} />
                <InfoRow label="📏 Mesafe"  value={request.tahmini_mesafe ? `${Number(request.tahmini_mesafe).toFixed(1)} km` : '-'} />
                <InfoRow label="💰 Ücret"   value={`${Number(request.toplam_ucret).toLocaleString('tr-TR')} ₺`} highlight />
                <InfoRow label="🚗 Tür"     value={request.tip === 'anlik' ? 'Anlık' : 'Planlanmış'} />
            </View>

            {/* Driver (if matched) */}
            {request.surucu_adi && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Sürücü</Text>
                    <InfoRow label="👤 Ad"     value={request.surucu_adi} />
                    {request.surucu_telefon && (
                        <InfoRow label="📞 Telefon" value={request.surucu_telefon} />
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

            {/* Notes */}
            {request.ozel_talepler && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Notlar</Text>
                    <Text style={styles.noteText}>{request.ozel_talepler}</Text>
                </View>
            )}

            {/* Rate (if completed) */}
            {request.durum === 'tamamlandi' && (
                <TouchableOpacity
                    style={styles.reviewBtn}
                    onPress={() => router.push({ pathname: '/reviews', params: { talep_id: id, degerlendirilen_id: request.match_surucu_id } })}
                    activeOpacity={0.85}
                >
                    <Text style={styles.reviewBtnText}>⭐ Sürücüyü Değerlendir</Text>
                </TouchableOpacity>
            )}

            {/* Cancel */}
            {canCancel && (
                <TouchableOpacity
                    style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
                    onPress={handleCancel}
                    disabled={cancelling}
                    activeOpacity={0.85}
                >
                    {cancelling
                        ? <ActivityIndicator color={Colors.danger} />
                        : <Text style={styles.cancelBtnText}>Talebi İptal Et</Text>
                    }
                </TouchableOpacity>
            )}
        </ScrollView>
    );
}

function LocationRow({ color, label, main, sub }) {
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

function InfoRow({ label, value, highlight }) {
    return (
        <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={[styles.infoValue, highlight && { color: Colors.primary, fontWeight: '800' }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root:    { flex: 1, backgroundColor: Colors.background },
    center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
    errorText: { color: Colors.textMuted, fontSize: 15 },
    content: { padding: 16, gap: 12, paddingBottom: 40 },

    statusCard: {
        backgroundColor: Colors.card, borderRadius: 14,
        padding: 16, borderLeftWidth: 4,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    statusLabel: { fontSize: 16, fontWeight: '800' },
    statusDate:  { color: Colors.textMuted, fontSize: 12 },

    card:      { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 10 },
    cardTitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },

    locRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    locDot:    { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
    locLabel:  { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
    locMain:   { color: Colors.text, fontSize: 14, fontWeight: '700' },
    locSub:    { color: Colors.textMuted, fontSize: 12 },
    divider:   { height: 1, backgroundColor: Colors.border, marginLeft: 24 },

    infoRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel: { color: Colors.textMuted, fontSize: 13 },
    infoValue: { color: Colors.text, fontSize: 13, fontWeight: '600' },

    noteText: { color: Colors.text, fontSize: 13, lineHeight: 20 },

    trackBtn:     { backgroundColor: Colors.info + '22', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.info },
    trackBtnText: { color: Colors.info, fontWeight: '700' },

    reviewBtn:     { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    reviewBtnText: { color: Colors.darker, fontWeight: '800', fontSize: 15 },

    cancelBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.danger },
    cancelBtnText: { color: Colors.danger, fontWeight: '700', fontSize: 15 },
});
