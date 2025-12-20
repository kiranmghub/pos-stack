# domain_extensions/admin.py
from django.contrib import admin
from .models import ICDCInvoice, ICDCInvoiceLine


@admin.register(ICDCInvoice)
class ICDCInvoiceAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'icdc_number',
        'invoice_date',
        'store',
        'vendor',
        'status',
        'created_at',
        'received_at',
    ]
    list_filter = ['status', 'invoice_date', 'created_at', 'store', 'vendor']
    search_fields = ['icdc_number', 'store__name', 'vendor__name']
    readonly_fields = ['created_at', 'updated_at', 'received_at', 'reversed_at']
    raw_id_fields = ['tenant', 'store', 'vendor', 'pdf_file', 'purchase_order', 'created_by', 'reversed_by']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('tenant', 'store', 'vendor', 'icdc_number', 'invoice_date', 'status')
        }),
        ('Files & Links', {
            'fields': ('pdf_file', 'purchase_order')
        }),
        ('Data', {
            'fields': ('raw_extraction', 'canonical_data', 'parsing_errors', 'calculation_discrepancies', 'parsing_metadata')
        }),
        ('Flags', {
            'fields': ('is_reupload',)
        }),
        ('Audit', {
            'fields': ('created_by', 'created_at', 'updated_at', 'received_at', 'reversed_by', 'reversed_at')
        }),
    )


@admin.register(ICDCInvoiceLine)
class ICDCInvoiceLineAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'invoice',
        'line_number',
        'brand_number',
        'brand_name',
        'cases_delivered',
        'bottles_delivered',
        'total',
        'has_discrepancy',
        'product',
        'variant',
    ]
    list_filter = ['has_discrepancy', 'product_type', 'invoice__status']
    search_fields = ['brand_number', 'brand_name', 'invoice__icdc_number']
    raw_id_fields = ['invoice', 'product', 'variant']

