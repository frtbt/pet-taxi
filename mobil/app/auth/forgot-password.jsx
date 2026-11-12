import { useState, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform,
    ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import taxiApi from '../../src/api/taxiClient';
import { useTheme } from '../../src/context/ThemeContext';

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);

    const [step, setStep]         = useState(1);
    const [email, setEmail]       = useState('');
    const [otp, setOtp]           = useState('');
    const [newPass, setNewPass]   = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading]   = useState(false);

    async function handleSendCode() {
        if (!email.trim()) { Alert.alert('Hata', 'E-posta adresinizi giriniz.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            Alert.alert('Hata', 'Geçerli bir e-posta adresi giriniz.'); return;
        }
        setLoading(true);
        await taxiApi.post('forgot_password', { email: email.trim().toLowerCase() });
        setLoading(false);
        setStep(2);
    }

    async function handleResetPassword() {
        if (!otp.trim() || !newPass) { Alert.alert('Hata', 'Kod ve yeni şifre gereklidir.'); return; }
        if (newPass.length < 6)      { Alert.alert('Hata', 'Şifre en az 6 karakter olmalıdır.'); return; }
        setLoading(true);
        const res = await taxiApi.post('reset_password', {
            email: email.trim().toLowerCase(),
            otp: otp.trim(),
            yeni_sifre: newPass,
        });
        setLoading(false);
        if (res.success) {
            Alert.alert('Başarılı', 'Şifreniz güncellendi. Giriş yapabilirsiniz.', [
                { text: 'Giriş Yap', onPress: () => router.replace('/auth/login') },
            ]);
        } else {
            Alert.alert('Hata', res.error ?? 'Bir hata oluştu.');
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={22} color={C.primary} />
                </TouchableOpacity>

                <View style={styles.header}>
                    <Text style={styles.emoji}>🔐</Text>
                    <Text style={styles.title}>Şifremi Unuttum</Text>
                    <Text style={styles.sub}>
                        {step === 1
                            ? 'E-posta adresinizi girin, size doğrulama kodu gönderelim.'
                            : `${email} adresine gönderilen 6 haneli kodu ve yeni şifrenizi girin.`}
                    </Text>
                </View>

                <View style={styles.card}>
                    {step === 1 ? (
                        <>
                            <Text style={styles.label}>E-posta</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="ornek@email.com"
                                placeholderTextColor={C.textMuted}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TouchableOpacity
                                style={[styles.btn, loading && { opacity: 0.7 }]}
                                onPress={handleSendCode}
                                disabled={loading}
                                activeOpacity={0.8}
                            >
                                {loading
                                    ? <ActivityIndicator color={C.darker} />
                                    : <Text style={styles.btnText}>Kod Gönder</Text>
                                }
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <Text style={styles.label}>Doğrulama Kodu</Text>
                            <TextInput
                                style={[styles.input, styles.otpInput]}
                                placeholder="000000"
                                placeholderTextColor={C.textMuted}
                                value={otp}
                                onChangeText={setOtp}
                                keyboardType="number-pad"
                                maxLength={6}
                            />

                            <Text style={styles.label}>Yeni Şifre</Text>
                            <View style={styles.passWrap}>
                                <TextInput
                                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                                    placeholder="En az 6 karakter"
                                    placeholderTextColor={C.textMuted}
                                    value={newPass}
                                    onChangeText={setNewPass}
                                    secureTextEntry={!showPass}
                                />
                                <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.textMuted} />
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                style={[styles.btn, loading && { opacity: 0.7 }]}
                                onPress={handleResetPassword}
                                disabled={loading}
                                activeOpacity={0.8}
                            >
                                {loading
                                    ? <ActivityIndicator color={C.darker} />
                                    : <Text style={styles.btnText}>Şifremi Güncelle</Text>
                                }
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.resendRow} onPress={() => { setStep(1); setOtp(''); setNewPass(''); }}>
                                <Text style={styles.resendText}>Kodu almadım — tekrar gönder</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    scroll: { flexGrow: 1, padding: 24 },
    backBtn:{ marginBottom: 16, alignSelf: 'flex-start', padding: 4 },

    header: { alignItems: 'center', marginBottom: 32 },
    emoji:  { fontSize: 48, marginBottom: 12 },
    title:  { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 8 },
    sub:    { color: C.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },

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
    otpInput: { textAlign: 'center', fontSize: 28, fontWeight: '800', letterSpacing: 8 },
    passWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    eyeBtn:   { paddingHorizontal: 12, paddingVertical: 12 },

    btn:     { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    btnText: { color: C.darker, fontWeight: '800', fontSize: 16 },

    resendRow:  { alignItems: 'center', marginTop: 16 },
    resendText: { color: C.primary, fontSize: 13, fontWeight: '600' },
});
