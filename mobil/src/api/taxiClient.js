import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://patimera.com/pet_taxi/api/taxi.php';

class TaxiApiClient {
    constructor() {
        this.token = null;
        this.baseUrl = BASE_URL;
    }

    async init() {
        try {
            const timeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
            this.token = await Promise.race([SecureStore.getItemAsync('taxi_auth_token'), timeout]);
        } catch {
            this.token = null;
        }
    }

    async setToken(token) {
        this.token = token;
        if (token) {
            await SecureStore.setItemAsync('taxi_auth_token', token);
        } else {
            await SecureStore.deleteItemAsync('taxi_auth_token');
        }
    }

    async getToken() {
        if (!this.token) {
            this.token = await SecureStore.getItemAsync('taxi_auth_token');
        }
        return this.token;
    }

    async setCachedUser(user) {
        try { await SecureStore.setItemAsync('taxi_cached_user', JSON.stringify(user)); } catch (_) {}
    }

    async getCachedUser() {
        try {
            const raw = await SecureStore.getItemAsync('taxi_cached_user');
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    async clearCache() {
        await SecureStore.deleteItemAsync('taxi_auth_token');
        await SecureStore.deleteItemAsync('taxi_cached_user');
        this.token = null;
    }

    getActionUrl(action, params = {}) {
        let url = `${this.baseUrl}?action=${action}`;
        Object.entries(params).forEach(([k, v]) => {
            if (v !== null && v !== undefined) url += `&${k}=${encodeURIComponent(v)}`;
        });
        return url;
    }

    async request(action, options = {}) {
        const { method = 'GET', body = null, params = {} } = options;
        const url = this.getActionUrl(action, params);
        const headers = { 'Content-Type': 'application/json' };

        const token = await this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const config = { method, headers };
        if (body && method !== 'GET') config.body = JSON.stringify(body);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(url, { ...config, signal: controller.signal });
            clearTimeout(timeout);
            const raw = await res.text();
            const cleaned = (raw || '').replace(/^\uFEFF/, '').trim();
            try {
                return JSON.parse(cleaned);
            } catch (_) {
                const firstBrace = cleaned.indexOf('{');
                if (firstBrace >= 0) {
                    try { return JSON.parse(cleaned.slice(firstBrace)); } catch (_) {}
                }
                return { success: false, error: `Sunucu geçersiz yanıt döndürdü (${res.status})` };
            }
        } catch (err) {
            if (err.name === 'AbortError') return { success: false, error: 'İstek zaman aşımına uğradı' };
            return { success: false, error: 'Bağlantı hatası: ' + err.message };
        }
    }

    // ── AUTH ──────────────────────────────────────────────────
    register(data) {
        return this.request('register', { method: 'POST', body: data });
    }
    login(email, sifre) {
        return this.request('login', { method: 'POST', body: { email, sifre } });
    }
    logout() {
        return this.request('logout', { method: 'POST' });
    }
    deleteAccount(sifre) {
        return this.request('delete_account', { method: 'POST', body: { sifre } });
    }
    getMe() {
        return this.request('me');
    }

    // ── KÖPEKLER ──────────────────────────────────────────────
    getMyDogs() {
        return this.request('my_dogs');
    }
    addDog(data) {
        return this.request('add_dog', { method: 'POST', body: data });
    }

    // ── TAKSİ TALEPLERİ (SAHİP) ──────────────────────────────
    /**
     * Yeni ulaşım talebi oluştur.
     * data: { kopek_id, kalkis_zamani, baslangic_noktasi, baslangic_sehir,
     *         baslangic_ilce, baslangic_lat?, baslangic_lon?,
     *         varis_noktasi, varis_sehir, varis_ilce, varis_lat?, varis_lon?,
     *         tahmini_mesafe?, toplam_ucret?, tip?, ozel_talepler? }
     */
    createRequest(data) {
        return this.request('create_request', { method: 'POST', body: data });
    }
    getMyRequests() {
        return this.request('my_requests');
    }
    getRequestDetail(id) {
        return this.request('request_detail', { params: { id } });
    }
    cancelRequest(talep_id, iptal_nedeni = '') {
        return this.request('cancel_request', { method: 'POST', body: { talep_id, iptal_nedeni } });
    }

    // ── HAVUZ & EŞLEŞME (SÜRÜCÜ) ─────────────────────────────
    getPool(sehir = null, ilce = null) {
        return this.request('pool', { params: { sehir, ilce } });
    }
    acceptRequest(talep_id) {
        return this.request('accept_request', { method: 'POST', body: { talep_id } });
    }
    startTrip(match_id) {
        return this.request('start_trip', { method: 'POST', body: { match_id } });
    }
    finishTrip(match_id, gercek_mesafe = null) {
        return this.request('finish_trip', { method: 'POST', body: { match_id, gercek_mesafe } });
    }
    getMyJobs() {
        return this.request('my_jobs');
    }

    // ── CANLI KONUM ───────────────────────────────────────────
    updateLocation(match_id, lat, lon, hiz = null) {
        return this.request('update_location', { method: 'POST', body: { match_id, lat, lon, hiz } });
    }
    getLiveLocation(match_id) {
        return this.request('live_location', { params: { match_id } });
    }

    // ── DEĞERLENDİRMELER ─────────────────────────────────────
    addReview(talep_id, degerlendirilen_id, puan, yorum = '') {
        return this.request('add_review', { method: 'POST', body: { talep_id, degerlendirilen_id, puan, yorum } });
    }
    getDriverReviews(surucu_id) {
        return this.request('driver_reviews', { params: { surucu_id } });
    }

    // ── MESAJLAR ─────────────────────────────────────────────
    getMessages(talep_id) {
        return this.request('messages', { params: { talep_id } });
    }
    sendMessage(alici_id, mesaj, talep_id = null) {
        return this.request('send_message', { method: 'POST', body: { alici_id, mesaj, talep_id } });
    }

    // ── CÜZDAN ───────────────────────────────────────────────
    getWallet() {
        return this.request('wallet');
    }

    // ── BİLDİRİMLER ──────────────────────────────────────────
    registerPushToken(token) {
        return this.request('register_push_token', { method: 'POST', body: { fcm_token: token } });
    }
    getNotifications() {
        return this.request('get_notifications');
    }
    getUnreadCounts() {
        return this.request('get_unread_counts');
    }
    markNotificationsRead() {
        return this.request('mark_notifications_read', { method: 'POST' });
    }

    // ── AYARLAR ──────────────────────────────────────────────
    getSettings() {
        return this.request('settings');
    }
    getFareEstimate(km, slat = null, slon = null, dlat = null, dlon = null) {
        const params = { km };
        if (slat !== null) { params.slat = slat; params.slon = slon; params.dlat = dlat; params.dlon = dlon; }
        return this.request('fare_estimate', { params });
    }
}

const taxiApi = new TaxiApiClient();
export default taxiApi;
