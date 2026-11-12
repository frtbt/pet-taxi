import { Tabs, useRouter } from 'expo-router';
import { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import taxiApi from '../../src/api/taxiClient';
import JobAlertOverlay from '../../src/components/JobAlertOverlay';

function AracBelgeleriBanner({ user, C, onPress, topInset }) {
    const durum    = user?.arac_belgeler_durum ?? 'yok';
    const deadline = user?.arac_belgeler_deadline;

    let daysLeft = null;
    if (deadline) {
        const diff = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
        daysLeft = diff;
    }

    let bg, icon, msg;
    if (durum === 'reddedildi') {
        bg   = '#7f1d1d';
        icon = '✗';
        msg  = 'Araç belgeleriniz reddedildi. Tekrar yükleyin.';
    } else if (durum === 'yuklendi') {
        bg   = '#1e3a5f';
        icon = '⏳';
        msg  = 'Araç belgeleriniz inceleniyor.';
    } else {
        bg   = '#78350f';
        icon = '⚠️';
        msg  = daysLeft !== null && daysLeft >= 0
            ? `Araç belgesi ${daysLeft} gün içinde yükleyin.`
            : 'Araç muayene ve sigorta belgesini yükleyin.';
    }

    return (
        <TouchableOpacity
            activeOpacity={durum === 'yuklendi' ? 1 : 0.85}
            onPress={durum !== 'yuklendi' ? onPress : undefined}
            style={{ backgroundColor: bg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: topInset + 10, paddingBottom: 10, gap: 8 }}
        >
            <Text style={{ fontSize: 16 }}>{icon}</Text>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', flex: 1 }} numberOfLines={2}>{msg}</Text>
            {durum !== 'yuklendi' && (
                <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '700' }}>Yükle →</Text>
            )}
        </TouchableOpacity>
    );
}

const OWNER_TABS = [
    { name: 'index',   title: 'Ana Sayfa',    icon: 'home'          },
    { name: 'pool',    title: 'Talepler',     icon: 'car'           },
    { name: 'dogs',    title: 'Hayvanlarım',  icon: 'paw'           },
    { name: 'wallet',  title: 'Cüzdan',       icon: 'wallet'        },
    { name: 'profile', title: 'Profil',       icon: 'person-circle' },
];

const DRIVER_TABS = [
    { name: 'index',   title: 'Ana Sayfa',    icon: 'home'          },
    { name: 'pool',    title: 'İş Havuzu',    icon: 'search'        },
    { name: 'my-jobs', title: 'İşlerim',      icon: 'briefcase'     },
    { name: 'wallet',  title: 'Cüzdan',       icon: 'wallet'        },
    { name: 'profile', title: 'Profil',       icon: 'person-circle' },
];

const ALL_TAB_NAMES = ['index', 'pool', 'dogs', 'my-jobs', 'wallet', 'profile'];

export default function TabsLayout() {
    const { user, isDriver, logout } = useAuth();
    const { colors } = useTheme();
    const insets  = useSafeAreaInsets();
    const router  = useRouter();

    if (isDriver && (user?.sertifika_durumu !== 'onaylandi' || user?.durum === 'pasif')) {
        return <DriverGate user={user} logout={logout} />;
    }

    const activeTabs  = isDriver ? DRIVER_TABS : OWNER_TABS;
    const activeNames = activeTabs.map(t => t.name);

    const tabBarHeight    = 56 + insets.bottom;
    const tabBarPadBottom = insets.bottom + 6;

    const showBanner = isDriver
        && user?.sertifika_durumu === 'onaylandi'
        && user?.arac_belgeler_durum !== 'onaylandi';

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            {showBanner && (
                <AracBelgeleriBanner
                    user={user}
                    C={colors}
                    topInset={insets.top}
                    onPress={() => router.push('/arac-belgeleri')}
                />
            )}
            <SupportFab tabBarHeight={tabBarHeight} />
            <Tabs
                screenOptions={{
                    headerStyle:             { backgroundColor: colors.card },
                    headerTintColor:         colors.primary,
                    headerTitleStyle:        { fontWeight: 'bold', color: colors.text },
                    tabBarActiveTintColor:   colors.primary,
                    tabBarInactiveTintColor: colors.textMuted,
                    tabBarStyle: {
                        backgroundColor: colors.card,
                        borderTopColor:  colors.border,
                        borderTopWidth:  1,
                        height:          tabBarHeight,
                        paddingBottom:   tabBarPadBottom,
                        paddingTop:      8,
                        elevation:       16,
                        shadowColor:     '#000',
                        shadowOpacity:   0.2,
                        shadowRadius:    12,
                        shadowOffset:    { width: 0, height: -3 },
                    },
                    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
                }}
            >
                {ALL_TAB_NAMES.map(name => {
                    const tabCfg   = activeTabs.find(t => t.name === name);
                    const isActive = activeNames.includes(name);

                    return (
                        <Tabs.Screen
                            key={name}
                            name={name}
                            options={{
                                title:    tabCfg?.title ?? name,
                                href:     isActive ? undefined : null,
                                tabBarIcon: tabCfg
                                    ? ({ color, size, focused }) => (
                                        <Ionicons
                                            name={focused ? tabCfg.icon : `${tabCfg.icon}-outline`}
                                            size={size + 1}
                                            color={color}
                                        />
                                    )
                                    : undefined,
                            }}
                        />
                    );
                })}
            </Tabs>

            <JobAlertOverlay />
        </View>
    );
}

