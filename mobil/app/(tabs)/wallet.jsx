import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    View, Text, FlatList, StyleSheet, TouchableOpacity,
    RefreshControl, ActivityIndicator, Modal, TextInput,
    KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import taxiApi from '../../src/api/taxiClient';
import { useTheme } from '../../src/context/ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';

const TX_EMOJI = {
    surucu_kazanci:     '💚',
    para_yukleme:       '💳',
    iade:               '↩️',
    komisyon_kesintisi: '📊',
    para_cekme:         '🏧',
    hizmet_odemesi:     '💸',
};
const TX_LABEL = {
    surucu_kazanci:     'Sürücü Kazancı',
    para_yukleme:       'Para Yükleme',
    iade:               'İade',
    komisyon_kesintisi: 'Komisyon Kesintisi',
    para_cekme:         'Para Çekme',
    hizmet_odemesi:     'Hizmet Ödemesi',
};

const PRESET_AMOUNTS = [50, 100, 200, 500];

export default function WalletScreen() {
    const { isDriver } = useAuth();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);

    const TX_COLOR = {
        surucu_kazanci:     C.success,
        para_yukleme:       C.info,
        iade:               C.warning,
        komisyon_kesintisi: C.danger,
        para_cekme:         C.danger,
        hizmet_odemesi:     C.textMuted,
    };

    const [balance, setBalance]           = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading]           = useState(true);
    const [refreshing, setRefreshing]     = useState(false);
    const [showTopup, setShowTopup]       = useState(false);
    const [amount, setAmount]             = useState('');
    const [topupLoading, setTopupLoading] = useState(false);
    const [minYukle, setMinYukle]         = useState(10);

    const { payment_status } = useLocalSearchParams();
    useEffect(() => {
        if (payment_status === 'success') {
            Alert.alert('Ödeme Başarılı', 'Bakiyeniz güncellendi.');
            load();
        } else if (payment_status === 'fail') {
            Alert.alert('Ödeme Başarısız', 'Ödeme tamamlanamadı, lütfen tekrar deneyin.');
        }
    }, [payment_status]);

    const load = useCallback(async () => {
        const [walletRes, settingsRes] = await Promise.all([taxiApi.getWallet(), taxiApi.getSettings()]);
        if (walletRes.success) {
            setBalance(Number(walletRes.bakiye ?? 0));
            setTransactions(walletRes.islemler ?? []);
        }
        if (settingsRes.success && settingsRes.settings?.min_yukle_tl != null && settingsRes.settings.min_yukle_tl !== '') {
            setMinYukle(Number(settingsRes.settings.min_yukle_tl));
        }
        setLoading(false);
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

    async function handleTopup() {
        const tutar = parseFloat(amount);
        if (!tutar || tutar < minYukle) {
            Alert.alert('Geçersiz Tutar', `Minimum yükleme tutarı ${minYukle} ₺`);
            return;
        }
        setTopupLoading(true);
        const res = await taxiApi.walletTopupInit(tutar);

        if (!res.success) {
            setTopupLoading(false);
            Alert.alert('Hata', res.error ?? 'Ödeme başlatılamadı.');
            return;
        }

        setShowTopup(false);
        setAmount('');

        const result = await WebBrowser.openAuthSessionAsync(res.payment_url, 'pet-taxi://');
        setTopupLoading(false);

        if (result.type === 'success') {
            const ok = (result.url ?? '').includes('status=success');
            await load();
            Alert.alert(
                ok ? 'Ödeme Başarılı' : 'Ödeme Başarısız',
                ok ? 'Bakiyeniz güncellendi.' : 'Ödeme işlemi tamamlanamadı, lütfen tekrar deneyin.',
            );
        } else {
            await load();
        }
    }

    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;
    }

    return (
        <>
            <FlatList
                style={styles.root}
                contentContainerStyle={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
                ListHeaderComponent={
                    <>
                        <LinearGradient
                            colors={['#f59e0b', '#d97706', '#b45309']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.balanceCard}
                        >
                            <Text style={styles.balanceLabel}>Mevcut Bakiye</Text>
                            <Text style={styles.balanceAmount}>
                                {balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            </Text>
                            <Text style={styles.balanceSub}>Pet Taxi cüzdanı</Text>

                            {!isDriver && (
                                <TouchableOpacity
                                    style={styles.topupBtn}
                                    onPress={() => setShowTopup(true)}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.topupBtnText}>💳 Para Yükle</Text>
                                </TouchableOpacity>
                            )}
                        </LinearGradient>

                        <Text style={styles.sectionTitle}>İşlem Geçmişi</Text>
                    </>
                }
                data={transactions}
                keyExtractor={item => String(item.id)}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>Henüz işlem yok.</Text>
                }
                renderItem={({ item }) => {
                    const color = TX_COLOR[item.islem_tipi] ?? C.textMuted;
                    const emoji = TX_EMOJI[item.islem_tipi] ?? '💰';
                    const positive = item.tutar > 0;
                    return (
                        <View style={styles.txCard}>
                            <View style={[styles.txIcon, { backgroundColor: color + '22' }]}>
                                <Text style={{ fontSize: 20 }}>{emoji}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.txType}>
                                    {TX_LABEL[item.islem_tipi] ?? item.islem_tipi.replace(/_/g, ' ')}
                                </Text>
                                {item.aciklama ? (
                                    <Text style={styles.txDesc} numberOfLines={1}>{item.aciklama}</Text>
                                ) : null}
                                <Text style={styles.txDate}>
                                    {new Date(item.tarih).toLocaleString('tr-TR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                                </Text>
                            </View>
                            <Text style={[styles.txAmount, { color: positive ? C.success : C.danger }]}>
                                {positive ? '+' : ''}{Number(item.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            </Text>
                        </View>
                    );
                }}
            />

            <Modal visible={showTopup} transparent animationType="slide" onRequestClose={() => setShowTopup(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <Text style={styles.modalTitle}>💳 Para Yükle</Text>
                        <Text style={styles.modalSub}>Minimum yükleme tutarı: {minYukle} ₺</Text>

                        <View style={styles.presets}>
                            {PRESET_AMOUNTS.map(a => (
                                <TouchableOpacity
                                    key={a}
                                    style={[styles.presetBtn, amount === String(a) && styles.presetBtnActive]}
                                    onPress={() => setAmount(String(a))}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.presetBtnText, amount === String(a) && styles.presetBtnTextActive]}>
                                        {a} ₺
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TextInput
                            style={styles.amountInput}
                            value={amount}
                            onChangeText={setAmount}
                            placeholder="Tutar girin (₺)"
                            placeholderTextColor={C.textMuted}
                            keyboardType="numeric"
                        />

                        <TouchableOpacity
                            style={[styles.payBtn, topupLoading && { opacity: 0.6 }]}
                            onPress={handleTopup}
                            disabled={topupLoading}
                            activeOpacity={0.85}
                        >
                            {topupLoading
                                ? <ActivityIndicator color={C.darker} />
                                : <Text style={styles.payBtnText}>Ödemeye Geç</Text>
                            }
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.cancelLink} onPress={() => { setShowTopup(false); setAmount(''); }}>
                            <Text style={styles.cancelLinkText}>İptal</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:    { flex: 1, backgroundColor: C.background },
    center:  { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
    content: { padding: 16, gap: 12, paddingBottom: 32 },

    balanceCard: {
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        marginBottom: 4,
        gap: 6,
        overflow: 'hidden',
    },
    balanceLabel:  { color: C.darker, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
    balanceAmount: { color: C.darker, fontSize: 40, fontWeight: '900', marginVertical: 4 },
    balanceSub:    { color: C.darker, opacity: 0.7, fontSize: 12 },

    topupBtn:     { backgroundColor: C.darker, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 8 },
    topupBtnText: { color: C.primary, fontWeight: '800', fontSize: 14 },

    sectionTitle: { color: C.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
    emptyText:    { color: C.textMuted, textAlign: 'center', paddingVertical: 32 },

    txCard: {
        backgroundColor: C.card,
        borderRadius: 12,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    txIcon:   { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    txType:   { color: C.text, fontSize: 13, fontWeight: '700' },
    txDesc:   { color: C.textMuted, fontSize: 11, marginTop: 2 },
    txDate:   { color: C.textMuted, fontSize: 11, marginTop: 2 },
    txAmount: { fontSize: 15, fontWeight: '800' },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 14 },
    modalTitle:   { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
    modalSub:     { color: C.textMuted, fontSize: 12, textAlign: 'center' },

    presets:             { flexDirection: 'row', gap: 10 },
    presetBtn:           { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, paddingVertical: 10, alignItems: 'center' },
    presetBtnActive:     { borderColor: C.primary, backgroundColor: C.primary + '20' },
    presetBtnText:       { color: C.textMuted, fontWeight: '700' },
    presetBtnTextActive: { color: C.primary },

    amountInput: {
        backgroundColor: C.background,
        color: C.text,
        borderRadius: 12,
        padding: 14,
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
        borderWidth: 1.5,
        borderColor: C.border,
    },
    payBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    payBtnText: { color: C.darker, fontWeight: '800', fontSize: 16 },

    cancelLink:     { alignItems: 'center', paddingBottom: 8 },
    cancelLinkText: { color: C.textMuted, fontSize: 14 },
});
