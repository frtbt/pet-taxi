<?php
/**
 * Pet Taxi Admin - Finansal İşlemler
 * taxi_transactions tablosu (transactions yerine)
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$db = getDB();
$pageTitle = 'Finansal İşlemler';

$tipFilter = $_GET['tip'] ?? '';
$where  = $tipFilter ? "WHERE tt.islem_tipi = ?" : "";
$params = $tipFilter ? [$tipFilter] : [];

$txns = $db->prepare("
    SELECT tt.*, u.ad_soyad,
           tr.baslangic_sehir, tr.varis_sehir
    FROM taxi_transactions tt
    INNER JOIN taxi_users u ON u.id = tt.user_id
    LEFT JOIN taxi_requests tr ON tr.id = tt.talep_id
    {$where}
    ORDER BY tt.tarih DESC
    LIMIT 200
");
$txns->execute($params);
$txns = $txns->fetchAll();

// Özet
$ozet = $db->query("
    SELECT islem_tipi, COUNT(*) AS adet, SUM(tutar) AS toplam
    FROM taxi_transactions
    GROUP BY islem_tipi
")->fetchAll();

require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';
?>
<div class="page-wrapper">
    <div class="content container-fluid">

        <div class="page-header">
            <div class="row">
                <div class="col">
                    <h3 class="page-title">Finansal İşlemler</h3>
                    <ul class="breadcrumb">
                        <li class="breadcrumb-item"><a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php">Dashboard</a></li>
                        <li class="breadcrumb-item active">İşlemler</li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- Özet -->
        <div class="row mb-3">
            <?php foreach ($ozet as $o): ?>
            <div class="col-md-3 col-sm-6">
                <div class="card">
                    <div class="card-body text-center">
                        <h5 class="text-muted"><?= str_replace('_',' ', $o['islem_tipi']) ?></h5>
                        <h3><?= number_format($o['toplam'],2,',','.') ?> ₺</h3>
                        <small class="text-muted"><?= $o['adet'] ?> işlem</small>
                    </div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>

        <!-- Filtre -->
        <form method="GET" class="form-inline mb-3">
            <label class="mr-2">Tür:</label>
            <select name="tip" class="form-control mr-2">
                <option value="">Tümü</option>
                <?php foreach (['para_yukleme','hizmet_odemesi','surucu_kazanci','komisyon_kesintisi','para_cekme','iade'] as $t): ?>
                <option value="<?= $t ?>" <?= $tipFilter===$t?'selected':'' ?>><?= str_replace('_',' ', $t) ?></option>
                <?php endforeach; ?>
            </select>
            <button type="submit" class="btn btn-primary">Filtrele</button>
        </form>

        <div class="card">
            <div class="card-header"><h4 class="card-title">İşlemler (<?= count($txns) ?>)</h4></div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover datatable">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Kullanıcı</th>
                                <th>Tür</th>
                                <th>Güzergah</th>
                                <th>Tutar</th>
                                <th>Önceki Bakiye</th>
                                <th>Sonraki Bakiye</th>
                                <th>Açıklama</th>
                                <th>Tarih</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($txns as $t): ?>
                            <tr>
                                <td><?= $t['id'] ?></td>
                                <td><?= htmlspecialchars($t['ad_soyad']) ?></td>
                                <td>
                                    <?php
                                    $tipMap = ['surucu_kazanci'=>'success','para_yukleme'=>'info','iade'=>'warning','komisyon_kesintisi'=>'dark','para_cekme'=>'danger','hizmet_odemesi'=>'secondary'];
                                    ?>
                                    <span class="badge badge-<?= $tipMap[$t['islem_tipi']] ?? 'secondary' ?>">
                                        <?= str_replace('_',' ', $t['islem_tipi']) ?>
                                    </span>
                                </td>
                                <td>
                                    <?php if ($t['baslangic_sehir']): ?>
                                    <small><?= htmlspecialchars($t['baslangic_sehir']) ?> → <?= htmlspecialchars($t['varis_sehir']) ?></small>
                                    <?php else: ?>-<?php endif; ?>
                                </td>
                                <td class="<?= $t['tutar'] >= 0 ? 'text-success' : 'text-danger' ?> font-weight-bold">
                                    <?= ($t['tutar'] >= 0 ? '+' : '') . number_format($t['tutar'],2,',','.') ?> ₺
                                </td>
                                <td><?= $t['onceki_bakiye'] !== null ? number_format($t['onceki_bakiye'],2,',','.') . ' ₺' : '-' ?></td>
                                <td><?= $t['sonraki_bakiye'] !== null ? number_format($t['sonraki_bakiye'],2,',','.') . ' ₺' : '-' ?></td>
                                <td><small><?= htmlspecialchars($t['aciklama'] ?? '') ?></small></td>
                                <td><?= date('d.m.Y H:i', strtotime($t['tarih'])) ?></td>
                            </tr>
                            <?php endforeach; ?>
                            <?php if (empty($txns)): ?>
                            <tr><td colspan="9" class="text-center text-muted py-4">Kayıt bulunamadı</td></tr>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

    </div>
</div>
<?php require_once __DIR__ . '/layouts/footer.php'; ?>
