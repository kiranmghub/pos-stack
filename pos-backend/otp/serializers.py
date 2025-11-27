from rest_framework import serializers


class OtpRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    purpose = serializers.ChoiceField(choices=["signup", "login", "sensitive_action"])
    country_code = serializers.CharField(max_length=2, required=False, allow_blank=True)


class OtpVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    purpose = serializers.ChoiceField(choices=["signup", "login", "sensitive_action"])
    code = serializers.CharField(max_length=8)
