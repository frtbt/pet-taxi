import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useAuth } from './AuthContext';
import taxiApi from '../api/taxiClient';

const isExpoGo = Constants.appOwnership === 'expo';

const NotificationContext = createContext({
    unreadNotifications: 0,
    refreshNotifications: () => {},
    markRead: () => {},
    setActiveTripPolling: () => {},
});

// Register for FCM push notifications (skipped in Expo Go)
async function registerForPushNotifications() {
    if (isExpoGo) return null;
    try {
        const Notifications = require('expo-notifications');
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') return null;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('notifications', {
                name: 'Bildirimler',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#f59e0b',
                sound: 'default',
            });
            await Notifications.setNotificationChannelAsync('messages', {
                name: 'Mesajlar',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#f59e0b',
                sound: 'default',
            });
        }

        // NOT: unregisterForNotificationsAsync() ÇAĞIRMA — token'ı geçersiz kılar
        const tokenResult = await Notifications.getDevicePushTokenAsync();
        return tokenResult?.data ?? null;
    } catch (err) {
        return null;
    }
}

async function showLocalNotification(title, body) {
    if (isExpoGo) return;
    try {
        const Notifications = require('expo-notifications');
        await Notifications.scheduleNotificationAsync({
            content: { title, body, sound: 'default', data: { type: 'sistem' } },
            trigger: null,
        });
    } catch {}
}

export function NotificationProvider({ children }) {
    const { user, reloadUser } = useAuth();
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const intervalRef    = useRef(null);
    const pollIntervalMs = useRef(30000); // 30s idle, 5s active trip
    const prevCountRef   = useRef(0);
    const prevSupportRef = useRef(0);
    const initializedRef = useRef(false);

    const refreshNotifications = useCallback(async () => {
        if (!user) return;
        try {
            const res = await taxiApi.getUnreadCounts();
            if (res.success) {
                const newCount = res.unread_notifications || 0;
                const newSupport = res.unread_support || 0;
                setUnreadNotifications(newCount);

                if (initializedRef.current) {
                    // Yeni genel bildirim
                    if (newCount > prevCountRef.current) {
                        // Bildirim bir durum değişikliği olabilir (ör. belge onayı)
                        reloadUser();
                        try {
                            const nRes = await taxiApi.getNotifications();
                            if (nRes.success && nRes.notifications?.length > 0) {
                                const latest = nRes.notifications[0];
                                showLocalNotification(latest.baslik, latest.icerik);
                            }
                        } catch {}
                    }
                    // Adminten yeni destek mesajı
                    if (newSupport > prevSupportRef.current) {
                        showLocalNotification('💬 Destek Yanıtı', 'Yönetimden yeni bir mesaj aldınız.');
                    }
                }

                prevCountRef.current = newCount;
                prevSupportRef.current = newSupport;
                initializedRef.current = true;
            }
        } catch {}
    }, [user, reloadUser]);

    const markRead = useCallback(async () => {
        try {
            await taxiApi.markNotificationsRead();
            setUnreadNotifications(0);
            prevCountRef.current = 0;
        } catch {}
    }, []);

    // Called by active-trip screen to switch between fast (5s) and idle (30s) polling
    const setActiveTripPolling = useCallback((active) => {
        const ms = active ? 5000 : 30000;
        pollIntervalMs.current = ms;
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = setInterval(refreshNotifications, ms);
        }
    }, [refreshNotifications]);

    useEffect(() => {
        if (!user) {
            setUnreadNotifications(0);
            prevCountRef.current = 0;
            prevSupportRef.current = 0;
            initializedRef.current = false;
            return;
        }

        refreshNotifications();
        intervalRef.current = setInterval(refreshNotifications, pollIntervalMs.current);

        // FCM token al ve kaydet — başarısız olursa 5s sonra tekrar dene
        const saveToken = async (retryCount = 0) => {
            const token = await registerForPushNotifications();
            if (!token) {
                if (retryCount < 3) setTimeout(() => saveToken(retryCount + 1), 5000);
                return;
            }
            try {
                await taxiApi.registerPushToken(token);
            } catch (_) {
                if (retryCount < 3) setTimeout(() => saveToken(retryCount + 1), 8000);
            }
        };
        saveToken();

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [user, refreshNotifications]);

    // Refresh when app comes back to foreground
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') refreshNotifications();
        });
        return () => sub.remove();
    }, [refreshNotifications]);

    return (
        <NotificationContext.Provider value={{ unreadNotifications, refreshNotifications, markRead, setActiveTripPolling }}>
            {children}
        </NotificationContext.Provider>
    );
}

export const useNotifications = () => useContext(NotificationContext);
