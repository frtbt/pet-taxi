-- ============================================================
-- Pet Taxi — Sürücü Onboarding v2 Şeması
-- Mevcut taxi_users tablosunu bozmadan genişletir.
-- Çalıştırma: tek seferlik migration, idempotent (IF NOT EXISTS)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. LOOKUP TABLOLARI (Statik tanımlar, seed verisiyle birlikte)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS animal_types (
    id         TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ad         VARCHAR(80)      NOT NULL,
    slug       VARCHAR(40)      NOT NULL COMMENT 'Filtreleme için: kucuk_kopek, buyuk_kopek ...',
    sort_order TINYINT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_animal_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO animal_types (id, ad, slug, sort_order) VALUES
    (1, 'Kedi',             'kedi',         1),
    (2, 'Küçük Irk Köpek',  'kucuk_kopek',  2),
    (3, 'Orta Irk Köpek',   'orta_kopek',   3),
    (4, 'Büyük Irk Köpek',  'buyuk_kopek',  4),
    (5, 'Kuş / Kemirgen',   'kus_kemirgen', 5);


CREATE TABLE IF NOT EXISTS equipments (
    id         TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ad         VARCHAR(120)     NOT NULL,
    slug       VARCHAR(60)      NOT NULL,
    sort_order TINYINT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_equipment_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO equipments (id, ad, slug, sort_order) VALUES
    (1, 'Pet emniyet kemeri',    'emniyet_kemeri',  1),
    (2, 'Koltuk koruma kılıfı',  'koltuk_kilifi',   2),
    (3, 'Taşıma kafesi / Box',   'tasima_kafesi',   3),
    (4, 'İlkyardım kiti',        'ilkyardim_kiti',  4);


-- ────────────────────────────────────────────────────────────
-- 2. DRIVERS — taxi_users ile 1-1 bağlı genişletilmiş profil
-- ────────────────────────────────────────────────────────────
-- NOT: taxi_users.sertifika_durumu backward-compat için korunur;
--      durum sütunu burası master'dır.

CREATE TABLE IF NOT EXISTS drivers (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         INT UNSIGNED NOT NULL COMMENT 'taxi_users.id',

    -- Adım 1: Kimlik & Güvenlik
    profil_foto     VARCHAR(500)  DEFAULT NULL COMMENT 'Dosya yolu veya base64 ref',
    ehliyet_on      VARCHAR(500)  DEFAULT NULL,
    ehliyet_arka    VARCHAR(500)  DEFAULT NULL,
    adli_sicil      VARCHAR(500)  DEFAULT NULL COMMENT 'E-devlet PDF veya görsel',

    -- Adım 3: Beyanlar (zorunlu taahhütler)
    allerji_beyan   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Tüy alerjisi yok beyanı',

    -- Adım 4: Kural kabulü
    kurallar_kabul  TINYINT(1)   NOT NULL DEFAULT 0,
    kurallar_kabul_at DATETIME   DEFAULT NULL,

    -- Wizard ilerleme (kaçıncı adım kaydedildi)
    adim_tamamlanan TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '0-4',

    -- Onay akışı
    durum           ENUM('taslak','beklemede','onaylandi','reddedildi')
                    NOT NULL DEFAULT 'taslak',
    red_nedeni      TEXT         DEFAULT NULL,
    admin_notu      TEXT         DEFAULT NULL,
    submitted_at    DATETIME     DEFAULT NULL,
    reviewed_at     DATETIME     DEFAULT NULL,
    reviewed_by     INT UNSIGNED DEFAULT NULL COMMENT 'Admin user id',

    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_driver_user (user_id),
    KEY idx_driver_durum (durum),
    CONSTRAINT fk_driver_user FOREIGN KEY (user_id)
        REFERENCES taxi_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- 3. DRIVER_VEHICLES — Araç bilgileri (1 sürücü : 1 araç)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_vehicles (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    driver_id      INT UNSIGNED NOT NULL,

    marka          VARCHAR(80)  NOT NULL,
    model          VARCHAR(80)  NOT NULL,
    yil            SMALLINT     NOT NULL,
    plaka          VARCHAR(20)  NOT NULL,
    ruhsat_foto    VARCHAR(500) DEFAULT NULL,

    -- Zorunlu taahhüt toggle
    klima_taahhut  TINYINT(1)   NOT NULL DEFAULT 0
                   COMMENT 'Aktif klima/havalandırma taahhüdü',

    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_vehicle_driver (driver_id),
    KEY idx_vehicle_plaka (plaka),
    CONSTRAINT fk_vehicle_driver FOREIGN KEY (driver_id)
        REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- 4. DRIVER_VEHICLE_PHOTOS — Araç içi görseller (1 araç : N foto)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_vehicle_photos (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    vehicle_id INT UNSIGNED NOT NULL,
    foto_url   VARCHAR(500) NOT NULL,
    foto_turu  ENUM('ic_mekan','arka_koltuk','bagaj','dis')
               NOT NULL DEFAULT 'ic_mekan',
    siralama   TINYINT      NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_photo_vehicle (vehicle_id),
    CONSTRAINT fk_photo_vehicle FOREIGN KEY (vehicle_id)
        REFERENCES driver_vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- 5. DRIVER_ALLOWED_ANIMALS — Pivot: Sürücü × Hayvan Türü
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_allowed_animals (
    driver_id      INT UNSIGNED     NOT NULL,
    animal_type_id TINYINT UNSIGNED NOT NULL,

    PRIMARY KEY (driver_id, animal_type_id),
    CONSTRAINT fk_da_driver FOREIGN KEY (driver_id)
        REFERENCES drivers(id) ON DELETE CASCADE,
    CONSTRAINT fk_da_animal FOREIGN KEY (animal_type_id)
        REFERENCES animal_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- 6. DRIVER_EQUIPMENTS — Pivot: Sürücü × Ekipman
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_equipments (
    driver_id    INT UNSIGNED     NOT NULL,
    equipment_id TINYINT UNSIGNED NOT NULL,

    PRIMARY KEY (driver_id, equipment_id),
    CONSTRAINT fk_de_driver FOREIGN KEY (driver_id)
        REFERENCES drivers(id) ON DELETE CASCADE,
    CONSTRAINT fk_de_equipment FOREIGN KEY (equipment_id)
        REFERENCES equipments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ────────────────────────────────────────────────────────────
-- 7. MİGRASYON: Mevcut taxi_users verilerini drivers'a kopyala
--    (Sadece sertifika_durumu NULL olmayan, onaylı/bekleyen sürücüler)
-- ────────────────────────────────────────────────────────────

INSERT IGNORE INTO drivers (
    user_id,
    ehliyet_on,
    ehliyet_arka,
    adim_tamamlanan,
    durum,
    submitted_at
)
SELECT
    u.id,
    u.ehliyet_on,
    u.ehliyet_arka,
    CASE
        WHEN u.sertifika_durumu IS NOT NULL THEN 2  -- En az step2 tamamlanmış say
        ELSE 0
    END,
    CASE u.sertifika_durumu
        WHEN 'onaylandi'  THEN 'onaylandi'
        WHEN 'reddedildi' THEN 'reddedildi'
        WHEN 'beklemede'  THEN 'beklemede'
        ELSE 'taslak'
    END,
    u.created_at
FROM taxi_users u
WHERE u.rol = 'surucu'
  AND u.sertifika_durumu IS NOT NULL;

-- Araç bilgilerini de migrasyon et
INSERT IGNORE INTO driver_vehicles (driver_id, marka, model, yil, plaka)
SELECT
    d.id,
    SUBSTRING_INDEX(u.arac_modeli, ' ', 1)        AS marka,   -- İlk kelime marka
    SUBSTRING(u.arac_modeli,
        LOCATE(' ', u.arac_modeli) + 1)            AS model,   -- Geri kalanı model
    YEAR(NOW())                                    AS yil,     -- Bilinmiyor, placeholder
    COALESCE(u.plaka, 'BILINMIYOR')                AS plaka
FROM taxi_users u
JOIN drivers d ON d.user_id = u.id
WHERE u.arac_modeli IS NOT NULL
  AND u.arac_modeli != '';


-- ────────────────────────────────────────────────────────────
-- 8. KULLANIM ÖRNEĞI — Filtreli sürücü sorgusu
--    "Büyük ırk köpek taşıyan VE taşıma kafesi olan onaylı sürücüler"
-- ────────────────────────────────────────────────────────────
/*
SELECT
    u.ad_soyad,
    u.email,
    dv.marka,
    dv.model,
    dv.plaka,
    GROUP_CONCAT(DISTINCT at.ad ORDER BY at.sort_order SEPARATOR ', ') AS hayvan_turleri,
    GROUP_CONCAT(DISTINCT eq.ad ORDER BY eq.sort_order SEPARATOR ', ') AS ekipmanlar
FROM drivers d
JOIN taxi_users       u  ON u.id  = d.user_id
JOIN driver_vehicles  dv ON dv.driver_id = d.id
JOIN driver_allowed_animals daa ON daa.driver_id = d.id
JOIN animal_types     at ON at.id = daa.animal_type_id
JOIN driver_equipments  de ON de.driver_id = d.id
JOIN equipments       eq ON eq.id = de.equipment_id
WHERE d.durum = 'onaylandi'
  AND dv.klima_taahhut = 1
  AND EXISTS (
      SELECT 1 FROM driver_allowed_animals x
      JOIN animal_types xa ON xa.id = x.animal_type_id
      WHERE x.driver_id = d.id AND xa.slug = 'buyuk_kopek'
  )
  AND EXISTS (
      SELECT 1 FROM driver_equipments y
      JOIN equipments ye ON ye.id = y.equipment_id
      WHERE y.driver_id = d.id AND ye.slug = 'tasima_kafesi'
  )
GROUP BY d.id;
*/
