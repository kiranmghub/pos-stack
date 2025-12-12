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
    "/api/v1/otp",         # public OTP endpoints
    "/api/v1/signup",      # public signup endpoints
    "/api/v1/meta",        # public metadata (geo, etc.)
    "/api/v1/subscriptions/plans",  # public pricing
    "/api/v1/subscriptions/tenants/create-trial",  # allow signup trial creation
    "/static/",            # optional: static if served by Django
)


class TenantContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Allow CORS preflight and whitelisted paths
        if request.method == "OPTIONS":
            # Create a proper OPTIONS response with CORS headers
            from django.http import HttpResponse
            response = HttpResponse()
            origin = request.headers.get("Origin")
            if origin:
                response["Access-Control-Allow-Origin"] = origin
                response["Access-Control-Allow-Credentials"] = "true"
            else:
                response["Access-Control-Allow-Origin"] = "*"
            response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Tenant-Id, X-Tenant-Code"
            response["Access-Control-Max-Age"] = "86400"
            return response
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
                response = JsonResponse({"detail": "Authentication required"}, status=401)
                # Add CORS headers to error responses
                origin = request.headers.get("Origin")
                if origin:
                    response["Access-Control-Allow-Origin"] = origin
                    response["Access-Control-Allow-Credentials"] = "true"
                return response
            user, token = auth_result
        except Exception:
            response = JsonResponse({"detail": "Invalid token"}, status=401)
            # Add CORS headers to error responses
            origin = request.headers.get("Origin")
            if origin:
                response["Access-Control-Allow-Origin"] = origin
                response["Access-Control-Allow-Credentials"] = "true"
            return response

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
            response = JsonResponse({"detail": "Invalid tenant"}, status=403)
            # Add CORS headers to error responses
            origin = request.headers.get("Origin")
            if origin:
                response["Access-Control-Allow-Origin"] = origin
                response["Access-Control-Allow-Credentials"] = "true"
            return response

        # Ensure the user belongs to the tenant (unless superuser)
        is_member = user.is_superuser or TenantUser.objects.filter(
            user=user, tenant=tenant, is_active=True
        ).exists()
        if not is_member:
            response = JsonResponse({"detail": "User not a member of tenant"}, status=403)
            # Add CORS headers to error responses
            origin = request.headers.get("Origin")
            if origin:
                response["Access-Control-Allow-Origin"] = origin
                response["Access-Control-Allow-Credentials"] = "true"
            return response

        # Attach to request for downstream views
        request.user = user
        request.tenant = tenant

        response = self.get_response(request)
        
        # Add CORS headers to all responses (for cross-origin requests)
        origin = request.headers.get("Origin")
        if origin:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Credentials"] = "true"
            response["Access-Control-Expose-Headers"] = "Content-Disposition"
        
        return response
