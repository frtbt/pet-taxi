import { useState, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, StyleSheet, TouchableOpacity,
    Modal, TextInput, Alert, ActivityIndicator, ScrollView,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import taxiApi from '../../src/api/taxiClient';
import { useTheme } from '../../src/context/ThemeContext';

const HUYLULAR = [
    { val: 'sakin',    label: 'Sakin',    emoji: '😌' },
    { val: 'enerjik',  label: 'Enerjik',  emoji: '⚡' },
    { val: 'endiseli', label: 'Endişeli', emoji: '😟' },
    { val: 'agresif',  label: 'Agresif',  emoji: '⚠️' },
];

const EMPTY_FORM = {
    isim: '', tur: 'kopek', tur_id: 1,
    irk: '', yas: '', kilo: '', cinsiyet: 'erkek',
    notlar: '', huylu: 'sakin', asili: true, saglik_notu: '', surucu_notu: '',
    mikrocip_no: '', kuduz_asi_tarihi: '', karma_asi_tarihi: '',
};

function toDisplayDate(dbDate) {
    if (!dbDate) return '';
    const d = dbDate.substring(0, 10).split('-');
    if (d.length !== 3) return dbDate;
    return `${d[2]}.${d[1]}.${d[0]}`;
}

function toDbDate(display) {
    if (!display) return null;
    const parts = display.replace(/\s/g, '').split('.');
    if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
    return null;
}

export default function DogsScreen() {
    const { returnTo } = useLocalSearchParams();
    const router = useRouter();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);

    const [animals, setAnimals]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingAnimal, setEditingAnimal] = useState(null);
    const [saving, setSaving]     = useState(false);
    const [form, setForm]         = useState(EMPTY_FORM);

    const [turler, setTurler]           = useState([]);
    const [cinsleri, setCinsleri]       = useState([]);
    const [loadingTurler, setLoadingTurler]   = useState(false);
    const [loadingCinsleri, setLoadingCinsleri] = useState(false);
    const [turPickerVisible, setTurPickerVisible]   = useState(false);
    const [cinsPickerVisible, setCinsPickerVisible] = useState(false);
    const [cinsSearch, setCinsSearch]   = useState('');

    async function load() {
        setLoading(true);
        const res = await taxiApi.getMyDogs();
        setAnimals(res.dogs ?? []);
        setLoading(false);
    }

    useFocusEffect(useCallback(() => { load(); }, []));

    async function loadTurler() {
        if (turler.length > 0) return turler;
        setLoadingTurler(true);
        const res = await taxiApi.getPetTurleri();
        const list = res.turleri ?? [];
        setTurler(list);
        setLoadingTurler(false);
        return list;
    }

    async function loadCinsleri(turId) {
        setCinsleri([]);
        setLoadingCinsleri(true);
        const res = await taxiApi.getPetCinsleri(turId);
        setCinsleri(res.cinsleri ?? []);
        setLoadingCinsleri(false);
    }

    async function openAdd() {
        setEditingAnimal(null);
        setForm(EMPTY_FORM);
        setCinsleri([]);
        const tl = await loadTurler();
        const kopekTur = tl.find(t => t.slug === 'kopek') ?? tl[0];
        if (kopekTur) {
            setForm(f => ({ ...f, tur: kopekTur.slug, tur_id: kopekTur.id }));
            loadCinsleri(kopekTur.id);
        }
        setModalVisible(true);
    }

    async function openEdit(animal) {
        setEditingAnimal(animal);
        const tl = await loadTurler();
        const matchedTur = tl.find(t => t.slug === animal.tur) ?? tl[0];
        setForm({
            isim:             animal.isim ?? '',
            tur:              matchedTur?.slug ?? 'kopek',
            tur_id:           matchedTur?.id ?? 1,
            irk:              animal.irk ?? '',
            yas:              animal.yas ? String(animal.yas) : '',
            kilo:             animal.kilo ? String(animal.kilo) : '',
            cinsiyet:         animal.cinsiyet ?? 'erkek',
            notlar:           animal.notlar ?? '',
            huylu:            animal.huylu ?? 'sakin',
            asili:            animal.asili == null ? true : Boolean(Number(animal.asili)),
            saglik_notu:      animal.saglik_notu ?? '',
            surucu_notu:      animal.surucu_notu ?? '',
            mikrocip_no:      animal.mikrocip_no ?? '',
            kuduz_asi_tarihi: toDisplayDate(animal.kuduz_asi_tarihi),
            karma_asi_tarihi: toDisplayDate(animal.karma_asi_tarihi),
        });
        setCinsleri([]);
        if (matchedTur) loadCinsleri(matchedTur.id);
        setModalVisible(true);
    }

    async function handleTurSelect(tur) {
        setForm(f => ({ ...f, tur: tur.slug, tur_id: tur.id, irk: '' }));
        setTurPickerVisible(false);
        loadCinsleri(tur.id);
    }

    function setF(key, val) { setForm(f => ({ ...f, [key]: val })); }

    async function handleSave() {
        if (!form.isim.trim()) { Alert.alert('Hata', 'Hayvan adı gereklidir.'); return; }
        setSaving(true);

        const yasNum  = form.yas  ? Number(form.yas)  : undefined;
        const kiloNum = form.kilo ? Number(form.kilo) : undefined;
        if (yasNum  !== undefined && isNaN(yasNum))  { Alert.alert('Hata', 'Yaş geçerli bir sayı olmalıdır.'); setSaving(false); return; }
        if (kiloNum !== undefined && isNaN(kiloNum)) { Alert.alert('Hata', 'Kilo geçerli bir sayı olmalıdır.'); setSaving(false); return; }

        const kuduzDb = toDbDate(form.kuduz_asi_tarihi);
        const karmaDb = toDbDate(form.karma_asi_tarihi);

        const payload = {
            isim:             form.isim.trim(),
            tur:              form.tur,
            irk:              form.irk.trim() || undefined,
            yas:              yasNum,
            kilo:             kiloNum,
            cinsiyet:         form.cinsiyet,
            notlar:           form.notlar.trim() || undefined,
            huylu:            form.huylu || undefined,
            asili:            form.asili ? 1 : 0,
            saglik_notu:      form.saglik_notu.trim() || undefined,
            surucu_notu:      form.surucu_notu.trim() || undefined,
            mikrocip_no:      form.mikrocip_no.trim() || undefined,
            kuduz_asi_tarihi: kuduzDb || undefined,
            karma_asi_tarihi: karmaDb || undefined,
        };

        let res;
        if (editingAnimal) {
            res = await taxiApi.post('update_dog', { ...payload, id: editingAnimal.id });
        } else {
            res = await taxiApi.addDog(payload);
        }

        setSaving(false);
        if (res.success) {
            setModalVisible(false);
            load();
            if (!editingAnimal && returnTo) {
                setTimeout(() => router.push(returnTo), 300);
            }
        } else {
            Alert.alert('Hata', res.error ?? 'Kaydedilemedi.');
        }
    }

    async function handleDelete(animal) {
        Alert.alert('Hayvanı Sil', `${animal.isim} silinsin mi?`, [
            { text: 'İptal', style: 'cancel' },
            { text: 'Sil', style: 'destructive', onPress: async () => {
                const res = await taxiApi.post('delete_dog', { id: animal.id });
                if (res.success) {
                    load();
                } else {
                    Alert.alert('Hata', res.error ?? 'Hayvan silinemedi.');
                }
            }},
        ]);
    }

    const selectedTur  = turler.find(t => t.id === form.tur_id);
    const filteredCins = cinsleri.filter(c => c.ad.toLowerCase().includes(cinsSearch.toLowerCase()));

    if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>;

    return (
        <View style={styles.root}>
            <FlatList
                data={animals}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={styles.emptyEmoji}>🐾</Text>
                        <Text style={styles.emptyTitle}>Henüz hayvan eklenmedi</Text>
                        <Text style={styles.emptySub}>Taksi talebi oluşturmak için en az bir hayvan ekleyin.</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <AnimalCard
                        C={C}
                        styles={styles}
                        animal={item}
                        turler={turler}
                        onEdit={() => openEdit(item)}
                        onDelete={() => handleDelete(item)}
                    />
                )}
            />

            <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
                <Ionicons name="add" size={24} color={C.darker} />
                <Text style={styles.fabText}>Hayvan Ekle</Text>
            </TouchableOpacity>

            <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editingAnimal ? 'Hayvanı Düzenle' : 'Hayvan Ekle'}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            <SectionLabel styles={styles}>Hayvan Bilgileri</SectionLabel>

                            <Text style={styles.fieldLabel}>Hayvan Türü</Text>
                            <TouchableOpacity
                                style={[styles.pickerRow, styles.input]}
                                onPress={() => setTurPickerVisible(true)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.pickerRowText}>
                                    {selectedTur ? `${selectedTur.emoji} ${selectedTur.ad}` : '🐾 Tür seçin...'}
                                </Text>
                                {loadingTurler
                                    ? <ActivityIndicator size="small" color={C.primary} />
                                    : <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                                }
                            </TouchableOpacity>

                            <Text style={styles.fieldLabel}>Ad *</Text>
                            <TextInput style={styles.input} value={form.isim} onChangeText={v => setF('isim', v)} placeholder="Ör: Max" placeholderTextColor={C.textMuted} />

                            <Text style={styles.fieldLabel}>Cins</Text>
                            <TouchableOpacity
                                style={[styles.pickerRow, styles.input]}
                                onPress={() => { setCinsSearch(''); setCinsPickerVisible(true); }}
                                activeOpacity={0.8}
                            >
                                <Text style={form.irk ? styles.pickerRowText : styles.pickerRowPlaceholder}>
                                    {form.irk || 'Cins seçin...'}
                                </Text>
                                {loadingCinsleri
                                    ? <ActivityIndicator size="small" color={C.primary} />
                                    : <Ionicons name="chevron-down" size={16} color={C.textMuted} />
                                }
                            </TouchableOpacity>
                            {form.irk ? (
                                <TouchableOpacity onPress={() => setF('irk', '')} style={styles.clearCins}>
                                    <Text style={styles.clearCinsText}>✕ Cinsi temizle</Text>
                                </TouchableOpacity>
                            ) : null}

                            <View style={styles.rowFields}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.fieldLabel}>Yaş</Text>
                                    <TextInput style={styles.input} value={form.yas} onChangeText={v => setF('yas', v)} placeholder="3" keyboardType="numeric" placeholderTextColor={C.textMuted} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.fieldLabel}>Ağırlık (kg)</Text>
                                    <TextInput style={styles.input} value={form.kilo} onChangeText={v => setF('kilo', v)} placeholder="5.0" keyboardType="decimal-pad" placeholderTextColor={C.textMuted} />
                                </View>
                            </View>

                            <Text style={styles.fieldLabel}>Cinsiyet</Text>
                            <View style={styles.genderRow}>
                                {[{ val: 'erkek', label: 'Erkek', emoji: '♂️' }, { val: 'disi', label: 'Dişi', emoji: '♀️' }].map(g => (
                                    <TouchableOpacity key={g.val} style={[styles.genderBtn, form.cinsiyet === g.val && styles.genderBtnActive]} onPress={() => setF('cinsiyet', g.val)} activeOpacity={0.8}>
                                        <Text style={styles.genderEmoji}>{g.emoji}</Text>
                                        <Text style={[styles.genderText, form.cinsiyet === g.val && styles.genderTextActive]}>{g.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <SectionLabel styles={styles}>Davranış & Sağlık</SectionLabel>

                            <Text style={styles.fieldLabel}>Huyu</Text>
                            <View style={styles.huyRow}>
                                {HUYLULAR.map(h => (
                                    <TouchableOpacity key={h.val} style={[styles.huyBtn, form.huylu === h.val && styles.huyBtnActive]} onPress={() => setF('huylu', h.val)} activeOpacity={0.8}>
                                        <Text style={styles.huyEmoji}>{h.emoji}</Text>
                                        <Text style={[styles.huyText, form.huylu === h.val && styles.huyTextActive]}>{h.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.fieldLabel}>Aşı Durumu</Text>
                            <View style={styles.genderRow}>
                                {[{ val: true, label: '✅ Aşılı' }, { val: false, label: '❌ Aşısız' }].map(o => (
                                    <TouchableOpacity key={String(o.val)} style={[styles.genderBtn, form.asili === o.val && styles.genderBtnActive]} onPress={() => setF('asili', o.val)} activeOpacity={0.8}>
                                        <Text style={[styles.genderText, form.asili === o.val && styles.genderTextActive]}>{o.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.fieldLabel}>📡 Mikroçip No</Text>
                            <TextInput style={styles.input} value={form.mikrocip_no} onChangeText={v => setF('mikrocip_no', v)} placeholder="PETVET mikroçip numarası" placeholderTextColor={C.textMuted} />

                            <Text style={styles.fieldLabel}>💉 Kuduz Aşı Tarihi</Text>
                            <TextInput style={styles.input} value={form.kuduz_asi_tarihi} onChangeText={v => setF('kuduz_asi_tarihi', v)} placeholder="GG.AA.YYYY" keyboardType="numeric" placeholderTextColor={C.textMuted} />

                            <Text style={styles.fieldLabel}>💉 Karma Aşı Tarihi</Text>
                            <TextInput style={styles.input} value={form.karma_asi_tarihi} onChangeText={v => setF('karma_asi_tarihi', v)} placeholder="GG.AA.YYYY" keyboardType="numeric" placeholderTextColor={C.textMuted} />

                            <Text style={styles.fieldLabel}>Sağlık Notu</Text>
                            <TextInput style={[styles.input, styles.inputMulti]} value={form.saglik_notu} onChangeText={v => setF('saglik_notu', v)} placeholder="Alerjiler, ilaçlar, özel durumlar..." placeholderTextColor={C.textMuted} multiline numberOfLines={2} />

                            <SectionLabel styles={styles}>Sürücüye Özel Not</SectionLabel>

                            <Text style={styles.fieldLabel}>Sürücüye Not</Text>
                            <TextInput style={[styles.input, styles.inputMulti]} value={form.surucu_notu} onChangeText={v => setF('surucu_notu', v)} placeholder="Ör: araç tutulması yaşıyor, yolda su vermek gerekiyor..." placeholderTextColor={C.textMuted} multiline numberOfLines={2} />

                            <Text style={styles.fieldLabel}>Genel Notlar</Text>
                            <TextInput style={[styles.input, styles.inputMulti]} value={form.notlar} onChangeText={v => setF('notlar', v)} placeholder="Diğer önemli bilgiler..." placeholderTextColor={C.textMuted} multiline numberOfLines={2} />

                            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                                {saving ? <ActivityIndicator color={C.darker} /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <Modal visible={turPickerVisible} transparent animationType="slide" onRequestClose={() => setTurPickerVisible(false)}>
                <View style={styles.pickerOverlay}>
                    <View style={styles.pickerSheet}>
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>Hayvan Türü Seç</Text>
                            <TouchableOpacity onPress={() => setTurPickerVisible(false)}>
                                <Ionicons name="close" size={24} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        {loadingTurler
                            ? <ActivityIndicator color={C.primary} style={{ padding: 32 }} />
                            : turler.map(tur => (
                                <TouchableOpacity
                                    key={tur.id}
                                    style={[styles.pickerItem, form.tur_id === tur.id && styles.pickerItemActive]}
                                    onPress={() => handleTurSelect(tur)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.pickerItemEmoji}>{tur.emoji}</Text>
                                    <Text style={[styles.pickerItemText, form.tur_id === tur.id && { color: C.primary, fontWeight: '700' }]}>{tur.ad}</Text>
                                    {form.tur_id === tur.id && <Ionicons name="checkmark" size={18} color={C.primary} />}
                                </TouchableOpacity>
                            ))
                        }
                    </View>
                </View>
            </Modal>

            <Modal visible={cinsPickerVisible} transparent animationType="slide" onRequestClose={() => setCinsPickerVisible(false)}>
                <View style={styles.pickerOverlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.pickerSheet}>
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerTitle}>Cins Seç</Text>
                            <TouchableOpacity onPress={() => setCinsPickerVisible(false)}>
                                <Ionicons name="close" size={24} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={styles.cinsSearch}
                            value={cinsSearch}
                            onChangeText={setCinsSearch}
                            placeholder="Cins ara..."
                            placeholderTextColor={C.textMuted}
                        />
                        {loadingCinsleri ? (
                            <ActivityIndicator color={C.primary} style={{ padding: 32 }} />
                        ) : (
                            <FlatList
                                data={filteredCins}
                                keyExtractor={item => String(item.id)}
                                keyboardShouldPersistTaps="handled"
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[styles.pickerItem, form.irk === item.ad && styles.pickerItemActive]}
                                        onPress={() => { setF('irk', item.ad); setCinsPickerVisible(false); setCinsSearch(''); }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.pickerItemText, form.irk === item.ad && { color: C.primary, fontWeight: '700' }]}>{item.ad}</Text>
                                        {form.irk === item.ad && <Ionicons name="checkmark" size={18} color={C.primary} />}
                                    </TouchableOpacity>
                                )}
                                ListEmptyComponent={
                                    <Text style={styles.pickerEmpty}>
                                        {cinsleri.length === 0 ? 'Bu tür için cins bulunamadı' : 'Cins bulunamadı'}
                                    </Text>
                                }
                            />
                        )}
                    </KeyboardAvoidingView>
                </View>
            </Modal>
        </View>
    );
}

function AnimalCard({ C, styles, animal, turler, onEdit, onDelete }) {
    const isMale = animal.cinsiyet === 'erkek';
    const huy    = HUYLULAR.find(h => h.val === animal.huylu);
    const tur    = turler.find(t => t.slug === animal.tur);
    const emoji  = tur?.emoji ?? '🐾';

    return (
        <View style={styles.card}>
            <View style={styles.cardAvatar}>
                <Text style={styles.cardAvatarEmoji}>{emoji}</Text>
            </View>
            <View style={styles.cardBody}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.cardName}>{animal.isim}</Text>
                        <Text style={styles.cardBreed}>
                            {[tur?.ad, animal.irk].filter(Boolean).join(' · ')}
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="create-outline" size={18} color={C.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={C.danger} />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.cardMeta}>
                    {animal.yas  ? <MetaChip styles={styles} C={C} icon="calendar-outline" text={`${animal.yas} yaş`} /> : null}
                    {animal.kilo ? <MetaChip styles={styles} C={C} icon="barbell-outline"  text={`${animal.kilo} kg`}  /> : null}
                    <MetaChip styles={styles} C={C} icon={isMale ? 'male-outline' : 'female-outline'} text={isMale ? 'Erkek' : 'Dişi'} />
                    {huy ? <MetaChip styles={styles} C={C} text={`${huy.emoji} ${huy.label}`} /> : null}
                    {animal.asili != null && <MetaChip styles={styles} C={C} text={Number(animal.asili) ? '✅ Aşılı' : '❌ Aşısız'} />}
                    <MetaChip styles={styles} C={C} text={animal.mikrocip_no ? `📡 ${animal.mikrocip_no}` : '📡 Mikroçip eksik'} />
                </View>
                {animal.surucu_notu ? (
                    <View style={styles.driverNote}>
                        <Ionicons name="information-circle-outline" size={13} color={C.primary} />
                        <Text style={styles.driverNoteText} numberOfLines={2}>{animal.surucu_notu}</Text>
                    </View>
                ) : null}
                {animal.notlar && !animal.surucu_notu ? <Text style={styles.cardNote} numberOfLines={2}>{animal.notlar}</Text> : null}
            </View>
        </View>
    );
}

function SectionLabel({ styles, children }) {
    return <Text style={styles.sectionLabel}>{children}</Text>;
}

function MetaChip({ styles, C, icon, text }) {
    return (
        <View style={styles.chip}>
            {icon ? <Ionicons name={icon} size={12} color={C.textMuted} /> : null}
            <Text style={styles.chipText}>{text}</Text>
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
    list:   { padding: 16, gap: 12, paddingBottom: 100 },

    empty:      { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyEmoji: { fontSize: 52 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
    emptySub:   { color: C.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

    card:       { backgroundColor: C.card, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'flex-start', borderWidth: 1, borderColor: C.border },
    cardAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary + '22', justifyContent: 'center', alignItems: 'center' },
    cardAvatarEmoji: { fontSize: 28 },
    cardBody:   { flex: 1, gap: 4 },
    cardName:   { color: C.text, fontSize: 17, fontWeight: '800' },
    cardBreed:  { color: C.textMuted, fontSize: 13 },
    cardMeta:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    cardNote:   { color: C.textMuted, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
    driverNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, backgroundColor: C.primary + '18', borderRadius: 8, padding: 8, marginTop: 6 },
    driverNoteText: { color: C.primary, fontSize: 12, flex: 1 },

    chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.border },
    chipText: { color: C.textMuted, fontSize: 11, fontWeight: '600' },

    fab:     { position: 'absolute', bottom: 20, right: 20, left: 20, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, elevation: 6 },
    fabText: { color: C.darker, fontWeight: '800', fontSize: 16 },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '92%' },
    modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle:   { color: C.text, fontSize: 20, fontWeight: '800' },
    sectionLabel: { color: C.primary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 4 },

    rowFields:  { flexDirection: 'row', gap: 12 },
    fieldLabel: { color: C.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
    input:      { backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border },
    inputMulti: { minHeight: 70, textAlignVertical: 'top' },

    pickerRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pickerRowText:       { color: C.text, fontSize: 15 },
    pickerRowPlaceholder:{ color: C.textMuted, fontSize: 15 },
    clearCins:           { marginTop: 4 },
    clearCinsText:       { color: C.textMuted, fontSize: 12, textDecorationLine: 'underline' },

    genderRow:        { flexDirection: 'row', gap: 12, marginBottom: 4 },
    genderBtn:        { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: C.border, backgroundColor: C.surface },
    genderBtnActive:  { borderColor: C.primary, backgroundColor: C.primary + '18' },
    genderEmoji:      { fontSize: 22, marginBottom: 4 },
    genderText:       { color: C.textMuted, fontWeight: '600', fontSize: 13 },
    genderTextActive: { color: C.primary },

    huyRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
    huyBtn:       { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 2, borderColor: C.border, backgroundColor: C.surface, gap: 4 },
    huyBtnActive: { borderColor: C.primary, backgroundColor: C.primary + '18' },
    huyEmoji:     { fontSize: 20 },
    huyText:      { color: C.textMuted, fontWeight: '600', fontSize: 12 },
    huyTextActive:{ color: C.primary },

    saveBtn:     { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24, marginBottom: 8 },
    saveBtnText: { color: C.darker, fontWeight: '800', fontSize: 16 },

    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    pickerSheet:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '72%' },
    pickerHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
    pickerTitle:   { color: C.text, fontSize: 17, fontWeight: '800' },
    cinsSearch:    { backgroundColor: C.surface, borderRadius: 12, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.border },
    pickerItem:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border + '66' },
    pickerItemActive:{ backgroundColor: C.primary + '12' },
    pickerItemEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
    pickerItemText:  { flex: 1, color: C.text, fontSize: 15 },
    pickerEmpty:     { color: C.textMuted, textAlign: 'center', paddingVertical: 32, fontSize: 14 },
});
