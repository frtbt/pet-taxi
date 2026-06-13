/**
 * Job Pool for Drivers / My Requests for Owners
 * Content changes based on useAuth().isDriver
 */
import { useState, useCallback } from 'react';
import {
    View, Text, FlatList, StyleSheet,
    TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import taxiApi from '../../src/api/taxiClient';
import Colors from '../../src/theme/colors';
import { useFocusEffect } from '@react-navigation/native';

const STATUS_MAP = {
    bekliyor:     { label: 'Bekliyor',      color: Colors.warning },
    eslesti:      { label: 'Eşleşti',       color: Colors.info },
    basladi:      { label: 'Yolda',         color: '#8b5cf6' },
    tamamlandi:   { label: 'Tamamlandı',    color: Colors.success },
    iptal:        { label: 'İptal Edildi',  color: Colors.danger },
    kabul_edildi: { label: 'Kabul Edildi',  color: Colors.info },
    devam_ediyor: { label: 'Devam Ediyor',  color: '#8b5cf6' },
};

export default function PoolScreen() {
    const { isDriver } = useAuth();
    const router = useRouter();
    const [items, setItems]         = useState([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [accepting, setAccepting] = useState(null);

    const load = useCallback(async () => {
        const res = isDriver ? await taxiApi.getPool() : await taxiApi.getMyRequests();
        setItems(isDriver ? (res.requests ?? []) : (res.requests ?? []));
        setLoading(false);
    }, [isDriver]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    async function handleAccept(talepId) {
        Alert.alert('Talebi Kabul Et', 'Bu talebi kabul etmek istiyor musunuz?', [
            { text: 'İptal', style: 'cancel' },
            {
                text: 'Kabul Et',
                onPress: async () => {
                    setAccepting(talepId);
                    const res = await taxiApi.acceptRequest(talepId);
                    setAccepting(null);
                    if (res.success) {
                        Alert.alert('Başarılı', 'Talep kabul edildi!');
                        router.push({ pathname: '/active-trip', params: { match_id: res.match_id } });
                    } else {
                        Alert.alert('Hata', res.error ?? 'Bir hata oluştu.');
                    }
                },
            },
        ]);
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <FlatList
                data={items}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyEmoji}>{isDriver ? '🗺️' : '📋'}</Text>
                        <Text style={styles.emptyText}>
                            {isDriver ? 'Şu anda açık talep yok.' : 'Henüz talep oluşturmadınız.'}
                        </Text>
                    </View>
                }
                ListHeaderComponent={
                    <Text style={styles.listHeader}>
                        {isDriver ? `${items.length} açık talep` : `${items.length} talep`}
                    </Text>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.card}
                        onPress={() => isDriver
                            ? null
                            : router.push({ pathname: '/request-detail', params: { id: item.id } })
                        }
                        activeOpacity={isDriver ? 1 : 0.8}
                    >
                        {/* Route */}
                        <View style={styles.routeRow}>
                            <View style={styles.routePoint}>
                                <View style={[styles.dot, { backgroundColor: Colors.success }]} />
                                <View>
                                    <Text style={styles.routeLabel}>ALIŞ</Text>
                                    <Text style={styles.routeMain}>{item.baslangic_ilce}, {item.baslangic_sehir}</Text>
                                    <Text style={styles.routeSub} numberOfLines={1}>{item.baslangic_noktasi}</Text>
                                </View>
                            </View>
                            <View style={styles.routeDivider} />
                            <View style={styles.routePoint}>
                                <View style={[styles.dot, { backgroundColor: Colors.danger }]} />
                                <View>
                                    <Text style={styles.routeLabel}>BIRAKIŞ</Text>
                                    <Text style={styles.routeMain}>{item.varis_ilce}, {item.varis_sehir}</Text>
                                    <Text style={styles.routeSub} numberOfLines={1}>{item.varis_noktasi}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Meta */}
                        <View style={styles.metaRow}>
                            <View style={styles.metaItem}>
                                <Text style={styles.metaLabel}>🐕 Köpek</Text>
                                <Text style={styles.metaValue}>{item.kopek_adi}</Text>
                            </View>
                            {item.tahmini_mesafe && (
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>📏 Mesafe</Text>
                                    <Text style={styles.metaValue}>{Number(item.tahmini_mesafe).toFixed(1)} km</Text>
                                </View>
                            )}
                            <View style={styles.metaItem}>
                                <Text style={styles.metaLabel}>💰 Ücret</Text>
                                <Text style={[styles.metaValue, { color: Colors.primary }]}>
                                    {Number(item.toplam_ucret).toLocaleString('tr-TR')} ₺
                                </Text>
                            </View>
                        </View>

                        {/* Status / Button */}
                        <View style={styles.bottomRow}>
                            {!isDriver && (() => {
                                const s = STATUS_MAP[item.durum] ?? { label: item.durum, color: Colors.textMuted };
                                return (
                                    <View style={[styles.statusBadge, { backgroundColor: s.color + '22', borderColor: s.color }]}>
                                        <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                                    </View>
                                );
                            })()}
                            {isDriver && (
                                <TouchableOpacity
                                    style={[styles.acceptBtn, accepting === item.id && { opacity: 0.6 }]}
                                    onPress={() => handleAccept(item.id)}
                                    disabled={accepting === item.id}
                                    activeOpacity={0.8}
                                >
                                    {accepting === item.id
                                        ? <ActivityIndicator size="small" color={Colors.darker} />
                                        : <Text style={styles.acceptBtnText}>Kabul Et ›</Text>
                                    }
                                </TouchableOpacity>
                            )}
                            <Text style={styles.timeText}>
                                🕐 {new Date(item.kalkis_zamani).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}
            />

            {/* "New Request" button for owners */}
            {!isDriver && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={() => router.push('/create-request')}
                    activeOpacity={0.85}
                >
                    <Text style={styles.fabText}>+ Taksi Çağır</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root:   { flex: 1, backgroundColor: Colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
    list:   { padding: 16, gap: 12, paddingBottom: 90 },

    listHeader: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },

    empty:      { alignItems: 'center', paddingVertical: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyText:  { color: Colors.textMuted, fontSize: 14 },

    card: {
        backgroundColor: Colors.card,
        borderRadius: 16,
        padding: 16,
        gap: 12,
    },

    routeRow:     { gap: 8 },
    routePoint:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    dot:          { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
    routeLabel:   { color: Colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    routeMain:    { color: Colors.text, fontSize: 14, fontWeight: '700' },
    routeSub:     { color: Colors.textMuted, fontSize: 12, maxWidth: 260 },
    routeDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 4, marginLeft: 22 },

    metaRow:    { flexDirection: 'row', gap: 16 },
    metaItem:   { gap: 2 },
    metaLabel:  { color: Colors.textMuted, fontSize: 11 },
    metaValue:  { color: Colors.text, fontSize: 13, fontWeight: '700' },

    bottomRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    statusBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
    statusText:  { fontSize: 12, fontWeight: '700' },
    timeText:    { color: Colors.textMuted, fontSize: 12 },

    acceptBtn:     { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
    acceptBtnText: { color: Colors.darker, fontWeight: '800', fontSize: 14 },

    fab: {
        position: 'absolute', bottom: 20, right: 20, left: 20,
        backgroundColor: Colors.primary,
        borderRadius: 14, paddingVertical: 16,
        alignItems: 'center', elevation: 6,
    },
    fabText: { color: Colors.darker, fontWeight: '800', fontSize: 16 },
});
