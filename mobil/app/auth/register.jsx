import { useState, useEffect, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform,
    ActivityIndicator, Alert, ScrollView, Modal, FlatList, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import taxiApi from '../../src/api/taxiClient';

export default function RegisterScreen() {
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);

    const [fullName, setFullName] = useState('');
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone]       = useState('');
    const [role, setRole]         = useState('sahip');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading]   = useState(false);

    const [iller, setIller]               = useState([]);
    const [ilceler, setIlceler]           = useState([]);
    const [selectedIl, setSelectedIl]     = useState(null);
    const [sehir, setSehir]               = useState('');
    const [ilce, setIlce]                 = useState('');
    const [ilSearch, setIlSearch]         = useState('');
    const [ilceSearch, setIlceSearch]     = useState('');
    const [showIlModal, setShowIlModal]   = useState(false);
    const [showIlceModal, setShowIlceModal] = useState(false);

    const [contract, setContract]           = useState(null);
    const [contractLoading, setContractLoading] = useState(false);
    const [showContractModal, setShowContractModal] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [ageConfirmed, setAgeConfirmed]   = useState(false);

    const { register } = useAuth();
    const router = useRouter();

    useEffect(() => {
        taxiApi.getIller().then(res => {
            if (res.success) setIller(res.iller ?? []);
        });
        setContractLoading(true);
        taxiApi.getContract().then(res => {
            if (res.success && res.contract) setContract(res.contract);
            setContractLoading(false);
        }).catch(() => setContractLoading(false));
    }, []);

    async function handleIlSelect(il) {
        setSelectedIl(il);
        setSehir(il.ad);
        setIlce('');
        setIlceler([]);
        setShowIlModal(false);
        const res = await taxiApi.getIlceler(il.id);
        if (res.success) setIlceler(res.ilceler ?? []);
    }

    function handleIlceSelect(item) {
        setIlce(item.ad);
        setShowIlceModal(false);
    }

    async function handleOpenContract() {
        if (!contract && !contractLoading) {
            setContractLoading(true);
            const r = await taxiApi.getContract();
            if (r.success && r.contract) setContract(r.contract);
            setContractLoading(false);
        }
        setShowContractModal(true);
    }

    async function handleRegister() {
        if (!fullName.trim() || !email.trim() || !password) {
            Alert.alert('Hata', 'Ad soyad, e-posta ve şifre gereklidir.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            Alert.alert('Hata', 'Geçerli bir e-posta adresi giriniz.');
            return;
        }
        if (password.length < 6) {
            Alert.alert('Hata', 'Şifre en az 6 karakter olmalıdır.');
            return;
        }
        if (!phone.trim()) {
            Alert.alert('Hata', 'Lütfen telefon numaranızı giriniz.');
            return;
        }
        if (!sehir) { Alert.alert('Hata', 'Lütfen şehir seçiniz.'); return; }
        if (!ilce)  { Alert.alert('Hata', 'Lütfen ilçe seçiniz.');  return; }
        if (!ageConfirmed) {
            Alert.alert('Yaş Beyanı', '18 yaşından büyük olduğunuzu onaylamanız gerekiyor.');
            return;
        }
        if (!termsAccepted) {
            Alert.alert('Kullanım Koşulları', 'Devam etmek için kullanım koşullarını kabul etmeniz gerekiyor.');
            return;
        }
        if (!contract) {
            Alert.alert('Hata', 'Sözleşme yüklenemedi. Lütfen tekrar deneyin.');
            return;
        }

        setLoading(true);
        const res = await register({
            ad_soyad: fullName.trim(),
            email: email.trim().toLowerCase(),
            sifre: password,
            rol: role,
            telefon: phone.trim(),
            sehir,
            ilce,
            terms_version: contract.surum,
        });
        setLoading(false);
        if (res.success) {
            router.replace('/(tabs)');
        } else {
            Alert.alert('Kayıt Başarısız', res.error || 'Bir hata oluştu.');
        }
    }

    const filteredIller   = iller.filter(il => il.ad.toLowerCase().includes(ilSearch.toLowerCase()));
    const filteredIlceler = ilceler.filter(il => il.ad.toLowerCase().includes(ilceSearch.toLowerCase()));

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.header}>
                    <Text style={styles.emoji}>🚕</Text>
                    <Text style={styles.brand}>Pet Taxi</Text>
                    <Text style={styles.subtitle}>Yeni hesap oluştur</Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.label}>Hesap Türü</Text>
                    <View style={styles.roleRow}>
                        <TouchableOpacity
                            style={[styles.roleBtn, role === 'sahip' && styles.roleBtnActive]}
                            onPress={() => setRole('sahip')}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.roleIcon}>🐶</Text>
                            <Text style={[styles.roleText, role === 'sahip' && styles.roleTextActive]}>
                                Köpek Sahibi
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.roleBtn, role === 'surucu' && styles.roleBtnActive]}
                            onPress={() => setRole('surucu')}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.roleIcon}>🚗</Text>
                            <Text style={[styles.roleText, role === 'surucu' && styles.roleTextActive]}>
                                Sürücü
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>Ad Soyad</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Adınız Soyadınız"
                        placeholderTextColor={C.textMuted}
                        value={fullName}
                        onChangeText={setFullName}
                        autoCapitalize="words"
                    />

                    <Text style={styles.label}>Email</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="example@email.com"
                        placeholderTextColor={C.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <Text style={styles.label}>Telefon</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="0(5XX) XXX XX XX"
                        placeholderTextColor={C.textMuted}
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                    />

                    <Text style={styles.label}>Şifre</Text>
                    <View style={styles.passWrap}>
                        <TextInput
                            style={[styles.input, { flex: 1, marginBottom: 0 }]}
                            placeholder="En az 6 karakter"
                            placeholderTextColor={C.textMuted}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPass}
                        />
                        <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                            <Text style={{ color: C.textMuted }}>{showPass ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>Şehir</Text>
                    <TouchableOpacity
                        style={styles.pickerRow}
                        onPress={() => { setIlSearch(''); setShowIlModal(true); }}
                        activeOpacity={0.8}
                    >
                        <Text style={sehir ? styles.pickerText : styles.pickerPlaceholder}>
                            {sehir || 'Şehir seçin...'}
                        </Text>
                        <Text style={styles.pickerArrow}>▾</Text>
                    </TouchableOpacity>

                    <Text style={styles.label}>İlçe</Text>
                    <TouchableOpacity
                        style={[styles.pickerRow, !sehir && styles.pickerDisabled]}
                        onPress={() => {
                            if (!sehir) { Alert.alert('', 'Önce şehir seçin.'); return; }
                            setIlceSearch('');
                            setShowIlceModal(true);
                        }}
                        activeOpacity={0.8}
                    >
                        <Text style={ilce ? styles.pickerText : styles.pickerPlaceholder}>
                            {ilce || 'İlçe seçin...'}
                        </Text>
                        <Text style={styles.pickerArrow}>▾</Text>
                    </TouchableOpacity>

                </View>
            </ScrollView>

            {/* Sözleşme onayı + Kayıt Ol — sabit alt bar */}
            <View style={styles.bottomBar}>
                {/* 18 yaş beyanı */}
                <TouchableOpacity
                    style={[styles.termsRow, { marginBottom: 8 }]}
                    onPress={() => setAgeConfirmed(v => !v)}
                    activeOpacity={0.8}
                >
                    <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
                        {ageConfirmed && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.termsText}>18 yaşından büyük olduğumu beyan ediyorum</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.termsRow}
                    onPress={() => setTermsAccepted(v => !v)}
                    activeOpacity={0.8}
                >
                    <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                        {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.termsText}>
                        {'Pet Taxi '}
                        <Text style={styles.termsLink} onPress={handleOpenContract}>
                            Kullanım Koşulları
                        </Text>
                        {'\'nı ve '}
                        <Text style={styles.termsLink} onPress={() => Linking.openURL('https://patimera.com/pet-taksi-gizlilik-politikasi')}>
                            Gizlilik Politikası
                        </Text>
                        {'\'nı okudum ve kabul ediyorum'}
                    </Text>
                </TouchableOpacity>
                {contractLoading && (
                    <Text style={styles.contractLoading}>Sözleşme yükleniyor...</Text>
                )}
                <TouchableOpacity
                    style={[styles.btn, { marginTop: 10, opacity: (termsAccepted && ageConfirmed) ? 1 : 0.55 }]}
                    onPress={handleRegister}
                    disabled={loading || !termsAccepted || !ageConfirmed}
                    activeOpacity={0.8}
                >
                    {loading
                        ? <ActivityIndicator color={C.darker} />
                        : <Text style={styles.btnText}>Kayıt Ol</Text>
                    }
                </TouchableOpacity>
                <View style={styles.loginRow}>
                    <Text style={styles.note}>Zaten hesabın var mı?</Text>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text style={styles.loginLink}> Giriş Yap</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Şehir Modal */}
            <Modal visible={showIlModal} animationType="slide" transparent onRequestClose={() => setShowIlModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Şehir Seç</Text>
                            <TouchableOpacity onPress={() => setShowIlModal(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={styles.modalSearch}
                            placeholder="Ara..."
                            placeholderTextColor={C.textMuted}
                            value={ilSearch}
                            onChangeText={setIlSearch}
                            autoCapitalize="none"
                        />
                        <FlatList
                            data={filteredIller}
                            keyExtractor={item => String(item.id)}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.pickerItem, sehir === item.ad && styles.pickerItemActive]}
                                    onPress={() => handleIlSelect(item)}
                                >
                                    <Text style={[styles.pickerItemText, sehir === item.ad && { color: C.primary }]}>
                                        {item.ad}
                                    </Text>
                                    {sehir === item.ad && <Text style={{ color: C.primary }}>✓</Text>}
                                </TouchableOpacity>
                            )}
                            keyboardShouldPersistTaps="handled"
                        />
                    </View>
                </View>
            </Modal>

            {/* Sözleşme Modal */}
            <Modal visible={showContractModal} animationType="slide" onRequestClose={() => setShowContractModal(false)}>
                <View style={[styles.contractModal, { backgroundColor: C.background }]}>
                    <View style={[styles.modalHeader, { borderBottomColor: C.border }]}>
                        <Text style={[styles.modalTitle, { color: C.text }]}>
                            Pet Taxi Kullanım Sözleşmesi
                            {contract?.surum ? ` (v${contract.surum})` : ''}
                        </Text>
                        <TouchableOpacity onPress={() => setShowContractModal(false)}>
                            <Text style={[styles.modalClose, { color: C.textMuted }]}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    {contractLoading ? (
                        <ActivityIndicator style={{ marginTop: 40 }} color={C.primary} />
                    ) : contract ? (
                        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
                            <Text style={{ color: C.text, fontSize: 14, lineHeight: 22 }}>
                                {(contract.icerik || '')
                                    .replace(/<br\s*\/?>/gi, '\n')
                                    .replace(/<\/p>/gi, '\n')
                                    .replace(/<\/h[1-6]>/gi, '\n')
                                    .replace(/<h[1-6][^>]*>/gi, '\n')
                                    .replace(/<\/li>/gi, '\n')
                                    .replace(/<li[^>]*>/gi, '• ')
                                    .replace(/<[^>]+>/g, '')
                                    .replace(/&nbsp;/g, ' ')
                                    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
                                    .replace(/\n{3,}/g, '\n\n')
                                    .trim()}
                            </Text>
                        </ScrollView>
                    ) : (
                        <Text style={{ margin: 20, color: C.textMuted }}>Sözleşme yüklenemedi.</Text>
                    )}
                    <View style={{ padding: 16 }}>
                        <TouchableOpacity
                            style={styles.btn}
                            onPress={() => { setTermsAccepted(true); setShowContractModal(false); }}
                        >
                            <Text style={styles.btnText}>Okudum, Kabul Ediyorum</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* İlçe Modal */}
            <Modal visible={showIlceModal} animationType="slide" transparent onRequestClose={() => setShowIlceModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{sehir} — İlçe Seç</Text>
                            <TouchableOpacity onPress={() => setShowIlceModal(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={styles.modalSearch}
                            placeholder="Ara..."
                            placeholderTextColor={C.textMuted}
                            value={ilceSearch}
                            onChangeText={setIlceSearch}
                            autoCapitalize="none"
                        />
                        <FlatList
                            data={filteredIlceler}
                            keyExtractor={item => String(item.id)}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.pickerItem, ilce === item.ad && styles.pickerItemActive]}
                                    onPress={() => handleIlceSelect(item)}
                                >
                                    <Text style={[styles.pickerItemText, ilce === item.ad && { color: C.primary }]}>
                                        {item.ad}
                                    </Text>
                                    {ilce === item.ad && <Text style={{ color: C.primary }}>✓</Text>}
                                </TouchableOpacity>
                            )}
                            keyboardShouldPersistTaps="handled"
                        />
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:     { flex: 1, backgroundColor: C.background },
    scroll:   { flexGrow: 1, justifyContent: 'center', padding: 24 },
    header:   { alignItems: 'center', marginBottom: 28 },
    emoji:    { fontSize: 52, marginBottom: 6 },
    brand:    { fontSize: 32, fontWeight: '800', color: C.primary, letterSpacing: 1 },
    subtitle: { fontSize: 14, color: C.textMuted, marginTop: 4 },

    card:  { backgroundColor: C.card, borderRadius: 16, padding: 24, gap: 4 },
    label: { color: C.textMuted, fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 4, textTransform: 'uppercase' },
    input: {
        backgroundColor: C.surface,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: C.text,
        fontSize: 15,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: C.border,
    },
    passWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    eyeBtn:   { paddingHorizontal: 12, paddingVertical: 12 },

    roleRow:        { flexDirection: 'row', gap: 12, marginBottom: 4 },
    roleBtn:        {
        flex: 1, alignItems: 'center', paddingVertical: 14,
        borderRadius: 12, borderWidth: 2, borderColor: C.border,
        backgroundColor: C.surface,
    },
    roleBtnActive:  { borderColor: C.primary, backgroundColor: C.primary + '18' },
    roleIcon:       { fontSize: 28, marginBottom: 4 },
    roleText:       { color: C.textMuted, fontWeight: '600', fontSize: 13 },
    roleTextActive: { color: C.primary },

    pickerRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: C.surface, borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 12,
        borderWidth: 1, borderColor: C.border, marginBottom: 4,
    },
    pickerDisabled:    { opacity: 0.45 },
    pickerText:        { color: C.text, fontSize: 15, flex: 1 },
    pickerPlaceholder: { color: C.textMuted, fontSize: 15, flex: 1 },
    pickerArrow:       { color: C.textMuted, fontSize: 14 },

    btn:       { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    btnText:   { color: C.darker, fontWeight: '800', fontSize: 16 },
    loginRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
    note:      { color: C.textMuted, fontSize: 13 },
    loginLink: { color: C.primary, fontSize: 13, fontWeight: '700' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    modalSheet:   { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
    modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: C.border },
    modalTitle:   { color: C.text, fontSize: 16, fontWeight: '700' },
    modalClose:   { color: C.textMuted, fontSize: 18, paddingHorizontal: 4 },
    modalSearch:  {
        margin: 12, backgroundColor: C.surface, borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 10,
        color: C.text, fontSize: 14,
        borderWidth: 1, borderColor: C.border,
    },
    pickerItem:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
    pickerItemActive: { backgroundColor: C.primary + '12' },
    pickerItemText:   { color: C.text, fontSize: 15 },

    bottomBar:       { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.background },
    termsRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: C.primary, borderColor: C.primary },
    checkmark:       { color: '#fff', fontSize: 13, fontWeight: '800' },
    termsText:       { flex: 1, color: C.textMuted, fontSize: 13, lineHeight: 19 },
    termsLink:       { color: C.primary, fontWeight: '700' },
    contractLoading: { color: C.textMuted, fontSize: 11, marginBottom: 4 },

    contractModal:  { flex: 1 },
});
