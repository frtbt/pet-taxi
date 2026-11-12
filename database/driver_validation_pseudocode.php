<?php
/**
 * Sürücü Onboarding v2 — Backend Validasyon Referansı
 *
 * Bu dosya taxi.php içindeki 'save_driver_step' ve 'submit_driver'
 * case'leri için gerçek PHP mantığı içerir.
 * taxi.php'ye entegre ederken bu fonksiyonları global scope'a taşı.
 */

// ────────────────────────────────────────────────────────────
// YARDIMCI: Base64 fotoğrafı kaydet, URL döndür
// ────────────────────────────────────────────────────────────
function saveBase64Photo(string $base64, string $directory, string $prefix = 'photo'): ?string
{
    // Boyut kontrolü: base64 length > 2.7M ≈ ~2MB binary
    if (strlen($base64) > 2_700_000) {
        return null; // caller hata döndürür
    }

    $data = base64_decode(preg_replace('#^data:\w+/\w+;base64,#', '', $base64));
    if ($data === false) return null;

    // Gerçek uygulamada: $directory = __DIR__ . '/../uploads/drivers/'
    // Şu an base64 string olarak DB'ye yazıyorsun, bu pattern'i koru:
    return $base64; // veya dosya yolunu döndür
}

// ────────────────────────────────────────────────────────────
// ADIM 1: Kimlik & Güvenlik
// ────────────────────────────────────────────────────────────
function validateDriverStep1(array $data): array
{
    $errors = [];

    // Zorunlu fotoğraflar (yeni yükleme VEYA daha önce kaydedilmiş)
    if (empty($data['profil_foto']) && empty($data['profil_foto_mevcut'])) {
        $errors[] = 'Profil fotoğrafı zorunludur.';
    }
    if (empty($data['ehliyet_on']) && empty($data['ehliyet_on_mevcut'])) {
        $errors[] = 'Ehliyet ön yüzü zorunludur.';
    }
    if (empty($data['ehliyet_arka']) && empty($data['ehliyet_arka_mevcut'])) {
        $errors[] = 'Ehliyet arka yüzü zorunludur.';
    }
    if (empty($data['adli_sicil']) && empty($data['adli_sicil_mevcut'])) {
        $errors[] = 'Adli sicil belgesi zorunludur.';
    }

    // Boyut kontrolü (yeni yüklenenler için)
    $photoFields = ['profil_foto', 'ehliyet_on', 'ehliyet_arka', 'adli_sicil'];
    foreach ($photoFields as $field) {
        if (!empty($data[$field]) && strlen($data[$field]) > 2_700_000) {
            $errors[] = ucfirst(str_replace('_', ' ', $field)) . ' 2 MB limitini aşıyor.';
        }
    }

    return $errors;
}

// ────────────────────────────────────────────────────────────
// ADIM 2: Araç Bilgileri
// ────────────────────────────────────────────────────────────
function validateDriverStep2(array $data): array
{
    $errors      = [];
    $currentYear = (int)date('Y');

    if (empty(trim($data['marka'] ?? ''))) {
        $errors[] = 'Araç markası zorunludur.';
    }
    if (empty(trim($data['model'] ?? ''))) {
        $errors[] = 'Araç modeli zorunludur.';
    }

    $yil = (int)($data['yil'] ?? 0);
    if ($yil < 2000 || $yil > $currentYear + 1) {
        $errors[] = "Araç yılı 2000–{$currentYear} arasında olmalıdır.";
    }

    $plaka = trim(strtoupper($data['plaka'] ?? ''));
    if (empty($plaka)) {
        $errors[] = 'Plaka zorunludur.';
    } elseif (!preg_match('/^[0-9]{2}[A-Z]{1,3}[0-9]{2,4}$/', preg_replace('/\s/', '', $plaka))) {
        $errors[] = 'Geçerli bir Türk plakası giriniz (örn: 34ABC123).';
    }

    if (empty($data['ruhsat_foto']) && empty($data['ruhsat_foto_mevcut'])) {
        $errors[] = 'Araç ruhsatı fotoğrafı zorunludur.';
    }

    // En az 1 araç içi görsel
    $icGorseller = $data['ic_gorseller'] ?? [];
    $mevcutGorseller = $data['ic_gorseller_mevcut'] ?? [];
    if (empty($icGorseller) && empty($mevcutGorseller)) {
        $errors[] = 'En az 1 araç içi görsel zorunludur.';
    }
    if (count($icGorseller) > 6) {
        $errors[] = 'En fazla 6 araç içi görsel yükleyebilirsiniz.';
    }
    foreach ($icGorseller as $i => $foto) {
        if (strlen($foto) > 2_700_000) {
            $errors[] = ($i + 1) . '. görsel 2 MB limitini aşıyor.';
        }
    }

    if (empty($data['klima_taahhut'])) {
        $errors[] = 'Klima/havalandırma taahhüdü zorunludur.';
    }

    return $errors;
}

