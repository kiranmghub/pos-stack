from django.db import models
from django.utils import timezone


class EmailTemplate(models.Model):
    """
    Logical email templates (e.g., 'signup_otp', 'welcome_tenant').
    Each can have multiple locale versions if needed.
    """
    name = models.CharField(max_length=100, unique=True)  # e.g. signup_otp
    subject = models.CharField(max_length=200)
    html_body = models.TextField()
    locale = models.CharField(max_length=8, default="en")
    version = models.IntegerField(default=1)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "-version"]

    def __str__(self):
        return f"{self.name} (v{self.version}, {self.locale})"


class EmailLog(models.Model):
    """
    Stores every attempt to send a transactional email.
    """
    to_address = models.EmailField()
    subject = models.CharField(max_length=200)
    template = models.ForeignKey(EmailTemplate, null=True, blank=True, on_delete=models.SET_NULL)
    payload = models.JSONField(default=dict, blank=True)  # rendered context, etc.
    status = models.CharField(
        max_length=20,
        choices=[
            ("queued", "Queued"),
            ("sent", "Sent"),
            ("failed", "Failed"),
        ],
        default="queued",
    )
    error_message = models.TextField(blank=True)
    provider_message_id = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["to_address"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.to_address} [{self.subject}] ({self.status})"
