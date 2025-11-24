from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0007_alter_auditlog_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="salepayment",
            name="currency_code",
            field=models.CharField(default="USD", max_length=3),
        ),
        migrations.AddField(
            model_name="sale",
            name="currency_code",
            field=models.CharField(default="USD", max_length=3),
        ),
    ]
