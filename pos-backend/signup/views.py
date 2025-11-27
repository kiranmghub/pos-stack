from django.contrib.auth import get_user_model
from django.db import transaction, IntegrityError
from django.utils import timezone
from django.utils.text import slugify
from django.conf import settings
from django.core.cache import cache
from rest_framework import generics, status, permissions
from rest_framework.response import Response

from tenants.models import Tenant, TenantUser
from common.roles import TenantRole
from otp.services import generate_otp, verify_otp, OtpVerificationResult
from .models import PendingSignup, SignupAudit
from .serializers import (
    SignupStartSerializer,
    SignupVerifyOtpSerializer,
    SignupCompleteProfileSerializer,
)
from subscriptions.models import Plan
from subscriptions.services import get_plan_prices_for_country, create_trial_subscription
from emails.services import send_templated_email

User = get_user_model()

# Defaults for trial creation
DEFAULT_SIGNUP_PLAN_CODE = getattr(settings, "DEFAULT_SIGNUP_PLAN_CODE", "POS_BASIC")

# rate limits
SIGNUP_RATE_START_PER_EMAIL = getattr(settings, "SIGNUP_RATE_START_PER_EMAIL", 5)
SIGNUP_RATE_START_EMAIL_WINDOW = getattr(settings, "SIGNUP_RATE_START_EMAIL_WINDOW", 600)
SIGNUP_RATE_START_PER_IP = getattr(settings, "SIGNUP_RATE_START_PER_IP", 20)
SIGNUP_RATE_START_IP_WINDOW = getattr(settings, "SIGNUP_RATE_START_IP_WINDOW", 900)
SIGNUP_RATE_VERIFY_PER_EMAIL = getattr(settings, "SIGNUP_RATE_VERIFY_PER_EMAIL", 10)
SIGNUP_RATE_VERIFY_EMAIL_WINDOW = getattr(settings, "SIGNUP_RATE_VERIFY_EMAIL_WINDOW", 900)
SIGNUP_RATE_COMPLETE_PER_EMAIL = getattr(settings, "SIGNUP_RATE_COMPLETE_PER_EMAIL", 5)
SIGNUP_RATE_COMPLETE_EMAIL_WINDOW = getattr(settings, "SIGNUP_RATE_COMPLETE_EMAIL_WINDOW", 900)


def _generate_unique_tenant_code(name: str) -> str:
    base = slugify(name or "") or "tenant"
    base = f"tnt-{base}"
    base = base[:40]  # leave room for suffix
    candidate = base
    idx = 1
    while Tenant.objects.filter(code=candidate).exists():
        candidate = f"{base}-{idx}"
        idx += 1
    return candidate


def _guess_geo(request):
    """
    Very light geo inference from Accept-Language.
    """
    lang = (request.META.get("HTTP_ACCEPT_LANGUAGE") or "").split(",")[0].lower()
    country = ""
    currency = ""
    if "in" in lang:
        country, currency = "IN", "INR"
    elif "sg" in lang:
        country, currency = "SG", "SGD"
    elif "gb" in lang or "en-gb" in lang:
        country, currency = "GB", "GBP"
    elif "de" in lang or "fr" in lang or "es" in lang:
        country, currency = "EU", "EUR"
    else:
        country, currency = "US", "USD"
    return country, currency


GEO_OPTIONS = [
    {"code": "US", "label": "United States", "currency": "USD"},
    {"code": "IN", "label": "India", "currency": "INR"},
    {"code": "SG", "label": "Singapore", "currency": "SGD"},
    {"code": "GB", "label": "United Kingdom", "currency": "GBP"},
    {"code": "EU", "label": "Eurozone", "currency": "EUR"},
]


def _rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    current = cache.get(key)
    if current is None:
        cache.set(key, 1, timeout=window_seconds)
        return False
    current = current + 1
    cache.set(key, current, timeout=window_seconds)
    return current > limit


