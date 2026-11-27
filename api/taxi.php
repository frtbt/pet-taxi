<?php
if (function_exists('opcache_reset')) opcache_reset();
ob_start();
/**
 * Pet Taxi Modülü - REST API
 * Tamamen bağımsız uygulama — Patimera'dan ayrı token sistemi.
 * taxi_user_tokens tablosu kullanılır (user_tokens değil).
 * taxi_users tablosu kullanılır (users değil).
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

error_reporting(0);
ini_set('display_errors', 0);

$db = getDB();

// ----------------------------------------------------------------
// Helper fonksiyonlar
// ----------------------------------------------------------------
function jsonResponse($data, $code = 200)
{
    while (ob_get_level() > 0) ob_end_clean();
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonInput()
{
    $input = json_decode(file_get_contents('php://input'), true);
    return $input ?: [];
}

function generateToken($userId)
{
    $payload = $userId . '|' . time() . '|' . bin2hex(random_bytes(16));
    return base64_encode($payload);
}

/**
 * Token doğrulama — taxi_user_tokens tablosu (Patimera'dan bağımsız)
 */
function getAuthUser()
{
    global $db;
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (empty($header) || !str_starts_with($header, 'Bearer ')) {
        return null;
    }
    $token = substr($header, 7);
    $stmt = $db->prepare(
        "SELECT u.* FROM taxi_users u
         INNER JOIN taxi_user_tokens ut ON u.id = ut.user_id
         WHERE ut.token = ? AND ut.expires_at > NOW()"
    );
    $stmt->execute([$token]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function requireAuth()
{
    $user = getAuthUser();
    if (!$user) {
        jsonResponse(['success' => false, 'error' => 'Oturum geçersiz veya süresi dolmuş'], 401);
    }
    return $user;
}

/**
 * Km başı ücret + minimum ücret hesabı
 */
function calculateFare(PDO $db, float $km, float $beklemeDk = 0): float
{
    $stmt = $db->query("SELECT anahtar, deger FROM taxi_settings WHERE anahtar IN ('km_basi_ucret','minimum_ucret','acilis_ucreti','bekleme_dk_ucret')");
    $rows = $stmt->fetchAll();
    $s = [];
    foreach ($rows as $r) $s[$r['anahtar']] = (float)$r['deger'];

    $acilis      = $s['acilis_ucreti']    ?? 65.0;
    $kmRate      = $s['km_basi_ucret']    ?? 45.0;
    $beklemeDkRate = $s['bekleme_dk_ucret'] ?? 5.25;
    $min         = $s['minimum_ucret']    ?? 65.0;

    $fare = $acilis + ($km * $kmRate) + ($beklemeDk * $beklemeDkRate);
    return max($min, round($fare, 2));
}

// ----------------------------------------------------------------
// Push notification helper (FCM V1 — reuses shared PushNotification class)
// ----------------------------------------------------------------
function taxiNotify(PDO $db, int $userId, string $title, string $body, string $tip = 'sistem', array $extra = []): void
{
    // 1. DB'ye kaydet
    try {
        $db->prepare("INSERT INTO taxi_notifications (user_id, baslik, icerik, tip) VALUES (?, ?, ?, ?)")
           ->execute([$userId, $title, $body, $tip]);
    } catch (\Exception $e) {}

    // 2. FCM push gönder
    try {
        $stmt = $db->prepare("SELECT fcm_token FROM taxi_users WHERE id = ?");
        $stmt->execute([$userId]);
        $token = $stmt->fetchColumn();
        if (!$token) return;

        if (!class_exists('PushNotification')) {
            require_once dirname(dirname(__DIR__)) . '/core/PushNotification.php';
        }
        $data = array_merge(['type' => $tip], $extra);
        PushNotification::sendToToken($token, $title, $body, $data, 'notifications');
    } catch (\Exception $e) {}
}

// Tüm aktif sürücülere bildirim gönder
function taxiNotifyAllDrivers(PDO $db, string $title, string $body, string $tip = 'yeni_is'): void
{
    try {
        $stmt = $db->query("SELECT id, fcm_token FROM taxi_users WHERE rol = 'surucu' AND durum = 'aktif' AND fcm_token IS NOT NULL AND fcm_token != ''");
        $drivers = $stmt->fetchAll();
        if (!class_exists('PushNotification')) {
            require_once dirname(dirname(__DIR__)) . '/core/PushNotification.php';
        }
        foreach ($drivers as $d) {
            try {
                $db->prepare("INSERT INTO taxi_notifications (user_id, baslik, icerik, tip) VALUES (?, ?, ?, ?)")
                   ->execute([$d['id'], $title, $body, $tip]);
                PushNotification::sendToToken($d['fcm_token'], $title, $body, ['type' => $tip], 'notifications');
            } catch (\Exception $e) {}
        }
    } catch (\Exception $e) {}
}

// ----------------------------------------------------------------
// taxi_users ve taxi_user_tokens tablolarını oluştur (ilk çalıştırmada)
// ----------------------------------------------------------------
try {
    // Bağımsız kullanıcı tablosu
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_users (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        ad_soyad          VARCHAR(100) NOT NULL,
        email             VARCHAR(100) NOT NULL UNIQUE,
        sifre             VARCHAR(255) NOT NULL,
        rol               ENUM('sahip','surucu','admin') NOT NULL DEFAULT 'sahip',
        telefon           VARCHAR(20),
        sehir             VARCHAR(100),
        ilce              VARCHAR(100),
        profil_resmi      VARCHAR(255) DEFAULT 'default.jpg',
        cuzdan_bakiyesi   DECIMAL(10,2) DEFAULT 0.00,
        durum             ENUM('aktif','pasif','banli') DEFAULT 'aktif',
        email_dogrulandi  TINYINT(1) DEFAULT 0,
        fcm_token         VARCHAR(255) DEFAULT NULL,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_rol   (rol)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Kolon migration — yoksa ekle
    $cols = $db->query("SHOW COLUMNS FROM taxi_users")->fetchAll(PDO::FETCH_COLUMN);

    // FCM push token kolonu (bildirim sistemi)
    if (!in_array('fcm_token', $cols)) {
        $db->exec("ALTER TABLE taxi_users ADD COLUMN fcm_token VARCHAR(255) DEFAULT NULL");
    }

    // Sürücü doğrulama kolonları
    if (!in_array('ehliyet_on', $cols)) {
        $db->exec("ALTER TABLE taxi_users
            ADD COLUMN ehliyet_on        VARCHAR(500) NULL,
            ADD COLUMN ehliyet_arka      VARCHAR(500) NULL,
            ADD COLUMN arac_modeli       VARCHAR(100) NULL,
            ADD COLUMN plaka             VARCHAR(20)  NULL,
            ADD COLUMN uzun_yol          TINYINT(1)   DEFAULT 0,
            ADD COLUMN sehir_ici_trafik  TINYINT(1)   DEFAULT 0,
            ADD COLUMN kopek_deneyimi    TINYINT(1)   DEFAULT 0,
            ADD COLUMN sertifika_durumu  ENUM('beklemede','onaylandi','reddedildi') NULL DEFAULT NULL,
            ADD COLUMN red_nedeni        TEXT NULL
        ");
    }

    // Bağımsız token tablosu
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_user_tokens (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        token       VARCHAR(255) NOT NULL UNIQUE,
        device_info VARCHAR(255) DEFAULT NULL,
        expires_at  DATETIME NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token (token),
        INDEX idx_user  (user_id),
        FOREIGN KEY (user_id) REFERENCES taxi_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Bildirimler tablosu
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_notifications (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        baslik     VARCHAR(255) NOT NULL,
        icerik     TEXT NOT NULL,
        tip        VARCHAR(50) DEFAULT 'sistem',
        okundu_mu  TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        FOREIGN KEY (user_id) REFERENCES taxi_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Mevcut kurulumda taxi_notifications; users'a yanlış FK bağlıysa taxi_users'a düzelt
    try {
        $wrongFks = $db->query(
            "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxi_notifications'
             AND REFERENCED_TABLE_NAME = 'users'"
        )->fetchAll(PDO::FETCH_COLUMN);
        foreach ($wrongFks as $fkName) {
            try { $db->exec("ALTER TABLE taxi_notifications DROP FOREIGN KEY `$fkName`"); } catch(Exception $e2) {}
            try { $db->exec("ALTER TABLE taxi_notifications ADD FOREIGN KEY (user_id) REFERENCES taxi_users(id) ON DELETE CASCADE"); } catch(Exception $e2) {}
        }
    } catch(Exception $e) {}

    // Geçiş ücretleri / köprü / otoyol tablosu
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_tolls (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        ad             VARCHAR(100) NOT NULL COMMENT 'Geçiş adı (Avrasya, FSM Köprüsü vb.)',
        ucret          DECIMAL(8,2) NOT NULL COMMENT 'Normal ücret (TL)',
        gece_ucret     DECIMAL(8,2) NULL COMMENT 'Gece ücreti (farklıysa)',
        gece_baslangic TIME DEFAULT '00:00:00' COMMENT 'Gece tarifesi başlangıcı',
        gece_bitis     TIME DEFAULT '06:00:00' COMMENT 'Gece tarifesi bitişi',
        tip            ENUM('kopru','otoyol','tunel','diger') DEFAULT 'diger',
        aktif          TINYINT(1) DEFAULT 1,
        sira           INT DEFAULT 0,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Varsayılan geçiş ücretlerini ekle (yoksa)
    $db->exec("INSERT IGNORE INTO taxi_tolls (id, ad, ucret, gece_ucret, gece_baslangic, gece_bitis, tip, sira) VALUES
        (1, 'Köprü',           59.00, NULL,   '00:00:00', '06:00:00', 'kopru',  1),
        (2, 'Otoyol',          49.00, NULL,   '00:00:00', '06:00:00', 'otoyol', 2),
        (3, 'Avrasya Tüneli', 280.00, 140.00, '00:00:00', '05:00:00', 'tunel',  3)
    ");

    // Varsayılan ücret ayarlarını ekle (yoksa)
    $db->exec("INSERT IGNORE INTO taxi_settings (anahtar, deger) VALUES
        ('acilis_ucreti',    '65'),
        ('km_basi_ucret',    '45'),
        ('bekleme_dk_ucret', '5.25'),
        ('indi_bindi_ucret', '210'),
        ('minimum_ucret',    '65'),
        ('komisyon_orani',   '20'),
        ('min_para_cekme',   '50'),
        ('min_yukle_tl',     '10')
    ");

    // Kayıtlı adresler tablosu
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_addresses (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        ad         VARCHAR(100) NOT NULL COMMENT 'Adres etiketi (Ev, İş, vb.)',
        adres      VARCHAR(500) NOT NULL,
        sehir      VARCHAR(100),
        ilce       VARCHAR(100),
        lat        DECIMAL(10,7),
        lon        DECIMAL(10,7),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        FOREIGN KEY (user_id) REFERENCES taxi_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Taksi talepleri tablosu — taxi_users/taxi_dogs FK'larıyla
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_requests (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        sahip_id            INT NOT NULL,
        kopek_id            INT NOT NULL,
        baslangic_noktasi   TEXT NOT NULL,
        baslangic_sehir     VARCHAR(100) NOT NULL,
        baslangic_ilce      VARCHAR(100) NOT NULL,
        baslangic_lat       DECIMAL(10,8) DEFAULT NULL,
        baslangic_lon       DECIMAL(11,8) DEFAULT NULL,
        varis_noktasi       TEXT NOT NULL,
        varis_sehir         VARCHAR(100) NOT NULL,
        varis_ilce          VARCHAR(100) NOT NULL,
        varis_lat           DECIMAL(10,8) DEFAULT NULL,
        varis_lon           DECIMAL(11,8) DEFAULT NULL,
        kalkis_zamani       DATETIME NOT NULL,
        tahmini_mesafe      DECIMAL(8,2) DEFAULT NULL,
        toplam_ucret        DECIMAL(10,2) NOT NULL,
        durum               ENUM('bekliyor','eslesti','basladi','tamamlandi','iptal') DEFAULT 'bekliyor',
        tip                 ENUM('anlik','planli') DEFAULT 'anlik',
        ozel_talepler       TEXT,
        iptal_nedeni        TEXT,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_durum    (durum),
        INDEX idx_sahip    (sahip_id),
        INDEX idx_sehir    (baslangic_sehir, baslangic_ilce),
        FOREIGN KEY (sahip_id) REFERENCES taxi_users(id) ON DELETE CASCADE,
        FOREIGN KEY (kopek_id) REFERENCES taxi_dogs(id)  ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Mevcut kurulumda taxi_requests; users/dogs'a yanlış FK bağlıysa düzelt
    try {
        $wrongFks = $db->query(
            "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxi_requests'
             AND REFERENCED_TABLE_NAME IN ('users','dogs')"
        )->fetchAll(PDO::FETCH_COLUMN);
        foreach ($wrongFks as $fkName) {
            try { $db->exec("ALTER TABLE taxi_requests DROP FOREIGN KEY `$fkName`"); } catch(Exception $e2) {}
        }
    } catch(Exception $e) {}

    // Mevcut kurulumda taxi_matches; users'a yanlış FK bağlıysa düzelt
    try {
        $wrongFks = $db->query(
            "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxi_matches'
             AND REFERENCED_TABLE_NAME = 'users'"
        )->fetchAll(PDO::FETCH_COLUMN);
        foreach ($wrongFks as $fkName) {
            try { $db->exec("ALTER TABLE taxi_matches DROP FOREIGN KEY `$fkName`"); } catch(Exception $e2) {}
        }
    } catch(Exception $e) {}

    // Sürücü banka bilgileri kolonları
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN iban          VARCHAR(35)  DEFAULT NULL AFTER red_nedeni"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN banka_adi     VARCHAR(100) DEFAULT NULL AFTER iban");        } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN hesap_sahibi  VARCHAR(100) DEFAULT NULL AFTER banka_adi");   } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN hesap_tipi    ENUM('bireysel','kurumsal') DEFAULT 'bireysel' AFTER hesap_sahibi"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN tc_no         VARCHAR(11)  DEFAULT NULL AFTER hesap_tipi");  } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN firma_unvani  VARCHAR(255) DEFAULT NULL AFTER tc_no");       } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN vergi_dairesi VARCHAR(255) DEFAULT NULL AFTER firma_unvani"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN vergi_no      VARCHAR(10)  DEFAULT NULL AFTER vergi_dairesi"); } catch(Exception $e) {}

    // Şifre sıfırlama kolonları
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN reset_token         VARCHAR(10)  DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN reset_token_expires DATETIME     DEFAULT NULL"); } catch(Exception $e) {}

    // Profil fotoğrafı kolonu
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN profil_foto VARCHAR(500) DEFAULT NULL"); } catch(Exception $e) {}

    // Köpek mikroçip ve aşı bilgisi kolonları
    try { $db->exec("ALTER TABLE taxi_dogs ADD COLUMN mikrocip_no      VARCHAR(50) DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_dogs ADD COLUMN kuduz_asi_tarihi DATE        DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_dogs ADD COLUMN karma_asi_tarihi DATE        DEFAULT NULL"); } catch(Exception $e) {}

    // Araç muayene + trafik sigortası belge kolonları
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN arac_muayene_belge     VARCHAR(500) DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN trafik_sigortasi_belge VARCHAR(500) DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN arac_belgeler_durum    ENUM('yok','yuklendi','onaylandi','reddedildi') DEFAULT 'yok'"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN arac_belgeler_deadline DATE DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN arac_belge_red_nedeni  VARCHAR(500) DEFAULT NULL"); } catch(Exception $e) {}

    // Agresyon/sağlık beyanı kolonları (Madde 5/3)
    try { $db->exec("ALTER TABLE taxi_requests ADD COLUMN agresyon_gecmisi  TINYINT(1) DEFAULT 0"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_requests ADD COLUMN agresyon_aciklama TEXT       DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_requests ADD COLUMN agizlik_taahhut   TINYINT(1) DEFAULT 0"); } catch(Exception $e) {}

    // Ekipman taahhüdü kolonu (Madde 5/4 — güvenli taşıma kutusu/kafes/göğüs tasması)
    try { $db->exec("ALTER TABLE taxi_requests ADD COLUMN ekipman_taahhut TINYINT(1) DEFAULT 0"); } catch(Exception $e) {}

    // İptal ücreti takip kolonları (Madde 7)
    try { $db->exec("ALTER TABLE taxi_requests ADD COLUMN eslesti_at   DATETIME       DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_requests ADD COLUMN iptal_ucreti DECIMAL(10,2)  DEFAULT 0"); } catch(Exception $e) {}

    // Check-in fotoğrafı kolonu (Madde 4/1)
    try { $db->exec("ALTER TABLE taxi_matches ADD COLUMN checkin_foto VARCHAR(500) DEFAULT NULL"); } catch(Exception $e) {}

    // Teslimat doğrulama kodu (PIN/OTP) kolonu (Madde 4/4)
    try { $db->exec("ALTER TABLE taxi_requests ADD COLUMN teslim_pin VARCHAR(4) DEFAULT NULL"); } catch(Exception $e) {}

    // Sürücünün adrese varış zamanı (Madde 7/1 - kapıda iptal)
    try { $db->exec("ALTER TABLE taxi_matches ADD COLUMN surucu_vardi_at DATETIME DEFAULT NULL"); } catch(Exception $e) {}

    // Sürücü keyfi iptal sayacı (Madde 7/2)
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN keyfi_iptal_sayisi INT DEFAULT 0"); } catch(Exception $e) {}

    // Hayvanlar tablosu (taxi_dogs — tüm evcil hayvanlar için genişletildi)
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_dogs (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        sahip_id     INT NOT NULL,
        isim         VARCHAR(50) NOT NULL,
        tur          VARCHAR(20) NOT NULL DEFAULT 'kopek' COMMENT 'kopek|kedi|kus|tavsan|diger',
        irk          VARCHAR(100),
        yas          INT,
        kilo         DECIMAL(5,2),
        cinsiyet     ENUM('erkek','disi') DEFAULT 'erkek',
        notlar       TEXT,
        huylu        VARCHAR(20),
        asili        TINYINT(1) DEFAULT 1,
        saglik_notu  TEXT,
        surucu_notu  TEXT,
        profil_resmi VARCHAR(255) DEFAULT 'default-dog.jpg',
        durum        ENUM('aktif','pasif') DEFAULT 'aktif',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sahip_id) REFERENCES taxi_users(id) ON DELETE CASCADE,
        INDEX idx_sahip (sahip_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Hayvan türleri tablosu (admin'den yönetilebilir)
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_hayvan_turleri (
        id    INT AUTO_INCREMENT PRIMARY KEY,
        slug  VARCHAR(20) NOT NULL DEFAULT '',
        ad    VARCHAR(50) NOT NULL,
        emoji VARCHAR(10) NOT NULL DEFAULT '🐾',
        sira  INT DEFAULT 0,
        aktif TINYINT(1) DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("INSERT IGNORE INTO taxi_hayvan_turleri (id, slug, ad, emoji, sira) VALUES
        (1, 'kopek',  'Köpek', '🐕', 1),
        (2, 'kedi',   'Kedi',  '🐱', 2),
        (3, 'kus',    'Kuş',   '🐦', 3),
        (4, 'tavsan', 'Tavşan','🐰', 4)
    ");

    // Mevcut kurulumlar için slug kolonu ekle
    try { $db->exec("ALTER TABLE taxi_hayvan_turleri ADD COLUMN slug VARCHAR(20) NOT NULL DEFAULT '' AFTER id"); } catch(Exception $e) {}
    try { $db->exec("UPDATE taxi_hayvan_turleri SET slug='kopek'  WHERE id=1 AND slug=''"); } catch(Exception $e) {}
    try { $db->exec("UPDATE taxi_hayvan_turleri SET slug='kedi'   WHERE id=2 AND slug=''"); } catch(Exception $e) {}
    try { $db->exec("UPDATE taxi_hayvan_turleri SET slug='kus'    WHERE id=3 AND slug=''"); } catch(Exception $e) {}
    try { $db->exec("UPDATE taxi_hayvan_turleri SET slug='tavsan' WHERE id=4 AND slug=''"); } catch(Exception $e) {}

    // Hayvan cinsleri tablosu (admin'den yönetilebilir)
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_hayvan_cinsleri (
        id     INT AUTO_INCREMENT PRIMARY KEY,
        tur_id INT NOT NULL,
        ad     VARCHAR(100) NOT NULL,
        aktif  TINYINT(1) DEFAULT 1,
        UNIQUE KEY uniq_tur_ad (tur_id, ad),
        FOREIGN KEY (tur_id) REFERENCES taxi_hayvan_turleri(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Köpek cinslerini Patimera'dan kopyala
    try {
        $db->exec("INSERT IGNORE INTO taxi_hayvan_cinsleri (tur_id, ad)
                   SELECT 1, ad FROM kopek_cinsleri WHERE aktif = 1 ORDER BY ad");
    } catch (Exception $e) {}

    // Kedi cinsleri
    $db->exec("INSERT IGNORE INTO taxi_hayvan_cinsleri (tur_id, ad) VALUES
        (2,'Tekir (Karışık)'),(2,'Van Kedisi'),(2,'Ankara Kedisi'),(2,'British Shorthair'),
        (2,'British Longhair'),(2,'Scottish Fold'),(2,'Maine Coon'),(2,'Persian (Fars)'),
        (2,'Siamese (Siyam)'),(2,'Bengal'),(2,'Ragdoll'),(2,'Sphynx (Sfenks)'),
        (2,'Ekzotik Shorthair'),(2,'Himalayan'),(2,'Russian Blue'),(2,'Abyssinian')
    ");

    // Kuş cinsleri
    $db->exec("INSERT IGNORE INTO taxi_hayvan_cinsleri (tur_id, ad) VALUES
        (3,'Muhabbet Kuşu'),(3,'Sultan Papağanı'),(3,'Afrika Gri Papağanı'),
        (3,'Amazon Papağanı'),(3,'Kanarya'),(3,'Cennet Papağanı'),
        (3,'Fink (İspinoz)'),(3,'Zebra İspinozu'),(3,'Kakadu'),(3,'Konur Papağanı')
    ");

    // Tavşan cinsleri
    $db->exec("INSERT IGNORE INTO taxi_hayvan_cinsleri (tur_id, ad) VALUES
        (4,'Holland Lop'),(4,'Angora Tavşanı'),(4,'Mini Rex'),(4,'Dutch (Hollanda)'),
        (4,'New Zealand'),(4,'Rex'),(4,'Lionhead'),(4,'Flemish Giant')
    ");

    // Mevcut taxi_dogs'a eksik kolonları ekle (eski kurulumlar için)
    try { $db->exec("ALTER TABLE taxi_dogs ADD COLUMN tur VARCHAR(20) NOT NULL DEFAULT 'kopek' AFTER isim"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_dogs ADD COLUMN huylu VARCHAR(20) DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_dogs ADD COLUMN asili TINYINT(1) DEFAULT 1"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_dogs ADD COLUMN saglik_notu TEXT DEFAULT NULL"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_dogs ADD COLUMN surucu_notu TEXT DEFAULT NULL"); } catch(Exception $e) {}

    // taxi_users'a ikamet adresi kolonu ekle
    try { $db->exec("ALTER TABLE taxi_users ADD COLUMN adres VARCHAR(500) DEFAULT NULL AFTER ilce"); } catch(Exception $e) {}

    // Değerlendirmeler tablosu
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_reviews (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        talep_id            INT NOT NULL,
        degerlendiren_id    INT NOT NULL,
        degerlendirilen_id  INT NOT NULL,
        puan                TINYINT NOT NULL COMMENT '1-5',
        yorum               TEXT,
        tarih               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_talep_degerlendiren (talep_id, degerlendiren_id),
        INDEX idx_degerlendirilen (degerlendirilen_id),
        FOREIGN KEY (talep_id)           REFERENCES taxi_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (degerlendiren_id)   REFERENCES taxi_users(id) ON DELETE CASCADE,
        FOREIGN KEY (degerlendirilen_id) REFERENCES taxi_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    try { $db->exec("CREATE TABLE IF NOT EXISTS taxi_favorites (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        sahip_id    INT NOT NULL,
        surucu_id   INT NOT NULL,
        tarih       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_favori (sahip_id, surucu_id),
        KEY idx_fav_sahip (sahip_id),
        KEY idx_fav_surucu (surucu_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch(Exception $e) {}

    // Geçmiş sürücülerin profil fotoğrafını drivers tablosundan taxi_users'a kopyala
    try {
        $db->exec("UPDATE taxi_users tu
                   INNER JOIN drivers d ON d.user_id = tu.id
                   SET tu.profil_foto = d.profil_foto
                   WHERE tu.profil_foto IS NULL AND d.profil_foto IS NOT NULL");
    } catch(Exception $e) {}

    // taxi_requests: teslim_bekleniyor durumu ve ödeme takip kolonları
    try { $db->exec("ALTER TABLE taxi_requests MODIFY COLUMN durum ENUM('bekliyor','eslesti','basladi','teslim_bekleniyor','tamamlandi','iptal') DEFAULT 'bekliyor'"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_requests ADD COLUMN odeme_durumu ENUM('bekliyor','odendi','iade_edildi') DEFAULT 'bekliyor' AFTER toplam_ucret"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_requests ADD COLUMN teslim_zamani DATETIME DEFAULT NULL AFTER odeme_durumu"); } catch(Exception $e) {}

    // taxi_matches: teslim_bekleniyor durumu + surucu_kazanc
    try { $db->exec("ALTER TABLE taxi_matches MODIFY COLUMN durum ENUM('kabul_edildi','devam_ediyor','teslim_bekleniyor','tamamlandi','iptal') DEFAULT 'kabul_edildi'"); } catch(Exception $e) {}
    try { $db->exec("ALTER TABLE taxi_matches ADD COLUMN surucu_kazanc DECIMAL(10,2) DEFAULT NULL"); } catch(Exception $e) {}

    // Destek mesajları tablosu
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_support_messages (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        mesaj       TEXT NOT NULL,
        gonderen    ENUM('kullanici','admin') DEFAULT 'kullanici',
        okundu      TINYINT(1) DEFAULT 0,
        tarih       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user  (user_id),
        INDEX idx_tarih (tarih)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // Hasar/Olay bildirimleri tablosu (Madde 10/1 — 48 saat içinde fotoğraflı bildirim)
    try { $db->exec("CREATE TABLE IF NOT EXISTS taxi_incident_reports (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        talep_id      INT NOT NULL,
        bildiren_id   INT NOT NULL,
        bildiren_rol  ENUM('sahip','surucu') NOT NULL,
        tur           ENUM('yaralanma','kayip','olum','arac_hasari','diger') NOT NULL,
        aciklama      TEXT NOT NULL,
        fotograflar   TEXT DEFAULT NULL,
        durum         ENUM('beklemede','inceleniyor','kapatildi') DEFAULT 'beklemede',
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_talep (talep_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch(Exception $e) {}

    // ── Sürücü Onboarding v2 — Lookup tabloları ─────────────────────
    $db->exec("CREATE TABLE IF NOT EXISTS animal_types (
        id         TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ad         VARCHAR(80)      NOT NULL,
        slug       VARCHAR(40)      NOT NULL,
        sort_order TINYINT          NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        UNIQUE KEY uq_animal_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("INSERT IGNORE INTO animal_types (id, ad, slug, sort_order) VALUES
        (1,'Kedi','kedi',1),
        (2,'Küçük Irk Köpek','kucuk_kopek',2),
        (3,'Orta Irk Köpek','orta_kopek',3),
        (4,'Büyük Irk Köpek','buyuk_kopek',4),
        (5,'Kuş / Kemirgen','kus_kemirgen',5)");

    $db->exec("CREATE TABLE IF NOT EXISTS equipments (
        id         TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ad         VARCHAR(120)     NOT NULL,
        slug       VARCHAR(60)      NOT NULL,
        sort_order TINYINT          NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        UNIQUE KEY uq_equipment_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("INSERT IGNORE INTO equipments (id, ad, slug, sort_order) VALUES
        (1,'Pet emniyet kemeri','emniyet_kemeri',1),
        (2,'Koltuk koruma kılıfı','koltuk_kilifi',2),
        (3,'Taşıma kafesi / Box','tasima_kafesi',3),
        (4,'İlkyardım kiti','ilkyardim_kiti',4)");

    // ── Sürücü Onboarding v2 — Ana tablolar ─────────────────────────
    $db->exec("CREATE TABLE IF NOT EXISTS drivers (
        id              INT NOT NULL AUTO_INCREMENT,
        user_id         INT NOT NULL,
        profil_foto     VARCHAR(500)  DEFAULT NULL,
        ehliyet_on      VARCHAR(500)  DEFAULT NULL,
        ehliyet_arka    VARCHAR(500)  DEFAULT NULL,
        adli_sicil      VARCHAR(500)  DEFAULT NULL,
        allerji_beyan   TINYINT(1)   NOT NULL DEFAULT 0,
        kurallar_kabul  TINYINT(1)   NOT NULL DEFAULT 0,
        kurallar_kabul_at DATETIME   DEFAULT NULL,
        adim_tamamlanan TINYINT(1)   NOT NULL DEFAULT 0,
        durum           ENUM('taslak','beklemede','onaylandi','reddedildi') NOT NULL DEFAULT 'taslak',
        red_nedeni      TEXT         DEFAULT NULL,
        admin_notu      TEXT         DEFAULT NULL,
        submitted_at    DATETIME     DEFAULT NULL,
        reviewed_at     DATETIME     DEFAULT NULL,
        reviewed_by     INT          DEFAULT NULL,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_driver_user (user_id),
        KEY idx_driver_durum (durum),
        CONSTRAINT fk_driver_user FOREIGN KEY (user_id) REFERENCES taxi_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // drivers kolon migrasyonları
    try {
        $driverCols = $db->query("SHOW COLUMNS FROM drivers")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('eksik_alanlar', $driverCols)) {
            $db->exec("ALTER TABLE drivers ADD COLUMN eksik_alanlar VARCHAR(1000) DEFAULT NULL AFTER red_nedeni");
        }
        if (!in_array('basvuru_sayisi', $driverCols)) {
            $db->exec("ALTER TABLE drivers ADD COLUMN basvuru_sayisi INT NOT NULL DEFAULT 0 AFTER eksik_alanlar");
        }
    } catch (Exception $e) {}

    $db->exec("CREATE TABLE IF NOT EXISTS driver_vehicles (
        id             INT NOT NULL AUTO_INCREMENT,
        driver_id      INT NOT NULL,
        marka          VARCHAR(80)  NOT NULL,
        model          VARCHAR(80)  NOT NULL,
        yil            SMALLINT     NOT NULL,
        plaka          VARCHAR(20)  NOT NULL,
        ruhsat_foto    VARCHAR(500) DEFAULT NULL,
        klima_taahhut  TINYINT(1)   NOT NULL DEFAULT 0,
        created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_vehicle_driver (driver_id),
        KEY idx_vehicle_plaka (plaka),
        CONSTRAINT fk_vehicle_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS driver_vehicle_photos (
        id         INT NOT NULL AUTO_INCREMENT,
        vehicle_id INT NOT NULL,
        foto_url   VARCHAR(500) NOT NULL,
        foto_turu  ENUM('ic_mekan','arka_koltuk','bagaj','dis') NOT NULL DEFAULT 'ic_mekan',
        siralama   TINYINT      NOT NULL DEFAULT 0,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_photo_vehicle (vehicle_id),
        CONSTRAINT fk_photo_vehicle FOREIGN KEY (vehicle_id) REFERENCES driver_vehicles(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS driver_allowed_animals (
        driver_id      INT              NOT NULL,
        animal_type_id TINYINT UNSIGNED NOT NULL,
        PRIMARY KEY (driver_id, animal_type_id),
        CONSTRAINT fk_da_driver FOREIGN KEY (driver_id)      REFERENCES drivers(id)      ON DELETE CASCADE,
        CONSTRAINT fk_da_animal FOREIGN KEY (animal_type_id) REFERENCES animal_types(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $db->exec("CREATE TABLE IF NOT EXISTS driver_equipments (
        driver_id    INT              NOT NULL,
        equipment_id TINYINT UNSIGNED NOT NULL,
        PRIMARY KEY (driver_id, equipment_id),
        CONSTRAINT fk_de_driver    FOREIGN KEY (driver_id)    REFERENCES drivers(id)    ON DELETE CASCADE,
        CONSTRAINT fk_de_equipment FOREIGN KEY (equipment_id) REFERENCES equipments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // ── Mevcut onaylı/bekleyen sürücüleri drivers tablosuna göç et ──
    $db->exec("INSERT IGNORE INTO drivers (user_id, ehliyet_on, ehliyet_arka, adim_tamamlanan, durum, submitted_at)
        SELECT id, ehliyet_on, ehliyet_arka,
               CASE WHEN sertifika_durumu IS NOT NULL THEN 2 ELSE 0 END,
               CASE sertifika_durumu
                   WHEN 'onaylandi'  THEN 'onaylandi'
                   WHEN 'reddedildi' THEN 'reddedildi'
                   WHEN 'beklemede'  THEN 'beklemede'
                   ELSE 'taslak' END,
               created_at
        FROM taxi_users
        WHERE rol = 'surucu' AND sertifika_durumu IS NOT NULL");

    $db->exec("INSERT IGNORE INTO driver_vehicles (driver_id, marka, model, yil, plaka)
        SELECT d.id,
               TRIM(SUBSTRING_INDEX(u.arac_modeli,' ',1)),
               TRIM(SUBSTRING(u.arac_modeli, LOCATE(' ',u.arac_modeli)+1)),
               YEAR(NOW()),
               COALESCE(u.plaka,'BILINMIYOR')
        FROM taxi_users u JOIN drivers d ON d.user_id = u.id
        WHERE u.arac_modeli IS NOT NULL AND u.arac_modeli != ''");

} catch (Exception $e) {}

// taxi_contracts tablosu
try {
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_contracts (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        surum           VARCHAR(20)  NOT NULL,
        icerik          LONGTEXT     NOT NULL,
        yururluk_tarihi DATE         NOT NULL,
        aktif           TINYINT(1)   NOT NULL DEFAULT 0,
        olusturan_id    INT          DEFAULT NULL,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_aktif (aktif)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
} catch (Exception $e) {}

// taxi_users: kabul edilen sözleşme sürümünü takip et
try { $db->exec("ALTER TABLE taxi_users ADD COLUMN sozlesme_surumu VARCHAR(20) DEFAULT NULL"); } catch(Exception $e) {}
try { $db->exec("ALTER TABLE taxi_users ADD COLUMN sozlesme_kabul_at DATETIME DEFAULT NULL"); } catch(Exception $e) {}
try { $db->exec("ALTER TABLE taxi_users ADD COLUMN terms_accepted_ip VARCHAR(45) DEFAULT NULL"); } catch(Exception $e) {}
// Sürücüye özel sözleşme alanları (belge yükleme sırasında)
try { $db->exec("ALTER TABLE taxi_users ADD COLUMN driver_terms_accepted_at DATETIME DEFAULT NULL"); } catch(Exception $e) {}
try { $db->exec("ALTER TABLE taxi_users ADD COLUMN driver_terms_version VARCHAR(20) DEFAULT NULL"); } catch(Exception $e) {}
try { $db->exec("ALTER TABLE taxi_users ADD COLUMN driver_terms_ip VARCHAR(45) DEFAULT NULL"); } catch(Exception $e) {}
// Sahibe özel sözleşme alanları (ilk talep sırasında)
try { $db->exec("ALTER TABLE taxi_users ADD COLUMN owner_terms_accepted_at DATETIME DEFAULT NULL"); } catch(Exception $e) {}
try { $db->exec("ALTER TABLE taxi_users ADD COLUMN owner_terms_version VARCHAR(20) DEFAULT NULL"); } catch(Exception $e) {}
try { $db->exec("ALTER TABLE taxi_users ADD COLUMN owner_terms_ip VARCHAR(45) DEFAULT NULL"); } catch(Exception $e) {}

// v1.2 sözleşmesini seed et (tablo boşsa)
try {
    $cnt = (int)$db->query("SELECT COUNT(*) FROM taxi_contracts")->fetchColumn();
    if ($cnt === 0) {
        $sozlesmeV12 = file_get_contents(__DIR__ . '/../sozlesme.md');
        if ($sozlesmeV12) {
            $stmt = $db->prepare("INSERT INTO taxi_contracts (surum, icerik, yururluk_tarihi, aktif) VALUES ('1.2', ?, '2026-10-27', 1)");
            $stmt->execute([$sozlesmeV12]);
        }
    }
} catch (Exception $e) {}

// admin_notifications tablosu
try {
    $db->exec("CREATE TABLE IF NOT EXISTS admin_notifications (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        kaynak     ENUM('patimera','pet_taxi') NOT NULL DEFAULT 'patimera',
        tip        VARCHAR(50)  NOT NULL,
        baslik     VARCHAR(255) NOT NULL,
        icerik     VARCHAR(500) DEFAULT NULL,
        link       VARCHAR(500) DEFAULT NULL,
        okundu_mu  TINYINT(1)  NOT NULL DEFAULT 0,
        created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_okundu (okundu_mu),
        INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Exception $e) {}

// ----------------------------------------------------------------
// Sürücü Onboarding v2 — Helper fonksiyonlar
// ----------------------------------------------------------------

function adminNotify($db, $tip, $baslik, $icerik = '', $link = '', $kaynak = 'pet_taxi') {
    try {
        $db->prepare("INSERT INTO admin_notifications (kaynak, tip, baslik, icerik, link) VALUES (?,?,?,?,?)")
           ->execute([$kaynak, $tip, $baslik, $icerik ?: null, $link ?: null]);
    } catch (Exception $e) {
        error_log('adminNotify: ' . $e->getMessage());
    }
}

// ── Mesaj içerik filtresi (telefon, e-posta, küfür) ──────────────
function taxiFilterMessage(string $text): array
{
    // 1. Telefon numarası engelle
    if (preg_match('/(\+?90\s?)?(0?5\d{2})[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/', $text)) {
        return ['valid' => false, 'error' => 'Güvenlik kuralları gereği telefon numarası paylaşılamaz.'];
    }
    // 2. E-posta engelle (mention @İsim ile karışmaması için domain uzantısı zorunlu)
    if (preg_match('/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/', $text)) {
        return ['valid' => false, 'error' => 'Güvenlik kuralları gereği e-posta adresi paylaşılamaz.'];
    }
    // 3. Küfür maskele
    static $badWords = ['amk','aq','sik','siktir','oç','piç','yarak','yarrak','kaşar','orospu',
        'gavat','pezevenk','sürtük','göt','amcık','şerefsiz','haysiyetsiz','gerizekalı','salak','manyak','aptal'];
    $filtered = $text;
    foreach ($badWords as $word) {
        $pattern = '/\b' . preg_quote($word, '/') . '\b/iu';
        if (preg_match($pattern, $filtered)) {
            $filtered = preg_replace($pattern, str_repeat('*', mb_strlen($word)), $filtered);
        }
    }
    return ['valid' => true, 'message' => $filtered];
}

function driverValidateStep1(array $d): array
{
    $e = [];
    if (empty($d['profil_foto']) && empty($d['profil_foto_mevcut']))  $e[] = 'Profil fotoğrafı zorunludur.';
    if (empty($d['ehliyet_on']) && empty($d['ehliyet_on_mevcut']))    $e[] = 'Ehliyet ön yüzü zorunludur.';
    if (empty($d['ehliyet_arka']) && empty($d['ehliyet_arka_mevcut'])) $e[] = 'Ehliyet arka yüzü zorunludur.';
    if (empty($d['adli_sicil']) && empty($d['adli_sicil_mevcut']))    $e[] = 'Adli sicil belgesi zorunludur.';
    foreach (['profil_foto','ehliyet_on','ehliyet_arka','adli_sicil'] as $f) {
        if (!empty($d[$f]) && strlen($d[$f]) > 2_700_000)
            $e[] = ucfirst(str_replace('_',' ',$f)) . ' 2 MB limitini aşıyor.';
    }
    return $e;
}

function driverValidateStep2(array $d): array
{
    $e = [];
    $yr = (int)date('Y');
    if (empty(trim($d['marka']  ?? ''))) $e[] = 'Araç markası zorunludur.';
    if (empty(trim($d['model']  ?? ''))) $e[] = 'Araç modeli zorunludur.';
    $yil = (int)($d['yil'] ?? 0);
    if ($yil < 2000 || $yil > $yr + 1)  $e[] = "Araç yılı 2000–{$yr} arasında olmalıdır.";
    $plaka = preg_replace('/\s/','', strtoupper($d['plaka'] ?? ''));
    if (empty($plaka))                   $e[] = 'Plaka zorunludur.';
    elseif (!preg_match('/^[0-9]{2}[A-Z]{1,3}[0-9]{2,4}$/', $plaka)) $e[] = 'Geçerli bir Türk plakası giriniz (örn: 34ABC123).';
    if (empty($d['ruhsat_foto']) && empty($d['ruhsat_foto_mevcut']))   $e[] = 'Araç ruhsatı fotoğrafı zorunludur.';
    $icGorseller = $d['ic_gorseller'] ?? [];
    if (empty($icGorseller) && empty($d['ic_gorseller_mevcut']))       $e[] = 'En az 1 araç içi görsel zorunludur.';
    if (count($icGorseller) > 6)                                       $e[] = 'En fazla 6 araç içi görsel yükleyebilirsiniz.';
    foreach ($icGorseller as $i => $foto) {
        if (strlen($foto) > 2_700_000) $e[] = ($i+1).'. görsel 2 MB limitini aşıyor.';
    }
    if (empty($d['klima_taahhut'])) $e[] = 'Klima/havalandırma taahhüdü zorunludur.';
    return $e;
}

function driverValidateStep3(array $d, PDO $db): array
{
    $e = [];
    $hayvanlar = $d['hayvan_turleri'] ?? [];
    if (empty($hayvanlar) || !is_array($hayvanlar)) {
        $e[] = 'En az bir hayvan türü seçmelisiniz.';
    } else {
        $ph   = implode(',', array_fill(0, count($hayvanlar), '?'));
        $stmt = $db->prepare("SELECT COUNT(*) FROM animal_types WHERE id IN ($ph)");
        $stmt->execute(array_map('intval', $hayvanlar));
        if ((int)$stmt->fetchColumn() !== count($hayvanlar)) $e[] = 'Geçersiz hayvan türü seçimi.';
    }
    $ekipmanlar = $d['ekipmanlar'] ?? [];
    if (!empty($ekipmanlar)) {
        $ph   = implode(',', array_fill(0, count($ekipmanlar), '?'));
        $stmt = $db->prepare("SELECT COUNT(*) FROM equipments WHERE id IN ($ph)");
        $stmt->execute(array_map('intval', $ekipmanlar));
        if ((int)$stmt->fetchColumn() !== count($ekipmanlar)) $e[] = 'Geçersiz ekipman seçimi.';
    }
    if (empty($d['allerji_beyan'])) $e[] = 'Alerji beyanı zorunludur.';
    return $e;
}

function driverValidateStep4(array $d): array
{
    return empty($d['kurallar_kabul']) ? ['Pet taşıma kurallarını kabul etmeniz zorunludur.'] : [];
}

function driverUpdateRow(PDO $db, int $driverId, array $data): void
{
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($data)));
    $db->prepare("UPDATE drivers SET $sets WHERE id = ?")->execute([...array_values($data), $driverId]);
}

// ----------------------------------------------------------------
// Routing
// ----------------------------------------------------------------
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($action) {

    // ============================================================
    // AUTH
    // ============================================================

    /**
     * POST /taxi.php?action=forgot_password
     * Body: { email }
     */
    case 'forgot_password':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $input = getJsonInput();
        $email = trim(strtolower($input['email'] ?? ''));
        if (!$email) jsonResponse(['success' => false, 'error' => 'E-posta gereklidir']);

        $stmt = $db->prepare("SELECT id, ad_soyad FROM taxi_users WHERE email = ?");
        $stmt->execute([$email]);
        $foundUser = $stmt->fetch();

        // Email numaralandırmayı engellemek için her durumda başarı döndür
        if ($foundUser) {
            $otp     = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $expires = date('Y-m-d H:i:s', time() + 900);
            $db->prepare("UPDATE taxi_users SET reset_token = ?, reset_token_expires = ? WHERE id = ?")
               ->execute([$otp, $expires, $foundUser['id']]);

            try {
                if (!class_exists('Mail')) {
                    require_once dirname(dirname(__DIR__)) . '/core/Mail.php';
                }
                $body = '
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#0f172a;color:#f8fafc;border-radius:12px;">
                    <h2 style="color:#f59e0b;">🚕 Pet Taxi — Şifre Sıfırlama</h2>
                    <p>Merhaba ' . htmlspecialchars($foundUser['ad_soyad']) . ',</p>
                    <p>Şifrenizi sıfırlamak için aşağıdaki kodu kullanın. Kod <strong>15 dakika</strong> geçerlidir.</p>
                    <div style="text-align:center;margin:24px 0;">
                        <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:#f59e0b;">' . $otp . '</span>
                    </div>
                    <p style="color:#94a3b8;font-size:12px;">Bu isteği siz yapmadıysanız bu e-postayı dikkate almayınız.</p>
                </div>';
                Mail::send($email, 'Pet Taxi — Şifre Sıfırlama Kodunuz', $body);
            } catch (\Exception $e) {}
        }
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=reset_password
     * Body: { email, otp, yeni_sifre }
     */
    case 'reset_password':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $input     = getJsonInput();
        $email     = trim(strtolower($input['email'] ?? ''));
        $otp       = trim($input['otp'] ?? '');
        $yeniSifre = $input['yeni_sifre'] ?? '';

        if (!$email || !$otp || !$yeniSifre) jsonResponse(['success' => false, 'error' => 'Tüm alanlar gereklidir']);
        if (strlen($yeniSifre) < 6)           jsonResponse(['success' => false, 'error' => 'Şifre en az 6 karakter olmalıdır']);

        $stmt = $db->prepare("SELECT id FROM taxi_users WHERE email = ? AND reset_token = ? AND reset_token_expires > NOW()");
        $stmt->execute([$email, $otp]);
        $foundUser = $stmt->fetch();
        if (!$foundUser) jsonResponse(['success' => false, 'error' => 'Geçersiz veya süresi dolmuş kod. Tekrar deneyin.']);

        $hash = password_hash($yeniSifre, PASSWORD_DEFAULT);
        $db->prepare("UPDATE taxi_users SET sifre = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?")
           ->execute([$hash, $foundUser['id']]);
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=login
     * Body: { email, sifre }
     */
    case 'login':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $input = getJsonInput();
        $email = trim($input['email'] ?? '');
        $sifre = $input['sifre'] ?? '';
        if (!$email || !$sifre) {
            jsonResponse(['success' => false, 'error' => 'Email ve şifre zorunludur']);
        }
        $stmt = $db->prepare("SELECT * FROM taxi_users WHERE email = ? AND durum = 'aktif'");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if (!$user || !password_verify($sifre, $user['sifre'])) {
            jsonResponse(['success' => false, 'error' => 'Email veya şifre hatalı']);
        }
        // Token oluştur
        $token = generateToken($user['id']);
        $expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));
        $stmt = $db->prepare("INSERT INTO taxi_user_tokens (user_id, token, device_info, expires_at) VALUES (?, ?, ?, ?)");
        $stmt->execute([$user['id'], $token, 'pet_taxi_app', $expiresAt]);
        unset($user['sifre']);
        jsonResponse(['success' => true, 'token' => $token, 'expires_at' => $expiresAt, 'user' => $user]);

    /**
     * POST /taxi.php?action=logout
     * Header: Authorization: Bearer <token>
     */
    case 'logout':
        $user = requireAuth();
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        $token = substr($header, 7);
        $stmt = $db->prepare("DELETE FROM taxi_user_tokens WHERE token = ?");
        $stmt->execute([$token]);
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=delete_account
     * Header: Authorization: Bearer <token>
     * Body: { sifre: string }  — password confirmation required
     */
    case 'delete_account':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST required'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $sifre = $input['sifre'] ?? '';
        if (empty($sifre) || !password_verify($sifre, $user['sifre'])) {
            jsonResponse(['success' => false, 'error' => 'Incorrect password.']);
        }
        $uid = $user['id'];
        // Revoke all tokens
        $db->prepare("DELETE FROM taxi_user_tokens WHERE user_id = ?")->execute([$uid]);
        // Remove dogs
        $db->prepare("DELETE FROM taxi_dogs WHERE sahip_id = ?")->execute([$uid]);
        // Cancel open requests (taxi_requests — eski kod yanlış tablo adı kullanıyordu)
        $db->prepare("UPDATE taxi_requests SET durum='iptal' WHERE sahip_id=? AND durum IN ('bekliyor','eslesti')")->execute([$uid]);
        // Bu taleplere ait aktif eşleşmeleri de iptal et
        $db->prepare("
            UPDATE taxi_matches tm
            INNER JOIN taxi_requests tr ON tr.id = tm.talep_id
            SET tm.durum = 'iptal'
            WHERE tr.sahip_id = ? AND tm.durum NOT IN ('iptal','tamamlandi')
        ")->execute([$uid]);
        // Delete the account (soft-delete: mark inactive, keep history)
        $db->prepare("UPDATE taxi_users SET email = CONCAT('deleted_', id, '_', email), is_active = 0, ad_soyad = 'Deleted User' WHERE id = ?")->execute([$uid]);
        adminNotify($db, 'uye_silindi', 'Pet Taxi üye hesabı silindi', "Kullanıcı ID: $uid");
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=register_push_token
     * Body: { push_token: string }
     */
    case 'register_push_token':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST required'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        // Client fcm_token veya push_token gönderebilir
        $token = trim($input['fcm_token'] ?? $input['push_token'] ?? '');
        if (!$token) jsonResponse(['success' => false, 'error' => 'fcm_token required']);
        $db->prepare("UPDATE taxi_users SET fcm_token = ? WHERE id = ?")->execute([$token, $user['id']]);
        jsonResponse(['success' => true, 'saved' => true]);

    /**
     * GET /taxi.php?action=get_notifications
     */
    case 'get_notifications':
        $user  = requireAuth();
        // id sıralaması: canlı tablo schema.sql ile kurulduysa created_at yerine 'tarih' sütunu var
        $stmt  = $db->prepare("SELECT * FROM taxi_notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30");
        $stmt->execute([$user['id']]);
        $notifs = $stmt->fetchAll();
        jsonResponse(['success' => true, 'notifications' => $notifs]);

    /**
     * GET /taxi.php?action=get_unread_counts
     */
    case 'get_unread_counts':
        $user = requireAuth();
        $stmt = $db->prepare("SELECT COUNT(*) FROM taxi_notifications WHERE user_id = ? AND okundu_mu = 0");
        $stmt->execute([$user['id']]);
        $count = (int)$stmt->fetchColumn();

        $supportCount = 0;
        try {
            $stmt2 = $db->prepare("SELECT COUNT(*) FROM taxi_support_messages WHERE user_id = ? AND gonderen='admin' AND okundu=0");
            $stmt2->execute([$user['id']]);
            $supportCount = (int)$stmt2->fetchColumn();
        } catch (Exception $e) {}

        jsonResponse(['success' => true, 'unread_notifications' => $count, 'unread_support' => $supportCount]);

    /**
     * POST /taxi.php?action=mark_notifications_read
     */
    case 'mark_notifications_read':
        $user = requireAuth();
        $db->prepare("UPDATE taxi_notifications SET okundu_mu = 1 WHERE user_id = ?")->execute([$user['id']]);
        jsonResponse(['success' => true]);

    /**
     * GET /taxi.php?action=me
     */
    case 'me':
        $user = requireAuth();
        // Auto-pasif: sürücü belgelerini yüklemedi ve süre doldu
        if (($user['rol'] ?? '') === 'surucu'
            && ($user['sertifika_durumu'] ?? '') === 'onaylandi'
            && ($user['durum'] ?? '') === 'aktif'
            && !empty($user['arac_belgeler_deadline'])
            && ($user['arac_belgeler_durum'] ?? 'yok') !== 'onaylandi'
            && strtotime($user['arac_belgeler_deadline']) < time()
        ) {
            try {
                $db->prepare("UPDATE taxi_users SET durum='pasif' WHERE id=?")->execute([$user['id']]);
                taxiNotify($db, $user['id'], 'Hesabınız Pasife Alındı',
                    'Araç muayene ve trafik sigortası belgelerini yükleme süreniz doldu. Hesabınız pasife alındı. Belgeleri yükleyerek hesabınızı yeniden aktifleştirebilirsiniz.',
                    'sistem');
            } catch (Exception $e) {}
            $user['durum'] = 'pasif';
        }
        unset($user['sifre']);
        jsonResponse(['success' => true, 'user' => $user]);

    /**
     * GET /taxi.php?action=driver_status
     * Sürücünün doğrulama durumunu döndür
     */
    case 'driver_status':
        $user = requireAuth();
        if ($user['rol'] !== 'surucu') jsonResponse(['success' => false, 'error' => 'Sürücü değil'], 403);
        $stmt = $db->prepare("SELECT sertifika_durumu, red_nedeni, ehliyet_on, ehliyet_arka, arac_modeli, plaka, uzun_yol, sehir_ici_trafik, kopek_deneyimi FROM taxi_users WHERE id=?");
        $stmt->execute([$user['id']]);
        $info = $stmt->fetch();
        jsonResponse(['success' => true, 'driver_info' => $info]);

    /**
     * POST /taxi.php?action=update_driver_info
     * Sürücü bilgilerini güncelle (ehliyet, araç, deneyim)
     * Body: { ehliyet_on_base64?, ehliyet_arka_base64?, arac_modeli?, plaka?,
     *         uzun_yol?, sehir_ici_trafik?, kopek_deneyimi? }
     */
    case 'update_driver_info':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user = requireAuth();
        if ($user['rol'] !== 'surucu') jsonResponse(['success' => false, 'error' => 'Sürücü değil'], 403);
        $input = getJsonInput();

        $uploadDir = dirname(dirname(__DIR__)) . '/public_html/pet_taxi/uploads/ehliyet/';
        if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
        $baseUrl = 'https://patimera.com/pet_taxi/uploads/ehliyet/';

        $sets = [];
        $vals = [];

        foreach (['ehliyet_on', 'ehliyet_arka'] as $side) {
            $b64key = $side . '_base64';
            if (!empty($input[$b64key])) {
                $b64 = preg_replace('/^data:image\/\w+;base64,/', '', $input[$b64key]);
                $data = base64_decode($b64);
                if ($data) {
                    $fname = $side . '_' . $user['id'] . '_' . time() . '.jpg';
                    file_put_contents($uploadDir . $fname, $data);
                    $sets[] = "$side = ?";
                    $vals[] = $baseUrl . $fname;
                }
            }
        }

        foreach (['arac_modeli', 'plaka'] as $f) {
            if (isset($input[$f])) { $sets[] = "$f = ?"; $vals[] = trim($input[$f]); }
        }
        foreach (['uzun_yol', 'sehir_ici_trafik', 'kopek_deneyimi'] as $f) {
            if (isset($input[$f])) { $sets[] = "$f = ?"; $vals[] = $input[$f] ? 1 : 0; }
        }

        if (empty($sets)) jsonResponse(['success' => false, 'error' => 'Güncellenecek alan yok']);

        // Tüm zorunlu alanlar doluysa sertifika_durumu = 'beklemede' yap
        $vals[] = $user['id'];
        $db->prepare("UPDATE taxi_users SET " . implode(', ', $sets) . " WHERE id=?")->execute($vals);

        // Kontrol et: hem ehliyet hem araç bilgisi varsa -> beklemede
        $chk = $db->prepare("SELECT ehliyet_on, ehliyet_arka, arac_modeli, plaka, sertifika_durumu FROM taxi_users WHERE id=?");
        $chk->execute([$user['id']]);
        $cur = $chk->fetch();
        if ($cur['ehliyet_on'] && $cur['ehliyet_arka'] && $cur['arac_modeli'] && $cur['plaka']
            && !in_array($cur['sertifika_durumu'], ['onaylandi'])) {
            $db->prepare("UPDATE taxi_users SET sertifika_durumu='beklemede' WHERE id=?")->execute([$user['id']]);
        }

        $stmt = $db->prepare("SELECT * FROM taxi_users WHERE id=?");
        $stmt->execute([$user['id']]);
        $updated = $stmt->fetch();
        unset($updated['sifre']);
        jsonResponse(['success' => true, 'user' => $updated]);

    /**
     * POST /taxi.php?action=update_profile
     * Body: { ad_soyad?, telefon?, sehir?, ilce? }
     */
    case 'update_profile':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $sets  = [];
        $vals  = [];
        $allowed = ['ad_soyad', 'telefon', 'sehir', 'ilce', 'adres'];
        foreach ($allowed as $field) {
            if (isset($input[$field])) {
                $sets[] = "$field = ?";
                $vals[] = trim($input[$field]);
            }
        }
        if (empty($sets)) jsonResponse(['success' => false, 'error' => 'Güncellenecek alan yok']);
        $vals[] = $user['id'];
        $db->prepare("UPDATE taxi_users SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
        $stmt = $db->prepare("SELECT * FROM taxi_users WHERE id=?");
        $stmt->execute([$user['id']]);
        $updated = $stmt->fetch();
        unset($updated['sifre']);
        jsonResponse(['success' => true, 'user' => $updated]);

    /**
     * POST /taxi.php?action=update_bank_info
     * Sürücü banka bilgilerini güncelle. Body: { iban, banka_adi, hesap_sahibi }
     */
    case 'update_bank_info':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $iban          = strtoupper(preg_replace('/[\s\-]/', '', trim($input['iban'] ?? '')));
        $banka_adi     = trim($input['banka_adi']    ?? '');
        $hesap_sahibi  = trim($input['hesap_sahibi'] ?? '');
        $hesap_tipi    = in_array($input['hesap_tipi'] ?? '', ['bireysel','kurumsal']) ? $input['hesap_tipi'] : 'bireysel';
        $tc_no         = preg_replace('/\D/', '', $input['tc_no'] ?? '');
        $firma_unvani  = trim($input['firma_unvani']  ?? '');
        $vergi_dairesi = trim($input['vergi_dairesi'] ?? '');
        $vergi_no      = preg_replace('/\D/', '', $input['vergi_no'] ?? '');
        if ($iban && !preg_match('/^TR\d{24}$/', $iban)) {
            jsonResponse(['success' => false, 'error' => 'Geçersiz IBAN formatı. TR ile başlayan 26 karakter olmalı.']);
        }
        if ($hesap_tipi === 'bireysel' && $tc_no && strlen($tc_no) !== 11) {
            jsonResponse(['success' => false, 'error' => 'TC Kimlik No 11 haneli olmalıdır.']);
        }
        if ($hesap_tipi === 'kurumsal' && $vergi_no && strlen($vergi_no) !== 10) {
            jsonResponse(['success' => false, 'error' => 'Vergi No 10 haneli olmalıdır.']);
        }
        $db->prepare("UPDATE taxi_users SET iban=?, banka_adi=?, hesap_sahibi=?, hesap_tipi=?, tc_no=?, firma_unvani=?, vergi_dairesi=?, vergi_no=? WHERE id=?")
           ->execute([$iban ?: null, $banka_adi ?: null, $hesap_sahibi ?: null, $hesap_tipi,
                      $tc_no ?: null, $firma_unvani ?: null, $vergi_dairesi ?: null, $vergi_no ?: null, $user['id']]);
        $stmt = $db->prepare("SELECT * FROM taxi_users WHERE id=?");
        $stmt->execute([$user['id']]);
        $updated = $stmt->fetch();
        unset($updated['sifre']);
        jsonResponse(['success' => true, 'user' => $updated]);

    // ============================================================
    // TAKSİ TALEPLERİ (OWNER — Köpek sahibi)
    // ============================================================

    /**
     * POST /taxi.php?action=create_request
     * Yeni ulaşım talebi oluştur.
     * Body: {
     *   kopek_id, kalkis_zamani,
     *   baslangic_noktasi, baslangic_sehir, baslangic_ilce,
     *   baslangic_lat?, baslangic_lon?,
     *   varis_noktasi, varis_sehir, varis_ilce,
     *   varis_lat?, varis_lon?,
     *   tahmini_mesafe?, toplam_ucret?, tip?, ozel_talepler?
     * }
     */
    case 'create_request':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user = requireAuth();

        $input = getJsonInput();

        // İlk talep öncesi sahip sözleşmesi kontrolü
        if (empty($user['owner_terms_accepted_at'])) {
            $ownerTermsVer = trim($input['owner_terms_version'] ?? '');
            if (!$ownerTermsVer) {
                $aktifSurum = $db->query("SELECT surum FROM taxi_contracts WHERE aktif=1 ORDER BY id DESC LIMIT 1")->fetchColumn();
                jsonResponse([
                    'success'          => false,
                    'error'            => 'İlk yolculuğunuzdan önce yolculuk koşullarını kabul etmeniz gerekiyor.',
                    'error_code'       => 'OWNER_TERMS_REQUIRED',
                    'required_version' => $aktifSurum ?: null,
                ]);
            }
            $chkOT = $db->prepare("SELECT id FROM taxi_contracts WHERE surum=? AND aktif=1");
            $chkOT->execute([$ownerTermsVer]);
            if (!$chkOT->fetch()) {
                jsonResponse(['success' => false, 'error' => 'Geçersiz sözleşme sürümü'], 400);
            }
            $ownerIp = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '')[0]);
            $db->prepare("UPDATE taxi_users SET owner_terms_accepted_at=NOW(), owner_terms_version=?, owner_terms_ip=? WHERE id=?")
               ->execute([$ownerTermsVer, $ownerIp ?: null, $user['id']]);
        }

        // Zorunlu alanlar
        $required = ['kopek_id','kalkis_zamani','baslangic_noktasi','baslangic_sehir','baslangic_ilce','varis_noktasi','varis_sehir','varis_ilce'];
        foreach ($required as $field) {
            if (empty($input[$field])) {
                jsonResponse(['success' => false, 'error' => "'{$field}' alanı zorunludur"]);
            }
        }
        // Madde 5/4: güvenli taşıma kutusu/kafes/göğüs tasması taahhüdü zorunludur
        if (empty($input['ekipman_taahhut'])) {
            jsonResponse(['success' => false, 'error' => 'Hayvanınızı güvenli taşıma kutusu/kafes/göğüs tasması ile teslim edeceğinizi onaylamanız zorunludur (Madde 5/4).']);
        }

        // Köpek sahipliği doğrula
        $stmt = $db->prepare("SELECT id FROM taxi_dogs WHERE id = ? AND sahip_id = ? AND durum = 'aktif'");
        $stmt->execute([$input['kopek_id'], $user['id']]);
        if (!$stmt->fetch()) {
            jsonResponse(['success' => false, 'error' => 'Köpek bulunamadı veya size ait değil']);
        }

        $mesafe = isset($input['tahmini_mesafe']) && (float)$input['tahmini_mesafe'] > 0
            ? round((float)$input['tahmini_mesafe'], 2)
            : null;

        // Koordinatlar varsa sunucu tarafında mesafeyi de hesapla:
        // 1) Koordinat yoksa istemcinin gönderdiği mesafeyi kullan
        // 2) Mesafe gönderilmemişse koordinatlardan Haversine hesapla (kuş uçuşu fallback)
        // 3) Google Maps road distance'ı en doğrusudur — fare_estimate zaten bunu kullandı
        $slat = isset($input['baslangic_lat']) ? (float)$input['baslangic_lat'] : null;
        $slon = isset($input['baslangic_lon']) ? (float)$input['baslangic_lon'] : null;
        $dlat = isset($input['varis_lat'])     ? (float)$input['varis_lat']     : null;
        $dlon = isset($input['varis_lon'])     ? (float)$input['varis_lon']     : null;

        if ($mesafe === null && $slat && $slon && $dlat && $dlon) {
            // Haversine (kuş uçuşu) — fare_estimate'ten farklı koordinatlar gelirse fallback
            $R    = 6371;
            $dLt  = deg2rad($dlat - $slat);
            $dLn  = deg2rad($dlon - $slon);
            $a    = sin($dLt/2)**2 + cos(deg2rad($slat)) * cos(deg2rad($dlat)) * sin($dLn/2)**2;
            $mesafe = round($R * 2 * atan2(sqrt($a), sqrt(1-$a)), 2);
        }

        // Sunucu tarafında minimum ücret hesapla (kilometre bazlı, geçiş ücretleri hariç)
        $serverMinFare = $mesafe ? calculateFare($db, $mesafe) : null;

        $toplamUcret = isset($input['toplam_ucret']) && (float)$input['toplam_ucret'] > 0
            ? (float)$input['toplam_ucret']
            : ($serverMinFare ?? 50.0);

        // Fare doğrulaması: istemcinin ücretini sun tarafıyla karşılaştır.
        // %20 tolerans var (geçiş ücretleri, indirim vs. hesaba katılıyor).
        // İstemci sunucunun hesapladığından az gönderiyorsa düzelt.
        if ($serverMinFare !== null && $toplamUcret < $serverMinFare * 0.80) {
            $toplamUcret = $serverMinFare;
        }

        $db->beginTransaction();
        try {
            // FOR UPDATE: kullanıcı satırını kilitle.
            // İki eşzamanlı istek gelirse biri diğeri commit edene kadar bekler;
            // ikincisi güncel (düşülmüş) bakiyeyi görür.
            $stmtBak = $db->prepare("SELECT cuzdan_bakiyesi FROM taxi_users WHERE id=? FOR UPDATE");
            $stmtBak->execute([$user['id']]);
            $bakiye = (float)($stmtBak->fetchColumn() ?? 0);

            if ($bakiye < $toplamUcret) {
                $db->rollBack();
                jsonResponse([
                    'success'    => false,
                    'error'      => 'Cüzdanınızda yeterli bakiye yok.',
                    'error_code' => 'INSUFFICIENT_BALANCE',
                    'bakiye'     => $bakiye,
                    'gereken'    => $toplamUcret,
                ]);
            }

            // Talebi oluştur
            $stmt = $db->prepare("
                INSERT INTO taxi_requests
                    (sahip_id, kopek_id,
                     baslangic_noktasi, baslangic_sehir, baslangic_ilce, baslangic_lat, baslangic_lon,
                     varis_noktasi, varis_sehir, varis_ilce, varis_lat, varis_lon,
                     kalkis_zamani, tahmini_mesafe, toplam_ucret, tip, ozel_talepler,
                     agresyon_gecmisi, agresyon_aciklama, agizlik_taahhut, teslim_pin, ekipman_taahhut)
                VALUES
                    (?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?,
                     ?, ?, ?, ?, ?)
            ");
            $teslimPin = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            $stmt->execute([
                $user['id'],
                $input['kopek_id'],
                $input['baslangic_noktasi'],
                $input['baslangic_sehir'],
                $input['baslangic_ilce'],
                $input['baslangic_lat'] ?? null,
                $input['baslangic_lon'] ?? null,
                $input['varis_noktasi'],
                $input['varis_sehir'],
                $input['varis_ilce'],
                $input['varis_lat'] ?? null,
                $input['varis_lon'] ?? null,
                $input['kalkis_zamani'],
                $mesafe,
                $toplamUcret,
                $input['tip'] ?? 'anlik',
                $input['ozel_talepler'] ?? null,
                isset($input['agresyon_gecmisi']) ? (int)(bool)$input['agresyon_gecmisi'] : 0,
                !empty($input['agresyon_aciklama']) ? trim($input['agresyon_aciklama']) : null,
                isset($input['agizlik_taahhut'])   ? (int)(bool)$input['agizlik_taahhut']   : 0,
                $teslimPin,
                isset($input['ekipman_taahhut'])   ? (int)(bool)$input['ekipman_taahhut']   : 0,
            ]);
            $talepId = (int)$db->lastInsertId();

            // Ücret düş — WHERE guard: bakiye yeterli değilse (race window kapandı ama yine de)
            $upd = $db->prepare(
                "UPDATE taxi_users SET cuzdan_bakiyesi = cuzdan_bakiyesi - ? WHERE id=? AND cuzdan_bakiyesi >= ?"
            );
            $upd->execute([$toplamUcret, $user['id'], $toplamUcret]);
            if ($upd->rowCount() === 0) {
                // FOR UPDATE'e rağmen bakiye yetmedi (teorik edge case)
                $db->rollBack();
                jsonResponse([
                    'success'    => false,
                    'error'      => 'Cüzdanınızda yeterli bakiye yok.',
                    'error_code' => 'INSUFFICIENT_BALANCE',
                ]);
            }

            $db->prepare("UPDATE taxi_requests SET odeme_durumu='odendi' WHERE id=?")->execute([$talepId]);

            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['success' => false, 'error' => 'Talep oluşturulamadı: ' . $e->getMessage()], 500);
        }

        $pickupStr  = trim(($input['baslangic_ilce'] ?? '') . ', ' . ($input['baslangic_sehir'] ?? ''), ', ');
        $dropoffStr = trim(($input['varis_ilce']    ?? '') . ', ' . ($input['varis_sehir']    ?? ''), ', ');
        taxiNotifyAllDrivers($db, '🐾 Yeni Pet Taxi Talebi', "{$pickupStr} → {$dropoffStr}", 'yeni_talep');
        adminNotify($db, 'yeni_talep', "Yeni Pet Taxi talebi #{$talepId}", "{$pickupStr} → {$dropoffStr}", '/admin/taxi-requests.php');
        jsonResponse(['success' => true, 'talep_id' => $talepId, 'toplam_ucret' => $toplamUcret]);

    /**
     * GET /taxi.php?action=my_requests
     * Sahibin kendi talepleri
     */
    case 'my_requests':
        $user   = requireAuth();
        $page   = max(1, (int)($_GET['page'] ?? 1));
        $limit  = 20;
        $offset = ($page - 1) * $limit;
        $stmt = $db->prepare("
            SELECT tr.*,
                   d.isim  AS kopek_adi,
                   d.irk   AS kopek_irki,
                   tm.id   AS match_id,
                   tm.durum AS match_durum,
                   tm.surucu_id AS match_surucu_id,
                   u2.ad_soyad AS surucu_adi
            FROM taxi_requests tr
            INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
            LEFT JOIN taxi_matches tm ON tm.talep_id = tr.id AND tm.durum != 'iptal'
            LEFT JOIN taxi_users u2 ON u2.id = tm.surucu_id
            WHERE tr.sahip_id = ?
            ORDER BY tr.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$user['id'], $limit + 1, $offset]);
        $rows = $stmt->fetchAll();
        $hasMore = count($rows) > $limit;
        if ($hasMore) array_pop($rows);
        jsonResponse(['success' => true, 'requests' => $rows, 'has_more' => $hasMore, 'page' => $page]);

    /**
     * GET /taxi.php?action=request_detail&id=X
     */
    case 'request_detail':
        $user  = requireAuth();
        $talepId = (int)($_GET['id'] ?? 0);
        $stmt = $db->prepare("
            SELECT tr.*,
                   d.isim AS kopek_adi, d.irk AS kopek_irki, d.profil_resmi AS kopek_resmi,
                   u.ad_soyad AS sahip_adi, u.telefon AS sahip_telefon,
                   tm.id AS match_id, tm.durum AS match_durum,
                   tm.surucu_id AS match_surucu_id,
                   tm.baslama_zamani, tm.bitis_zamani, tm.gercek_mesafe,
                   tm.checkin_foto, tm.surucu_vardi_at,
                   u2.ad_soyad AS surucu_adi, u2.telefon AS surucu_telefon, u2.profil_resmi AS surucu_resmi
            FROM taxi_requests tr
            INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
            INNER JOIN taxi_users u ON u.id = tr.sahip_id
            LEFT JOIN taxi_matches tm ON tm.talep_id = tr.id AND tm.durum != 'iptal'
            LEFT JOIN taxi_users u2 ON u2.id = tm.surucu_id
            WHERE tr.id = ?
        ");
        $stmt->execute([$talepId]);
        $talep = $stmt->fetch();
        if (!$talep) jsonResponse(['success' => false, 'error' => 'Talep bulunamadı'], 404);
        // Yalnızca sahip veya sürücü görebilir
        if ($talep['sahip_id'] != $user['id'] && ($talep['match_surucu_id'] ?? null) != $user['id'] && $user['rol'] !== 'admin') {
            jsonResponse(['success' => false, 'error' => 'Erişim reddedildi'], 403);
        }
        // Teslim doğrulama kodu (PIN) yalnızca sahibe gösterilir (Madde 4/4)
        if ($talep['sahip_id'] != $user['id']) unset($talep['teslim_pin']);
        jsonResponse(['success' => true, 'request' => $talep]);

    /**
     * POST /taxi.php?action=cancel_request
     * Body: { talep_id, iptal_nedeni? }
     */
    /**
     * GET /taxi.php?action=get_cancel_fee&talep_id=X
     * İptal edilecek talep için ücret bilgisini döner (Madde 7).
     */
    case 'get_cancel_fee':
        $user    = requireAuth();
        $talepId = (int)($_GET['talep_id'] ?? 0);

        $stmt = $db->prepare("
            SELECT tr.durum, tr.toplam_ucret, tr.eslesti_at, tm.surucu_vardi_at
            FROM taxi_requests tr
            LEFT JOIN taxi_matches tm ON tm.talep_id = tr.id AND tm.durum NOT IN ('iptal','tamamlandi')
            WHERE tr.id = ? AND tr.sahip_id = ?
        ");
        $stmt->execute([$talepId, $user['id']]);
        $talep = $stmt->fetch();
        if (!$talep) jsonResponse(['success' => false, 'error' => 'Talep bulunamadı'], 404);

        $acilis = (float)($db->query("SELECT deger FROM taxi_settings WHERE anahtar='acilis_ucreti'")->fetchColumn() ?: 65);

        $durum   = $talep['durum'];
        $total   = (float)$talep['toplam_ucret'];

        if ($durum === 'bekliyor') {
            jsonResponse(['success' => true, 'fee' => 0, 'refund' => $total, 'free' => true, 'reason' => 'not_matched']);
        }

        // Kapıda: sürücü adrese vardıysa Madde 7/1 — %50 (ya da taban ücret, hangisi büyükse)
        if (!empty($talep['surucu_vardi_at'])) {
            $fee = max($acilis, $total * 0.5);
            jsonResponse(['success' => true, 'fee' => $fee, 'refund' => max(0, $total - $fee), 'free' => false, 'reason' => 'at_door', 'acilis_ucreti' => $acilis]);
        }

        $minutesSince = $talep['eslesti_at']
            ? (time() - strtotime($talep['eslesti_at'])) / 60
            : 999;

        if ($minutesSince <= 5) {
            $secsLeft = max(0, (int)(5 * 60 - (time() - strtotime($talep['eslesti_at']))));
            jsonResponse(['success' => true, 'fee' => 0, 'refund' => $total, 'free' => true, 'reason' => 'within_window', 'seconds_left' => $secsLeft]);
        }

        $fee = min($acilis, $total);
        jsonResponse(['success' => true, 'fee' => $fee, 'refund' => max(0, $total - $fee), 'free' => false, 'reason' => 'after_window', 'acilis_ucreti' => $acilis]);

    case 'cancel_request':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $talepId = (int)($input['talep_id'] ?? 0);

        $stmt = $db->prepare("SELECT * FROM taxi_requests WHERE id = ? AND sahip_id = ?");
        $stmt->execute([$talepId, $user['id']]);
        $talep = $stmt->fetch();
        if (!$talep) jsonResponse(['success' => false, 'error' => 'Talep bulunamadı'], 404);
        if (in_array($talep['durum'], ['tamamlandi','iptal'])) {
            jsonResponse(['success' => false, 'error' => 'Bu talep iptal edilemez']);
        }
        // Yolculuk başladıktan sonra iptal edilemez
        if (in_array($talep['durum'], ['basladi','teslim_bekleniyor'])) {
            jsonResponse(['success' => false, 'error' => 'Yolculuk başladıktan sonra iptal edilemez. Lütfen destek ile iletişime geçin.']);
        }

        // Eşleşmiş sürücüyü bul (bildirim için — transaction dışında, lock gerektirmiyor)
        $stmt = $db->prepare("SELECT surucu_id, surucu_vardi_at FROM taxi_matches WHERE talep_id = ? AND durum NOT IN ('iptal','tamamlandi') LIMIT 1");
        $stmt->execute([$talepId]);
        $surucu = $stmt->fetch();

        // İptal ücretini hesapla (Madde 7)
        $acilisUcret = (float)($db->query("SELECT deger FROM taxi_settings WHERE anahtar='acilis_ucreti'")->fetchColumn() ?: 65);
        $cancelFee   = 0.0;
        if (!empty($surucu['surucu_vardi_at'])) {
            // Kapıda iptal (Madde 7/1): %50 ya da taban ücret, hangisi büyükse
            $cancelFee = max($acilisUcret, (float)$talep['toplam_ucret'] * 0.5);
        } elseif ($talep['durum'] === 'eslesti') {
            $minutesSince = $talep['eslesti_at']
                ? (time() - strtotime($talep['eslesti_at'])) / 60
                : 999;
            if ($minutesSince > 5) {
                $cancelFee = min($acilisUcret, (float)$talep['toplam_ucret']);
            }
        }
        $refundAmount = max(0, (float)$talep['toplam_ucret'] - $cancelFee);

        $db->beginTransaction();
        try {
            // Satırı kilitle ve durumu tekrar doğrula (başka istek aynı anda işlemiş olabilir)
            $stmtLock = $db->prepare("SELECT durum, odeme_durumu, toplam_ucret, eslesti_at FROM taxi_requests WHERE id=? AND sahip_id=? FOR UPDATE");
            $stmtLock->execute([$talepId, $user['id']]);
            $fresh = $stmtLock->fetch();
            if (!$fresh || in_array($fresh['durum'], ['tamamlandi','iptal','basladi','teslim_bekleniyor'])) {
                $db->rollBack();
                jsonResponse(['success' => false, 'error' => 'Talep iptal edilemez (durum değişmiş olabilir)']);
            }
            // Transaction içinde de fee'yi taze veriyle yeniden hesapla (race condition koruması)
            $freshArrived = $db->prepare("SELECT surucu_vardi_at FROM taxi_matches WHERE talep_id=? AND durum NOT IN ('iptal','tamamlandi') LIMIT 1");
            $freshArrived->execute([$talepId]);
            $freshVardiAt = $freshArrived->fetchColumn();

            $freshFee = 0.0;
            if (!empty($freshVardiAt)) {
                $freshFee = max($acilisUcret, (float)$fresh['toplam_ucret'] * 0.5);
            } elseif ($fresh['durum'] === 'eslesti') {
                $minsF = $fresh['eslesti_at']
                    ? (time() - strtotime($fresh['eslesti_at'])) / 60
                    : 999;
                if ($minsF > 5) $freshFee = min($acilisUcret, (float)$fresh['toplam_ucret']);
            }
            $freshRefund = max(0, (float)$fresh['toplam_ucret'] - $freshFee);

            // Talebi ve eşleşmeyi iptal et
            $db->prepare("UPDATE taxi_requests SET durum='iptal', iptal_nedeni=?, iptal_ucreti=? WHERE id=?")
               ->execute([$input['iptal_nedeni'] ?? null, $freshFee, $talepId]);
            $db->prepare("UPDATE taxi_matches SET durum='iptal' WHERE talep_id=?")
               ->execute([$talepId]);

            // Ödeme yapıldıysa iade et (iptal ücreti düşülerek)
            if ($fresh['odeme_durumu'] === 'odendi') {
                if ($freshRefund > 0) {
                    $db->prepare("UPDATE taxi_users SET cuzdan_bakiyesi = cuzdan_bakiyesi + ? WHERE id=?")
                       ->execute([$freshRefund, $user['id']]);
                }
                $db->prepare("UPDATE taxi_requests SET odeme_durumu='iade_edildi' WHERE id=?")
                   ->execute([$talepId]);
            }

            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['success' => false, 'error' => 'İptal işlemi başarısız: ' . $e->getMessage()], 500);
        }

        // Bildirimler commit sonrasında gönderilir
        if ($surucu && $surucu['surucu_id']) {
            taxiNotify($db, (int)$surucu['surucu_id'],
                '❌ Talep İptal Edildi',
                'Sahip talebi iptal etti. Yolculuk havuzuna döndünüz.',
                'talep_iptal'
            );
        }
        jsonResponse(['success' => true, 'iptal_ucreti' => $cancelFee, 'iade' => $refundAmount]);

    /**
     * POST /taxi.php?action=driver_cancel_job
     * Sürücü kabul ettiği işi (yolculuk başlamadan) iptal eder (Madde 7/2).
     * Body: { match_id, sebep? } — sebep boşsa "keyfi iptal", doluysa "haklı ret" kodu
     *   (asisiz | saldirganlik | tasima_kutusu_yok | kacma_riski)
     */
    case 'driver_cancel_job':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        if (!in_array($user['rol'], ['surucu','admin'])) {
            jsonResponse(['success' => false, 'error' => 'Sadece sürücüler iptal edebilir'], 403);
        }
        $input   = getJsonInput();
        $matchId = (int)($input['match_id'] ?? 0);
        $sebep   = trim($input['sebep'] ?? '');

        $hakliRetEtiketleri = [
            'asisiz'             => 'Hayvan aşısız',
            'saldirganlik'       => 'Hayvan saldırgan davranış sergiledi',
            'tasima_kutusu_yok'  => 'Güvenli taşıma kutusu/kafes yok',
            'kacma_riski'        => 'Kaçma riski mevcut',
        ];
        $isHakliRet = isset($hakliRetEtiketleri[$sebep]);

        $stmt = $db->prepare("
            SELECT tm.*, tr.toplam_ucret, tr.odeme_durumu, tr.sahip_id
            FROM taxi_matches tm
            INNER JOIN taxi_requests tr ON tr.id = tm.talep_id
            WHERE tm.id = ? AND tm.surucu_id = ?
        ");
        $stmt->execute([$matchId, $user['id']]);
        $match = $stmt->fetch();
        if (!$match) jsonResponse(['success' => false, 'error' => 'İş bulunamadı'], 404);
        if ($match['durum'] !== 'kabul_edildi') {
            jsonResponse(['success' => false, 'error' => 'Yolculuk başladıktan sonra iptal edilemez.']);
        }

        if ($isHakliRet) {
            // Madde 7/2-1: Haklı ret — taban iptal ücreti kesilir, talep tamamen iptal olur
            $acilis = (float)($db->query("SELECT deger FROM taxi_settings WHERE anahtar='acilis_ucreti'")->fetchColumn() ?: 65);
            $total  = (float)$match['toplam_ucret'];
            $fee    = min($acilis, $total);
            $refund = max(0, $total - $fee);

            $db->beginTransaction();
            try {
                $db->prepare("UPDATE taxi_matches SET durum='iptal' WHERE id=?")->execute([$matchId]);
                $db->prepare("UPDATE taxi_requests SET durum='iptal', iptal_nedeni=?, iptal_ucreti=? WHERE id=?")
                   ->execute(['Sürücü haklı ret: ' . $hakliRetEtiketleri[$sebep], $fee, $match['talep_id']]);

                if ($match['odeme_durumu'] === 'odendi') {
                    if ($refund > 0) {
                        $db->prepare("UPDATE taxi_users SET cuzdan_bakiyesi = cuzdan_bakiyesi + ? WHERE id=?")
                           ->execute([$refund, $match['sahip_id']]);
                    }
                    $db->prepare("UPDATE taxi_requests SET odeme_durumu='iade_edildi' WHERE id=?")
                       ->execute([$match['talep_id']]);
                }
                $db->commit();
            } catch (Exception $e) {
                $db->rollBack();
                jsonResponse(['success' => false, 'error' => 'İşlem başarısız: ' . $e->getMessage()], 500);
            }

            taxiNotify($db, (int)$match['sahip_id'], '❌ Sürücü Hizmeti Reddetti',
                'Sürücü "' . $hakliRetEtiketleri[$sebep] . '" nedeniyle transferi gerçekleştiremedi. Taban iptal ücreti uygulandı.',
                'talep_iptal');

            jsonResponse(['success' => true, 'tip' => 'hakli_ret', 'iptal_ucreti' => $fee, 'iade' => $refund]);
        }

        // Madde 7/2-2: Keyfi iptal — talep havuza döner (sahip kesinti yaşamaz),
        // sürücünün keyfi iptal sayacı artar; mükerrer durumlarda hesap askıya alınır.
        $db->prepare("UPDATE taxi_matches SET durum='iptal' WHERE id=?")->execute([$matchId]);
        $db->prepare("UPDATE taxi_requests SET durum='bekliyor' WHERE id=?")->execute([$match['talep_id']]);

        $db->prepare("UPDATE taxi_users SET keyfi_iptal_sayisi = keyfi_iptal_sayisi + 1 WHERE id=?")->execute([$user['id']]);
        $stmtSayac = $db->prepare("SELECT keyfi_iptal_sayisi FROM taxi_users WHERE id=?");
        $stmtSayac->execute([$user['id']]);
        $yeniSayac = (int)$stmtSayac->fetchColumn();

        $KEYFI_IPTAL_ESIGI = 3;
        if ($yeniSayac >= $KEYFI_IPTAL_ESIGI) {
            $db->prepare("UPDATE taxi_users SET durum='pasif' WHERE id=?")->execute([$user['id']]);
            taxiNotify($db, $user['id'], '⚠️ Hesabınız Askıya Alındı',
                'Tekrarlayan keyfi iptaller nedeniyle hesabınız askıya alındı. Destek ile iletişime geçin.', 'sistem');
            adminNotify($db, 'surucu_askiya_alindi',
                "Sürücü #{$user['id']} mükerrer keyfi iptal nedeniyle askıya alındı",
                "Toplam keyfi iptal sayısı: {$yeniSayac}", '/admin/taxi-drivers.php');
        }

        // Sahibi bilgilendir
        taxiNotify($db, (int)$match['sahip_id'],
            '❌ Sürücü İptal Etti',
            'Sürücünüz işi iptal etti. Talebiniz yeniden havuza alındı.',
            'talep_iptal'
        );
        jsonResponse(['success' => true, 'tip' => 'keyfi']);

    // ============================================================
    // HAVUZ & EŞLEŞME (SÜRÜCÜ — Gezdirici rolü)
    // ============================================================

    /**
     * GET /taxi.php?action=pool
     * Sürücünün görebileceği açık talepler (bekliyor).
     * Query: sehir?, ilce?
     */
    case 'pool':
        $user = requireAuth();
        if (!in_array($user['rol'], ['surucu','admin'])) {
            jsonResponse(['success' => false, 'error' => 'Sadece sürücüler havuzu görebilir'], 403);
        }
        $sehir = $_GET['sehir'] ?? null;
        $ilce  = $_GET['ilce']  ?? null;

        $sql = "
            SELECT tr.*,
                   d.isim AS kopek_adi, d.irk AS kopek_irki,
                   d.huylu AS kopek_huylu, d.asili AS kopek_asili,
                   d.mikrocip_no AS kopek_mikrocip,
                   d.kuduz_asi_tarihi AS kopek_kuduz_asi,
                   d.karma_asi_tarihi AS kopek_karma_asi,
                   u.ad_soyad AS sahip_adi
            FROM taxi_requests tr
            INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
            INNER JOIN taxi_users u ON u.id = tr.sahip_id
            WHERE tr.durum = 'bekliyor'
        ";
        $params = [];
        if ($sehir) { $sql .= " AND tr.baslangic_sehir = ?"; $params[] = $sehir; }
        if ($ilce)  { $sql .= " AND tr.baslangic_ilce = ?";  $params[] = $ilce; }
        $sql .= " ORDER BY tr.kalkis_zamani ASC LIMIT 50";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $poolRows = $stmt->fetchAll();
        // Teslim doğrulama kodu (PIN) sürücüye asla gösterilmez (Madde 4/4)
        foreach ($poolRows as &$pr) { unset($pr['teslim_pin']); }
        unset($pr);
        jsonResponse(['success' => true, 'requests' => $poolRows]);

    /**
     * POST /taxi.php?action=accept_request
     * Sürücü talebi kabul eder.
     * Body: { talep_id }
     */
    case 'accept_request':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        if (!in_array($user['rol'], ['surucu','admin'])) {
            jsonResponse(['success' => false, 'error' => 'Sadece sürücüler kabul edebilir'], 403);
        }
        $input   = getJsonInput();
        $talepId = (int)($input['talep_id'] ?? 0);

        $db->beginTransaction();
        try {
            $stmt = $db->prepare("SELECT * FROM taxi_requests WHERE id = ? AND durum = 'bekliyor' FOR UPDATE");
            $stmt->execute([$talepId]);
            $talep = $stmt->fetch();
            if (!$talep) {
                $db->rollBack();
                jsonResponse(['success' => false, 'error' => 'Talep mevcut değil veya zaten alınmış']);
            }
            // Sürücünün aktif işi var mı?
            $stmt = $db->prepare(
                "SELECT id FROM taxi_matches WHERE surucu_id = ? AND durum IN ('kabul_edildi','devam_ediyor','teslim_bekleniyor')"
            );
            $stmt->execute([$user['id']]);
            if ($stmt->fetch()) {
                $db->rollBack();
                jsonResponse(['success' => false, 'error' => 'Aktif bir işiniz zaten var']);
            }

            $stmt = $db->prepare(
                "INSERT INTO taxi_matches (talep_id, surucu_id) VALUES (?, ?)"
            );
            $stmt->execute([$talepId, $user['id']]);
            $matchId = $db->lastInsertId();

            $db->prepare("UPDATE taxi_requests SET durum='eslesti', eslesti_at=NOW() WHERE id=?")->execute([$talepId]);
            $db->commit();

            // Notify the request owner that a driver accepted
            taxiNotify($db, (int)$talep['sahip_id'], '✅ Sürücü Kabul Etti', 'Bir sürücü talebinizi kabul etti ve size doğru yola çıkıyor.', 'talep_kabul', ['match_id' => $matchId, 'talep_id' => $talepId]);
            jsonResponse(['success' => true, 'match_id' => $matchId]);
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['success' => false, 'error' => 'İşlem hatası: ' . $e->getMessage()], 500);
        }

    /**
     * POST /taxi.php?action=driver_arrived
     * Sürücü teslim alma adresine vardığını bildirir (Madde 7/1 — 15 dk sayacı başlar).
     * Body: { match_id }
     */
    case 'driver_arrived':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user    = requireAuth();
        $input   = getJsonInput();
        $matchId = (int)($input['match_id'] ?? 0);

        $stmt = $db->prepare("SELECT id, talep_id FROM taxi_matches WHERE id = ? AND surucu_id = ? AND durum = 'kabul_edildi'");
        $stmt->execute([$matchId, $user['id']]);
        $match = $stmt->fetch();
        if (!$match) jsonResponse(['success' => false, 'error' => 'Aktif eşleşme bulunamadı'], 404);

        $db->prepare("UPDATE taxi_matches SET surucu_vardi_at = NOW() WHERE id = ?")->execute([$matchId]);

        $ownerRow = $db->prepare("SELECT sahip_id FROM taxi_requests WHERE id = ?");
        $ownerRow->execute([$match['talep_id']]);
        $ownerId = (int)($ownerRow->fetchColumn() ?: 0);
        if ($ownerId) {
            taxiNotify($db, $ownerId, '🚖 Sürücünüz Adrese Vardı',
                'Lütfen hayvanınızla birlikte hazır olun. 15 dakika içinde hazır bulunulmazsa iptal ücreti uygulanabilir (Madde 7/1).',
                'surucu_vardi', ['match_id' => $matchId]);
        }
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=driver_cancel_noshow
     * Sürücü, sahibin adreste 15 dk içinde hazır olmadığını bildirerek talebi iptal eder (Madde 7/1).
     * Body: { match_id }
     */
    case 'driver_cancel_noshow':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user    = requireAuth();
        $input   = getJsonInput();
        $matchId = (int)($input['match_id'] ?? 0);

        $stmt = $db->prepare("
            SELECT tm.id, tm.talep_id, tm.surucu_vardi_at, tr.toplam_ucret, tr.odeme_durumu, tr.sahip_id
            FROM taxi_matches tm
            INNER JOIN taxi_requests tr ON tr.id = tm.talep_id
            WHERE tm.id = ? AND tm.surucu_id = ? AND tm.durum = 'kabul_edildi'
        ");
        $stmt->execute([$matchId, $user['id']]);
        $match = $stmt->fetch();
        if (!$match) jsonResponse(['success' => false, 'error' => 'Aktif eşleşme bulunamadı'], 404);

        if (empty($match['surucu_vardi_at'])) {
            jsonResponse(['success' => false, 'error' => 'Önce adrese vardığınızı bildirmelisiniz.']);
        }
        $minutesSince = (time() - strtotime($match['surucu_vardi_at'])) / 60;
        if ($minutesSince < 15) {
            $kalan = (int)ceil(15 - $minutesSince);
            jsonResponse(['success' => false, 'error' => "Henüz 15 dakika dolmadı. {$kalan} dakika daha bekleyin."]);
        }

        $acilis = (float)($db->query("SELECT deger FROM taxi_settings WHERE anahtar='acilis_ucreti'")->fetchColumn() ?: 65);
        $total  = (float)$match['toplam_ucret'];
        $fee    = max($acilis, $total * 0.5);
        $refund = max(0, $total - $fee);

        $db->beginTransaction();
        try {
            $db->prepare("UPDATE taxi_matches SET durum='iptal' WHERE id=?")->execute([$matchId]);
            $db->prepare("UPDATE taxi_requests SET durum='iptal', iptal_nedeni=?, iptal_ucreti=? WHERE id=?")
               ->execute(['Hayvan sahibi adreste hazır bulunamadı (15 dk)', $fee, $match['talep_id']]);

            if ($match['odeme_durumu'] === 'odendi') {
                if ($refund > 0) {
                    $db->prepare("UPDATE taxi_users SET cuzdan_bakiyesi = cuzdan_bakiyesi + ? WHERE id=?")
                       ->execute([$refund, $match['sahip_id']]);
                }
                $db->prepare("UPDATE taxi_requests SET odeme_durumu='iade_edildi' WHERE id=?")->execute([$match['talep_id']]);
            }
            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['success' => false, 'error' => 'İşlem başarısız: ' . $e->getMessage()], 500);
        }

        taxiNotify($db, (int)$match['sahip_id'], '❌ Talep İptal Edildi',
            'Adreste hazır bulunmadığınız için talebiniz iptal edildi ve iptal ücreti uygulandı.', 'talep_iptal');

        jsonResponse(['success' => true, 'iptal_ucreti' => $fee, 'iade' => $refund]);

    /**
     * POST /taxi.php?action=upload_checkin_photo
     * Sürücü teslim alma fotoğrafını yükler (Madde 4/1).
     * Body: { match_id, foto_base64 }
     */
    case 'upload_checkin_photo':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user = requireAuth();
        if ($user['rol'] !== 'surucu') jsonResponse(['success' => false, 'error' => 'Yalnızca sürücüler yükleyebilir'], 403);
        $input   = getJsonInput();
        $matchId = (int)($input['match_id'] ?? 0);

        $stmt = $db->prepare("SELECT id FROM taxi_matches WHERE id = ? AND surucu_id = ? AND durum = 'kabul_edildi'");
        $stmt->execute([$matchId, $user['id']]);
        if (!$stmt->fetch()) jsonResponse(['success' => false, 'error' => 'Aktif eşleşme bulunamadı'], 404);

        $b64raw = $input['foto_base64'] ?? '';
        if (empty($b64raw)) jsonResponse(['success' => false, 'error' => 'Fotoğraf verisi eksik']);
        $b64  = preg_replace('#^data:\w+/\w+;base64,#', '', $b64raw);
        $data = base64_decode($b64, true);
        if ($data === false || strlen($data) < 100) jsonResponse(['success' => false, 'error' => 'Geçersiz fotoğraf verisi']);
        if (strlen($data) > 5_242_880) jsonResponse(['success' => false, 'error' => 'Fotoğraf 5 MB limitini aşıyor']);

        $uploadDir = dirname(__DIR__) . '/uploads/checkin/';
        if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
        $fname = 'checkin_' . $matchId . '_' . time() . '.jpg';
        if (file_put_contents($uploadDir . $fname, $data) === false)
            jsonResponse(['success' => false, 'error' => 'Dosya kaydedilemedi']);

        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host     = $_SERVER['HTTP_HOST'] ?? 'patimera.com';
        $fotoUrl  = $protocol . '://' . $host . '/pet_taxi/uploads/checkin/' . $fname;

        $db->prepare("UPDATE taxi_matches SET checkin_foto = ? WHERE id = ?")->execute([$fotoUrl, $matchId]);

        // Sahibe bildirim
        $ownerRow = $db->prepare("SELECT tr.sahip_id FROM taxi_matches tm JOIN taxi_requests tr ON tr.id = tm.talep_id WHERE tm.id = ?");
        $ownerRow->execute([$matchId]);
        $ownerId = (int)($ownerRow->fetchColumn() ?: 0);
        if ($ownerId) {
            taxiNotify($db, $ownerId, '📸 Teslim Alma Fotoğrafı', 'Sürücünüz hayvanınızı teslim alırken fotoğraf çekti.', 'checkin_foto');
        }

        jsonResponse(['success' => true, 'foto_url' => $fotoUrl]);

    /**
     * POST /taxi.php?action=start_trip
     * Sürücü yolculuğu başlatır (köpeği aldı).
     * Body: { match_id }
     */
    case 'start_trip':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $matchId = (int)($input['match_id'] ?? 0);

        $stmt = $db->prepare("SELECT * FROM taxi_matches WHERE id = ? AND surucu_id = ?");
        $stmt->execute([$matchId, $user['id']]);
        $match = $stmt->fetch();
        if (!$match || $match['durum'] !== 'kabul_edildi') {
            jsonResponse(['success' => false, 'error' => 'Geçerli eşleşme bulunamadı']);
        }

        // Madde 4/1: check-in fotoğrafı zorunlu
        if (empty($match['checkin_foto'])) {
            jsonResponse(['success' => false, 'error' => 'Yolculuğu başlatmadan önce teslim alma fotoğrafını yüklemelisiniz (Madde 4/1).']);
        }

        $db->prepare("UPDATE taxi_matches SET durum='devam_ediyor', baslama_zamani=NOW() WHERE id=?")->execute([$matchId]);
        $db->prepare("UPDATE taxi_requests SET durum='basladi' WHERE id=?")->execute([$match['talep_id']]);
        // Notify owner that trip has started
        $stmtOwner = $db->prepare("SELECT sahip_id FROM taxi_requests WHERE id=?");
        $stmtOwner->execute([$match['talep_id']]);
        $ownerId = (int)$stmtOwner->fetchColumn();
        if ($ownerId) taxiNotify($db, $ownerId, '🚗 Yolculuk Başladı', 'Sürücünüz köpeğinizi teslim aldı, yolda!', 'yolculuk_basladi', ['match_id' => $matchId, 'talep_id' => $match['talep_id']]);
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=finish_trip
     * Sürücü yolculuğu tamamlar (varışa ulaştı). Madde 4/4: 4 haneli teslimat
     * doğrulama kodu (PIN) zorunludur.
     * Body: { match_id, gercek_mesafe?, teslim_pin }
     */
    case 'finish_trip':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $matchId     = (int)($input['match_id'] ?? 0);
        $gercekMesafe = isset($input['gercek_mesafe']) ? (float)$input['gercek_mesafe'] : null;
        $girilenPin  = trim((string)($input['teslim_pin'] ?? ''));

        $stmt = $db->prepare("
            SELECT tm.*, tr.teslim_pin AS gercek_pin
            FROM taxi_matches tm
            INNER JOIN taxi_requests tr ON tr.id = tm.talep_id
            WHERE tm.id = ? AND tm.surucu_id = ? AND tm.durum = 'devam_ediyor'
        ");
        $stmt->execute([$matchId, $user['id']]);
        $match = $stmt->fetch();
        if (!$match) jsonResponse(['success' => false, 'error' => 'Aktif yolculuk bulunamadı']);

        // Madde 4/4: Teslimat doğrulama kodu zorunlu
        if (empty($girilenPin) || empty($match['gercek_pin']) || $girilenPin !== $match['gercek_pin']) {
            jsonResponse(['success' => false, 'error' => 'Teslimat kodu hatalı veya eksik. Lütfen hayvan sahibinden 4 haneli kodu isteyin (Madde 4/4).']);
        }

        $db->prepare(
            "UPDATE taxi_matches SET durum='teslim_bekleniyor', bitis_zamani=NOW(), gercek_mesafe=? WHERE id=?"
        )->execute([$gercekMesafe, $matchId]);
        $db->prepare("UPDATE taxi_requests SET durum='teslim_bekleniyor' WHERE id=?")->execute([$match['talep_id']]);

        // Sahibe teslim onayı bildirimi gönder
        $stmt = $db->prepare("SELECT sahip_id FROM taxi_requests WHERE id=?");
        $stmt->execute([$match['talep_id']]);
        $sahipId = (int)$stmt->fetchColumn();
        if ($sahipId) {
            taxiNotify($db, $sahipId, '🐾 Köpeğiniz Teslim Edildi!',
                'Sürücü köpeğinizi bıraktı. Teslim aldığınızı onaylayın.', 'teslim_bekleniyor',
                ['match_id' => $matchId, 'talep_id' => $match['talep_id']]);
        }

        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=confirm_delivery
     * Hayvan sahibi teslimi onaylar → ödeme sürücüye aktarılır.
     * Body: { match_id }
     */
    case 'confirm_delivery':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $matchId = (int)($input['match_id'] ?? 0);

        // Komisyon oranını transaction dışında oku (settings değişmez sıklıkla)
        $komisyonOrani = 20;
        try {
            $row = $db->query("SELECT deger FROM taxi_settings WHERE anahtar='komisyon_orani'")->fetch();
            if ($row) $komisyonOrani = (int)$row['deger'];
        } catch (Exception $e) {}

        $db->beginTransaction();
        try {
            // FOR UPDATE: aynı anda gelen ikinci istek bu satırı kilitlenmiş bulur ve bekler.
            // Durum kontrolü lock içinde yapılıyor — kilidi alan istek statüyü değiştirir,
            // bekleyen ikinci istek kilidi aldığında 'tamamlandi' görür ve hata döner.
            $stmt = $db->prepare("
                SELECT tm.*, tr.toplam_ucret, tr.sahip_id, tr.id AS request_id
                FROM taxi_matches tm
                JOIN taxi_requests tr ON tr.id = tm.talep_id
                WHERE tm.id = ? AND tr.sahip_id = ? AND tm.durum = 'teslim_bekleniyor'
                FOR UPDATE
            ");
            $stmt->execute([$matchId, $user['id']]);
            $match = $stmt->fetch();
            if (!$match) {
                $db->rollBack();
                jsonResponse(['success' => false, 'error' => 'Onaylanacak teslim bulunamadı']);
            }

            // Statü güncelle
            $db->prepare("UPDATE taxi_matches  SET durum='tamamlandi'                    WHERE id=?")->execute([$matchId]);
            $db->prepare("UPDATE taxi_requests SET durum='tamamlandi', teslim_zamani=NOW() WHERE id=?")->execute([$match['request_id']]);

            // Kazanç hesapla
            $ucret         = (float)$match['toplam_ucret'];
            $komisyon      = round($ucret * $komisyonOrani / 100, 2);
            $suruucuKazanc = $ucret - $komisyon;

            // Atomic bakiye artışı — read-modify-write race condition olmaz
            $db->prepare("UPDATE taxi_users SET cuzdan_bakiyesi = cuzdan_bakiyesi + ? WHERE id=?")
               ->execute([$suruucuKazanc, $match['surucu_id']]);

            // Yeni bakiyeyi audit kaydı için oku (lock altında, güvenli)
            $yeniBakiye   = (float)$db->query("SELECT cuzdan_bakiyesi FROM taxi_users WHERE id=" . (int)$match['surucu_id'])->fetchColumn();
            $oncekiBakiye = round($yeniBakiye - $suruucuKazanc, 2);

            // Finansal audit kaydı
            $db->prepare("
                INSERT INTO taxi_transactions (user_id, talep_id, tutar, islem_tipi, aciklama, onceki_bakiye, sonraki_bakiye)
                VALUES (?, ?, ?, 'surucu_kazanci', ?, ?, ?)
            ")->execute([
                $match['surucu_id'],
                $match['request_id'],
                $suruucuKazanc,
                "Yolculuk tamamlandı (komisyon: %{$komisyonOrani})",
                $oncekiBakiye,
                $yeniBakiye,
            ]);

            // Match kaydına kazanç yaz
            $db->prepare("UPDATE taxi_matches SET surucu_kazanc = ? WHERE id=?")
               ->execute([$suruucuKazanc, $matchId]);

            $db->commit();
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['success' => false, 'error' => 'Ödeme işlemi başarısız: ' . $e->getMessage()], 500);
        }

        taxiNotify($db, (int)$match['surucu_id'], '💰 Ödeme Alındı!',
            "₺{$suruucuKazanc} cüzdanınıza eklendi. Güvenli ulaştırma için teşekkürler!", 'yolculuk_tamamlandi',
            ['match_id' => $matchId, 'talep_id' => $match['request_id']]);
        taxiNotify($db, (int)$user['id'], '✅ Teslim Onaylandı',
            "Yolculuğunuz tamamlandı. Sürücünüzü değerlendirin!", 'yolculuk_tamamlandi',
            ['talep_id' => $match['request_id'], 'surucu_id' => $match['surucu_id']]);

        jsonResponse(['success' => true, 'surucu_kazanc' => $suruucuKazanc]);

    /**
     * POST /taxi.php?action=create_incident_report
     * Madde 10/1: Evcil hayvanın yaralanması, kaybolması, ölümü veya araç hasarı gibi olaylar
     * için transferin bittiği andan itibaren en geç 48 saat içinde, fotoğraflı ve delilli
     * olarak yazılı bildirim zorunludur.
     * Body: { talep_id, tur, aciklama, fotograflar: [base64, ...] }
     */
    case 'create_incident_report':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user     = requireAuth();
        $input    = getJsonInput();
        $talepId  = (int)($input['talep_id'] ?? 0);
        $tur      = trim((string)($input['tur'] ?? ''));
        $aciklama = trim((string)($input['aciklama'] ?? ''));
        $fotolar  = is_array($input['fotograflar'] ?? null) ? $input['fotograflar'] : [];

        $gecerliTurler = ['yaralanma', 'kayip', 'olum', 'arac_hasari', 'diger'];
        if (!in_array($tur, $gecerliTurler, true)) {
            jsonResponse(['success' => false, 'error' => 'Geçersiz olay türü']);
        }
        if ($aciklama === '') {
            jsonResponse(['success' => false, 'error' => 'Açıklama zorunludur']);
        }
        if (empty($fotolar)) {
            jsonResponse(['success' => false, 'error' => 'En az 1 kanıt fotoğrafı yüklemelisiniz (Madde 10/1).']);
        }
        if (count($fotolar) > 5) {
            jsonResponse(['success' => false, 'error' => 'En fazla 5 fotoğraf yükleyebilirsiniz']);
        }

        $stmt = $db->prepare("
            SELECT tr.id, tr.sahip_id, tr.durum, tr.teslim_zamani, tm.surucu_id
            FROM taxi_requests tr
            LEFT JOIN taxi_matches tm ON tm.talep_id = tr.id AND tm.durum NOT IN ('iptal')
            WHERE tr.id = ?
            LIMIT 1
        ");
        $stmt->execute([$talepId]);
        $talep = $stmt->fetch();
        if (!$talep) jsonResponse(['success' => false, 'error' => 'Talep bulunamadı'], 404);

        $isSahip  = ((int)$talep['sahip_id'] === (int)$user['id']);
        $isSurucu = (!empty($talep['surucu_id']) && (int)$talep['surucu_id'] === (int)$user['id']);
        if (!$isSahip && !$isSurucu) {
            jsonResponse(['success' => false, 'error' => 'Bu talep için bildirim yapamazsınız'], 403);
        }

        if ($talep['durum'] === 'tamamlandi' && !empty($talep['teslim_zamani'])) {
            $saatGecti = (time() - strtotime($talep['teslim_zamani'])) / 3600;
            if ($saatGecti > 48) {
                jsonResponse(['success' => false, 'error' => 'Bildirim süresi doldu. Transfer tamamlandıktan sonra en geç 48 saat içinde bildirim yapılmalıdır (Madde 10/1).']);
            }
        }

        $uploadDir = dirname(__DIR__) . '/uploads/incidents/';
        if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host     = $_SERVER['HTTP_HOST'] ?? 'patimera.com';

        $fotoUrls = [];
        foreach ($fotolar as $i => $b64raw) {
            $b64  = preg_replace('#^data:\w+/\w+;base64,#', '', (string)$b64raw);
            $data = base64_decode($b64, true);
            if ($data === false || strlen($data) < 100) continue;
            if (strlen($data) > 5_242_880) continue;
            $fname = 'incident_' . $talepId . '_' . time() . '_' . $i . '.jpg';
            if (file_put_contents($uploadDir . $fname, $data) !== false) {
                $fotoUrls[] = $protocol . '://' . $host . '/pet_taxi/uploads/incidents/' . $fname;
            }
        }
        if (empty($fotoUrls)) {
            jsonResponse(['success' => false, 'error' => 'Fotoğraflar yüklenemedi, lütfen tekrar deneyin']);
        }

        $bildirenRol = $isSahip ? 'sahip' : 'surucu';
        $db->prepare("
            INSERT INTO taxi_incident_reports (talep_id, bildiren_id, bildiren_rol, tur, aciklama, fotograflar)
            VALUES (?, ?, ?, ?, ?, ?)
        ")->execute([$talepId, $user['id'], $bildirenRol, $tur, $aciklama, json_encode($fotoUrls)]);

        adminNotify($db, 'hasar_bildirimi',
            '⚠️ Yeni Hasar/Olay Bildirimi — Talep #' . $talepId,
            ucfirst($bildirenRol) . ' tarafından bildirildi. Tür: ' . $tur . ' — ' . mb_substr($aciklama, 0, 200));

        jsonResponse(['success' => true]);

    /**
     * GET /taxi.php?action=get_incident_reports&talep_id=...
     */
    case 'get_incident_reports':
        $user    = requireAuth();
        $talepId = (int)($_GET['talep_id'] ?? 0);

        $stmt = $db->prepare("SELECT sahip_id FROM taxi_requests WHERE id = ?");
        $stmt->execute([$talepId]);
        $sahipId = $stmt->fetchColumn();
        if ($sahipId === false) jsonResponse(['success' => false, 'error' => 'Talep bulunamadı'], 404);

        $stmtM = $db->prepare("SELECT surucu_id FROM taxi_matches WHERE talep_id = ? AND durum NOT IN ('iptal') LIMIT 1");
        $stmtM->execute([$talepId]);
        $surucuId = $stmtM->fetchColumn();

        if ((int)$sahipId !== (int)$user['id'] && (int)$surucuId !== (int)$user['id'] && $user['rol'] !== 'admin') {
            jsonResponse(['success' => false, 'error' => 'Erişim reddedildi'], 403);
        }

        $stmt = $db->prepare("SELECT * FROM taxi_incident_reports WHERE talep_id = ? ORDER BY created_at DESC");
        $stmt->execute([$talepId]);
        $reports = $stmt->fetchAll();
        foreach ($reports as &$r) { $r['fotograflar'] = json_decode($r['fotograflar'] ?? '[]', true) ?: []; }
        unset($r);

        jsonResponse(['success' => true, 'reports' => $reports]);

    /**
     * POST /taxi.php?action=update_location
     * Canlı konum güncellemesi.
     * Body: { match_id, lat, lon, hiz? }
     */
    case 'update_location':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $matchId = (int)($input['match_id'] ?? 0);
        $lat     = isset($input['lat']) ? (float)$input['lat'] : null;
        $lon     = isset($input['lon']) ? (float)$input['lon'] : null;

        if (!$matchId || $lat === null || $lon === null) {
            jsonResponse(['success' => false, 'error' => 'match_id, lat ve lon zorunludur']);
        }

        $stmt = $db->prepare("SELECT id FROM taxi_matches WHERE id=? AND surucu_id=? AND durum='devam_ediyor'");
        $stmt->execute([$matchId, $user['id']]);
        if (!$stmt->fetch()) jsonResponse(['success' => false, 'error' => 'Aktif eşleşme bulunamadı']);

        $stmt = $db->prepare(
            "INSERT INTO taxi_locations (match_id, lat, lon, hiz) VALUES (?, ?, ?, ?)"
        );
        $stmt->execute([$matchId, $lat, $lon, $input['hiz'] ?? null]);
        jsonResponse(['success' => true]);

    /**
     * GET /taxi.php?action=live_location&match_id=X
     * Sahibin sürücünün konumunu takip etmesi
     */
    case 'live_location':
        $user    = requireAuth();
        $matchId = (int)($_GET['match_id'] ?? 0);

        $stmt = $db->prepare("
            SELECT tm.*, tr.sahip_id
            FROM taxi_matches tm
            INNER JOIN taxi_requests tr ON tr.id = tm.talep_id
            WHERE tm.id = ?
        ");
        $stmt->execute([$matchId]);
        $match = $stmt->fetch();
        if (!$match) jsonResponse(['success' => false, 'error' => 'Eşleşme bulunamadı'], 404);
        if ($match['sahip_id'] != $user['id'] && $match['surucu_id'] != $user['id'] && $user['rol'] !== 'admin') {
            jsonResponse(['success' => false, 'error' => 'Erişim reddedildi'], 403);
        }

        $stmt = $db->prepare(
            "SELECT lat, lon, hiz, kayit_zamani FROM taxi_locations WHERE match_id=? ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([$matchId]);
        $loc = $stmt->fetch();
        jsonResponse(['success' => true, 'location' => $loc]);

    /**
     * GET /taxi.php?action=my_jobs
     * Sürücünün kabul ettiği / tamamladığı işler
     */
    case 'my_jobs':
        $user   = requireAuth();
        $page   = max(1, (int)($_GET['page'] ?? 1));
        $limit  = 20;
        $offset = ($page - 1) * $limit;
        $stmt = $db->prepare("
            SELECT tm.*,
                   tr.baslangic_noktasi, tr.baslangic_sehir, tr.baslangic_ilce,
                   tr.baslangic_lat, tr.baslangic_lon,
                   tr.varis_noktasi, tr.varis_sehir, tr.varis_ilce,
                   tr.varis_lat, tr.varis_lon,
                   tr.kalkis_zamani, tr.toplam_ucret, tr.ozel_talepler,
                   tr.durum AS talep_durum, tr.sahip_id,
                   d.isim AS kopek_adi, d.irk AS kopek_irki, d.kilo AS kopek_kilo,
                   u.ad_soyad AS sahip_adi, u.telefon AS sahip_telefon
            FROM taxi_matches tm
            INNER JOIN taxi_requests tr ON tr.id = tm.talep_id
            INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
            INNER JOIN taxi_users u ON u.id = tr.sahip_id
            WHERE tm.surucu_id = ?
            ORDER BY tm.created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->execute([$user['id'], $limit + 1, $offset]);
        $rows = $stmt->fetchAll();
        $hasMore = count($rows) > $limit;
        if ($hasMore) array_pop($rows);
        // Active jobs always on page 1 regardless of pagination
        if ($page > 1) {
            $rows = array_filter($rows, fn($j) => !in_array($j['durum'], ['kabul_edildi','devam_ediyor','teslim_bekleniyor']));
            $rows = array_values($rows);
        }
        jsonResponse(['success' => true, 'jobs' => $rows, 'has_more' => $hasMore, 'page' => $page]);

    // ============================================================
    // DEĞERLENDİRMELER
    // ============================================================

    /**
     * POST /taxi.php?action=add_review
     * Body: { talep_id, degerlendirilen_id, puan (1-5), yorum? }
     */
    case 'add_review':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();

        $talepId       = (int)($input['talep_id'] ?? 0);
        $degilId       = (int)($input['degerlendirilen_id'] ?? 0);
        $puan          = (int)($input['puan'] ?? 0);

        if ($puan < 1 || $puan > 5) jsonResponse(['success' => false, 'error' => 'Puan 1-5 arasında olmalıdır']);

        // Talep tamamlandı mı ve değerlendiren bu trip'e dahil mi?
        // sahip_id = değerlendiren (sahip sürücüyü değerlendirir)
        // ya da match'teki surucu_id = değerlendiren (sürücü sahibi değerlendirirse ileride)
        $stmt = $db->prepare("
            SELECT tr.id, tr.sahip_id,
                   tm.surucu_id
            FROM taxi_requests tr
            LEFT JOIN taxi_matches tm ON tm.talep_id = tr.id AND tm.durum = 'tamamlandi'
            WHERE tr.id = ? AND tr.durum = 'tamamlandi'
        ");
        $stmt->execute([$talepId]);
        $trip = $stmt->fetch();
        if (!$trip) jsonResponse(['success' => false, 'error' => 'Yalnızca tamamlanan talepler değerlendirilebilir']);

        // Değerlendiren bu yolculuğun sahibi veya sürücüsü olmalı
        $isParticipant = ((int)$trip['sahip_id'] === $user['id']) || ((int)$trip['surucu_id'] === $user['id']);
        if (!$isParticipant) jsonResponse(['success' => false, 'error' => 'Bu yolculuğu değerlendirme yetkiniz yok'], 403);

        // Daha önce değerlendirdi mi?
        $stmt = $db->prepare("SELECT id FROM taxi_reviews WHERE talep_id=? AND degerlendiren_id=?");
        $stmt->execute([$talepId, $user['id']]);
        if ($stmt->fetch()) jsonResponse(['success' => false, 'error' => 'Bu talebi daha önce değerlendirdiniz']);

        $stmt = $db->prepare(
            "INSERT INTO taxi_reviews (talep_id, degerlendiren_id, degerlendirilen_id, puan, yorum) VALUES (?,?,?,?,?)"
        );
        $stmt->execute([$talepId, $user['id'], $degilId, $puan, $input['yorum'] ?? null]);
        jsonResponse(['success' => true, 'review_id' => $db->lastInsertId()]);

    /**
     * GET /taxi.php?action=driver_reviews&surucu_id=X
     */
    case 'driver_reviews':
        $user      = requireAuth();
        $surucu_id = (int)($_GET['surucu_id'] ?? 0);
        $stmt = $db->prepare("
            SELECT r.*, u.ad_soyad AS degerlendiren_adi
            FROM taxi_reviews r
            INNER JOIN taxi_users u ON u.id = r.degerlendiren_id
            WHERE r.degerlendirilen_id = ?
            ORDER BY r.tarih DESC
        ");
        $stmt->execute([$surucu_id]);
        $reviews = $stmt->fetchAll();
        $avg = 0;
        if ($reviews) {
            $avg = round(array_sum(array_column($reviews, 'puan')) / count($reviews), 1);
        }
        jsonResponse(['success' => true, 'reviews' => $reviews, 'ortalama_puan' => $avg, 'toplam' => count($reviews)]);

    /**
     * GET /taxi.php?action=my_reviews
     * Sürücü kendi aldığı değerlendirmeleri görür
     */
    case 'my_reviews':
        $user = requireAuth();
        if ($user['rol'] !== 'surucu') jsonResponse(['success' => false, 'error' => 'Sürücü değil'], 403);
        $stmt = $db->prepare("
            SELECT r.id, r.puan, r.yorum, r.tarih,
                   u.ad_soyad AS degerlendiren_adi
            FROM taxi_reviews r
            INNER JOIN taxi_users u ON u.id = r.degerlendiren_id
            WHERE r.degerlendirilen_id = ?
            ORDER BY r.tarih DESC
        ");
        $stmt->execute([$user['id']]);
        $reviews = $stmt->fetchAll();
        $avg = $reviews ? round(array_sum(array_column($reviews, 'puan')) / count($reviews), 1) : 0;
        jsonResponse(['success' => true, 'reviews' => $reviews, 'ortalama_puan' => $avg, 'toplam' => count($reviews)]);

    /**
     * POST /taxi.php?action=toggle_favorite
     * Body: { surucu_id }
     * Favori ekle / çıkar (toggle), sahip rolü gerektirir
     */
    case 'toggle_favorite':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        if ($user['rol'] !== 'sahip') jsonResponse(['success' => false, 'error' => 'Sahip değil'], 403);
        $input    = getJsonInput();
        $suruciId = (int)($input['surucu_id'] ?? 0);
        if (!$suruciId) jsonResponse(['success' => false, 'error' => 'surucu_id gerekli']);
        $chk = $db->prepare("SELECT id FROM taxi_favorites WHERE sahip_id=? AND surucu_id=?");
        $chk->execute([$user['id'], $suruciId]);
        if ($chk->fetch()) {
            $db->prepare("DELETE FROM taxi_favorites WHERE sahip_id=? AND surucu_id=?")->execute([$user['id'], $suruciId]);
            jsonResponse(['success' => true, 'favori' => false]);
        } else {
            $db->prepare("INSERT INTO taxi_favorites (sahip_id, surucu_id) VALUES (?,?)")->execute([$user['id'], $suruciId]);
            jsonResponse(['success' => true, 'favori' => true]);
        }

    /**
     * GET /taxi.php?action=get_favorites
     * Sahibin favori sürücüleri
     */
    case 'get_favorites':
        $user = requireAuth();
        if ($user['rol'] !== 'sahip') jsonResponse(['success' => false, 'error' => 'Sahip değil'], 403);
        $stmt = $db->prepare("
            SELECT u.id, u.ad_soyad, u.profil_foto,
                   COALESCE(AVG(r.puan),0) AS ortalama_puan,
                   COUNT(r.id)             AS degerlendirme_sayisi,
                   f.tarih                 AS ekleme_tarihi
            FROM taxi_favorites f
            INNER JOIN taxi_users u ON u.id = f.surucu_id
            LEFT  JOIN taxi_reviews r ON r.degerlendirilen_id = u.id
            WHERE f.sahip_id = ?
            GROUP BY u.id, f.tarih
            ORDER BY f.tarih DESC
        ");
        $stmt->execute([$user['id']]);
        jsonResponse(['success' => true, 'favoriler' => $stmt->fetchAll()]);

    /**
     * GET /taxi.php?action=is_favorite&surucu_id=X
     * Belirli bir sürücünün favori olup olmadığını kontrol et
     */
    case 'is_favorite':
        $user     = requireAuth();
        $suruciId = (int)($_GET['surucu_id'] ?? 0);
        $chk = $db->prepare("SELECT id FROM taxi_favorites WHERE sahip_id=? AND surucu_id=?");
        $chk->execute([$user['id'], $suruciId]);
        jsonResponse(['success' => true, 'favori' => (bool)$chk->fetch()]);

    // ============================================================
    // MESAJLAŞMA
    // ============================================================

    /**
     * GET /taxi.php?action=messages&talep_id=X
     */
    case 'messages':
        $user    = requireAuth();
        $talepId = (int)($_GET['talep_id'] ?? 0);
        $stmt = $db->prepare("
            SELECT m.*, u.ad_soyad AS gonderen_adi
            FROM taxi_messages m
            INNER JOIN taxi_users u ON u.id = m.gonderen_id
            WHERE m.talep_id = ? AND (m.gonderen_id = ? OR m.alici_id = ?)
            ORDER BY m.tarih ASC
        ");
        $stmt->execute([$talepId, $user['id'], $user['id']]);
        // Okunmadı olarak işaretle
        $db->prepare(
            "UPDATE taxi_messages SET okundu_mu=1 WHERE talep_id=? AND alici_id=? AND okundu_mu=0"
        )->execute([$talepId, $user['id']]);
        jsonResponse(['success' => true, 'messages' => $stmt->fetchAll()]);

    /**
     * POST /taxi.php?action=send_message
     * Body: { alici_id, talep_id?, mesaj }
     */
    case 'send_message':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        if (empty($input['alici_id']) || empty($input['mesaj'])) {
            jsonResponse(['success' => false, 'error' => 'alici_id ve mesaj zorunludur']);
        }
        $aliciId = (int)$input['alici_id'];
        $talepId = !empty($input['talep_id']) ? (int)$input['talep_id'] : null;

        // Talep varsa: gönderen VE alıcı o yolculuğa dahil olmalı
        if ($talepId) {
            $stmt = $db->prepare("
                SELECT tr.sahip_id, tm.surucu_id
                FROM taxi_requests tr
                LEFT JOIN taxi_matches tm ON tm.talep_id = tr.id AND tm.durum NOT IN ('iptal','reddedildi')
                WHERE tr.id = ?
            ");
            $stmt->execute([$talepId]);
            $trip = $stmt->fetch();
            if (!$trip) {
                jsonResponse(['success' => false, 'error' => 'Talep bulunamadı'], 404);
            }
            $participants = array_filter([(int)$trip['sahip_id'], (int)$trip['surucu_id']]);
            if (!in_array($user['id'], $participants, true) || !in_array($aliciId, $participants, true)) {
                jsonResponse(['success' => false, 'error' => 'Bu yolculuğa mesaj gönderme yetkiniz yok'], 403);
            }
        }

        $stmt = $db->prepare(
            "INSERT INTO taxi_messages (gonderen_id, alici_id, talep_id, mesaj) VALUES (?,?,?,?)"
        );
        $stmt->execute([$user['id'], $aliciId, $talepId, $input['mesaj']]);
        jsonResponse(['success' => true, 'message_id' => $db->lastInsertId()]);

    // ============================================================
    // KULLANICI PROFİLİ
    // ============================================================

    /**
     * GET /taxi.php?action=my_dogs
     */
    case 'my_dogs':
        $user = requireAuth();
        $stmt = $db->prepare("SELECT * FROM taxi_dogs WHERE sahip_id=? AND durum='aktif' ORDER BY isim");
        $stmt->execute([$user['id']]);
        jsonResponse(['success' => true, 'dogs' => $stmt->fetchAll()]);

    /**
     * POST /taxi.php?action=add_dog
     * Body: { isim, irk?, yas?, kilo?, cinsiyet?, notlar? }
     */
    case 'add_dog':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        if (empty($input['isim'])) jsonResponse(['success' => false, 'error' => 'Hayvan ismi zorunludur']);
        $stmt = $db->prepare(
            "INSERT INTO taxi_dogs (sahip_id, isim, tur, irk, yas, kilo, cinsiyet, notlar, huylu, asili, saglik_notu, surucu_notu, mikrocip_no, kuduz_asi_tarihi, karma_asi_tarihi)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $user['id'],
            trim($input['isim']),
            $input['tur']     ?? 'kopek',
            $input['irk']     ?? null,
            isset($input['yas'])   ? (int)$input['yas']     : null,
            isset($input['kilo'])  ? (float)$input['kilo']  : null,
            $input['cinsiyet'] ?? 'erkek',
            $input['notlar']   ?? null,
            $input['huylu']    ?? null,
            isset($input['asili']) ? (int)$input['asili'] : 1,
            $input['saglik_notu'] ?? null,
            $input['surucu_notu'] ?? null,
            $input['mikrocip_no']      ?? null,
            $input['kuduz_asi_tarihi'] ?? null,
            $input['karma_asi_tarihi'] ?? null,
        ]);
        jsonResponse(['success' => true, 'dog_id' => $db->lastInsertId()]);

    /**
     * POST /taxi.php?action=update_dog
     * Body: { id, isim?, irk?, yas?, kilo?, cinsiyet?, notlar?,
     *         huylu?, asili?, saglik_notu?, surucu_notu? }
     */
    case 'update_dog':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        if (empty($input['id'])) jsonResponse(['success' => false, 'error' => 'id gerekli']);
        // Sahiplik doğrula
        $chk = $db->prepare("SELECT id FROM taxi_dogs WHERE id=? AND sahip_id=? AND durum='aktif'");
        $chk->execute([(int)$input['id'], $user['id']]);
        if (!$chk->fetch()) jsonResponse(['success' => false, 'error' => 'Köpek bulunamadı'], 404);

        $fields = ['isim','tur','irk','yas','kilo','cinsiyet','notlar','huylu','asili','saglik_notu','surucu_notu','mikrocip_no','kuduz_asi_tarihi','karma_asi_tarihi'];
        $set = []; $vals = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $input)) {
                $set[]  = "`$f` = ?";
                $vals[] = ($f === 'yas') ? (int)$input[$f] : (($f === 'kilo') ? (float)$input[$f] : $input[$f]);
            }
        }
        if (empty($set)) jsonResponse(['success' => false, 'error' => 'Güncellenecek alan yok']);
        $vals[] = (int)$input['id'];
        $db->prepare("UPDATE taxi_dogs SET " . implode(', ', $set) . " WHERE id=?")->execute($vals);
        jsonResponse(['success' => true]);

    /**
     * GET /taxi.php?action=dog_profile&dog_id=X
     * Sürücüler için köpek profili — yalnızca ilgili talep sahibi köpekler
     */
    case 'dog_profile':
        $user   = requireAuth();
        $dogId  = (int)($_GET['dog_id'] ?? 0);
        if (!$dogId) jsonResponse(['success' => false, 'error' => 'dog_id gerekli']);

        if ($user['rol'] === 'sahip') {
            // Sahip yalnızca kendi köpeğini görebilir
            $stmt = $db->prepare("SELECT * FROM taxi_dogs WHERE id=? AND sahip_id=? AND durum='aktif'");
            $stmt->execute([$dogId, $user['id']]);
            $dog = $stmt->fetch();
            if (!$dog) jsonResponse(['success' => false, 'error' => 'Köpek bulunamadı'], 404);
            jsonResponse(['success' => true, 'dog' => $dog]);
        }

        // Sürücü bu köpeği içeren aktif/bekleyen bir talep/eşleşmede mi?
        if ($user['rol'] === 'surucu') {
            $perm = $db->prepare(
                "SELECT 1 FROM taxi_requests r
                 LEFT JOIN taxi_matches m ON m.talep_id = r.id AND m.surucu_id = ?
                 WHERE r.kopek_id = ? AND (r.durum IN ('bekliyor','aktif') OR m.id IS NOT NULL)
                 LIMIT 1"
            );
            $perm->execute([$user['id'], $dogId]);
            if (!$perm->fetch()) jsonResponse(['success' => false, 'error' => 'Erişim reddedildi'], 403);
        }

        $stmt = $db->prepare("SELECT * FROM taxi_dogs WHERE id=? AND durum='aktif'");
        $stmt->execute([$dogId]);
        $dog = $stmt->fetch();
        if (!$dog) jsonResponse(['success' => false, 'error' => 'Köpek bulunamadı'], 404);
        jsonResponse(['success' => true, 'dog' => $dog]);

    /**
     * POST /taxi.php?action=delete_dog
     * Body: { id }
     */
    case 'delete_dog':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        if (empty($input['id'])) jsonResponse(['success' => false, 'error' => 'id gerekli']);
        $db->prepare("UPDATE taxi_dogs SET durum='pasif' WHERE id=? AND sahip_id=?")->execute([(int)$input['id'], $user['id']]);
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=request_photo
     * Sahip sürücüden fotoğraf ister
     * Body: { match_id }
     */
    case 'request_photo':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $matchId = (int)($input['match_id'] ?? 0);
        if (!$matchId) jsonResponse(['success' => false, 'error' => 'match_id gerekli']);

        // Sahibin bu eşleşmeye erişimi var mı?
        $stmt = $db->prepare(
            "SELECT m.id, m.surucu_id FROM taxi_matches m
             JOIN taxi_requests r ON r.id = m.talep_id
             WHERE m.id=? AND r.sahip_id=? AND m.durum='devam_ediyor'"
        );
        $stmt->execute([$matchId, $user['id']]);
        $match = $stmt->fetch();
        if (!$match) jsonResponse(['success' => false, 'error' => 'Aktif yolculuk bulunamadı'], 404);

        // Mevcut bekleyen isteği sil / yenisini ekle
        $db->prepare("DELETE FROM taxi_photo_requests WHERE match_id=? AND durum='bekleniyor'")->execute([$matchId]);
        $db->prepare("INSERT INTO taxi_photo_requests (match_id, talep_eden_id) VALUES (?,?)")->execute([$matchId, $user['id']]);

        // Sürücüye bildirim gönder
        taxiNotify($db, (int)$match['surucu_id'], '📸 Fotoğraf İsteği', 'Köpek sahibi fotoğraf istiyor!', 'foto_istegi',
            ['match_id' => $matchId]);

        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=send_photo
     * Sürücü fotoğrafı base64 olarak gönderir
     * Body: { match_id, foto_base64 }
     */
    case 'send_photo':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        if ($user['rol'] !== 'surucu') jsonResponse(['success' => false, 'error' => 'Sürücü yetkisi gerekli'], 403);
        $input = getJsonInput();
        $matchId    = (int)($input['match_id'] ?? 0);
        $base64Data = $input['foto_base64'] ?? '';
        if (!$matchId || !$base64Data) jsonResponse(['success' => false, 'error' => 'match_id ve foto_base64 gerekli']);

        // Sürücünün bu eşleşmede aktif olduğunu doğrula
        $stmt = $db->prepare(
            "SELECT m.id, m.talep_id, r.sahip_id FROM taxi_matches m
             JOIN taxi_requests r ON r.id = m.talep_id
             WHERE m.id=? AND m.surucu_id=? AND m.durum='devam_ediyor'"
        );
        $stmt->execute([$matchId, $user['id']]);
        $match = $stmt->fetch();
        if (!$match) jsonResponse(['success' => false, 'error' => 'Aktif yolculuk bulunamadı'], 404);

        // Base64 -> dosyaya kaydet
        $base64 = preg_replace('#^data:image/\w+;base64,#i', '', $base64Data);
        $imgData = base64_decode($base64);
        if (!$imgData) jsonResponse(['success' => false, 'error' => 'Geçersiz fotoğraf verisi']);

        $uploadDir = dirname(__DIR__) . '/photos/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
        $filename = 'trip_' . $matchId . '_' . time() . '.jpg';
        file_put_contents($uploadDir . $filename, $imgData);
        $fotoUrl = 'https://patimera.com/pet_taxi/photos/' . $filename;

        // İsteği güncelle
        $db->prepare(
            "UPDATE taxi_photo_requests SET durum='gonderildi', foto_url=?, gonderilme=NOW() WHERE match_id=? AND durum='bekleniyor'"
        )->execute([$fotoUrl, $matchId]);

        // Sahibine bildirim gönder
        taxiNotify($db, (int)$match['sahip_id'], '📸 Fotoğraf Geldi', 'Sürücü köpeğinizin fotoğrafını gönderdi!', 'foto_geldi',
            ['match_id' => $matchId, 'talep_id' => $match['talep_id']]);

        jsonResponse(['success' => true, 'foto_url' => $fotoUrl]);

    /**
     * GET /taxi.php?action=check_photo_request&match_id=X
     * Sürücü: bekleyen fotoğraf isteği var mı?
     */
    case 'check_photo_request':
        $user    = requireAuth();
        $matchId = (int)($_GET['match_id'] ?? 0);
        if (!$matchId) jsonResponse(['success' => false, 'error' => 'match_id gerekli']);

        $stmt = $db->prepare(
            "SELECT pr.id FROM taxi_photo_requests pr
             JOIN taxi_matches m ON m.id = pr.match_id
             WHERE pr.match_id=? AND m.surucu_id=? AND pr.durum='bekleniyor'
             LIMIT 1"
        );
        $stmt->execute([$matchId, $user['id']]);
        jsonResponse(['success' => true, 'requested' => (bool)$stmt->fetch()]);

    /**
     * GET /taxi.php?action=get_photo&match_id=X
     * Sahip: son gönderilen fotoğrafı al
     */
    case 'get_photo':
        $user    = requireAuth();
        $matchId = (int)($_GET['match_id'] ?? 0);
        if (!$matchId) jsonResponse(['success' => false, 'error' => 'match_id gerekli']);

        $stmt = $db->prepare(
            "SELECT pr.foto_url, pr.gonderilme FROM taxi_photo_requests pr
             JOIN taxi_matches m ON m.id = pr.match_id
             JOIN taxi_requests r ON r.id = m.talep_id
             WHERE pr.match_id=? AND r.sahip_id=? AND pr.durum='gonderildi'
             ORDER BY pr.gonderilme DESC LIMIT 1"
        );
        $stmt->execute([$matchId, $user['id']]);
        $photo = $stmt->fetch();
        jsonResponse(['success' => true, 'foto_url' => $photo ? $photo['foto_url'] : null]);

    /**
     * POST /taxi.php?action=wallet_topup_init
     * İyzico ödeme formu başlat
     * Body: { tutar }  (TL, minimum 10)
     */
    case 'wallet_topup_init':
        // taxi_photo_requests tablosu yoksa oluştur (migration)
        try { $db->exec("CREATE TABLE IF NOT EXISTS `taxi_photo_requests` (`id` INT NOT NULL AUTO_INCREMENT,`match_id` INT NOT NULL,`talep_eden_id` INT NOT NULL,`durum` ENUM('bekleniyor','gonderildi') NOT NULL DEFAULT 'bekleniyor',`foto_url` VARCHAR(500) NULL,`olusturulma` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,`gonderilme` TIMESTAMP NULL,PRIMARY KEY (`id`),KEY `idx_match` (`match_id`,`durum`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); } catch (\Throwable $_) {}
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $tutar = (float)($input['tutar'] ?? 0);
        if ($tutar < 10) jsonResponse(['success' => false, 'error' => 'Minimum yükleme tutarı 10 ₺']);

        if (!class_exists('Iyzico')) {
            require_once dirname(dirname(__DIR__)) . '/core/Iyzico.php';
        }
        if (!defined('APP_URL')) {
            define('APP_URL', 'https://patimera.com');
        }

        $callbackUrl = 'https://patimera.com/pet_taxi/api/iyzico-wallet-callback.php';

        try {
            $result = (new Iyzico())->initCheckoutForm(
                (int)$user['id'],
                $tutar,
                [
                    'ad_soyad' => $user['ad_soyad'] ?? 'Kullanici K',
                    'email'    => $user['email'],
                    'telefon'  => $user['telefon'] ?? '05000000000',
                ],
                $callbackUrl,
                'TAXI'
            );
        } catch (\Throwable $e) {
            jsonResponse(['success' => false, 'error' => 'Ödeme sistemi hatası: ' . $e->getMessage()]);
        }

        if (!($result['success'] ?? false)) {
            $errMsg = $result['errorMessage'] ?? ($result['error'] ?? 'Ödeme formu oluşturulamadı.');
            jsonResponse(['success' => false, 'error' => $errMsg]);
        }

        jsonResponse(['success' => true, 'payment_url' => $result['payment_page_url'], 'conversation_id' => $result['conversation_id']]);


    /**
     * GET /taxi.php?action=wallet
     */
    case 'wallet':
        $user = requireAuth();
        $stmt = $db->prepare(
            "SELECT * FROM taxi_transactions WHERE user_id=? ORDER BY tarih DESC LIMIT 30"
        );
        $stmt->execute([$user['id']]);
        $txns = $stmt->fetchAll();
        $stmt2 = $db->prepare("SELECT cuzdan_bakiyesi FROM taxi_users WHERE id=?");
        $stmt2->execute([$user['id']]);
        $bakiye = $stmt2->fetchColumn();
        jsonResponse(['success' => true, 'bakiye' => $bakiye, 'islemler' => $txns]);

    // ============================================================
    // AYARLAR
    // ============================================================

    /**
     * GET /taxi.php?action=settings
     */
    case 'settings':
        $stmt = $db->query("SELECT anahtar, deger FROM taxi_settings");
        $rows = $stmt->fetchAll();
        $out  = [];
        foreach ($rows as $r) $out[$r['anahtar']] = $r['deger'];
        jsonResponse(['success' => true, 'settings' => $out]);

    /**
     * GET /taxi.php?action=fare_estimate&km=X[&slat=&slon=&dlat=&dlon=]
     */
    case 'fare_estimate':
        $km   = (float)($_GET['km'] ?? 0);
        $slat = isset($_GET['slat']) ? (float)$_GET['slat'] : null;
        $slon = isset($_GET['slon']) ? (float)$_GET['slon'] : null;
        $dlat = isset($_GET['dlat']) ? (float)$_GET['dlat'] : null;
        $dlon = isset($_GET['dlon']) ? (float)$_GET['dlon'] : null;

        $autoTollIds = [];
        $routeKm     = null;

        if ($slat && $slon && $dlat && $dlon) {
            // Google Maps Distance Matrix — key site_settings'ten okunur, yoksa OSRM fallback
            $gmapsKey = null;
            try {
                $keyRow = $db->query("SELECT `value` FROM site_settings WHERE `key`='google_maps_api_key' LIMIT 1")->fetch();
                if ($keyRow && !empty($keyRow['value'])) $gmapsKey = $keyRow['value'];
            } catch (\Throwable $_) {}
            if ($gmapsKey) {
                $gmUrl = "https://maps.googleapis.com/maps/api/distancematrix/json?origins={$slat},{$slon}&destinations={$dlat},{$dlon}&mode=driving&language=tr&key={$gmapsKey}";
                try {
                    $ch = curl_init($gmUrl);
                    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>6, CURLOPT_SSL_VERIFYPEER=>true]);
                    $raw = curl_exec($ch);
                    curl_close($ch);
                    if ($raw) {
                        $gmData = json_decode($raw, true);
                        $distMeters = $gmData['rows'][0]['elements'][0]['distance']['value'] ?? null;
                        if ($distMeters) $routeKm = round($distMeters / 1000.0, 2);
                    }
                } catch (Exception $e) {}
            }

            // Google Maps başarısız olursa OSRM fallback
            if ($routeKm === null) {
                $osrmUrl = "https://router.project-osrm.org/route/v1/driving/{$slon},{$slat};{$dlon},{$dlat}?overview=false";
                try {
                    $ch = curl_init($osrmUrl);
                    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>6, CURLOPT_SSL_VERIFYPEER=>false]);
                    $raw = curl_exec($ch);
                    curl_close($ch);
                    if ($raw) {
                        $osrmData = json_decode($raw, true);
                        if (!empty($osrmData['routes']) && ($osrmData['code'] ?? '') === 'Ok') {
                            $routeKm = round($osrmData['routes'][0]['distance'] / 1000.0, 2);
                        }
                    }
                } catch (Exception $e) {}
            }

            $bosphCrossing = false;

            // Boğaz geçişi tespiti: segment kesişimi
            if (!$bosphCrossing) {
                // İstanbul Boğazı merkez hattı: kuzey(41.23,29.11) → güney(40.97,29.00)
                $bNLat = 41.23; $bNLon = 29.11;
                $bSLat = 40.97; $bSLon = 29.00;
                $inIst = ($slat>40.75&&$slat<41.55&&$slon>28.40&&$slon<29.90&&
                          $dlat>40.75&&$dlat<41.55&&$dlon>28.40&&$dlon<29.90);
                if ($inIst) {
                    $d1 = ($dlat-$slat)*($bNLon-$slon) - ($dlon-$slon)*($bNLat-$slat);
                    $d2 = ($dlat-$slat)*($bSLon-$slon) - ($dlon-$slon)*($bSLat-$slat);
                    $d3 = ($bSLat-$bNLat)*($slon-$bNLon) - ($bSLon-$bNLon)*($slat-$bNLat);
                    $d4 = ($bSLat-$bNLat)*($dlon-$bNLon) - ($bSLon-$bNLon)*($dlat-$bNLat);
                    if ((($d1>0&&$d2<0)||($d1<0&&$d2>0)) && (($d3>0&&$d4<0)||($d3<0&&$d4>0))) {
                        $bosphCrossing = true;
                    }
                }
            }

            if ($bosphCrossing) $autoTollIds[] = 1; // Köprü otomatik tespit edildi
            if ($routeKm !== null && $routeKm > 0) $km = $routeKm;
        }

        if ($km <= 0) jsonResponse(['success' => false, 'error' => 'km parametresi gerekli']);

        // Ücret ayarlarını al
        $settingRows = $db->query("SELECT anahtar, deger FROM taxi_settings WHERE anahtar IN ('acilis_ucreti','km_basi_ucret','bekleme_dk_ucret','indi_bindi_ucret','minimum_ucret')")->fetchAll();
        $srv = [];
        foreach ($settingRows as $sr) $srv[$sr['anahtar']] = (float)$sr['deger'];
        $acilis   = $srv['acilis_ucreti'] ?? 65.0;
        $kmRate   = $srv['km_basi_ucret'] ?? 45.0;
        $minFare  = $srv['minimum_ucret'] ?? 65.0;
        $baseFare = max($minFare, round($acilis + $km * $kmRate, 2));

        // Geçiş ücretleri
        $tolls = [];
        try {
            $tolls = $db->query("SELECT id, ad, ucret, gece_ucret, gece_baslangic, gece_bitis, tip FROM taxi_tolls WHERE aktif=1 ORDER BY sira")->fetchAll();
        } catch (Exception $e) {}

        $hour = (int)date('H');
        $tollsFormatted = array_map(function($t) use ($hour, $autoTollIds) {
            $gBas    = (int)explode(':', $t['gece_baslangic'])[0];
            $gBit    = (int)explode(':', $t['gece_bitis'])[0];
            $isNight = $t['gece_ucret'] !== null && ($hour >= $gBas || $hour < $gBit);
            return [
                'id'      => (int)$t['id'],
                'ad'      => $t['ad'],
                'tip'     => $t['tip'],
                'ucret'   => $isNight ? (float)$t['gece_ucret'] : (float)$t['ucret'],
                'gece'    => $isNight,
                'otomatik'=> in_array((int)$t['id'], $autoTollIds),
                'express' => $t['tip'] === 'tunel',
            ];
        }, $tolls);

        // Mesafe kaynağını belirle (debug/güven seviyesi için)
        $distanceSource = 'haversine';
        if ($slat && $slon && $dlat && $dlon) {
            if ($routeKm !== null) {
                // routeKm set oldu — ya Google Maps ya OSRM kullanıldı
                // Google Maps sonucu OSRM'den daha güvenilir; ikisini ayırt etmiyoruz
                // ama her ikisi de gerçek yol mesafesidir
                $distanceSource = 'road';
            }
        }

        jsonResponse([
            'success'         => true,
            'tahmini_ucret'   => $baseFare,
            'acilis_ucreti'   => $acilis,
            'km'              => $km,
            'km_basi_ucret'   => $kmRate,
            'km_ucreti'       => round($km * $kmRate, 2),
            'gecis_ucretleri' => $tollsFormatted,
            'mesafe_kaynagi'  => $distanceSource,
        ]);

    // ============================================================
    // SÖZLEŞME
    // ============================================================

    /**
     * GET /taxi.php?action=get_contract
     * Aktif sözleşmeyi döner (public — kayıt ekranında gösterilir)
     */
    case 'get_contract':
        $stmt = $db->prepare("SELECT id, surum, icerik, yururluk_tarihi FROM taxi_contracts WHERE aktif=1 ORDER BY id DESC LIMIT 1");
        $stmt->execute();
        $contract = $stmt->fetch();
        if (!$contract) jsonResponse(['success' => false, 'error' => 'Aktif sözleşme bulunamadı'], 404);
        jsonResponse(['success' => true, 'contract' => $contract]);

    /**
     * POST /taxi.php?action=accept_contract
     * Body: { surum }  — kullanıcı sözleşmeyi kabul etti
     */
    case 'accept_contract':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $surum = trim($input['surum'] ?? '');
        if (!$surum) jsonResponse(['success' => false, 'error' => 'surum gerekli']);
        // Verilen sürümün var olduğunu doğrula
        $chk = $db->prepare("SELECT id FROM taxi_contracts WHERE surum=? AND aktif=1");
        $chk->execute([$surum]);
        if (!$chk->fetch()) jsonResponse(['success' => false, 'error' => 'Geçersiz sözleşme sürümü'], 400);
        $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '')[0]);
        $db->prepare("UPDATE taxi_users SET sozlesme_surumu=?, sozlesme_kabul_at=NOW(), terms_accepted_ip=? WHERE id=?")
           ->execute([$surum, $ip ?: null, $user['id']]);
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=accept_driver_terms
     * Body: { surum }  — sürücü Madde 2, 4, 5'i kabul etti (belge yükleme tamamlandığında)
     */
    case 'accept_driver_terms':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $surum = trim($input['surum'] ?? '');
        if (!$surum) jsonResponse(['success' => false, 'error' => 'surum gerekli']);
        $chk = $db->prepare("SELECT id FROM taxi_contracts WHERE surum=? AND aktif=1");
        $chk->execute([$surum]);
        if (!$chk->fetch()) jsonResponse(['success' => false, 'error' => 'Geçersiz sözleşme sürümü'], 400);
        $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '')[0]);
        $db->prepare("UPDATE taxi_users SET driver_terms_accepted_at=NOW(), driver_terms_version=?, driver_terms_ip=? WHERE id=?")
           ->execute([$surum, $ip ?: null, $user['id']]);
        jsonResponse(['success' => true]);

    // ============================================================
    // ARAÇ BELGELERİ
    // ============================================================

    /**
     * POST /taxi.php?action=upload_arac_belgeleri
     * Body: { muayene_base64?: string, sigorta_base64?: string }
     */
    case 'upload_arac_belgeleri':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        if ($user['rol'] !== 'surucu') jsonResponse(['success' => false, 'error' => 'Yalnızca sürücüler yükleyebilir'], 403);
        $input = getJsonInput();

        $uploadDir = dirname(__DIR__) . '/uploads/arac_belgeleri/';
        if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);

        $sets = []; $vals = [];
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host     = $_SERVER['HTTP_HOST'] ?? 'patimera.com';

        foreach (['muayene' => 'arac_muayene_belge', 'sigorta' => 'trafik_sigortasi_belge'] as $prefix => $col) {
            $b64raw = $input[$prefix . '_base64'] ?? null;
            if (empty($b64raw)) continue;
            $b64  = preg_replace('#^data:\w+/\w+;base64,#', '', $b64raw);
            $data = base64_decode($b64, true);
            if ($data === false || strlen($data) < 100) continue;
            if (strlen($data) > 3_145_728) jsonResponse(['success' => false, 'error' => 'Belge dosyası 3 MB limitini aşıyor.']);
            $fname = $prefix . '_' . $user['id'] . '_' . time() . '.jpg';
            if (file_put_contents($uploadDir . $fname, $data) === false)
                jsonResponse(['success' => false, 'error' => 'Dosya kaydedilemedi.']);
            $sets[] = "$col = ?";
            $vals[] = $protocol . '://' . $host . '/pet_taxi/uploads/arac_belgeleri/' . $fname;
        }

        if (empty($sets)) jsonResponse(['success' => false, 'error' => 'En az bir belge seçmelisiniz.']);

        // Her iki belge de mevcut olduğunda durum -> yuklendi, aktif -> aktif
        $cur = $db->prepare("SELECT arac_muayene_belge, trafik_sigortasi_belge FROM taxi_users WHERE id=?");
        $cur->execute([$user['id']]);
        $existing = $cur->fetch();
        $setKeys  = array_map(fn($s) => trim(preg_replace('/\s*=\s*\?/', '', $s)), $sets);
        $hasMuayene = in_array('arac_muayene_belge', $setKeys)     || !empty($existing['arac_muayene_belge']);
        $hasSigorta = in_array('trafik_sigortasi_belge', $setKeys) || !empty($existing['trafik_sigortasi_belge']);

        if ($hasMuayene && $hasSigorta) {
            $sets[] = "arac_belgeler_durum = ?";  $vals[] = 'yuklendi';
            $sets[] = "arac_belge_red_nedeni = ?"; $vals[] = null;
            if (($user['durum'] ?? '') === 'pasif') {
                $sets[] = "durum = ?"; $vals[] = 'aktif';
            }
        }

        $vals[] = $user['id'];
        $db->prepare("UPDATE taxi_users SET " . implode(', ', $sets) . " WHERE id=?")->execute($vals);

        $stmt = $db->prepare("SELECT * FROM taxi_users WHERE id=?");
        $stmt->execute([$user['id']]);
        $updated = $stmt->fetch();
        unset($updated['sifre']);
        jsonResponse(['success' => true, 'user' => $updated, 'message' => 'Belgeler yüklendi, inceleme için gönderildi.']);

    /**
     * POST /taxi.php?action=approve_arac_belge   (admin only)
     * Body: { user_id: int }
     */
    case 'approve_arac_belge':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $admin = requireAuth();
        if ($admin['rol'] !== 'admin') jsonResponse(['success' => false, 'error' => 'Yetkisiz'], 403);
        $input  = getJsonInput();
        $userId = (int)($input['user_id'] ?? 0);
        if (!$userId) jsonResponse(['success' => false, 'error' => 'user_id gerekli']);
        $db->prepare("UPDATE taxi_users SET arac_belgeler_durum='onaylandi', arac_belge_red_nedeni=NULL WHERE id=?")->execute([$userId]);
        taxiNotify($db, $userId, '✅ Araç Belgeleriniz Onaylandı',
            'Araç muayene ve trafik sigortası belgeleriniz incelendi ve onaylandı.', 'sistem');
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=reject_arac_belge   (admin only)
     * Body: { user_id: int, red_nedeni?: string }
     */
    case 'reject_arac_belge':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $admin = requireAuth();
        if ($admin['rol'] !== 'admin') jsonResponse(['success' => false, 'error' => 'Yetkisiz'], 403);
        $input     = getJsonInput();
        $userId    = (int)($input['user_id'] ?? 0);
        $redNedeni = trim($input['red_nedeni'] ?? '');
        if (!$userId) jsonResponse(['success' => false, 'error' => 'user_id gerekli']);
        $db->prepare("UPDATE taxi_users SET arac_belgeler_durum='reddedildi', arac_belge_red_nedeni=? WHERE id=?")->execute([$redNedeni ?: null, $userId]);
        $msg = $redNedeni ? "Araç belgeleriniz reddedildi. Neden: {$redNedeni}" : 'Araç belgeleriniz reddedildi. Lütfen tekrar yükleyin.';
        taxiNotify($db, $userId, '❌ Araç Belgeleriniz Reddedildi', $msg, 'sistem');
        jsonResponse(['success' => true]);

    // ============================================================
    // KAYIT
    // ============================================================

    /**
     * POST /taxi.php?action=register
     * Body: { ad_soyad, email, sifre, rol ('sahip'|'surucu'), telefon?, sehir?, ilce? }
     */
    case 'register':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $input = getJsonInput();

        $adSoyad = trim($input['ad_soyad'] ?? '');
        $email   = trim($input['email']    ?? '');
        $sifre   = $input['sifre']         ?? '';
        $rol     = $input['rol']           ?? 'sahip';

        if (!$adSoyad || !$email || !$sifre) {
            jsonResponse(['success' => false, 'error' => 'Ad soyad, email ve şifre zorunludur']);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['success' => false, 'error' => 'Geçersiz email adresi']);
        }
        if (!in_array($rol, ['sahip','surucu'])) {
            jsonResponse(['success' => false, 'error' => 'Rol sahip veya surucu olmalıdır']);
        }
        if (strlen($sifre) < 6) {
            jsonResponse(['success' => false, 'error' => 'Şifre en az 6 karakter olmalıdır']);
        }

        // Sözleşme sürümü zorunlu
        $termsVersion = trim($input['terms_version'] ?? '');
        if (!$termsVersion) {
            jsonResponse(['success' => false, 'error' => 'Kullanım koşullarını kabul etmeniz zorunludur']);
        }
        $chkTerms = $db->prepare("SELECT id FROM taxi_contracts WHERE surum=? AND aktif=1");
        $chkTerms->execute([$termsVersion]);
        if (!$chkTerms->fetch()) {
            jsonResponse(['success' => false, 'error' => 'Geçersiz sözleşme sürümü. Lütfen uygulamayı güncelleyin.'], 400);
        }

        // Email çakışma kontrolü
        $stmt = $db->prepare("SELECT id FROM taxi_users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            jsonResponse(['success' => false, 'error' => 'Bu email zaten kayıtlı']);
        }

        $ip   = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '')[0]);
        $hash = password_hash($sifre, PASSWORD_BCRYPT);
        $stmt = $db->prepare(
            "INSERT INTO taxi_users (ad_soyad, email, sifre, rol, telefon, sehir, ilce, sozlesme_surumu, sozlesme_kabul_at, terms_accepted_ip)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)"
        );
        $stmt->execute([
            $adSoyad, $email, $hash, $rol,
            $input['telefon'] ?? null,
            $input['sehir']   ?? null,
            $input['ilce']    ?? null,
            $termsVersion,
            $ip ?: null,
        ]);
        $userId = $db->lastInsertId();
        adminNotify($db, 'yeni_uye', "Pet Taxi yeni üye: $adSoyad", $email . ($input['sehir'] ? ' — ' . $input['sehir'] : ''), '/admin/taxi-user-detail.php?id=' . $userId);

        // Otomatik login token
        $token     = generateToken($userId);
        $expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));
        $db->prepare("INSERT INTO taxi_user_tokens (user_id, token, device_info, expires_at) VALUES (?, ?, ?, ?)")
           ->execute([$userId, $token, 'pet_taxi_app', $expiresAt]);

        $stmt = $db->prepare("SELECT * FROM taxi_users WHERE id=?");
        $stmt->execute([$userId]);
        $newUser = $stmt->fetch();
        unset($newUser['sifre']);

        jsonResponse(['success' => true, 'token' => $token, 'expires_at' => $expiresAt, 'user' => $newUser], 201);

    /**
     * GET /taxi.php?action=places_search&q=...
     * Nominatim (OpenStreetMap) adres arama — key gerektirmez
     * Yanıtta lat/lon/city/district gömülü — ayrıca places_detail çağrısı gerekmez
     */
    case 'places_search':
        $q   = trim($_GET['q'] ?? '');
        $lat = isset($_GET['lat']) && $_GET['lat'] !== '' ? (float)$_GET['lat'] : null;
        $lon = isset($_GET['lon']) && $_GET['lon'] !== '' ? (float)$_GET['lon'] : null;
        if (strlen($q) < 2) jsonResponse(['success' => true, 'predictions' => []]);
        $nomParams = [
            'format'          => 'json',
            'q'               => $q,
            'accept-language' => 'tr',
            'countrycodes'    => 'tr',
            'addressdetails'  => '1',
            'namedetails'     => '1',
            'dedupe'          => '1',
            'limit'           => '8',
        ];
        if ($lat && $lon) {
            // ~30 km viewbox — yakın sonuçları öne çeker (bounded=0: Türkiye genelinde de çıkar)
            $nomParams['viewbox'] = ($lon - 0.4) . ',' . ($lat + 0.3) . ',' . ($lon + 0.4) . ',' . ($lat - 0.3);
        }
        $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query($nomParams);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => ['User-Agent: PatimeraApp/1.0 (info@patimera.com)'],
        ]);
        $raw  = curl_exec($ch);
        curl_close($ch);
        $items = ($raw ? json_decode($raw, true) : null) ?? [];
        $predictions = [];
        foreach ($items as $item) {
            $addr     = $item['address'] ?? [];
            // İl: önce city (büyük şehirler), sonra province/state
            $city     = $addr['city'] ?? $addr['province'] ?? $addr['state'] ?? '';
            // İlçe: district önce, fallback county/municipality/suburb
            $district = $addr['district'] ?? $addr['county'] ?? $addr['municipality'] ?? $addr['suburb'] ?? '';
            // Ana metin: bina adı + kapı no + cadde/sokak/mahalle
            $houseNo  = $addr['house_number'] ?? '';
            $road     = $addr['road'] ?? '';
            $amenity  = $addr['amenity'] ?? $addr['shop'] ?? $addr['tourism'] ?? '';
            $nbhood   = $addr['neighbourhood'] ?? $addr['quarter'] ?? '';
            if ($amenity) {
                $main = $amenity . ($road ? ', ' . $road : '');
            } elseif ($road) {
                $main = $road . ($houseNo ? ' No:' . $houseNo : '');
            } else {
                $main = $nbhood ?: ($addr['suburb'] ?? ($item['name'] ?? ''));
            }
            // Kısa açıklama: mahalle, ilçe, il
            $secondary = implode(', ', array_filter([$nbhood && $nbhood !== $main ? $nbhood : '', $district, $city]));
            // Görünen ad: display_name'i sadeleştir (Türkiye kısmını çıkar, max 80 karakter)
            $rawDisplay = $item['display_name'] ?? '';
            $display    = preg_replace('/,?\s*Türkiye\s*$/', '', $rawDisplay);
            if (!$display) $display = implode(', ', array_filter([$main, $district, $city]));
            $predictions[] = [
                'place_id'    => (string)($item['place_id'] ?? ''),
                'description' => $display,
                'structured_formatting' => [
                    'main_text'      => $main ?: ($item['name'] ?? ''),
                    'secondary_text' => $secondary,
                ],
                '_lat'      => $item['lat'] ?? null,
                '_lon'      => $item['lon'] ?? null,
                '_city'     => $city,
                '_district' => $district,
            ];
        }
        jsonResponse(['success' => true, 'predictions' => $predictions]);

    // ============================================================
    // İL / İLÇE
    // ============================================================

    case 'iller':
        try {
            // İstanbul(34), Ankara(6), İzmir(35) listenin başında
            $stmt = $db->query(
                "SELECT id, ad FROM sehirler
                 ORDER BY (CASE WHEN id IN (34,6,35) THEN 0 ELSE 1 END), ad"
            );
            jsonResponse(['success' => true, 'iller' => $stmt->fetchAll()]);
        } catch (Exception $e) {
            jsonResponse(['success' => false, 'error' => $e->getMessage()]);
        }

    case 'ilceler':
        $sehirId = (int)($_GET['sehir_id'] ?? 0);
        if (!$sehirId) jsonResponse(['success' => false, 'error' => 'sehir_id gerekli']);
        try {
            $stmt = $db->prepare("SELECT id, ad FROM ilceler WHERE sehir_id=? ORDER BY ad");
            $stmt->execute([$sehirId]);
            jsonResponse(['success' => true, 'ilceler' => $stmt->fetchAll()]);
        } catch (Exception $e) {
            jsonResponse(['success' => false, 'error' => $e->getMessage()]);
        }

    // ============================================================
    // KAYITLI ADRESLER
    // ============================================================

    case 'my_addresses':
        $user = requireAuth();
        $stmt = $db->prepare("SELECT id, ad, adres, sehir, ilce, lat, lon FROM taxi_addresses WHERE user_id=? ORDER BY id DESC");
        $stmt->execute([$user['id']]);
        jsonResponse(['success' => true, 'addresses' => $stmt->fetchAll()]);

    case 'add_address':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST required'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $ad    = trim($input['ad']    ?? '');
        $adres = trim($input['adres'] ?? '');
        if (!$ad || !$adres) jsonResponse(['success' => false, 'error' => 'Ad ve adres zorunludur']);
        $db->prepare("INSERT INTO taxi_addresses (user_id, ad, adres, sehir, ilce, lat, lon) VALUES (?,?,?,?,?,?,?)")
           ->execute([$user['id'], $ad, $adres, $input['sehir'] ?? null, $input['ilce'] ?? null,
                      isset($input['lat']) ? (float)$input['lat'] : null,
                      isset($input['lon']) ? (float)$input['lon'] : null]);
        jsonResponse(['success' => true, 'id' => (int)$db->lastInsertId()]);

    case 'delete_address':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST required'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $id    = (int)($input['id'] ?? 0);
        if (!$id) jsonResponse(['success' => false, 'error' => 'ID zorunludur']);
        $db->prepare("DELETE FROM taxi_addresses WHERE id=? AND user_id=?")->execute([$id, $user['id']]);
        jsonResponse(['success' => true]);

    case 'update_address':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST required'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $id    = (int)($input['id'] ?? 0);
        $ad    = trim($input['ad']    ?? '');
        $adres = trim($input['adres'] ?? '');
        if (!$id || !$ad || !$adres) jsonResponse(['success' => false, 'error' => 'id, ad ve adres zorunludur']);
        $db->prepare("UPDATE taxi_addresses SET ad=?, adres=?, sehir=?, ilce=?, lat=?, lon=? WHERE id=? AND user_id=?")
           ->execute([$ad, $adres, $input['sehir'] ?? null, $input['ilce'] ?? null,
                      isset($input['lat']) ? (float)$input['lat'] : null,
                      isset($input['lon']) ? (float)$input['lon'] : null,
                      $id, $user['id']]);
        jsonResponse(['success' => true]);

    // ============================================================
    // HAYVAN TÜRLERİ & CİNSLERİ
    // ============================================================

    case 'pet_turleri':
        $stmt = $db->query("SELECT id, slug, ad, emoji FROM taxi_hayvan_turleri WHERE aktif=1 ORDER BY sira, id");
        jsonResponse(['success' => true, 'turleri' => $stmt->fetchAll()]);

    case 'pet_cinsleri':
        $turId = (int)($_GET['tur_id'] ?? 0);
        if (!$turId) jsonResponse(['success' => false, 'error' => 'tur_id gerekli']);
        $stmt = $db->prepare("SELECT id, ad FROM taxi_hayvan_cinsleri WHERE tur_id=? AND aktif=1 ORDER BY ad");
        $stmt->execute([$turId]);
        jsonResponse(['success' => true, 'cinsleri' => $stmt->fetchAll()]);


    // ============================================================
    // DESTEK SOHBET
    // ============================================================

    /**
     * GET /taxi.php?action=get_support_messages
     * Kullanıcının destek mesajlarını döner.
     */
    /**
     * GET /taxi.php?action=get_mention_suggestions
     * Destek mesajında @ ile etiketlenebilecek kişiler/köpekler (kişisel geçmişe göre)
     */
    case 'get_mention_suggestions':
        $user = requireAuth();
        $suggestions = [];
        // Köpekler (sahibin kayıtlı hayvanları)
        $stmt = $db->prepare("SELECT isim AS ad, 'kopek' AS tur FROM taxi_dogs WHERE sahip_id=? AND durum='aktif' ORDER BY isim LIMIT 10");
        $stmt->execute([$user['id']]);
        $suggestions = array_merge($suggestions, $stmt->fetchAll());
        // İlişkili sürücüler (sahip ise) veya müşteriler (sürücü ise)
        if ($user['rol'] === 'sahip') {
            $stmt = $db->prepare("
                SELECT DISTINCT tu.ad_soyad AS ad, 'surucu' AS tur
                FROM taxi_matches tm
                JOIN taxi_requests tr ON tr.id = tm.talep_id
                JOIN taxi_users tu ON tu.id = tm.surucu_id
                WHERE tr.kopek_sahibi_id = ?
                ORDER BY tu.ad_soyad LIMIT 20
            ");
        } else {
            $stmt = $db->prepare("
                SELECT DISTINCT tu.ad_soyad AS ad, 'sahip' AS tur
                FROM taxi_matches tm
                JOIN taxi_requests tr ON tr.id = tm.talep_id
                JOIN taxi_users tu ON tu.id = tr.kopek_sahibi_id
                WHERE tm.surucu_id = ?
                ORDER BY tu.ad_soyad LIMIT 20
            ");
        }
        $stmt->execute([$user['id']]);
        $suggestions = array_merge($suggestions, $stmt->fetchAll());
        jsonResponse(['success' => true, 'suggestions' => $suggestions]);

    case 'get_support_messages':
        $user = requireAuth();
        $stmt = $db->prepare(
            "SELECT * FROM taxi_support_messages WHERE user_id = ? ORDER BY tarih ASC"
        );
        $stmt->execute([$user['id']]);
        $msgs = $stmt->fetchAll();

        // Okunmamış admin mesajlarını okundu yap
        $db->prepare(
            "UPDATE taxi_support_messages SET okundu=1 WHERE user_id=? AND gonderen='admin' AND okundu=0"
        )->execute([$user['id']]);

        jsonResponse(['success' => true, 'messages' => $msgs]);

    /**
     * POST /taxi.php?action=send_support_message
     * Body: { mesaj }
     */
    case 'send_support_message':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $mesaj = trim($input['mesaj'] ?? '');
        if (!$mesaj) jsonResponse(['success' => false, 'error' => 'Mesaj boş olamaz']);
        $filter = taxiFilterMessage($mesaj);
        if (!$filter['valid']) jsonResponse(['success' => false, 'error' => $filter['error']]);
        $mesaj = $filter['message'];

        $db->prepare(
            "INSERT INTO taxi_support_messages (user_id, mesaj, gonderen) VALUES (?, ?, 'kullanici')"
        )->execute([$user['id'], $mesaj]);

        // Admin'e bildirim gönder (admin rolündeki ilk kullanıcı)
        try {
            $admins = $db->query("SELECT id FROM taxi_users WHERE rol='admin' LIMIT 3")->fetchAll();
            foreach ($admins as $admin) {
                taxiNotify($db, (int)$admin['id'], '💬 Destek Mesajı',
                    "{$user['ad_soyad']}: {$mesaj}", 'destek_mesaji');
            }
        } catch (\Exception $e) {}

        jsonResponse(['success' => true]);

    /**
     * GET /taxi.php?action=support_unread_count
     * Okunmamış admin yanıt sayısı
     */
    case 'support_unread_count':
        $user = requireAuth();
        $stmt = $db->prepare(
            "SELECT COUNT(*) FROM taxi_support_messages WHERE user_id=? AND gonderen='admin' AND okundu=0"
        );
        $stmt->execute([$user['id']]);
        jsonResponse(['success' => true, 'count' => (int)$stmt->fetchColumn()]);

    // ============================================================
    // SÜRÜCÜ ONBOARDING v2
    // ============================================================

    /**
     * GET /taxi.php?action=get_driver_onboarding_config
     * Lookup tabloları + mevcut sürücü profili (wizard pre-fill için)
     */
    case 'get_driver_onboarding_config':
        $user = requireAuth();

        $animalTypes = $db->query("SELECT id, ad, slug FROM animal_types ORDER BY sort_order")->fetchAll();
        $equipments  = $db->query("SELECT id, ad, slug FROM equipments  ORDER BY sort_order")->fetchAll();

        // Mevcut drivers kaydı
        $stmt = $db->prepare("SELECT * FROM drivers WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        $driver = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

        $vehicle = null;
        $vehiclePhotos = [];
        $allowedAnimals = [];
        $driverEquipments = [];

        if ($driver) {
            $driverId = (int)$driver['id'];

            $stmt = $db->prepare("SELECT * FROM driver_vehicles WHERE driver_id = ?");
            $stmt->execute([$driverId]);
            $vehicle = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

            if ($vehicle) {
                $stmt = $db->prepare("SELECT id, foto_url, foto_turu, siralama FROM driver_vehicle_photos WHERE vehicle_id = ? ORDER BY siralama");
                $stmt->execute([(int)$vehicle['id']]);
                $vehiclePhotos = $stmt->fetchAll();
            }

            $stmt = $db->prepare("SELECT animal_type_id FROM driver_allowed_animals WHERE driver_id = ?");
            $stmt->execute([$driverId]);
            $allowedAnimals = array_column($stmt->fetchAll(), 'animal_type_id');

            $stmt = $db->prepare("SELECT equipment_id FROM driver_equipments WHERE driver_id = ?");
            $stmt->execute([$driverId]);
            $driverEquipments = array_column($stmt->fetchAll(), 'equipment_id');
        }

        jsonResponse([
            'success'           => true,
            'animal_types'      => $animalTypes,
            'equipments'        => $equipments,
            'driver'            => $driver,
            'vehicle'           => $vehicle,
            'vehicle_photos'    => $vehiclePhotos,
            'allowed_animals'   => $allowedAnimals,
            'driver_equipments' => $driverEquipments,
        ]);

    /**
     * POST /taxi.php?action=upload_driver_photo
     * Body: { photo_base64: string, field: string }
     * Tek fotoğrafı diske kaydeder, URL döner. Büyük step payload'larından kaçınmak için.
     */
    case 'upload_driver_photo':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();

        $base64Raw = $input['photo_base64'] ?? '';
        $field     = preg_replace('/[^a-z0-9_]/', '', $input['field'] ?? 'photo');

        if (empty($base64Raw)) jsonResponse(['success' => false, 'error' => 'Fotoğraf verisi eksik.']);

        // data:image/jpeg;base64,... önekini temizle
        $base64 = preg_replace('#^data:\w+/\w+;base64,#', '', $base64Raw);
        $data   = base64_decode($base64, true);

        if ($data === false)        jsonResponse(['success' => false, 'error' => 'Geçersiz base64 verisi.']);
        if (strlen($data) < 100)    jsonResponse(['success' => false, 'error' => 'Fotoğraf verisi çok küçük.']);
        if (strlen($data) > 3_145_728) jsonResponse(['success' => false, 'error' => 'Fotoğraf 3 MB limitini aşıyor.']); // 3 MB hard limit

        $uploadDir = dirname(__DIR__) . '/uploads/drivers/';
        if (!is_dir($uploadDir)) @mkdir($uploadDir, 0755, true);
        if (!is_writable($uploadDir)) jsonResponse(['success' => false, 'error' => 'Yükleme dizini yazılamıyor.']);

        $filename = 'drv_' . $user['id'] . '_' . $field . '_' . time() . '_' . rand(1000, 9999) . '.jpg';
        $filepath = $uploadDir . $filename;

        if (file_put_contents($filepath, $data) === false) {
            jsonResponse(['success' => false, 'error' => 'Dosya kaydedilemedi.']);
        }

        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host     = $_SERVER['HTTP_HOST'] ?? 'patimera.com';
        $url      = $protocol . '://' . $host . '/pet_taxi/uploads/drivers/' . $filename;

        jsonResponse(['success' => true, 'url' => $url]);

    /**
     * POST /taxi.php?action=save_driver_step
     * Body: { step: 1-4, ...adıma özgü alanlar }
     */
    case 'save_driver_step':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $step  = (int)($input['step'] ?? 0);

        if ($step < 1 || $step > 4) jsonResponse(['success' => false, 'error' => 'Geçersiz adım.']);

        // Sürücü kaydını al veya oluştur
        $stmt = $db->prepare("SELECT id, adim_tamamlanan, durum FROM drivers WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        $driverRow = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$driverRow) {
            $db->prepare("INSERT INTO drivers (user_id) VALUES (?)")->execute([$user['id']]);
            $driverId      = (int)$db->lastInsertId();
            $completedStep = 0;
            $currentDurum  = 'taslak';
        } else {
            $driverId      = (int)$driverRow['id'];
            $completedStep = (int)$driverRow['adim_tamamlanan'];
            $currentDurum  = $driverRow['durum'];
        }

        if ($currentDurum === 'onaylandi') jsonResponse(['success' => false, 'error' => 'Onaylı hesap değiştirilemez.']);
        if ($step > $completedStep + 1)    jsonResponse(['success' => false, 'error' => "Lütfen önce {$completedStep}. adımı tamamlayın."]);

        $errors = match ($step) {
            1 => driverValidateStep1($input),
            2 => driverValidateStep2($input),
            3 => driverValidateStep3($input, $db),
            4 => driverValidateStep4($input),
        };
        if (!empty($errors)) jsonResponse(['success' => false, 'errors' => $errors]);

        $db->beginTransaction();
        try {
            switch ($step) {
                case 1:
                    $upd = ['adim_tamamlanan' => max($completedStep, 1)];
                    if (!empty($input['profil_foto']))  $upd['profil_foto']  = $input['profil_foto'];
                    if (!empty($input['ehliyet_on']))   $upd['ehliyet_on']   = $input['ehliyet_on'];
                    if (!empty($input['ehliyet_arka'])) $upd['ehliyet_arka'] = $input['ehliyet_arka'];
                    if (!empty($input['adli_sicil']))   $upd['adli_sicil']   = $input['adli_sicil'];
                    driverUpdateRow($db, $driverId, $upd);
                    // Profil fotoğrafını taxi_users'a da yaz (getMe() buradan okur)
                    if (!empty($input['profil_foto'])) {
                        $db->prepare("UPDATE taxi_users SET profil_foto = ? WHERE id = ?")
                           ->execute([$input['profil_foto'], $user['id']]);
                    }
                    break;

                case 2:
                    $stmt = $db->prepare("SELECT id FROM driver_vehicles WHERE driver_id = ?");
                    $stmt->execute([$driverId]);
                    $vehicleId = $stmt->fetchColumn();

                    $vData = [
                        'marka'        => trim($input['marka']),
                        'model'        => trim($input['model']),
                        'yil'          => (int)$input['yil'],
                        'plaka'        => strtoupper(trim($input['plaka'])),
                        'klima_taahhut'=> (int)!empty($input['klima_taahhut']),
                    ];
                    if (!empty($input['ruhsat_foto'])) $vData['ruhsat_foto'] = $input['ruhsat_foto'];

                    if ($vehicleId) {
                        $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($vData)));
                        $db->prepare("UPDATE driver_vehicles SET $sets WHERE id = ?")->execute([...array_values($vData), $vehicleId]);
                    } else {
                        $vData['driver_id'] = $driverId;
                        $cols  = implode(', ', array_keys($vData));
                        $marks = implode(', ', array_fill(0, count($vData), '?'));
                        $db->prepare("INSERT INTO driver_vehicles ($cols) VALUES ($marks)")->execute(array_values($vData));
                        $vehicleId = (int)$db->lastInsertId();
                    }

                    // Yeni araç içi görselleri ekle
                    $stmtP = $db->prepare("INSERT INTO driver_vehicle_photos (vehicle_id, foto_url, foto_turu, siralama) VALUES (?,?,'ic_mekan',?)");
                    foreach (($input['ic_gorseller'] ?? []) as $i => $foto) {
                        $stmtP->execute([$vehicleId, $foto, $i]);
                    }

                    driverUpdateRow($db, $driverId, ['adim_tamamlanan' => max($completedStep, 2)]);
                    break;

                case 3:
                    $db->prepare("DELETE FROM driver_allowed_animals WHERE driver_id = ?")->execute([$driverId]);
                    $stmtA = $db->prepare("INSERT INTO driver_allowed_animals (driver_id, animal_type_id) VALUES (?,?)");
                    foreach ($input['hayvan_turleri'] as $aid) $stmtA->execute([$driverId, (int)$aid]);

                    $db->prepare("DELETE FROM driver_equipments WHERE driver_id = ?")->execute([$driverId]);
                    $stmtE = $db->prepare("INSERT INTO driver_equipments (driver_id, equipment_id) VALUES (?,?)");
                    foreach (($input['ekipmanlar'] ?? []) as $eid) $stmtE->execute([$driverId, (int)$eid]);

                    driverUpdateRow($db, $driverId, ['allerji_beyan' => 1, 'adim_tamamlanan' => max($completedStep, 3)]);
                    break;

                case 4:
                    // eksik_alanlar temizle, basvuru_sayisi artır
                    $db->prepare("UPDATE drivers SET basvuru_sayisi = basvuru_sayisi + 1 WHERE id = ?")->execute([$driverId]);
                    driverUpdateRow($db, $driverId, [
                        'kurallar_kabul'    => 1,
                        'kurallar_kabul_at' => date('Y-m-d H:i:s'),
                        'adim_tamamlanan'   => 4,
                        'durum'             => 'beklemede',
                        'submitted_at'      => date('Y-m-d H:i:s'),
                        'eksik_alanlar'     => null,
                        'red_nedeni'        => null,
                    ]);
                    // taxi_users backward compat sync
                    $db->prepare("UPDATE taxi_users SET sertifika_durumu = 'beklemede' WHERE id = ?")->execute([$user['id']]);
                    // Admin bildir
                    try {
                        $admins = $db->query("SELECT id FROM taxi_users WHERE rol='admin' LIMIT 3")->fetchAll();
                        foreach ($admins as $adm) {
                            taxiNotify($db, (int)$adm['id'], '🧑‍✈️ Yeni Sürücü Başvurusu',
                                "{$user['ad_soyad']} sürücü belgelerini tamamladı.", 'sistem');
                        }
                    } catch (\Exception $e2) {}
                    adminNotify($db, 'surucucu_basvurusu', "Sürücü başvurusu: {$user['ad_soyad']}", 'Belgeler tamamlandı, onay bekliyor.', '/admin/taxi-drivers.php');
                    break;
            }

            $db->commit();
            jsonResponse(['success' => true, 'step' => $step, 'is_final' => $step === 4]);

        } catch (\Exception $e) {
            $db->rollBack();
            jsonResponse(['success' => false, 'error' => 'Kayıt hatası: ' . $e->getMessage()]);
        }

    // ============================================================
    default:
        jsonResponse(['success' => false, 'error' => "Bilinmeyen action: '{$action}'"], 404);
}
