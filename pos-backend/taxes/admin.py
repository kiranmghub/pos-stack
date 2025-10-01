# taxes/admin.py
from django.contrib import admin
from .models import TaxRule, TaxScope, TaxBasis, ApplyScope

@admin.register(TaxRule)
class TaxRuleAdmin(admin.ModelAdmin):
    list_display = (
        "code", "name", "tenant", "is_active",
        "scope", "store", "basis", "rate", "amount",
        "apply_scope", "priority", "start_at", "end_at",
    )
    list_filter = (
        "tenant", "is_active", "scope", "basis", "apply_scope",
    )
    search_fields = ("code", "name")
    autocomplete_fields = ("store", "categories")
    ordering = ("tenant", "priority", "code")
    fieldsets = (
        (None, {
            "fields": ("tenant", "name", "code", "is_active", "priority")
        }),
        ("Scope", {
            "fields": ("scope", "store",)
        }),
        ("Computation", {
            "fields": ("basis", "rate", "amount", "apply_scope")
        }),
        ("Targeting", {
            "fields": ("categories",)
        }),
        ("Window", {
            "fields": ("start_at", "end_at")
        }),
    )

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        # Help text so admins input 8.25% as 0.0825
        if "rate" in form.base_fields:
            form.base_fields["rate"].help_text = "Percent as a fraction (e.g., 8.25% = 0.0825)."
        if "amount" in form.base_fields:
            form.base_fields["amount"].help_text = "Flat amount in currency units applied per line/receipt."
        return form
