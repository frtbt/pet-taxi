import { useState, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView,
    Alert, Modal, TextInput, ActivityIndicator, FlatList,
    KeyboardAvoidingView, Platform, Image, Linking,
} from 'react-native';

function formatIBAN(raw) {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let v = clean.startsWith('TR') ? clean : 'TR' + clean.replace(/^TR/, '');
    if (v.length > 26) v = v.slice(0, 26);
    let fmt = v.slice(0, 4);
    for (let i = 4; i < v.length; i += 4) fmt += ' ' + v.slice(i, i + 4);
    return fmt.trim();
}
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import taxiApi from '../../src/api/taxiClient';

export default function ProfileScreen() {
    const { user, logout, isDriver, isOwner, refreshUser } = useAuth();
    const { colors: C, isDark, toggleTheme } = useTheme();
    const router = useRouter();
    const styles = useMemo(() => makeStyles(C), [C]);

    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deletePassword, setDeletePassword]         = useState('');
    const [deleteConfirmText, setDeleteConfirmText]   = useState('');
    const [deleting, setDeleting]                     = useState(false);

    const [editVisible, setEditVisible] = useState(false);
    const [editForm, setEditForm]       = useState({});
    const [saving, setSaving]           = useState(false);

    const [bankModalVisible, setBankModalVisible] = useState(false);
    const [bankForm, setBankForm]                 = useState({ iban: '', banka_adi: '', hesap_sahibi: '' });
    const [hesapTipi, setHesapTipi]               = useState('bireysel');
    const [tcNo, setTcNo]                         = useState('');
    const [firmaAdi, setFirmaAdi]                 = useState('');
    const [vergiDairesi, setVergiDairesi]         = useState('');
    const [vergiNo, setVergiNo]                   = useState('');
    const [savingBank, setSavingBank]             = useState(false);

    const [iller, setIller]                   = useState([]);
    const [ilceler, setIlceler]               = useState([]);
    const [loadingIller, setLoadingIller]     = useState(false);
    const [loadingIlceler, setLoadingIlceler] = useState(false);
    const [editCityId, setEditCityId]         = useState(null);
    const [cityPickerVisible, setCityPickerVisible]         = useState(false);
    const [districtPickerVisible, setDistrictPickerVisible] = useState(false);
    const [citySearch, setCitySearch]         = useState('');
    const [districtSearch, setDistrictSearch] = useState('');

    async function openEdit() {
        setEditForm({
            ad_soyad: user?.ad_soyad ?? '',
            telefon:  user?.telefon  ?? '',
            adres:    user?.adres    ?? '',
            sehir:    user?.sehir    ?? '',
            ilce:     user?.ilce     ?? '',
        });
        setEditCityId(null);
        setIlceler([]);
        setCitySearch('');
        setDistrictSearch('');
        setEditVisible(true);

        if (iller.length === 0) {
            setLoadingIller(true);
            const res = await taxiApi.getIller();
            if (res.success) setIller(res.iller ?? []);
            setLoadingIller(false);
        }
    }

    function openBankModal() {
        setBankForm({
            iban:         user?.iban         ? formatIBAN(user.iban) : '',
            banka_adi:    user?.banka_adi    ?? '',
            hesap_sahibi: user?.hesap_sahibi ?? '',
        });
        setHesapTipi(user?.hesap_tipi ?? 'bireysel');
        setTcNo(user?.tc_no ?? '');
        setFirmaAdi(user?.firma_unvani ?? '');
        setVergiDairesi(user?.vergi_dairesi ?? '');
        setVergiNo(user?.vergi_no ?? '');
        setBankModalVisible(true);
    }

    async function handleCitySelect(il) {
        setEditForm(f => ({ ...f, sehir: il.ad, ilce: '' }));
        setEditCityId(il.id);
        setCityPickerVisible(false);
        setCitySearch('');

        setLoadingIlceler(true);
        setIlceler([]);
        const res = await taxiApi.getIlceler(il.id);
        if (res.success) setIlceler(res.ilceler ?? []);
        setLoadingIlceler(false);
    }

    async function handleDistrictSelect(ilce) {
        setEditForm(f => ({ ...f, ilce: ilce.ad }));
        setDistrictPickerVisible(false);
        setDistrictSearch('');
    }

    async function saveProfile() {
        if (!editForm.ad_soyad?.trim()) {
            Alert.alert('Hata', 'Ad soyad zorunludur.');
            return;
        }
        setSaving(true);
        const res = await taxiApi.request('update_profile', { method: 'POST', body: editForm });
        setSaving(false);
        if (res.success) {
            refreshUser(res.user);
            setEditVisible(false);
            Alert.alert('Başarılı', 'Profiliniz güncellendi.');
        } else {
            Alert.alert('Hata', res.error ?? 'Güncelleme başarısız.');
        }
    }

    async function saveBankInfo() {
        const iban = bankForm.iban.trim().toUpperCase().replace(/\s/g, '');
        if (!iban) { Alert.alert('Hata', 'IBAN zorunludur.'); return; }
        if (!/^TR\d{24}$/.test(iban)) {
            Alert.alert('Geçersiz IBAN', 'TR ile başlayan, 26 karakter uzunluğunda geçerli bir IBAN girin.\nÖrn: TR32 0001 0017 4534 1340 5006 32');
            return;
        }
        if (!bankForm.banka_adi.trim()) { Alert.alert('Hata', 'Banka adı zorunludur.'); return; }
        if (!bankForm.hesap_sahibi.trim()) { Alert.alert('Hata', 'Hesap sahibi zorunludur.'); return; }
        if (hesapTipi === 'bireysel' && tcNo && tcNo.length !== 11) {
            Alert.alert('Geçersiz TC', 'TC Kimlik No 11 haneli olmalıdır.');
            return;
        }
        if (hesapTipi === 'kurumsal' && vergiNo && vergiNo.length !== 10) {
            Alert.alert('Geçersiz Vergi No', 'Vergi No 10 haneli olmalıdır.');
            return;
        }
        setSavingBank(true);
        const body = {
            ...bankForm, iban,
            hesap_tipi:    hesapTipi,
            tc_no:         hesapTipi === 'bireysel' ? tcNo : '',
            firma_unvani:  hesapTipi === 'kurumsal' ? firmaAdi : '',
            vergi_dairesi: hesapTipi === 'kurumsal' ? vergiDairesi : '',
            vergi_no:      hesapTipi === 'kurumsal' ? vergiNo : '',
        };
        const res = await taxiApi.updateBankInfo(body);
        setSavingBank(false);
        if (res.success) {
            refreshUser(res.user);
            setBankModalVisible(false);
            Alert.alert('Başarılı', 'Banka bilgileri güncellendi.');
        } else {
            Alert.alert('Hata', res.error ?? 'Güncelleme başarısız.');
        }
    }

    async function handleLogout() {
        Alert.alert('Çıkış Yap', 'Çıkış yapmak istediğinizden emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Çıkış Yap', style: 'destructive', onPress: async () => { await logout(); router.replace('/auth/login'); } },
        ]);
    }

    async function handleDeleteAccount() {
        if (!deletePassword) { Alert.alert('Hata', 'Lütfen şifrenizi girin.'); return; }
        if (deleteConfirmText.trim().toUpperCase() !== 'SİL') {
            Alert.alert('Hata', 'Onay kutusuna büyük harfle "SİL" yazmalısınız.');
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

    const ROL_MAP = {
        gezdirici:    '🚗 Sürücü',
        surucu:       '🚗 Sürücü',
        kopek_sahibi: '🐾 Köpek Sahibi',
        sahip:        '🐾 Köpek Sahibi',
        admin:        '⚙️ Admin',
    };

    const initial = user?.ad_soyad?.charAt(0)?.toUpperCase() ?? '?';

    const filteredIller   = iller.filter(il => il.ad.toLowerCase().includes(citySearch.toLowerCase()));
    const filteredIlceler = ilceler.filter(il => il.ad.toLowerCase().includes(districtSearch.toLowerCase()));

    const maskedIban = user?.iban
        ? user.iban.slice(0, 2) + '••••••••••••••••••••' + user.iban.slice(-4)
        : null;

    return (
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
            {/* Avatar & Name */}
            <View style={styles.avatarWrap}>
                {user?.profil_foto ? (
                    <Image source={{ uri: user.profil_foto }} style={styles.avatarPhoto} />
                ) : (
                    <LinearGradient
                        colors={['#f59e0b', '#d97706', '#b45309']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.avatar}
                    >
                        <Text style={styles.avatarInitial}>{initial}</Text>
                    </LinearGradient>
                )}
                <Text style={styles.name}>{user?.ad_soyad}</Text>
                <Text style={styles.role}>{ROL_MAP[user?.rol] ?? user?.rol}</Text>
                <View style={styles.emailPill}>
                    <Text style={styles.emailText}>{user?.email}</Text>
                </View>
                <TouchableOpacity style={styles.editProfileBtn} onPress={openEdit} activeOpacity={0.8}>
                    <Ionicons name="pencil-outline" size={14} color={C.text} />
                    <Text style={styles.editProfileText}>Profili Düzenle</Text>
                </TouchableOpacity>
            </View>

            {/* Sürücü belgesi durumu */}
            {isDriver && (() => {
                const sd = user?.sertifika_durumu;
                if (!sd) return (
                    <TouchableOpacity style={styles.verifyBanner} onPress={() => router.push('/driver-verification')} activeOpacity={0.85}>
                        <Text style={styles.verifyBannerText}>⚠️ Sürücü belgelerini yükle → Hesabını aktifleştir</Text>
                        <Text style={styles.verifyBannerArrow}>›</Text>
                    </TouchableOpacity>
                );
                if (sd === 'beklemede') return (
                    <View style={[styles.verifyBanner, { backgroundColor: '#92400e22' }]}>
                        <Text style={[styles.verifyBannerText, { color: '#f59e0b' }]}>⏳ Belgeler inceleniyor, en kısa sürede onaylanacak</Text>
                    </View>
                );
                if (sd === 'onaylandi') return (
                    <View style={[styles.verifyBanner, { backgroundColor: '#14532d22' }]}>
                        <Text style={[styles.verifyBannerText, { color: '#86efac' }]}>✓ Sürücü belgeleri onaylandı</Text>
                    </View>
                );
                if (sd === 'reddedildi') return (
                    <TouchableOpacity style={[styles.verifyBanner, { backgroundColor: '#7f1d1d22' }]} onPress={() => router.push('/driver-verification')} activeOpacity={0.85}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.verifyBannerText, { color: '#fca5a5' }]}>✗ Belgeler reddedildi — Tekrar yükle</Text>
                            {user?.red_nedeni ? <Text style={{ color: '#fca5a5', fontSize: 11, marginTop: 2 }}>{user.red_nedeni}</Text> : null}
                        </View>
                        <Text style={styles.verifyBannerArrow}>›</Text>
                    </TouchableOpacity>
                );
            })()}

            {/* Menu */}
            <View style={styles.menuCard}>
                {isDriver && (
                    <MenuItem C={C} styles={styles} emoji="🗺️" label="İş Havuzu" onPress={() => router.push('/(tabs)/pool')} />
                )}
                {isOwner && (
                    <MenuItem C={C} styles={styles} emoji="📋" label="Taleplerim" onPress={() => router.push('/(tabs)/pool')} />
                )}
                {isOwner && (
                    <MenuItem C={C} styles={styles} emoji="📍" label="Adreslerim" onPress={() => router.push('/my-addresses')} />
                )}
                {isDriver && (
                    <MenuItem C={C} styles={styles} emoji="🏦" label="Banka Bilgileri" onPress={openBankModal} />
                )}
                <MenuItem C={C} styles={styles} emoji="💰" label="Cüzdan" onPress={() => router.push('/(tabs)/wallet')} />
                {isDriver && (
                    <MenuItem C={C} styles={styles} emoji="⭐" label="Değerlendirmelerim" onPress={() => router.push('/reviews')} />
                )}
                {isOwner && (
                    <MenuItem C={C} styles={styles} emoji="❤️" label="Favori Sürücüler" onPress={() => router.push('/favorites')} />
                )}

                {isDriver && (
                    <MenuItem C={C} styles={styles} emoji="📋" label="Araç Belgeleri" onPress={() => router.push('/arac-belgeleri')} />
                )}
                <MenuItem C={C} styles={styles} emoji="📄" label="Kullanım Koşulları" onPress={() => router.push('/contract')} />

                {/* Tema toggle */}
                <TouchableOpacity style={styles.menuItem} onPress={toggleTheme} activeOpacity={0.7}>
                    <Text style={styles.menuEmoji}>{isDark ? '☀️' : '🌙'}</Text>
                    <Text style={styles.menuLabel}>{isDark ? 'Aydınlık Mod' : 'Karanlık Mod'}</Text>
                    <View style={[styles.themeToggle, { backgroundColor: isDark ? C.surface : C.primary + '30' }]}>
                        <View style={[styles.themeToggleKnob, { backgroundColor: C.primary, transform: [{ translateX: isDark ? 0 : 18 }] }]} />
                    </View>
                </TouchableOpacity>
            </View>

            {/* Info */}
            <View style={styles.infoCard}>
                <InfoRow C={C} styles={styles} label="Telefon"      value={user?.telefon ?? '-'} />
                <InfoRow C={C} styles={styles} label="Şehir / İlçe" value={[user?.ilce, user?.sehir].filter(Boolean).join(', ') || '-'} />
                {user?.adres ? <InfoRow C={C} styles={styles} label="İkamet Adresi" value={user.adres} /> : null}
                {isDriver && maskedIban ? <InfoRow C={C} styles={styles} label="IBAN" value={maskedIban} /> : null}
                {isDriver && user?.banka_adi ? <InfoRow C={C} styles={styles} label="Banka" value={user.banka_adi} /> : null}
                {isDriver && user?.hesap_sahibi ? <InfoRow C={C} styles={styles} label="Hesap Sahibi" value={user.hesap_sahibi} /> : null}
                {isDriver && user?.hesap_tipi ? <InfoRow C={C} styles={styles} label="Hesap Tipi" value={user.hesap_tipi === 'kurumsal' ? 'Kurumsal' : 'Bireysel'} /> : null}
                {isDriver && !user?.iban && (
                    <TouchableOpacity onPress={openBankModal} style={styles.bankWarning}>
                        <Text style={styles.bankWarningText}>⚠️ Banka bilgileri girilmemiş — ödeme alınamaz</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Logout */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                <Ionicons name="log-out-outline" size={18} color="#fff" />
                <Text style={styles.logoutText}>Çıkış Yap</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.privacyBtn}
                onPress={() => Linking.openURL('https://patimera.com/pet-taksi-gizlilik-politikasi').catch(() => Alert.alert('Hata', 'Bağlantı açılamadı.'))}
                activeOpacity={0.8}
            >
                <Text style={styles.privacyText}>Gizlilik Politikası</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => { setDeletePassword(''); setDeleteModalVisible(true); }}
                activeOpacity={0.8}
            >
                <Text style={styles.deleteText}>Hesabı Sil</Text>
            </TouchableOpacity>

            <Text style={styles.version}>Pet Taxi v{Constants.expoConfig?.version ?? '1.0.0'}</Text>

            {/* ─── Profil Düzenleme Modal ─── */}
            <Modal visible={editVisible} animationType="slide" transparent onRequestClose={() => setEditVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <Text style={styles.modalTitle}>✏️ Profili Düzenle</Text>

                        <Text style={styles.modalLabel}>Ad Soyad</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={editForm.ad_soyad ?? ''}
                            onChangeText={v => setEditForm(f => ({ ...f, ad_soyad: v }))}
                            placeholder="Ad Soyad"
                            placeholderTextColor={C.textMuted}
                        />

                        <Text style={styles.modalLabel}>Telefon</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={editForm.telefon ?? ''}
                            onChangeText={v => setEditForm(f => ({ ...f, telefon: v }))}
                            placeholder="Telefon"
                            placeholderTextColor={C.textMuted}
                            keyboardType="phone-pad"
                        />

                        <Text style={styles.modalLabel}>İkamet Adresi</Text>
                        <TextInput
                            style={[styles.modalInput, { minHeight: 60, textAlignVertical: 'top' }]}
                            value={editForm.adres ?? ''}
                            onChangeText={v => setEditForm(f => ({ ...f, adres: v }))}
                            placeholder="Cadde, sokak, bina no, daire..."
                            placeholderTextColor={C.textMuted}
                            multiline
                        />

                        <Text style={styles.modalLabel}>Şehir</Text>
                        <TouchableOpacity
                            style={[styles.modalInput, styles.pickerRow]}
                            onPress={() => { setCitySearch(''); setCityPickerVisible(true); }}
                            activeOpacity={0.8}
                        >
                            <Text style={editForm.sehir ? styles.pickerText : styles.pickerPlaceholder}>
                                {editForm.sehir || 'Şehir seçin...'}
                            </Text>
                            {loadingIller
                                ? <ActivityIndicator size="small" color={C.primary} />
                                : <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                            }
                        </TouchableOpacity>

                        <Text style={styles.modalLabel}>İlçe</Text>
                        <TouchableOpacity
                            style={[styles.modalInput, styles.pickerRow, !editCityId && !editForm.sehir && styles.pickerDisabled]}
                            onPress={() => {
                                if (!editForm.sehir) { Alert.alert('', 'Önce şehir seçin.'); return; }
                                if (!editCityId && editForm.sehir && ilceler.length === 0) {
                                    Alert.alert('', 'Şehri yeniden seçip ardından ilçe seçin.');
                                    return;
                                }
                                setDistrictSearch('');
                                setDistrictPickerVisible(true);
                            }}
                            activeOpacity={0.8}
                        >
                            <Text style={editForm.ilce ? styles.pickerText : styles.pickerPlaceholder}>
                                {editForm.ilce || 'İlçe seçin...'}
                            </Text>
                            {loadingIlceler
                                ? <ActivityIndicator size="small" color={C.primary} />
                                : <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                            }
                        </TouchableOpacity>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditVisible(false)} activeOpacity={0.8}>
                                <Text style={styles.modalCancelText}>İptal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalSaveBtn, saving && { opacity: 0.6 }]} onPress={saveProfile} disabled={saving} activeOpacity={0.8}>
                                {saving ? <ActivityIndicator color={C.darker} /> : <Text style={styles.modalSaveText}>Kaydet</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ─── Banka Bilgileri Modal (Sürücü) ─── */}
            <Modal visible={bankModalVisible} animationType="slide" transparent onRequestClose={() => setBankModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <View style={styles.bankOverlay}>
                        <View style={styles.bankSheet}>
                            <View style={styles.bankHeader}>
                                <Text style={styles.modalTitle}>🏦 Banka Bilgileri</Text>
                                <TouchableOpacity onPress={() => setBankModalVisible(false)}>
                                    <Ionicons name="close" size={24} color={C.textMuted} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                <Text style={styles.modalSub}>
                                    Yolculuk ödemelerini alabilmek için banka bilgilerinizi girin.
                                </Text>

                                <Text style={[styles.modalLabel, { marginTop: 12 }]}>Hesap Tipi</Text>
                                <View style={styles.segmentRow}>
                                    {['bireysel', 'kurumsal'].map(t => (
                                        <TouchableOpacity
                                            key={t}
                                            style={[styles.segmentBtn, hesapTipi === t && styles.segmentBtnActive]}
                                            onPress={() => setHesapTipi(t)}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons
                                                name={t === 'bireysel' ? 'person' : 'business'}
                                                size={16}
                                                color={hesapTipi === t ? C.darker : C.textMuted}
                                            />
                                            <Text style={[styles.segmentBtnText, hesapTipi === t && styles.segmentBtnTextActive]}>
                                                {t === 'bireysel' ? 'Bireysel' : 'Kurumsal'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <Text style={[styles.modalLabel, { marginTop: 16 }]}>IBAN</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    value={bankForm.iban}
                                    onChangeText={v => setBankForm(f => ({ ...f, iban: formatIBAN(v) }))}
                                    placeholder="TR00 0000 0000 0000 0000 0000 00"
                                    placeholderTextColor={C.textMuted}
                                    autoCapitalize="characters"
                                    keyboardType="default"
                                    maxLength={32}
                                />
                                <Text style={styles.ibanHint}>TR ile başlayan, boşluklu olarak 26 rakam</Text>

                                <Text style={[styles.modalLabel, { marginTop: 12 }]}>Banka Adı</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    value={bankForm.banka_adi}
                                    onChangeText={v => setBankForm(f => ({ ...f, banka_adi: v }))}
                                    placeholder="Ziraat, Garanti, İş Bankası..."
                                    placeholderTextColor={C.textMuted}
                                />

                                <Text style={[styles.modalLabel, { marginTop: 12 }]}>Hesap Sahibi</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    value={bankForm.hesap_sahibi}
                                    onChangeText={v => setBankForm(f => ({ ...f, hesap_sahibi: v }))}
                                    placeholder="Ad Soyad"
                                    placeholderTextColor={C.textMuted}
                                />

                                {hesapTipi === 'bireysel' && (
                                    <>
                                        <Text style={[styles.modalLabel, { marginTop: 12 }]}>TC Kimlik No</Text>
                                        <TextInput
                                            style={styles.modalInput}
                                            value={tcNo}
                                            onChangeText={v => setTcNo(v.replace(/\D/g, '').slice(0, 11))}
                                            placeholder="11 haneli TC kimlik numaranız"
                                            placeholderTextColor={C.textMuted}
                                            keyboardType="number-pad"
                                            maxLength={11}
                                        />
                                    </>
                                )}

                                {hesapTipi === 'kurumsal' && (
                                    <>
                                        <Text style={[styles.modalLabel, { marginTop: 12 }]}>Firma Ünvanı</Text>
                                        <TextInput
                                            style={styles.modalInput}
                                            value={firmaAdi}
                                            onChangeText={setFirmaAdi}
                                            placeholder="Şirket ünvanı"
                                            placeholderTextColor={C.textMuted}
                                        />
                                        <Text style={[styles.modalLabel, { marginTop: 12 }]}>Vergi Dairesi</Text>
                                        <TextInput
                                            style={styles.modalInput}
                                            value={vergiDairesi}
                                            onChangeText={setVergiDairesi}
                                            placeholder="Vergi dairesi adı"
                                            placeholderTextColor={C.textMuted}
                                        />
                                        <Text style={[styles.modalLabel, { marginTop: 12 }]}>Vergi No</Text>
                                        <TextInput
                                            style={styles.modalInput}
                                            value={vergiNo}
                                            onChangeText={v => setVergiNo(v.replace(/\D/g, '').slice(0, 10))}
                                            placeholder="10 haneli vergi no"
                                            placeholderTextColor={C.textMuted}
                                            keyboardType="number-pad"
                                            maxLength={10}
                                        />
                                    </>
                                )}
                            </ScrollView>

                            <View style={styles.bankFooter}>
                                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setBankModalVisible(false)} activeOpacity={0.8}>
                                    <Text style={styles.modalCancelText}>İptal</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalSaveBtn, savingBank && { opacity: 0.6 }]} onPress={saveBankInfo} disabled={savingBank} activeOpacity={0.8}>
                                    {savingBank ? <ActivityIndicator color={C.darker} /> : <Text style={styles.modalSaveText}>Kaydet</Text>}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* ─── Şehir Seçici Modal ─── */}
            <Modal visible={cityPickerVisible} animationType="slide" transparent onRequestClose={() => setCityPickerVisible(false)}>
                <View style={styles.pickerOverlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.pickerSheet}
                    >
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>Şehir Seç</Text>
                            <TouchableOpacity onPress={() => setCityPickerVisible(false)}>
                                <Ionicons name="close" size={24} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={styles.pickerSearch}
                            value={citySearch}
                            onChangeText={setCitySearch}
                            placeholder="Şehir ara..."
                            placeholderTextColor={C.textMuted}
                        />
                        <FlatList
                            data={filteredIller}
                            keyExtractor={item => String(item.id)}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.pickerItem, editForm.sehir === item.ad && styles.pickerItemActive]}
                                    onPress={() => handleCitySelect(item)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.pickerItemText, editForm.sehir === item.ad && { color: C.primary }]}>
                                        {item.ad}
                                    </Text>
                                    {editForm.sehir === item.ad && (
                                        <Ionicons name="checkmark" size={18} color={C.primary} />
                                    )}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <Text style={styles.pickerEmpty}>
                                    {loadingIller ? 'Yükleniyor...' : 'Şehir bulunamadı'}
                                </Text>
                            }
                        />
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ─── İlçe Seçici Modal ─── */}
            <Modal visible={districtPickerVisible} animationType="slide" transparent onRequestClose={() => setDistrictPickerVisible(false)}>
                <View style={styles.pickerOverlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.pickerSheet}
                    >
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>{editForm.sehir} — İlçe Seç</Text>
                            <TouchableOpacity onPress={() => setDistrictPickerVisible(false)}>
                                <Ionicons name="close" size={24} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={styles.pickerSearch}
                            value={districtSearch}
                            onChangeText={setDistrictSearch}
                            placeholder="İlçe ara..."
                            placeholderTextColor={C.textMuted}
                        />
                        <FlatList
                            data={filteredIlceler}
                            keyExtractor={item => String(item.id)}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.pickerItem, editForm.ilce === item.ad && styles.pickerItemActive]}
                                    onPress={() => handleDistrictSelect(item)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.pickerItemText, editForm.ilce === item.ad && { color: C.primary }]}>
                                        {item.ad}
                                    </Text>
                                    {editForm.ilce === item.ad && (
                                        <Ionicons name="checkmark" size={18} color={C.primary} />
                                    )}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <Text style={styles.pickerEmpty}>
                                    {loadingIlceler ? 'Yükleniyor...' : 'İlçe bulunamadı'}
                                </Text>
                            }
                        />
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ─── Hesap Sil Modal ─── */}
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
                            placeholderTextColor={C.textMuted}
                            value={deletePassword}
                            onChangeText={setDeletePassword}
                            secureTextEntry
                            autoFocus
                        />
                        <Text style={[styles.modalLabel, { marginTop: 12 }]}>Aşağıya <Text style={{ color: C.danger, fontWeight: '800' }}>SİL</Text> yazın</Text>
                        <TextInput
                            style={[styles.modalInput, { textTransform: 'uppercase' }]}
                            placeholder="SİL"
                            placeholderTextColor={C.textMuted}
                            value={deleteConfirmText}
                            onChangeText={setDeleteConfirmText}
                            autoCapitalize="characters"
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={styles.modalCancelBtn}
                                onPress={() => { setDeleteModalVisible(false); setDeleteConfirmText(''); }}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.modalCancelText}>İptal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalDeleteBtn, (deleting || deleteConfirmText.trim().toUpperCase() !== 'SİL') && { opacity: 0.5 }]}
                                onPress={handleDeleteAccount}
                                disabled={deleting || deleteConfirmText.trim().toUpperCase() !== 'SİL'}
                                activeOpacity={0.8}
                            >
                                {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalDeleteText}>Sil</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

