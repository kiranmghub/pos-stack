# catalog/models.py

from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _
from common.models import TimeStampedModel


class TaxCategory(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=64)
    code = models.SlugField()
    rate = models.DecimalField(max_digits=6, decimal_places=4, default=0)  # simple %

    class Meta:
        unique_together = ("tenant", "code")
        indexes = [
            models.Index(fields=["tenant", "code"]),
        ]
        verbose_name = "Tax category"
        verbose_name_plural = "Tax categories"

    def __str__(self):
        return f"{self.name} ({self.code}) – {self.tenant}"


def product_image_path(instance, filename):
    # tenants/<TENANT_CODE>/products/<product_id>.<ext>
    ext = (filename.rsplit(".", 1)[-1] or "jpg").lower()
    tenant_code = getattr(getattr(instance, "tenant", None), "code", "T")
    return f"tenants/{tenant_code}/products/{instance.id}.{ext}"


def variant_image_path(instance, filename):
    # tenants/<TENANT_CODE>/variants/<variant_id>.<ext>
    ext = (filename.rsplit(".", 1)[-1] or "jpg").lower()
    tenant_code = getattr(getattr(instance.product, "tenant", None), "code", "T")
    return f"tenants/{tenant_code}/variants/{instance.id}.{ext}"


# (Optional, for the future) If/when you move Product.category -> FK, this
# Category model is ready. For now we keep Product.category as CharField to
# avoid breaking current code.
class Category(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=120)
    code = models.SlugField(blank=True)

    class Meta:
        unique_together = ("tenant", "name")
        indexes = [
            models.Index(fields=["tenant", "name"]),
            models.Index(fields=["tenant", "code"]),
        ]
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


# class Product(TimeStampedModel):
#     tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
#     name = models.CharField(max_length=200)
#     # Keep existing behavior (string category) to avoid breaking code.
#     category = models.CharField(max_length=120, blank=True)
#     description = models.TextField(blank=True, default="")
#     attributes = models.JSONField(default=dict)
#     is_active = models.BooleanField(default=True, db_index=True)
#
#     # New (non-breaking, used by Catalog UI)
#     code = models.CharField(max_length=64, blank=True, default="")
#     image_url = models.URLField(blank=True, default="")
#     tax_category = models.ForeignKey(
#         TaxCategory, null=True, blank=True, on_delete=models.SET_NULL
#     )
#
#     class Meta:
#         indexes = [
#             models.Index(fields=["tenant", "name"]),
#             models.Index(fields=["tenant", "is_active"]),
#             models.Index(fields=["tenant", "category"]),
#             models.Index(fields=["tenant", "code"]),
#         ]
#         ordering = ["name"]
#         verbose_name = "Product"
#         verbose_name_plural = "Products"
#
#     # Optional: a safe representative image when product.image_url is empty
#     def representative_image_url(self):
#         if self.image_url:
#             return self.image_url
#         # fall back to the first variant that actually has an image
#         v = self.variants.filter(image_url__isnull=False).exclude(image_url="").order_by("id").first()
#         return v.image_url if v else ""
#
#     def __str__(self):
#         return self.name
#
#
# class Variant(TimeStampedModel):
#     # Explicit tenant on Variant enables DB-level uniqueness and better indexing.
#     tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
#
#     product = models.ForeignKey(
#         Product, on_delete=models.CASCADE, related_name="variants"
#     )
#     sku = models.CharField(max_length=64, db_index=True)
#     barcode = models.CharField(max_length=64, blank=True, db_index=True)
#     price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
#     cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
#     image_url = models.URLField(blank=True, default="")
#     tax_category = models.ForeignKey(
#         TaxCategory, null=True, blank=True, on_delete=models.SET_NULL
#     )
#     uom = models.CharField(max_length=32, default="each")
#     is_active = models.BooleanField(default=True, db_index=True)
#
#     class Meta:
#         constraints = [
#             models.UniqueConstraint(fields=["tenant", "sku"], name="uniq_variant_sku_per_tenant"),
#             models.UniqueConstraint(
#                 fields=["tenant", "barcode"],
#                 condition=Q(barcode__gt=""),
#                 name="uniq_variant_barcode_per_tenant_when_present",
#             ),
#         ]
#         indexes = [
#             models.Index(fields=["tenant", "is_active"]),
#             models.Index(fields=["product", "is_active"]),
#             # ✅ functional indexes belong here
#             models.Index(Lower("sku"), name="variant_sku_lower_idx"),
#             models.Index(Lower("barcode"), name="variant_barcode_lower_idx"),
#         ]
#
#         # Keep prior behavior—SKU unique within product—while we tighten tenant uniqueness above.
#         # (This is redundant but harmless; remove later if you prefer only tenant-level.)
#         unique_together = ("product", "sku")
#
#     @property
#     def effective_image_url(self) -> str:
#         """Prefer a variant image; otherwise fall back to product image."""
#         return self.image_url or (self.product.image_url if self.product else "")
#
#     def save(self, *args, **kwargs):
#         # Keep tenant in sync with product (critical for create/update)
#         if not self.tenant_id and self.product_id and self.product.tenant_id:
#             self.tenant_id = self.product.tenant_id
#         # Normalize identifiers for consistent lookups and unique constraints
#         if self.sku:
#             self.sku = self.sku.strip().upper()
#         if self.barcode:
#             self.barcode = self.barcode.strip()
#         super().save(*args, **kwargs)
#
#     def __str__(self):
#         return f"{self.product.name} ({self.sku or self.id})"

