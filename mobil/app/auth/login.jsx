import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform,
    ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import Colors from '../../src/theme/colors';

export default function LoginScreen() {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading]   = useState(false);
    const [showPass, setShowPass] = useState(false);
    const { login } = useAuth();
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
                {/* Logo / Header */}
                <View style={styles.header}>
                    <Text style={styles.emoji}>🚕</Text>
                    <Text style={styles.brand}>Pet Taxi</Text>
                    <Text style={styles.subtitle}>Köpeğiniz için güvenli ulaşım</Text>
                </View>

                {/* Form */}
                <View style={styles.card}>
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

                    <Text style={styles.label}>Şifre</Text>
                    <View style={styles.passWrap}>
                        <TextInput
                            style={[styles.input, { flex: 1, marginBottom: 0 }]}
                            placeholder="••••••••"
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
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading
                            ? <ActivityIndicator color={Colors.darker} />
                            : <Text style={styles.btnText}>Giriş Yap</Text>
                        }
                    </TouchableOpacity>
                </View>

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

const styles = StyleSheet.create({
    root:     { flex: 1, backgroundColor: Colors.background },
    scroll:   { flexGrow: 1, justifyContent: 'center', padding: 24 },
    header:   { alignItems: 'center', marginBottom: 36 },
    emoji:    { fontSize: 64, marginBottom: 8 },
    brand:    { fontSize: 36, fontWeight: '800', color: Colors.primary, letterSpacing: 1 },
    subtitle: { fontSize: 14, color: Colors.textMuted, marginTop: 4 },

    card:     { backgroundColor: Colors.card, borderRadius: 16, padding: 24, gap: 4 },
    label:    { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 4, textTransform: 'uppercase' },
    input:    {
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
    passWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    eyeBtn:   { paddingHorizontal: 12, paddingVertical: 12 },

    btn:          {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 20,
    },
    btnText:      { color: Colors.darker, fontWeight: '800', fontSize: 16 },
    registerRow:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
    note:         { color: Colors.textMuted, fontSize: 13 },
    registerLink: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
});
