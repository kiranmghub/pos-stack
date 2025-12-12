# Generated manually for External PO Receipt feature
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('purchasing', '0003_add_received_at_to_purchase_order'),
        ('tenants', '0010_tenant_default_reorder_point'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchaseorder',
            name='is_external',
            field=models.BooleanField(db_index=True, default=False, help_text='True if PO was created outside the system (external receipt)'),
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='external_po_number',
            field=models.CharField(blank=True, db_index=True, help_text='External PO number from vendor/tenant system', max_length=100),
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='vendor_invoice_number',
            field=models.CharField(blank=True, db_index=True, help_text="Vendor's invoice number (unique per tenant when provided)", max_length=100),
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='vendor_invoice_date',
            field=models.DateField(blank=True, help_text='Date on vendor invoice', null=True),
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='import_source',
            field=models.CharField(blank=True, choices=[('CSV', 'CSV Upload'), ('PDF', 'PDF Upload'), ('IMAGE', 'Image Upload'), ('MANUAL', 'Manual Entry')], help_text='How this external PO was created', max_length=50),
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='invoice_document',
            field=models.ForeignKey(blank=True, help_text='Link to uploaded invoice document', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='purchase_orders', to='tenants.tenantdoc'),
        ),
        migrations.AddIndex(
            model_name='purchaseorder',
            index=models.Index(fields=['tenant', 'is_external'], name='purchasing_p_tenant__idx'),
        ),
        migrations.AddIndex(
            model_name='purchaseorder',
            index=models.Index(fields=['tenant', 'vendor_invoice_number'], name='purchasing_p_tenant__idx2'),
        ),
        migrations.AddConstraint(
            model_name='purchaseorder',
            constraint=models.UniqueConstraint(condition=Q(vendor_invoice_number__gt=''), fields=('tenant', 'vendor_invoice_number'), name='unique_vendor_invoice_per_tenant'),
        ),
    ]

