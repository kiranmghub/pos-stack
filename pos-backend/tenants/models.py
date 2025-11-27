
from django.conf import settings
from django.db import models
from common.models import TimeStampedModel          # if you have it; else use models.Model
from common.roles import TenantRole


def tenant_doc_upload_path(instance, filename):
    # tenants/<TENANT_CODE>/docs/<id>.<ext>
    ext = (filename.rsplit(".", 1)[-1] or "dat").lower()
    tenant_code = getattr(getattr(instance, "tenant", None), "code", "T")
    return f"tenants/{tenant_code}/docs/{instance.id}.{ext}"


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
    description = models.TextField(blank=True, null=True)
    additional_details = models.JSONField(default=dict, blank=True)
    signup_completed_at = models.DateTimeField(blank=True, null=True)
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


class TenantDoc(TimeStampedModel):
    """
    File attachments for a tenant (business documents, licenses, IDs, etc.).
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

    class Meta:
        ordering = ["-created_at", "label"]
        indexes = [
            models.Index(fields=["tenant", "doc_type"]),
            models.Index(fields=["tenant", "label"]),
            models.Index(fields=["tenant", "subject_user"]),
        ]
        verbose_name = "Tenant document"
        verbose_name_plural = "Tenant documents"

    def __str__(self):
        return f"{self.label} ({self.tenant.code})"


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
