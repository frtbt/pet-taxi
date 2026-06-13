import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import taxiApi from '../src/api/taxiClient';
import Colors from '../src/theme/colors';

export default function ReviewsScreen() {
    const { talep_id, degerlendirilen_id } = useLocalSearchParams();
    const router = useRouter();
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit() {
        if (rating === 0) { Alert.alert('Hata', 'Lütfen bir puan seçin.'); return; }
        setLoading(true);
        const res = await taxiApi.addReview(Number(talep_id), Number(degerlendirilen_id), rating, comment);
        setLoading(false);
        if (res.success) {
            Alert.alert('Teşekkürler!', 'Değerlendirmeniz kaydedildi.', [
                { text: 'Tamam', onPress: () => router.back() },
            ]);
        } else {
            Alert.alert('Hata', res.error ?? 'Gönderilemedi.');
        }
    }

    return (
        <View style={styles.root}>
            <Text style={styles.title}>Yolculuğu Değerlendir</Text>
            <Text style={styles.sub}>Sürücünüz nasıldı?</Text>

            <View style={styles.stars}>
                {[1,2,3,4,5].map(s => (
                    <TouchableOpacity key={s} onPress={() => setRating(s)} activeOpacity={0.7}>
                        <Text style={[styles.star, { color: s <= rating ? Colors.primary : Colors.border }]}>★</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={styles.ratingText}>{rating > 0 ? ['','Çok Kötü','Kötü','Orta','İyi','Mükemmel'][rating] : 'Puan seçin'}</Text>

            <TextInput
                style={styles.input}
                placeholder="Yorumunuzu yazın (isteğe bağlı)..."
                placeholderTextColor={Colors.textMuted}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={4}
            />

            <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
                {loading ? <ActivityIndicator color={Colors.darker} /> : <Text style={styles.btnText}>Gönder</Text>}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    root:       { flex: 1, backgroundColor: Colors.background, padding: 24, gap: 16 },
    title:      { color: Colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 20 },
    sub:        { color: Colors.textMuted, textAlign: 'center' },
    stars:      { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    star:       { fontSize: 48 },
    ratingText: { color: Colors.primary, textAlign: 'center', fontWeight: '700', fontSize: 15 },
    input: {
        backgroundColor: Colors.card, borderRadius: 12, padding: 14,
        color: Colors.text, fontSize: 14, textAlignVertical: 'top',
        borderWidth: 1, borderColor: Colors.border, minHeight: 100,
    },
    btn:     { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    btnText: { color: Colors.darker, fontWeight: '800', fontSize: 16 },
});
