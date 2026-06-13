/**
 * Home Screen — Uber-style
 * Owner: Book a Ride CTA + active trip banner + recent trips
 * Driver: Earnings + active job + job pool CTA
 */
import { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet,
    TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import taxiApi from '../../src/api/taxiClient';
import Colors from '../../src/theme/colors';
import { useFocusEffect } from '@react-navigation/native';

const STATUS_LABEL = {
    bekliyor:     'Bekliyor',
    eslesti:      'Sürücü Bulundu',
    basladi:      'Yolda',
    tamamlandi:   'Tamamlandı',
    iptal:        'İptal Edildi',
    kabul_edildi: 'Kabul Edildi',
    devam_ediyor: 'Devam Ediyor',
};

const STATUS_COLOR = {
    bekliyor:     '#f59e0b',
    eslesti:      '#3b82f6',
    basladi:      '#8b5cf6',
    tamamlandi:   '#10b981',
    iptal:        '#ef4444',
    kabul_edildi: '#3b82f6',
    devam_ediyor: '#8b5cf6',
};

export default function HomeScreen() {
    const { user, isDriver, isOwner } = useAuth();
    const router = useRouter();
    const [data, setData]           = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            if (isDriver) {
                const [jobs, wallet] = await Promise.all([taxiApi.getMyJobs(), taxiApi.getWallet()]);
                setData({ jobs: jobs.jobs ?? [], bakiye: wallet.bakiye ?? 0 });
            } else {
                const [reqs, wallet] = await Promise.all([taxiApi.getMyRequests(), taxiApi.getWallet()]);
                setData({ requests: reqs.requests ?? [], bakiye: wallet.bakiye ?? 0 });
            }
        } catch {}
    }, [isDriver]);

    // Refresh every time this tab is focused
    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    const activeJob     = isDriver ? data?.jobs?.find(j => ['kabul_edildi','devam_ediyor'].includes(j.durum)) : null;
    const activeRequest = isOwner  ? data?.requests?.find(r => ['bekliyor','eslesti','basladi'].includes(r.durum)) : null;
    const recentJobs    = isDriver ? (data?.jobs     ?? []).slice(0, 5) : [];
    const recentReqs    = isOwner  ? (data?.requests ?? []).slice(0, 5) : [];

    // Today's earnings for driver
    const todayEarnings = isDriver
        ? (data?.jobs ?? [])
            .filter(j => j.durum === 'tamamlandi' && j.bitis_zamani?.startsWith(new Date().toISOString().slice(0,10)))
            .reduce((sum, j) => sum + Number(j.toplam_ucret ?? 0), 0)
        : 0;

    return (
        <ScrollView
            style={s.root}
            contentContainerStyle={s.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
            {/* ── Header bar ─────────────────────────────────────── */}
            <View style={s.header}>
                <View>
                    <Text style={s.greeting}>Merhaba,</Text>
                    <Text style={s.userName}>{user?.ad_soyad?.split(' ')[0] ?? 'Kullanıcı'}</Text>
                </View>
                <TouchableOpacity style={s.balanceCard} onPress={() => router.push('/(tabs)/wallet')}>
                    <Text style={s.balanceLabel}>BAKİYE</Text>
                    <Text style={s.balanceValue}>
                        ₺{Number(data?.bakiye ?? 0).toFixed(2)}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* ── OWNER VIEW ─────────────────────────────────────── */}
            {isOwner && (
                <>
                    {/* Active request banner */}
                    {activeRequest ? (
                        <TouchableOpacity
                            style={[s.activeBanner, { backgroundColor: STATUS_COLOR[activeRequest.durum] + '22', borderColor: STATUS_COLOR[activeRequest.durum] + '55' }]}
                            onPress={() => router.push({ pathname: '/request-detail', params: { id: activeRequest.id } })}
                            activeOpacity={0.85}
                        >
                            <View style={[s.activeBannerDot, { backgroundColor: STATUS_COLOR[activeRequest.durum] }]} />
                            <View style={{ flex: 1 }}>
                                <Text style={[s.activeBannerStatus, { color: STATUS_COLOR[activeRequest.durum] }]}>
                                    {STATUS_LABEL[activeRequest.durum] ?? activeRequest.durum}
                                </Text>
                                <Text style={s.activeBannerRoute}>
                                    {activeRequest.baslangic_ilce} → {activeRequest.varis_ilce}
                                </Text>
                                {activeRequest.surucu_adi && (
                                    <Text style={s.activeBannerSub}>Sürücü: {activeRequest.surucu_adi}</Text>
                                )}
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                        </TouchableOpacity>
                    ) : (
                        /* Book a Ride CTA */
                        <TouchableOpacity
                            style={s.bookBtn}
                            onPress={() => router.push('/create-request')}
                            activeOpacity={0.88}
                        >
                            <View style={s.bookBtnLeft}>
                                <Text style={s.bookBtnTitle}>Yolculuk Planla</Text>
                                <Text style={s.bookBtnSub}>Köpeğiniz için güvenli ulaşım</Text>
                            </View>
                            <View style={s.bookBtnIcon}>
                                <Ionicons name="arrow-forward" size={22} color={Colors.darker} />
                            </View>
                        </TouchableOpacity>
                    )}

                    {/* Second CTA if active (track / continue) */}
                    {activeRequest && activeRequest.durum === 'basladi' && (
                        <TouchableOpacity
                            style={s.trackBtn}
                            onPress={() => router.push({ pathname: '/active-trip', params: { match_id: activeRequest.match_id } })}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="navigate-outline" size={18} color={Colors.primary} />
                            <Text style={s.trackBtnText}>Canlı Konumu Takip Et</Text>
                        </TouchableOpacity>
                    )}

                    {/* Recent trips */}
                    {recentReqs.length > 0 && (
                        <View style={s.section}>
                            <Text style={s.sectionTitle}>SON YOLCULUKLAR</Text>
                            {recentReqs.map(req => (
                                <TripCard
                                    key={req.id}
                                    from={req.baslangic_ilce}
                                    to={req.varis_ilce}
                                    status={req.durum}
                                    statusLabel={STATUS_LABEL[req.durum] ?? req.durum}
                                    statusColor={STATUS_COLOR[req.durum] ?? Colors.textMuted}
                                    meta={`₺${Number(req.toplam_ucret).toFixed(2)}  ·  ${req.kopek_adi}`}
                                    onPress={() => router.push({ pathname: '/request-detail', params: { id: req.id } })}
                                />
                            ))}
                        </View>
                    )}

                    {recentReqs.length === 0 && !activeRequest && (
                        <EmptyState
                            icon="paw-outline"
                            title="Henüz yolculuk yok"
                            sub="Başlamak için Yolculuk Planla'ya dokun"
                        />
                    )}
                </>
            )}

            {/* ── DRIVER VIEW ────────────────────────────────────── */}
            {isDriver && (
                <>
                    {/* Earnings strip */}
                    <View style={s.earningsStrip}>
                        <View style={s.earningItem}>
                            <Text style={s.earningValue}>₺{todayEarnings.toFixed(2)}</Text>
                            <Text style={s.earningLabel}>Bugün</Text>
                        </View>
                        <View style={s.earningDivider} />
                        <View style={s.earningItem}>
                            <Text style={s.earningValue}>{(data?.jobs ?? []).filter(j => j.durum === 'tamamlandi').length}</Text>
                            <Text style={s.earningLabel}>Toplam yolculuk</Text>
                        </View>
                        <View style={s.earningDivider} />
                        <View style={s.earningItem}>
                            <Text style={s.earningValue}>₺{Number(data?.bakiye ?? 0).toFixed(2)}</Text>
                            <Text style={s.earningLabel}>Cüzdan</Text>
                        </View>
                    </View>

                    {/* Active job banner */}
                    {activeJob ? (
                        <TouchableOpacity
                            style={s.activeJobBanner}
                            onPress={() => router.push({ pathname: '/active-trip', params: { match_id: activeJob.id } })}
                            activeOpacity={0.85}
                        >
                            <View style={s.activeJobLeft}>
                                <View style={s.activePulseDot} />
                                <View>
                                    <Text style={s.activeJobStatus}>
                                        {activeJob.durum === 'kabul_edildi' ? 'Alım Noktasına Git' : 'Yolculuk Devam Ediyor'}
                                    </Text>
                                    <Text style={s.activeJobRoute}>
                                        {activeJob.baslangic_ilce} → {activeJob.varis_ilce}
                                    </Text>
                                </View>
                            </View>
                            <View style={s.activeJobCTA}>
                                <Text style={s.activeJobCTAText}>Aç</Text>
                            </View>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={s.poolBtn}
                            onPress={() => router.push('/(tabs)/pool')}
                            activeOpacity={0.88}
                        >
                            <View style={s.poolBtnLeft}>
                                <Text style={s.poolBtnTitle}>İş Bul</Text>
                                <Text style={s.poolBtnSub}>Açık taleplere göz at</Text>
                            </View>
                            <View style={s.poolBtnIcon}>
                                <Ionicons name="search-outline" size={22} color={Colors.primary} />
                            </View>
                        </TouchableOpacity>
                    )}

                    {/* Recent jobs */}
                    {recentJobs.length > 0 && (
                        <View style={s.section}>
                            <Text style={s.sectionTitle}>SON İŞLER</Text>
                            {recentJobs.map(job => (
                                <TripCard
                                    key={job.id}
                                    from={job.baslangic_ilce}
                                    to={job.varis_ilce}
                                    status={job.durum}
                                    statusLabel={STATUS_LABEL[job.durum] ?? job.durum}
                                    statusColor={STATUS_COLOR[job.durum] ?? Colors.textMuted}
                                    meta={`₺${Number(job.toplam_ucret).toFixed(2)}  ·  ${job.kopek_adi ?? ''}`}
                                    onPress={() => router.push({ pathname: '/request-detail', params: { id: job.talep_id } })}
                                />
                            ))}
                        </View>
                    )}

                    {recentJobs.length === 0 && !activeJob && (
                        <EmptyState
                            icon="car-outline"
                            title="Henüz iş yok"
                            sub="Talep kabul etmek için iş havuzuna bak"
                        />
                    )}
                </>
            )}
        </ScrollView>
    );
}

