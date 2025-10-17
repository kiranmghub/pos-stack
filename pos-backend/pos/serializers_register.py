# pos-backend/pos/serializers_register.py
# serializers for starting and ending register sessions
# Notes: Design choice: keep PIN checks and lockouts server-side, return field-scoped errors (e.g., {"pin": "Invalid PIN"}) for good UX.

from typing import Any, Dict
from django.utils import timezone
from django.contrib.auth.hashers import check_password
from rest_framework import serializers
from stores.models import Register, RegisterSession

class StartRegisterSessionSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64, trim_whitespace=True)
    pin = serializers.CharField(max_length=64, write_only=True, trim_whitespace=True)

    def validate(self, attrs: Dict[str, Any]):
        request = self.context["request"]
        tenant = getattr(request, "tenant", None)
        code = attrs["code"].strip()
        pin = attrs["pin"].strip()

        if not tenant:
            raise serializers.ValidationError({"detail": "Tenant not resolved on request."})

        # Look up active register by code within tenant
        try:
            reg = Register.objects.select_related("store").get(
                store__tenant=tenant, code=code, is_active=True
            )
        except Register.DoesNotExist:
            raise serializers.ValidationError({"code": "Unknown or inactive register code."})

        # Lockout check (optional)
        if reg.locked_until and reg.locked_until > timezone.now():
            raise serializers.ValidationError({"detail": "Register is temporarily locked. Try again later."})

        if not reg.access_pin_hash or not check_password(pin, reg.access_pin_hash):
            # You can increment failed_attempts here in a service layer.
            raise serializers.ValidationError({"pin": "Invalid PIN."})

        attrs["register"] = reg
        return attrs


class EndRegisterSessionSerializer(serializers.Serializer):
    # no input required; we’ll use token / request context
    pass
