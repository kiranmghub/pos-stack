# Generated migration for Phase 2, Increment 1: Add new ref_types to StockLedger

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0002_initial'),
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
                ],
                max_length=25
            ),
        ),
    ]

