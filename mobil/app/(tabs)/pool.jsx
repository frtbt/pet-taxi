import { useState, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, FlatList, StyleSheet,
    TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import taxiApi from '../../src/api/taxiClient';
import { useFocusEffect } from '@react-navigation/native';
import { getStatus } from '../../src/constants/tripStatus';

export default function PoolScreen() {
    const { isDriver } = useAuth();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);
    const router = useRouter();
    const [items, setItems]           = useState([]);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [accepting, setAccepting]   = useState(null);
    const autoRefreshRef = useRef(null);

    const load = useCallback(async () => {
        const res = isDriver ? await taxiApi.getPool() : await taxiApi.getMyRequests();
        setItems(isDriver ? (res.requests ?? []) : (res.requests ?? []));
        setLoading(false);
    }, [isDriver]);

    useFocusEffect(useCallback(() => {
        load();
        if (isDriver) {
            autoRefreshRef.current = setInterval(load, 30000);
        }
        return () => {
            if (autoRefreshRef.current) {
                clearInterval(autoRefreshRef.current);
                autoRefreshRef.current = null;
            }
        };
    }, [load, isDriver]));

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
                <ActivityIndicator size="large" color={C.primary} />
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <FlatList
                data={items}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
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
                        <View style={styles.routeRow}>
                            <View style={styles.routePoint}>
                                <View style={[styles.dot, { backgroundColor: C.success }]} />
                                <View>
                                    <Text style={styles.routeLabel}>ALIŞ</Text>
                                    <Text style={styles.routeMain}>{item.baslangic_ilce}, {item.baslangic_sehir}</Text>
                                    <Text style={styles.routeSub} numberOfLines={1}>{item.baslangic_noktasi}</Text>
                                </View>
                            </View>
                            <View style={styles.routeDivider} />
                            <View style={styles.routePoint}>
                                <View style={[styles.dot, { backgroundColor: C.danger }]} />
                                <View>
                                    <Text style={styles.routeLabel}>BIRAKIŞ</Text>
                                    <Text style={styles.routeMain}>{item.varis_ilce}, {item.varis_sehir}</Text>
                                    <Text style={styles.routeSub} numberOfLines={1}>{item.varis_noktasi}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.metaRow}>
                            <View style={styles.metaItem}>
                                <Text style={styles.metaLabel}>🐕 Köpek</Text>
                                <Text style={styles.metaValue}>{item.kopek_adi}</Text>
                                {isDriver && (
                                    <Text style={{ fontSize: 11, color: item.kopek_mikrocip ? C.textMuted : '#f59e0b', marginTop: 2 }}>
                                        {item.kopek_mikrocip ? `📡 ${item.kopek_mikrocip}` : '📡 Mikroçip eksik'}
                                        {' · '}
                                        {Number(item.kopek_asili) ? '✅ Aşılı' : '⚠️ Aşısız'}
                                    </Text>
                                )}
                                {isDriver && Number(item.agresyon_gecmisi) ? (
                                    <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 1, fontWeight: '700' }}>
                                        {'⚠️ Isırma/saldırma geçmişi var'}
                                        {Number(item.agizlik_taahhut) ? ' · Ağızlık takılacak' : ''}
                                    </Text>
                                ) : null}
                                {isDriver && !Number(item.ekipman_taahhut) ? (
                                    <Text style={{ fontSize: 11, color: '#f59e0b', marginTop: 1, fontWeight: '700' }}>
                                        📦 Taşıma kutusu/kafes taahhüdü yok
                                    </Text>
                                ) : null}
                            </View>
                            {item.tahmini_mesafe && (
                                <View style={styles.metaItem}>
                                    <Text style={styles.metaLabel}>📏 Mesafe</Text>
                                    <Text style={styles.metaValue}>{Number(item.tahmini_mesafe).toFixed(1)} km</Text>
                                </View>
                            )}
                            <View style={styles.metaItem}>
                                <Text style={styles.metaLabel}>💰 Ücret</Text>
                                <Text style={[styles.metaValue, { color: C.primary }]}>
                                    {Number(item.toplam_ucret).toLocaleString('tr-TR')} ₺
                                </Text>
                            </View>
                        </View>

                        <View style={styles.bottomRow}>
                            {!isDriver && (() => {
                                const st = getStatus(item.durum);
                                return (
                                    <View style={[styles.statusBadge, { backgroundColor: st.color + '22', borderColor: st.color }]}>
                                        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
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
                                        ? <ActivityIndicator size="small" color={C.darker} />
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

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
    list:   { padding: 16, gap: 12, paddingBottom: 90 },

    listHeader: { color: C.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },

    empty:      { alignItems: 'center', paddingVertical: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyText:  { color: C.textMuted, fontSize: 14 },

    card: { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 12 },

    routeRow:     { gap: 8 },
    routePoint:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    dot:          { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
    routeLabel:   { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
    routeMain:    { color: C.text, fontSize: 14, fontWeight: '700' },
    routeSub:     { color: C.textMuted, fontSize: 12, maxWidth: 260 },
    routeDivider: { height: 1, backgroundColor: C.border, marginVertical: 4, marginLeft: 22 },

    metaRow:   { flexDirection: 'row', gap: 16 },
    metaItem:  { gap: 2 },
    metaLabel: { color: C.textMuted, fontSize: 11 },
    metaValue: { color: C.text, fontSize: 13, fontWeight: '700' },

    bottomRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    statusBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
    statusText:  { fontSize: 12, fontWeight: '700' },
    timeText:    { color: C.textMuted, fontSize: 12 },

    acceptBtn:     { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
    acceptBtnText: { color: C.darker, fontWeight: '800', fontSize: 14 },

    fab: {
        position: 'absolute', bottom: 20, right: 20, left: 20,
        backgroundColor: C.primary,
        borderRadius: 14, paddingVertical: 16,
        alignItems: 'center', elevation: 6,
    },
    fabText: { color: C.darker, fontWeight: '800', fontSize: 16 },
});