function SupportFab({ tabBarHeight }) {
    const router   = useRouter();
    const { colors } = useTheme();
    const [unread, setUnread] = useState(0);
    const pollRef  = useRef(null);

    const fabSt = useMemo(() => StyleSheet.create({
        btn: {
            position: 'absolute',
            right: 16,
            zIndex: 999,
            backgroundColor: colors.primary,
            width: 52,
            height: 52,
            borderRadius: 26,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 8,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
        },
        badge: {
            position: 'absolute',
            top: -4,
            right: -4,
            backgroundColor: colors.danger,
            borderRadius: 10,
            minWidth: 18,
            height: 18,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 3,
        },
        badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    }), [colors]);

    useEffect(() => {
        const check = async () => {
            const res = await taxiApi.getSupportUnreadCount().catch(() => null);
            if (res?.success) setUnread(res.count ?? 0);
        };
        check();
        pollRef.current = setInterval(check, 15000);
        return () => clearInterval(pollRef.current);
    }, []);

    return (
        <TouchableOpacity
            style={[fabSt.btn, { bottom: tabBarHeight + 12 }]}
            onPress={() => router.push('/support')}
            activeOpacity={0.85}
        >
            <Ionicons name="chatbubble-ellipses" size={22} color={colors.darker} />
            {unread > 0 && (
                <View style={fabSt.badge}>
                    <Text style={fabSt.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

function DriverGate({ user, logout }) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { refreshUser } = useAuth();
    const { colors: C } = useTheme();
    const [checking, setChecking] = useState(false);
    const sd = user?.sertifika_durumu;

    const gate = useMemo(() => makeGateStyles(C), [C]);

    async function handleRefresh() {
        setChecking(true);
        const res = await taxiApi.getMe();
        if (res.success && res.user) refreshUser(res.user);
        setChecking(false);
    }

    const isAracBelgeCase = sd === 'onaylandi' && user?.durum === 'pasif';
    const abDurum = user?.arac_belgeler_durum ?? 'yok';

    const statusInfo = {
        beklemede: {
            icon:    '⏳',
            title:   'Belgeler İnceleniyor',
            sub:     'Ekibimiz belgelerinizi inceliyor. Bu işlem genellikle 24 saat içinde tamamlanır.',
            color:   '#f59e0b',
            bg:      '#92400e22',
            showUpload: false,
            uploadRoute: '/driver-verification',
        },
        reddedildi: {
            icon:    '✗',
            title:   'Belgeler Reddedildi',
            sub:     user?.red_nedeni ?? 'Belgelerin yeniden yüklenmesi gerekiyor.',
            color:   '#fca5a5',
            bg:      '#7f1d1d22',
            showUpload: true,
            uploadRoute: '/driver-verification',
        },
    };

    const info = isAracBelgeCase ? {
        icon:    '📋',
        title:   'Araç Belgesi Gerekli',
        sub:     abDurum === 'reddedildi'
            ? `Araç belgeleriniz reddedildi${user?.arac_belge_red_nedeni ? ': ' + user.arac_belge_red_nedeni : ''}. Lütfen tekrar yükleyin.`
            : 'Hesabınız pasife alındı. Araç muayene ve trafik sigortası belgelerinizi yükleyerek hesabınızı yeniden aktifleştirebilirsiniz.',
        color:   '#fca5a5',
        bg:      '#7f1d1d22',
        showUpload: true,
        uploadRoute: '/arac-belgeleri',
        uploadBtnText: abDurum === 'reddedildi' ? '↩ Belgeleri Tekrar Yükle' : '📋 Araç Belgelerini Yükle',
    } : statusInfo[sd] ?? {
        icon:    '📋',
        title:   'Belge Doğrulama Gerekli',
        sub:     'Sürücü olarak çalışabilmek için ehliyet ve araç bilgilerinizi yüklemeniz gerekiyor.',
        color:   C.primary,
        bg:      C.primary + '18',
        showUpload: true,
        uploadRoute: '/driver-verification',
    };

    async function handleLogout() {
        await logout();
        router.replace('/auth/login');
    }

    return (
        <View style={[gate.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
            <ScrollView contentContainerStyle={gate.scroll} showsVerticalScrollIndicator={false}>
                <View style={[gate.iconWrap, { backgroundColor: info.bg }]}>
                    <Text style={gate.iconText}>{info.icon}</Text>
                </View>

                <Text style={gate.title}>{info.title}</Text>
                <Text style={gate.sub}>{info.sub}</Text>

                {sd === 'beklemede' && (
                    <View style={gate.stepCard}>
                        <Text style={gate.stepTitle}>Sıradaki Adımlar</Text>
                        <Text style={gate.stepItem}>1. Ekibimiz belgelerinizi inceler</Text>
                        <Text style={gate.stepItem}>2. Onay SMS/bildirim ile size iletilir</Text>
                        <Text style={gate.stepItem}>3. Onay sonrası uygulamayı kullanabilirsiniz</Text>
                    </View>
                )}

                {info.showUpload && (
                    <TouchableOpacity
                        style={gate.primaryBtn}
                        onPress={() => router.push(info.uploadRoute ?? '/driver-verification')}
                        activeOpacity={0.85}
                    >
                        <Text style={gate.primaryBtnText}>
                            {info.uploadBtnText ?? (sd === 'reddedildi' ? '↩ Belgeleri Tekrar Yükle' : '📋 Belgeleri Yükle')}
                        </Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={gate.profileBtn}
                    onPress={() => router.push(info.uploadRoute ?? '/driver-verification')}
                    activeOpacity={0.8}
                >
                    <Ionicons name="document-text-outline" size={18} color={C.primary} />
                    <Text style={gate.profileBtnText}>Belgelerimi Görüntüle</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={gate.refreshBtn}
                    onPress={handleRefresh}
                    disabled={checking}
                    activeOpacity={0.8}
                >
                    {checking
                        ? <ActivityIndicator size="small" color={C.textMuted} />
                        : <Text style={gate.refreshText}>↻ Durumu Yenile</Text>
                    }
                </TouchableOpacity>

                <TouchableOpacity style={gate.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                    <Text style={gate.logoutText}>Çıkış Yap</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const makeGateStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    scroll: { padding: 24, alignItems: 'center', gap: 16 },

    iconWrap: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    iconText: { fontSize: 44 },

    title: { color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
    sub:   { color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 300 },

    stepCard: {
        backgroundColor: C.card, borderRadius: 16, padding: 20,
        alignSelf: 'stretch', gap: 10,
    },
    stepTitle: { color: C.text, fontWeight: '700', fontSize: 14, marginBottom: 4 },
    stepItem:  { color: C.textMuted, fontSize: 13, lineHeight: 20 },

    primaryBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, alignItems: 'center', alignSelf: 'stretch' },
    primaryBtnText: { color: C.darker, fontWeight: '800', fontSize: 16 },

    profileBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    profileBtnText: { color: C.primary, fontWeight: '600', fontSize: 14 },

    refreshBtn:  { paddingVertical: 10, paddingHorizontal: 20, minHeight: 40, justifyContent: 'center' },
    refreshText: { color: C.textMuted, fontWeight: '600', fontSize: 13 },

    logoutBtn:  { paddingVertical: 12, paddingHorizontal: 32 },
    logoutText: { color: C.danger, fontWeight: '600', fontSize: 14 },
});
