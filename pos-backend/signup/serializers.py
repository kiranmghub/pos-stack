from rest_framework import serializers


class SignupStartSerializer(serializers.Serializer):
    email = serializers.EmailField()
    country_code = serializers.CharField(max_length=2, required=False, allow_blank=True)
    preferred_currency = serializers.CharField(max_length=3, required=False, allow_blank=True)


class SignupVerifyOtpSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=8)


class SignupCompleteProfileSerializer(serializers.Serializer):
    email = serializers.EmailField()
    tenant_name = serializers.CharField(max_length=160)
    admin_first_name = serializers.CharField(max_length=80)
    admin_last_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    admin_password = serializers.CharField(write_only=True)