function MenuItem({ C, styles, emoji, label, onPress }) {
    return (
        <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
            <Text style={styles.menuEmoji}>{emoji}</Text>
            <Text style={styles.menuLabel}>{label}</Text>
            <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>
    );
}

function InfoRow({ styles, label, value }) {
    return (
        <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:    { flex: 1, backgroundColor: C.background },
    content: { padding: 20, gap: 16, paddingBottom: 40 },

    avatarWrap: { alignItems: 'center', paddingVertical: 24, gap: 10 },
    avatar: {
        width: 88, height: 88, borderRadius: 44,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    avatarPhoto: {
        width: 88, height: 88, borderRadius: 44,
        shadowColor: C.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    avatarInitial: { fontSize: 38, fontWeight: '900', color: C.darker },
    name:     { color: C.text, fontSize: 22, fontWeight: '800' },
    role:     { color: C.primary, fontSize: 14, fontWeight: '700' },
    emailPill:{ backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
    emailText:{ color: C.textMuted, fontSize: 13 },

    editProfileBtn: {
        marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 8,
        borderWidth: 1, borderColor: C.border,
    },
    editProfileText: { color: C.text, fontSize: 13, fontWeight: '600' },

    menuCard:  { backgroundColor: C.card, borderRadius: 18, overflow: 'hidden' },
    menuItem:  { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    menuEmoji: { fontSize: 20, width: 28 },
    menuLabel: { flex: 1, color: C.text, fontSize: 15, fontWeight: '600' },

    themeToggle: {
        width: 42, height: 24, borderRadius: 12,
        justifyContent: 'center', paddingHorizontal: 3,
    },
    themeToggleKnob: {
        width: 18, height: 18, borderRadius: 9,
    },

    infoCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 12 },
    infoRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    infoLabel:{ color: C.textMuted, fontSize: 13 },
    infoValue:{ color: C.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },

    bankWarning: {
        backgroundColor: '#92400e22', borderRadius: 10, padding: 10,
        borderWidth: 1, borderColor: '#f59e0b44',
    },
    bankWarningText: { color: '#f59e0b', fontSize: 12, fontWeight: '600' },

    verifyBanner:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#7c2d1222', borderRadius: 14, padding: 14, gap: 8 },
    verifyBannerText:  { flex: 1, color: '#fbbf24', fontSize: 13, fontWeight: '600' },
    verifyBannerArrow: { color: C.textMuted, fontSize: 20 },

    logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.danger, borderRadius: 14, paddingVertical: 14 },
    logoutText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
    deleteBtn:  { borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.danger + '60' },
    privacyBtn: { paddingVertical: 12, alignItems: 'center' },
    privacyText: { color: C.primary, fontWeight: '600', fontSize: 14 },
    deleteText: { color: C.danger, fontWeight: '600', fontSize: 14 },
    version:    { color: C.textMuted, textAlign: 'center', fontSize: 11 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalSheet:   { backgroundColor: C.card, borderRadius: 20, padding: 24, gap: 12 },
    modalTitle:   { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
    modalSub:     { color: C.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
    modalLabel:   { color: C.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    modalInput:   {
        backgroundColor: C.surface, borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 12,
        color: C.text, fontSize: 15,
        borderWidth: 1, borderColor: C.border,
    },
    modalActions:    { flexDirection: 'row', gap: 12, marginTop: 8 },
    modalCancelBtn:  { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: C.border },
    modalCancelText: { color: C.textMuted, fontWeight: '700', fontSize: 15 },
    modalSaveBtn:    { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 12, backgroundColor: C.primary },
    modalSaveText:   { color: C.darker, fontWeight: '800', fontSize: 15 },
    modalDeleteBtn:  { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 12, backgroundColor: C.danger },
    modalDeleteText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },

    ibanHint: { color: C.textMuted, fontSize: 11, marginTop: 4, marginBottom: 2 },

    bankOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    bankSheet:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    bankHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 0 },
    bankFooter:  { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: Platform.OS === 'ios' ? 32 : 16, borderTopWidth: 1, borderTopColor: C.border },

    segmentRow:          { flexDirection: 'row', gap: 10, marginTop: 6 },
    segmentBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
    segmentBtnActive:    { backgroundColor: C.primary, borderColor: C.primary },
    segmentBtnText:      { color: C.textMuted, fontWeight: '600', fontSize: 13 },
    segmentBtnTextActive:{ color: C.darker, fontWeight: '700', fontSize: 13 },

    pickerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pickerText:       { color: C.text, fontSize: 15 },
    pickerPlaceholder:{ color: C.textMuted, fontSize: 15 },
    pickerDisabled:   { opacity: 0.5 },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    pickerSheet:   {
        backgroundColor: C.card,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        maxHeight: '75%',
    },
    pickerHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
    pickerTitle:   { color: C.text, fontSize: 17, fontWeight: '800' },
    pickerSearch:  {
        backgroundColor: C.surface, borderRadius: 12,
        marginHorizontal: 16, marginBottom: 8,
        paddingHorizontal: 14, paddingVertical: 10,
        color: C.text, fontSize: 15,
        borderWidth: 1, borderColor: C.border,
    },
    pickerItem:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border + '66' },
    pickerItemActive:{ backgroundColor: C.primary + '12' },
    pickerItemText:  { color: C.text, fontSize: 15 },
    pickerEmpty:     { color: C.textMuted, textAlign: 'center', paddingVertical: 32 },
});
