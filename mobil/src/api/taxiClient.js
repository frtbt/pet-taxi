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
    updateDog(data) {
        return this.request('update_dog', { method: 'POST', body: data });
    }
    deleteDog(id) {
        return this.request('delete_dog', { method: 'POST', body: { id } });
    }
    getDogProfile(dog_id) {
        return this.request('dog_profile', { params: { dog_id } });
    }
    // Genel POST yardımcısı (özelleştirilmemiş action'lar için)
    post(action, body = {}) {
        return this.request(action, { method: 'POST', body });
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
    getMyRequests(page = 1) {
        return this.request('my_requests', { params: { page } });
    }
    getRequestDetail(id) {
        return this.request('request_detail', { params: { id } });
    }
    uploadCheckinPhoto(match_id, foto_base64) {
        return this.request('upload_checkin_photo', { method: 'POST', body: { match_id, foto_base64 } });
    }
    driverArrived(match_id) {
        return this.request('driver_arrived', { method: 'POST', body: { match_id } });
    }
    driverCancelNoshow(match_id) {
        return this.request('driver_cancel_noshow', { method: 'POST', body: { match_id } });
    }
    getCancelFee(talep_id) {
        return this.request('get_cancel_fee', { params: { talep_id } });
    }
    createIncidentReport(talep_id, tur, aciklama, fotograflar) {
        return this.request('create_incident_report', { method: 'POST', body: { talep_id, tur, aciklama, fotograflar } });
    }
    getIncidentReports(talep_id) {
        return this.request('get_incident_reports', { params: { talep_id } });
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
    finishTrip(match_id, gercek_mesafe = null, teslim_pin = null) {
        return this.request('finish_trip', { method: 'POST', body: { match_id, gercek_mesafe, teslim_pin } });
    }
    getMyJobs(page = 1) {
        return this.request('my_jobs', { params: { page } });
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
    getMyReviews() {
        return this.request('my_reviews');
    }

    // ── FAVORİLER ────────────────────────────────────────────
    toggleFavorite(surucu_id) {
        return this.request('toggle_favorite', { method: 'POST', body: { surucu_id } });
    }
    getFavorites() {
        return this.request('get_favorites');
    }
    isFavorite(surucu_id) {
        return this.request('is_favorite', { params: { surucu_id } });
    }

    // ── MESAJLAR ─────────────────────────────────────────────
    getMessages(talep_id) {
        return this.request('messages', { params: { talep_id } });
    }
    sendMessage(alici_id, mesaj, talep_id = null) {
        return this.request('send_message', { method: 'POST', body: { alici_id, mesaj, talep_id } });
    }

    // ── FOTOĞRAF İSTEĞİ ──────────────────────────────────────
    requestPhoto(match_id) {
        return this.request('request_photo', { method: 'POST', body: { match_id } });
    }
    sendPhoto(match_id, foto_base64) {
        return this.request('send_photo', { method: 'POST', body: { match_id, foto_base64 } });
    }
    checkPhotoRequest(match_id) {
        return this.request('check_photo_request', { params: { match_id } });
    }
    getPhoto(match_id) {
        return this.request('get_photo', { params: { match_id } });
    }

    // ── CÜZDAN ───────────────────────────────────────────────
    getWallet() {
        return this.request('wallet');
    }
    walletTopupInit(tutar) {
        return this.request('wallet_topup_init', { method: 'POST', body: { tutar } });
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

    // ── PROFİL & SÜRÜCÜ DOĞRULAMA ────────────────────────────
    updateProfile(data) {
        return this.request('update_profile', { method: 'POST', body: data });
    }
    getDriverStatus() {
        return this.request('driver_status');
    }
    updateDriverInfo(data) {
        return this.request('update_driver_info', { method: 'POST', body: data });
    }

    // ── SÜRÜCÜ ONBOARDING v2 ─────────────────────────────────
    getDriverOnboardingConfig() {
        return this.request('get_driver_onboarding_config');
    }
    saveDriverStep(step, data) {
        return this.request('save_driver_step', { method: 'POST', body: { step, ...data } });
    }
    async uploadDriverPhoto(base64, field) {
        const url = this.getActionUrl('upload_driver_photo');
        const headers = { 'Content-Type': 'application/json' };
        const token = await this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000); // 30s — binary upload
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ photo_base64: base64, field }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const raw = await res.text();
            const cleaned = (raw || '').replace(/^﻿/, '').trim();
            try { return JSON.parse(cleaned); } catch (_) {
                const fb = cleaned.indexOf('{');
                if (fb >= 0) { try { return JSON.parse(cleaned.slice(fb)); } catch (_) {} }
                return { success: false, error: `Fotoğraf yükleme hatası (${res.status})` };
            }
        } catch (err) {
            if (err.name === 'AbortError') return { success: false, error: 'Fotoğraf yükleme zaman aşımına uğradı' };
            return { success: false, error: 'Bağlantı hatası: ' + err.message };
        }
    }

    // ── KAYITLI ADRESLER ─────────────────────────────────────
    getMyAddresses() {
        return this.request('my_addresses');
    }
    addAddress(data) {
        return this.request('add_address', { method: 'POST', body: data });
    }
    deleteAddress(id) {
        return this.request('delete_address', { method: 'POST', body: { id } });
    }

    // ── İL / İLÇE ────────────────────────────────────────────
    getIller() {
        return this.request('iller');
    }
    getIlceler(sehirId) {
        return this.request('ilceler', { params: { sehir_id: sehirId } });
    }

    // ── HAYVAN TÜRLERİ & CİNSLERİ ───────────────────────────
    getPetTurleri() {
        return this.request('pet_turleri');
    }
    getPetCinsleri(turId) {
        return this.request('pet_cinsleri', { params: { tur_id: turId } });
    }

    // ── ADRES GÜNCELLEME ─────────────────────────────────────
    updateAddress(data) {
        return this.request('update_address', { method: 'POST', body: data });
    }

    // ── BANKA BİLGİLERİ (SÜRÜCÜ) ─────────────────────────────
    updateBankInfo(data) {
        return this.request('update_bank_info', { method: 'POST', body: data });
    }

    // ── TESLİM ONAY ───────────────────────────────────────────
    confirmDelivery(matchId) {
        return this.request('confirm_delivery', { method: 'POST', body: { match_id: matchId } });
    }

    // ── DESTEK SOHBET ─────────────────────────────────────────────
    getSupportMessages() {
        return this.request('get_support_messages');
    }
    sendSupportMessage(mesaj) {
        return this.request('send_support_message', { method: 'POST', body: { mesaj } });
    }
    getSupportUnreadCount() {
        return this.request('support_unread_count');
    }

    // ── SÖZLEŞME ─────────────────────────────────────────────
    getContract() {
        return this.request('get_contract');
    }
    acceptContract(surum) {
        return this.request('accept_contract', { method: 'POST', body: { surum } });
    }
    acceptDriverTerms(surum) {
        return this.request('accept_driver_terms', { method: 'POST', body: { surum } });
    }

    // ── ARAÇ BELGELERİ ───────────────────────────────────────
    async uploadAracBelgeleri(muayene_base64, sigorta_base64) {
        const url     = this.getActionUrl('upload_arac_belgeleri');
        const headers = { 'Content-Type': 'application/json' };
        const token   = await this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000); // 60s — two images
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ muayene_base64, sigorta_base64 }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            const raw     = await res.text();
            const cleaned = (raw || '').replace(/^﻿/, '').trim();
            try { return JSON.parse(cleaned); } catch (_) {
                const fb = cleaned.indexOf('{');
                if (fb >= 0) { try { return JSON.parse(cleaned.slice(fb)); } catch (_) {} }
                return { success: false, error: `Belge yükleme hatası (${res.status})` };
            }
        } catch (err) {
            if (err.name === 'AbortError') return { success: false, error: 'Belge yükleme zaman aşımına uğradı' };
            return { success: false, error: 'Bağlantı hatası: ' + err.message };
        }
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
