<?php
/**
 * Pet Taxi Admin - Değerlendirmeler
 * taxi_reviews tablosu (reviews yerine)
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$db = getDB();
$pageTitle = 'Değerlendirmeler';

$reviews = $db->query("
    SELECT r.*,
           u_d.ad_soyad AS degerlendiren_adi,
           u_ed.ad_soyad AS degerlendirilen_adi,
           tr.baslangic_sehir, tr.varis_sehir
    FROM taxi_reviews r
    INNER JOIN taxi_users u_d  ON u_d.id  = r.degerlendiren_id
    INNER JOIN taxi_users u_ed ON u_ed.id = r.degerlendirilen_id
    INNER JOIN taxi_requests tr ON tr.id = r.talep_id
    ORDER BY r.tarih DESC
    LIMIT 200
")->fetchAll();

require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';
?>
<div class="page-wrapper">
    <div class="content container-fluid">

        <div class="page-header">
            <div class="row">
                <div class="col">
                    <h3 class="page-title">Değerlendirmeler</h3>
                    <ul class="breadcrumb">
                        <li class="breadcrumb-item"><a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php">Dashboard</a></li>
                        <li class="breadcrumb-item active">Değerlendirmeler</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><h4 class="card-title">Tüm Değerlendirmeler (<?= count($reviews) ?>)</h4></div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover datatable">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Değerlendiren</th>
                                <th>Değerlendirilen</th>
                                <th>Güzergah</th>
                                <th>Puan</th>
                                <th>Yorum</th>
                                <th>Tarih</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($reviews as $r): ?>
                            <tr>
                                <td><?= $r['id'] ?></td>
                                <td><?= htmlspecialchars($r['degerlendiren_adi']) ?></td>
                                <td><?= htmlspecialchars($r['degerlendirilen_adi']) ?></td>
                                <td>
                                    <small><?= htmlspecialchars($r['baslangic_sehir']) ?> → <?= htmlspecialchars($r['varis_sehir']) ?></small>
                                </td>
                                <td>
                                    <?php for ($i=1;$i<=5;$i++): ?>
                                    <span style="color:<?= $i <= $r['puan'] ? '#f59e0b' : '#ddd' ?>">★</span>
                                    <?php endfor; ?>
                                    <strong>(<?= $r['puan'] ?>)</strong>
                                </td>
                                <td><?= htmlspecialchars($r['yorum'] ?? '-') ?></td>
                                <td><?= date('d.m.Y H:i', strtotime($r['tarih'])) ?></td>
                            </tr>
                            <?php endforeach; ?>
                            <?php if (empty($reviews)): ?>
                            <tr><td colspan="7" class="text-center text-muted py-4">Değerlendirme bulunamadı</td></tr>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

    </div>
</div>
<?php require_once __DIR__ . '/layouts/footer.php'; ?>