// ────────────────────────────────────────────────────────────
// ADIM 3: Pet Deneyimi & Tercihler
// ────────────────────────────────────────────────────────────
function validateDriverStep3(array $data, PDO $db): array
{
    $errors = [];

    // Hayvan türleri — minimum 1, geçerli ID'ler
    $hayvanTurleri = $data['hayvan_turleri'] ?? [];
    if (empty($hayvanTurleri) || !is_array($hayvanTurleri)) {
        $errors[] = 'En az bir hayvan türü seçmelisiniz.';
    } else {
        // DB'deki geçerli ID'lerle karşılaştır
        $placeholders = implode(',', array_fill(0, count($hayvanTurleri), '?'));
        $stmt = $db->prepare("SELECT COUNT(*) FROM animal_types WHERE id IN ($placeholders)");
        $stmt->execute(array_map('intval', $hayvanTurleri));
        if ((int)$stmt->fetchColumn() !== count($hayvanTurleri)) {
            $errors[] = 'Geçersiz hayvan türü seçimi.';
        }
    }

    // Ekipmanlar — opsiyonel ama geçerli ID olmalı
    $ekipmanlar = $data['ekipmanlar'] ?? [];
    if (!empty($ekipmanlar)) {
        $placeholders = implode(',', array_fill(0, count($ekipmanlar), '?'));
        $stmt = $db->prepare("SELECT COUNT(*) FROM equipments WHERE id IN ($placeholders)");
        $stmt->execute(array_map('intval', $ekipmanlar));
        if ((int)$stmt->fetchColumn() !== count($ekipmanlar)) {
            $errors[] = 'Geçersiz ekipman seçimi.';
        }
    }

    // Zorunlu beyan
    if (empty($data['allerji_beyan'])) {
        $errors[] = 'Alerji beyanı zorunludur.';
    }

    return $errors;
}

// ────────────────────────────────────────────────────────────
// ADIM 4: Kural Kabulü & Final Submit
// ────────────────────────────────────────────────────────────
function validateDriverStep4(array $data): array
{
    $errors = [];

    if (empty($data['kurallar_kabul'])) {
        $errors[] = 'Pet taşıma kurallarını kabul etmeniz zorunludur.';
    }

    return $errors;
}

