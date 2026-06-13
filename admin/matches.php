<?php
/**
 * Pet Taxi Admin - Aktif & Geçmiş Yolculuklar
 * taxi_matches tablosu kullanılıyor (walk_matches yerine)
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$db = getDB();
$pageTitle = 'Yolculuklar';

$durumFilter = $_GET['durum'] ?? '';
$where  = $durumFilter ? "WHERE tm.durum = ?" : "";
$params = $durumFilter ? [$durumFilter] : [];

$eslesmeler = $db->prepare("
    SELECT tm.*,
           tr.baslangic_noktasi, tr.baslangic_sehir, tr.baslangic_ilce,
           tr.baslangic_lat, tr.baslangic_lon,
           tr.varis_noktasi, tr.varis_sehir, tr.varis_ilce,
           tr.varis_lat, tr.varis_lon,
           tr.kalkis_zamani, tr.toplam_ucret, tr.tahmini_mesafe,
           tr.durum AS talep_durum,
           d.isim AS kopek_adi,
           u_sahip.ad_soyad AS sahip_adi, u_sahip.telefon AS sahip_tel,
           u_sur.ad_soyad AS surucu_adi, u_sur.telefon AS surucu_tel
    FROM taxi_matches tm
    INNER JOIN taxi_requests tr ON tr.id = tm.talep_id
    INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
    INNER JOIN taxi_users u_sahip ON u_sahip.id = tr.sahip_id
    INNER JOIN taxi_users u_sur ON u_sur.id = tm.surucu_id
    {$where}
    ORDER BY tm.created_at DESC
");
$eslesmeler->execute($params);
$eslesmeler = $eslesmeler->fetchAll();

function durumBadge($d) {
    return ['kabul_edildi'=>'info','devam_ediyor'=>'primary','tamamlandi'=>'success','iptal'=>'danger'][$d] ?? 'secondary';
}

require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';
?>
    <div class="page-wrapper">
        <div class="content container-fluid">

            <div class="page-header">
                <div class="row">
                    <div class="col">
                        <h3 class="page-title">Yolculuklar</h3>
                        <ul class="breadcrumb">
                            <li class="breadcrumb-item"><a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php">Dashboard</a></li>
                            <li class="breadcrumb-item active">Yolculuklar</li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Filtre Tabları -->
            <ul class="nav nav-tabs mb-3">
                <?php $tabs = [''=> 'Tümü','kabul_edildi'=>'Kabul Edildi','devam_ediyor'=>'Devam Ediyor','tamamlandi'=>'Tamamlandı','iptal'=>'İptal']; ?>
                <?php foreach ($tabs as $val => $label): ?>
                <li class="nav-item">
                    <a class="nav-link <?= $durumFilter===$val?'active':'' ?>"
                       href="?durum=<?= $val ?>">
                        <?= $label ?>
                    </a>
                </li>
                <?php endforeach; ?>
            </ul>

            <div class="card">
                <div class="card-header">
                    <h4 class="card-title">Yolculuklar (<?= count($eslesmeler) ?>)</h4>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover datatable">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Sürücü</th>
                                    <th>Sahip / Köpek</th>
                                    <th>Başlangıç → Varış</th>
                                    <th>Kalkış</th>
                                    <th>Başlama</th>
                                    <th>Bitiş</th>
                                    <th>Mesafe</th>
                                    <th>Ücret</th>
                                    <th>Durum</th>
                                    <th>Harita</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($eslesmeler as $m): ?>
                                <tr>
                                    <td><?= $m['id'] ?></td>
                                    <td>
                                        <?= htmlspecialchars($m['surucu_adi']) ?>
                                        <?php if ($m['surucu_tel']): ?>
                                        <br><small class="text-muted"><?= htmlspecialchars($m['surucu_tel']) ?></small>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <?= htmlspecialchars($m['sahip_adi']) ?>
                                        <br><small class="text-muted">🐕 <?= htmlspecialchars($m['kopek_adi']) ?></small>
                                    </td>
                                    <td>
                                        <small>
                                            📍 <?= htmlspecialchars($m['baslangic_ilce']) ?>, <?= htmlspecialchars($m['baslangic_sehir']) ?><br>
                                            🏁 <?= htmlspecialchars($m['varis_ilce']) ?>, <?= htmlspecialchars($m['varis_sehir']) ?>
                                        </small>
                                    </td>
                                    <td><?= date('d.m.Y H:i', strtotime($m['kalkis_zamani'])) ?></td>
                                    <td><?= $m['baslama_zamani'] ? date('d.m H:i', strtotime($m['baslama_zamani'])) : '-' ?></td>
                                    <td><?= $m['bitis_zamani']  ? date('d.m H:i', strtotime($m['bitis_zamani']))  : '-' ?></td>
                                    <td>
                                        <?php
                                        $mesafe = $m['gercek_mesafe'] ?? $m['tahmini_mesafe'];
                                        echo $mesafe ? number_format($mesafe,1,',','.').' km' : '-';
                                        ?>
                                    </td>
                                    <td><?= number_format($m['toplam_ucret'],2,',','.') ?> ₺</td>
                                    <td>
                                        <span class="badge badge-<?= durumBadge($m['durum']) ?>">
                                            <?= $m['durum'] ?>
                                        </span>
                                    </td>
                                    <td>
                                        <?php if ($m['baslangic_lat'] && $m['baslangic_lon']): ?>
                                        <a href="https://maps.google.com/?q=<?= $m['baslangic_lat'] ?>,<?= $m['baslangic_lon'] ?>"
                                           target="_blank" class="btn btn-xs btn-outline-secondary">
                                            <i class="fa fa-map"></i>
                                        </a>
                                        <?php else: ?>
                                        <span class="text-muted">-</span>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                                <?php if (empty($eslesmeler)): ?>
                                <tr><td colspan="11" class="text-center text-muted py-4">Kayıt bulunamadı</td></tr>
                                <?php endif; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    </div>

<?php require_once __DIR__ . '/layouts/footer.php'; ?>
