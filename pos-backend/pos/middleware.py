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

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Register "):
            return

        ok, data, _ = decode_register_token(auth.replace("Register ", "").strip())
        if not ok:
            return

        # (Optional) tenant defense-in-depth
        tenant = getattr(request, "tenant", None)
        if tenant and data.get("tenant_id") != tenant.id:
            return

        request.register_id = data.get("register_id")
        request.register_session_id = data.get("session_id")
