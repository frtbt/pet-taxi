import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import taxiApi from '../api/taxiClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    // Uygulama açıldığında token + kullanıcı cache'i oku
    useEffect(() => {
        (async () => {
            try {
                await taxiApi.init();
                const token = await taxiApi.getToken();
                if (token) {
                    // Önce cache'den göster, ardından sunucudan doğrula
                    const cached = await taxiApi.getCachedUser();
                    if (cached) setUser(cached);
                    try {
                        const res = await taxiApi.getMe();
                        if (res.success && res.user) {
                            setUser(res.user);
                            await taxiApi.setCachedUser(res.user);
                        } else {
                            // Token geçersiz — çıkış yap
                            await taxiApi.clearCache();
                            setUser(null);
                        }
                    } catch (_) {
                        // Ağ hatası — cache'deki kullanıcıyla devam et
                    }
                }
            } catch (_) {
                // Depolama hatası — giriş ekranına düş, sonsuz yüklemede kalma
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    async function register(data) {
        const res = await taxiApi.register(data);
        if (res.success) {
            await taxiApi.setToken(res.token);
            await taxiApi.setCachedUser(res.user);
            setUser(res.user);
        }
        return res;
    }

    async function login(email, sifre) {
        const res = await taxiApi.login(email, sifre);
        if (res.success) {
            await taxiApi.setToken(res.token);
            await taxiApi.setCachedUser(res.user);
            setUser(res.user);
        }
        return res;
    }

    async function logout() {
        try { await taxiApi.logout(); } catch (_) {}
        await taxiApi.clearCache();
        setUser(null);
    }

    function refreshUser(updatedUser) {
        setUser(updatedUser);
        taxiApi.setCachedUser(updatedUser);
    }

    // Sunucudan güncel kullanıcıyı çek (belge onayı vb. durum değişiklikleri için)
    const reloadUser = useCallback(async () => {
        try {
            const res = await taxiApi.getMe();
            if (res.success && res.user) {
                setUser(res.user);
                await taxiApi.setCachedUser(res.user);
            }
        } catch (_) {}
    }, []);

    // Uygulama öne gelince güncelle
    useEffect(() => {
        if (!user) return;
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') reloadUser();
        });
        return () => sub.remove();
    }, [!!user, reloadUser]);

    // Sürücü onayı beklenirken uygulama açıkken periyodik kontrol
    const awaitingApproval = user?.rol === 'surucu' && (
        user?.sertifika_durumu !== 'onaylandi' || user?.arac_belgeler_durum !== 'onaylandi'
    );
    useEffect(() => {
        if (!awaitingApproval) return;
        const id = setInterval(() => {
            if (AppState.currentState === 'active') reloadUser();
        }, 30000);
        return () => clearInterval(id);
    }, [awaitingApproval, reloadUser]);

    // Kullanıcı rolü kontrolü
    const isDriver = user?.rol === 'surucu';
    const isOwner  = user?.rol === 'sahip';
    const isAdmin  = user?.rol === 'admin';

    return (
        <AuthContext.Provider value={{ user, loading, register, login, logout, refreshUser, reloadUser, isDriver, isOwner, isAdmin }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
