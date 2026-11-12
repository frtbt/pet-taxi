import { useState, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    Alert, Modal, TextInput, ActivityIndicator,
    KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import taxiApi from '../src/api/taxiClient';
import { useTheme } from '../src/context/ThemeContext';

const EMPTY_FORM = { ad: '', adres: '', sehir: '', ilce: '', sehir_id: null };

export default function MyAddressesScreen() {
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);

    const [addresses, setAddresses] = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing,   setEditing]   = useState(null);
    const [saving,    setSaving]    = useState(false);
    const [form, setForm]           = useState(EMPTY_FORM);

    const [iller, setIller]                     = useState([]);
    const [ilceler, setIlceler]                 = useState([]);
    const [loadingIller, setLoadingIller]       = useState(false);
    const [loadingIlceler, setLoadingIlceler]   = useState(false);
    const [cityPickerVisible, setCityPickerVisible]         = useState(false);
    const [districtPickerVisible, setDistrictPickerVisible] = useState(false);
    const [citySearch, setCitySearch]           = useState('');
    const [districtSearch, setDistrictSearch]   = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const res = await taxiApi.getMyAddresses();
        if (res.success) setAddresses(res.addresses ?? []);
        setLoading(false);
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    async function loadIller() {
        if (iller.length > 0) return;
        setLoadingIller(true);
        const res = await taxiApi.getIller();
        if (res.success) setIller(res.iller ?? []);
        setLoadingIller(false);
    }

    async function openAdd() {
        setEditing(null);
        setForm(EMPTY_FORM);
        setIlceler([]);
        await loadIller();
        setShowModal(true);
    }

    async function openEdit(addr) {
        setEditing(addr);
        setForm({ ad: addr.ad, adres: addr.adres, sehir: addr.sehir || '', ilce: addr.ilce || '', sehir_id: null });
        setIlceler([]);
        await loadIller();
        setShowModal(true);
    }

    async function handleCitySelect(il) {
        setForm(f => ({ ...f, sehir: il.ad, ilce: '', sehir_id: il.id }));
        setCityPickerVisible(false);
        setCitySearch('');
        setLoadingIlceler(true);
        setIlceler([]);
        const res = await taxiApi.getIlceler(il.id);
        if (res.success) setIlceler(res.ilceler ?? []);
        setLoadingIlceler(false);
    }

    function handleDistrictSelect(ilce) {
        setForm(f => ({ ...f, ilce: ilce.ad }));
        setDistrictPickerVisible(false);
        setDistrictSearch('');
    }

    async function handleSave() {
        if (!form.ad.trim() || !form.adres.trim()) {
            Alert.alert('Eksik Bilgi', 'Adres adı ve adres zorunludur.');
            return;
        }
        setSaving(true);
        const payload = {
            ad:    form.ad.trim(),
            adres: form.adres.trim(),
            sehir: form.sehir.trim() || null,
            ilce:  form.ilce.trim()  || null,
        };
        let res;
        if (editing) {
            res = await taxiApi.updateAddress({ ...payload, id: editing.id });
        } else {
            res = await taxiApi.addAddress(payload);
        }
        setSaving(false);
        if (res.success) {
            setShowModal(false);
            load();
        } else {
            Alert.alert('Hata', res.error ?? 'Adres kaydedilemedi.');
        }
    }

    async function handleDelete(id) {
        Alert.alert('Adresi Sil', 'Bu adresi silmek istediğinize emin misiniz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: async () => {
                const res = await taxiApi.deleteAddress(id);
                if (res.success) {
                    load();
                } else {
                    Alert.alert('Hata', res.error ?? 'Adres silinemedi.');
                }
            }},
        ]);
    }

    const filteredIller   = iller.filter(il => il.ad.toLowerCase().includes(citySearch.toLowerCase()));
    const filteredIlceler = ilceler.filter(il => il.ad.toLowerCase().includes(districtSearch.toLowerCase()));

    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;
    }

    return (
        <View style={styles.root}>
            <FlatList
                contentContainerStyle={styles.content}
                data={addresses}
                keyExtractor={item => String(item.id)}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyIcon}>📍</Text>
                        <Text style={styles.emptyTitle}>Kayıtlı adres yok</Text>
                        <Text style={styles.emptySub}>Sık kullandığınız adresleri kaydedin</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <View style={styles.cardIcon}>
                            <Text style={{ fontSize: 22 }}>
                                {item.ad.toLowerCase().includes('ev') ? '🏠' :
                                 item.ad.toLowerCase().includes('iş') ? '🏢' : '📍'}
                            </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitle}>{item.ad}</Text>
                            <Text style={styles.cardAddr} numberOfLines={2}>{item.adres}</Text>
                            {(item.ilce || item.sehir) ? (
                                <Text style={styles.cardCity}>{[item.ilce, item.sehir].filter(Boolean).join(', ')}</Text>
                            ) : null}
                        </View>
                        <View style={styles.cardActions}>
                            <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="create-outline" size={20} color={C.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="trash-outline" size={20} color={C.danger} />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            />

            <View style={styles.addBarWrap}>
                <TouchableOpacity style={styles.addBar} onPress={openAdd} activeOpacity={0.85}>
                    <Ionicons name="add-circle" size={22} color={C.darker} />
                    <Text style={styles.addBarText}>Yeni Adres Ekle</Text>
                </TouchableOpacity>
            </View>

            <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editing ? '✏️ Adresi Düzenle' : '📍 Yeni Adres'}</Text>
                            <TouchableOpacity onPress={() => setShowModal(false)}>
                                <Ionicons name="close" size={24} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <Text style={styles.inputLabel}>Adres Adı *</Text>
                            <TextInput
                                style={styles.input}
                                value={form.ad}
                                onChangeText={v => setForm(f => ({ ...f, ad: v }))}
                                placeholder="Ev, İş, Okul..."
                                placeholderTextColor={C.textMuted}
                            />

                            <Text style={styles.inputLabel}>Adres *</Text>
                            <TextInput
                                style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                                value={form.adres}
                                onChangeText={v => setForm(f => ({ ...f, adres: v }))}
                                placeholder="Cadde, sokak, bina no, daire..."
                                placeholderTextColor={C.textMuted}
                                multiline
                            />

                            <Text style={styles.inputLabel}>Şehir</Text>
                            <TouchableOpacity
                                style={[styles.input, styles.pickerRow]}
                                onPress={() => { setCitySearch(''); setCityPickerVisible(true); }}
                                activeOpacity={0.8}
                            >
                                <Text style={form.sehir ? styles.pickerText : styles.pickerPlaceholder}>
                                    {form.sehir || 'Şehir seçin...'}
                                </Text>
                                {loadingIller
                                    ? <ActivityIndicator size="small" color={C.primary} />
                                    : <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                                }
                            </TouchableOpacity>

                            <Text style={styles.inputLabel}>İlçe</Text>
                            <TouchableOpacity
                                style={[styles.input, styles.pickerRow, !form.sehir && { opacity: 0.5 }]}
                                onPress={() => {
                                    if (!form.sehir) { Alert.alert('', 'Önce şehir seçin.'); return; }
                                    if (!form.sehir_id && ilceler.length === 0) {
                                        Alert.alert('', 'Şehri yeniden seçip ardından ilçe seçin.');
                                        return;
                                    }
                                    setDistrictSearch('');
                                    setDistrictPickerVisible(true);
                                }}
                                activeOpacity={0.8}
                            >
                                <Text style={form.ilce ? styles.pickerText : styles.pickerPlaceholder}>
                                    {form.ilce || 'İlçe seçin...'}
                                </Text>
                                {loadingIlceler
                                    ? <ActivityIndicator size="small" color={C.primary} />
                                    : <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                                }
                            </TouchableOpacity>

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)} activeOpacity={0.8}>
                                    <Text style={styles.cancelBtnText}>İptal</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                                    {saving ? <ActivityIndicator color={C.darker} /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal visible={cityPickerVisible} transparent animationType="slide" onRequestClose={() => setCityPickerVisible(false)}>
                <View style={styles.pickerOverlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.pickerSheet}>
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>Şehir Seç</Text>
                            <TouchableOpacity onPress={() => setCityPickerVisible(false)}>
                                <Ionicons name="close" size={24} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <TextInput style={styles.pickerSearch} value={citySearch} onChangeText={setCitySearch}
                            placeholder="Şehir ara..." placeholderTextColor={C.textMuted} />
                        <FlatList
                            data={filteredIller}
                            keyExtractor={item => String(item.id)}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item }) => (
                                <TouchableOpacity style={[styles.pickerItem, form.sehir === item.ad && styles.pickerItemActive]} onPress={() => handleCitySelect(item)} activeOpacity={0.7}>
                                    <Text style={[styles.pickerItemText, form.sehir === item.ad && { color: C.primary }]}>{item.ad}</Text>
                                    {form.sehir === item.ad && <Ionicons name="checkmark" size={18} color={C.primary} />}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={<Text style={styles.pickerEmpty}>{loadingIller ? 'Yükleniyor...' : 'Şehir bulunamadı'}</Text>}
                        />
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            <Modal visible={districtPickerVisible} transparent animationType="slide" onRequestClose={() => setDistrictPickerVisible(false)}>
                <View style={styles.pickerOverlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.pickerSheet}>
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>{form.sehir} — İlçe Seç</Text>
                            <TouchableOpacity onPress={() => setDistrictPickerVisible(false)}>
                                <Ionicons name="close" size={24} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <TextInput style={styles.pickerSearch} value={districtSearch} onChangeText={setDistrictSearch}
                            placeholder="İlçe ara..." placeholderTextColor={C.textMuted} />
                        <FlatList
                            data={filteredIlceler}
                            keyExtractor={item => String(item.id)}
                            keyboardShouldPersistTaps="handled"
                            renderItem={({ item }) => (
                                <TouchableOpacity style={[styles.pickerItem, form.ilce === item.ad && styles.pickerItemActive]} onPress={() => handleDistrictSelect(item)} activeOpacity={0.7}>
                                    <Text style={[styles.pickerItemText, form.ilce === item.ad && { color: C.primary }]}>{item.ad}</Text>
                                    {form.ilce === item.ad && <Ionicons name="checkmark" size={18} color={C.primary} />}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={<Text style={styles.pickerEmpty}>{loadingIlceler ? 'Yükleniyor...' : 'İlçe bulunamadı'}</Text>}
                        />
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
    content:{ padding: 16, gap: 10, paddingBottom: 100 },

    empty:      { alignItems: 'center', paddingVertical: 60, gap: 8 },
    emptyIcon:  { fontSize: 48 },
    emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
    emptySub:   { color: C.textMuted, fontSize: 13 },

    card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
    cardIcon:    { width: 44, height: 44, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
    cardTitle:   { color: C.text, fontSize: 15, fontWeight: '700' },
    cardAddr:    { color: C.textMuted, fontSize: 12, marginTop: 2 },
    cardCity:    { color: C.textMuted, fontSize: 11, marginTop: 2 },
    cardActions: { flexDirection: 'row', gap: 4 },
    actionBtn:   { padding: 6 },

    addBarWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 28, backgroundColor: C.background, borderTopWidth: 1, borderTopColor: C.border },
    addBar:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    addBarText: { color: C.darker, fontWeight: '800', fontSize: 16 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
    modalSheet:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '88%' },
    modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle:   { color: C.text, fontSize: 20, fontWeight: '800' },

    inputLabel: { color: C.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
    input: {
        backgroundColor: C.surface, color: C.text, borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
        borderWidth: 1, borderColor: C.border,
    },
    pickerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pickerText:       { color: C.text, fontSize: 15 },
    pickerPlaceholder:{ color: C.textMuted, fontSize: 15 },

    modalActions:  { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 8 },
    cancelBtn:     { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: C.border },
    cancelBtnText: { color: C.textMuted, fontWeight: '700', fontSize: 15 },
    saveBtn:       { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 12, backgroundColor: C.primary },
    saveBtnText:   { color: C.darker, fontWeight: '800', fontSize: 15 },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    pickerSheet:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' },
    pickerHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
    pickerTitle:   { color: C.text, fontSize: 17, fontWeight: '800' },
    pickerSearch:  { backgroundColor: C.surface, borderRadius: 12, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border },
    pickerItem:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border + '66' },
    pickerItemActive:{ backgroundColor: C.primary + '12' },
    pickerItemText:  { color: C.text, fontSize: 15 },
    pickerEmpty:     { color: C.textMuted, textAlign: 'center', paddingVertical: 32 },
});
