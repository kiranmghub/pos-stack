# Generated migration for Phase 2, Increment 4: Add reorder_qty to Variant

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0024_variant_reorder_point'),
    ]

    operations = [
        migrations.AddField(
            model_name='variant',
            name='reorder_qty',
            field=models.PositiveIntegerField(blank=True, help_text='Suggested reorder quantity (defaults to threshold - on_hand if not set)', null=True),
        ),
    ]

