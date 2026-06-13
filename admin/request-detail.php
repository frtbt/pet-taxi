<?php
/**
 * Pet Taxi Admin - Talep Detayı
 */
define('TAXI_ADMIN', true);

require_once __DIR__ . '/../../config/config.php';
require_once __DIR__ . '/../../config/database.php';

$db = getDB();

$talepId = (int)($_GET['id'] ?? 0);
if (!$talepId) {
    header('Location: ' . APP_URL . '/pet_taxi/admin/requests.php');
    exit;
}

$talep = $db->prepare("
    SELECT tr.*,
           d.isim AS kopek_adi, d.irk AS kopek_irki, d.yas AS kopek_yas, d.kilo AS kopek_kilo,
           d.profil_resmi AS kopek_resmi, d.notlar AS kopek_notlar,
           u_sahip.ad_soyad AS sahip_adi, u_sahip.email AS sahip_email,
           u_sahip.telefon AS sahip_tel, u_sahip.profil_resmi AS sahip_resmi
    FROM taxi_requests tr
    INNER JOIN taxi_dogs d ON d.id = tr.kopek_id
    INNER JOIN taxi_users u_sahip ON u_sahip.id = tr.sahip_id
    WHERE tr.id = ?
");
$talep->execute([$talepId]);
$talep = $talep->fetch();
if (!$talep) {
    die('Talep bulunamadı.');
}

// Eşleşme
$match = $db->prepare("
    SELECT tm.*, u.ad_soyad AS surucu_adi, u.email AS surucu_email,
           u.telefon AS surucu_tel, u.profil_resmi AS surucu_resmi
    FROM taxi_matches tm
    INNER JOIN taxi_users u ON u.id = tm.surucu_id
    WHERE tm.talep_id = ?
    ORDER BY tm.created_at DESC LIMIT 1
");
$match->execute([$talepId]);
$match = $match->fetch();

// Son konum
$konum = null;
if ($match) {
    $konum = $db->prepare(
        "SELECT * FROM taxi_locations WHERE match_id=? ORDER BY id DESC LIMIT 1"
    );
    $konum->execute([$match['id']]);
    $konum = $konum->fetch();
}

// Mesajlar
$mesajlar = $db->prepare("
    SELECT m.*, u.ad_soyad AS gonderen_adi
    FROM taxi_messages m
    INNER JOIN taxi_users u ON u.id = m.gonderen_id
    WHERE m.talep_id = ?
    ORDER BY m.tarih ASC
");
$mesajlar->execute([$talepId]);
$mesajlar = $mesajlar->fetchAll();

// Değerlendirmeler
$degerlendirmeler = $db->prepare("
    SELECT r.*, u_d.ad_soyad AS degerlendiren, u_e.ad_soyad AS degerlendirilen
    FROM taxi_reviews r
    INNER JOIN taxi_users u_d ON u_d.id = r.degerlendiren_id
    INNER JOIN taxi_users u_e ON u_e.id = r.degerlendirilen_id
    WHERE r.talep_id = ?
");
$degerlendirmeler->execute([$talepId]);
$degerlendirmeler = $degerlendirmeler->fetchAll();

$pageTitle = 'Talep #' . $talepId . ' Detayı';

$durumBadge = ['bekliyor'=>'warning','eslesti'=>'info','basladi'=>'primary','tamamlandi'=>'success','iptal'=>'danger'];

require_once __DIR__ . '/layouts/header.php';
require_once __DIR__ . '/layouts/sidebar.php';
?>
<div class="page-wrapper">
    <div class="content container-fluid">

        <div class="page-header">
            <div class="row align-items-center">
                <div class="col">
                    <h3 class="page-title">Taksi Talebi #<?= $talepId ?></h3>
                    <ul class="breadcrumb">
                        <li class="breadcrumb-item"><a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php">Dashboard</a></li>
                        <li class="breadcrumb-item"><a href="<?= APP_URL ?>/pet_taxi/admin/requests.php">Talepler</a></li>
                        <li class="breadcrumb-item active">#<?= $talepId ?></li>
                    </ul>
                </div>
                <div class="col-auto">
                    <span class="badge badge-<?= $durumBadge[$talep['durum']] ?? 'secondary' ?> badge-lg" style="font-size:1rem; padding:8px 16px">
                        <?= strtoupper($talep['durum']) ?>
                    </span>
                </div>
            </div>
        </div>

        <div class="row">

            <!-- Sol kolon: Güzergah & Detaylar -->
            <div class="col-md-8">

                <!-- Güzergah Kartı -->
                <div class="card">
                    <div class="card-header"><h4 class="card-title">🗺️ Güzergah</h4></div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <div class="p-3 border rounded bg-light-success" style="border-left: 4px solid #28a745 !important">
                                    <p class="text-muted mb-1"><small>📍 BAŞLANGIÇ NOKTASI</small></p>
                                    <h5 class="mb-1"><?= htmlspecialchars($talep['baslangic_ilce']) ?>, <?= htmlspecialchars($talep['baslangic_sehir']) ?></h5>
                                    <p class="mb-0 small text-muted"><?= htmlspecialchars($talep['baslangic_noktasi']) ?></p>
                                    <?php if ($talep['baslangic_lat']): ?>
                                    <a href="https://maps.google.com/?q=<?= $talep['baslangic_lat'] ?>,<?= $talep['baslangic_lon'] ?>"
                                       target="_blank" class="btn btn-xs btn-outline-success mt-1">
                                        <i class="fa fa-map-marker"></i> Haritada Gör
                                    </a>
                                    <?php endif; ?>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="p-3 border rounded" style="border-left: 4px solid #dc3545 !important">
                                    <p class="text-muted mb-1"><small>🏁 VARIŞ NOKTASI</small></p>
                                    <h5 class="mb-1"><?= htmlspecialchars($talep['varis_ilce']) ?>, <?= htmlspecialchars($talep['varis_sehir']) ?></h5>
                                    <p class="mb-0 small text-muted"><?= htmlspecialchars($talep['varis_noktasi']) ?></p>
                                    <?php if ($talep['varis_lat']): ?>
                                    <a href="https://maps.google.com/?q=<?= $talep['varis_lat'] ?>,<?= $talep['varis_lon'] ?>"
                                       target="_blank" class="btn btn-xs btn-outline-danger mt-1">
                                        <i class="fa fa-map-marker"></i> Haritada Gör
                                    </a>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>

                        <div class="row mt-3">
                            <div class="col-md-3 text-center">
                                <p class="text-muted small mb-0">Kalkış Zamanı</p>
                                <strong><?= date('d.m.Y H:i', strtotime($talep['kalkis_zamani'])) ?></strong>
                            </div>
                            <div class="col-md-3 text-center">
                                <p class="text-muted small mb-0">Tahmini Mesafe</p>
                                <strong><?= $talep['tahmini_mesafe'] ? number_format($talep['tahmini_mesafe'],1,',','.').' km' : '-' ?></strong>
                            </div>
                            <div class="col-md-3 text-center">
                                <p class="text-muted small mb-0">Tahmini Süre</p>
                                <strong><?= $talep['tahmini_sure'] ? $talep['tahmini_sure'].' dk' : '-' ?></strong>
                            </div>
                            <div class="col-md-3 text-center">
                                <p class="text-muted small mb-0">Ücret</p>
                                <strong class="text-success"><?= number_format($talep['toplam_ucret'],2,',','.') ?> ₺</strong>
                            </div>
                        </div>

                        <?php if ($talep['ozel_talepler']): ?>
                        <div class="alert alert-info mt-3 mb-0">
                            <strong>Özel Talepler:</strong> <?= htmlspecialchars($talep['ozel_talepler']) ?>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- Yolculuk Bilgisi -->
                <?php if ($match): ?>
                <div class="card">
                    <div class="card-header"><h4 class="card-title">🚕 Yolculuk Bilgisi</h4></div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-4">
                                <p class="text-muted small mb-0">Eşleşme Zamanı</p>
                                <strong><?= date('d.m.Y H:i', strtotime($match['eslesme_zamani'])) ?></strong>
                            </div>
                            <div class="col-md-4">
                                <p class="text-muted small mb-0">Başlama Zamanı</p>
                                <strong><?= $match['baslama_zamani'] ? date('d.m.Y H:i', strtotime($match['baslama_zamani'])) : '-' ?></strong>
                            </div>
                            <div class="col-md-4">
                                <p class="text-muted small mb-0">Bitiş Zamanı</p>
                                <strong><?= $match['bitis_zamani'] ? date('d.m.Y H:i', strtotime($match['bitis_zamani'])) : '-' ?></strong>
                            </div>
                        </div>
                        <?php if ($match['gercek_mesafe']): ?>
                        <div class="mt-2">
                            <p class="text-muted small mb-0">Gerçek Mesafe</p>
                            <strong><?= number_format($match['gercek_mesafe'],1,',','.').' km' ?></strong>
                        </div>
                        <?php endif; ?>
                        <?php if ($konum): ?>
                        <div class="alert alert-info mt-3 mb-0">
                            <strong>Son Konum:</strong>
                            <?= $konum['lat'] ?>, <?= $konum['lon'] ?>
                            <a href="https://maps.google.com/?q=<?= $konum['lat'] ?>,<?= $konum['lon'] ?>"
                               target="_blank" class="btn btn-xs btn-outline-info ml-2">Haritada Gör</a>
                            <small class="ml-2 text-muted"><?= date('H:i:s', strtotime($konum['kayit_zamani'])) ?></small>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>
                <?php endif; ?>

                <!-- Mesajlar -->
                <?php if ($mesajlar): ?>
                <div class="card">
                    <div class="card-header"><h4 class="card-title">💬 Mesajlar</h4></div>
                    <div class="card-body">
                        <?php foreach ($mesajlar as $m): ?>
                        <div class="d-flex mb-3">
                            <div class="flex-grow-1">
                                <strong><?= htmlspecialchars($m['gonderen_adi']) ?></strong>
                                <small class="text-muted ml-2"><?= date('d.m H:i', strtotime($m['tarih'])) ?></small>
                                <p class="mb-0"><?= htmlspecialchars($m['mesaj']) ?></p>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>

                <!-- Değerlendirmeler -->
                <?php if ($degerlendirmeler): ?>
                <div class="card">
                    <div class="card-header"><h4 class="card-title">⭐ Değerlendirmeler</h4></div>
                    <div class="card-body">
                        <?php foreach ($degerlendirmeler as $r): ?>
                        <div class="mb-3">
                            <strong><?= htmlspecialchars($r['degerlendiren']) ?></strong>
                            → <?= htmlspecialchars($r['degerlendirilen']) ?>:
                            <?php for ($i=1;$i<=5;$i++): ?>
                            <span style="color:<?= $i<=$r['puan']?'#f59e0b':'#ddd' ?>">★</span>
                            <?php endfor; ?>
                            <?php if ($r['yorum']): ?>
                            <p class="mb-0 text-muted small"><?= htmlspecialchars($r['yorum']) ?></p>
                            <?php endif; ?>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>

            </div>

            <!-- Sağ kolon: Kişiler -->
            <div class="col-md-4">

                <!-- Köpek Sahibi -->
                <div class="card">
                    <div class="card-header"><h4 class="card-title">🐾 Köpek Sahibi</h4></div>
                    <div class="card-body text-center">
                        <img src="<?= APP_URL ?>/uploads/profiles/<?= htmlspecialchars($talep['sahip_resmi'] ?? 'default.jpg') ?>"
                             class="rounded-circle mb-2" width="60" height="60" style="object-fit:cover" alt="">
                        <h5><?= htmlspecialchars($talep['sahip_adi']) ?></h5>
                        <p class="text-muted mb-1"><?= htmlspecialchars($talep['sahip_email']) ?></p>
                        <p class="text-muted mb-0"><?= htmlspecialchars($talep['sahip_tel'] ?? '-') ?></p>
                    </div>
                </div>

                <!-- Köpek -->
                <div class="card">
                    <div class="card-header"><h4 class="card-title">🐕 Köpek</h4></div>
                    <div class="card-body text-center">
                        <img src="<?= APP_URL ?>/uploads/dogs/<?= htmlspecialchars($talep['kopek_resmi'] ?? 'default-dog.jpg') ?>"
                             class="rounded-circle mb-2" width="60" height="60" style="object-fit:cover" alt="">
                        <h5><?= htmlspecialchars($talep['kopek_adi']) ?></h5>
                        <p class="text-muted mb-1"><?= htmlspecialchars($talep['kopek_irki'] ?? '') ?></p>
                        <p class="text-muted mb-0">
                            <?= $talep['kopek_yas'] ? $talep['kopek_yas'].' yaş' : '' ?>
                            <?= $talep['kopek_kilo'] ? ' · '.$talep['kopek_kilo'].' kg' : '' ?>
                        </p>
                        <?php if ($talep['kopek_notlar']): ?>
                        <p class="text-muted small mt-2"><?= htmlspecialchars($talep['kopek_notlar']) ?></p>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- Sürücü -->
                <?php if ($match): ?>
                <div class="card">
                    <div class="card-header"><h4 class="card-title">🚕 Sürücü</h4></div>
                    <div class="card-body text-center">
                        <img src="<?= APP_URL ?>/uploads/profiles/<?= htmlspecialchars($match['surucu_resmi'] ?? 'default.jpg') ?>"
                             class="rounded-circle mb-2" width="60" height="60" style="object-fit:cover" alt="">
                        <h5><?= htmlspecialchars($match['surucu_adi']) ?></h5>
                        <p class="text-muted mb-1"><?= htmlspecialchars($match['surucu_email']) ?></p>
                        <p class="text-muted mb-0"><?= htmlspecialchars($match['surucu_tel'] ?? '-') ?></p>
                        <a href="<?= APP_URL ?>/admin/user-detail.php?id=<?= $match['surucu_id'] ?>"
                           class="btn btn-sm btn-outline-info mt-2" target="_blank">Profili Gör</a>
                    </div>
                </div>
                <?php endif; ?>

                <!-- Hızlı Eylemler -->
                <?php if (!in_array($talep['durum'], ['tamamlandi','iptal'])): ?>
                <div class="card">
                    <div class="card-header"><h4 class="card-title">Hızlı Eylemler</h4></div>
                    <div class="card-body">
                        <a href="requests.php?action=cancel&id=<?= $talepId ?>"
                           class="btn btn-danger btn-block"
                           onclick="return confirm('Bu talebi iptal etmek istediğinize emin misiniz?')">
                            Talebi İptal Et
                        </a>
                    </div>
                </div>
                <?php endif; ?>

            </div>
        </div>

    </div>
</div>
<?php require_once __DIR__ . '/layouts/footer.php'; ?>
