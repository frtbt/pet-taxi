import { useState, useCallback } from 'react';
import {
    View, Text, FlatList, StyleSheet, TouchableOpacity,
    Modal, TextInput, Alert, ActivityIndicator, ScrollView,
    KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import taxiApi from '../../src/api/taxiClient';
import Colors from '../../src/theme/colors';

const GENDERS = ['male', 'female'];

export default function DogsScreen() {
    const [dogs, setDogs]         = useState([]);
    const [loading, setLoading]   = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [saving, setSaving]     = useState(false);

    // Form state
    const [name, setName]         = useState('');
    const [breed, setBreed]       = useState('');
    const [age, setAge]           = useState('');
    const [weight, setWeight]     = useState('');
    const [gender, setGender]     = useState('male');
    const [notes, setNotes]       = useState('');

    async function load() {
        setLoading(true);
        const res = await taxiApi.getMyDogs();
        setDogs(res.dogs ?? []);
        setLoading(false);
    }

    useFocusEffect(useCallback(() => { load(); }, []));

    function openAdd() {
        setName(''); setBreed(''); setAge(''); setWeight('');
        setGender('male'); setNotes('');
        setModalVisible(true);
    }

    async function handleSave() {
        if (!name.trim()) {
            Alert.alert('Hata', 'Köpek adı gereklidir.');
            return;
        }
        setSaving(true);
        const res = await taxiApi.addDog({
            isim:     name.trim(),
            irk:      breed.trim() || undefined,
            yas:      age ? Number(age) : undefined,
            kilo:     weight ? Number(weight) : undefined,
            cinsiyet: gender === 'male' ? 'erkek' : 'disi',
            notlar:   notes.trim() || undefined,
        });
        setSaving(false);
        if (res.success) {
            setModalVisible(false);
            load();
        } else {
            Alert.alert('Hata', res.error ?? 'Köpek eklenemedi.');
        }
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <FlatList
                data={dogs}
                keyExtractor={item => String(item.id)}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Ionicons name="paw-outline" size={56} color={Colors.textMuted} />
                        <Text style={styles.emptyTitle}>Henüz köpek eklenmedi</Text>
                        <Text style={styles.emptySub}>Taksi talebi oluşturmak için en az bir köpek ekleyin.</Text>
                    </View>
                }
                renderItem={({ item }) => <DogCard dog={item} />}
            />

            <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
                <Ionicons name="add" size={24} color={Colors.darker} />
                <Text style={styles.fabText}>Köpek Ekle</Text>
            </TouchableOpacity>

            {/* Add Dog Modal */}
            <Modal
                visible={modalVisible}
                animationType="slide"
                transparent
                onRequestClose={() => setModalVisible(false)}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalSheet}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Köpek Ekle</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                            <FormField label="Ad *" value={name} onChangeText={setName} placeholder="Ör: Max" />
                            <FormField label="Irk" value={breed} onChangeText={setBreed} placeholder="Ör: Labrador" />

                            <View style={styles.rowFields}>
                                <View style={{ flex: 1 }}>
                                    <FormField label="Yaş" value={age} onChangeText={setAge} placeholder="3" keyboardType="numeric" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <FormField label="Ağırlık (kg)" value={weight} onChangeText={setWeight} placeholder="25.5" keyboardType="decimal-pad" />
                                </View>
                            </View>

                            {/* Cinsiyet seçimi */}
                            <Text style={styles.fieldLabel}>Cinsiyet</Text>
                            <View style={styles.genderRow}>
                                {GENDERS.map(g => (
                                    <TouchableOpacity
                                        key={g}
                                        style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
                                        onPress={() => setGender(g)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.genderEmoji}>{g === 'male' ? '♂️' : '♀️'}</Text>
                                        <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
                                            {g === 'male' ? 'Erkek' : 'Dişi'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <FormField
                                label="Notlar"
                                value={notes}
                                onChangeText={setNotes}
                                placeholder="Aşılar, özel durumlar..."
                                multiline
                                numberOfLines={3}
                            />

                            <TouchableOpacity
                                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                                onPress={handleSave}
                                disabled={saving}
                                activeOpacity={0.85}
                            >
                                {saving
                                    ? <ActivityIndicator color={Colors.darker} />
                                    : <Text style={styles.saveBtnText}>Kaydet</Text>
                                }
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

function DogCard({ dog }) {
    const isMale = dog.cinsiyet === 'erkek';
    return (
        <View style={styles.card}>
            <View style={styles.cardAvatar}>
                <Text style={styles.cardAvatarEmoji}>🐕</Text>
            </View>
            <View style={styles.cardBody}>
                <Text style={styles.cardName}>{dog.isim}</Text>
                {dog.irk ? <Text style={styles.cardBreed}>{dog.irk}</Text> : null}
                <View style={styles.cardMeta}>
                    {dog.yas  ? <MetaChip icon="calendar-outline" text={`${dog.yas} yaş`} /> : null}
                    {dog.kilo ? <MetaChip icon="barbell-outline"  text={`${dog.kilo} kg`} /> : null}
                    <MetaChip
                        icon={isMale ? 'male-outline' : 'female-outline'}
                        text={isMale ? 'Erkek' : 'Dişi'}
                    />
                </View>
                {dog.notlar ? <Text style={styles.cardNote} numberOfLines={2}>{dog.notlar}</Text> : null}
            </View>
        </View>
    );
}

function MetaChip({ icon, text }) {
    return (
        <View style={styles.chip}>
            <Ionicons name={icon} size={12} color={Colors.textMuted} />
            <Text style={styles.chipText}>{text}</Text>
        </View>
    );
}

function FormField({ label, ...props }) {
    return (
        <>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
                style={[styles.input, props.multiline && styles.inputMulti]}
                placeholderTextColor={Colors.textMuted}
                {...props}
            />
        </>
    );
}

const styles = StyleSheet.create({
    root:   { flex: 1, backgroundColor: Colors.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
    list:   { padding: 16, gap: 12, paddingBottom: 100 },

    empty:      { alignItems: 'center', paddingVertical: 60, gap: 10 },
    emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
    emptySub:   { color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

    card:       { backgroundColor: Colors.card, borderRadius: 16, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    cardAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary + '22', justifyContent: 'center', alignItems: 'center' },
    cardAvatarEmoji: { fontSize: 28 },
    cardBody:   { flex: 1, gap: 4 },
    cardName:   { color: Colors.text, fontSize: 17, fontWeight: '800' },
    cardBreed:  { color: Colors.textMuted, fontSize: 13 },
    cardMeta:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    cardNote:   { color: Colors.textMuted, fontSize: 12, marginTop: 4, fontStyle: 'italic' },

    chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border },
    chipText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },

    fab: {
        position: 'absolute', bottom: 20, right: 20, left: 20,
        backgroundColor: Colors.primary, borderRadius: 14,
        paddingVertical: 15, flexDirection: 'row',
        justifyContent: 'center', alignItems: 'center', gap: 8, elevation: 6,
    },
    fabText: { color: Colors.darker, fontWeight: '800', fontSize: 16 },

    // Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet:   { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
    modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle:   { color: Colors.text, fontSize: 20, fontWeight: '800' },

    rowFields: { flexDirection: 'row', gap: 12 },
    fieldLabel: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
    input: {
        backgroundColor: Colors.surface, borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 12,
        color: Colors.text, fontSize: 15,
        borderWidth: 1, borderColor: Colors.border,
    },
    inputMulti: { minHeight: 80, textAlignVertical: 'top' },

    genderRow:        { flexDirection: 'row', gap: 12, marginBottom: 4 },
    genderBtn:        { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface },
    genderBtnActive:  { borderColor: Colors.primary, backgroundColor: Colors.primary + '18' },
    genderEmoji:      { fontSize: 22, marginBottom: 4 },
    genderText:       { color: Colors.textMuted, fontWeight: '600', fontSize: 13 },
    genderTextActive: { color: Colors.primary },

    saveBtn:     { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24, marginBottom: 8 },
    saveBtnText: { color: Colors.darker, fontWeight: '800', fontSize: 16 },
});