// ────────────────────────────────────────────────────────────
// ANA İŞLEYİCİ: save_driver_step (taxi.php case'i olarak)
// ────────────────────────────────────────────────────────────
function handleSaveDriverStep(PDO $db, array $input, int $userId): array
{
    $step = (int)($input['step'] ?? 0);
    if ($step < 1 || $step > 4) {
        return ['success' => false, 'error' => 'Geçersiz adım.'];
    }

    // Sürücü kaydını al veya oluştur
    $stmt = $db->prepare("SELECT id, adim_tamamlanan, durum FROM drivers WHERE user_id = ?");
    $stmt->execute([$userId]);
    $driver = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$driver) {
        $db->prepare("INSERT INTO drivers (user_id) VALUES (?)")->execute([$userId]);
        $driverId = (int)$db->lastInsertId();
        $completedStep = 0;
    } else {
        $driverId      = (int)$driver['id'];
        $completedStep = (int)$driver['adim_tamamlanan'];

        // Onaylı sürücü veri değiştiremez
        if ($driver['durum'] === 'onaylandi') {
            return ['success' => false, 'error' => 'Onaylı hesap değiştirilemez.'];
        }
        // Adım sırası zorunluluğu: önceki adımı tamamlamadan ileri gidemez
        if ($step > $completedStep + 1) {
            return ['success' => false, 'error' => "Lütfen önce {$completedStep}. adımı tamamlayın."];
        }
    }

    // Adıma göre validasyon
    $errors = match ($step) {
        1 => validateDriverStep1($input),
        2 => validateDriverStep2($input),
        3 => validateDriverStep3($input, $db),
        4 => validateDriverStep4($input),
    };

    if (!empty($errors)) {
        return ['success' => false, 'errors' => $errors];
    }

    // ── Veritabanına kaydet ──────────────────────────────────
    $db->beginTransaction();
    try {
        switch ($step) {
            case 1:
                $params = ['adim_tamamlanan' => max($completedStep, 1)];
                if (!empty($input['profil_foto']))  $params['profil_foto']  = $input['profil_foto'];
                if (!empty($input['ehliyet_on']))   $params['ehliyet_on']   = $input['ehliyet_on'];
                if (!empty($input['ehliyet_arka'])) $params['ehliyet_arka'] = $input['ehliyet_arka'];
                if (!empty($input['adli_sicil']))   $params['adli_sicil']   = $input['adli_sicil'];
                updateDriverRecord($db, $driverId, $params);
                break;

            case 2:
                // Araç kaydı — upsert
                $stmt = $db->prepare("SELECT id FROM driver_vehicles WHERE driver_id = ?");
                $stmt->execute([$driverId]);
                $vehicleId = $stmt->fetchColumn();

                $vehicleData = [
                    'marka'         => trim($input['marka']),
                    'model'         => trim($input['model']),
                    'yil'           => (int)$input['yil'],
                    'plaka'         => strtoupper(trim($input['plaka'])),
                    'klima_taahhut' => (int)!empty($input['klima_taahhut']),
                ];
                if (!empty($input['ruhsat_foto'])) $vehicleData['ruhsat_foto'] = $input['ruhsat_foto'];

                if ($vehicleId) {
                    updateRecord($db, 'driver_vehicles', $vehicleData, 'id = ?', [$vehicleId]);
                } else {
                    $vehicleData['driver_id'] = $driverId;
                    $vehicleId = insertRecord($db, 'driver_vehicles', $vehicleData);
                }

                // İç görseller — yeni yüklenenleri ekle (mevcutları silme)
                foreach (($input['ic_gorseller'] ?? []) as $idx => $foto) {
                    $db->prepare(
                        "INSERT INTO driver_vehicle_photos (vehicle_id, foto_url, foto_turu, siralama)
                         VALUES (?, ?, 'ic_mekan', ?)"
                    )->execute([$vehicleId, $foto, $idx]);
                }

                updateDriverRecord($db, $driverId, ['adim_tamamlanan' => max($completedStep, 2)]);
                break;

            case 3:
                // Pivot — hayvan türleri (tamamen değiştir)
                $db->prepare("DELETE FROM driver_allowed_animals WHERE driver_id = ?")->execute([$driverId]);
                $stmt = $db->prepare("INSERT INTO driver_allowed_animals (driver_id, animal_type_id) VALUES (?, ?)");
                foreach ($input['hayvan_turleri'] as $animalId) {
                    $stmt->execute([$driverId, (int)$animalId]);
                }

                // Pivot — ekipmanlar
                $db->prepare("DELETE FROM driver_equipments WHERE driver_id = ?")->execute([$driverId]);
                $stmt = $db->prepare("INSERT INTO driver_equipments (driver_id, equipment_id) VALUES (?, ?)");
                foreach (($input['ekipmanlar'] ?? []) as $eqId) {
                    $stmt->execute([$driverId, (int)$eqId]);
                }

                updateDriverRecord($db, $driverId, [
                    'allerji_beyan'      => 1,
                    'adim_tamamlanan'    => max($completedStep, 3),
                ]);
                break;

            case 4:
                // Final submit
                updateDriverRecord($db, $driverId, [
                    'kurallar_kabul'    => 1,
                    'kurallar_kabul_at' => date('Y-m-d H:i:s'),
                    'adim_tamamlanan'   => 4,
                    'durum'             => 'beklemede',
                    'submitted_at'      => date('Y-m-d H:i:s'),
                ]);
                // taxi_users.sertifika_durumu'nu senkronize et (backward compat)
                $db->prepare("UPDATE taxi_users SET sertifika_durumu = 'beklemede' WHERE id = ?")
                   ->execute([$userId]);

                // Admin'e bildirim gönder (taxiNotify veya mail ile)
                break;
        }

        $db->commit();
        return [
            'success'    => true,
            'step'       => $step,
            'is_final'   => $step === 4,
        ];

    } catch (Exception $e) {
        $db->rollBack();
        return ['success' => false, 'error' => 'Kayıt hatası: ' . $e->getMessage()];
    }
}

// ── Yardımcı upsert fonksiyonları ───────────────────────────
function updateDriverRecord(PDO $db, int $driverId, array $data): void
{
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($data)));
    $stmt = $db->prepare("UPDATE drivers SET $sets WHERE id = ?");
    $stmt->execute([...array_values($data), $driverId]);
}

function updateRecord(PDO $db, string $table, array $data, string $where, array $whereParams): void
{
    $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($data)));
    $stmt = $db->prepare("UPDATE $table SET $sets WHERE $where");
    $stmt->execute([...array_values($data), ...$whereParams]);
}

function insertRecord(PDO $db, string $table, array $data): int
{
    $cols   = implode(', ', array_keys($data));
    $marks  = implode(', ', array_fill(0, count($data), '?'));
    $stmt   = $db->prepare("INSERT INTO $table ($cols) VALUES ($marks)");
    $stmt->execute(array_values($data));
    return (int)$db->lastInsertId();
}
