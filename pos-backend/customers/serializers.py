# pos-backend/customers/serializers.py

from rest_framework import serializers

from .models import Customer
from orders.models import Sale  # reuse Sale for customer sales list


class CustomerSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "tenant",
            "external_id",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone_number",
            "address_line1",
            "address_line2",
            "city",
            "state_province",
            "postal_code",
            "country",
            "marketing_opt_in",
            "sms_opt_in",
            "is_loyalty_member",
            "date_of_birth",
            "gender",
            "total_spend",
            "total_returns",
            "net_spend",
            "visits_count",
            "last_purchase_date",
            "custom_attributes",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "tenant",
            "total_spend",
            "total_returns",
            "net_spend",
            "visits_count",
            "last_purchase_date",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            raise serializers.ValidationError("Tenant context missing.")
        validated_data["tenant"] = tenant
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class CustomerListSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Customer
        fields = [
            "id",
            "full_name",
            "first_name",
            "last_name",
            "email",
            "phone_number",
            "is_loyalty_member",
            "last_purchase_date",
            "visits_count",
            "net_spend",
        ]


class CustomerSalesSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    email = serializers.EmailField(allow_null=True)
    phone_number = serializers.CharField(allow_null=True)
    total_spend = serializers.DecimalField(max_digits=12, decimal_places=2)
    total_returns = serializers.DecimalField(max_digits=12, decimal_places=2)
    net_spend = serializers.DecimalField(max_digits=12, decimal_places=2)
    visits_count = serializers.IntegerField()
