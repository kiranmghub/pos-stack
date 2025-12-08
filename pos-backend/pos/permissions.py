# pos-backend/pos/permissions.py
# Notes: Usage later:

# from pos.permissions import RegisterSessionRequired

# class SaleView(APIView):
#     permission_classes = [IsAuthenticated, RegisterSessionRequired]
#     ...
# Important : We already have all the POS views and serializers built out.


from rest_framework.permissions import BasePermission
from .tokens import decode_register_token

class RegisterSessionRequired(BasePermission):
    """
    Attach this to any POS endpoint that requires a register session.
    Expects header: Authorization: Register <token>
    View code can read request.register_id set by the middleware (below) or decode inline.
    """

    message = "A valid register session is required."

    def has_permission(self, request, view):
        # Check if register_session_id was set by middleware (preferred)
        if hasattr(request, "register_session_id") and request.register_session_id:
            return True
        
        # Fallback: Check Authorization header directly
        auth = request.headers.get("Authorization", "")
        register_token = None
        
        # Handle comma-separated values: "Bearer <token>, Register <register_token>"
        if ", Register " in auth:
            parts = auth.split(", Register ", 1)
            if len(parts) == 2:
                register_token = parts[1].strip()
        elif auth.startswith("Register "):
            register_token = auth.replace("Register ", "").strip()
        
        # Fallback: Check custom header
        if not register_token:
            register_token = request.headers.get("X-Register-Token", "").strip()
        
        if not register_token:
            return False
        
        ok, data, _ = decode_register_token(register_token)
        if not ok:
            return False
        # optional tenant check is done in middleware; we allow here
        return True
