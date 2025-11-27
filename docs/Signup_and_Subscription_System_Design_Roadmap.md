# Signup & Subscription System Design

**Repository context:** `kiranmghub/pos-stack`  
**Backend root:** `pos-backend/pos-backend`  
**Frontend root:** `pos-frontend/src`  
**Goal:** Design a production-grade, *free / OSS-first* signup + onboarding + subscription system for a **multi-tenant**, **multi-currency** POS application.

This document is meant to be consumed by an AI agent and implemented in **small, safe increments**. Each phase below is designed to be self-contained and shippable.

---

## 0. High-Level Overview

We will add the following major capabilities:

1. **Geo-aware, multi-currency landing & signup flow**
2. **Global email system** (templates + logs) using free SMTP / console backend
3. **OTP verification** (email-first, pluggable for SMS later)
4. **Subscription plan architecture** (multi-currency, multi-country, versioned)
5. **Coupon/discount support during signup** leveraging existing `discounts` app
6. **Backend model extensions** to `tenants` and others
7. **Frontend signup/onboarding UX** integrated with existing POS dashboard

We will **not** integrate a paid payment processor right now. The design, however, is **ready** for Stripe/Razorpay/etc. to be plugged in later.

---

## 1. New & Existing Apps

### 1.1 Existing apps we will leverage

Do **not** create new apps with overlapping responsibility:

- `tenants` – multi-tenant core (`Tenant`, `TenantUser`)
- `customers` – customer data, spend/returns, CRM
- `orders` – sales, returns, payments
- `loyalty` – loyalty program, points, transactions
- `discounts` – promotions, discounts, coupons for POS sales
- `catalog`, `pricing`, `inventory`, `stores`, `pos`, `payments`, `analytics`, etc.

### 1.2 New backend apps to add

All new apps live under `pos-backend/pos-backend/`:

1. `emails` – global email templates & logging
2. `otp` – OTP generation/validation + security controls
3. `subscriptions` – SaaS plans & tenant subscriptions
4. `signup` – orchestration for signup + onboarding flow

Each app will have:

- `models.py`
- `serializers.py`
- `views.py`
- `urls.py`
- `services.py` (where useful)
- `tests.py`

---

## 2. Phased Implementation Roadmap

We want small, incremental steps. Each phase should be a separate PR.

### Phase 1 – Emails & OTP (foundations)

- Implement `emails` app
- Implement `otp` app with email-based OTP
- Add basic geo/meta endpoint for currency suggestion
- No visible signup yet – only APIs

### Phase 2 – Basic Signup Flow (email + OTP + tenant creation)

- Implement `signup` app with:
  - `signup/start` (email, region, OTP request)
  - `signup/verify-otp`
  - `signup/complete-profile` (tenant + admin user)
- Add minimal frontend screens for these steps
- No subscriptions yet; default to free “trial” subscription stub

### Phase 3 – Subscription Plans & Tenant Subscriptions

- Implement `subscriptions` app:
  - `Plan`, `PlanPrice`, `Subscription`
- APIs for listing plans, selecting plan for tenant
- Integrate with signup flow (Phase 2)
- No actual payment processor; treat subscriptions as “trialing/active” with manual/zero-priced flows

### Phase 4 – Coupons & Signup Discounts

- Extend existing `discounts` app for signup-specific coupons
- Add coupon entry to plan selection UI
- Apply discount to subscription amount / metadata

### Phase 5 – Onboarding Wizard

- After successful signup+plan:
  - Onboarding steps for store setup, taxes, basic configuration
- Extend `Tenant` with onboarding fields & statuses
- Frontend onboarding wizard under `/onboarding`

### Phase 6 – Harden: Security, Rate Limits, Observability

- Rate limiting & brute-force protection on OTP & signup
- Audit logging for sensitive actions
- Better error messages, metrics, and admin dashboards

---

## 3. Phase 1 – Emails & OTP

### 3.1 `emails` app

#### 3.1.1 Models

`pos-backend/pos-backend/emails/models.py`

