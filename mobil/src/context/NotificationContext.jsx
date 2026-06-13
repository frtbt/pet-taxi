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
});

// Register for FCM push notifications (skipped in Expo Go)
async function registerForPushNotifications() {
    if (isExpoGo) { console.log('[Push] Expo Go - skipped'); return null; }
    try {
        const Notifications = require('expo-notifications');
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            console.warn('[Push] Permission denied:', finalStatus);
            return null;
        }

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('notifications', {
                name: 'Notifications',
                importance: Notifications.AndroidImportance.HIGH,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#f59e0b',
            });
            await Notifications.setNotificationChannelAsync('messages', {
                name: 'Messages',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#f59e0b',
            });
        }

        try { await Notifications.unregisterForNotificationsAsync(); } catch (_) {}
        const tokenResult = await Notifications.getDevicePushTokenAsync();
        const fcmToken = tokenResult?.data;
        console.log('[Push] FCM token:', fcmToken ? fcmToken.substring(0, 20) + '...' : 'NULL');
        return fcmToken ?? null;
    } catch (err) {
        console.error('[Push] Token error:', err?.message ?? err);
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
    const { user } = useAuth();
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const intervalRef = useRef(null);
    const prevCountRef = useRef(0);
    const initializedRef = useRef(false);

    const refreshNotifications = useCallback(async () => {
        if (!user) return;
        try {
            const res = await taxiApi.getUnreadCounts();
            if (res.success) {
                const newCount = res.unread_notifications || 0;
                setUnreadNotifications(newCount);

                // Show local notification if count increased after first load
                if (initializedRef.current && newCount > prevCountRef.current) {
                    try {
                        const nRes = await taxiApi.getNotifications();
                        if (nRes.success && nRes.notifications?.length > 0) {
                            const latest = nRes.notifications[0];
                            showLocalNotification(latest.baslik, latest.icerik);
                        }
                    } catch {}
                }

                prevCountRef.current = newCount;
                initializedRef.current = true;
            }
        } catch {}
    }, [user]);

    const markRead = useCallback(async () => {
        try {
            await taxiApi.markNotificationsRead();
            setUnreadNotifications(0);
            prevCountRef.current = 0;
        } catch {}
    }, []);

    useEffect(() => {
        if (!user) {
            setUnreadNotifications(0);
            prevCountRef.current = 0;
            initializedRef.current = false;
            return;
        }

        refreshNotifications();
        intervalRef.current = setInterval(refreshNotifications, 5000);

        // Register FCM token
        registerForPushNotifications().then(async (token) => {
            if (token) {
                try {
                    const res = await taxiApi.registerPushToken(token);
                    console.log('[Push] Token registered:', JSON.stringify(res));
                } catch (e) {
                    console.error('[Push] Token registration error:', e?.message);
                }
            }
        });

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
        <NotificationContext.Provider value={{ unreadNotifications, refreshNotifications, markRead }}>
            {children}
        </NotificationContext.Provider>
    );
}

export const useNotifications = () => useContext(NotificationContext);
