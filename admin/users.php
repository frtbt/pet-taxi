<?php
/**
 * Pet Taxi Admin - Kullanıcılar
 * Ana Patimera'nın users tablosunu paylaşır (ortak kullanım)
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$db = getDB();
$pageTitle = 'Kullanıcılar';

$rolFilter  = $_GET['rol']  ?? '';
$aramaFilter = trim($_GET['ara'] ?? '');

$where  = [];
$params = [];

if ($rolFilter)   { $where[] = "rol = ?";                        $params[] = $rolFilter; }
if ($aramaFilter) { $where[] = "(ad_soyad LIKE ? OR email LIKE ?)"; $like = "%{$aramaFilter}%"; $params = array_merge($params, [$like,$like]); }

$whereSQL = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

$users = $db->prepare("
    SELECT u.*,
           (SELECT COUNT(*) FROM taxi_requests WHERE sahip_id = u.id) AS talep_sayisi,
           (SELECT COUNT(*) FROM taxi_matches  WHERE surucu_id = u.id) AS yolculuk_sayisi
    FROM taxi_users u
    {$whereSQL}
    ORDER BY u.created_at DESC
");
$users->execute($params);
$users = $users->fetchAll();

require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';
?>
    <div class="page-wrapper">
        <div class="content container-fluid">

            <div class="page-header">
                <div class="row">
                    <div class="col">
                        <h3 class="page-title">Kullanıcılar</h3>
                        <ul class="breadcrumb">
                            <li class="breadcrumb-item"><a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php">Dashboard</a></li>
                            <li class="breadcrumb-item active">Kullanıcılar</li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Filtreler -->
            <div class="card mb-3">
                <div class="card-body">
                    <form method="GET" class="row g-2 align-items-end">
                        <div class="col-md-3">
                            <label class="form-label">Rol</label>
                            <select name="rol" class="form-control">
                                <option value="">Tümü</option>
                                <option value="kopek_sahibi" <?= $rolFilter==='kopek_sahibi'?'selected':'' ?>>Köpek Sahibi</option>
                                <option value="gezdirici"    <?= $rolFilter==='gezdirici'?'selected':'' ?>>Sürücü (Gezdirici)</option>
                                <option value="admin"        <?= $rolFilter==='admin'?'selected':'' ?>>Admin</option>
                            </select>
                        </div>
                        <div class="col-md-5">
                            <label class="form-label">Arama</label>
                            <input type="text" name="ara" class="form-control" placeholder="Ad, email..." value="<?= htmlspecialchars($aramaFilter) ?>">
                        </div>
                        <div class="col-md-2">
                            <button type="submit" class="btn btn-primary btn-block">Filtrele</button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h4 class="card-title">Kullanıcılar (<?= count($users) ?>)</h4>
                    <small class="text-muted">Ana Patimera kullanıcıları ile ortak tablo</small>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover datatable">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Ad Soyad</th>
                                    <th>Email</th>
                                    <th>Rol</th>
                                    <th>Şehir</th>
                                    <th>Bakiye</th>
                                    <th>Taxi Talepleri</th>
                                    <th>Taxi Yolculukları</th>
                                    <th>Durum</th>
                                    <th>Kayıt</th>
                                    <th>İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($users as $u): ?>
                                <tr>
                                    <td><?= $u['id'] ?></td>
                                    <td>
                                        <div class="d-flex align-items-center">
                                            <img src="<?= APP_URL ?>/uploads/profiles/<?= htmlspecialchars($u['profil_resmi'] ?? 'default.jpg') ?>"
                                                 class="rounded-circle mr-2" width="32" height="32" style="object-fit:cover" alt="">
                                            <?= htmlspecialchars($u['ad_soyad']) ?>
                                        </div>
                                    </td>
                                    <td><?= htmlspecialchars($u['email']) ?></td>
                                    <td>
                                        <?php
                                        $rolMap = ['admin'=>['danger','Admin'],'gezdirici'=>['info','Sürücü'],'kopek_sahibi'=>['success','Köpek Sahibi'],'sahip'=>['success','Köpek Sahibi']];
                                        [$rc, $rl] = $rolMap[$u['rol']] ?? ['secondary', $u['rol']];
                                        ?>
                                        <span class="badge badge-<?= $rc ?>"><?= $rl ?></span>
                                    </td>
                                    <td><?= htmlspecialchars($u['sehir'] ?? '-') ?></td>
                                    <td><?= number_format($u['cuzdan_bakiyesi'],2,',','.') ?> ₺</td>
                                    <td class="text-center">
                                        <?php if ($u['talep_sayisi'] > 0): ?>
                                        <a href="<?= APP_URL ?>/pet_taxi/admin/requests.php?sahip_id=<?= $u['id'] ?>"
                                           class="badge badge-warning"><?= $u['talep_sayisi'] ?></a>
                                        <?php else: ?>
                                        <span class="text-muted">0</span>
                                        <?php endif; ?>
                                    </td>
                                    <td class="text-center">
                                        <?php if ($u['yolculuk_sayisi'] > 0): ?>
                                        <a href="<?= APP_URL ?>/pet_taxi/admin/matches.php?surucu_id=<?= $u['id'] ?>"
                                           class="badge badge-info"><?= $u['yolculuk_sayisi'] ?></a>
                                        <?php else: ?>
                                        <span class="text-muted">0</span>
                                        <?php endif; ?>
                                    </td>
                                    <td>
                                        <?php
                                        $durumMap = ['aktif'=>'success','pasif'=>'secondary','banli'=>'danger','onay_bekliyor'=>'warning'];
                                        ?>
                                        <span class="badge badge-<?= $durumMap[$u['durum']] ?? 'secondary' ?>">
                                            <?= $u['durum'] ?>
                                        </span>
                                    </td>
                                    <td><?= date('d.m.Y', strtotime($u['created_at'])) ?></td>
                                    <td>
                                        <a href="<?= APP_URL ?>/admin/user-detail.php?id=<?= $u['id'] ?>"
                                           class="btn btn-sm btn-info" target="_blank">Patimera Detay</a>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                                <?php if (empty($users)): ?>
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
