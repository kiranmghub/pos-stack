# Generated manually for ICDC ref types

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0007_add_reservations'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockledger',
            name='ref_type',
            field=models.CharField(
                choices=[
                    ('ADJUSTMENT', 'Adjustment'),
                    ('SALE', 'POS Sale'),
                    ('RETURN', 'Return'),
                    ('TRANSFER', 'Transfer'),
                    ('TRANSFER_OUT', 'Transfer Out'),
                    ('TRANSFER_IN', 'Transfer In'),
                    ('RECEIPT', 'Receipt'),
                    ('COUNT', 'Count'),
                    ('COUNT_RECONCILE', 'Count Reconcile'),
                    ('PURCHASE_ORDER_RECEIPT', 'Purchase Order Receipt'),
                    ('WASTE', 'Waste'),
                    ('RESERVATION', 'Reservation'),
                    ('RESERVATION_COMMIT', 'Reservation Commit'),
                    ('RESERVATION_RELEASE', 'Reservation Release'),
                    ('BREAKAGE', 'Breakage'),
                    ('SHORTAGE', 'Shortage'),
                    ('ICDC_RECEIPT', 'ICDC Invoice Receipt'),
                    ('ICDC_REVERSAL', 'ICDC Invoice Reversal'),
                ],
                max_length=30
            ),
        ),
    ]

