<?php
if (!defined('TAXI_ADMIN')) {
    die('Erişim engellendi');
}

$currentPage = basename($_SERVER['PHP_SELF']);

// Badge: Bekleyen talepler
$pendingRequests = 0;
try {
    $stmt = $db->query("SELECT COUNT(*) FROM taxi_requests WHERE durum='bekliyor'");
    $pendingRequests = (int)$stmt->fetchColumn();
} catch (Exception $e) {}

// Badge: Aktif yolculuklar
$activeTrips = 0;
try {
    $stmt = $db->query("SELECT COUNT(*) FROM taxi_matches WHERE durum IN ('kabul_edildi','devam_ediyor')");
    $activeTrips = (int)$stmt->fetchColumn();
} catch (Exception $e) {}
?>
<!-- Sidebar -->
<div class="sidebar" id="sidebar">
    <div class="sidebar-inner slimscroll">
        <div id="sidebar-menu" class="sidebar-menu">
            <ul>
                <li class="menu-title"><span>🚕 Pet Taxi</span></li>

                <li class="<?= $currentPage === 'dashboard.php' ? 'active' : '' ?>">
                    <a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php">
                        <i class="fe fe-home"></i> <span>Dashboard</span>
                    </a>
                </li>

                <li class="menu-title"><span>Ulaşım Yönetimi</span></li>

                <li class="<?= $currentPage === 'requests.php' ? 'active' : '' ?>">
                    <a href="<?= APP_URL ?>/pet_taxi/admin/requests.php">
                        <i class="fe fe-map-pin"></i>
                        <span>Taksi Talepleri</span>
                        <?php if ($pendingRequests > 0): ?>
                            <span class="badge badge-warning float-right"><?= $pendingRequests ?></span>
                        <?php endif; ?>
                    </a>
                </li>

                <li class="<?= $currentPage === 'matches.php' ? 'active' : '' ?>">
                    <a href="<?= APP_URL ?>/pet_taxi/admin/matches.php">
                        <i class="fe fe-navigation"></i>
                        <span>Aktif Yolculuklar</span>
                        <?php if ($activeTrips > 0): ?>
                            <span class="badge badge-success float-right"><?= $activeTrips ?></span>
                        <?php endif; ?>
                    </a>
                </li>

                <li class="<?= $currentPage === 'reviews.php' ? 'active' : '' ?>">
                    <a href="<?= APP_URL ?>/pet_taxi/admin/reviews.php">
                        <i class="fe fe-star"></i> <span>Değerlendirmeler</span>
                    </a>
                </li>

                <li class="menu-title"><span>Kullanıcılar</span></li>

                <li class="<?= $currentPage === 'users.php' ? 'active' : '' ?>">
                    <a href="<?= APP_URL ?>/pet_taxi/admin/users.php">
                        <i class="fe fe-users"></i> <span>Tüm Kullanıcılar</span>
                    </a>
                </li>

                <li class="<?= $currentPage === 'drivers.php' ? 'active' : '' ?>">
                    <a href="<?= APP_URL ?>/pet_taxi/admin/drivers.php">
                        <i class="fe fe-truck"></i> <span>Sürücüler</span>
                    </a>
                </li>

                <li class="menu-title"><span>Finans</span></li>

                <li class="<?= $currentPage === 'transactions.php' ? 'active' : '' ?>">
                    <a href="<?= APP_URL ?>/pet_taxi/admin/transactions.php">
                        <i class="fe fe-credit-card"></i> <span>İşlemler</span>
                    </a>
                </li>

                <li class="menu-title"><span>Sistem</span></li>

                <li class="<?= $currentPage === 'settings.php' ? 'active' : '' ?>">
                    <a href="<?= APP_URL ?>/pet_taxi/admin/settings.php">
                        <i class="fe fe-settings"></i> <span>Ayarlar</span>
                    </a>
                </li>

                <li>
                    <a href="<?= APP_URL ?>/admin/dashboard.php">
                        <i class="fe fe-arrow-left"></i> <span>Ana Patimera Paneline Dön</span>
                    </a>
                </li>
            </ul>
        </div>
    </div>
</div>
<!-- /Sidebar -->
