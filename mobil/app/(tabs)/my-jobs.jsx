import { useState, useCallback } from 'react';
import {
    View, Text, FlatList, StyleSheet,
    TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import taxiApi from '../../src/api/taxiClient';
import Colors from '../../src/theme/colors';

const STATUS = {
    kabul_edildi: { label: 'Kabul Edildi', color: Colors.info,    icon: 'checkmark-circle' },
    devam_ediyor: { label: 'Devam Ediyor', color: '#8b5cf6',      icon: 'navigate'          },
    tamamlandi:   { label: 'Tamamlandı',   color: Colors.success, icon: 'trophy'            },
    iptal:        { label: 'İptal Edildi', color: Colors.danger,  icon: 'close-circle'      },
};

export default function MyJobsScreen() {
    const router = useRouter();
    const [jobs, setJobs]         = useState([]);
    const [loading, setLoading]   = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    async function load() {
        const res = await taxiApi.getMyJobs();
        setJobs(res.jobs ?? []);
        setLoading(false);
    }

    useFocusEffect(useCallback(() => { load(); }, []));

    const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    const active    = jobs.filter(j => ['kabul_edildi','devam_ediyor'].includes(j.durum));
    const completed = jobs.filter(j => !['kabul_edildi','devam_ediyor'].includes(j.durum));

    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    }

    return (
        <FlatList
            style={styles.root}
            data={[...active, ...completed]}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            ListEmptyComponent={
                <View style={styles.empty}>
                    <Ionicons name="briefcase-outline" size={56} color={Colors.textMuted} />
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
                            job={item}
                            onPress={() => {
                                if (['kabul_edildi','devam_ediyor'].includes(item.durum)) {
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

function JobCard({ job, onPress }) {
    const s = STATUS[job.durum] ?? { label: job.durum, color: Colors.textMuted, icon: 'ellipse-outline' };
    const isActive = ['kabul_edildi','devam_ediyor'].includes(job.durum);

    return (
        <TouchableOpacity
            style={[styles.card, isActive && styles.cardActive]}
            onPress={onPress}
            activeOpacity={isActive ? 0.8 : 1}
        >
            {/* Status */}
            <View style={styles.cardTop}>
                <View style={[styles.statusBadge, { backgroundColor: s.color + '22', borderColor: s.color }]}>
                    <Ionicons name={s.icon} size={13} color={s.color} />
                    <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                </View>
                <Text style={styles.fareText}>
                    {Number(job.toplam_ucret).toLocaleString('tr-TR')} ₺
                </Text>
            </View>

            {/* Route */}
            <View style={styles.routeBlock}>
                <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: Colors.success }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.routeMain}>{job.baslangic_ilce}, {job.baslangic_sehir}</Text>
                        <Text style={styles.routeSub} numberOfLines={1}>{job.baslangic_noktasi}</Text>
                    </View>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routeRow}>
                    <View style={[styles.dot, { backgroundColor: Colors.danger }]} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.routeMain}>{job.varis_ilce}, {job.varis_sehir}</Text>
                        <Text style={styles.routeSub} numberOfLines={1}>{job.varis_noktasi}</Text>
                    </View>
                </View>
            </View>

            {/* Meta */}
            <View style={styles.metaRow}>
                <MetaItem icon="paw-outline"      text={job.kopek_adi} />
                <MetaItem icon="person-outline"   text={job.sahip_adi} />
                {job.gercek_mesafe
                    ? <MetaItem icon="navigate-outline" text={`${Number(job.gercek_mesafe).toFixed(1)} km`} />
                    : null
                }
            </View>

            {isActive && (
                <View style={styles.continueRow}>
                    <Text style={styles.continueText}>Devam Et</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                </View>
            )}
        </TouchableOpacity>
    );
}

function MetaItem({ icon, text }) {
    return (
        <View style={styles.meta}>
            <Ionicons name={icon} size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root:   { flex: 1, backgroundColor: Colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
    list:   { padding: 16, gap: 10, paddingBottom: 32 },

    empty:      { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
    emptySub:   { color: Colors.textMuted, fontSize: 13 },

    sectionHeader: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },

    card:       { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 12 },
    cardActive: { borderWidth: 1.5, borderColor: Colors.primary + '60' },

    cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
    statusText:  { fontSize: 12, fontWeight: '700' },
    fareText:    { color: Colors.primary, fontSize: 16, fontWeight: '800' },

    routeBlock: { gap: 4 },
    routeRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    dot:        { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
    routeLine:  { height: 1, backgroundColor: Colors.border, marginLeft: 20, marginVertical: 2 },
    routeMain:  { color: Colors.text, fontSize: 13, fontWeight: '700' },
    routeSub:   { color: Colors.textMuted, fontSize: 11 },

    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    meta:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText:{ color: Colors.textMuted, fontSize: 12 },

    continueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
    continueText:{ color: Colors.primary, fontWeight: '700', fontSize: 14 },
});