function TripCard({ from, to, statusLabel, statusColor, meta, onPress }) {
    return (
        <TouchableOpacity style={s.tripCard} onPress={onPress} activeOpacity={0.8}>
            <View style={s.tripCardRoute}>
                <View style={[s.tripDotA]} />
                <View style={s.tripCardLine} />
                <View style={[s.tripDotB]} />
            </View>
            <View style={s.tripCardBody}>
                <Text style={s.tripFrom}>{from}</Text>
                <Text style={s.tripTo}>{to}</Text>
                <View style={s.tripMeta}>
                    <Text style={s.tripMetaText}>{meta}</Text>
                    <View style={[s.statusPill, { backgroundColor: statusColor + '22' }]}>
                        <Text style={[s.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );
}

function EmptyState({ icon, title, sub }) {
    return (
        <View style={s.emptyState}>
            <Ionicons name={icon} size={48} color={Colors.border} />
            <Text style={s.emptyTitle}>{title}</Text>
            <Text style={s.emptySub}>{sub}</Text>
        </View>
    );
}

const s = StyleSheet.create({
    root:    { flex: 1, backgroundColor: Colors.background },
    content: { padding: 16, gap: 14, paddingBottom: 32 },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    greeting: { color: Colors.textMuted, fontSize: 13 },
    userName: { color: Colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
    balanceCard: {
        backgroundColor: Colors.card, borderRadius: 14, padding: 12,
        alignItems: 'flex-end', borderWidth: 1, borderColor: Colors.border,
    },
    balanceLabel: { color: Colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    balanceValue: { color: Colors.primary, fontSize: 17, fontWeight: '900' },

    // Active request banner
    activeBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: 16, padding: 14, borderWidth: 1,
    },
    activeBannerDot:    { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    activeBannerStatus: { fontSize: 13, fontWeight: '800' },
    activeBannerRoute:  { color: Colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
    activeBannerSub:    { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

    // Book button
    bookBtn: {
        backgroundColor: Colors.primary, borderRadius: 18,
        padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    bookBtnLeft:  {},
    bookBtnTitle: { color: Colors.darker, fontSize: 22, fontWeight: '900' },
    bookBtnSub:   { color: Colors.darker, fontSize: 13, opacity: 0.7, marginTop: 2 },
    bookBtnIcon:  {
        width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.darker + '22',
        alignItems: 'center', justifyContent: 'center',
    },

    // Track btn
    trackBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: Colors.card, borderRadius: 12, paddingVertical: 14,
        borderWidth: 1, borderColor: Colors.primary + '44',
    },
    trackBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },

    // Section
    section:      { gap: 8 },
    sectionTitle: { color: Colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 4 },

    // Trip card
    tripCard: {
        backgroundColor: Colors.card, borderRadius: 14, padding: 14,
        flexDirection: 'row', gap: 12,
    },
    tripCardRoute:  { width: 14, alignItems: 'center', paddingTop: 4, gap: 0 },
    tripDotA:       { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.success },
    tripCardLine:   { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 3 },
    tripDotB:       { width: 10, height: 10, borderRadius: 2, backgroundColor: Colors.primary },
    tripCardBody:   { flex: 1, gap: 4 },
    tripFrom:       { color: Colors.text, fontSize: 14, fontWeight: '600' },
    tripTo:         { color: Colors.text, fontSize: 14, fontWeight: '600' },
    tripMeta:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    tripMetaText:   { color: Colors.textMuted, fontSize: 12 },
    statusPill:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusPillText: { fontSize: 11, fontWeight: '700' },

    // Earnings strip
    earningsStrip: {
        backgroundColor: Colors.card, borderRadius: 16, padding: 16,
        flexDirection: 'row', alignItems: 'center',
    },
    earningItem:    { flex: 1, alignItems: 'center' },
    earningValue:   { color: Colors.text, fontSize: 18, fontWeight: '800' },
    earningLabel:   { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
    earningDivider: { width: 1, height: 36, backgroundColor: Colors.border },

    // Active job banner
    activeJobBanner: {
        backgroundColor: '#1a2744', borderRadius: 16, padding: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: Colors.info + '44',
    },
    activeJobLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
    activePulseDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.info },
    activeJobStatus: { color: Colors.info, fontWeight: '800', fontSize: 13 },
    activeJobRoute:  { color: Colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
    activeJobCTA:    {
        backgroundColor: Colors.primary, borderRadius: 10,
        paddingHorizontal: 16, paddingVertical: 8,
    },
    activeJobCTAText: { color: Colors.darker, fontWeight: '800', fontSize: 13 },

    // Pool CTA
    poolBtn: {
        backgroundColor: Colors.card, borderRadius: 18, padding: 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: Colors.border,
    },
    poolBtnLeft:  {},
    poolBtnTitle: { color: Colors.text, fontSize: 20, fontWeight: '800' },
    poolBtnSub:   { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
    poolBtnIcon:  {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: Colors.primary + '22',
        alignItems: 'center', justifyContent: 'center',
    },

    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
    emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
    emptySub:   { color: Colors.textMuted, fontSize: 13 },
});
