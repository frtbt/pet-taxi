import { View, Text, StyleSheet } from 'react-native';
import Colors from '../theme/colors';

const STATUS_MAP = {
    bekliyor:     { label: 'Bekliyor',     bg: Colors.warning  + '22', border: Colors.warning,  text: Colors.warning },
    eslesti:      { label: 'Eşleşti',      bg: Colors.info     + '22', border: Colors.info,     text: Colors.info },
    basladi:      { label: 'Yolda',        bg: '#8b5cf622',            border: '#8b5cf6',        text: '#8b5cf6' },
    tamamlandi:   { label: 'Tamamlandı',   bg: Colors.success  + '22', border: Colors.success,  text: Colors.success },
    iptal:        { label: 'İptal Edildi', bg: Colors.danger   + '22', border: Colors.danger,   text: Colors.danger },
    kabul_edildi: { label: 'Kabul Edildi', bg: Colors.info     + '22', border: Colors.info,     text: Colors.info },
    devam_ediyor: { label: 'Devam Ediyor', bg: '#8b5cf622',            border: '#8b5cf6',        text: '#8b5cf6' },
};

export function StatusBadge({ durum, style }) {
    const s = STATUS_MAP[durum] ?? { label: durum, bg: Colors.surface, border: Colors.border, text: Colors.textMuted };
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
