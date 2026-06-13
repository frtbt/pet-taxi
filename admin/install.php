<?php
/**
 * Pet Taxi - Otomatik Tablo Kurulum Sayfası
 * Bu sayfa taxi_ ön ekli tabloları veritabanına oluşturur.
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';


// Admin kontrolü
$stmt = $db ?? null;
$db = getDB();
$userRow = $db->prepare("SELECT id FROM users WHERE id=? AND rol='admin'");
$userRow->execute([$_SESSION['user_id'] ?? 0]);
if (!$userRow->fetch()) {
    die('Erişim reddedildi. Lütfen admin olarak giriş yapın.');
}

$schemaFile = __DIR__ . '/../database/schema.sql';
if (!file_exists($schemaFile)) {
    die('Schema dosyası bulunamadı: ' . $schemaFile);
}

$sql = file_get_contents($schemaFile);

// Yorumları ve boş satırları temizle, statement'lara böl
$statements = [];
$current = '';
foreach (explode("\n", $sql) as $line) {
    $trimmed = trim($line);
    if (str_starts_with($trimmed, '--') || $trimmed === '') continue;
    $current .= ' ' . $trimmed;
    if (str_ends_with(rtrim($current), ';')) {
        $statements[] = trim($current);
        $current = '';
    }
}

$errors   = [];
$executed = 0;

foreach ($statements as $stmt) {
    if (empty(trim($stmt))) continue;
    try {
        $db->exec($stmt);
        $executed++;
    } catch (PDOException $e) {
        // Tablo zaten varsa hata yoksay
        if (strpos($e->getMessage(), 'already exists') === false) {
            $errors[] = $e->getMessage() . ' — SQL: ' . substr($stmt, 0, 120) . '...';
        }
    }
}

$pageTitle = 'Pet Taxi Kurulum';
require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';
?>
<div class="page-wrapper">
    <div class="content container-fluid">
        <div class="page-header">
            <h3 class="page-title">Pet Taxi — Tablo Kurulumu</h3>
        </div>

        <?php if ($errors): ?>
        <div class="alert alert-warning">
            <strong>Bazı hatalar oluştu:</strong>
            <ul class="mb-0 mt-1">
                <?php foreach ($errors as $e): ?>
                <li><small><?= htmlspecialchars($e) ?></small></li>
                <?php endforeach; ?>
            </ul>
        </div>
        <?php endif; ?>

        <div class="alert alert-success">
            <strong>✅ Kurulum tamamlandı!</strong><br>
            <?= $executed ?> SQL ifadesi çalıştırıldı.
            <a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php" class="btn btn-success btn-sm ml-3">Dashboard'a Git</a>
        </div>

        <div class="card">
            <div class="card-header"><h4 class="card-title">Oluşturulan Tablolar</h4></div>
            <div class="card-body">
                <?php
                $taxiTables = ['taxi_requests','taxi_matches','taxi_locations','taxi_transactions','taxi_messages','taxi_notifications','taxi_reviews','taxi_settings'];
                foreach ($taxiTables as $tbl):
                    try {
                        $exists = (bool)$db->query("SHOW TABLES LIKE '{$tbl}'")->fetchColumn();
                    } catch (Exception $e) { $exists = false; }
                ?>
                <div class="d-flex align-items-center mb-2">
                    <span class="badge badge-<?= $exists ? 'success' : 'danger' ?> mr-2"><?= $exists ? '✅' : '❌' ?></span>
                    <code><?= $tbl ?></code>
                    <span class="text-muted ml-2 small"><?= $exists ? 'Mevcut' : 'Oluşturulamadı' ?></span>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

    </div>
</div>
<?php require_once __DIR__ . '/layouts/footer.php'; ?>
