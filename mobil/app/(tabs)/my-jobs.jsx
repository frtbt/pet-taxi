import { useState, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, StyleSheet,
    TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import taxiApi from '../../src/api/taxiClient';
import { useTheme } from '../../src/context/ThemeContext';
import { getStatus } from '../../src/constants/tripStatus';

export default function MyJobsScreen() {
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);
    const router = useRouter();
    const [jobs, setJobs]             = useState([]);
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage]             = useState(1);
    const [hasMore, setHasMore]       = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    async function load(pg = 1) {
        const res = await taxiApi.getMyJobs(pg);
        const incoming = res.jobs ?? [];
        if (pg === 1) {
            setJobs(incoming);
        } else {
            setJobs(prev => [...prev, ...incoming]);
        }
        setHasMore(res.has_more ?? false);
        setPage(pg);
        setLoading(false);
    }

    useFocusEffect(useCallback(() => { load(1); }, []));

    const onRefresh = async () => { setRefreshing(true); await load(1); setRefreshing(false); };

    async function loadMore() {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        await load(page + 1);
        setLoadingMore(false);
    }

    const active    = jobs.filter(j => ['kabul_edildi','devam_ediyor','teslim_bekleniyor'].includes(j.durum));
    const completed = jobs.filter(j => !['kabul_edildi','devam_ediyor','teslim_bekleniyor'].includes(j.durum));

    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;
    }

    return (
        <FlatList
            style={styles.root}
            data={[...active, ...completed]}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            ListFooterComponent={
                hasMore ? (
                    <TouchableOpacity
                        style={styles.loadMoreBtn}
                        onPress={loadMore}
                        disabled={loadingMore}
                        activeOpacity={0.8}
                    >
                        {loadingMore
                            ? <ActivityIndicator color={C.primary} size="small" />
                            : <Text style={styles.loadMoreText}>Daha Fazla Göster</Text>
                        }
                    </TouchableOpacity>
                ) : null
            }
            ListEmptyComponent={
                <View style={styles.empty}>
                    <Ionicons name="briefcase-outline" size={56} color={C.textMuted} />
                    <Text style={styles.emptyTitle}>Henüz iş yok</Text>
                    <Text style={styles.emptySub}>İş havuzundan talep kabul edin.</Text>
                </View>
            }
            ListHeaderComponent={
                active.length > 0 ? (
                    <Text style={styles.sectionHeader}>Aktif İşler</Text>
                ) : null
            }
            renderItem={({ item, index }) => {
                const showCompletedHeader = index === active.length && completed.length > 0;
                return (
                    <>
                        {showCompletedHeader && (
                            <Text style={[styles.sectionHeader, { marginTop: 16 }]}>Geçmiş İşler</Text>
                        )}
                        <JobCard
                            C={C}
                            styles={styles}
                            job={item}
                            onPress={() => {
                                if (['kabul_edildi','devam_ediyor','teslim_bekleniyor'].includes(item.durum)) {
                                    router.push({ pathname: '/active-trip', params: { match_id: item.id } });
                                }
                            }}
                        />
                    </>
                );
            }}
        />
    );
}

function JobCard({ C, styles, job, onPress }) {
    const s = getStatus(job.durum);
    const isActive = ['kabul_edildi','devam_ediyor','teslim_bekleniyor'].includes(job.durum);

    return (
        <TouchableOpacity
            style={[styles.card, isActive && styles.cardActive]}
            onPress={onPress}
            activeOpacity={isActive ? 0.8 : 1}
        >
            <View style={styles.cardTop}>
                <View style={[styles.statusBadge, { backgroundColor: s.color + '22', borderColor: s.color }]}>
                    <Ionicons name={s.icon} size={13} color={s.color} />
                    <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                </View>
                <Text style={styles.fareText}>
                    {Number(job.toplam_ucret).toLocaleString('tr-TR')} ₺
                </Text>
            </View>

            <View style={styles.routeBlock}>
                <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: C.success }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.routeMain}>{job.baslangic_ilce}, {job.baslangic_sehir}</Text>
                        <Text style={styles.routeSub} numberOfLines={1}>{job.baslangic_noktasi}</Text>
                    </View>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: C.danger }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.routeMain}>{job.varis_ilce}, {job.varis_sehir}</Text>
                        <Text style={styles.routeSub} numberOfLines={1}>{job.varis_noktasi}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.metaRow}>
                <MetaItem styles={styles} C={C} icon="paw-outline"      text={job.kopek_adi} />
                <MetaItem styles={styles} C={C} icon="person-outline"   text={job.sahip_adi} />
                {job.gercek_mesafe
                    ? <MetaItem styles={styles} C={C} icon="navigate-outline" text={`${Number(job.gercek_mesafe).toFixed(1)} km`} />
                    : null
                }
            </View>

            {isActive && (
                <View style={styles.continueRow}>
                    <Text style={styles.continueText}>Devam Et</Text>
                    <Ionicons name="chevron-forward" size={16} color={C.primary} />
                </View>
            )}
        </TouchableOpacity>
    );
}

function MetaItem({ styles, C, icon, text }) {
    return (
        <View style={styles.meta}>
            <Ionicons name={icon} size={12} color={C.textMuted} />
            <Text style={styles.metaText}>{text}</Text>
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
    list:   { padding: 16, gap: 10, paddingBottom: 32 },

    empty:      { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
    emptySub:   { color: C.textMuted, fontSize: 13 },

    sectionHeader: { color: C.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },

    card:       { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 12 },
    cardActive: { borderWidth: 1.5, borderColor: C.primary + '60' },

    cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
    statusText:  { fontSize: 12, fontWeight: '700' },
    fareText:    { color: C.primary, fontSize: 16, fontWeight: '800' },

    routeBlock: { gap: 4 },
    routeRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    dot:        { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
    routeLine:  { height: 1, backgroundColor: C.border, marginLeft: 20, marginVertical: 2 },
    routeMain:  { color: C.text, fontSize: 13, fontWeight: '700' },
    routeSub:   { color: C.textMuted, fontSize: 11 },

    metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    meta:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: C.textMuted, fontSize: 12 },

    continueRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
    continueText: { color: C.primary, fontWeight: '700', fontSize: 14 },

    loadMoreBtn:  { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
    loadMoreText: { color: C.primary, fontWeight: '700', fontSize: 14 },
});
