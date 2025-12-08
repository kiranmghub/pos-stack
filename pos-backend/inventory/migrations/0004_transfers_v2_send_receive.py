# Generated migration for Phase 2, Increment 2: Transfers v2 (Send/Receive + In-Transit)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0003_add_phase2_ref_types'),
    ]

    operations = [
        # Add new status choices to InventoryTransfer
        migrations.AlterField(
            model_name='inventorytransfer',
            name='status',
            field=models.CharField(
                choices=[
                    ('DRAFT', 'Draft'),
                    ('SENT', 'Sent'),
                    ('IN_TRANSIT', 'In Transit'),
                    ('PARTIAL_RECEIVED', 'Partial Received'),
                    ('RECEIVED', 'Received'),
                    ('CANCELLED', 'Cancelled'),
                ],
                db_index=True,
                default='DRAFT',
                max_length=16
            ),
        ),
        # Add qty_sent and qty_received to InventoryTransferLine
        migrations.AddField(
            model_name='inventorytransferline',
            name='qty_received',
            field=models.IntegerField(blank=True, default=0, help_text='Quantity received so far', null=True),
        ),
        migrations.AddField(
            model_name='inventorytransferline',
            name='qty_sent',
            field=models.IntegerField(blank=True, help_text='Quantity actually sent (defaults to qty if not set)', null=True),
        ),
    ]

