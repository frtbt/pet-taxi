<?php
$status = $_GET['status'] ?? 'fail';
$msg    = $_GET['msg']    ?? '';
$ok     = $status === 'success';
$deepLink = 'pet-taxi://payment-result?status=' . $status;
?><!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $ok ? 'Ödeme Başarılı' : 'Ödeme Başarısız' ?></title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, sans-serif; background: #0f0f0f; color: #fff;
         display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
  .card { background:#1a1a1a; border-radius:20px; padding:40px 32px; text-align:center; max-width:360px; width:100%; }
  .icon { font-size:64px; margin-bottom:16px; }
  h1 { font-size:22px; font-weight:800; margin-bottom:10px; color:<?= $ok ? '#a3e635' : '#f87171' ?>; }
  p { color:#888; font-size:14px; line-height:1.6; margin-bottom:24px; }
  .btn { display:inline-block; background:<?= $ok ? '#a3e635' : '#3b3b3b' ?>;
         color:<?= $ok ? '#0f0f0f' : '#fff' ?>; border-radius:12px;
         padding:14px 28px; font-weight:700; text-decoration:none; font-size:15px; }
  .note { color:#555; font-size:12px; margin-top:16px; }
</style>
</head>
<body>
<div class="card">
  <div class="icon"><?= $ok ? '✅' : '❌' ?></div>
  <h1><?= $ok ? 'Ödeme Başarılı!' : 'Ödeme Başarısız' ?></h1>
  <p><?= $ok
    ? 'Bakiyeniz başarıyla yüklendi.'
    : htmlspecialchars($msg ?: 'Ödeme işlemi tamamlanamadı. Lütfen tekrar deneyin.') ?>
  </p>
  <a href="<?= htmlspecialchars($deepLink) ?>" class="btn">Uygulamaya Dön</a>
  <p class="note">Otomatik yönlendiriliyorsunuz…</p>
</div>
<script>
  // Hemen deep link'e yönlendir — uygulama içi tarayıcı kapanır
  window.location.replace(<?= json_encode($deepLink) ?>);
</script>
</body>
</html>
