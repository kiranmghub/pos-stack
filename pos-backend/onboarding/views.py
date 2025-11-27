from rest_framework import generics, status, permissions
from rest_framework.response import Response
from django.utils.text import slugify
from django.db import transaction
from tenants.models import Tenant, TenantUser
from stores.models import Store, Register
from taxes.models import TaxCategory, TaxRule, TaxBasis, ApplyScope
from catalog.models import Product, Variant
from .serializers import (
    OnboardingMarkSerializer,
    GenerateCodeSerializer,
    StoreCreateSerializer,
    RegisterCreateSerializer,
    TaxCategoryCreateSerializer,
    TaxRuleCreateSerializer,
    CatalogImportCompleteSerializer,
    TenantMetaSerializer,
)

ORDERED_STEPS = [
    "basic_profile",
    "store_setup",
    "registers",
    "taxes",
    "catalog",
    "variants",
    "live",
]

TZ_MAP = {
    ("US", "NEW YORK"): "America/New_York",
    ("US", "LOS ANGELES"): "America/Los_Angeles",
    ("US", "CHICAGO"): "America/Chicago",
    ("IN", "MUMBAI"): "Asia/Kolkata",
    ("IN", "DELHI"): "Asia/Kolkata",
    ("SG", "SINGAPORE"): "Asia/Singapore",
    ("GB", "LONDON"): "Europe/London",
    ("EU", "BERLIN"): "Europe/Berlin",
}

def _guess_timezone(country: str, city: str) -> str:
    c = (country or "").upper()
    ct = (city or "").upper()
    if (c, ct) in TZ_MAP:
        return TZ_MAP[(c, ct)]
    if c == "IN":
        return "Asia/Kolkata"
    if c == "SG":
        return "Asia/Singapore"
    if c == "GB":
        return "Europe/London"
    if c == "EU":
        return "Europe/Berlin"
    if c == "US":
        return "America/New_York"
    return ""


def _derive_completion(tenant: Tenant):
    """Derive step completion from existing data."""
    return {
        "basic_profile": True,  # after signup/profile creation
        "store_setup": Store.objects.filter(tenant=tenant).exists(),
        "taxes": TaxCategory.objects.filter(tenant=tenant).exists(),
        "catalog": Product.objects.filter(tenant=tenant).exists(),
        "variants": Variant.objects.filter(product__tenant=tenant).exists(),
        "registers": Register.objects.filter(tenant=tenant).exists(),
    }


def _advance_status_from_completion(tenant: Tenant, completed: dict):
    """Determine the highest contiguous step completed; update tenant if advanced."""
    if tenant.onboarding_status == "live":
        return "live"
    highest_idx = -1
    for idx, step in enumerate(ORDERED_STEPS):
        if completed.get(step):
            highest_idx = idx
        else:
            break
    current_idx = ORDERED_STEPS.index(tenant.onboarding_status) if tenant.onboarding_status in ORDERED_STEPS else -1
    max_idx = max(highest_idx, current_idx)
    new_status = "live" if max_idx == len(ORDERED_STEPS) - 1 else (ORDERED_STEPS[max_idx] if max_idx >= 0 else "not_started")
    if tenant.onboarding_status != new_status:
        tenant.onboarding_status = new_status
        tenant.save(update_fields=["onboarding_status"])
    return new_status

def _current_status(tenant: Tenant):
    derived = _derive_completion(tenant)
    status_code = _advance_status_from_completion(tenant, derived)
    steps_state = {s: bool(derived.get(s)) for s in ORDERED_STEPS}
    return {
        "status": status_code,
        "steps": steps_state,
    }


class OnboardingStateView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        tenant = request.tenant
        return Response(_current_status(tenant))


class OnboardingMarkView(generics.GenericAPIView):
    serializer_class = OnboardingMarkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        tenant = request.tenant
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        step = s.validated_data["step"]

        if step not in ORDERED_STEPS:
            return Response({"detail": "Invalid step"}, status=status.HTTP_400_BAD_REQUEST)

        current = tenant.onboarding_status or "not_started"
        if current == "live":
            return Response(_current_status(tenant))

        # set status directly; ordering is handled in the wizard/UI
        tenant.onboarding_status = step
        tenant.save(update_fields=["onboarding_status"])
        return Response(_current_status(tenant))


def _unique_code(model: str, tenant: Tenant, base: str = "") -> str:
    base_slug = slugify(base or model) or model
    base_slug = base_slug[:40]
    candidate = base_slug
    idx = 1
    exists = {
        "store": lambda c: Store.objects.filter(tenant=tenant, code=c).exists(),
        "register": lambda c: Register.objects.filter(tenant=tenant, code=c).exists(),
        "taxcategory": lambda c: TaxCategory.objects.filter(tenant=tenant, code=c).exists(),
        "taxrule": lambda c: TaxRule.objects.filter(tenant=tenant, code=c).exists(),
        "product": lambda c: Product.objects.filter(tenant=tenant, code=c).exists(),
    }[model]
    while exists(candidate):
        candidate = f"{base_slug}-{idx}"
        idx += 1
    return candidate