class Product(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    code = models.SlugField(blank=True, default="")
    category = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True, default="")
    attributes = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True, db_index=True)

    # EXISTING url field (keep it)
    image_url = models.URLField(blank=True, default="")
    # NEW: first-class file support
    image_file = models.ImageField(upload_to=product_image_path, blank=True, null=True)

    tax_category = models.ForeignKey(TaxCategory, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "name"]),
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "category"]),
            models.Index(fields=["tenant", "code"]),
        ]
        ordering = ["name"]
        verbose_name = "Product"
        verbose_name_plural = "Products"

    def __str__(self):
        return self.name

    def representative_image_url(self):
        # Prefer product image file, then product URL, then a variant image file/url
        if self.image_file:
            try:
                return self.image_file.url
            except Exception:
                pass
        if (self.image_url or "").strip():
            return self.image_url
        v = self.variants.exclude(image_file__isnull=True).exclude(image_file="").order_by("id").first()
        if v and v.image_file:
            try:
                return v.image_file.url
            except Exception:
                pass
        v = self.variants.exclude(image_url__isnull=True).exclude(image_url="").order_by("id").first()
        return v.image_url if v else ""


class Variant(TimeStampedModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=64, db_index=True)
    sku = models.CharField(max_length=64, db_index=True)
    barcode = models.CharField(max_length=64, blank=True, db_index=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_category = models.ForeignKey(TaxCategory, null=True, blank=True, on_delete=models.SET_NULL)
    uom = models.CharField(max_length=32, default="each")
    is_active = models.BooleanField(default=True, db_index=True)

    # EXISTING url field (if you already added it; otherwise keep it optional)
    image_url = models.URLField(blank=True, default="")
    # NEW: first-class file support
    image_file = models.ImageField(upload_to=variant_image_path, blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tenant", "sku"], name="uniq_variant_sku_per_tenant"),
            models.UniqueConstraint(
                fields=["tenant", "barcode"],
                condition=Q(barcode__gt=""),
                name="uniq_variant_barcode_per_tenant_when_present",
            ),
        ]

        indexes = [
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["product", "is_active"]),
            # ✅ functional indexes belong here
            models.Index(Lower("sku"), name="variant_sku_lower_idx"),
            models.Index(Lower("barcode"), name="variant_barcode_lower_idx"),
        ]

        unique_together = ("product", "sku")

    def __str__(self):
        return f"{self.product.name} ({self.sku or self.id})"

    @property
    def effective_image_url(self) -> str:
        # Prefer variant file, then variant URL, then product file, then product URL
        if self.image_file:
            try:
                return self.image_file.url
            except Exception:
                pass
        if (self.image_url or "").strip():
            return self.image_url
        if self.product and self.product.image_file:
            try:
                return self.product.image_file.url
            except Exception:
                pass
        return (self.product.image_url or "") if self.product else ""