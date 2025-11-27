from django.db import models
from django.utils import timezone


class PendingSignup(models.Model):
    """
    Temporary record for multi-step signup before tenant/user creation.
    """
    email = models.EmailField(unique=True)
    country_code = models.CharField(max_length=2, blank=True)  # ISO alpha-2
    preferred_currency = models.CharField(max_length=3, blank=True)  # ISO 4217
    is_email_verified = models.BooleanField(default=False)
    data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.email} (verified={self.is_email_verified})"


class SignupAudit(models.Model):
    """
    Lightweight audit log for signup actions.
    """
    ACTION_CHOICES = [
        ("start", "Start"),
        ("verify_ok", "Verify OK"),
        ("verify_fail", "Verify Fail"),
        ("complete", "Complete"),
    ]
    email = models.EmailField()
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email", "action"]),
        ]

    def __str__(self):
        return f"{self.email} [{self.action}]"
