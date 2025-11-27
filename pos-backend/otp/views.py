from rest_framework import generics, status, permissions
from rest_framework.response import Response

from .serializers import OtpRequestSerializer, OtpVerifySerializer
from .services import generate_otp, verify_otp, OtpVerificationResult


class OtpRequestView(generics.GenericAPIView):
    serializer_class = OtpRequestSerializer
    authentication_classes = []  # public
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        purpose = serializer.validated_data["purpose"]
        country = serializer.validated_data.get("country_code") or ""

        ip = request.META.get("REMOTE_ADDR")
        ua = request.META.get("HTTP_USER_AGENT")

        try:
            generate_otp(email=email, purpose=purpose, ip=ip, ua=ua, country_code=country)
        except ValueError as exc:
            return Response({"ok": False, "detail": str(exc)}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        return Response({"ok": True})


class OtpVerifyView(generics.GenericAPIView):
    serializer_class = OtpVerifySerializer
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        purpose = serializer.validated_data["purpose"]
        code = serializer.validated_data["code"]

        result: OtpVerificationResult = verify_otp(email=email, purpose=purpose, code=code)
        if not result.ok:
            return Response(
                {"ok": False, "detail": result.reason},
                status=result.status_code or status.HTTP_400_BAD_REQUEST,
            )
        return Response({"ok": True})
