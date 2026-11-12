/**
 * Home Screen — Uber-style
 * Owner: Book a Ride CTA + active trip banner + recent trips
 * Driver: Earnings + active job + job pool CTA
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    View, Text, ScrollView, StyleSheet,
    TouchableOpacity, RefreshControl, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import taxiApi from '../../src/api/taxiClient';
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
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const router = useRouter();
    const [data, setData]           = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [contractNotif, setContractNotif] = useState(null);

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

    const checkContractNotif = useCallback(async () => {
        try {
            const res = await taxiApi.getNotifications();
            const unread = (res.notifications ?? []).find(n => n.tip === 'sozlesme' && n.okundu_mu == 0);
            if (unread) setContractNotif(unread);
        } catch {}
    }, []);

    const dismissContractNotif = useCallback(async () => {
        setContractNotif(null);
        try { await taxiApi.markNotificationsRead(); } catch {}
    }, []);

    // Refresh every time this tab is focused + poll when there's an active job/request
    useFocusEffect(useCallback(() => {
        load();
        checkContractNotif();
        const interval = setInterval(() => { load(); }, 10000);
        return () => clearInterval(interval);
    }, [load, checkContractNotif]));

    const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    const activeJob     = isDriver ? data?.jobs?.find(j => ['kabul_edildi','devam_ediyor','teslim_bekleniyor'].includes(j.durum)) : null;
    const activeRequest = isOwner  ? data?.requests?.find(r => ['bekliyor','eslesti','basladi','teslim_bekleniyor'].includes(r.durum)) : null;
    const recentJobs    = isDriver ? (data?.jobs     ?? []).slice(0, 5) : [];
    const recentReqs    = isOwner  ? (data?.requests ?? []).slice(0, 5) : [];

    // Today's earnings for driver — use Turkey time (UTC+3) to avoid midnight cutoff bug
    const trToday = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const todayEarnings = isDriver
        ? (data?.jobs ?? [])
            .filter(j => j.durum === 'tamamlandi' && j.bitis_zamani?.startsWith(trToday))
            .reduce((sum, j) => sum + Number(j.surucu_kazanc ?? j.toplam_ucret ?? 0), 0)
        : 0;

    return (
        <>
        {/* Sözleşme güncelleme bildirimi */}
        <Modal visible={!!contractNotif} transparent animationType="fade" onRequestClose={dismissContractNotif}>
            <View style={s.modalOverlay}>
                <View style={[s.modalBox, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={[s.modalIconWrap, { backgroundColor: C.primary + '22' }]}>
                        <Ionicons name="document-text-outline" size={32} color={C.primary} />
                    </View>
                    <Text style={[s.modalTitle, { color: C.text }]}>Kullanım Koşulları Güncellendi</Text>
                    <Text style={[s.modalBody, { color: C.textMuted }]}>
                        {contractNotif?.icerik ?? 'Pet Taxi kullanım sözleşmesi güncellendi. Lütfen yeni koşulları inceleyin.'}
                    </Text>
                    <TouchableOpacity
                        style={[s.modalPrimary, { backgroundColor: C.primary }]}
                        onPress={() => { dismissContractNotif(); router.push('/contract'); }}
                    >
                        <Text style={[s.modalPrimaryText, { color: C.darker }]}>Sözleşmeyi İncele</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.modalDismiss} onPress={dismissContractNotif}>
                        <Text style={[s.modalDismissText, { color: C.textMuted }]}>Daha Sonra</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>

        <ScrollView
            style={s.root}
            contentContainerStyle={s.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
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
                            <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
                        </TouchableOpacity>
                    ) : (
                        /* Book a Ride CTA */
                        <TouchableOpacity
                            onPress={() => router.push('/create-request')}
                            activeOpacity={0.88}
                        >
                            <LinearGradient
                                colors={['#f59e0b', '#d97706', '#b45309']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={s.bookBtn}
                            >
                                <View style={s.bookBtnLeft}>
                                    <Text style={s.bookBtnTitle}>Yolculuk Planla</Text>
                                    <Text style={s.bookBtnSub}>Köpeğiniz için güvenli ulaşım</Text>
                                </View>
                                <View style={s.bookBtnIcon}>
                                    <Ionicons name="arrow-forward" size={22} color={C.darker} />
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}

                    {/* Second CTA if active (track / continue) */}
                    {activeRequest && ['eslesti','basladi','teslim_bekleniyor'].includes(activeRequest.durum) && (
                        <TouchableOpacity
                            style={s.trackBtn}
                            onPress={() => router.push({ pathname: '/active-trip', params: { match_id: activeRequest.match_id ?? 0, talep_id: activeRequest.id } })}
                            activeOpacity={0.85}
                        >
                            <Ionicons
                                name={activeRequest.durum === 'teslim_bekleniyor' ? 'checkmark-circle-outline' : 'navigate-outline'}
                                size={18} color={C.primary}
                            />
                            <Text style={s.trackBtnText}>
                                {activeRequest.durum === 'teslim_bekleniyor' ? '🐾 Teslimi Onayla'
                                    : activeRequest.durum === 'eslesti' ? '🚗 Sürücü Geliyor — Konumunu Gör'
                                    : 'Canlı Konumu Takip Et'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {/* Recent trips */}
                    {recentReqs.length > 0 && (
                        <View style={s.section}>
                            <Text style={s.sectionTitle}>SON YOLCULUKLAR</Text>
                            {recentReqs.map(req => (
                                <TripCard
                                    key={req.id}
                                    s={s}
                                    from={req.baslangic_ilce}
                                    to={req.varis_ilce}
                                    status={req.durum}
                                    statusLabel={STATUS_LABEL[req.durum] ?? req.durum}
                                    statusColor={STATUS_COLOR[req.durum] ?? C.textMuted}
                                    meta={`₺${Number(req.toplam_ucret).toFixed(2)}  ·  ${req.kopek_adi}`}
                                    onPress={() => router.push({ pathname: '/request-detail', params: { id: req.id } })}
                                />
                            ))}
                        </View>
                    )}

                    {recentReqs.length === 0 && !activeRequest && (
                        <EmptyState
                            s={s}
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
                    <LinearGradient
                        colors={['#1e293b', '#1a2744']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.earningsStrip}
                    >
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
                    </LinearGradient>

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
                                        {activeJob.durum === 'kabul_edildi' ? 'Alım Noktasına Git' : activeJob.durum === 'teslim_bekleniyor' ? '⏳ Teslim Onayı Bekleniyor' : 'Yolculuk Devam Ediyor'}
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
                                <Ionicons name="search-outline" size={22} color={C.primary} />
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
                                    s={s}
                                    from={job.baslangic_ilce}
                                    to={job.varis_ilce}
                                    status={job.durum}
                                    statusLabel={STATUS_LABEL[job.durum] ?? job.durum}
                                    statusColor={STATUS_COLOR[job.durum] ?? C.textMuted}
                                    meta={`₺${Number(job.surucu_kazanc ?? job.toplam_ucret).toFixed(2)}  ·  ${job.kopek_adi ?? ''}`}
                                    onPress={() => router.push({ pathname: '/request-detail', params: { id: job.talep_id } })}
                                />
                            ))}
                        </View>
                    )}

                    {recentJobs.length === 0 && !activeJob && (
                        <EmptyState
                            s={s}
                            icon="car-outline"
                            title="Henüz iş yok"
                            sub="Talep kabul etmek için iş havuzuna bak"
                        />
                    )}
                </>
            )}
        </ScrollView>
        </>
    );
}

