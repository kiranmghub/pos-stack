# pos-backend/pos/tokens.py
# Token encoding/decoding for register sessions
# ----------------------------------------
# Notes: Why JWT?
# No PIN on every request, easy expiry, and we can still back it with a DB RegisterSession row for revocation/audit.

from datetime import timedelta
from typing import Optional, Tuple, Dict, Any
import jwt
from django.conf import settings
from django.utils import timezone

DEFAULT_TTL_HOURS = getattr(settings, "REGISTER_SESSION_TTL_HOURS", 8)

def encode_register_token(*, tenant_id: int, register_id: int, session_id: str, ttl_hours: Optional[int] = None) -> str:
    now = timezone.now()
    exp = now + timedelta(hours=ttl_hours or DEFAULT_TTL_HOURS)
    payload: Dict[str, Any] = {
        "typ": "register",
        "tenant_id": tenant_id,
        "register_id": register_id,
        "session_id": str(session_id),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

def decode_register_token(token: str) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
    try:
        data = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if data.get("typ") != "register":
            return False, None, "Invalid token type."
        return True, data, None
    except jwt.ExpiredSignatureError:
        return False, None, "Register session expired."
    except jwt.DecodeError:
        return False, None, "Invalid register token."
    except Exception as e:
        return False, None, str(e)
