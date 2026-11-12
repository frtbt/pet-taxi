<?php
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
$db = getDB();
$sqls = [
    "ALTER TABLE `taxi_dogs` ADD COLUMN IF NOT EXISTS `huylu`       VARCHAR(20) NULL AFTER `notlar`",
    "ALTER TABLE `taxi_dogs` ADD COLUMN IF NOT EXISTS `asili`       TINYINT(1) NOT NULL DEFAULT 1 AFTER `huylu`",
    "ALTER TABLE `taxi_dogs` ADD COLUMN IF NOT EXISTS `saglik_notu` TEXT NULL AFTER `asili`",
    "ALTER TABLE `taxi_dogs` ADD COLUMN IF NOT EXISTS `surucu_notu` TEXT NULL AFTER `saglik_notu`",
];
foreach ($sqls as $sql) {
    try { $db->exec($sql); echo "OK: " . substr($sql, 0, 60) . "<br>"; }
    catch (Exception $e) { echo "ERR: " . $e->getMessage() . "<br>"; }
}
echo "Done.";
