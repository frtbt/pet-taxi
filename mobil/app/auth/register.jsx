import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform,
    ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import Colors from '../../src/theme/colors';

export default function RegisterScreen() {
    const [fullName, setFullName] = useState('');
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone]       = useState('');
    const [role, setRole]         = useState('sahip'); // 'sahip' | 'surucu'
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading]   = useState(false);
    const { register } = useAuth();
    const router = useRouter();

    async function handleRegister() {
        if (!fullName.trim() || !email.trim() || !password) {
            Alert.alert('Hata', 'Ad soyad, e-posta ve şifre gereklidir.');
            return;
        }
        if (password.length < 6) {
            Alert.alert('Hata', 'Şifre en az 6 karakter olmalıdır.');
            return;
        }
        setLoading(true);
        const res = await register({
            ad_soyad: fullName.trim(),
            email: email.trim().toLowerCase(),
            sifre: password,
            rol: role,
            telefon: phone.trim() || undefined,
        });
        setLoading(false);
        if (res.success) {
            router.replace('/(tabs)');
        } else {
            Alert.alert('Kayıt Başarısız', res.error || 'Bir hata oluştu.');
        }
    }

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
                    {/* Role selection */}
                    <Text style={styles.label}>Hesap Türü</Text>
                    <View style={styles.roleRow}>
                        <TouchableOpacity
                            style={[styles.roleBtn, role === 'sahip' && styles.roleBtnActive]}
                            onPress={() => setRole('sahip')}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.roleIcon]}>🐶</Text>
                            <Text style={[styles.roleText, role === 'sahip' && styles.roleTextActive]}>
                                Köpek Sahibi
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.roleBtn, role === 'surucu' && styles.roleBtnActive]}
                            onPress={() => setRole('surucu')}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.roleIcon]}>🚗</Text>
                            <Text style={[styles.roleText, role === 'surucu' && styles.roleTextActive]}>
                                Sürücü
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>Ad Soyad</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Adınız Soyadınız"
                        placeholderTextColor={Colors.textMuted}
                        value={fullName}
                        onChangeText={setFullName}
                        autoCapitalize="words"
                    />

                    <Text style={styles.label}>Email</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="example@email.com"
                        placeholderTextColor={Colors.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <Text style={styles.label}>Telefon (isteğe bağlı)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="0(5XX) XXX XX XX"
                        placeholderTextColor={Colors.textMuted}
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                    />

                    <Text style={styles.label}>Şifre</Text>
                    <View style={styles.passWrap}>
                        <TextInput
                            style={[styles.input, { flex: 1, marginBottom: 0 }]}
                            placeholder="En az 6 karakter"
                            placeholderTextColor={Colors.textMuted}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPass}
                        />
                        <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                            <Text style={{ color: Colors.textMuted }}>{showPass ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.btn, loading && { opacity: 0.7 }]}
                        onPress={handleRegister}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading
                            ? <ActivityIndicator color={Colors.darker} />
                            : <Text style={styles.btnText}>Kayıt Ol</Text>
                        }
                    </TouchableOpacity>
                </View>

                <View style={styles.loginRow}>
                    <Text style={styles.note}>Zaten hesabın var mı?</Text>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Text style={styles.loginLink}> Giriş Yap</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root:           { flex: 1, backgroundColor: Colors.background },
    scroll:         { flexGrow: 1, justifyContent: 'center', padding: 24 },
    header:         { alignItems: 'center', marginBottom: 28 },
    emoji:          { fontSize: 52, marginBottom: 6 },
    brand:          { fontSize: 32, fontWeight: '800', color: Colors.primary, letterSpacing: 1 },
    subtitle:       { fontSize: 14, color: Colors.textMuted, marginTop: 4 },

    card:           { backgroundColor: Colors.card, borderRadius: 16, padding: 24, gap: 4 },
    label:          { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 4, textTransform: 'uppercase' },
    input:          {
        backgroundColor: Colors.surface,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: Colors.text,
        fontSize: 15,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    passWrap:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    eyeBtn:         { paddingHorizontal: 12, paddingVertical: 12 },

    roleRow:        { flexDirection: 'row', gap: 12, marginBottom: 4 },
    roleBtn:        {
        flex: 1, alignItems: 'center', paddingVertical: 14,
        borderRadius: 12, borderWidth: 2, borderColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    roleBtnActive:  { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
    roleIcon:       { fontSize: 28, marginBottom: 4 },
    roleText:       { color: Colors.textMuted, fontWeight: '600', fontSize: 13 },
    roleTextActive: { color: Colors.primary },

    btn:            {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 20,
    },
    btnText:        { color: Colors.darker, fontWeight: '800', fontSize: 16 },
    loginRow:       { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
    note:           { color: Colors.textMuted, fontSize: 13 },
    loginLink:      { color: Colors.primary, fontSize: 13, fontWeight: '700' },
});
