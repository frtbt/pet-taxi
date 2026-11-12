import Colors from '../theme/colors';

// Unified status map for both taxi_requests.durum and taxi_matches.durum
export const TRIP_STATUS = {
    // Request statuses (owner side)
    bekliyor:          { label: 'Bekliyor',          color: Colors.warning,  icon: 'time-outline' },
    eslesti:           { label: 'Eşleşti',            color: Colors.info,     icon: 'checkmark-circle-outline' },
    basladi:           { label: 'Yolda',              color: '#8b5cf6',       icon: 'navigate-outline' },
    // Match statuses (driver side)
    kabul_edildi:      { label: 'Kabul Edildi',       color: Colors.info,     icon: 'checkmark-circle' },
    devam_ediyor:      { label: 'Devam Ediyor',       color: '#8b5cf6',       icon: 'navigate' },
    teslim_bekleniyor: { label: 'Teslim Bekleniyor',  color: Colors.warning,  icon: 'hourglass' },
    // Terminal statuses
    tamamlandi:        { label: 'Tamamlandı',         color: Colors.success,  icon: 'trophy' },
    iptal:             { label: 'İptal Edildi',       color: Colors.danger,   icon: 'close-circle' },
};

export function getStatus(durum) {
    return TRIP_STATUS[durum] ?? { label: durum, color: Colors.textMuted, icon: 'ellipse-outline' };
}
