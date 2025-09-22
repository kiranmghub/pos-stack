# common/middleware.py
from django.http import JsonResponse
from rest_framework_simplejwt.authentication import JWTAuthentication
from tenants.models import Tenant, TenantUser
from django.conf import settings


AUTH_WHITELIST = (
    "/admin",
    "/api/v1/docs",
    "/api/v1/schema",
    "/api/v1/auth",        # allow token/refresh/verify
    "/static/",            # optional: static if served by Django
)


class TenantContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Allow CORS preflight and whitelisted paths
        if request.method == "OPTIONS":
            return self.get_response(request)
        if request.path.startswith(AUTH_WHITELIST):
            request.tenant = None
            return self.get_response(request)

        # ✅ Allow public media files (images, etc.)
        media_url = getattr(settings, "MEDIA_URL", "/media/")
        if media_url and request.path.startswith(media_url):
            return self.get_response(request)

        # Require JWT for the rest
        try:
            auth = JWTAuthentication()
            auth_result = auth.authenticate(request)
            if not auth_result:
                return JsonResponse({"detail": "Authentication required"}, status=401)
            user, token = auth_result
        except Exception:
            return JsonResponse({"detail": "Invalid token"}, status=401)

        # Resolve tenant: prefer JWT claims, then allow header fallback
        tenant_id = token.payload.get("tenant_id") or request.headers.get("X-Tenant-Id")
        tenant_code = token.payload.get("tenant_code") or request.headers.get("X-Tenant-Code")

        tenant = None
        if tenant_id:
            try:
                tenant = Tenant.objects.filter(id=int(tenant_id), is_active=True).first()
            except (TypeError, ValueError):
                tenant = None
        if not tenant and tenant_code:
            tenant = Tenant.objects.filter(code=str(tenant_code), is_active=True).first()

        if not tenant:
            return JsonResponse({"detail": "Invalid tenant"}, status=403)

        # Ensure the user belongs to the tenant (unless superuser)
        is_member = user.is_superuser or TenantUser.objects.filter(
            user=user, tenant=tenant, is_active=True
        ).exists()
        if not is_member:
            return JsonResponse({"detail": "User not a member of tenant"}, status=403)

        # Attach to request for downstream views
        request.user = user
        request.tenant = tenant

        return self.get_response(request)
