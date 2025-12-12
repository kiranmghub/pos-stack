
from django.conf import settings
from django.db import models
from django.utils import timezone
from common.models import TimeStampedModel          # if you have it; else use models.Model
from common.roles import TenantRole


def tenant_doc_upload_path(instance, filename):
    """
    Generate upload path for tenant documents.
    Preserves original filename while organizing by tenant and ID.
    
    Format: tenants/<TENANT_CODE>/docs/<id>_<sanitized_original_name>.<ext>
    Falls back to tenants/<TENANT_CODE>/docs/<id>.<ext> if no valid filename provided.
    """
    import re
    from os.path import splitext
    
    # Extract extension
    ext = (filename.rsplit(".", 1)[-1] or "dat").lower()
    
    # Get tenant code
    tenant_code = getattr(getattr(instance, "tenant", None), "code", "T")
    
    # Get instance ID (may be None on first save, but will be set on file assignment)
    doc_id = getattr(instance, "id", None)
    
    # Sanitize original filename (remove extension, sanitize, limit length)
    original_name = splitext(filename)[0] if filename and "." in filename else filename or "document"
    # Sanitize: remove/replace unsafe characters
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", original_name)[:100]  # Limit to 100 chars
    
    if doc_id:
        # If we have an ID, use: tenants/<code>/docs/<id>_<safe_name>.<ext>
        return f"tenants/{tenant_code}/docs/{doc_id}_{safe_name}.{ext}"
    else:
        # Fallback (shouldn't happen with two-step save, but handle gracefully)
        return f"tenants/{tenant_code}/docs/temp_{safe_name}.{ext}"


def tenant_logo_upload_path(instance, filename):
    # tenants/<TENANT_CODE>/logo/<tenant_id>.<ext>
    ext = (filename.rsplit(".", 1)[-1] or "jpg").lower()
    tenant_code = getattr(instance, "code", None) or f"t{instance.id}"
    return f"tenants/{tenant_code}/logo/{instance.id}.{ext}"


class Tenant(TimeStampedModel):
    """
    Company / brand. Other tables FK to this (via 'tenant').
    """
    name = models.CharField(max_length=120)
    code = models.SlugField(unique=True)
    currency_code = models.CharField(max_length=3, default="USD")
    currency_symbol = models.CharField(max_length=4, blank=True, null=True)
    currency_precision = models.PositiveSmallIntegerField(default=2)
    country_code = models.CharField(max_length=2, blank=True, null=True)     # ISO alpha-2
    default_currency = models.CharField(max_length=3, default="USD")         # ISO 4217
    # business address
    business_street = models.CharField(max_length=255, blank=True, null=True)
    business_city = models.CharField(max_length=120, blank=True, null=True)
    business_state = models.CharField(max_length=120, blank=True, null=True)
    business_postal_code = models.CharField(max_length=32, blank=True, null=True)
    business_country_code = models.CharField(max_length=2, blank=True, null=True)  # ISO alpha-2
    # tax/registration IDs
    gst_number = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    pan_number = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    tan_id = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    ein = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    state_tax_id = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    business_license_number = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    # contacts/branding
    business_phone = models.CharField(max_length=32, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    logo_url = models.URLField(blank=True, null=True)
    logo_file = models.ImageField(upload_to=tenant_logo_upload_path, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    additional_details = models.JSONField(default=dict, blank=True)
    signup_completed_at = models.DateTimeField(blank=True, null=True)
    default_reorder_point = models.PositiveIntegerField(null=True, blank=True)
    allow_backorders = models.BooleanField(default=False, help_text="Allow reservations to exceed on_hand quantity")
    onboarding_status = models.CharField(
        max_length=32,
        default="not_started",
        choices=[
            ("not_started", "Not started"),
            ("basic_profile", "Basic profile complete"),
            ("store_setup", "Store setup"),
            ("live", "Live"),
        ],
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["gst_number"],
                condition=~models.Q(gst_number__isnull=True) & ~models.Q(gst_number=""),
                name="uniq_tenant_gst_number",
            ),
            models.UniqueConstraint(
                fields=["pan_number"],
                condition=~models.Q(pan_number__isnull=True) & ~models.Q(pan_number=""),
                name="uniq_tenant_pan_number",
            ),
            models.UniqueConstraint(
                fields=["tan_id"],
                condition=~models.Q(tan_id__isnull=True) & ~models.Q(tan_id=""),
                name="uniq_tenant_tan_id",
            ),
            models.UniqueConstraint(
                fields=["ein"],
                condition=~models.Q(ein__isnull=True) & ~models.Q(ein=""),
                name="uniq_tenant_ein",
            ),
            models.UniqueConstraint(
                fields=["state_tax_id"],
                condition=~models.Q(state_tax_id__isnull=True) & ~models.Q(state_tax_id=""),
                name="uniq_tenant_state_tax_id",
            ),
            models.UniqueConstraint(
                fields=["business_license_number"],
                condition=~models.Q(business_license_number__isnull=True) & ~models.Q(business_license_number=""),
                name="uniq_tenant_business_license_number",
            ),
            models.UniqueConstraint(
                fields=["email"],
                condition=~models.Q(email__isnull=True) & ~models.Q(email=""),
                name="uniq_tenant_email",
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def resolved_country(self) -> str:
        """
        Preferred country code; falls back to legacy business_country_code.
        """
        return (self.country_code or self.business_country_code or "").upper()

    @property
    def resolved_currency(self) -> str:
        """
        Preferred currency code; falls back to legacy currency_code.
        """
        return (self.default_currency or self.currency_code or "USD").upper()


class TenantDocManager(models.Manager):
    """Custom manager to exclude soft-deleted documents by default."""
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)
    
    def all_with_deleted(self):
        """Return all documents including deleted ones."""
        return super().get_queryset()
    
    def deleted_only(self):
        """Return only deleted documents."""
        return super().get_queryset().filter(deleted_at__isnull=False)


class TenantDoc(TimeStampedModel):
    """
    File attachments for a tenant (business documents, licenses, IDs, etc.).
    Supports soft delete via deleted_at field.
    """
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="documents")
    subject_user = models.ForeignKey(
        "tenants.TenantUser",
        on_delete=models.CASCADE,
        related_name="documents",
        null=True,
        blank=True,
        help_text="Optional: tie this doc to a specific person in the tenant",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="tenant_docs"
    )
    label = models.CharField(max_length=160)
    doc_type = models.CharField(max_length=80, blank=True, help_text="Optional tag like LICENSE, GST, PAN, OTHER")
    file = models.FileField(upload_to=tenant_doc_upload_path)
    description = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True, help_text="Soft delete timestamp")
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_tenant_docs",
        help_text="User who deleted this document"
    )

    # Use custom manager to filter deleted records
    objects = TenantDocManager()
    all_objects = models.Manager()  # Access to all records including deleted

    class Meta:
        ordering = ["-created_at", "label"]
        indexes = [
            models.Index(fields=["tenant", "doc_type"]),
            models.Index(fields=["tenant", "label"]),
            models.Index(fields=["tenant", "subject_user"]),
            models.Index(fields=["tenant", "deleted_at"]),  # For filtering deleted records
        ]
        verbose_name = "Tenant document"
        verbose_name_plural = "Tenant documents"

    def __str__(self):
        return f"{self.label} ({self.tenant.code})"
    
    def soft_delete(self, user=None):
        """Soft delete this document."""
        self.deleted_at = timezone.now()
        if user:
            self.deleted_by = user
        self.save(update_fields=["deleted_at", "deleted_by"])
    
    @property
    def is_deleted(self):
        """Check if document is soft-deleted."""
        return self.deleted_at is not None
    
    def is_linked_to_pos(self):
        """Check if this document is linked to any purchase orders."""
        return self.purchase_orders.exists()


