# pos-backend/pos/middleware.py
# Middleware to extract Register session info from Authorization header
# Notes: In the future we want to move this to common/middleware.py with other tenant/request middleware,
# but for now we keep it here to avoid circular imports since pos/tokens.py depends on common settings.
from django.utils.deprecation import MiddlewareMixin
from .tokens import decode_register_token

class RegisterSessionMiddleware(MiddlewareMixin):
    """
    Extracts Register session info from Authorization header:
      Authorization: Register <token>
    and sets request.register_id and request.register_session_id if valid.
    """

    def process_request(self, request):
        request.register_id = None
        request.register_session_id = None

        # Check Authorization header for "Register " prefix
        auth = request.headers.get("Authorization", "")
        register_token = None
        
        # Try to extract Register token from Authorization header
        # Handle comma-separated values: "Bearer <token>, Register <register_token>"
        if ", Register " in auth:
            parts = auth.split(", Register ", 1)
            if len(parts) == 2:
                register_token = parts[1].strip()
        elif auth.startswith("Register "):
            register_token = auth.replace("Register ", "").strip()
        
        # Fallback: Check custom header X-Register-Token
        if not register_token:
            register_token = request.headers.get("X-Register-Token", "").strip()
        
        if not register_token:
            return

        ok, data, _ = decode_register_token(register_token)
        if not ok:
            return

        # (Optional) tenant defense-in-depth
        tenant = getattr(request, "tenant", None)
        if tenant and data.get("tenant_id") != tenant.id:
            return

        request.register_id = data.get("register_id")
        request.register_session_id = data.get("session_id")
