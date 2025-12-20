# Generated manually for ICDC Invoice models

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('catalog', '0001_initial'),
        ('purchasing', '0001_initial'),
        ('stores', '0001_initial'),
        ('tenants', '0013_add_business_domain_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='ICDCInvoice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('icdc_number', models.CharField(db_index=True, help_text='ICDC number from the invoice (unique per tenant)', max_length=100)),
                ('invoice_date', models.DateField(help_text='Invoice date from the PDF')),
                ('status', models.CharField(choices=[('DRAFT', 'Draft'), ('REVIEW', 'Under Review'), ('RECEIVED', 'Received'), ('REVERSED', 'Reversed'), ('CANCELLED', 'Cancelled')], db_index=True, default='DRAFT', help_text='Current status of the invoice', max_length=20)),
                ('raw_extraction', models.JSONField(blank=True, default=dict, help_text='Complete raw data extracted from PDF (lossless)')),
                ('canonical_data', models.JSONField(blank=True, default=dict, help_text='User-edited/normalized data (editable canonical form)')),
                ('parsing_errors', models.JSONField(blank=True, default=list, help_text='List of parsing errors encountered')),
                ('calculation_discrepancies', models.JSONField(blank=True, default=list, help_text='List of calculation discrepancies found')),
                ('parsing_metadata', models.JSONField(blank=True, default=dict, help_text='Parser version, OCR confidence scores, parsing method, etc.')),
                ('is_reupload', models.BooleanField(default=False, help_text='True if this is a re-upload of a reversed/cancelled invoice')),
                ('received_at', models.DateTimeField(blank=True, db_index=True, help_text='When the invoice was received (status=RECEIVED)', null=True)),
                ('reversed_at', models.DateTimeField(blank=True, help_text='When the invoice was reversed (status=REVERSED)', null=True)),
                ('pdf_file', models.ForeignKey(help_text='Link to uploaded PDF file', on_delete=django.db.models.deletion.PROTECT, related_name='icdc_invoices', to='tenants.tenantdoc')),
                ('purchase_order', models.ForeignKey(blank=True, help_text='Linked purchase order created when invoice is submitted', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='icdc_invoice', to='purchasing.purchaseorder')),
                ('store', models.ForeignKey(db_index=True, on_delete=django.db.models.deletion.PROTECT, to='stores.store')),
                ('tenant', models.ForeignKey(db_index=True, on_delete=django.db.models.deletion.CASCADE, to='tenants.tenant')),
                ('vendor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='icdc_invoices', to='purchasing.vendor')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='icdc_invoices_created', to=settings.AUTH_USER_MODEL)),
                ('reversed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='icdc_invoices_reversed', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'ICDC Invoice',
                'verbose_name_plural': 'ICDC Invoices',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ICDCInvoiceLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('line_number', models.IntegerField(help_text='Line number from the PDF table')),
                ('brand_number', models.CharField(help_text='Brand number from PDF (maps to Product.code, preserve leading zeros)', max_length=50)),
                ('brand_name', models.CharField(help_text='Brand name from PDF (maps to Product.name)', max_length=200)),
                ('product_type', models.CharField(help_text='Product type from PDF (Beer/IML, maps to Category)', max_length=50)),
                ('pack_qty', models.IntegerField(help_text='Number of bottles per case/box')),
                ('size_ml', models.IntegerField(help_text='Size in ml (extracted from Pack Qty/Size column)')),
                ('cases_delivered', models.IntegerField(default=0, help_text='Number of cases/boxes delivered')),
                ('bottles_delivered', models.IntegerField(default=0, help_text='Number of loose bottles delivered (breakage/shortage/reverted)')),
                ('unit_rate', models.DecimalField(decimal_places=2, help_text='Case rate (unit rate from PDF, rounded)', max_digits=10)),
                ('btl_rate', models.DecimalField(decimal_places=2, help_text='Bottle rate (btl rate from PDF, used as Variant.cost)', max_digits=10)),
                ('total', models.DecimalField(decimal_places=2, help_text='Total from PDF (may have discrepancies)', max_digits=12)),
                ('calculated_total', models.DecimalField(decimal_places=2, help_text='Calculated total based on our rules', max_digits=12)),
                ('has_discrepancy', models.BooleanField(default=False, help_text='True if there is a calculation discrepancy')),
                ('discrepancy_reason', models.TextField(blank=True, help_text='Reason for the discrepancy')),
                ('raw_data', models.JSONField(blank=True, default=dict, help_text='Additional raw data from PDF (pack_type, etc.)')),
                ('invoice', models.ForeignKey(db_index=True, on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='domain_extensions.icdcinvoice')),
                ('product', models.ForeignKey(blank=True, help_text='Matched product (null until matched)', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='icdc_invoice_lines', to='catalog.product')),
                ('variant', models.ForeignKey(blank=True, help_text='Matched variant (null until matched)', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='icdc_invoice_lines', to='catalog.variant')),
            ],
            options={
                'verbose_name': 'ICDC Invoice Line',
                'verbose_name_plural': 'ICDC Invoice Lines',
                'ordering': ['line_number'],
            },
        ),
        migrations.AddIndex(
            model_name='icdcinvoice',
            index=models.Index(fields=['tenant', 'icdc_number'], name='icdc_invoice_tenant_icdc_idx'),
        ),
        migrations.AddIndex(
            model_name='icdcinvoice',
            index=models.Index(fields=['tenant', 'status', 'created_at'], name='icdc_invoice_tenant_status_created_idx'),
        ),
        migrations.AddIndex(
            model_name='icdcinvoice',
            index=models.Index(fields=['tenant', 'store', 'status'], name='icdc_invoice_tenant_store_status_idx'),
        ),
        migrations.AddIndex(
            model_name='icdcinvoice',
            index=models.Index(fields=['invoice_date'], name='icdc_invoice_date_idx'),
        ),
        migrations.AddIndex(
            model_name='icdcinvoice',
            index=models.Index(fields=['received_at'], name='icdc_invoice_received_at_idx'),
        ),
        migrations.AddConstraint(
            model_name='icdcinvoice',
            constraint=models.UniqueConstraint(fields=('tenant', 'icdc_number'), name='uniq_icdc_number_per_tenant'),
        ),
        migrations.AddIndex(
            model_name='icdcinvoiceline',
            index=models.Index(fields=['invoice', 'line_number'], name='icdc_line_invoice_line_number_idx'),
        ),
        migrations.AddIndex(
            model_name='icdcinvoiceline',
            index=models.Index(fields=['invoice', 'product'], name='icdc_line_invoice_product_idx'),
        ),
        migrations.AddIndex(
            model_name='icdcinvoiceline',
            index=models.Index(fields=['invoice', 'variant'], name='icdc_line_invoice_variant_idx'),
        ),
        migrations.AddIndex(
            model_name='icdcinvoiceline',
            index=models.Index(fields=['brand_number'], name='icdc_line_brand_number_idx'),
        ),
    ]

