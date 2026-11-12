import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const STATUS_MAP = {
    bekliyor:     { label: 'Bekliyor',     bg: '#f59e0b22', border: '#f59e0b', text: '#f59e0b' },
    eslesti:      { label: 'Eşleşti',      bg: '#60a5fa22', border: '#60a5fa', text: '#60a5fa' },
    basladi:      { label: 'Yolda',        bg: '#8b5cf622', border: '#8b5cf6', text: '#8b5cf6' },
    tamamlandi:   { label: 'Tamamlandı',   bg: '#22c55e22', border: '#22c55e', text: '#22c55e' },
    iptal:        { label: 'İptal Edildi', bg: '#ef444422', border: '#ef4444', text: '#ef4444' },
    kabul_edildi: { label: 'Kabul Edildi', bg: '#60a5fa22', border: '#60a5fa', text: '#60a5fa' },
    devam_ediyor: { label: 'Devam Ediyor', bg: '#8b5cf622', border: '#8b5cf6', text: '#8b5cf6' },
};

export function StatusBadge({ durum, style }) {
    const { colors: C } = useTheme();
    const s = STATUS_MAP[durum] ?? {
        label: durum,
        bg: C.surface,
        border: C.border,
        text: C.textMuted,
    };
    return (
        <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border }, style]}>
            <Text style={[styles.text, { color: s.text }]}>{s.label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
    text:  { fontSize: 12, fontWeight: '700' },
});