```python
from django.db import models
from django.utils import timezone

class EmailTemplate(models.Model):
    """
    Logical email templates (e.g. 'signup_otp', 'welcome_tenant').
    Each can have multiple locale-specific versions in the future if needed.
    """
    name = models.CharField(max_length=100, unique=True)  # e.g. 'signup_otp'
    subject = models.CharField(max_length=200)
    html_body = models.TextField()
    locale = models.CharField(max_length=8, default="en")
    version = models.IntegerField(default=1)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class EmailLog(models.Model):
    """
    Stores every attempt to send a transactional email.
    """
    to_address = models.EmailField()
    subject = models.CharField(max_length=200)
    template = models.ForeignKey(
        EmailTemplate, null=True, blank=True, on_delete=models.SET_NULL
    )
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
3.1.2 Settings (free / OSS)
In core/settings.py:

python
Copy code
# Dev: log emails to console
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Later for prod, switch to SMTP (e.g., your own Postfix or free provider)
# EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
# EMAIL_HOST = ...
# EMAIL_PORT = ...
# EMAIL_HOST_USER = ...
# EMAIL_HOST_PASSWORD = ...
# EMAIL_USE_TLS = True
# DEFAULT_FROM_EMAIL = "no-reply@yourdomain.com"
3.1.3 Services
pos-backend/pos-backend/emails/services.py

python
Copy code
import logging
from django.core.mail import EmailMultiAlternatives
from django.template import Template, Context
from django.utils import timezone

from .models import EmailTemplate, EmailLog

logger = logging.getLogger(__name__)

def render_template(template: EmailTemplate, context: dict) -> str:
    tpl = Template(template.html_body)
    return tpl.render(Context(context))


def send_templated_email(name: str, to: str, context: dict, locale: str = "en") -> EmailLog:
    # 1. Pick template
    try:
        template = (
            EmailTemplate.objects.filter(name=name, locale=locale, is_active=True)
            .order_by("-version")
            .first()
        )
        if not template:
            raise EmailTemplate.DoesNotExist()
    except EmailTemplate.DoesNotExist:
        # Log and fail gracefully
        logger.error("Email template %s (%s) not found", name, locale)
        log = EmailLog.objects.create(
            to_address=to,
            subject=f"[MISSING TEMPLATE] {name}",
            status="failed",
            payload={"context": context},
        )
        return log

    # 2. Render HTML
    html_body = render_template(template, context)

    # 3. Create log
    log = EmailLog.objects.create(
        to_address=to,
        subject=template.subject,
        template=template,
        status="queued",
        payload={"context": context},
    )

    # 4. Send via Django email backend
    try:
        msg = EmailMultiAlternatives(
            subject=template.subject,
            body=html_body,  # can also set plain-text alt if needed
            to=[to],
        )
        msg.attach_alternative(html_body, "text/html")
        msg.send(fail_silently=False)

        log.status = "sent"
        log.sent_at = timezone.now()
        log.save(update_fields=["status", "sent_at"])
    except Exception as exc:
        logger.exception("Failed to send email to %s", to)
        log.status = "failed"
        log.error_message = str(exc)
        log.save(update_fields=["status", "error_message"])

    return log
Incremental task:

Add app emails

Add models + migrations

Configure EMAIL_BACKEND

Seed templates for signup_otp and welcome_tenant via Django admin

3.2 otp app
3.2.1 Models
pos-backend/pos-backend/otp/models.py

python
Copy code
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
3.2.2 Services
otp/services.py

python
Copy code
import secrets
import hashlib
from datetime import timedelta
from django.utils import timezone
from django.db import transaction
from .models import OtpRequest
from emails.services import send_templated_email

OTP_TTL_MINUTES = 10
OTP_CODE_LENGTH = 6
OTP_MAX_ATTEMPTS = 5

def _hash_code(code: str, salt: str) -> str:
    return hashlib.sha256((code + salt).encode("utf-8")).hexdigest()


def generate_otp(email: str, purpose: str, ip: str | None, ua: str | None) -> None:
    """
    Create a new OTP, send via email.
    """
    code = f"{secrets.randbelow(10**OTP_CODE_LENGTH):0{OTP_CODE_LENGTH}d}"
    salt = secrets.token_hex(8)
    code_hash = _hash_code(code, salt)

    expires_at = timezone.now() + timedelta(minutes=OTP_TTL_MINUTES)

    with transaction.atomic():
        # Optionally: clean up expired or used OTPs for this email+purpose
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

    # Send OTP via email template
    send_templated_email(
        name="signup_otp",
        to=email,
        context={"code": code, "expires_minutes": OTP_TTL_MINUTES},
    )


class OtpVerificationResult:
    def __init__(self, ok: bool, reason: str | None = None):
        self.ok = ok
        self.reason = reason


def verify_otp(email: str, purpose: str, code: str) -> OtpVerificationResult:
    now = timezone.now()
    try:
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
            return OtpVerificationResult(False, "OTP not found or expired.")
    except OtpRequest.DoesNotExist:
        return OtpVerificationResult(False, "OTP not found or expired.")

    if otp.attempts >= otp.max_attempts:
        return OtpVerificationResult(False, "Too many attempts. Please request a new code.")

    expected_hash = _hash_code(code, otp.salt)
    if otp.code_hash != expected_hash:
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        return OtpVerificationResult(False, "Invalid code.")

    otp.is_used = True
    otp.save(update_fields=["is_used"])
    return OtpVerificationResult(True)
3.2.3 API Views (DRF)
otp/serializers.py:

python
Copy code
from rest_framework import serializers

class OtpRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    purpose = serializers.ChoiceField(
        choices=["signup", "login", "sensitive_action"]
    )

class OtpVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    purpose = serializers.ChoiceField(
        choices=["signup", "login", "sensitive_action"]
    )
    code = serializers.CharField(max_length=8)
otp/views.py:

python
Copy code
from rest_framework import generics, status
from rest_framework.response import Response
from .serializers import OtpRequestSerializer, OtpVerifySerializer
from .services import generate_otp, verify_otp, OtpVerificationResult

class OtpRequestView(generics.GenericAPIView):
    serializer_class = OtpRequestSerializer
    authentication_classes = []  # public
    permission_classes = []

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        purpose = serializer.validated_data["purpose"]

        ip = request.META.get("REMOTE_ADDR")  # can be extended
        ua = request.META.get("HTTP_USER_AGENT")

        generate_otp(email=email, purpose=purpose, ip=ip, ua=ua)

        return Response({"ok": True})


class OtpVerifyView(generics.GenericAPIView):
    serializer_class = OtpVerifySerializer
    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        purpose = serializer.validated_data["purpose"]
        code = serializer.validated_data["code"]

        result: OtpVerificationResult = verify_otp(email, purpose, code)
        if not result.ok:
            return Response(
                {"ok": False, "detail": result.reason},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"ok": True})
otp/urls.py:

python
Copy code
from django.urls import path
from .views import OtpRequestView, OtpVerifyView

urlpatterns = [
    path("otp/request", OtpRequestView.as_view(), name="otp-request"),
    path("otp/verify", OtpVerifyView.as_view(), name="otp-verify"),
]
Incremental task:

Add otp app with models, services, API.

Wire routes under /api/v1/otp/....

Test OTP workflow via Postman or frontend dev console.

4. Phase 2 – Basic Signup Flow (Tenant + Admin via OTP)
4.1 Extend tenants.Tenant
pos-backend/pos-backend/tenants/models.py – add fields:

python
Copy code
class Tenant(models.Model):
    ...
    country_code = models.CharField(max_length=2, blank=True)     # "US", "IN"
    default_currency = models.CharField(max_length=3, blank=True) # "USD", "INR"
    signup_completed_at = models.DateTimeField(null=True, blank=True)
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
Migration: Add default blank values for existing tenants.

4.2 signup app – orchestrating signup steps
signup/models.py (optional, lightweight):

python
Copy code
from django.db import models
from django.utils import timezone

class PendingSignup(models.Model):
    """
    Temporary record tying OTP/email to pre-tenant context.
    Helps during multi-step signup before the tenant exists.
    """
    email = models.EmailField(unique=True)
    country_code = models.CharField(max_length=2, blank=True)
    preferred_currency = models.CharField(max_length=3, blank=True)
    is_email_verified = models.BooleanField(default=False)

    # Additional metadata for future:
    data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
4.2.1 Serializers
signup/serializers.py

python
Copy code
from rest_framework import serializers

class SignupStartSerializer(serializers.Serializer):
    email = serializers.EmailField()
    country_code = serializers.CharField(max_length=2, required=False, allow_blank=True)
    preferred_currency = serializers.CharField(max_length=3, required=False, allow_blank=True)


class SignupVerifyOtpSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=8)


class SignupCompleteProfileSerializer(serializers.Serializer):
    email = serializers.EmailField()
    tenant_name = serializers.CharField(max_length=160)
    admin_first_name = serializers.CharField(max_length=80)
    admin_last_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    admin_password = serializers.CharField(write_only=True)
4.2.2 Views
signup/views.py

python
Copy code
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import generics, status
from rest_framework.response import Response

from tenants.models import Tenant, TenantUser
from otp.services import generate_otp, verify_otp
from otp.services import OtpVerificationResult
from .models import PendingSignup
from .serializers import (
    SignupStartSerializer,
    SignupVerifyOtpSerializer,
    SignupCompleteProfileSerializer,
)

User = get_user_model()


class SignupStartView(generics.GenericAPIView):
    serializer_class = SignupStartSerializer
    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"]
        country = s.validated_data.get("country_code") or ""
        currency = s.validated_data.get("preferred_currency") or ""

        ip = request.META.get("REMOTE_ADDR")
        ua = request.META.get("HTTP_USER_AGENT")

        # Create or update PendingSignup
        ps, _created = PendingSignup.objects.update_or_create(
            email=email,
            defaults={
                "country_code": country,
                "preferred_currency": currency,
            },
        )

        generate_otp(email=email, purpose="signup", ip=ip, ua=ua)
        return Response({"ok": True})
    

class SignupVerifyOtpView(generics.GenericAPIView):
    serializer_class = SignupVerifyOtpSerializer
    authentication_classes = []
    permission_classes = []

    def post(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"]
        code = s.validated_data["code"]

        result: OtpVerificationResult = verify_otp(email=email, purpose="signup", code=code)
        if not result.ok:
            return Response({"ok": False, "detail": result.reason},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            ps = PendingSignup.objects.get(email=email)
        except PendingSignup.DoesNotExist:
            return Response(
                {"ok": False, "detail": "Signup session not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ps.is_email_verified = True
        ps.save(update_fields=["is_email_verified"])
        return Response({"ok": True})


class SignupCompleteProfileView(generics.GenericAPIView):
    serializer_class = SignupCompleteProfileSerializer
    authentication_classes = []
    permission_classes = []

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"]
        tenant_name = s.validated_data["tenant_name"]
        admin_first_name = s.validated_data["admin_first_name"]
        admin_last_name = s.validated_data.get("admin_last_name") or ""
        admin_password = s.validated_data["admin_password"]

        try:
            ps = PendingSignup.objects.get(email=email, is_email_verified=True)
        except PendingSignup.DoesNotExist:
            return Response(
                {"ok": False, "detail": "Email not verified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create tenant
        tenant = Tenant.objects.create(
            name=tenant_name,
            country_code=ps.country_code,
            default_currency=ps.preferred_currency or "USD",  # fallback
            onboarding_status="basic_profile",
        )

        # Create admin user
        user = User.objects.create_user(
            username=email,
            email=email,
            first_name=admin_first_name,
            last_name=admin_last_name,
            password=admin_password,
        )
        TenantUser.objects.create(
            tenant=tenant,
            user=user,
            role="owner",  # or whatever roles model you use
        )

        tenant.signup_completed_at = timezone.now()
        tenant.save(update_fields=["signup_completed_at"])

        # Optionally delete the pending signup
        ps.delete()

        # Return token / login hint (actual auth integration may already exist)
        return Response({
            "ok": True,
            "tenant_id": tenant.id,
            "user_id": user.id,
            # frontend can now redirect to login and/or start onboarding
        })
signup/urls.py:

python
Copy code
from django.urls import path
from .views import SignupStartView, SignupVerifyOtpView, SignupCompleteProfileView

urlpatterns = [
    path("signup/start", SignupStartView.as_view(), name="signup-start"),
    path("signup/verify-otp", SignupVerifyOtpView.as_view(), name="signup-verify-otp"),
    path("signup/complete-profile", SignupCompleteProfileView.as_view(), name="signup-complete-profile"),
]
Incremental task:

Implement PendingSignup model and signup views.

Hook URLs under /api/v1/signup/....

Add minimal frontend forms for:

Step 1: enter email, country, currency → call signup/start → OTP email

Step 2: enter OTP → signup/verify-otp

Step 3: tenant name + admin details → signup/complete-profile

5. Phase 3 – Subscription Plans & Tenant Subscriptions
Now we introduce the subscriptions app and integrate it into signup.

5.1 Models
subscriptions/models.py:

python
Copy code
from django.db import models
from django.utils import timezone
from tenants.models import Tenant

class Plan(models.Model):
    code = models.CharField(max_length=50, unique=True)  # e.g. 'POS_BASIC'
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    max_stores = models.IntegerField(default=1)
    max_users = models.IntegerField(default=3)
    max_registers = models.IntegerField(default=3)

    features = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class PlanPrice(models.Model):
    BILLING_MONTHLY = "monthly"
    BILLING_YEARLY = "yearly"

    BILLING_CHOICES = [
        (BILLING_MONTHLY, "Monthly"),
        (BILLING_YEARLY, "Yearly"),
    ]

    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name="prices")
    currency = models.CharField(max_length=3) # 'USD','INR'
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    billing_period = models.CharField(max_length=10, choices=BILLING_CHOICES)

    country_code = models.CharField(max_length=2, blank=True)  # if set, country-specific pricing
    version = models.IntegerField(default=1)
    valid_from = models.DateTimeField(default=timezone.now)
    valid_to = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [
            ("plan", "currency", "billing_period", "country_code", "version"),
        ]


class Subscription(models.Model):
    STATUS_TRIALING = "trialing"
    STATUS_ACTIVE = "active"
    STATUS_CANCELED = "canceled"
    STATUS_PAST_DUE = "past_due"

    STATUS_CHOICES = [
        (STATUS_TRIALING, "Trialing"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_CANCELED, "Canceled"),
        (STATUS_PAST_DUE, "Past due"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="subscriptions")
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    currency = models.CharField(max_length=3)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES)

    trial_end_at = models.DateTimeField(null=True, blank=True)
    current_period_start = models.DateTimeField(default=timezone.now)
    current_period_end = models.DateTimeField()

    is_auto_renew = models.BooleanField(default=True)
    price_version = models.IntegerField(default=1)

    # For future payment provider integration:
    external_provider = models.CharField(max_length=32, blank=True)
    external_subscription_id = models.CharField(max_length=128, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
5.2 Services
subscriptions/services.py:

python
Copy code
from datetime import timedelta
from django.utils import timezone
from .models import Plan, PlanPrice, Subscription

def get_plan_prices_for_country(country: str | None, currency: str | None) -> list[PlanPrice]:
    """
    Return active PlanPrice rows filtered by region & currency.
    Simple logic:
    - If country is set and there is country-specific price, use it.
    - Otherwise, use global prices (country_code = '') for that currency.
    """
    qs = PlanPrice.objects.filter(valid_to__isnull=True, plan__is_active=True)
    if currency:
        qs = qs.filter(currency=currency)

    if country:
        region_specific = qs.filter(country_code=country)
        if region_specific.exists():
            return list(region_specific)
    return list(qs.filter(country_code=""))


def create_trial_subscription(tenant, plan: Plan, price: PlanPrice, trial_days: int = 14) -> Subscription:
    now = timezone.now()
    trial_end = now + timedelta(days=trial_days)

    sub = Subscription.objects.create(
        tenant=tenant,
        plan=plan,
        currency=price.currency,
        amount=price.amount,
        status=Subscription.STATUS_TRIALING,
        trial_end_at=trial_end,
        current_period_start=now,
        current_period_end=trial_end,
        is_auto_renew=True,
        price_version=price.version,
    )
    return sub
5.3 APIs
subscriptions/serializers.py:

python
Copy code
from rest_framework import serializers
from .models import Plan, PlanPrice, Subscription

class PlanPriceSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    plan_code = serializers.CharField(source="plan.code", read_only=True)
    description = serializers.CharField(source="plan.description", read_only=True)

    class Meta:
        model = PlanPrice
        fields = [
            "id", "plan_name", "plan_code", "description",
            "currency", "amount", "billing_period", "country_code", "version",
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_code = serializers.CharField(source="plan.code", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id", "tenant", "plan_code", "plan_name",
            "currency", "amount", "status",
            "trial_end_at", "current_period_start", "current_period_end",
            "is_auto_renew", "price_version",
        ]
subscriptions/views.py:

python
Copy code
from rest_framework import generics, permissions
from rest_framework.response import Response
from .models import PlanPrice, Plan
from .serializers import PlanPriceSerializer, SubscriptionSerializer
from .services import get_plan_prices_for_country, create_trial_subscription
from tenants.models import Tenant

class PlanListView(generics.GenericAPIView):
    serializer_class = PlanPriceSerializer
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        country = request.query_params.get("country")
        currency = request.query_params.get("currency")
        prices = get_plan_prices_for_country(country, currency)
        serializer = self.get_serializer(prices, many=True)
        return Response(serializer.data)


class TenantCreateTrialSubscriptionView(generics.GenericAPIView):
    serializer_class = SubscriptionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        tenant_id = request.data.get("tenant_id")
        plan_code = request.data.get("plan_code")
        country = request.data.get("country")
        currency = request.data.get("currency")

        tenant = Tenant.objects.get(id=tenant_id)
        plan = Plan.objects.get(code=plan_code)
        prices = get_plan_prices_for_country(country, currency)
        price = next((p for p in prices if p.plan_id == plan.id), None)
        if not price:
            return Response({"detail": "Plan not available in this region."}, status=400)

        sub = create_trial_subscription(tenant, plan, price)
        serializer = self.get_serializer(sub)
        return Response(serializer.data)
subscriptions/urls.py:

python
Copy code
from django.urls import path
from .views import PlanListView, TenantCreateTrialSubscriptionView

urlpatterns = [
    path("plans", PlanListView.as_view(), name="subscription-plans"),
    path("tenants/create-trial", TenantCreateTrialSubscriptionView.as_view(), name="tenant-create-trial-sub"),
]
Incremental tasks:

Implement subscriptions models, services, views, URLs.

Seed Plan and PlanPrice via fixtures or Django admin (e.g., POS_BASIC, POS_PRO, with USD/INR).

Integrate TenantCreateTrialSubscriptionView call at the end of SignupCompleteProfileView (activate default plan).

6. Phase 4 – Coupons & Discounts in Signup
Leverage existing discounts app.

6.1 Extend Coupon model
In discounts/models.py (or equivalent):

Add fields:

python
Copy code
is_signup_only = models.BooleanField(default=False)
allowed_plan_codes = models.JSONField(default=list, blank=True)  # ["POS_BASIC", ...]
allowed_country_codes = models.JSONField(default=list, blank=True)
max_redemptions = models.IntegerField(null=True, blank=True)
redemptions_count = models.IntegerField(default=0)
per_tenant_limit = models.IntegerField(default=1)
6.2 Signup coupon application logic
In subscriptions/services.py, add:

python
Copy code
def apply_signup_coupon(price: PlanPrice, coupon) -> Decimal:
    """
    Returns the discounted amount for signup (first period).
    """
    amount = price.amount
    # simplistic logic; extend later
    if coupon.percent_off:
        amount = amount * (Decimal("100") - coupon.percent_off) / Decimal("100")
    if coupon.amount_off:
        amount = amount - coupon.amount_off
    return max(amount, Decimal("0.00"))
Update TenantCreateTrialSubscriptionView to:

Accept coupon_code.

Validate coupon via discounts service.

Adjust amount on subscription.

Increment redemptions_count.

Incremental task:

Add signup-only flags to coupons.

Implement a simple coupon validation function (validate_signup_coupon(plan, country, code)).

Integrate into trial subscription creation.

7. Phase 5 – Frontend Signup & Pricing Flow
All new frontend code under pos-frontend/src/features/auth (or features/signup):

7.1 Data APIs (TypeScript)
src/features/auth/api.ts:

getGeoMeta() → /api/v1/meta/geo (we’ll add simple backend endpoint)

requestSignupOtp(email, country_code, preferred_currency) → /signup/start

verifySignupOtp(email, code) → /signup/verify-otp

completeSignupProfile(payload) → /signup/complete-profile

listPlans(country, currency) → /subscriptions/plans

createTenantTrialSub(tenantId, planCode, country, currency, couponCode?) → /subscriptions/tenants/create-trial

7.2 Components
SignupLanding.tsx

Shows region-aware plan cards.

Reads geoMeta (country/currency guess).

Allows currency override (stored in localStorage).

SignupStart.tsx

Email + country + currency form.

Calls requestSignupOtp.

SignupVerifyOtp.tsx

Email + OTP form.

Calls verifySignupOtp.

SignupProfile.tsx

Tenant name, admin name, password.

Calls completeSignupProfile → gets tenant_id & user_id.

PlanSelect.tsx

Lists plans via listPlans(country, currency).

Lets user pick plan and optionally enter coupon code.

Calls createTenantTrialSub.

SignupComplete.tsx

Shows success state and “Go to login”/“Start onboarding” button.

Incremental task:
Implement the frontend step-by-step, one screen at a time, using your existing design system + routing.

8. Phase 6 – Security, Rate Limiting & Audit
8.1 Rate limiting OTP & signup
Use Redis or DB-backed counters keyed by:

email

IP

Limits:

max 3 OTP sends per 5 minutes per email

max 10 OTP sends per day per IP

max 5 verification attempts per OTP

Implementation hint:

Small rate_limit(key, limit, window_seconds) helper.

Called inside OtpRequestView.post.

8.2 Audit logs
Add audit app later if needed:

Model:

actor_user, actor_tenant, action, ip, metadata, created_at

Log on:

signup completion

plan changes

subscription status changes

9. Future: Payment Processor Integration (Optional, Not Implemented Now)
Once you’re ready to pay for Stripe/Razorpay, we will:

Map each PlanPrice to a payment provider price id.

Replace TenantCreateTrialSubscriptionView to create a Checkout session instead of directly creating Subscription.

Use webhook to mark Subscription.status = ACTIVE.

The existing subscriptions.Subscription model already has:

external_provider

external_subscription_id

So integration will be non-breaking.

10. Implementation Checklist (for AI Agent)
Here is a concise, incremental checklist for the agent:

Step 1 – emails app
 Create emails app with EmailTemplate, EmailLog.

 Add email settings for console backend (dev).

 Implement emails.services.send_templated_email.

 Create initial templates:

 signup_otp

 welcome_tenant.

Step 2 – otp app
 Create otp app with OtpRequest.

 Implement generate_otp & verify_otp.

 Implement OtpRequestView & OtpVerifyView.

 Wire URLs under /api/v1/otp/.

Step 3 – Extend Tenant model
 Add fields: country_code, default_currency, signup_completed_at, onboarding_status.

 Run migrations.

Step 4 – signup app (backend only)
 Create PendingSignup model.

 Create serializers:

 SignupStartSerializer

 SignupVerifyOtpSerializer

 SignupCompleteProfileSerializer

 Implement views:

 SignupStartView

 SignupVerifyOtpView

 SignupCompleteProfileView

 Wire URLs under /api/v1/signup/....

Step 5 – subscriptions app
 Create Plan, PlanPrice, Subscription models.

 Implement get_plan_prices_for_country, create_trial_subscription.

 Implement PlanListView, TenantCreateTrialSubscriptionView.

 Wire URLs under /api/v1/subscriptions/....

 Seed Plan and PlanPrice via fixtures/admin.

Step 6 – Hook signup → subscriptions
 At the end of SignupCompleteProfileView, create a default trial subscription:

 Choose a “default” plan (e.g., POS_BASIC).

 Use PlanPrice based on country_code and default_currency.

Step 7 – Coupons for signup (optional phase)
 Extend discounts models to mark signup-only coupons.

 Implement validate_signup_coupon(plan, country, code).

 Integrate into TenantCreateTrialSubscriptionView.

Step 8 – Frontend signup integration
 Add features/auth/api.ts with required API wrappers.

 Implement:

 SignupLanding

 SignupStart

 SignupVerifyOtp

 SignupProfile

 PlanSelect

 SignupComplete

 Add React Router routes (e.g. /signup, /signup/verify, etc.).

Step 9 – Security & polish
 Implement rate limiting around OTP send & verification.

 Add basic audit logging for signup and subscription creation.

 Improve error handling & messages across endpoints.

