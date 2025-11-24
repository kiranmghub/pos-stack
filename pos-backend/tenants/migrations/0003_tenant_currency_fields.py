from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0002_alter_tenantuser_options"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="currency_code",
            field=models.CharField(default="USD", max_length=3),
        ),
        migrations.AddField(
            model_name="tenant",
            name="currency_symbol",
            field=models.CharField(blank=True, max_length=4, null=True),
        ),
        migrations.AddField(
            model_name="tenant",
            name="currency_precision",
            field=models.PositiveSmallIntegerField(default=2),
        ),
    ]
