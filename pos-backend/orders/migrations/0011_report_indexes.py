from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0010_returnitem_orders_retu_return__ca6d16_idx"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="sale",
            index=models.Index(fields=["created_at"], name="sale_created_idx"),
        ),
        migrations.AddIndex(
            model_name="sale",
            index=models.Index(fields=["tenant", "created_at", "status"], name="sale_tenant_status_idx"),
        ),
        migrations.AddIndex(
            model_name="saleline",
            index=models.Index(fields=["sale", "variant"], name="saleline_sale_variant_idx"),
        ),
        migrations.AddIndex(
            model_name="return",
            index=models.Index(fields=["created_at"], name="return_created_idx"),
        ),
        migrations.AddIndex(
            model_name="return",
            index=models.Index(fields=["tenant", "created_at", "status"], name="return_tenant_status_idx"),
        ),
    ]
