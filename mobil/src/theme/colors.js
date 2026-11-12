const SHARED = {
    primary:     '#f59e0b',
    primaryDark: '#d97706',
    primaryLight:'#fde68a',
    success:    '#22c55e',
    warning:    '#f59e0b',
    danger:     '#ef4444',
    info:       '#60a5fa',
    white:      '#ffffff',
    black:      '#000000',
    petGreen:   '#22c55e',
    taxiAmber:  '#f59e0b',
    statusColors: {
        bekliyor:     '#f59e0b',
        eslesti:      '#60a5fa',
        basladi:      '#a78bfa',
        tamamlandi:   '#22c55e',
        iptal:        '#ef4444',
        kabul_edildi: '#60a5fa',
        devam_ediyor: '#a78bfa',
    },
};

export const DarkColors = {
    ...SHARED,
    darker:     '#0d0a07',
    dark:       '#1a1410',
    background: '#0d0a07',
    card:       '#1f1916',
    surface:    '#2e2420',
    border:     '#3d3028',
    text:       '#f7f3ee',
    textMuted:  '#a09082',
    textDark:   '#1f1916',
};

export const LightColors = {
    ...SHARED,
    darker:     '#1a1410',
    dark:       '#2d2420',
    background: '#f8f5f0',
    card:       '#ffffff',
    surface:    '#f0ebe4',
    border:     '#e8dfd6',
    text:       '#1a1410',
    textMuted:  '#8c7b6e',
    textDark:   '#1a1410',
};

// Default export for backward compat (dark)
export const Colors = DarkColors;
export default DarkColors;
