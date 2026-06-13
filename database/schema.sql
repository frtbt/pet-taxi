-- ============================================================
-- Pet Taxi Modülü - Veritabanı Şeması
-- Tüm tablolar taxi_ ön ekiyle tanımlanmıştır
-- users ve dogs tabloları ana Patimera ile ortaktır
-- ============================================================

-- ============================================================
-- 1. Taksi Talepleri (ana iş tablosu)
--    Patimera'daki walk_requests → taxi_requests
--    Yürüyüş mantığı yerine ULAŞIM mantığı:
--      · adres yerine baslangic_noktasi + varis_noktasi
--      · yuruyus_zamani yerine kalkis_zamani
--      · sure → tahmini_sure (tahmini seyahat süresi, dk)
-- ============================================================
CREATE TABLE IF NOT EXISTS taxi_requests (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    sahip_id            INT NOT NULL COMMENT 'users.id (köpek sahibi)',
    kopek_id            INT NOT NULL COMMENT 'dogs.id',

    -- Başlangıç noktası
    baslangic_noktasi   TEXT NOT NULL COMMENT 'Açık adres (metin)',
    baslangic_sehir     VARCHAR(100) NOT NULL,
    baslangic_ilce      VARCHAR(100) NOT NULL,
    baslangic_lat       DECIMAL(10,8) DEFAULT NULL COMMENT 'GPS enlemi',
    baslangic_lon       DECIMAL(11,8) DEFAULT NULL COMMENT 'GPS boylamı',

    -- Varış noktası
    varis_noktasi       TEXT NOT NULL COMMENT 'Açık adres (metin)',
    varis_sehir         VARCHAR(100) NOT NULL,
    varis_ilce          VARCHAR(100) NOT NULL,
    varis_lat           DECIMAL(10,8) DEFAULT NULL,
    varis_lon           DECIMAL(11,8) DEFAULT NULL,

    -- Zaman & ücret
    kalkis_zamani       DATETIME NOT NULL COMMENT 'İstenen kalkış zamanı',
    tahmini_sure        INT DEFAULT NULL COMMENT 'Tahmini seyahat süresi (dakika)',
    tahmini_mesafe      DECIMAL(8,2) DEFAULT NULL COMMENT 'Km cinsinden',
    toplam_ucret        DECIMAL(10,2) NOT NULL COMMENT 'Toplam ücret (TL)',

    -- Durum & tip
    durum               ENUM('bekliyor','eslesti','basladi','tamamlandi','iptal') DEFAULT 'bekliyor',
    tip                 ENUM('anlik','planli') DEFAULT 'anlik',
    ozel_talepler       TEXT COMMENT 'Özel istekler / notlar',
    iptal_nedeni        TEXT,

    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (sahip_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (kopek_id) REFERENCES dogs(id) ON DELETE CASCADE,

    INDEX idx_durum          (durum),
    INDEX idx_sahip          (sahip_id),
    INDEX idx_kalkis_zamani  (kalkis_zamani),
    INDEX idx_sehir          (baslangic_sehir, baslangic_ilce)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 2. Taksi Eşleşmeleri
--    Patimera'daki walk_matches → taxi_matches
--    Gezdirici → Sürücü rolünde çalışır
-- ============================================================
CREATE TABLE IF NOT EXISTS taxi_matches (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    talep_id        INT NOT NULL COMMENT 'taxi_requests.id',
    surucu_id       INT NOT NULL COMMENT 'users.id (sürücü / gezdirici rolü)',

    eslesme_zamani  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    baslama_zamani  DATETIME  DEFAULT NULL COMMENT 'Köpek alındı',
    bitis_zamani    DATETIME  DEFAULT NULL COMMENT 'Varışa ulaşıldı',

    gercek_mesafe   DECIMAL(8,2) DEFAULT NULL COMMENT 'Gerçek kat edilen mesafe (km)',
    surucu_notu     TEXT,

    durum           ENUM('kabul_edildi','devam_ediyor','tamamlandi','iptal') DEFAULT 'kabul_edildi',

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (talep_id)  REFERENCES taxi_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (surucu_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_talep   (talep_id),
    INDEX idx_surucu  (surucu_id),
    INDEX idx_durum   (durum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 3. Canlı Konum Güncellemeleri (Taksi'ye özgü)
-- ============================================================
CREATE TABLE IF NOT EXISTS taxi_locations (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    match_id    INT NOT NULL COMMENT 'taxi_matches.id',
    lat         DECIMAL(10,8) NOT NULL,
    lon         DECIMAL(11,8) NOT NULL,
    hiz         DECIMAL(6,2) DEFAULT NULL COMMENT 'km/h',
    kayit_zamani TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (match_id) REFERENCES taxi_matches(id) ON DELETE CASCADE,
    INDEX idx_match (match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 4. Finansal İşlemler (Taksi modülüne özgü)
--    Patimera'daki transactions → taxi_transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS taxi_transactions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL COMMENT 'users.id',
    talep_id        INT DEFAULT NULL COMMENT 'taxi_requests.id',
    tutar           DECIMAL(10,2) NOT NULL,
    islem_tipi      ENUM('para_yukleme','hizmet_odemesi','surucu_kazanci','komisyon_kesintisi','para_cekme','iade') NOT NULL,
    aciklama        TEXT,
    onceki_bakiye   DECIMAL(10,2),
    sonraki_bakiye  DECIMAL(10,2),
    referans_no     VARCHAR(50),
    tarih           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (talep_id) REFERENCES taxi_requests(id) ON DELETE SET NULL,

    INDEX idx_user      (user_id),
    INDEX idx_islem     (islem_tipi),
    INDEX idx_tarih     (tarih)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 5. Mesajlaşma (Taksi)
--    Patimera'daki messages → taxi_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS taxi_messages (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    gonderen_id INT NOT NULL COMMENT 'users.id',
    alici_id    INT NOT NULL COMMENT 'users.id',
    talep_id    INT DEFAULT NULL COMMENT 'taxi_requests.id',
    mesaj       TEXT NOT NULL,
    okundu_mu   BOOLEAN DEFAULT FALSE,
    tarih       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (gonderen_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (alici_id)    REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (talep_id)    REFERENCES taxi_requests(id) ON DELETE SET NULL,

    INDEX idx_konusma (gonderen_id, alici_id),
    INDEX idx_alici   (alici_id, okundu_mu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 6. Bildirimler (Taksi)
--    Patimera'daki notifications → taxi_notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS taxi_notifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL COMMENT 'users.id',
    baslik      VARCHAR(255) NOT NULL,
    icerik      TEXT NOT NULL,
    tip         ENUM('sistem','yeni_is','odeme','mesaj','iptal','konum') DEFAULT 'sistem',
    link        VARCHAR(255),
    okundu_mu   BOOLEAN DEFAULT FALSE,
    tarih       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_okunmamis (user_id, okundu_mu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 7. Değerlendirmeler (Taksi)
--    Patimera'daki reviews → taxi_reviews
-- ============================================================
CREATE TABLE IF NOT EXISTS taxi_reviews (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    talep_id            INT NOT NULL COMMENT 'taxi_requests.id',
    degerlendiren_id    INT NOT NULL COMMENT 'users.id',
    degerlendirilen_id  INT NOT NULL COMMENT 'users.id',
    puan                INT NOT NULL CHECK (puan BETWEEN 1 AND 5),
    yorum               TEXT,
    tarih               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (talep_id)           REFERENCES taxi_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (degerlendiren_id)   REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (degerlendirilen_id) REFERENCES users(id) ON DELETE CASCADE,

    UNIQUE KEY unique_review (talep_id, degerlendiren_id),
    INDEX idx_degerlendirilen (degerlendirilen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 8. Sistem Ayarları (Taksi)
--    Patimera'daki settings → taxi_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS taxi_settings (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    anahtar     VARCHAR(100) NOT NULL UNIQUE,
    deger       TEXT NOT NULL,
    aciklama    VARCHAR(255),
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO taxi_settings (anahtar, deger, aciklama) VALUES
('komisyon_orani',    '20',            'Platform komisyon oranı (%)'),
('km_basi_ucret',     '15',            'Km başına ücret (TL)'),
('minimum_ucret',     '50',            'Minimum taksi ücreti (TL)'),
('min_para_cekme',    '50',            'Minimum para çekme tutarı (TL)'),
('site_adi',          'Pet Taxi',      'Modül adı'),
('site_email',        'info@patimera.com', 'İletişim email');


-- ============================================================
-- Tablo eşleştirme özeti (referans)
-- ============================================================
-- walk_requests  → taxi_requests   (baslangic_noktasi + varis_noktasi eklendi)
-- walk_matches   → taxi_matches    (surucu_id kullanıldı)
-- transactions   → taxi_transactions
-- messages       → taxi_messages
-- notifications  → taxi_notifications
-- reviews        → taxi_reviews
-- settings       → taxi_settings
-- ORTAK: users, dogs, user_tokens, user_addresses