function TripCard({ s, from, to, statusLabel, statusColor, meta, onPress }) {
    return (
        <TouchableOpacity style={s.tripCard} onPress={onPress} activeOpacity={0.8}>
            <View style={s.tripCardRoute}>
                <View style={s.tripDotA} />
                <View style={s.tripCardLine} />
                <View style={s.tripDotB} />
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

function EmptyState({ s, icon, title, sub }) {
    const { colors: C } = useTheme();
    return (
        <View style={s.emptyState}>
            <Ionicons name={icon} size={48} color={C.border} />
            <Text style={s.emptyTitle}>{title}</Text>
            <Text style={s.emptySub}>{sub}</Text>
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:    { flex: 1, backgroundColor: C.background },
    content: { padding: 16, gap: 14, paddingBottom: 32 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    greeting: { color: C.textMuted, fontSize: 13 },
    userName: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
    balanceCard: {
        backgroundColor: C.card, borderRadius: 14, padding: 12,
        alignItems: 'flex-end', borderWidth: 1, borderColor: C.border,
    },
    balanceLabel: { color: C.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    balanceValue: { color: C.primary, fontSize: 17, fontWeight: '900' },

    activeBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: 16, padding: 14, borderWidth: 1,
    },
    activeBannerDot:    { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    activeBannerStatus: { fontSize: 13, fontWeight: '800' },
    activeBannerRoute:  { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
    activeBannerSub:    { color: C.textMuted, fontSize: 12, marginTop: 2 },

    bookBtn: {
        borderRadius: 22, overflow: 'hidden',
        padding: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    bookBtnLeft:  {},
    bookBtnTitle: { color: C.darker, fontSize: 22, fontWeight: '900' },
    bookBtnSub:   { color: C.darker, fontSize: 13, opacity: 0.7, marginTop: 2 },
    bookBtnIcon:  {
        width: 44, height: 44, borderRadius: 22, backgroundColor: C.darker + '22',
        alignItems: 'center', justifyContent: 'center',
    },

    trackBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: C.card, borderRadius: 12, paddingVertical: 14,
        borderWidth: 1, borderColor: C.primary + '44',
    },
    trackBtnText: { color: C.primary, fontWeight: '700', fontSize: 14 },

    section:      { gap: 8 },
    sectionTitle: { color: C.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 4 },

    tripCard: {
        backgroundColor: C.card, borderRadius: 14, padding: 14,
        flexDirection: 'row', gap: 12,
    },
    tripCardRoute:  { width: 14, alignItems: 'center', paddingTop: 4, gap: 0 },
    tripDotA:       { width: 10, height: 10, borderRadius: 5, backgroundColor: C.success },
    tripCardLine:   { width: 2, flex: 1, backgroundColor: C.border, marginVertical: 3 },
    tripDotB:       { width: 10, height: 10, borderRadius: 2, backgroundColor: C.primary },
    tripCardBody:   { flex: 1, gap: 4 },
    tripFrom:       { color: C.text, fontSize: 14, fontWeight: '600' },
    tripTo:         { color: C.text, fontSize: 14, fontWeight: '600' },
    tripMeta:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    tripMetaText:   { color: C.textMuted, fontSize: 12 },
    statusPill:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusPillText: { fontSize: 11, fontWeight: '700' },

    earningsStrip: {
        borderRadius: 18, padding: 18, overflow: 'hidden',
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderColor: C.border,
    },
    earningItem:    { flex: 1, alignItems: 'center' },
    earningValue:   { color: C.text, fontSize: 18, fontWeight: '800' },
    earningLabel:   { color: C.textMuted, fontSize: 11, marginTop: 2 },
    earningDivider: { width: 1, height: 36, backgroundColor: C.border },

    activeJobBanner: {
        backgroundColor: '#1a2744', borderRadius: 16, padding: 16,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: C.info + '44',
    },
    activeJobLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
    activePulseDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: C.info },
    activeJobStatus: { color: C.info, fontWeight: '800', fontSize: 13 },
    activeJobRoute:  { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
    activeJobCTA:    {
        backgroundColor: C.primary, borderRadius: 10,
        paddingHorizontal: 16, paddingVertical: 8,
    },
    activeJobCTAText: { color: C.darker, fontWeight: '800', fontSize: 13 },

    poolBtn: {
        backgroundColor: C.card, borderRadius: 18, padding: 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1, borderColor: C.border,
    },
    poolBtnLeft:  {},
    poolBtnTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
    poolBtnSub:   { color: C.textMuted, fontSize: 13, marginTop: 2 },
    poolBtnIcon:  {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: C.primary + '22',
        alignItems: 'center', justifyContent: 'center',
    },

    emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
    emptySub:   { color: C.textMuted, fontSize: 13 },

    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
    },
    modalBox: {
        width: '100%', maxWidth: 380,
        borderRadius: 20, padding: 24, borderWidth: 1,
        alignItems: 'center', gap: 12,
    },
    modalIconWrap: {
        width: 64, height: 64, borderRadius: 32,
        alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    modalTitle:       { fontSize: 18, fontWeight: '800', textAlign: 'center' },
    modalBody:        { fontSize: 14, lineHeight: 20, textAlign: 'center' },
    modalPrimary:     { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13, width: '100%', alignItems: 'center', marginTop: 4 },
    modalPrimaryText: { fontSize: 15, fontWeight: '800' },
    modalDismiss:     { paddingVertical: 8 },
    modalDismissText: { fontSize: 13 },
});
