import { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    Alert, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import taxiApi from '../src/api/taxiClient';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

// ── Sürücü: Aldığı değerlendirmeler ─────────────────────────────
function DriverReviewsScreen({ C, styles }) {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        taxiApi.getMyReviews().then(res => {
            if (res.success) setData(res);
            setLoading(false);
        });
    }, []);

    if (loading) return <View style={styles.center}><ActivityIndicator color={C.primary} size="large" /></View>;

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            <View style={styles.driverHeader}>
                <View style={styles.driverAvatar}>
                    {user?.profil_foto
                        ? <Image source={{ uri: user.profil_foto }} style={styles.driverAvatarImg} />
                        : <Text style={styles.driverAvatarInitial}>{user?.ad_soyad?.charAt(0) ?? '?'}</Text>
                    }
                </View>
                <Text style={styles.driverName}>{user?.ad_soyad}</Text>
                <View style={styles.ratingBadge}>
                    <Text style={styles.ratingBadgeStar}>★</Text>
                    <Text style={styles.ratingBadgeVal}>{data?.ortalama_puan ?? '–'}</Text>
                    <Text style={styles.ratingBadgeCount}>({data?.toplam ?? 0} değerlendirme)</Text>
                </View>
            </View>

            {(!data?.reviews || data.reviews.length === 0) ? (
                <View style={styles.empty}>
                    <Ionicons name="star-outline" size={48} color={C.border} />
                    <Text style={styles.emptyTitle}>Henüz değerlendirme yok</Text>
                    <Text style={styles.emptySub}>Yolculukları tamamladıkça burada görünecek</Text>
                </View>
            ) : (
                data.reviews.map(r => (
                    <View key={r.id} style={styles.reviewCard}>
                        <View style={styles.reviewCardTop}>
                            <View style={styles.reviewStars}>
                                {[1,2,3,4,5].map(s => (
                                    <Text key={s} style={[styles.reviewStar, { color: s <= r.puan ? C.primary : C.border }]}>★</Text>
                                ))}
                            </View>
                            <Text style={styles.reviewDate}>
                                {new Date(r.tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </Text>
                        </View>
                        {r.yorum ? <Text style={styles.reviewComment}>{r.yorum}</Text> : null}
                        <Text style={styles.reviewBy}>{r.degerlendiren_adi}</Text>
                    </View>
                ))
            )}
        </ScrollView>
    );
}

