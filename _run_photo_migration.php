<?php
require_once dirname(__DIR__) . '/config/config.php';
require_once dirname(__DIR__) . '/config/database.php';
$db = getDB();
$sql = "CREATE TABLE IF NOT EXISTS `taxi_photo_requests` (
  `id`            INT           NOT NULL AUTO_INCREMENT,
  `match_id`      INT           NOT NULL,
  `talep_eden_id` INT           NOT NULL,
  `durum`         ENUM('bekleniyor','gonderildi') NOT NULL DEFAULT 'bekleniyor',
  `foto_url`      VARCHAR(500)  NULL,
  `olusturulma`   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `gonderilme`    TIMESTAMP     NULL,
  PRIMARY KEY (`id`),
  KEY `idx_match` (`match_id`, `durum`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
try {
    $db->exec($sql);
    echo "OK: taxi_photo_requests oluşturuldu.";
} catch (Exception $e) {
    echo "ERR: " . $e->getMessage();
}
