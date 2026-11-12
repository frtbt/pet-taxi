import { useState, useEffect, useMemo } from 'react';
import {
    View, Text, StyleSheet,
    TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/context/ThemeContext';
import taxiApi from '../src/api/taxiClient';

function buildHtml(icerik, isDark) {
    const bg   = isDark ? '#1a1a1a' : '#ffffff';
    const text = isDark ? '#e5e5e5' : '#1a1a1a';
    const muted = isDark ? '#9ca3af' : '#6b7280';
    const border = isDark ? '#374151' : '#e5e7eb';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: ${bg}; color: ${text};
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 15px; line-height: 1.75;
  }
  body { padding: 20px 20px 48px; }
  h1 { font-size: 1.5em; font-weight: 800; margin: 1.2em 0 .5em; }
  h2 { font-size: 1.25em; font-weight: 700; margin: 1.1em 0 .4em; }
  h3 { font-size: 1.1em; font-weight: 700; margin: 1em 0 .3em; }
  p  { margin: 0 0 .9em; }
  ul, ol { margin: .4em 0 .9em; padding-left: 1.5em; }
  li { margin-bottom: .3em; }
  strong, b { font-weight: 700; }
  em, i { font-style: italic; }
  blockquote {
    border-left: 3px solid ${border}; margin: .8em 0;
    padding: .4em 0 .4em 1em; color: ${muted};
  }
  hr { border: none; border-top: 1px solid ${border}; margin: 1.2em 0; }
  a  { color: #f59e0b; }
  code {
    font-family: 'Menlo', 'Courier New', monospace;
    background: ${isDark ? '#374151' : '#f3f4f6'};
    padding: 2px 5px; border-radius: 4px; font-size: .9em;
  }
  .ql-align-center { text-align: center; }
  .ql-align-right  { text-align: right; }
  .ql-size-small  { font-size: .85em; }
  .ql-size-large  { font-size: 1.2em; }
  .ql-size-huge   { font-size: 1.5em; }
</style>
</head>
<body>${icerik || ''}</body>
</html>`;
}

export default function ContractScreen() {
    const { colors: C, isDark } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const router = useRouter();

    const [contract, setContract] = useState(null);
    const [loading, setLoading]   = useState(true);
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        taxiApi.getContract()
            .then(r => setContract(r.contract ?? null))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const handleAccept = async () => {
        if (!contract) return;
        setAccepting(true);
        try {
            await taxiApi.acceptContract(contract.surum);
            await taxiApi.markNotificationsRead();
            Alert.alert('Teşekkürler', 'Kullanım koşullarını onayladınız.', [
                { text: 'Tamam', onPress: () => router.back() },
            ]);
        } catch {
            Alert.alert('Hata', 'Kabul işlemi sırasında bir sorun oluştu. Lütfen tekrar deneyin.');
        } finally {
            setAccepting(false);
        }
    };

    const html = contract ? buildHtml(contract.icerik, !!isDark) : '';

    return (
        <View style={s.root}>
            {/* Header */}
            <View style={[s.header, { borderBottomColor: C.border }]}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color={C.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={[s.title, { color: C.text }]}>Kullanım Koşulları</Text>
                    {contract && (
                        <Text style={[s.subtitle, { color: C.textMuted }]}>
                            v{contract.surum}  ·  {new Date(contract.yururluk_tarihi).toLocaleDateString('tr-TR')}
                        </Text>
                    )}
                </View>
            </View>

            {loading ? (
                <View style={s.center}>
                    <ActivityIndicator size="large" color={C.primary} />
                </View>
            ) : !contract ? (
                <View style={s.center}>
                    <Ionicons name="document-text-outline" size={48} color={C.border} />
                    <Text style={[s.emptyText, { color: C.textMuted }]}>Sözleşme bulunamadı</Text>
                </View>
            ) : (
                <>
                    <WebView
                        style={{ flex: 1, backgroundColor: C.background }}
                        source={{ html }}
                        originWhitelist={['*']}
                        scrollEnabled
                        showsVerticalScrollIndicator={false}
                        overScrollMode="never"
                    />

                    <View style={[s.footer, { borderTopColor: C.border, backgroundColor: C.background }]}>
                        <TouchableOpacity
                            style={[s.acceptBtn, { backgroundColor: C.primary }, accepting && { opacity: 0.6 }]}
                            onPress={handleAccept}
                            disabled={accepting}
                        >
                            {accepting
                                ? <ActivityIndicator size="small" color={C.darker} />
                                : <Text style={[s.acceptText, { color: C.darker }]}>Okudum, Onaylıyorum</Text>
                            }
                        </TouchableOpacity>
                        <TouchableOpacity style={s.dismissBtn} onPress={() => router.back()}>
                            <Text style={[s.dismissText, { color: C.textMuted }]}>Geri Dön</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    header: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    backBtn:  { padding: 4 },
    title:    { fontSize: 17, fontWeight: '800' },
    subtitle: { fontSize: 12, marginTop: 1 },

    center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyText: { fontSize: 15 },

    footer: {
        paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32,
        borderTopWidth: 1, gap: 8,
    },
    acceptBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
    acceptText: { fontSize: 15, fontWeight: '800' },
    dismissBtn: { alignItems: 'center', paddingVertical: 8 },
    dismissText: { fontSize: 13 },
});
