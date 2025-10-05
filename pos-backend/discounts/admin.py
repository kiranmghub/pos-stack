# discounts/admin.py
from django.contrib import admin
from django import forms
from decimal import Decimal
from .models import DiscountRule, Coupon, DiscountScope, DiscountBasis, ApplyScope, DiscountTarget

# @admin.register(DiscountRule)
# class DiscountRuleAdmin(admin.ModelAdmin):
#     list_display = (
#         "code", "name", "tenant", "is_active",
#         "scope", "store", "basis", "rate", "amount",
#         "apply_scope", "target", "priority", "start_at", "end_at", "stackable",
#     )
#     list_filter = (
#         "tenant", "is_active", "scope", "basis", "apply_scope", "target", "stackable",
#     )
#     search_fields = ("code", "name")
#     autocomplete_fields = ("store", "categories", "products", "variants")
#     ordering = ("tenant", "priority", "code")
#     fieldsets = (
#         (None, {
#             "fields": ("tenant", "name", "code", "is_active", "priority", "stackable")
#         }),
#         ("Scope", {
#             "fields": ("scope", "store")
#         }),
#         ("Computation", {
#             "fields": ("basis", "rate", "amount", "apply_scope")
#         }),
#         ("Targeting", {
#             "fields": ("target", "categories", "products", "variants")
#         }),
#         ("Window", {
#             "fields": ("start_at", "end_at")
#         }),
#     )

#     def get_form(self, request, obj=None, **kwargs):
#         form = super().get_form(request, obj, **kwargs)
#         if "rate" in form.base_fields:
#             form.base_fields["rate"].help_text = "Percent as a fraction (e.g., 10% = 0.10)."
#         if "amount" in form.base_fields:
#             form.base_fields["amount"].help_text = "Flat discount in currency units."
#         return form

# @admin.register(Coupon)
# class CouponAdmin(admin.ModelAdmin):
#     list_display = (
#         "code", "name", "tenant", "is_active",
#         "rule", "min_subtotal", "max_uses", "used_count",
#         "start_at", "end_at"
#     )
#     list_filter = ("tenant", "is_active",)
#     search_fields = ("code", "name")
#     autocomplete_fields = ("rule",)
#     ordering = ("tenant", "code")



class DiscountRuleForm(forms.ModelForm):
    class Meta:
        model = DiscountRule
        fields = "__all__"
        help_texts = {
            "rate": "For percent, enter 0.20 for 20%. (Entering 20 will be saved as 0.20 automatically.)",
            "amount": "Flat discount in currency units.",
        }

    def clean_rate(self):
        rate = self.cleaned_data.get("rate")
        # Basis could be on the form or the instance when editing
        basis = str(self.cleaned_data.get("basis") or getattr(self.instance, "basis", "")).upper()
        if basis == "PCT" and rate is not None:
            r = Decimal(rate)
            if r > 1:
                r = r / Decimal("100")
            if r < 0:
                r = Decimal("0")
            return r
        return rate


@admin.register(DiscountRule)
class DiscountRuleAdmin(admin.ModelAdmin):
    # Use the normalization form
    form = DiscountRuleForm

    list_display = (
        "code", "name", "tenant", "is_active",
        "scope", "store", "basis", "rate", "amount",
        "apply_scope", "target", "priority", "start_at", "end_at", "stackable",
    )
    list_filter = (
        "tenant", "is_active", "scope", "basis", "apply_scope", "target", "stackable",
    )
    search_fields = ("code", "name")
    autocomplete_fields = ("store", "categories", "products", "variants")
    ordering = ("tenant", "priority", "code")
    fieldsets = (
        (None, {
            "fields": ("tenant", "name", "code", "is_active", "priority", "stackable")
        }),
        ("Scope", {
            "fields": ("scope", "store")
        }),
        ("Computation", {
            "fields": ("basis", "rate", "amount", "apply_scope")
        }),
        ("Targeting", {
            "fields": ("target", "categories", "products", "variants")
        }),
        ("Window", {
            "fields": ("start_at", "end_at")
        }),
    )


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = (
        "code", "name", "tenant", "is_active",
        "rule", "min_subtotal", "max_uses", "used_count",
        "start_at", "end_at"
    )
    list_filter = ("tenant", "is_active",)
    search_fields = ("code", "name")
    autocomplete_fields = ("rule",)
    ordering = ("tenant", "code")
