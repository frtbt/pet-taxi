import { useState, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform,
    ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export default function LoginScreen() {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading]   = useState(false);
    const [showPass, setShowPass] = useState(false);
    const { login } = useAuth();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);
    const router = useRouter();

    async function handleLogin() {
        if (!email.trim() || !password) {
            Alert.alert('Hata', 'E-posta ve şifre gereklidir.');
            return;
        }
        setLoading(true);
        const res = await login(email.trim().toLowerCase(), password);
        setLoading(false);
        if (res.success) {
            router.replace('/(tabs)');
        } else {
            Alert.alert('Giriş Başarısız', res.error || 'E-posta veya şifre hatalı.');
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
                    <Text style={styles.subtitle}>Köpeğiniz için güvenli ulaşım</Text>
                </View>

                <View style={styles.card}>
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

                    <Text style={styles.label}>Şifre</Text>
                    <View style={styles.passWrap}>
                        <TextInput
                            style={[styles.input, { flex: 1, marginBottom: 0 }]}
                            placeholder="••••••••"
                            placeholderTextColor={C.textMuted}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPass}
                        />
                        <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                            <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.btn, loading && { opacity: 0.7 }]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading
                            ? <ActivityIndicator color={C.darker} />
                            : <Text style={styles.btnText}>Giriş Yap</Text>
                        }
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.forgotRow} onPress={() => router.push('/auth/forgot-password')}>
                    <Text style={styles.forgotLink}>Şifremi Unuttum</Text>
                </TouchableOpacity>

                <View style={styles.registerRow}>
                    <Text style={styles.note}>Hesabın yok mu?</Text>
                    <TouchableOpacity onPress={() => router.push('/auth/register')}>
                        <Text style={styles.registerLink}> Kayıt Ol</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:     { flex: 1, backgroundColor: C.background },
    scroll:   { flexGrow: 1, justifyContent: 'center', padding: 24 },
    header:   { alignItems: 'center', marginBottom: 36 },
    emoji:    { fontSize: 64, marginBottom: 8 },
    brand:    { fontSize: 36, fontWeight: '800', color: C.primary, letterSpacing: 1 },
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

    btn:          { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    btnText:      { color: C.darker, fontWeight: '800', fontSize: 16 },
    forgotRow:    { alignItems: 'center', marginTop: 16 },
    forgotLink:   { color: C.textMuted, fontSize: 13, fontWeight: '600' },
    registerRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    note:         { color: C.textMuted, fontSize: 13 },
    registerLink: { color: C.primary, fontSize: 13, fontWeight: '700' },
});
