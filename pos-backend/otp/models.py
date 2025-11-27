from django.db import models
from django.utils import timezone


class OtpRequest(models.Model):
    PURPOSE_SIGNUP = "signup"
    PURPOSE_LOGIN = "login"
    PURPOSE_SENSITIVE = "sensitive_action"

    PURPOSE_CHOICES = [
        (PURPOSE_SIGNUP, "Signup"),
        (PURPOSE_LOGIN, "Login"),
        (PURPOSE_SENSITIVE, "Sensitive action"),
    ]

    email = models.EmailField()
    purpose = models.CharField(max_length=32, choices=PURPOSE_CHOICES)
    code_hash = models.CharField(max_length=128)
    salt = models.CharField(max_length=32)
    expires_at = models.DateTimeField()
    attempts = models.IntegerField(default=0)
    max_attempts = models.IntegerField(default=5)
    is_used = models.BooleanField(default=False)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=["email", "purpose"]),
            models.Index(fields=["expires_at"]),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.email} [{self.purpose}]"


class OtpConfig(models.Model):
    """
    Admin-configurable OTP rate limits (optionally per country).
    Use a row with country_code="" as global default; country-specific rows override.
    """
    country_code = models.CharField(max_length=2, blank=True, help_text="ISO alpha-2; leave blank for global default")
    is_active = models.BooleanField(default=True)

    send_per_email = models.PositiveIntegerField(default=3)
    send_email_window = models.PositiveIntegerField(default=300, help_text="Seconds")
    send_per_ip = models.PositiveIntegerField(default=10)
    send_ip_window = models.PositiveIntegerField(default=900, help_text="Seconds")
    verify_per_email = models.PositiveIntegerField(default=5)
    verify_email_window = models.PositiveIntegerField(default=300, help_text="Seconds")

    class Meta:
        ordering = ["country_code"]
        unique_together = ("country_code", "is_active")

    def __str__(self):
        return f"OTP config ({self.country_code or 'global'})"


class OtpAudit(models.Model):
    ACTION_CHOICES = [
        ("verify_failed", "Verify failed"),
    ]

    email = models.EmailField()
    purpose = models.CharField(max_length=32)
    action = models.CharField(max_length=32, choices=ACTION_CHOICES)
    reason = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email", "purpose"]),
            models.Index(fields=["action"]),
        ]

    def __str__(self):
        return f"{self.email}:{self.action}"
