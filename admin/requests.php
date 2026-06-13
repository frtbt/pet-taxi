<?php
/**
 * Pet Taxi Admin - Taksi Talepleri Yönetimi
 * taxi_requests tablosu kullanılıyor (walk_requests yerine)
 * Başlangıç Noktası & Varış Noktası alanları içeriyor
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$db = getDB();
$pageTitle = 'Taksi Talepleri';

// Filtreler
$durumFilter = $_GET['durum'] ?? '';
$sehirFilter = $_GET['sehir'] ?? '';
$aramaFilter = trim($_GET['ara'] ?? '');

$where  = [];
$params = [];

if ($durumFilter) { $where[] = "tr.durum = ?"; $params[] = $durumFilter; }
if ($sehirFilter) { $where[] = "tr.baslangic_sehir = ?"; $params[] = $sehirFilter; }
if ($aramaFilter) {
    $where[] = "(u.ad_soyad LIKE ? OR d.isim LIKE ? OR tr.baslangic_noktasi LIKE ? OR tr.varis_noktasi LIKE ?)";
    $like = "%{$aramaFilter}%";
    $params = array_merge($params, [$like, $like, $like, $like]);
}

$whereSQL = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

$talepler = $db->prepare("
    SELECT tr.*,
           d.isim AS kopek_adi, d.irk AS kopek_irki,
           u.ad_soyad AS sahip_adi, u.telefon AS sahip_telefon,
           tm.id AS match_id, tm.durum AS match_durum,
           u2.ad_soyad AS surucu_adi
    FROM taxi_requests tr
    INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
    INNER JOIN taxi_users u ON u.id = tr.sahip_id
    LEFT JOIN taxi_matches tm ON tm.talep_id = tr.id AND tm.durum != 'iptal'
    LEFT JOIN taxi_users u2 ON u2.id = tm.surucu_id
    {$whereSQL}
    ORDER BY tr.created_at DESC
");
$talepler->execute($params);
$talepler = $talepler->fetchAll();

// Şehir listesi (filtre için)
$sehirler = $db->query(
    "SELECT DISTINCT baslangic_sehir FROM taxi_requests ORDER BY baslangic_sehir"
)->fetchAll(PDO::FETCH_COLUMN);

function durumBadge($d) {
    return ['bekliyor'=>'warning','eslesti'=>'info','basladi'=>'primary','tamamlandi'=>'success','iptal'=>'danger'][$d] ?? 'secondary';
}

require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';
?>
    <div class="page-wrapper">
        <div class="content container-fluid">

            <div class="page-header">
                <div class="row align-items-center">
                    <div class="col">
                        <h3 class="page-title">Taksi Talepleri</h3>
                        <ul class="breadcrumb">
                            <li class="breadcrumb-item"><a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php">Dashboard</a></li>
                            <li class="breadcrumb-item active">Talepler</li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Filtreler -->
            <div class="card mb-3">
                <div class="card-body">
                    <form method="GET" class="row g-2 align-items-end">
                        <div class="col-md-3">
                            <label class="form-label">Durum</label>
                            <select name="durum" class="form-control">
                                <option value="">Tümü</option>
                                <?php foreach (['bekliyor','eslesti','basladi','tamamlandi','iptal'] as $d): ?>
                                <option value="<?= $d ?>" <?= $durumFilter===$d?'selected':'' ?>><?= ucfirst($d) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Şehir</label>
                            <select name="sehir" class="form-control">
                                <option value="">Tüm Şehirler</option>
                                <?php foreach ($sehirler as $s): ?>
                                <option value="<?= htmlspecialchars($s) ?>" <?= $sehirFilter===$s?'selected':'' ?>><?= htmlspecialchars($s) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Arama</label>
                            <input type="text" name="ara" class="form-control" placeholder="Sahip, köpek, adres..." value="<?= htmlspecialchars($aramaFilter) ?>">
                        </div>
                        <div class="col-md-2">
                            <button type="submit" class="btn btn-primary btn-block">Filtrele</button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- Tablo -->
            <div class="card">
                <div class="card-header">
                    <h4 class="card-title">Talepler (<?= count($talepler) ?>)</h4>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover datatable">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Sahip</th>
                                    <th>Köpek</th>
                                    <th>Başlangıç Noktası</th>
                                    <th>Varış Noktası</th>
                                    <th>Kalkış</th>
                                    <th>Mesafe</th>
                                    <th>Ücret</th>
                                    <th>Sürücü</th>
                                    <th>Durum</th>
                                    <th>İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($talepler as $t): ?>
                                <tr>
                                    <td><?= $t['id'] ?></td>
                                    <td>
                                        <?= htmlspecialchars($t['sahip_adi']) ?>
                                        <?php if ($t['sahip_telefon']): ?>
                                        <br><small class="text-muted"><?= htmlspecialchars($t['sahip_telefon']) ?></small>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <?= htmlspecialchars($t['kopek_adi']) ?>
                                        <?php if ($t['kopek_irki']): ?>
                                        <br><small class="text-muted"><?= htmlspecialchars($t['kopek_irki']) ?></small>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <span title="<?= htmlspecialchars($t['baslangic_noktasi']) ?>">
                                            📍 <?= htmlspecialchars($t['baslangic_ilce']) ?>, <?= htmlspecialchars($t['baslangic_sehir']) ?>
                                        </span>
                                        <?php if ($t['baslangic_lat'] && $t['baslangic_lon']): ?>
                                        <br><small class="text-muted"><?= $t['baslangic_lat'] ?>, <?= $t['baslangic_lon'] ?></small>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <span title="<?= htmlspecialchars($t['varis_noktasi']) ?>">
                                            🏁 <?= htmlspecialchars($t['varis_ilce']) ?>, <?= htmlspecialchars($t['varis_sehir']) ?>
                                        </span>
                                        <?php if ($t['varis_lat'] && $t['varis_lon']): ?>
                                        <br><small class="text-muted"><?= $t['varis_lat'] ?>, <?= $t['varis_lon'] ?></small>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <?= date('d.m.Y', strtotime($t['kalkis_zamani'])) ?>
                                        <br><small><?= date('H:i', strtotime($t['kalkis_zamani'])) ?></small>
                                    </td>
                                    <td>
                                        <?= $t['tahmini_mesafe'] ? number_format($t['tahmini_mesafe'],1,',','.').' km' : '-' ?>
                                    </td>
                                    <td><?= number_format($t['toplam_ucret'],2,',','.') ?> ₺</td>
                                    <td><?= $t['surucu_adi'] ? htmlspecialchars($t['surucu_adi']) : '<span class="text-muted">-</span>' ?></td>
                                    <td>
                                        <span class="badge badge-<?= durumBadge($t['durum']) ?>">
                                            <?= $t['durum'] ?>
                                        </span>
                                    </td>
                                    <td>
                                        <a href="<?= APP_URL ?>/pet_taxi/admin/request-detail.php?id=<?= $t['id'] ?>"
                                           class="btn btn-sm btn-info">Detay</a>
                                        <?php if (!in_array($t['durum'], ['tamamlandi','iptal'])): ?>
                                        <a href="?action=cancel&id=<?= $t['id'] ?>"
                                           class="btn btn-sm btn-danger"
                                           onclick="return confirm('Bu talebi iptal etmek istediğinize emin misiniz?')">İptal</a>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                                <?php if (empty($talepler)): ?>
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
