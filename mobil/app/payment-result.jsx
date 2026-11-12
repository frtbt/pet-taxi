import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '../src/context/ThemeContext';

export default function PaymentResult() {
    const { status } = useLocalSearchParams();
    const { colors: C } = useTheme();

    useEffect(() => {
        router.replace({
            pathname: '/(tabs)/wallet',
            params: { payment_status: status ?? 'unknown' },
        });
    }, []);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background }}>
            <ActivityIndicator size="large" color={C.primary} />
        </View>
    );
}
