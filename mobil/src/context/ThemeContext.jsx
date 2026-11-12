import { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkColors, LightColors } from '../theme/colors';

const ThemeContext = createContext({
    colors:      DarkColors,
    isDark:      true,
    toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(true);

    useEffect(() => {
        AsyncStorage.getItem('pet_taxi_theme').then(val => {
            if (val === 'light') setIsDark(false);
        }).catch(() => {});
    }, []);

    function toggleTheme() {
        setIsDark(prev => {
            const next = !prev;
            AsyncStorage.setItem('pet_taxi_theme', next ? 'dark' : 'light').catch(() => {});
            return next;
        });
    }

    return (
        <ThemeContext.Provider value={{ colors: isDark ? DarkColors : LightColors, isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
