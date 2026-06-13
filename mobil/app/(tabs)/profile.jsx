import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import taxiApi from '../../src/api/taxiClient';
import Colors from '../../src/theme/colors';

export default function ProfileScreen() {
    const { user, logout, isDriver, isOwner } = useAuth();
    const router = useRouter();
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleting, setDeleting] = useState(false);

    async function handleLogout() {
        Alert.alert('Çıkış Yap', 'Çıkış yapmak istediğinizden emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Çıkış Yap', style: 'destructive', onPress: async () => { await logout(); router.replace('/auth/login'); } },
        ]);
    }

    async function handleDeleteAccount() {
        if (!deletePassword) {
            Alert.alert('Hata', 'Lütfen şifrenizi girin.');
            return;
        }
        setDeleting(true);
        const res = await taxiApi.deleteAccount(deletePassword);
        setDeleting(false);
        if (res.success) {
            setDeleteModalVisible(false);
            await logout();
            router.replace('/auth/login');
        } else {
            Alert.alert('Hata', res.error ?? 'Hesap silinemedi.');
        }
    }

    const ROL_MAP = { gezdirici: '🚗 Sürücü', surucu: '🚗 Sürücü', kopek_sahibi: '🐾 Köpek Sahibi', sahip: '🐾 Köpek Sahibi', admin: '⚙️ Admin' };

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            {/* Avatar & Name */}
            <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarInitial}>
                        {user?.ad_soyad?.charAt(0)?.toUpperCase() ?? '?'}
                    </Text>
                </View>
                <Text style={styles.name}>{user?.ad_soyad}</Text>
                <Text style={styles.role}>{ROL_MAP[user?.rol] ?? user?.rol}</Text>
                <View style={styles.emailPill}>
                    <Text style={styles.emailText}>{user?.email}</Text>
                </View>
            </View>

            {/* Menu */}
            <View style={styles.menuCard}>
                {isDriver && (
                    <MenuItem
                        emoji="🗺️"
                        label="İş Havuzu"
                        onPress={() => router.push('/(tabs)/pool')}
                    />
                )}
                {isOwner && (
                    <MenuItem
                        emoji="📋"
                        label="Taleplerim"
                        onPress={() => router.push('/(tabs)/pool')}
                    />
                )}
                <MenuItem
                    emoji="💰"
                    label="Cüzdan"
                    onPress={() => router.push('/(tabs)/wallet')}
                />
                <MenuItem
                    emoji="⭐"
                    label="Değerlendirmeler"
                    onPress={() => router.push('/reviews')}
                />
            </View>

            {/* Info */}
            <View style={styles.infoCard}>
                <InfoRow label="Telefon" value={user?.telefon ?? '-'} />
                <InfoRow label="Şehir"   value={user?.sehir ?? '-'} />
                <InfoRow label="İlçe"    value={user?.ilce ?? '-'} />
            </View>

            {/* Logout */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                <Text style={styles.logoutText}>Çıkış Yap</Text>
            </TouchableOpacity>

            {/* Hesabı Sil */}
            <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => { setDeletePassword(''); setDeleteModalVisible(true); }}
                activeOpacity={0.8}
            >
                <Text style={styles.deleteText}>Hesabı Sil</Text>
            </TouchableOpacity>

            <Text style={styles.version}>Pet Taxi v1.0.0</Text>

            {/* Delete Account Modal */}
            <Modal
                visible={deleteModalVisible}
                animationType="fade"
                transparent
                onRequestClose={() => setDeleteModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <Text style={styles.modalTitle}>Hesabı Sil</Text>
                        <Text style={styles.modalSub}>
                            Bu işlem kalıcıdır ve geri alınamaz. Tüm verileriniz silinecektir.
                        </Text>
                        <Text style={styles.modalLabel}>Onaylamak için şifrenizi girin</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Şifre"
                            placeholderTextColor={Colors.textMuted}
                            value={deletePassword}
                            onChangeText={setDeletePassword}
                            secureTextEntry
                            autoFocus
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={styles.modalCancelBtn}
                                onPress={() => setDeleteModalVisible(false)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.modalCancelText}>İptal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalDeleteBtn, deleting && { opacity: 0.6 }]}
                                onPress={handleDeleteAccount}
                                disabled={deleting}
                                activeOpacity={0.8}
                            >
                                {deleting
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={styles.modalDeleteText}>Sil</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

function MenuItem({ emoji, label, onPress }) {
    return (
        <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
            <Text style={styles.menuEmoji}>{emoji}</Text>
            <Text style={styles.menuLabel}>{label}</Text>
            <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
    );
}

function InfoRow({ label, value }) {
    return (
        <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    root:    { flex: 1, backgroundColor: Colors.background },
    content: { padding: 20, gap: 16, paddingBottom: 40 },

    avatarWrap: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    avatar: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: Colors.primary,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarInitial: { fontSize: 36, fontWeight: '800', color: Colors.darker },
    name:     { color: Colors.text, fontSize: 22, fontWeight: '800' },
    role:     { color: Colors.primary, fontSize: 14, fontWeight: '700' },
    emailPill:{ backgroundColor: Colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
    emailText:{ color: Colors.textMuted, fontSize: 13 },

    menuCard:  { backgroundColor: Colors.card, borderRadius: 16, overflow: 'hidden' },
    menuItem:  { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
    menuEmoji: { fontSize: 20, width: 28 },
    menuLabel: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: '600' },
    menuArrow: { color: Colors.textMuted, fontSize: 20 },

    infoCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 10 },
    infoRow:  { flexDirection: 'row', justifyContent: 'space-between' },
    infoLabel:{ color: Colors.textMuted, fontSize: 13 },
    infoValue:{ color: Colors.text, fontSize: 13, fontWeight: '600' },

    logoutBtn:  { backgroundColor: Colors.danger, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    logoutText: { color: Colors.white, fontWeight: '800', fontSize: 15 },
    deleteBtn:  { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.danger + '60' },
    deleteText: { color: Colors.danger, fontWeight: '600', fontSize: 14 },
    version:    { color: Colors.textMuted, textAlign: 'center', fontSize: 11 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalSheet:   { backgroundColor: Colors.card, borderRadius: 20, padding: 24, gap: 12 },
    modalTitle:   { color: Colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
    modalSub:     { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
    modalLabel:   { color: Colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginTop: 4 },
    modalInput:   {
        backgroundColor: Colors.surface, borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 12,
        color: Colors.text, fontSize: 15,
        borderWidth: 1, borderColor: Colors.border,
    },
    modalActions:     { flexDirection: 'row', gap: 12, marginTop: 8 },
    modalCancelBtn:   { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border },
    modalCancelText:  { color: Colors.textMuted, fontWeight: '700', fontSize: 15 },
    modalDeleteBtn:   { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 12, backgroundColor: Colors.danger },
    modalDeleteText:  { color: Colors.white, fontWeight: '800', fontSize: 15 },
});
