# Generated manually for business domain support

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0012_add_tenantdoc_soft_delete'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='business_domain',
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text="Business domain/industry type (e.g., 'telangana_liquor', 'paints_industry', 'grocery')",
                max_length=50,
                null=True
            ),
        ),
        migrations.AddField(
            model_name='tenant',
            name='business_domain_config',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Domain-specific configuration settings stored as JSON'
            ),
        ),
    ]

