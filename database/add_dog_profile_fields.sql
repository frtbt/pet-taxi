-- Köpek profili alanları: davranış, sağlık, sürücü notu
ALTER TABLE `taxi_dogs`
    ADD COLUMN IF NOT EXISTS `huylu`       VARCHAR(20)  NULL COMMENT 'sakin/enerjik/agresif/endiseli' AFTER `notlar`,
    ADD COLUMN IF NOT EXISTS `asili`       TINYINT(1)   NOT NULL DEFAULT 1 AFTER `huylu`,
    ADD COLUMN IF NOT EXISTS `saglik_notu` TEXT         NULL AFTER `asili`,
    ADD COLUMN IF NOT EXISTS `surucu_notu` TEXT         NULL AFTER `saglik_notu`;
