from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("sale", "method", "amount", "approval_code", "created_at")
    list_filter = ("method", "created_at")
    search_fields = ("sale__id", "approval_code")