class GeoMetaView(generics.GenericAPIView):
    """
    Public endpoint that returns a coarse country/currency guess for signup defaults.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        country, currency = _guess_geo(request)
        return Response(
            {
                "country": country,
                "currency": currency,
                "source": "accept-language",
                "options": GEO_OPTIONS,
            }
        )

class SignupStartView(generics.GenericAPIView):
    serializer_class = SignupStartSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"]
        country = s.validated_data.get("country_code") or ""
        currency = s.validated_data.get("preferred_currency") or ""
        if not country or not currency:
            geo_country, geo_currency = _guess_geo(request)
            country = country or geo_country
            currency = currency or geo_currency

        ip = request.META.get("REMOTE_ADDR")
        ua = request.META.get("HTTP_USER_AGENT")

        # Rate limit
        if _rate_limit(f"signup:start:email:{email}", SIGNUP_RATE_START_PER_EMAIL, SIGNUP_RATE_START_EMAIL_WINDOW):
            return Response({"ok": False, "detail": "Too many signup attempts for this email. Please wait and try again."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        if ip and _rate_limit(f"signup:start:ip:{ip}", SIGNUP_RATE_START_PER_IP, SIGNUP_RATE_START_IP_WINDOW):
            return Response({"ok": False, "detail": "Too many signup attempts from this IP. Please wait and try again."}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        PendingSignup.objects.update_or_create(
            email=email,
            defaults={
                "country_code": country,
                "preferred_currency": currency,
            },
        )

        # Block signup early if user already exists
        if User.objects.filter(username=email).exists():
            return Response(
                {"ok": False, "detail": "An account with this email already exists. Please sign in instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            generate_otp(email=email, purpose="signup", ip=ip, ua=ua, country_code=country)
        except ValueError as exc:
            return Response({"ok": False, "detail": str(exc)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        SignupAudit.objects.create(email=email, action="start", ip_address=ip, user_agent=ua or "")
        return Response({"ok": True})


class SignupVerifyOtpView(generics.GenericAPIView):
    serializer_class = SignupVerifyOtpSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"]
        code = s.validated_data["code"]

        if _rate_limit(f"signup:verify:email:{email}", SIGNUP_RATE_VERIFY_PER_EMAIL, SIGNUP_RATE_VERIFY_EMAIL_WINDOW):
            return Response({"ok": False, "detail": "Too many verification attempts. Please wait and try again."}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        result: OtpVerificationResult = verify_otp(email=email, purpose="signup", code=code)
        if not result.ok:
            SignupAudit.objects.create(email=email, action="verify_fail")
            return Response({"ok": False, "detail": result.reason}, status=status.HTTP_400_BAD_REQUEST)

        ps, _ = PendingSignup.objects.get_or_create(email=email)
        ps.is_email_verified = True
        ps.save(update_fields=["is_email_verified"])
        SignupAudit.objects.create(email=email, action="verify_ok")
        return Response({"ok": True})


class SignupCompleteProfileView(generics.GenericAPIView):
    serializer_class = SignupCompleteProfileSerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"]
        tenant_name = s.validated_data["tenant_name"]
        admin_first_name = s.validated_data["admin_first_name"]
        admin_last_name = s.validated_data.get("admin_last_name") or ""
        admin_password = s.validated_data["admin_password"]

        if _rate_limit(f"signup:complete:email:{email}", SIGNUP_RATE_COMPLETE_PER_EMAIL, SIGNUP_RATE_COMPLETE_EMAIL_WINDOW):
            return Response({"ok": False, "detail": "Too many completion attempts. Please wait and try again."}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        try:
            ps = PendingSignup.objects.get(email=email, is_email_verified=True)
        except PendingSignup.DoesNotExist:
            return Response({"ok": False, "detail": "Email not verified."}, status=status.HTTP_400_BAD_REQUEST)

        # Create tenant using existing currency fields (no duplicates)
        tenant_code = _generate_unique_tenant_code(tenant_name)
        try:
            tenant = Tenant.objects.create(
                name=tenant_name,
                code=tenant_code,
                business_country_code=ps.country_code,
                country_code=ps.country_code,
                default_currency=ps.preferred_currency or "USD",
                currency_code=ps.preferred_currency or "USD",  # keep legacy field in sync
                onboarding_status="basic_profile",
            )
        except IntegrityError:
            return Response(
                {"ok": False, "detail": "A tenant with a similar code already exists. Please tweak the name and try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create admin user
        try:
            user = User.objects.create_user(
                username=email,
                email=email,
                first_name=admin_first_name,
                last_name=admin_last_name,
                password=admin_password,
            )
        except IntegrityError:
            return Response(
                {"ok": False, "detail": "An account with this email already exists. Please sign in instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        TenantUser.objects.create(
            tenant=tenant,
            user=user,
            role=TenantRole.OWNER,
        )

        tenant.signup_completed_at = timezone.now()
        tenant.save(update_fields=["signup_completed_at"])

        # Try to auto-create a trial subscription on the default plan
        try:
            plan = Plan.objects.get(code=DEFAULT_SIGNUP_PLAN_CODE, is_active=True)
            tenant_currency = getattr(tenant, "default_currency", None) or getattr(tenant, "currency_code", None) or "USD"
            prices = get_plan_prices_for_country(ps.country_code, tenant_currency)
            price = next((p for p in prices if p.plan_id == plan.id), None)
            if price:
                create_trial_subscription(tenant, plan, price, trial_days=None)
        except Plan.DoesNotExist:
            pass  # No default plan seeded; skip quietly
        except Exception:
            # Do not block signup on subscription issues
            pass

        # Send welcome email (best-effort)
        try:
            send_templated_email(
                name="welcome_tenant",
                to=email,
                context={"tenant_name": tenant_name},
            )
        except Exception:
            pass

        ps.delete()
        SignupAudit.objects.create(email=email, action="complete")

        return Response(
            {
                "ok": True,
                "tenant_id": tenant.id,
                "user_id": user.id,
            }
        )
