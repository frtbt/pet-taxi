import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import taxiApi from '../src/api/taxiClient';
import { useTheme } from '../src/context/ThemeContext';

export default function FavoritesScreen() {
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);
    const [favoriler, setFavoriler] = useState([]);
    const [loading, setLoading]     = useState(true);
    const [removing, setRemoving]   = useState(null);

    useEffect(() => { load(); }, []);

    async function load() {
        const res = await taxiApi.getFavorites();
        if (res.success) setFavoriler(res.favoriler ?? []);
        setLoading(false);
    }

    async function handleRemove(surucu_id) {
        setRemoving(surucu_id);
        await taxiApi.toggleFavorite(surucu_id);
        setFavoriler(prev => prev.filter(f => f.id !== surucu_id));
        setRemoving(null);
    }

    if (loading) return <View style={styles.center}><ActivityIndicator color={C.primary} size="large" /></View>;

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            {favoriler.length === 0 ? (
                <View style={styles.empty}>
                    <Ionicons name="heart-outline" size={48} color={C.border} />
                    <Text style={styles.emptyTitle}>Henüz favori sürücü yok</Text>
                    <Text style={styles.emptySub}>Yolculuk sonrası sürücüleri favoriye ekleyebilirsin</Text>
                </View>
            ) : (
                favoriler.map(f => (
                    <View key={f.id} style={styles.card}>
                        <View style={styles.cardLeft}>
                            {f.profil_foto
                                ? <Image source={{ uri: f.profil_foto }} style={styles.avatar} />
                                : (
                                    <View style={styles.avatarPlaceholder}>
                                        <Text style={styles.avatarInitial}>{f.ad_soyad?.charAt(0) ?? '?'}</Text>
                                    </View>
                                )
                            }
                            <View>
                                <Text style={styles.name}>{f.ad_soyad}</Text>
                                <View style={styles.ratingRow}>
                                    <Text style={styles.ratingStar}>★</Text>
                                    <Text style={styles.ratingVal}>
                                        {f.ortalama_puan > 0 ? Number(f.ortalama_puan).toFixed(1) : 'Yeni'}
                                    </Text>
                                    {f.degerlendirme_sayisi > 0 && (
                                        <Text style={styles.ratingCount}>({f.degerlendirme_sayisi})</Text>
                                    )}
                                </View>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={() => handleRemove(f.id)}
                            disabled={removing === f.id}
                            activeOpacity={0.7}
                        >
                            {removing === f.id
                                ? <ActivityIndicator color={C.danger} size="small" />
                                : <Ionicons name="heart-dislike-outline" size={20} color={C.danger} />
                            }
                        </TouchableOpacity>
                    </View>
                ))
            )}
        </ScrollView>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:    { flex: 1, backgroundColor: C.background },
    content: { padding: 16, gap: 10, paddingBottom: 40 },
    center:  { flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center' },

    empty:      { alignItems: 'center', paddingVertical: 80, gap: 10 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
    emptySub:   { color: C.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

    card: {
        backgroundColor: C.card, borderRadius: 14, padding: 14,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    cardLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    avatar:    { width: 48, height: 48, borderRadius: 24 },
    avatarPlaceholder: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
    },
    avatarInitial: { color: C.darker, fontWeight: '800', fontSize: 18 },
    name:      { color: C.text, fontSize: 15, fontWeight: '700' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    ratingStar:  { color: C.primary, fontSize: 14 },
    ratingVal:   { color: C.textMuted, fontSize: 13, fontWeight: '600' },
    ratingCount: { color: C.textMuted, fontSize: 12 },
    removeBtn: { padding: 8 },
});
