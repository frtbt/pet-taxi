import { useState, useEffect, useRef, useMemo } from 'react';
import {
    Modal, View, Text, TouchableOpacity,
    StyleSheet, ActivityIndicator, Vibration, Animated,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import taxiApi from '../api/taxiClient';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const POLL_MS   = 3000;
const TIMEOUT_S = 30;
const isExpoGo  = Constants.appOwnership === 'expo';

export default function JobAlertOverlay() {
    const { isDriver, user } = useAuth();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const router   = useRouter();
    const pathname = usePathname();
    const isOnActiveTrip = pathname === '/active-trip';

    const [newReq,    setNewReq]    = useState(null);
    const [accepting, setAccepting] = useState(false);
    const [countdown, setCountdown] = useState(TIMEOUT_S);

    const seenRef        = useRef(new Set());
    const initializedRef = useRef(false);
    const activeRef      = useRef(false);
    const intervalRef    = useRef(null);
    const countdownRef   = useRef(null);
    const progressAnim   = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isExpoGo || !isDriver) return;
        let sub;
        try {
            const Notifications = require('expo-notifications');
            sub = Notifications.addNotificationResponseReceivedListener(response => {
                const data = response.notification?.request?.content?.data ?? {};
                if (data.type === 'yeni_talep') {
                    seenRef.current.clear();
                    initializedRef.current = false;
                }
            });
        } catch {}
        return () => { try { sub?.remove(); } catch {} };
    }, [isDriver]);

    useEffect(() => {
        if (!isDriver || !user) { stopPolling(); return; }
        startPolling();
        return stopPolling;
    }, [isDriver, user?.id]);

    function stopPolling() {
        clearInterval(intervalRef.current);
        clearInterval(countdownRef.current);
        intervalRef.current = null;
    }

    function startPolling() {
        stopPolling();
        runPoll();
        intervalRef.current = setInterval(runPoll, POLL_MS);
    }

    async function runPoll() {
        try {
            const res  = await taxiApi.getPool();
            const reqs = res.requests ?? [];

            if (!initializedRef.current) {
                reqs.forEach(r => seenRef.current.add(r.id));
                initializedRef.current = true;
                return;
            }

            const fresh = reqs.filter(r => !seenRef.current.has(r.id));
            if (fresh.length > 0 && !activeRef.current && !isOnActiveTrip) {
                fresh.forEach(r => seenRef.current.add(r.id));
                showAlert(fresh[0]);
            }
        } catch {}
    }

    function showAlert(req) {
        activeRef.current = true;
        setNewReq(req);
        setCountdown(TIMEOUT_S);

        Vibration.vibrate([0, 400, 150, 400, 150, 400, 150, 400]);

        progressAnim.setValue(1);
        Animated.timing(progressAnim, {
            toValue: 0,
            duration: TIMEOUT_S * 1000,
            useNativeDriver: false,
        }).start();

        let remaining = TIMEOUT_S;
        countdownRef.current = setInterval(() => {
            remaining -= 1;
            setCountdown(remaining);
            if (remaining <= 0) {
                clearInterval(countdownRef.current);
                dismiss();
            }
        }, 1000);
    }

    function dismiss() {
        Vibration.cancel();
        clearInterval(countdownRef.current);
        progressAnim.stopAnimation();
        activeRef.current = false;
        setNewReq(null);
        setCountdown(TIMEOUT_S);
    }

    async function handleAccept() {
        if (!newReq) return;
        setAccepting(true);
        const res = await taxiApi.acceptRequest(newReq.id);
        setAccepting(false);
        dismiss();
        if (res.success) {
            router.push({ pathname: '/active-trip', params: { match_id: res.match_id } });
        } else {
            const { Alert } = require('react-native');
            Alert.alert('Kabul Edildi', res.error ?? 'Başka bir sürücü zaten kabul etti.');
        }
    }

    if (!newReq) return null;

    const fare     = Number(newReq.toplam_ucret).toFixed(2);
    const dist     = newReq.tahmini_mesafe ? `${Number(newReq.tahmini_mesafe).toFixed(1)} km` : null;
    const isUrgent = countdown <= 10;

    return (
        <Modal visible animationType="slide" transparent statusBarTranslucent>
            <View style={s.overlay}>
                <View style={s.sheet}>

                    <Animated.View
                        style={[
                            s.progressBar,
                            {
                                width: progressAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                }),
                                backgroundColor: isUrgent ? C.danger : C.primary,
                            },
                        ]}
                    />

                    <View style={s.header}>
                        <View style={[s.headerBadge, isUrgent && { backgroundColor: C.danger + '22' }]}>
                            <View style={[s.pulseDot, isUrgent && { backgroundColor: C.danger }]} />
                            <Text style={[s.headerTitle, isUrgent && { color: C.danger }]}>
                                YENİ TAKSİ TALEBİ
                            </Text>
                        </View>
                        <View style={[s.countdownBadge, isUrgent && { backgroundColor: C.danger }]}>
                            <Text style={s.countdownText}>{countdown}s</Text>
                        </View>
                        <TouchableOpacity onPress={dismiss} style={s.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close" size={20} color={C.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <View style={s.fareHero}>
                        <Text style={s.fareAmount}>₺{fare}</Text>
                        <View style={s.fareMeta}>
                            {dist && (
                                <View style={s.metaPill}>
                                    <Ionicons name="map-outline" size={11} color={C.textMuted} />
                                    <Text style={s.metaPillText}>{dist}</Text>
                                </View>
                            )}
                            <View style={s.metaPill}>
                                <Ionicons name={newReq.tip === 'anlik' ? 'flash-outline' : 'calendar-outline'} size={11} color={C.textMuted} />
                                <Text style={s.metaPillText}>{newReq.tip === 'anlik' ? 'Anlık' : 'Planlanmış'}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={s.routeCard}>
                        <View style={s.routeRow}>
                            <View style={s.routeIconCol}>
                                <View style={s.dotGreen} />
                                <View style={s.routeLine} />
                            </View>
                            <View style={s.routeInfo}>
                                <Text style={s.routeTag}>ALIŞ</Text>
                                <Text style={s.routeMain}>{newReq.baslangic_ilce}, {newReq.baslangic_sehir}</Text>
                                {newReq.baslangic_noktasi ? (
                                    <Text style={s.routeSub} numberOfLines={1}>{newReq.baslangic_noktasi}</Text>
                                ) : null}
                            </View>
                        </View>
                        <View style={s.routeRow}>
                            <View style={s.routeIconCol}>
                                <View style={s.dotAmber} />
                            </View>
                            <View style={s.routeInfo}>
                                <Text style={s.routeTag}>BIRAKIŞ</Text>
                                <Text style={s.routeMain}>{newReq.varis_ilce}, {newReq.varis_sehir}</Text>
                                {newReq.varis_noktasi ? (
                                    <Text style={s.routeSub} numberOfLines={1}>{newReq.varis_noktasi}</Text>
                                ) : null}
                            </View>
                        </View>
                    </View>

                    <View style={s.chipsRow}>
                        <Chip s={s} icon="paw-outline"    text={newReq.kopek_adi} />
                        <Chip s={s} icon="person-outline" text={newReq.sahip_adi} />
                    </View>

                    <View style={s.actions}>
                        <TouchableOpacity style={s.skipBtn} onPress={dismiss} activeOpacity={0.8}>
                            <Text style={s.skipText}>Geç</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[s.acceptBtn, accepting && { opacity: 0.65 }]}
                            onPress={handleAccept}
                            disabled={accepting}
                            activeOpacity={0.88}
                        >
                            {accepting
                                ? <ActivityIndicator color={C.darker} />
                                : (
                                    <>
                                        <Text style={s.acceptText}>Kabul Et</Text>
                                        <Ionicons name="arrow-forward" size={18} color={C.darker} />
                                    </>
                                )
                            }
                        </TouchableOpacity>
                    </View>

                </View>
            </View>
        </Modal>
    );
}

