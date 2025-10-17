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
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Register "):
            return False
        ok, data, _ = decode_register_token(auth.replace("Register ", "").strip())
        if not ok:
            return False
        # optional tenant check is done in middleware; we allow here
        return True
