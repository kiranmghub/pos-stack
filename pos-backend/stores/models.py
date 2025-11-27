# pos-backend/stores/models.py
from django.db import models
from common.models import TimeStampedModel
from django.utils import timezone
from django.contrib.auth.hashers import make_password, check_password
import uuid
from typing import Optional


class Store(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=120)
    code = models.SlugField()
    timezone = models.CharField(max_length=64, blank=True, default="")
    region = models.CharField(max_length=100, blank=True, default="")

    # normalized, queryable fields
    street = models.CharField(max_length=200)
    city = models.CharField(max_length=100, db_index=True)       # ← group/filter
    state = models.CharField(max_length=100, db_index=True)
    postal_code = models.CharField(max_length=20, db_index=True)
    country = models.CharField(max_length=50, default="USA", db_index=True)
    is_active = models.BooleanField(default=True)
    # optional extras you won’t query often
    address_meta = models.JSONField(default=dict, blank=True)

    # Contact details
    phone_number = models.CharField(max_length=20, blank=True, default="")
    mobile_number = models.CharField(max_length=20, blank=True, default="")
    fax_number = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    contact_person = models.CharField(max_length=120, blank=True, default="")

    # Store metadata
    landmark = models.CharField(max_length=200, blank=True, default="")
    description = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    # Coordinates
    geo_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    geo_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    # Store hours
    opening_time = models.TimeField(null=True, blank=True)
    closing_time = models.TimeField(null=True, blank=True)

    # Business/legal
    tax_id = models.CharField(max_length=50, blank=True, default="")
    is_primary = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "code"],
                name="unique_store_code_per_tenant")
            ,
            models.UniqueConstraint(
                fields=["tenant"],
                condition=models.Q(is_primary=True),
                name="unique_primary_store_per_tenant"
            )
        ]
        ordering = ["code", "id"]
        indexes = [
            models.Index(fields=["tenant", "code"]),
            models.Index(fields=["tenant", "is_primary"]),
            models.Index(fields=["country", "region", "state"]),
        ]


    def __str__(self):
        return f"{self.tenant.code}:{self.code}"


class Register(TimeStampedModel):
    store = models.ForeignKey("stores.Store", on_delete=models.CASCADE)
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, null=False, blank=False)
    name = models.CharField(max_length=120, blank=True, default="")
    code = models.SlugField()
    hardware_profile = models.JSONField(default=dict)
    access_pin_hash = models.CharField(max_length=256, null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    locked_until = models.DateTimeField(null=True, blank=True)
    settings = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    # (new) simple rate-limit helper; optional but handy
    failed_attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        # unique_together = ("code", "store")
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "code"],
                name="uniq_register_code_per_tenant")
        ]
        ordering = ["code", "id"]
        indexes = [
            models.Index(fields=["store", "code"]),         # lookups by code within a store
            models.Index(fields=["is_active", "store"]),    # active registers per store
            models.Index(fields=["locked_until"]),          # cleanup jobs / monitoring
            models.Index(fields=["tenant", "code"]),        # lookups by code within a tenant
        ]

    def __str__(self):
        return f"{self.store.code}:{self.code}"

    # ---- PIN helpers (use Django's password hasher) ----
    def set_pin(self, raw_pin: Optional[str]):
        """
        Set or clear the register PIN. Use a numeric string (e.g. '123456').
        Passing None or '' clears the PIN.
        """
        if not raw_pin:
            self.access_pin_hash = None
            return
        self.access_pin_hash = make_password(raw_pin)

    def check_pin(self, raw_pin: str) -> bool:
        if not self.access_pin_hash:
            return False
        return check_password(raw_pin, self.access_pin_hash)

    # (optional) quick lock helpers
    def lock_for(self, seconds: int = 300):
        self.locked_until = timezone.now() + timezone.timedelta(seconds=seconds)
        self.failed_attempts = 0

    def clear_lock(self):
        self.locked_until = None
        self.failed_attempts = 0



class RegisterSession(TimeStampedModel):
    """
    Represents an active (or historical) session for a register.
    Useful for audits, revocation, and monitoring concurrently signed-in devices.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="register_sessions")
    register = models.ForeignKey("stores.Register", on_delete=models.CASCADE, related_name="sessions")

    # lifecycle
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    # provenance / device
    created_by_user = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="opened_register_sessions")
    device_fingerprint = models.CharField(max_length=255, blank=True, default="")
    user_agent = models.TextField(blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    # misc
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "register"]),
            models.Index(fields=["expires_at"]),
            models.Index(fields=["revoked_at"]),
        ]

    def __str__(self):
        state = "revoked" if self.revoked_at else "active"
        return f"RegisterSession({self.register.code}, {state})"

    @property
    def is_active(self) -> bool:
        if self.revoked_at:
            return False
        if self.expires_at and self.expires_at <= timezone.now():
            return False
        return True

    def revoke(self, reason: Optional[str] = None):
        self.revoked_at = timezone.now()
        if reason:
            self.notes = (self.notes + "\n" if self.notes else "") + f"[revoked] {reason}"
