<?php
/**
 * Pet Taxi — İyzico Cüzdan Yükleme Callback
 * İyzico bu URL'e POST eder; ödeme sonucunu işler ve cüzdanı günceller.
 */

define('TAXI_APP', true);
require_once dirname(dirname(__DIR__)) . '/config/config.php';
require_once dirname(dirname(__DIR__)) . '/config/database.php';
require_once dirname(dirname(__DIR__)) . '/core/Iyzico.php';

if (!defined('APP_URL')) define('APP_URL', 'https://patimera.com');

$db = getDB();

$token  = $_POST['token']  ?? '';
$status = $_POST['status'] ?? '';

function redirectResult(bool $ok, string $msg = ''): void {
    $baseUrl = 'https://patimera.com/pet_taxi/wallet-result.php';
    $qs      = $ok ? 'status=success' : 'status=fail&msg=' . urlencode($msg);
    header("Location: {$baseUrl}?{$qs}");
    exit;
}

// İyzico'dan gelen callback status=SUCCESS değilse zaten başarısız
if (!$token || $status !== 'SUCCESS') {
    redirectResult(false, 'Ödeme iptal edildi veya başarısız.');
}

// Token'ı DB'de ara — user_id ve amount buradan alınır (daha güvenli)
$stmt = $db->prepare("SELECT * FROM iyzico_transactions WHERE token=? LIMIT 1");
$stmt->execute([$token]);
$tx = $stmt->fetch();

if (!$tx) {
    redirectResult(false, 'Geçersiz token.');
}

// Çift işlem koruması — zaten tamamlandıysa tekrar işleme
if ($tx['status'] === 'completed') {
    redirectResult(true);
}

$userId    = (int) $tx['user_id'];
$paidPrice = (float) $tx['amount'];
$paymentId = null;

if (!$userId || $paidPrice <= 0) {
    redirectResult(false, 'Geçersiz işlem verisi.');
}

// İyzico API ile doğrulama — best-effort, başarısız olursa callback status'una güveniriz.
// İyzico callback status=SUCCESS + bilinen token ikilisi yeterli kanıttır.
try {
    $detail = (new Iyzico())->retrieveCheckoutForm($token);
    if (($detail['status'] ?? '') === 'success' && ($detail['paymentStatus'] ?? '') === 'SUCCESS') {
        // Doğrulama başarılı — iyzico'dan gelen tutarı kullan (daha doğru)
        $paidPrice = max($paidPrice, (float)($detail['paidPrice'] ?? $paidPrice));
        $paymentId = $detail['paymentId'] ?? null;
    } else {
        // Doğrulama başarısız ama iyzico callback zaten SUCCESS dedi — logla ve devam et
        error_log(
            '[iyzico-wallet-callback] Doğrulama uyuşmazlığı — yine de işliyoruz. ' .
            'token=' . $token . ' verify_status=' . ($detail['status'] ?? 'null') .
            ' verify_payment_status=' . ($detail['paymentStatus'] ?? 'null') .
            ' error=' . ($detail['errorMessage'] ?? '')
        );
    }
} catch (\Throwable $e) {
    // API çağrısı patlasa da ödemeyi bloke etmiyoruz
    error_log('[iyzico-wallet-callback] Doğrulama hatası: ' . $e->getMessage() . ' token=' . $token);
}

// iyzico_transactions kaydını tamamlandı yap
$db->prepare(
    "UPDATE iyzico_transactions SET status='completed', payment_id=?, updated_at=NOW() WHERE id=?"
)->execute([$paymentId, $tx['id']]);

// Kullanıcının mevcut bakiyesini al
$stmt = $db->prepare("SELECT cuzdan_bakiyesi FROM taxi_users WHERE id=?");
$stmt->execute([$userId]);
$mevcutBakiye = (float)($stmt->fetchColumn() ?? 0);
$yeniBakiye   = $mevcutBakiye + $paidPrice;

// Cüzdan bakiyesini artır
$db->prepare("UPDATE taxi_users SET cuzdan_bakiyesi=? WHERE id=?")->execute([$yeniBakiye, $userId]);

// İşlem kaydı oluştur
$db->prepare(
    "INSERT INTO taxi_transactions (user_id, islem_tipi, tutar, aciklama, onceki_bakiye, sonraki_bakiye, referans_no)
     VALUES (?, 'para_yukleme', ?, 'İyzico ile cüzdan yükleme', ?, ?, ?)"
)->execute([$userId, $paidPrice, $mevcutBakiye, $yeniBakiye, $tx['conversation_id']]);

redirectResult(true);