class GenerateCodeView(generics.GenericAPIView):
    serializer_class = GenerateCodeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        model = s.validated_data["model"]
        base = s.validated_data.get("base") or model
        # Frontend already prefixes with tenant slug and model prefix; avoid double-prepending
        code = _unique_code(model, request.tenant, base)
        return Response({"code": code})


class StoreCreateView(generics.GenericAPIView):
    serializer_class = StoreCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        tenant = request.tenant
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        tz = data.get("timezone") or _guess_timezone(data.get("country"), data.get("city"))
        store = Store.objects.create(
            tenant=tenant,
            name=data["name"],
            code=data["code"],
            timezone=tz,
            street=data.get("street") or "",
            city=data.get("city") or "",
            state=data.get("state") or "",
            postal_code=data.get("postal_code") or "",
            country=data.get("country") or "",
            region=data.get("region") or "",
            phone_number=data.get("phone_number") or "",
            mobile_number=data.get("mobile_number") or "",
            fax_number=data.get("fax_number") or "",
            email=data.get("email") or "",
            contact_person=data.get("contact_person") or "",
            landmark=data.get("landmark") or "",
            description=data.get("description") or "",
            metadata=data.get("metadata") or {},
            geo_lat=data.get("geo_lat"),
            geo_lng=data.get("geo_lng"),
            opening_time=data.get("opening_time"),
            closing_time=data.get("closing_time"),
            tax_id=data.get("tax_id") or "",
            is_primary=data.get("is_primary") or False,
        )
        # add current user to store scope
        try:
            membership = TenantUser.objects.get(tenant=tenant, user=request.user)
            membership.stores.add(store)
        except TenantUser.DoesNotExist:
            pass
        return Response({"ok": True, "store_id": store.id, "timezone": tz})


class RegisterCreateView(generics.GenericAPIView):
    serializer_class = RegisterCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        tenant = request.tenant
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        store_id = s.validated_data["store_id"]
        try:
            store = Store.objects.get(id=store_id, tenant=tenant)
        except Store.DoesNotExist:
            return Response({"detail": "Store not found"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            reg = Register.objects.create(
                store=store,
                tenant=tenant,
                name=s.validated_data.get("name") or "",
                code=s.validated_data["code"],
            )
        except Exception as exc:
            return Response({"detail": f"Could not create register: {exc}"}, status=status.HTTP_400_BAD_REQUEST)

        pin = s.validated_data.get("pin") or ""
        if pin:
            reg.set_pin(pin)
            reg.save(update_fields=["access_pin_hash"])
        return Response({"ok": True, "register_id": reg.id})


class TaxCategoryCreateView(generics.GenericAPIView):
    serializer_class = TaxCategoryCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        tenant = request.tenant
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        try:
            cat = TaxCategory.objects.create(
                tenant=tenant,
                name=data["name"],
                code=data["code"],
                rate=data["rate"],
            )
            return Response({"ok": True, "tax_category_id": cat.id})
        except Exception as exc:
            return Response({"detail": f"Could not create tax category: {exc}"}, status=status.HTTP_400_BAD_REQUEST)


class TaxRuleCreateView(generics.GenericAPIView):
    serializer_class = TaxRuleCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        tenant = request.tenant
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        cat = None
        cat_id = data.get("tax_category_id")
        if cat_id:
            try:
                cat = TaxCategory.objects.get(id=cat_id, tenant=tenant)
            except TaxCategory.DoesNotExist:
                return Response({"detail": "Tax category not found"}, status=status.HTTP_400_BAD_REQUEST)
        rule = TaxRule.objects.create(
            tenant=tenant,
            name=data["name"],
            code=data["code"],
            basis=TaxBasis.PERCENT if data.get("basis") == "PCT" else TaxBasis.FLAT,
            rate=data.get("rate"),
            amount=data.get("amount"),
            apply_scope=ApplyScope.RECEIPT if data.get("apply_scope") == "RECEIPT" else ApplyScope.LINE,
        )
        if cat:
            rule.categories.add(cat)
        return Response({"ok": True, "tax_rule_id": rule.id})


class CatalogImportCompleteView(generics.GenericAPIView):
    serializer_class = CatalogImportCompleteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        tenant = request.tenant
        # mark catalog step and return status
        tenant.onboarding_status = "catalog"
        tenant.save(update_fields=["onboarding_status"])
        return Response(_current_status(tenant))


class TenantMetaView(generics.GenericAPIView):
    serializer_class = TenantMetaSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        tenant = request.tenant
        return Response(
            {
                "code": tenant.code,
                "country": getattr(tenant, "country_code", None) or getattr(tenant, "business_country_code", "") or "",
            }
        )