// ── Köpek sahibi: Sürücüyü değerlendir + favoriye ekle ──────────
function OwnerReviewScreen({ C, styles }) {
    const { talep_id, degerlendirilen_id } = useLocalSearchParams();
    const router = useRouter();
    const [rating, setRating]     = useState(0);
    const [comment, setComment]   = useState('');
    const [loading, setLoading]   = useState(false);
    const [isFav, setIsFav]       = useState(false);
    const [favLoading, setFavLoading] = useState(false);
    const [submitted, setSubmitted]   = useState(false);

    useEffect(() => {
        if (degerlendirilen_id) {
            taxiApi.isFavorite(Number(degerlendirilen_id)).then(res => {
                if (res.success) setIsFav(res.favori);
            });
        }
    }, [degerlendirilen_id]);

    async function handleSubmit() {
        if (rating === 0) { Alert.alert('Hata', 'Lütfen bir puan seçin.'); return; }
        setLoading(true);
        const res = await taxiApi.addReview(Number(talep_id), Number(degerlendirilen_id), rating, comment);
        setLoading(false);
        if (res.success) {
            setSubmitted(true);
        } else {
            Alert.alert('Hata', res.error ?? 'Gönderilemedi.');
        }
    }

    async function handleFavorite() {
        setFavLoading(true);
        const res = await taxiApi.toggleFavorite(Number(degerlendirilen_id));
        setFavLoading(false);
        if (res.success) setIsFav(res.favori);
    }

    if (submitted) {
        return (
            <View style={styles.successRoot}>
                <Text style={styles.successIcon}>🐾</Text>
                <Text style={styles.successTitle}>Teşekkürler!</Text>
                <Text style={styles.successSub}>Değerlendirmeniz kaydedildi.</Text>
                <TouchableOpacity
                    style={[styles.favBtn, isFav && styles.favBtnActive]}
                    onPress={handleFavorite}
                    disabled={favLoading}
                    activeOpacity={0.8}
                >
                    {favLoading
                        ? <ActivityIndicator color={isFav ? C.darker : C.primary} size="small" />
                        : <>
                            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? C.darker : C.primary} />
                            <Text style={[styles.favBtnText, isFav && { color: C.darker }]}>
                                {isFav ? 'Favorilere Eklendi' : 'Favoriye Ekle'}
                            </Text>
                        </>
                    }
                </TouchableOpacity>
                <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.85}>
                    <Text style={styles.doneBtnText}>Ana Sayfaya Dön</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <Text style={styles.formTitle}>Yolculuğu Değerlendir</Text>
            <Text style={styles.formSub}>Sürücünüz nasıldı?</Text>

            <View style={styles.stars}>
                {[1,2,3,4,5].map(s => (
                    <TouchableOpacity key={s} onPress={() => setRating(s)} activeOpacity={0.7}>
                        <Text style={[styles.starBtn, { color: s <= rating ? C.primary : C.border }]}>★</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={styles.ratingLabel}>{rating > 0 ? ['','Çok Kötü','Kötü','Orta','İyi','Mükemmel'][rating] : 'Puan seçin'}</Text>

            <TextInput
                style={styles.input}
                placeholder="Yorumunuzu yazın (isteğe bağlı)..."
                placeholderTextColor={C.textMuted}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={4}
            />

            <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
                {loading ? <ActivityIndicator color={C.darker} /> : <Text style={styles.submitBtnText}>Gönder</Text>}
            </TouchableOpacity>
        </View>
    );
}

// ── Ana bileşen: rol ve parametre'ye göre görünümü seç ──────────
export default function ReviewsScreen() {
    const { talep_id, degerlendirilen_id } = useLocalSearchParams();
    const { isDriver } = useAuth();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);

    if (isDriver) {
        return <DriverReviewsScreen C={C} styles={styles} />;
    }

    if (talep_id && degerlendirilen_id) {
        return <OwnerReviewScreen C={C} styles={styles} />;
    }

    return (
        <View style={styles.center}>
            <Text style={{ color: C.textMuted }}>Değerlendirme bulunamadı.</Text>
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:    { flex: 1, backgroundColor: C.background },
    content: { padding: 20, gap: 14, paddingBottom: 40 },
    center:  { flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center' },

    // ── Driver header ──
    driverHeader: { alignItems: 'center', gap: 8, paddingVertical: 24 },
    driverAvatar: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
        overflow: 'hidden',
    },
    driverAvatarImg:     { width: 80, height: 80, borderRadius: 40 },
    driverAvatarInitial: { fontSize: 32, fontWeight: '900', color: C.darker },
    driverName:  { color: C.text, fontSize: 20, fontWeight: '800' },
    ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    ratingBadgeStar:  { color: C.primary, fontSize: 20 },
    ratingBadgeVal:   { color: C.text, fontSize: 18, fontWeight: '800' },
    ratingBadgeCount: { color: C.textMuted, fontSize: 13 },

    // ── Review cards ──
    reviewCard: {
        backgroundColor: C.card, borderRadius: 14,
        padding: 14, gap: 6,
    },
    reviewCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    reviewStars:   { flexDirection: 'row', gap: 2 },
    reviewStar:    { fontSize: 16 },
    reviewDate:    { color: C.textMuted, fontSize: 12 },
    reviewComment: { color: C.text, fontSize: 13, lineHeight: 20 },
    reviewBy:      { color: C.textMuted, fontSize: 12, fontStyle: 'italic' },

    // ── Empty state ──
    empty:      { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
    emptySub:   { color: C.textMuted, fontSize: 13, textAlign: 'center' },

    // ── Owner review form ──
    formTitle:  { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 20, paddingHorizontal: 20 },
    formSub:    { color: C.textMuted, textAlign: 'center', paddingHorizontal: 20 },
    stars:      { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
    starBtn:    { fontSize: 48 },
    ratingLabel:{ color: C.primary, textAlign: 'center', fontWeight: '700', fontSize: 15 },
    input: {
        backgroundColor: C.card, borderRadius: 12, padding: 14, marginHorizontal: 20,
        color: C.text, fontSize: 14, textAlignVertical: 'top',
        borderWidth: 1, borderColor: C.border, minHeight: 100,
    },
    submitBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginHorizontal: 20 },
    submitBtnText: { color: C.darker, fontWeight: '800', fontSize: 16 },

    // ── Success + favorite ──
    successRoot:  { flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
    successIcon:  { fontSize: 64 },
    successTitle: { color: C.text, fontSize: 26, fontWeight: '900' },
    successSub:   { color: C.textMuted, fontSize: 14, textAlign: 'center' },
    favBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28,
        borderWidth: 1.5, borderColor: C.primary,
    },
    favBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
    favBtnText:   { color: C.primary, fontWeight: '700', fontSize: 15 },
    doneBtn:      { backgroundColor: C.card, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, borderWidth: 1, borderColor: C.border },
    doneBtnText:  { color: C.textMuted, fontWeight: '700', fontSize: 14 },
});