class TenantUser(models.Model):
    """
    Membership binding a Django user to a Tenant, with a role.
    Optional store scoping inside that tenant.
    """
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tenant_memberships")
    role = models.CharField(max_length=20, choices=TenantRole.choices, default=TenantRole.MANAGER)
    is_active = models.BooleanField(default=True)
    # optional store scoping: if empty => all stores in tenant
    stores = models.ManyToManyField("stores.Store", blank=True, related_name="scoped_users")
    # personal details (owner/staff profile within the tenant)
    first_name = models.CharField(max_length=80, blank=True, null=True)
    middle_name = models.CharField(max_length=80, blank=True, null=True)
    last_name = models.CharField(max_length=80, blank=True, null=True)
    personal_phone = models.CharField(max_length=32, blank=True, null=True)
    personal_email = models.EmailField(blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    ID_DOC_TYPES = [
        ("PASSPORT", "Passport"),
        ("DRIVER_LICENSE", "Driver's License"),
        ("AADHAAR", "Aadhaar"),
        ("PAN", "PAN"),
        ("SSN", "SSN"),
        ("NATIONAL_ID", "National ID"),
        ("OTHER", "Other"),
    ]
    id_document_type = models.CharField(max_length=40, choices=ID_DOC_TYPES, blank=True, null=True)
    id_document_number = models.CharField(max_length=64, blank=True, null=True)
    address_line1 = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=120, blank=True, null=True)
    state = models.CharField(max_length=120, blank=True, null=True)
    postal_code = models.CharField(max_length=32, blank=True, null=True)
    country_code = models.CharField(max_length=2, blank=True, null=True)  # ISO alpha-2

    class Meta:
        unique_together = ("tenant", "user")
        ordering = ["id"]  # stable default for pagination
        indexes = [
            models.Index(fields=["tenant", "last_name"]),
            models.Index(fields=["tenant", "personal_phone"]),
            models.Index(fields=["tenant", "personal_email"]),
        ]

    def __str__(self):
        return f"{self.user} @ {self.tenant} ({self.role})"
