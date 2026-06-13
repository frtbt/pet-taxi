import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { AuthProvider } from '../src/context/AuthContext';
import { NotificationProvider } from '../src/context/NotificationContext';

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

export default function RootLayout() {
    useEffect(() => {
        SplashScreen.hideAsync();
    }, []);

    return (
        <AuthProvider>
            <NotificationProvider>
                <StatusBar style="light" backgroundColor="#0f172a" />
                <Stack
                    screenOptions={{
                        headerStyle:      { backgroundColor: '#1e293b' },
                        headerTintColor:  '#f59e0b',
                        headerTitleStyle: { fontWeight: 'bold', color: '#f8fafc' },
                        contentStyle:     { backgroundColor: '#0f172a' },
                        animation:        'slide_from_right',
                    }}
                >
                    <Stack.Screen name="index"          options={{ headerShown: false }} />
                    <Stack.Screen name="auth/login"     options={{ headerShown: false }} />
                    <Stack.Screen name="auth/register"  options={{ headerShown: false }} />
                    <Stack.Screen name="(tabs)"          options={{ headerShown: false }} />
                    <Stack.Screen name="create-request"  options={{ title: 'Yolculuk Planla' }} />
                    <Stack.Screen name="request-detail"  options={{ title: 'Yolculuk Detayları' }} />
                    <Stack.Screen name="active-trip"     options={{ title: 'Aktif Yolculuk', headerShown: false }} />
                    <Stack.Screen name="reviews"         options={{ title: 'Yolculuğu Değerlendir' }} />
                    <Stack.Screen name="chat"            options={{ title: 'Mesajlar' }} />
                </Stack>
            </NotificationProvider>
        </AuthProvider>
    );
}