function Chip({ s, icon, text }) {
    return (
        <View style={s.chip}>
            <Ionicons name={icon} size={13} color={s._textMuted} />
            <Text style={s.chipText}>{text}</Text>
        </View>
    );
}

const makeStyles = (C) => ({
    ...StyleSheet.create({
        overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.8)' },
        sheet: {
            backgroundColor: C.card,
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            paddingTop: 0, paddingHorizontal: 20, paddingBottom: 36,
            gap: 16, overflow: 'hidden',
        },
        progressBar: { height: 4, borderRadius: 2, marginBottom: 4 },

        header:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
        headerBadge: {
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: C.primary + '18', borderRadius: 10,
            paddingHorizontal: 10, paddingVertical: 6,
        },
        pulseDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
        headerTitle: { color: C.primary, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
        countdownBadge: {
            backgroundColor: C.surface, borderRadius: 10,
            paddingHorizontal: 10, paddingVertical: 6, minWidth: 44, alignItems: 'center',
        },
        countdownText: { color: C.text, fontWeight: '800', fontSize: 14 },
        closeBtn: { padding: 4 },

        fareHero:    { alignItems: 'center', gap: 6 },
        fareAmount:  { color: C.primary, fontSize: 52, fontWeight: '900', letterSpacing: -1 },
        fareMeta:    { flexDirection: 'row', gap: 8 },
        metaPill:    {
            flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: C.surface, borderRadius: 8,
            paddingHorizontal: 8, paddingVertical: 4,
        },
        metaPillText: { color: C.textMuted, fontSize: 12 },

        routeCard: { backgroundColor: C.surface, borderRadius: 16, padding: 14, gap: 0 },
        routeRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
        routeIconCol: { width: 14, alignItems: 'center', paddingTop: 4, gap: 0 },
        dotGreen:  { width: 12, height: 12, borderRadius: 6, backgroundColor: C.success },
        dotAmber:  { width: 12, height: 12, borderRadius: 3, backgroundColor: C.primary },
        routeLine: { width: 2, flex: 1, backgroundColor: C.border, marginVertical: 3, minHeight: 16 },
        routeInfo: { flex: 1, gap: 2 },
        routeTag:  { color: C.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
        routeMain: { color: C.text, fontSize: 15, fontWeight: '700' },
        routeSub:  { color: C.textMuted, fontSize: 12 },

        chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        chip: {
            flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: C.surface, borderRadius: 10,
            paddingHorizontal: 10, paddingVertical: 6,
        },
        chipText: { color: C.textMuted, fontSize: 13, fontWeight: '600' },

        actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
        skipBtn: {
            flex: 1, paddingVertical: 16, alignItems: 'center', borderRadius: 14,
            borderWidth: 1.5, borderColor: C.border,
        },
        skipText: { color: C.textMuted, fontWeight: '700', fontSize: 15 },
        acceptBtn: {
            flex: 2.5, paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
            borderRadius: 14, backgroundColor: C.primary,
            flexDirection: 'row', gap: 8,
        },
        acceptText: { color: C.darker, fontWeight: '900', fontSize: 18 },
    }),
    _textMuted: C.textMuted,
});
