# Generated migration for Phase 2, Increment 3: Cycle Counts v2 (Scopes & Variance)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0004_transfers_v2_send_receive'),
    ]

    operations = [
        # Add scope and zone_name fields to CountSession
        migrations.AddField(
            model_name='countsession',
            name='scope',
            field=models.CharField(
                choices=[('FULL_STORE', 'Full Store'), ('ZONE', 'Zone')],
                db_index=True,
                default='FULL_STORE',
                help_text='FULL_STORE or ZONE',
                max_length=20
            ),
        ),
        migrations.AddField(
            model_name='countsession',
            name='zone_name',
            field=models.CharField(blank=True, help_text='Required if scope is ZONE', max_length=100),
        ),
        # Add index for efficient querying of active full-store counts
        migrations.AddIndex(
            model_name='countsession',
            index=models.Index(fields=['tenant', 'store', 'scope', 'status'], name='inventory_co_tenant__idx'),
        ),
    ]

