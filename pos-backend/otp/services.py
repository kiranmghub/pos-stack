import hashlib
import secrets
from datetime import timedelta
from typing import Optional

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django.conf import settings

from emails.services import send_templated_email
from .models import OtpRequest, OtpConfig, OtpAudit

OTP_TTL_MINUTES = 10
OTP_CODE_LENGTH = 6
OTP_MAX_ATTEMPTS = 5

# Configurable limits (see core/settings.py for env defaults)
OTP_RATE_SEND_PER_EMAIL = getattr(settings, "OTP_RATE_SEND_PER_EMAIL", 3)
OTP_RATE_SEND_EMAIL_WINDOW = getattr(settings, "OTP_RATE_SEND_EMAIL_WINDOW", 300)
OTP_RATE_SEND_PER_IP = getattr(settings, "OTP_RATE_SEND_PER_IP", 10)
OTP_RATE_SEND_IP_WINDOW = getattr(settings, "OTP_RATE_SEND_IP_WINDOW", 900)
OTP_RATE_VERIFY_PER_EMAIL = getattr(settings, "OTP_RATE_VERIFY_PER_EMAIL", 5)
OTP_RATE_VERIFY_EMAIL_WINDOW = getattr(settings, "OTP_RATE_VERIFY_EMAIL_WINDOW", 300)


def _hash_code(code: str, salt: str) -> str:
    return hashlib.sha256((code + salt).encode("utf-8")).hexdigest()


def _rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """Returns True if over limit."""
    current = cache.get(key)
    if current is None:
        cache.set(key, 1, timeout=window_seconds)
        return False
    current = current + 1
    cache.set(key, current, timeout=window_seconds)
    return current > limit


def _get_config(country_code: Optional[str]) -> dict:
    code = (country_code or "").upper()
    cfg = None
    if code:
        cfg = (
            OtpConfig.objects.filter(country_code=code, is_active=True).first()
            or OtpConfig.objects.filter(country_code=code.lower(), is_active=True).first()
        )
    if not cfg:
        cfg = OtpConfig.objects.filter(country_code="", is_active=True).first()
    return {
        "send_per_email": cfg.send_per_email if cfg else OTP_RATE_SEND_PER_EMAIL,
        "send_email_window": cfg.send_email_window if cfg else OTP_RATE_SEND_EMAIL_WINDOW,
        "send_per_ip": cfg.send_per_ip if cfg else OTP_RATE_SEND_PER_IP,
        "send_ip_window": cfg.send_ip_window if cfg else OTP_RATE_SEND_IP_WINDOW,
        "verify_per_email": cfg.verify_per_email if cfg else OTP_RATE_VERIFY_PER_EMAIL,
        "verify_email_window": cfg.verify_email_window if cfg else OTP_RATE_VERIFY_EMAIL_WINDOW,
    }


def generate_otp(email: str, purpose: str, ip: Optional[str], ua: Optional[str], country_code: Optional[str] = None) -> None:
    cfg = _get_config(country_code)
    # Rate limit by email and IP using config
    if _rate_limit(f"otp:send:email:{email}", cfg["send_per_email"], cfg["send_email_window"]):
        raise ValueError("Too many OTP requests for this email. Please wait a few minutes.")
    if ip and _rate_limit(f"otp:send:ip:{ip}", cfg["send_per_ip"], cfg["send_ip_window"]):
        raise ValueError("Too many OTP requests from this IP. Please wait a few minutes.")

    code = f"{secrets.randbelow(10**OTP_CODE_LENGTH):0{OTP_CODE_LENGTH}d}"
    salt = secrets.token_hex(8)
    code_hash = _hash_code(code, salt)
    expires_at = timezone.now() + timedelta(minutes=OTP_TTL_MINUTES)

    with transaction.atomic():
        OtpRequest.objects.filter(
            email=email, purpose=purpose, expires_at__lt=timezone.now()
        ).delete()

        OtpRequest.objects.create(
            email=email,
            purpose=purpose,
            code_hash=code_hash,
            salt=salt,
            expires_at=expires_at,
            max_attempts=OTP_MAX_ATTEMPTS,
            ip_address=ip,
            user_agent=ua or "",
        )

    send_templated_email(
        name="signup_otp",
        to=email,
        context={"code": code, "expires_minutes": OTP_TTL_MINUTES},
    )


class OtpVerificationResult:
    def __init__(self, ok: bool, reason: Optional[str] = None, status_code: int = 400):
        self.ok = ok
        self.reason = reason
        self.status_code = status_code


def verify_otp(email: str, purpose: str, code: str) -> OtpVerificationResult:
    cfg = _get_config(None)
    # Rate limit verification attempts per email
    if _rate_limit(f"otp:verify:email:{email}", cfg["verify_per_email"], cfg["verify_email_window"]):
        OtpAudit.objects.create(email=email, purpose=purpose, action="verify_failed", reason="rate_limited")
        return OtpVerificationResult(False, "Too many attempts. Please request a new code.", status_code=429)

    now = timezone.now()
    otp = (
        OtpRequest.objects.filter(
            email=email,
            purpose=purpose,
            is_used=False,
            expires_at__gte=now,
        )
        .order_by("-created_at")
        .first()
    )
    if not otp:
        OtpAudit.objects.create(email=email, purpose=purpose, action="verify_failed", reason="not_found_or_expired")
        return OtpVerificationResult(False, "OTP not found or expired.")

    if otp.attempts >= otp.max_attempts:
        OtpAudit.objects.create(email=email, purpose=purpose, action="verify_failed", reason="attempts_exceeded")
        return OtpVerificationResult(False, "Too many attempts. Please request a new code.")

    expected_hash = _hash_code(code, otp.salt)
    if otp.code_hash != expected_hash:
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        OtpAudit.objects.create(email=email, purpose=purpose, action="verify_failed", reason="invalid_code")
        return OtpVerificationResult(False, "Invalid code.")

    otp.is_used = True
    otp.save(update_fields=["is_used"])
    return OtpVerificationResult(True)
