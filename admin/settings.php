<?php
/**
 * Pet Taxi Admin - Sistem Ayarları
 * taxi_settings tablosu (settings yerine)
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$db = getDB();
$pageTitle = 'Taxi Ayarları';

$successMsg = '';
$errorMsg   = '';

// Kaydet
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $allowed = ['komisyon_orani','km_basi_ucret','minimum_ucret','min_para_cekme','site_adi','site_email'];
    try {
        $stmt = $db->prepare("INSERT INTO taxi_settings (anahtar, deger) VALUES (?,?) ON DUPLICATE KEY UPDATE deger=VALUES(deger)");
        foreach ($allowed as $key) {
            if (isset($_POST[$key])) {
                $stmt->execute([$key, trim($_POST[$key])]);
            }
        }
        $successMsg = 'Ayarlar kaydedildi.';
    } catch (Exception $e) {
        $errorMsg = 'Hata: ' . $e->getMessage();
    }
}

$ayarlar = [];
try {
    $rows = $db->query("SELECT anahtar, deger FROM taxi_settings")->fetchAll();
    foreach ($rows as $r) $ayarlar[$r['anahtar']] = $r['deger'];
} catch (Exception $e) {}

require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';
?>
    <div class="page-wrapper">
        <div class="content container-fluid">

            <div class="page-header">
                <div class="row">
                    <div class="col">
                        <h3 class="page-title">Taxi Sistem Ayarları</h3>
                        <ul class="breadcrumb">
                            <li class="breadcrumb-item"><a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php">Dashboard</a></li>
                            <li class="breadcrumb-item active">Ayarlar</li>
                        </ul>
                    </div>
                </div>
            </div>

            <?php if ($successMsg): ?>
            <div class="alert alert-success"><?= htmlspecialchars($successMsg) ?></div>
            <?php endif; ?>
            <?php if ($errorMsg): ?>
            <div class="alert alert-danger"><?= htmlspecialchars($errorMsg) ?></div>
            <?php endif; ?>

            <div class="row">
                <div class="col-md-8">
                    <div class="card">
                        <div class="card-header"><h4 class="card-title">Ayarlar</h4></div>
                        <div class="card-body">
                            <form method="POST">
                                <div class="form-group">
                                    <label>Komisyon Oranı (%)</label>
                                    <input type="number" name="komisyon_orani" class="form-control"
                                           value="<?= htmlspecialchars($ayarlar['komisyon_orani'] ?? '20') ?>"
                                           min="0" max="100" step="1">
                                    <small class="text-muted">Platform'un her yolculuktan alacağı komisyon yüzdesi</small>
                                </div>
                                <div class="form-group">
                                    <label>Km Başı Ücret (₺)</label>
                                    <input type="number" name="km_basi_ucret" class="form-control"
                                           value="<?= htmlspecialchars($ayarlar['km_basi_ucret'] ?? '15') ?>"
                                           min="1" step="0.5">
                                    <small class="text-muted">Kilometre başına düşen temel taksi ücreti</small>
                                </div>
                                <div class="form-group">
                                    <label>Minimum Ücret (₺)</label>
                                    <input type="number" name="minimum_ucret" class="form-control"
                                           value="<?= htmlspecialchars($ayarlar['minimum_ucret'] ?? '50') ?>"
                                           min="0" step="1">
                                    <small class="text-muted">En düşük taksi ücreti</small>
                                </div>
                                <div class="form-group">
                                    <label>Minimum Para Çekme (₺)</label>
                                    <input type="number" name="min_para_cekme" class="form-control"
                                           value="<?= htmlspecialchars($ayarlar['min_para_cekme'] ?? '50') ?>"
                                           min="0" step="1">
                                </div>
                                <div class="form-group">
                                    <label>Modül Adı</label>
                                    <input type="text" name="site_adi" class="form-control"
                                           value="<?= htmlspecialchars($ayarlar['site_adi'] ?? 'Pet Taxi') ?>">
                                </div>
                                <div class="form-group">
                                    <label>İletişim Email</label>
                                    <input type="email" name="site_email" class="form-control"
                                           value="<?= htmlspecialchars($ayarlar['site_email'] ?? '') ?>">
                                </div>
                                <button type="submit" class="btn btn-primary">Kaydet</button>
                            </form>
                        </div>
                    </div>
                </div>

                <div class="col-md-4">
                    <div class="card">
                        <div class="card-header"><h4 class="card-title">Tablo Haritası</h4></div>
                        <div class="card-body">
                            <p class="text-muted small">Pet Taxi'nin kullandığı taxi_ ön ekli tablolar:</p>
                            <ul class="list-unstyled small">
                                <li>✅ <code>taxi_requests</code> — Talepler</li>
                                <li>✅ <code>taxi_matches</code> — Yolculuklar</li>
                                <li>✅ <code>taxi_locations</code> — Canlı Konum</li>
                                <li>✅ <code>taxi_transactions</code> — Finansal</li>
                                <li>✅ <code>taxi_messages</code> — Mesajlar</li>
                                <li>✅ <code>taxi_notifications</code> — Bildirimler</li>
                                <li>✅ <code>taxi_reviews</code> — Değerlendirmeler</li>
                                <li>✅ <code>taxi_settings</code> — Ayarlar</li>
                                <li class="mt-2">🔗 <code>users</code> — Ortak</li>
                                <li>🔗 <code>dogs</code> — Ortak</li>
                                <li>🔗 <code>user_tokens</code> — Ortak</li>
                            </ul>
                        </div>
                    </div>

                    <div class="card mt-3">
                        <div class="card-header"><h4 class="card-title">Şema Kur</h4></div>
                        <div class="card-body">
                            <p class="text-muted small">Tabloları ilk kez oluşturmak için aşağıdaki SQL dosyasını çalıştırın:</p>
                            <code class="d-block p-2 bg-light rounded small">
                                pet_taxi/database/schema.sql
                            </code>
                            <a href="<?= APP_URL ?>/pet_taxi/admin/install.php"
                               class="btn btn-warning btn-block mt-2"
                               onclick="return confirm('Tabloları oluşturmak istediğinize emin misiniz?')">
                                Tabloları Otomatik Kur
                            </a>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div>

<?php require_once __DIR__ . '/layouts/footer.php'; ?>
