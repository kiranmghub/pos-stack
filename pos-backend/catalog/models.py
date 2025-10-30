# pos-backend/catalog/models.py

from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _
from common.models import TimeStampedModel
from decimal import Decimal, ROUND_HALF_UP



class TaxCategory(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    name = models.CharField(max_length=120)
    code = models.SlugField()
    rate = models.DecimalField(max_digits=6, decimal_places=4, default=0)  # simple %
    description = models.TextField(blank=True, default="")

    class Meta:
        unique_together = ("tenant", "code")
        models.UniqueConstraint(Lower("code"), "tenant", name="uniq_taxcategory_code_ci_per_tenant")
        indexes = [
            models.Index(fields=["tenant", "code"]),
        ]
        verbose_name = "Tax category"
        verbose_name_plural = "Tax categories"
        ordering = ["code", "id"]


    @staticmethod
    def _norm_pct(value: Decimal) -> Decimal:
        """
        Accepts 0.0825 or 8.25 to mean 8.25%.
        Returns a normalized Decimal in [0, 1], quantized to 6 dp (like taxes app).
        """
        if value is None:
            return None
        v = Decimal(value)
        if v > 1:
            v = v / Decimal("100")
        if v < 0:
            v = Decimal("0")
        return v.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)  # :contentReference[oaicite:3]{index=3}

    def clean(self):
        super().clean()
        if self.rate is not None:
            self.rate = type(self)._norm_pct(self.rate)

    def save(self, *args, **kwargs):
        # Ensure normalization for all save paths (admin, API, fixtures)
        self.full_clean()
        return super().save(*args, **kwargs)
        

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
        models.UniqueConstraint(Lower("code"), "tenant", name="uniq_category_code_ci_per_tenant")
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


class Product(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    code = models.SlugField(blank=False)
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
        constraints = [
            models.UniqueConstraint(
                Lower("code"), "tenant",
                name="uniq_product_code_ci_per_tenant",
            ),
            models.UniqueConstraint(fields=["tenant", "name"], name="uniq_product_name_per_tenant"),
            models.CheckConstraint(check=~Q(code=""), name="product_code_not_blank"),
        ]
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
            models.UniqueConstraint(Lower("sku"), "tenant", name="uniq_variant_sku_ci_per_tenant"),
            models.UniqueConstraint(
                fields=["tenant", "barcode"],
                condition=Q(barcode__gt=""),
                name="uniq_variant_barcode_per_tenant_when_present",
            ),
            models.UniqueConstraint(Lower("name"), "product", name="uniq_variant_name_ci_per_product"),
            models.CheckConstraint(check=~Q(name=""), name="variant_name_not_blank"),
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