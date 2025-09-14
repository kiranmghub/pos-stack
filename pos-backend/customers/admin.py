from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("tenant", "name", "phone", "email", "loyalty_id", "created_at")
    list_filter = ("tenant",)
    search_fields = ("name", "phone", "email", "loyalty_id")
