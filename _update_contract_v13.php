<?php
// Sözleşme v1.3 — araç yaşı 10→20 yıl
// Çalıştır: curl "https://patimera.com/pet_taxi/_update_contract_v13.php"
// Çalıştıktan sonra bu dosyayı sil.

require_once __DIR__ . '/config/database.php';

$yeniIcerik = file_get_contents(__DIR__ . '/sozlesme.md');
if (!$yeniIcerik) {
    die(json_encode(['success' => false, 'error' => 'sozlesme.md okunamadı']));
}

try {
    $db->beginTransaction();
    // Önceki sürümleri devre dışı bırak
    $db->exec("UPDATE taxi_contracts SET aktif = 0");
    // v1.3 ekle
    $stmt = $db->prepare("INSERT INTO taxi_contracts (surum, icerik, yururluk_tarihi, aktif) VALUES ('1.3', ?, '2026-11-06', 1)");
    $stmt->execute([$yeniIcerik]);
    $db->commit();
    echo json_encode(['success' => true, 'message' => 'Sözleşme v1.3 aktif edildi.']);
} catch (Exception $e) {
    $db->rollBack();
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
