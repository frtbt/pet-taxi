<?php
/**
 * Pet Taxi Admin - Sürücü Yönetimi (Gezdirici rolü)
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$db = getDB();
$pageTitle = 'Sürücüler';

$suruculer = $db->query("
    SELECT u.*,
           COUNT(DISTINCT tm.id) AS toplam_yolculuk,
           COUNT(DISTINCT CASE WHEN tm.durum='tamamlandi' THEN tm.id END) AS tamamlanan,
           COALESCE(AVG(r.puan), 0) AS ortalama_puan,
           COUNT(DISTINCT r.id) AS degerlendirme_sayisi,
           COALESCE(SUM(CASE WHEN tt.islem_tipi='surucu_kazanci' THEN tt.tutar ELSE 0 END), 0) AS toplam_kazanc
    FROM taxi_users u
    LEFT JOIN taxi_matches tm ON tm.surucu_id = u.id
    LEFT JOIN taxi_reviews r  ON r.degerlendirilen_id = u.id
    LEFT JOIN taxi_transactions tt ON tt.user_id = u.id AND tt.islem_tipi = 'surucu_kazanci'
    WHERE u.rol = 'gezdirici'
    GROUP BY u.id
    ORDER BY tamamlanan DESC
")->fetchAll();

require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';
?>
<div class="page-wrapper">
    <div class="content container-fluid">

        <div class="page-header">
            <div class="row">
                <div class="col">
                    <h3 class="page-title">Sürücüler</h3>
                    <ul class="breadcrumb">
                        <li class="breadcrumb-item"><a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php">Dashboard</a></li>
                        <li class="breadcrumb-item active">Sürücüler</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <h4 class="card-title">Tüm Sürücüler (<?= count($suruculer) ?>)</h4>
                <small class="text-muted">Ana Patimera'daki "gezdirici" rolü Pet Taxi'de sürücü olarak çalışır</small>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover datatable">
                        <thead>
                            <tr>
                                <th>Sürücü</th>
                                <th>Şehir</th>
                                <th>Bakiye</th>
                                <th>Toplam Yolculuk</th>
                                <th>Tamamlanan</th>
                                <th>Ort. Puan</th>
                                <th>Toplam Kazanç</th>
                                <th>Durum</th>
                                <th>İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($suruculer as $s): ?>
                            <tr>
                                <td>
                                    <div class="d-flex align-items-center">
                                        <img src="<?= APP_URL ?>/uploads/profiles/<?= htmlspecialchars($s['profil_resmi'] ?? 'default.jpg') ?>"
                                             class="rounded-circle mr-2" width="36" height="36" style="object-fit:cover" alt="">
                                        <div>
                                            <div><?= htmlspecialchars($s['ad_soyad']) ?></div>
                                            <small class="text-muted"><?= htmlspecialchars($s['email']) ?></small>
                                        </div>
                                    </div>
                                </td>
                                <td><?= htmlspecialchars($s['sehir'] ?? '-') ?></td>
                                <td><?= number_format($s['cuzdan_bakiyesi'],2,',','.') ?> ₺</td>
                                <td class="text-center"><?= $s['toplam_yolculuk'] ?></td>
                                <td class="text-center text-success font-weight-bold"><?= $s['tamamlanan'] ?></td>
                                <td>
                                    <?php if ($s['degerlendirme_sayisi'] > 0): ?>
                                    <span class="text-warning">★</span>
                                    <?= number_format($s['ortalama_puan'],1,',','.') ?>
                                    <small class="text-muted">(<?= $s['degerlendirme_sayisi'] ?>)</small>
                                    <?php else: ?>
                                    <span class="text-muted">-</span>
                                    <?php endif; ?>
                                </td>
                                <td><?= number_format($s['toplam_kazanc'],2,',','.') ?> ₺</td>
                                <td>
                                    <?php $durumMap = ['aktif'=>'success','pasif'=>'secondary','banli'=>'danger','onay_bekliyor'=>'warning']; ?>
                                    <span class="badge badge-<?= $durumMap[$s['durum']] ?? 'secondary' ?>">
                                        <?= $s['durum'] ?>
                                    </span>
                                </td>
                                <td>
                                    <a href="<?= APP_URL ?>/admin/user-detail.php?id=<?= $s['id'] ?>"
                                       class="btn btn-sm btn-info" target="_blank">Detay</a>
                                    <a href="<?= APP_URL ?>/pet_taxi/admin/matches.php?surucu_id=<?= $s['id'] ?>"
                                       class="btn btn-sm btn-outline-primary">Yolculuklar</a>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                            <?php if (empty($suruculer)): ?>
                            <tr><td colspan="9" class="text-center text-muted py-4">Sürücü bulunamadı</td></tr>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

    </div>
</div>
<?php require_once __DIR__ . '/layouts/footer.php'; ?>
