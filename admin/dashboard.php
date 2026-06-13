<?php
/**
 * Pet Taxi Admin - Dashboard
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$db = getDB();
$pageTitle = 'Dashboard';

require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';

// ----------------------------------------------------------------
// İstatistikler (taxi_ tabloları kullanılıyor)
// ----------------------------------------------------------------
$stats = [];

// Toplam talepler
$stats['toplam_talepler'] = (int)$db->query("SELECT COUNT(*) FROM taxi_requests")->fetchColumn();

// Bekleyen talepler
$stats['bekleyen'] = (int)$db->query("SELECT COUNT(*) FROM taxi_requests WHERE durum='bekliyor'")->fetchColumn();

// Aktif yolculuklar
$stats['aktif'] = (int)$db->query(
    "SELECT COUNT(*) FROM taxi_matches WHERE durum IN ('kabul_edildi','devam_ediyor')"
)->fetchColumn();

// Tamamlanan yolculuklar
$stats['tamamlanan'] = (int)$db->query(
    "SELECT COUNT(*) FROM taxi_matches WHERE durum='tamamlandi'"
)->fetchColumn();

// Toplam sürücü sayısı
$stats['suruculer'] = (int)$db->query(
    "SELECT COUNT(*) FROM users WHERE rol='gezdirici' AND durum='aktif'"
)->fetchColumn();

// Toplam sahip (köpek sahibi)
$stats['sahipler'] = (int)$db->query(
    "SELECT COUNT(*) FROM users WHERE rol='kopek_sahibi'"
)->fetchColumn();

// Bu ayki işlem hacmi (taxi_transactions)
$stats['bu_ay_hacim'] = (float)$db->query(
    "SELECT COALESCE(SUM(tutar),0) FROM taxi_transactions
     WHERE islem_tipi='surucu_kazanci' AND MONTH(tarih)=MONTH(NOW()) AND YEAR(tarih)=YEAR(NOW())"
)->fetchColumn();

// Bu ayki komisyon geliri
$komisyonOrani = 20;
try {
    $r = $db->query("SELECT deger FROM taxi_settings WHERE anahtar='komisyon_orani'")->fetch();
    if ($r) $komisyonOrani = (int)$r['deger'];
} catch (Exception $e) {}

$stats['bu_ay_komisyon'] = round($stats['bu_ay_hacim'] * $komisyonOrani / (100 - $komisyonOrani), 2);

// Son talepler
$sonTalepler = $db->query("
    SELECT tr.*, d.isim AS kopek_adi, u.ad_soyad AS sahip_adi
    FROM taxi_requests tr
    INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
    INNER JOIN taxi_users u ON u.id = tr.sahip_id
    ORDER BY tr.created_at DESC
    LIMIT 8
")->fetchAll();

// Son eşleşmeler
$sonEslesmeler = $db->query("
    SELECT tm.*, tr.baslangic_sehir, tr.varis_sehir, tr.toplam_ucret,
           u.ad_soyad AS surucu_adi, u2.ad_soyad AS sahip_adi
    FROM taxi_matches tm
    INNER JOIN taxi_requests tr ON tr.id = tm.talep_id
    INNER JOIN taxi_users u ON u.id = tm.surucu_id
    INNER JOIN taxi_users u2 ON u2.id = tr.sahip_id
    ORDER BY tm.created_at DESC
    LIMIT 6
")->fetchAll();

// Durum renkleri
function durumBadge($durum) {
    $map = [
        'bekliyor'     => 'warning',
        'eslesti'      => 'info',
        'basladi'      => 'primary',
        'tamamlandi'   => 'success',
        'iptal'        => 'danger',
        'kabul_edildi' => 'info',
        'devam_ediyor' => 'primary',
    ];
    return $map[$durum] ?? 'secondary';
}
?>

    <!-- Sidebar content END — page-wrapper starts -->
    <div class="page-wrapper">
        <div class="content container-fluid">

            <div class="page-header">
                <div class="row">
                    <div class="col-sm-12">
                        <h3 class="page-title">Pet Taxi Dashboard</h3>
                        <ul class="breadcrumb">
                            <li class="breadcrumb-item active">Genel Bakış</li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- İstatistik Kartları -->
            <div class="row">
                <?php $cards = [
                    ['label'=>'Toplam Talep',    'value'=>$stats['toplam_talepler'], 'icon'=>'fa-route',        'color'=>'primary'],
                    ['label'=>'Bekleyen',         'value'=>$stats['bekleyen'],        'icon'=>'fa-hourglass-half','color'=>'warning'],
                    ['label'=>'Aktif Yolculuk',   'value'=>$stats['aktif'],           'icon'=>'fa-car',          'color'=>'info'],
                    ['label'=>'Tamamlanan',       'value'=>$stats['tamamlanan'],      'icon'=>'fa-check-circle', 'color'=>'success'],
                    ['label'=>'Sürücü',           'value'=>$stats['suruculer'],       'icon'=>'fa-id-badge',     'color'=>'secondary'],
                    ['label'=>'Köpek Sahibi',     'value'=>$stats['sahipler'],        'icon'=>'fa-paw',          'color'=>'secondary'],
                    ['label'=>'Bu Ay Hacim',      'value'=>number_format($stats['bu_ay_hacim'],2,',','.').' ₺',  'icon'=>'fa-lira-sign','color'=>'dark'],
                    ['label'=>'Bu Ay Komisyon',   'value'=>number_format($stats['bu_ay_komisyon'],2,',','.').' ₺','icon'=>'fa-percent', 'color'=>'dark'],
                ]; ?>
                <?php foreach ($cards as $c): ?>
                <div class="col-xl-3 col-sm-6 col-12">
                    <div class="card">
                        <div class="card-body">
                            <div class="dash-widget-header">
                                <span class="dash-widget-icon bg-<?= $c['color'] ?>">
                                    <i class="fas <?= $c['icon'] ?>"></i>
                                </span>
                                <div class="dash-count">
                                    <div class="dash-title"><?= $c['label'] ?></div>
                                    <div class="dash-counts"><p><?= $c['value'] ?></p></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
            <!-- /İstatistik Kartları -->

            <div class="row">
                <!-- Son Talepler -->
                <div class="col-md-7">
                    <div class="card">
                        <div class="card-header">
                            <h4 class="card-title">Son Taksi Talepleri</h4>
                            <a href="<?= APP_URL ?>/pet_taxi/admin/requests.php" class="btn btn-sm btn-outline-primary float-right">Tümünü Gör</a>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table mb-0">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Sahip</th>
                                            <th>Köpek</th>
                                            <th>Nereden → Nereye</th>
                                            <th>Ücret</th>
                                            <th>Durum</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($sonTalepler as $t): ?>
                                        <tr>
                                            <td><?= $t['id'] ?></td>
                                            <td><?= htmlspecialchars($t['sahip_adi']) ?></td>
                                            <td><?= htmlspecialchars($t['kopek_adi']) ?></td>
                                            <td>
                                                <small>
                                                    <b><?= htmlspecialchars($t['baslangic_ilce']) ?></b> →
                                                    <b><?= htmlspecialchars($t['varis_ilce']) ?></b>
                                                </small>
                                            </td>
                                            <td><?= number_format($t['toplam_ucret'],2,',','.') ?> ₺</td>
                                            <td>
                                                <span class="badge badge-<?= durumBadge($t['durum']) ?>">
                                                    <?= $t['durum'] ?>
                                                </span>
                                            </td>
                                        </tr>
                                        <?php endforeach; ?>
                                        <?php if (empty($sonTalepler)): ?>
                                        <tr><td colspan="6" class="text-center text-muted">Henüz talep yok</td></tr>
                                        <?php endif; ?>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Son Eşleşmeler -->
                <div class="col-md-5">
                    <div class="card">
                        <div class="card-header">
                            <h4 class="card-title">Son Eşleşmeler</h4>
                            <a href="<?= APP_URL ?>/pet_taxi/admin/matches.php" class="btn btn-sm btn-outline-primary float-right">Tümünü Gör</a>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table mb-0">
                                    <thead>
                                        <tr>
                                            <th>Sürücü</th>
                                            <th>Güzergah</th>
                                            <th>Ücret</th>
                                            <th>Durum</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($sonEslesmeler as $m): ?>
                                        <tr>
                                            <td><?= htmlspecialchars($m['surucu_adi']) ?></td>
                                            <td>
                                                <small><?= htmlspecialchars($m['baslangic_sehir']) ?> → <?= htmlspecialchars($m['varis_sehir']) ?></small>
                                            </td>
                                            <td><?= number_format($m['toplam_ucret'],2,',','.') ?> ₺</td>
                                            <td>
                                                <span class="badge badge-<?= durumBadge($m['durum']) ?>">
                                                    <?= $m['durum'] ?>
                                                </span>
                                            </td>
                                        </tr>
                                        <?php endforeach; ?>
                                        <?php if (empty($sonEslesmeler)): ?>
                                        <tr><td colspan="4" class="text-center text-muted">Henüz eşleşme yok</td></tr>
                                        <?php endif; ?>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

<?php require_once __DIR__ . '/layouts/footer.php'; ?>
