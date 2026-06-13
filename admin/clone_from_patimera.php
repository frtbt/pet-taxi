<?php
/**
 * Patimera → Pet Taxi Veri Klonlama
 * Çalıştırma: tarayıcıdan /pet_taxi/admin/clone_from_patimera.php
 * Bir kez çalıştır, sonra sil veya erişimi kapat.
 */
define('TAXI_ADMIN', true);
require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

header('Content-Type: text/html; charset=utf-8');

$db = getDB();

// ── Admin kontrolü ──────────────────────────────────────────────────────────
if (!isset($_SESSION['user_id'])) {
    die('<p style="color:red">Giriş yapın.</p>');
}
$stmt = $db->prepare("SELECT rol FROM users WHERE id = ?");
$stmt->execute([$_SESSION['user_id']]);
$me = $stmt->fetch();
if (!$me || $me['rol'] !== 'admin') {
    die('<p style="color:red">Erişim reddedildi.</p>');
}

// ── Onay kontrolü ─────────────────────────────────────────────────────────
$confirmed = ($_GET['confirm'] ?? '') === 'evet';

$results = [];

function log_result(array &$r, string $msg) {
    $r[] = $msg;
    flush();
}

if (!$confirmed) {
    // Önce mevcut kayıt sayılarını göster
    $txU = $db->query("SELECT COUNT(*) FROM taxi_users")->fetchColumn();
    $txD = $db->query("SELECT COUNT(*) FROM taxi_dogs")->fetchColumn();
    $srcU = $db->query("SELECT COUNT(*) FROM users WHERE rol IN ('sahip','gezdirici','admin')")->fetchColumn();
    $srcD = $db->query("SELECT COUNT(*) FROM dogs")->fetchColumn();
    echo "<!DOCTYPE html><html><head><meta charset='utf-8'>
    <style>body{font-family:sans-serif;max-width:700px;margin:40px auto;background:#0f172a;color:#f8fafc}
    .box{background:#1e293b;padding:24px;border-radius:12px;margin:16px 0}
    .warn{background:#7c2d12;border:1px solid #ef4444;padding:16px;border-radius:8px;margin:16px 0}
    .btn{display:inline-block;background:#f59e0b;color:#0f172a;font-weight:800;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:16px}
    table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #334155;text-align:left}th{background:#0f172a}
    </style></head><body>";
    echo "<h2>🚕 Patimera → Pet Taxi Veri Klonlama</h2>";
    echo "<div class='box'><table>
    <tr><th>Kaynak (Patimera)</th><th>Hedef (Pet Taxi)</th><th>Kaynak Sayısı</th><th>Mevcut Hedef</th></tr>
    <tr><td>users</td><td>taxi_users</td><td>$srcU</td><td>$txU</td></tr>
    <tr><td>dogs (aktif)</td><td>taxi_dogs</td><td>$srcD</td><td>$txD</td></tr>
    </table></div>";

    echo "<div class='warn'>
    <strong>⚠️ Dikkat:</strong><br>
    • Rol eşleşmesi: <code>gezdirici → surucu</code>, <code>sahip → sahip</code>, <code>admin → admin</code><br>
    • <code>otel</code> rolündeki kullanıcılar <code>sahip</code> olarak kopyalanır<br>
    • <code>INSERT IGNORE</code> kullanılır — mevcut kayıtlar <strong>değişmez</strong>, yalnızca eksikler eklenir<br>
    • <code>users.adres</code> ve <code>dogs.saglik_durumu</code> alanları kopyalanmaz (taxi tablolarında yok)<br>
    • Aktif (süresi dolmamış) oturum tokenları da kopyalanır
    </div>";

    echo "<a class='btn' href='?confirm=evet'>Klonlamayı Başlat →</a>";
    echo "</body></html>";
    exit;
}

// ── Klonlama ────────────────────────────────────────────────────────────────
echo "<!DOCTYPE html><html><head><meta charset='utf-8'>
<style>body{font-family:monospace;max-width:800px;margin:40px auto;background:#0f172a;color:#f8fafc;line-height:1.8}
.ok{color:#4ade80}.err{color:#f87171}.info{color:#fbbf24}
.box{background:#1e293b;padding:20px;border-radius:12px}
</style></head><body><h2>🚕 Klonlama çalışıyor…</h2><div class='box'>";

$db->exec("SET FOREIGN_KEY_CHECKS = 0");

// ── 1. taxi_users ───────────────────────────────────────────────────────────
// fcm_token sütununun users tablosunda olup olmadığını kontrol et
$hasFcm = false;
try {
    $db->query("SELECT fcm_token FROM users LIMIT 1");
    $hasFcm = true;
} catch (Exception $e) {}

$fcmCol = $hasFcm ? 'fcm_token' : 'NULL';

try {
    $sql = "INSERT IGNORE INTO taxi_users
                (id, ad_soyad, email, sifre, rol, telefon, sehir, ilce,
                 profil_resmi, cuzdan_bakiyesi, durum, email_dogrulandi, fcm_token, created_at)
            SELECT
                id,
                ad_soyad,
                email,
                sifre,
                CASE rol
                    WHEN 'gezdirici' THEN 'surucu'
                    WHEN 'admin'     THEN 'admin'
                    ELSE                  'sahip'
                END,
                telefon,
                sehir,
                ilce,
                profil_resmi,
                cuzdan_bakiyesi,
                durum,
                email_dogrulandi,
                {$fcmCol},
                created_at
            FROM users";

    $affected = $db->exec($sql);
    echo "<span class='ok'>✓ taxi_users:</span> {$affected} yeni kullanıcı kopyalandı<br>";
} catch (Exception $e) {
    echo "<span class='err'>✗ taxi_users HATA:</span> " . htmlspecialchars($e->getMessage()) . "<br>";
}

// ── 2. taxi_dogs ────────────────────────────────────────────────────────────
// Yalnızca taxi_users içinde sahip_id'si olan köpekleri kopyala
try {
    // Patimera dogs kolonları: owner_id, ad, cins_id (→ kopek_cinsleri.ad), yas, cinsiyet, kilo, ozel_notlar, profil_resmi
    $sql = "INSERT IGNORE INTO taxi_dogs
                (id, sahip_id, isim, irk, yas, kilo, cinsiyet, notlar, profil_resmi, durum, created_at)
            SELECT
                d.id,
                d.owner_id,
                d.ad,
                k.ad,
                d.yas,
                d.kilo,
                CASE WHEN d.cinsiyet IN ('erkek','disi') THEN d.cinsiyet ELSE 'erkek' END,
                d.ozel_notlar,
                d.profil_resmi,
                'aktif',
                d.created_at
            FROM dogs d
            INNER JOIN taxi_users tu ON tu.id = d.owner_id
            LEFT JOIN kopek_cinsleri k ON k.id = d.cins_id";

    $affected = $db->exec($sql);
    echo "<span class='ok'>✓ taxi_dogs:</span> {$affected} köpek kopyalandı<br>";
} catch (Exception $e) {
    echo "<span class='err'>✗ taxi_dogs HATA:</span> " . htmlspecialchars($e->getMessage()) . "<br>";
}

// ── 3. taxi_user_tokens (aktif oturumlar) ───────────────────────────────────
// user_tokens tablosu var mı kontrol et
$hasTokenTable = false;
try {
    $db->query("SELECT 1 FROM user_tokens LIMIT 1");
    $hasTokenTable = true;
} catch (Exception $e) {}

if ($hasTokenTable) {
    try {
        $sql = "INSERT IGNORE INTO taxi_user_tokens
                    (user_id, token, device_info, expires_at, created_at)
                SELECT
                    ut.user_id,
                    ut.token,
                    ut.device_info,
                    ut.expires_at,
                    ut.created_at
                FROM user_tokens ut
                INNER JOIN taxi_users tu ON tu.id = ut.user_id
                WHERE ut.expires_at > NOW()";

        $affected = $db->exec($sql);
        echo "<span class='ok'>✓ taxi_user_tokens:</span> {$affected} aktif oturum kopyalandı<br>";
    } catch (Exception $e) {
        echo "<span class='err'>✗ taxi_user_tokens HATA:</span> " . htmlspecialchars($e->getMessage()) . "<br>";
    }
} else {
    echo "<span class='info'>ℹ user_tokens tablosu bulunamadı, oturumlar atlandı<br>";
}

$db->exec("SET FOREIGN_KEY_CHECKS = 1");

// ── Özet ────────────────────────────────────────────────────────────────────
echo "<br>";
$txU = $db->query("SELECT COUNT(*) FROM taxi_users")->fetchColumn();
$txD = $db->query("SELECT COUNT(*) FROM taxi_dogs")->fetchColumn();
$txT = $db->query("SELECT COUNT(*) FROM taxi_user_tokens")->fetchColumn();

echo "<span class='info'>── Sonuç ─────────────────────────────<br>";
echo "taxi_users    : {$txU} kullanıcı<br>";
echo "taxi_dogs     : {$txD} köpek<br>";
echo "taxi_user_tokens: {$txT} oturum<br>";
echo "──────────────────────────────────</span><br><br>";
echo "<span class='ok'>✓ Klonlama tamamlandı.</span></div></body></html>";
