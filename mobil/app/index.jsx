import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function Index() {
    const { user, loading } = useAuth();
    const { colors: C } = useTheme();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (user) {
            router.replace('/(tabs)');
        } else {
            router.replace('/auth/login');
        }
    }, [user, loading]);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }}>
            <ActivityIndicator size="large" color={C.primary} />
        </View>
    );
}
