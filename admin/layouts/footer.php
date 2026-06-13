<?php if (!defined('TAXI_ADMIN')) die('Erişim engellendi'); ?>
        </div><!-- /.content -->
    </div><!-- /.page-wrapper -->
</div><!-- /.main-wrapper -->

<script src="<?= APP_URL ?>/template/admin/assets/js/jquery-3.6.0.min.js"></script>
<script src="<?= APP_URL ?>/template/admin/assets/plugins/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="<?= APP_URL ?>/template/admin/assets/js/feather.min.js"></script>
<script src="<?= APP_URL ?>/template/admin/assets/js/jquery.slimscroll.min.js"></script>
<script src="<?= APP_URL ?>/template/admin/assets/js/select2.min.js"></script>
<script src="<?= APP_URL ?>/template/admin/assets/plugins/datatables/jquery.dataTables.min.js"></script>
<script src="<?= APP_URL ?>/template/admin/assets/plugins/datatables/dataTables.bootstrap4.min.js"></script>
<script src="<?= APP_URL ?>/template/admin/assets/js/admin.js"></script>
<script>
    if (typeof feather !== 'undefined') feather.replace();
    $(document).ready(function () {
        if ($.fn.DataTable) {
            $('.datatable').DataTable({
                language: {
                    url: '<?= APP_URL ?>/template/admin/assets/js/dataTables.turkish.json'
                },
                responsive: true,
                pageLength: 25
            });
        }
        if ($.fn.select2) {
            $('.select2').select2();
        }
    });
</script>
<?php if (isset($extraJs)): ?>
<script><?= $extraJs ?></script>
<?php endif; ?>
</body>
</html>
