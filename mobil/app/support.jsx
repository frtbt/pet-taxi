import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, FlatList, TextInput, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import taxiApi from '../src/api/taxiClient';
import { useTheme } from '../src/context/ThemeContext';

const POLL_INTERVAL = 6000;
const TUR_ICON  = { kopek: '🐾', surucu: '🚗', sahip: '👤' };
const TUR_LABEL = { kopek: 'Köpek', surucu: 'Sürücü', sahip: 'Sahip' };

export default function SupportScreen() {
    const insets   = useSafeAreaInsets();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const router   = useRouter();
    const listRef  = useRef(null);
    const pollRef  = useRef(null);
    const inputRef = useRef(null);

    const [messages,           setMessages]           = useState([]);
    const [text,               setText]               = useState('');
    const [loading,            setLoading]            = useState(true);
    const [sending,            setSending]            = useState(false);
    const [allSuggestions,     setAllSuggestions]     = useState([]);
    const [mentionSuggestions, setMentionSuggestions] = useState([]);
    const [showMention,        setShowMention]        = useState(false);
    const mentionActive = useRef(false);

    const loadMessages = useCallback(async () => {
        const res = await taxiApi.getSupportMessages();
        if (res.success) {
            setMessages(res.messages ?? []);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadMessages();
        taxiApi.request('get_mention_suggestions').then(res => {
            if (res.success) setAllSuggestions(res.suggestions ?? []);
        });
        pollRef.current = setInterval(loadMessages, POLL_INTERVAL);
        return () => clearInterval(pollRef.current);
    }, [loadMessages]);

    function handleTextChange(val) {
        setText(val);
        const lastWord = val.split(/\s/).pop() ?? '';
        if (lastWord.startsWith('@')) {
            mentionActive.current = true;
            const query    = lastWord.slice(1).toLowerCase();
            const filtered = query
                ? allSuggestions.filter(sg => sg.ad.toLowerCase().includes(query))
                : allSuggestions;
            setMentionSuggestions(filtered);
            setShowMention(true);
        } else {
            mentionActive.current = false;
            setShowMention(false);
        }
    }

    useEffect(() => {
        if (!mentionActive.current) return;
        const lastWord = text.split(/\s/).pop() ?? '';
        const query    = lastWord.startsWith('@') ? lastWord.slice(1).toLowerCase() : '';
        const filtered = query
            ? allSuggestions.filter(sg => sg.ad.toLowerCase().includes(query))
            : allSuggestions;
        setMentionSuggestions(filtered);
        if (filtered.length) setShowMention(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allSuggestions]);

    function selectMention(sug) {
        const parts = text.split(/(\s+)/);
        for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i].startsWith('@')) { parts[i] = `@${sug.ad}`; break; }
        }
        const newText = parts.join('') + ' ';
        setText(newText);
        setShowMention(false);
        mentionActive.current = false;
        inputRef.current?.focus();
    }

    async function sendMessage() {
        const msg = text.trim();
        if (!msg || sending) return;
        setSending(true);
        setText('');
        setShowMention(false);
        mentionActive.current = false;
        const res = await taxiApi.sendSupportMessage(msg);
        setSending(false);
        if (res.success) {
            await loadMessages();
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        } else {
            setText(msg);
            if (res.error) Alert.alert('Hata', res.error);
        }
    }

    function renderItem({ item }) {
        const isUser = item.gonderen === 'kullanici';
        const date   = new Date(item.tarih).toLocaleString('tr-TR', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
        });
        return (
            <View style={[s.bubble, isUser ? s.bubbleRight : s.bubbleLeft]}>
                {!isUser && (
                    <View style={s.adminBadge}>
                        <Ionicons name="shield-checkmark" size={11} color={C.primary} />
                        <Text style={s.adminLabel}>Destek</Text>
                    </View>
                )}
                <Text style={[s.bubbleText, isUser ? s.bubbleTextRight : s.bubbleTextLeft]}>
                    {item.mesaj}
                </Text>
                <Text style={[s.bubbleTime, isUser ? { color: 'rgba(255,255,255,0.6)' } : { color: C.textMuted }]}>
                    {date}
                </Text>
            </View>
        );
    }

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={C.text} />
                </TouchableOpacity>
                <Text style={s.headerTitle}>Destek & İletişim</Text>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
            >
                {loading ? (
                    <View style={s.center}>
                        <ActivityIndicator size="large" color={C.primary} />
                    </View>
                ) : (
                    <FlatList
                        ref={listRef}
                        data={messages}
                        keyExtractor={item => String(item.id)}
                        contentContainerStyle={s.list}
                        renderItem={renderItem}
                        keyboardDismissMode="on-drag"
                        keyboardShouldPersistTaps="handled"
                        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                        ListEmptyComponent={
                            <View style={s.emptyWrap}>
                                <Ionicons name="chatbubbles-outline" size={56} color={C.textMuted} />
                                <Text style={s.emptyTitle}>Henüz mesaj yok</Text>
                                <Text style={s.emptySub}>Sorunuzu, şikayetinizi veya önerinizi yazın.</Text>
                            </View>
                        }
                    />
                )}

                {showMention && mentionSuggestions.length > 0 && (
                    <View style={s.mentionBox}>
                        {mentionSuggestions.slice(0, 6).map((sug, i) => (
                            <TouchableOpacity
                                key={i}
                                style={[s.mentionRow, i < Math.min(mentionSuggestions.length, 6) - 1 && s.mentionDivider]}
                                onPress={() => selectMention(sug)}
                                activeOpacity={0.7}
                            >
                                <Text style={s.mentionIcon}>{TUR_ICON[sug.tur] ?? '👤'}</Text>
                                <Text style={[s.mentionName, { flex: 1 }]}>{sug.ad}</Text>
                                <Text style={s.mentionTur}>{TUR_LABEL[sug.tur] ?? sug.tur}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    <TextInput
                        ref={inputRef}
                        style={s.input}
                        value={text}
                        onChangeText={handleTextChange}
                        placeholder="Mesajınızı yazın… (@isim etiketleyebilirsiniz)"
                        placeholderTextColor={C.textMuted}
                        multiline
                        maxLength={1000}
                        returnKeyType="default"
                        blurOnSubmit={false}
                    />
                    <TouchableOpacity
                        style={[s.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
                        onPress={sendMessage}
                        disabled={!text.trim() || sending}
                        activeOpacity={0.8}
                    >
                        {sending
                            ? <ActivityIndicator size="small" color={C.darker} />
                            : <Ionicons name="send" size={20} color={C.darker} />
                        }
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const makeStyles = (C) => StyleSheet.create({
    root:   { flex: 1, backgroundColor: C.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.card,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 12,
    },
    backBtn:     { padding: 6 },
    headerTitle: { color: C.text, fontSize: 16, fontWeight: '800', flex: 1 },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list:   { padding: 16, gap: 8, paddingBottom: 8 },

    emptyWrap:  { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 12 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    emptySub:   { color: C.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },

    bubble:          { maxWidth: '78%', borderRadius: 18, padding: 12, gap: 4 },
    bubbleLeft:      { alignSelf: 'flex-start', backgroundColor: C.card, borderBottomLeftRadius: 4 },
    bubbleRight:     { alignSelf: 'flex-end',   backgroundColor: C.primary, borderBottomRightRadius: 4 },
    bubbleText:      { fontSize: 14, lineHeight: 20 },
    bubbleTextLeft:  { color: C.text },
    bubbleTextRight: { color: C.darker },
    bubbleTime:      { fontSize: 10 },
    adminBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
    adminLabel:      { color: C.primary, fontSize: 10, fontWeight: '700' },

    mentionBox: {
        backgroundColor: C.card,
        borderTopWidth: 1,
        borderTopColor: C.border,
        maxHeight: 220,
    },
    mentionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
    },
    mentionDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.border,
    },
    mentionIcon: { fontSize: 18 },
    mentionName: { color: C.text, fontSize: 14, fontWeight: '600' },
    mentionTur:  { color: C.textMuted, fontSize: 11 },

    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 10,
        backgroundColor: C.card,
        borderTopWidth: 1,
        borderTopColor: C.border,
    },
    input: {
        flex: 1,
        backgroundColor: C.background,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        color: C.text,
        fontSize: 14,
        maxHeight: 120,
        borderWidth: 1,
        borderColor: C.border,
    },
    sendBtn: {
        backgroundColor: C.primary,
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
