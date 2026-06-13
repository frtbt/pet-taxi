<?php
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
function taxiNotify(PDO $db, int $userId, string $title, string $body, string $tip = 'sistem'): void
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
        PushNotification::sendToToken($token, $title, $body, ['type' => $tip], 'notifications');
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
        ('min_para_cekme',   '50')
    ");

    // Köpekler tablosu (taxi_users'a bağlı bağımsız kopya)
    $db->exec("CREATE TABLE IF NOT EXISTS taxi_dogs (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        sahip_id     INT NOT NULL,
        isim         VARCHAR(50) NOT NULL,
        irk          VARCHAR(50),
        yas          INT,
        kilo         DECIMAL(5,2),
        cinsiyet     ENUM('erkek','disi') DEFAULT 'erkek',
        notlar       TEXT,
        profil_resmi VARCHAR(255) DEFAULT 'default-dog.jpg',
        durum        ENUM('aktif','pasif') DEFAULT 'aktif',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sahip_id) REFERENCES taxi_users(id) ON DELETE CASCADE,
        INDEX idx_sahip (sahip_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Exception $e) {}

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
        // Cancel open requests
        $db->prepare("UPDATE taxi_talepler SET durum = 'iptal' WHERE sahip_id = ? AND durum IN ('bekliyor','eslesti')")->execute([$uid]);
        // Delete the account (soft-delete: mark inactive, keep history)
        $db->prepare("UPDATE taxi_users SET email = CONCAT('deleted_', id, '_', email), is_active = 0, ad_soyad = 'Deleted User' WHERE id = ?")->execute([$uid]);
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=register_push_token
     * Body: { push_token: string }
     */
    case 'register_push_token':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST required'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $token = trim($input['push_token'] ?? '');
        if (!$token) jsonResponse(['success' => false, 'error' => 'push_token required']);
        $db->prepare("UPDATE taxi_users SET fcm_token = ? WHERE id = ?")->execute([$token, $user['id']]);
        jsonResponse(['success' => true]);

    /**
     * GET /taxi.php?action=get_notifications
     */
    case 'get_notifications':
        $user  = requireAuth();
        $stmt  = $db->prepare("SELECT * FROM taxi_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30");
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
        jsonResponse(['success' => true, 'unread_notifications' => $count]);

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
        unset($user['sifre']);
        jsonResponse(['success' => true, 'user' => $user]);

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

        // Zorunlu alanlar
        $required = ['kopek_id','kalkis_zamani','baslangic_noktasi','baslangic_sehir','baslangic_ilce','varis_noktasi','varis_sehir','varis_ilce'];
        foreach ($required as $field) {
            if (empty($input[$field])) {
                jsonResponse(['success' => false, 'error' => "'{$field}' alanı zorunludur"]);
            }
        }

        // Köpek sahipliği doğrula
        $stmt = $db->prepare("SELECT id FROM taxi_dogs WHERE id = ? AND sahip_id = ? AND durum = 'aktif'");
        $stmt->execute([$input['kopek_id'], $user['id']]);
        if (!$stmt->fetch()) {
            jsonResponse(['success' => false, 'error' => 'Köpek bulunamadı veya size ait değil']);
        }

        $mesafe      = isset($input['tahmini_mesafe']) ? (float)$input['tahmini_mesafe'] : null;
        $toplamUcret = isset($input['toplam_ucret']) ? (float)$input['toplam_ucret']
                     : ($mesafe ? calculateFare($db, $mesafe) : 50.0);

        $stmt = $db->prepare("
            INSERT INTO taxi_requests
                (sahip_id, kopek_id,
                 baslangic_noktasi, baslangic_sehir, baslangic_ilce, baslangic_lat, baslangic_lon,
                 varis_noktasi, varis_sehir, varis_ilce, varis_lat, varis_lon,
                 kalkis_zamani, tahmini_mesafe, toplam_ucret, tip, ozel_talepler)
            VALUES
                (?, ?,
                 ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?)
        ");
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
        ]);
        $talepId = $db->lastInsertId();
        // Notify all active drivers about the new request
        $pickup = $input['baslangic_ilce'] . ', ' . $input['baslangic_sehir'];
        $dropoff = $input['varis_ilce'] . ', ' . $input['varis_sehir'];
        taxiNotifyAllDrivers($db, '🐾 New Taxi Request', "Pickup: {$pickup} → {$dropoff}", 'yeni_talep');
        jsonResponse(['success' => true, 'talep_id' => $talepId, 'toplam_ucret' => $toplamUcret]);

    /**
     * GET /taxi.php?action=my_requests
     * Sahibin kendi talepleri
     */
    case 'my_requests':
        $user = requireAuth();
        $stmt = $db->prepare("
            SELECT tr.*,
                   d.isim  AS kopek_adi,
                   d.irk   AS kopek_irki,
                   tm.id   AS match_id,
                   tm.durum AS match_durum,
                   u2.ad_soyad AS surucu_adi
            FROM taxi_requests tr
            INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
            LEFT JOIN taxi_matches tm ON tm.talep_id = tr.id AND tm.durum != 'iptal'
            LEFT JOIN taxi_users u2 ON u2.id = tm.surucu_id
            WHERE tr.sahip_id = ?
            ORDER BY tr.created_at DESC
        ");
        $stmt->execute([$user['id']]);
        jsonResponse(['success' => true, 'requests' => $stmt->fetchAll()]);

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
                   tm.baslama_zamani, tm.bitis_zamani, tm.gercek_mesafe,
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
        if ($talep['sahip_id'] != $user['id'] && ($talep['surucu_id'] ?? null) != $user['id'] && $user['rol'] !== 'admin') {
            jsonResponse(['success' => false, 'error' => 'Erişim reddedildi'], 403);
        }
        jsonResponse(['success' => true, 'request' => $talep]);

    /**
     * POST /taxi.php?action=cancel_request
     * Body: { talep_id, iptal_nedeni? }
     */
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

        $stmt = $db->prepare("UPDATE taxi_requests SET durum='iptal', iptal_nedeni=? WHERE id=?");
        $stmt->execute([$input['iptal_nedeni'] ?? null, $talepId]);
        // Eşleşmeyi de iptal et
        $db->prepare("UPDATE taxi_matches SET durum='iptal' WHERE talep_id=?")->execute([$talepId]);
        jsonResponse(['success' => true]);

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
        jsonResponse(['success' => true, 'requests' => $stmt->fetchAll()]);

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
                "SELECT id FROM taxi_matches WHERE surucu_id = ? AND durum IN ('kabul_edildi','devam_ediyor')"
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

            $db->prepare("UPDATE taxi_requests SET durum='eslesti' WHERE id=?")->execute([$talepId]);
            $db->commit();

            // Notify the request owner that a driver accepted
            taxiNotify($db, (int)$talep['sahip_id'], '✅ Driver Accepted', 'A driver has accepted your taxi request and is on the way to you.', 'talep_kabul');
            jsonResponse(['success' => true, 'match_id' => $matchId]);
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['success' => false, 'error' => 'İşlem hatası: ' . $e->getMessage()], 500);
        }

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

        $db->prepare("UPDATE taxi_matches SET durum='devam_ediyor', baslama_zamani=NOW() WHERE id=?")->execute([$matchId]);
        $db->prepare("UPDATE taxi_requests SET durum='basladi' WHERE id=?")->execute([$match['talep_id']]);
        // Notify owner that trip has started
        $stmtOwner = $db->prepare("SELECT sahip_id FROM taxi_requests WHERE id=?");
        $stmtOwner->execute([$match['talep_id']]);
        $ownerId = (int)$stmtOwner->fetchColumn();
        if ($ownerId) taxiNotify($db, $ownerId, '🚗 Trip Started', 'Your driver has picked up your dog and the trip is underway!', 'yolculuk_basladi');
        jsonResponse(['success' => true]);

    /**
     * POST /taxi.php?action=finish_trip
     * Sürücü yolculuğu tamamlar (varışa ulaştı).
     * Body: { match_id, gercek_mesafe? }
     */
    case 'finish_trip':
        if ($method !== 'POST') jsonResponse(['success' => false, 'error' => 'POST gerekli'], 405);
        $user  = requireAuth();
        $input = getJsonInput();
        $matchId     = (int)($input['match_id'] ?? 0);
        $gercekMesafe = isset($input['gercek_mesafe']) ? (float)$input['gercek_mesafe'] : null;

        $stmt = $db->prepare("SELECT * FROM taxi_matches WHERE id = ? AND surucu_id = ? AND durum = 'devam_ediyor'");
        $stmt->execute([$matchId, $user['id']]);
        $match = $stmt->fetch();
        if (!$match) jsonResponse(['success' => false, 'error' => 'Aktif yolculuk bulunamadı']);

        $db->prepare(
            "UPDATE taxi_matches SET durum='tamamlandi', bitis_zamani=NOW(), gercek_mesafe=? WHERE id=?"
        )->execute([$gercekMesafe, $matchId]);
        $db->prepare("UPDATE taxi_requests SET durum='tamamlandi' WHERE id=?")->execute([$match['talep_id']]);

        // Temel ödeme akışı: sahibin cüzdanından kes, sürücüye aktar
        $stmt = $db->prepare("SELECT toplam_ucret, sahip_id FROM taxi_requests WHERE id=?");
        $stmt->execute([$match['talep_id']]);
        $talep = $stmt->fetch();
        if ($talep) {
            $ucret = (float)$talep['toplam_ucret'];
            $komisyonOrani = 20; // %20 komisyon
            try {
                $stmt = $db->query("SELECT deger FROM taxi_settings WHERE anahtar='komisyon_orani'");
                $row = $stmt->fetch();
                if ($row) $komisyonOrani = (int)$row['deger'];
            } catch (Exception $e) {}

            $komisyon      = round($ucret * $komisyonOrani / 100, 2);
            $suruucuKazanc = $ucret - $komisyon;

            // Sürücü kazancı kaydet
            $stmt = $db->prepare(
                "INSERT INTO taxi_transactions (user_id, talep_id, tutar, islem_tipi, aciklama)
                 VALUES (?, ?, ?, 'surucu_kazanci', 'Tamamlanan taksi yolculuğu')"
            );
            $stmt->execute([$user['id'], $match['talep_id'], $suruucuKazanc]);

            // Sürücü bakiyesini güncelle
            $db->prepare("UPDATE taxi_users SET cuzdan_bakiyesi = cuzdan_bakiyesi + ? WHERE id=?")
               ->execute([$suruucuKazanc, $user['id']]);

            // Notify both owner and driver
            taxiNotify($db, (int)$talep['sahip_id'], '🎉 Trip Completed!', "Your dog has arrived safely. Fare: {$ucret} TL", 'yolculuk_tamamlandi');
            taxiNotify($db, $user['id'], '💰 Trip Completed', "You earned {$suruucuKazanc} TL from this trip.", 'yolculuk_tamamlandi');
        }

        jsonResponse(['success' => true]);

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
        $user = requireAuth();
        $stmt = $db->prepare("
            SELECT tm.*,
                   tr.baslangic_noktasi, tr.baslangic_sehir, tr.baslangic_ilce,
                   tr.baslangic_lat, tr.baslangic_lon,
                   tr.varis_noktasi, tr.varis_sehir, tr.varis_ilce,
                   tr.varis_lat, tr.varis_lon,
                   tr.kalkis_zamani, tr.toplam_ucret, tr.ozel_talepler,
                   tr.durum AS talep_durum,
                   d.isim AS kopek_adi, d.irk AS kopek_irki, d.kilo AS kopek_kilo,
                   u.ad_soyad AS sahip_adi, u.telefon AS sahip_telefon
            FROM taxi_matches tm
            INNER JOIN taxi_requests tr ON tr.id = tm.talep_id
            INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
            INNER JOIN taxi_users u ON u.id = tr.sahip_id
            WHERE tm.surucu_id = ?
            ORDER BY tm.created_at DESC
        ");
        $stmt->execute([$user['id']]);
        jsonResponse(['success' => true, 'jobs' => $stmt->fetchAll()]);

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

        // Talep tamamlandı mı?
        $stmt = $db->prepare("SELECT id FROM taxi_requests WHERE id=? AND durum='tamamlandi'");
        $stmt->execute([$talepId]);
        if (!$stmt->fetch()) jsonResponse(['success' => false, 'error' => 'Yalnızca tamamlanan talepler değerlendirilebilir']);

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
        $stmt = $db->prepare(
            "INSERT INTO taxi_messages (gonderen_id, alici_id, talep_id, mesaj) VALUES (?,?,?,?)"
        );
        $stmt->execute([
            $user['id'],
            $input['alici_id'],
            $input['talep_id'] ?? null,
            $input['mesaj'],
        ]);
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
        if (empty($input['isim'])) jsonResponse(['success' => false, 'error' => 'Köpek ismi zorunludur']);
        $stmt = $db->prepare(
            "INSERT INTO taxi_dogs (sahip_id, isim, irk, yas, kilo, cinsiyet, notlar)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $user['id'],
            trim($input['isim']),
            $input['irk']     ?? null,
            isset($input['yas'])   ? (int)$input['yas']     : null,
            isset($input['kilo'])  ? (float)$input['kilo']  : null,
            $input['cinsiyet'] ?? 'erkek',
            $input['notlar']   ?? null,
        ]);
        jsonResponse(['success' => true, 'dog_id' => $db->lastInsertId()]);

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
            // OSRM ile gerçek yol mesafesi (ücretsiz, key gerektirmez; lon,lat sırası)
            $osrmUrl  = "https://router.project-osrm.org/route/v1/driving/{$slon},{$slat};{$dlon},{$dlat}?overview=false";
            $osrmData = null;
            try {
                $ch = curl_init($osrmUrl);
                curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>6, CURLOPT_SSL_VERIFYPEER=>false]);
                $raw = curl_exec($ch);
                curl_close($ch);
                if ($raw) $osrmData = json_decode($raw, true);
            } catch (Exception $e) {}

            if (!empty($osrmData['routes']) && ($osrmData['code'] ?? '') === 'Ok') {
                $routeKm = round($osrmData['routes'][0]['distance'] / 1000.0, 2);
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

        jsonResponse([
            'success'         => true,
            'tahmini_ucret'   => $baseFare,
            'acilis_ucreti'   => $acilis,
            'km'              => $km,
            'km_basi_ucret'   => $kmRate,
            'km_ucreti'       => round($km * $kmRate, 2),
            'gecis_ucretleri' => $tollsFormatted,
        ]);

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

        // Email çakışma kontrolü
        $stmt = $db->prepare("SELECT id FROM taxi_users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            jsonResponse(['success' => false, 'error' => 'Bu email zaten kayıtlı']);
        }

        $hash = password_hash($sifre, PASSWORD_BCRYPT);
        $stmt = $db->prepare(
            "INSERT INTO taxi_users (ad_soyad, email, sifre, rol, telefon, sehir, ilce)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $adSoyad, $email, $hash, $rol,
            $input['telefon'] ?? null,
            $input['sehir']   ?? null,
            $input['ilce']    ?? null,
        ]);
        $userId = $db->lastInsertId();

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

    // ============================================================
    default:
        jsonResponse(['success' => false, 'error' => "Bilinmeyen action: '{$action}'"], 404);
}
