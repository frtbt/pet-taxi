import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { NotificationProvider } from '../src/context/NotificationContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';

const isExpoGo = Constants.appOwnership === 'expo';

// Must be set at module level — before any component renders
if (!isExpoGo) {
    try {
        const Notifications = require('expo-notifications');
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                priority: Notifications.AndroidNotificationPriority?.MAX ?? 'max',
            }),
        });
    } catch {}
}

SplashScreen.preventAutoHideAsync();

function NotificationTapHandler() {
    const router = useRouter();
    const { isDriver, isOwner } = useAuth();
    const sub = useRef(null);
    const handled = useRef(false);

    function navigate(dest) {
        setTimeout(() => { try { router.replace(dest); } catch {} }, 350);
    }

    function handleResponse(response) {
        if (!response) return;
        const data = response.notification.request.content.data ?? {};
        const type = data.type ?? '';
        const matchId  = data.match_id  ? String(data.match_id)  : null;
        const talepId  = data.talep_id  ? String(data.talep_id)  : null;
        const suruciId = data.surucu_id ? String(data.surucu_id) : null;

        if (type === 'yeni_talep') {
            navigate('/(tabs)/pool');
            return;
        }
        if (type === 'destek_yaniti') {
            navigate('/support');
            return;
        }

        // Yolculuk tamamlandı — sahip değerlendirme ekranına, sürücü ana sayfaya
        if (type === 'yolculuk_tamamlandi') {
            if (isOwner && talepId && suruciId) {
                navigate({ pathname: '/reviews', params: { talep_id: talepId, degerlendirilen_id: suruciId } });
            } else {
                navigate('/(tabs)');
            }
            return;
        }

        // Sahibe gelen yolculuk bildirimleri → aktif yolculuk ekranı
        if (['talep_kabul', 'yolculuk_basladi', 'teslim_bekleniyor', 'foto_geldi'].includes(type)) {
            if (isOwner && matchId && talepId) {
                navigate({ pathname: '/active-trip', params: { match_id: matchId, talep_id: talepId } });
            } else {
                navigate('/(tabs)');
            }
            return;
        }

        // Sürücüye gelen fotoğraf isteği → aktif yolculuk ekranı
        if (type === 'foto_istegi') {
            if (isDriver && matchId) {
                navigate({ pathname: '/active-trip', params: { match_id: matchId } });
            } else {
                navigate('/(tabs)');
            }
            return;
        }

        // Diğer bildirimler → ana sayfa
        navigate('/(tabs)');
    }

    useEffect(() => {
        if (isExpoGo) return;
        try {
            const Notifications = require('expo-notifications');

            // Cold start: uygulama bildirime tıklanarak açıldıysa
            if (!handled.current) {
                handled.current = true;
                Notifications.getLastNotificationResponseAsync().then(response => {
                    handleResponse(response);
                }).catch(() => {});
            }

            // Uygulama açıkken / arka planda gelen bildirime tıklama
            sub.current = Notifications.addNotificationResponseReceivedListener(handleResponse);
        } catch {}

        return () => { try { sub.current?.remove(); } catch {} };
    }, [router, isDriver, isOwner]);

    return null;
}

function ThemedStack() {
    const { colors, isDark } = useTheme();
    return (
        <>
            <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.card} />
            <Stack
                screenOptions={{
                    headerStyle:      { backgroundColor: colors.card },
                    headerTintColor:  colors.primary,
                    headerTitleStyle: { fontWeight: 'bold', color: colors.text },
                    contentStyle:     { backgroundColor: colors.background },
                    animation:        'slide_from_right',
                    headerBackTitle:  'Geri',
                }}
            >
                <Stack.Screen name="index"               options={{ headerShown: false }} />
                <Stack.Screen name="auth/login"          options={{ headerShown: false }} />
                <Stack.Screen name="auth/register"       options={{ headerShown: false }} />
                <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)"              options={{ headerShown: false }} />
                <Stack.Screen name="create-request"      options={{ title: 'Yolculuk Planla' }} />
                <Stack.Screen name="request-detail"      options={{ title: 'Yolculuk Detayları' }} />
                <Stack.Screen name="active-trip"         options={{ title: 'Aktif Yolculuk', headerShown: false }} />
                <Stack.Screen name="reviews"             options={{ title: 'Yolculuğu Değerlendir' }} />
                <Stack.Screen name="support"             options={{ headerShown: false }} />
                <Stack.Screen name="my-addresses"        options={{ title: 'Adreslerim' }} />
                <Stack.Screen name="driver-verification" options={{ title: 'Sürücü Doğrulama' }} />
                <Stack.Screen name="arac-belgeleri"       options={{ title: 'Araç Belgeleri' }} />
                <Stack.Screen name="payment-result"      options={{ headerShown: false }} />
                <Stack.Screen name="favorites"           options={{ title: 'Favori Sürücüler' }} />
                <Stack.Screen name="incident-report"     options={{ title: 'Hasar/Olay Bildir' }} />
            </Stack>
        </>
    );
}

export default function RootLayout() {
    useEffect(() => {
        SplashScreen.hideAsync();
    }, []);

    return (
        <SafeAreaProvider>
        <ThemeProvider>
        <AuthProvider>
            <NotificationProvider>
                <NotificationTapHandler />
                <ThemedStack />
            </NotificationProvider>
        </AuthProvider>
        </ThemeProvider>
        </SafeAreaProvider>
    );
}
