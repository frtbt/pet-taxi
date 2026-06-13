import { useState, useCallback } from 'react';
import {
    View, Text, FlatList, StyleSheet,
    RefreshControl, ActivityIndicator,
} from 'react-native';
import taxiApi from '../../src/api/taxiClient';
import Colors from '../../src/theme/colors';
import { useFocusEffect } from '@react-navigation/native';

const TX_COLOR = {
    surucu_kazanci:       Colors.success,
    para_yukleme:         Colors.info,
    iade:                 Colors.warning,
    komisyon_kesintisi:   Colors.danger,
    para_cekme:           Colors.danger,
    hizmet_odemesi:       Colors.textMuted,
};
const TX_EMOJI = {
    surucu_kazanci:       '💚',
    para_yukleme:         '💳',
    iade:                 '↩️',
    komisyon_kesintisi:   '📊',
    para_cekme:           '🏧',
    hizmet_odemesi:       '💸',
};

export default function WalletScreen() {
    const [balance, setBalance]     = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading]     = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        const res = await taxiApi.getWallet();
        if (res.success) {
            setBalance(Number(res.bakiye ?? 0));
            setTransactions(res.islemler ?? []);
        }
        setLoading(false);
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    }

    return (
        <FlatList
            style={styles.root}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            ListHeaderComponent={
                <>
                    {/* Balance card */}
                    <View style={styles.balanceCard}>
                        <Text style={styles.balanceLabel}>Mevcut Bakiye</Text>
                        <Text style={styles.balanceAmount}>
                            {balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </Text>
                        <Text style={styles.balanceSub}>Pet Taxi cüzdanı</Text>
                    </View>

                    <Text style={styles.sectionTitle}>İşlem Geçmişi</Text>
                </>
            }
            data={transactions}
            keyExtractor={item => String(item.id)}
            ListEmptyComponent={
                <Text style={styles.emptyText}>Henüz işlem yok.</Text>
            }
            renderItem={({ item }) => {
                const color = TX_COLOR[item.islem_tipi] ?? Colors.textMuted;
                const emoji = TX_EMOJI[item.islem_tipi] ?? '💰';
                const positive = item.tutar > 0;
                return (
                    <View style={styles.txCard}>
                        <View style={[styles.txIcon, { backgroundColor: color + '22' }]}>
                            <Text style={{ fontSize: 20 }}>{emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.txType}>
                                {({
                                    surucu_kazanci:     'Sürücü Kazancı',
                                    para_yukleme:       'Para Yükleme',
                                    iade:               'İade',
                                    komisyon_kesintisi: 'Komisyon Kesintisi',
                                    para_cekme:         'Para Çekme',
                                    hizmet_odemesi:     'Hizmet Ödemesi',
                                }[item.islem_tipi] ?? item.islem_tipi.replace(/_/g, ' '))}
                            </Text>
                            {item.aciklama ? (
                                <Text style={styles.txDesc} numberOfLines={1}>{item.aciklama}</Text>
                            ) : null}
                            <Text style={styles.txDate}>
                                {new Date(item.tarih).toLocaleString('tr-TR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                            </Text>
                        </View>
                        <Text style={[styles.txAmount, { color: positive ? Colors.success : Colors.danger }]}>
                            {positive ? '+' : ''}{Number(item.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </Text>
                    </View>
                );
            }}
        />
    );
}

const styles = StyleSheet.create({
    root:    { flex: 1, backgroundColor: Colors.background },
    center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
    content: { padding: 16, gap: 12, paddingBottom: 32 },

    balanceCard: {
        backgroundColor: Colors.primary,
        borderRadius: 20,
        padding: 28,
        alignItems: 'center',
        marginBottom: 4,
    },
    balanceLabel:  { color: Colors.darker, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
    balanceAmount: { color: Colors.darker, fontSize: 40, fontWeight: '900', marginVertical: 4 },
    balanceSub:    { color: Colors.darker, opacity: 0.7, fontSize: 12 },

    sectionTitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
    emptyText:    { color: Colors.textMuted, textAlign: 'center', paddingVertical: 32 },

    txCard:   {
        backgroundColor: Colors.card,
        borderRadius: 12,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    txIcon:   { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    txType:   { color: Colors.text, fontSize: 13, fontWeight: '700' },
    txDesc:   { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
    txDate:   { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
    txAmount: { fontSize: 15, fontWeight: '800' },
});
