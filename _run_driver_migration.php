<?php
/**
 * Sürücü Onboarding v2 — Migration Runner
 * TEK SEFERLIK çalıştır, sonra sil.
 * URL: https://patimera.com/pet_taxi/_run_driver_migration.php
 */
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
$db = getDB();

echo "<pre style='font-family:monospace;font-size:13px'>";
echo "=== Pet Taxi Driver Onboarding v2 Migration ===\n\n";

$steps = [

    // 1. Lookup tabloları
    "animal_types CREATE" => "CREATE TABLE IF NOT EXISTS animal_types (
        id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ad VARCHAR(80) NOT NULL, slug VARCHAR(40) NOT NULL, sort_order TINYINT NOT NULL DEFAULT 0,
        PRIMARY KEY (id), UNIQUE KEY uq_animal_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "animal_types SEED" => "INSERT IGNORE INTO animal_types (id,ad,slug,sort_order) VALUES
        (1,'Kedi','kedi',1),(2,'Küçük Irk Köpek','kucuk_kopek',2),
        (3,'Orta Irk Köpek','orta_kopek',3),(4,'Büyük Irk Köpek','buyuk_kopek',4),
        (5,'Kuş / Kemirgen','kus_kemirgen',5)",

    "equipments CREATE" => "CREATE TABLE IF NOT EXISTS equipments (
        id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ad VARCHAR(120) NOT NULL, slug VARCHAR(60) NOT NULL, sort_order TINYINT NOT NULL DEFAULT 0,
        PRIMARY KEY (id), UNIQUE KEY uq_equipment_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "equipments SEED" => "INSERT IGNORE INTO equipments (id,ad,slug,sort_order) VALUES
        (1,'Pet emniyet kemeri','emniyet_kemeri',1),(2,'Koltuk koruma kılıfı','koltuk_kilifi',2),
        (3,'Taşıma kafesi / Box','tasima_kafesi',3),(4,'İlkyardım kiti','ilkyardim_kiti',4)",

    // 2. Ana tablolar (INT — taxi_users.id signed INT ile uyumlu)
    "drivers CREATE" => "CREATE TABLE IF NOT EXISTS drivers (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        profil_foto VARCHAR(500) DEFAULT NULL,
        ehliyet_on VARCHAR(500) DEFAULT NULL,
        ehliyet_arka VARCHAR(500) DEFAULT NULL,
        adli_sicil VARCHAR(500) DEFAULT NULL,
        allerji_beyan TINYINT(1) NOT NULL DEFAULT 0,
        kurallar_kabul TINYINT(1) NOT NULL DEFAULT 0,
        kurallar_kabul_at DATETIME DEFAULT NULL,
        adim_tamamlanan TINYINT(1) NOT NULL DEFAULT 0,
        durum ENUM('taslak','beklemede','onaylandi','reddedildi') NOT NULL DEFAULT 'taslak',
        red_nedeni TEXT DEFAULT NULL,
        admin_notu TEXT DEFAULT NULL,
        submitted_at DATETIME DEFAULT NULL,
        reviewed_at DATETIME DEFAULT NULL,
        reviewed_by INT DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_driver_user (user_id),
        KEY idx_driver_durum (durum),
        CONSTRAINT fk_driver_user FOREIGN KEY (user_id) REFERENCES taxi_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "driver_vehicles CREATE" => "CREATE TABLE IF NOT EXISTS driver_vehicles (
        id INT NOT NULL AUTO_INCREMENT,
        driver_id INT NOT NULL,
        marka VARCHAR(80) NOT NULL,
        model VARCHAR(80) NOT NULL,
        yil SMALLINT NOT NULL,
        plaka VARCHAR(20) NOT NULL,
        ruhsat_foto VARCHAR(500) DEFAULT NULL,
        klima_taahhut TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_vehicle_driver (driver_id),
        KEY idx_vehicle_plaka (plaka),
        CONSTRAINT fk_vehicle_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "driver_vehicle_photos CREATE" => "CREATE TABLE IF NOT EXISTS driver_vehicle_photos (
        id INT NOT NULL AUTO_INCREMENT,
        vehicle_id INT NOT NULL,
        foto_url VARCHAR(500) NOT NULL,
        foto_turu ENUM('ic_mekan','arka_koltuk','bagaj','dis') NOT NULL DEFAULT 'ic_mekan',
        siralama TINYINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_photo_vehicle (vehicle_id),
        CONSTRAINT fk_photo_vehicle FOREIGN KEY (vehicle_id) REFERENCES driver_vehicles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "driver_allowed_animals CREATE" => "CREATE TABLE IF NOT EXISTS driver_allowed_animals (
        driver_id INT NOT NULL,
        animal_type_id TINYINT UNSIGNED NOT NULL,
        PRIMARY KEY (driver_id, animal_type_id),
        CONSTRAINT fk_da_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
        CONSTRAINT fk_da_animal FOREIGN KEY (animal_type_id) REFERENCES animal_types(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    "driver_equipments CREATE" => "CREATE TABLE IF NOT EXISTS driver_equipments (
        driver_id INT NOT NULL,
        equipment_id TINYINT UNSIGNED NOT NULL,
        PRIMARY KEY (driver_id, equipment_id),
        CONSTRAINT fk_de_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
        CONSTRAINT fk_de_equipment FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

    // 3. Mevcut sürücü verisi migrasyonu
    "drivers MIGRATE from taxi_users" => "INSERT IGNORE INTO drivers
        (user_id, ehliyet_on, ehliyet_arka, adim_tamamlanan, durum, submitted_at)
        SELECT id, ehliyet_on, ehliyet_arka,
               CASE WHEN sertifika_durumu IS NOT NULL THEN 2 ELSE 0 END,
               CASE sertifika_durumu
                   WHEN 'onaylandi'  THEN 'onaylandi'
                   WHEN 'reddedildi' THEN 'reddedildi'
                   WHEN 'beklemede'  THEN 'beklemede'
                   ELSE 'taslak' END,
               created_at
        FROM taxi_users WHERE rol = 'surucu' AND sertifika_durumu IS NOT NULL",

    "driver_vehicles MIGRATE from taxi_users" => "INSERT IGNORE INTO driver_vehicles
        (driver_id, marka, model, yil, plaka)
        SELECT d.id,
               TRIM(SUBSTRING_INDEX(u.arac_modeli,' ',1)),
               TRIM(SUBSTRING(u.arac_modeli, LOCATE(' ',u.arac_modeli)+1)),
               YEAR(NOW()),
               COALESCE(u.plaka,'BILINMIYOR')
        FROM taxi_users u JOIN drivers d ON d.user_id = u.id
        WHERE u.arac_modeli IS NOT NULL AND u.arac_modeli != ''",
];

$ok = 0; $fail = 0;
foreach ($steps as $label => $sql) {
    try {
        $affected = $db->exec($sql);
        echo "✅ {$label}" . ($affected !== false ? " ({$affected} rows)" : "") . "\n";
        $ok++;
    } catch (PDOException $ex) {
        echo "❌ {$label}: " . $ex->getMessage() . "\n";
        $fail++;
    }
}

echo "\n--- Doğrulama ---\n";
$checks = [
    'animal_types'           => "SELECT COUNT(*) FROM animal_types",
    'equipments'             => "SELECT COUNT(*) FROM equipments",
    'drivers'                => "SELECT COUNT(*) FROM drivers",
    'driver_vehicles'        => "SELECT COUNT(*) FROM driver_vehicles",
    'driver_vehicle_photos'  => "SELECT COUNT(*) FROM driver_vehicle_photos",
    'driver_allowed_animals' => "SELECT COUNT(*) FROM driver_allowed_animals",
    'driver_equipments'      => "SELECT COUNT(*) FROM driver_equipments",
];
foreach ($checks as $tbl => $q) {
    try {
        $cnt = $db->query($q)->fetchColumn();
        echo "   {$tbl}: {$cnt} kayıt\n";
    } catch (PDOException $ex) {
        echo "   {$tbl}: HATA — " . $ex->getMessage() . "\n";
    }
}

echo "\n=== Tamamlandı: {$ok} başarılı, {$fail} hatalı ===\n";
echo "</pre>";
