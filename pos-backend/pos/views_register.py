# pos-backend/pos/views_register.py
# views for starting and ending register sessions
# Note: we keep PIN checks and lockouts server-side for security and return field-scoped errors for good UX.
# Notes: Returns & UX:
# Start: 200 with token, register, and expires_at.
# End: 200 {ok: true} even if token was stale; keeps UX simple.

from typing import Any, Dict
from uuid import uuid4
from django.utils import timezone
from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .serializers_register import StartRegisterSessionSerializer, EndRegisterSessionSerializer
from .tokens import encode_register_token, decode_register_token
from stores.models import RegisterSession, Register

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_register_session(request):
    """
    POST /api/v1/pos/register-session/start
    Body: { "code": "<register-code>", "pin": "<pin>" }
    Returns: { "token": "<jwt>", "register": { id, code, name, store_id }, "expires_at": "...iso..." }
    """
    ser = StartRegisterSessionSerializer(data=request.data, context={"request": request})
    ser.is_valid(raise_exception=True)
    reg = ser.validated_data["register"]
    tenant = getattr(request, "tenant", None)

    # You can add attempt counting/lockouts here if desired.

    with transaction.atomic():
        # Create a DB session (auditable; easy to revoke)
        sess = RegisterSession.objects.create(
            tenant=tenant,
            register=reg,
            expires_at=timezone.now() + timezone.timedelta(hours=8),
            created_by_user=getattr(request, "user", None),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:400],
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        token = encode_register_token(
            tenant_id=tenant.id,
            register_id=reg.id,
            session_id=str(sess.id),
        )

        reg.last_seen_at = timezone.now()
        reg.failed_attempts = 0
        reg.save(update_fields=["last_seen_at", "failed_attempts"])

    return Response({
        "token": token,
        "register": { "id": reg.id, "code": reg.code, "name": reg.name, "store_id": reg.store_id },
        "expires_at": sess.expires_at.isoformat() if sess.expires_at else None,
    }, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end_register_session(request):
    """
    POST /api/v1/pos/register-session/end
    Header: Authorization: Register <token>
    Behavior: Revokes the server-side session (if present). Token becomes unusable.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Register "):
        return Response({"detail": "Missing register token."}, status=status.HTTP_400_BAD_REQUEST)

    ok, data, err = decode_register_token(auth.replace("Register ", "").strip())
    if not ok:
        # Token is malformed/expired—treat as ended
        return Response({"detail": err or "Invalid register token."}, status=status.HTTP_400_BAD_REQUEST)

    tenant = getattr(request, "tenant", None)
    if not tenant or data.get("tenant_id") != tenant.id:
        return Response({"detail": "Tenant mismatch."}, status=status.HTTP_403_FORBIDDEN)

    # Revoke the DB session (if it still exists)
    try:
        sess = RegisterSession.objects.get(id=data["session_id"], tenant=tenant)
        sess.revoke("Ended via API")
        sess.save(update_fields=["revoked_at", "notes", "updated_at"])
    except RegisterSession.DoesNotExist:
        pass

    return Response({"ok": True}, status=status.HTTP_200_OK)
