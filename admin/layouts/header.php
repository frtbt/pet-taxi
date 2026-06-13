<?php
if (!defined('TAXI_ADMIN')) {
    die('Erişim engellendi');
}

// Admin kontrolü
if (!isset($_SESSION['user_id'])) {
    header('Location: ' . APP_URL . '/admin/index.php');
    exit;
}

// Oturum sahibi admin mi?
$stmt = $db->prepare("SELECT * FROM users WHERE id=? AND rol='admin'");
$stmt->execute([$_SESSION['user_id']]);
$adminUser = $stmt->fetch();
if (!$adminUser) {
    header('Location: ' . APP_URL . '/admin/index.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=0">
    <title><?= $pageTitle ?? 'Pet Taxi Yönetimi' ?> - Pet Taxi</title>

    <link rel="shortcut icon" href="<?= APP_URL ?>/template/admin/assets/img/favicon.png">
    <link rel="stylesheet" href="<?= APP_URL ?>/template/admin/assets/css/select2.min.css">
    <link rel="stylesheet" href="<?= APP_URL ?>/template/admin/assets/plugins/bootstrap/css/bootstrap.min.css">
    <link rel="stylesheet" href="<?= APP_URL ?>/template/admin/assets/plugins/fontawesome/css/fontawesome.min.css">
    <link rel="stylesheet" href="<?= APP_URL ?>/template/admin/assets/plugins/fontawesome/css/all.min.css">
    <link rel="stylesheet" href="<?= APP_URL ?>/template/admin/assets/css/dataTables.bootstrap4.min.css">
    <link rel="stylesheet" href="<?= APP_URL ?>/template/admin/assets/plugins/feather/feather.css">
    <link rel="stylesheet" href="<?= APP_URL ?>/template/assets/plugins/tabler-icons/webfont/tabler-icons.min.css">
    <link rel="stylesheet" href="<?= APP_URL ?>/template/admin/assets/css/admin.css">
    <style>
        :root { --taxi-primary: #f59e0b; --taxi-dark: #1e293b; }
        .taxi-badge { background: var(--taxi-primary); color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 11px; }
        .sidebar-logo-text { font-weight: 700; font-size: 1.1rem; color: var(--taxi-primary); }
    </style>
</head>
<body>
<div class="main-wrapper">
    <!-- Header -->
    <div class="header">
        <div class="header-left active">
            <a href="<?= APP_URL ?>/pet_taxi/admin/dashboard.php" class="logo">
                <span class="sidebar-logo-text">🚕 Pet Taxi</span>
            </a>
        </div>
        <a id="toggle_btn" href="javascript:void(0);">
            <span class="bar-icon"><span></span><span></span><span></span></span>
        </a>
        <div class="top-nav-search">
            <form action="#">
                <input type="text" class="form-control" placeholder="Ara...">
                <button class="btn" type="submit"><i class="fa fa-search"></i></button>
            </form>
        </div>
        <ul class="nav user-menu">
            <li class="nav-item">
                <a href="<?= APP_URL ?>/admin/dashboard.php" class="btn btn-sm btn-outline-secondary mr-2" style="margin-top:10px">
                    <i class="fa fa-arrow-left"></i> Ana Panel
                </a>
            </li>
            <li class="nav-item dropdown has-arrow">
                <a href="#" class="dropdown-toggle nav-link" data-toggle="dropdown">
                    <span class="user-img">
                        <img class="rounded-circle" src="<?= APP_URL ?>/uploads/profiles/<?= htmlspecialchars($adminUser['profil_resmi'] ?? 'default.jpg') ?>" width="31" alt="">
                    </span>
                </a>
                <div class="dropdown-menu">
                    <div class="user-header">
                        <p class="mb-0"><?= htmlspecialchars($adminUser['ad_soyad']) ?></p>
                        <p class="text-muted mb-0">Admin</p>
                    </div>
                    <a class="dropdown-item" href="<?= APP_URL ?>/admin/index.php?action=logout">Çıkış Yap</a>
                </div>
            </li>
        </ul>
    </div>
    <!-- /Header -->
