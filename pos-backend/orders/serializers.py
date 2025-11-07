# pos-backend/orders/serializers.py

from rest_framework import serializers
from .models import Sale, SaleLine, SalePayment

class SaleLineSerializer(serializers.ModelSerializer):
    class Meta: model = SaleLine; fields = "__all__"


class RecentSaleSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source="store.name", read_only=True)
    cashier_name = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        # Add/remove fields here if your UI needs more/less
        fields = ["id", "total", "created_at", "store_name", "cashier_name"]

    def get_cashier_name(self, obj):
        u = getattr(obj, "cashier", None)
        if not u:
            return None
        # Show full name if present; fallback to username
        try:
            full = (u.get_full_name() or "").strip()
        except Exception:
            full = ""
        return full or getattr(u, "username", None)


def create(self, validated):
    lines = validated.pop("lines", [])
    sale = Sale.objects.create(**validated)
    for ln in lines:
        SaleLine.objects.create(sale=sale, **ln)
    return sale


class SaleListSerializer(serializers.ModelSerializer):
    store_name = serializers.SerializerMethodField()
    cashier_name = serializers.SerializerMethodField()
    lines_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id", "receipt_no", "created_at",
            "store_name", "cashier_name",
            "subtotal", "discount_total", "tax_total", "total",
            "status",  # pending/completed/void
            "lines_count",
        ]

    def get_store_name(self, obj):
        s = getattr(obj, "store", None)
        return getattr(s, "name", None)

    def get_cashier_name(self, obj):
        u = getattr(obj, "cashier", None)
        if not u:
            return None
        # prefer full name if available
        full = (getattr(u, "first_name", "") + " " + getattr(u, "last_name", "")).strip()
        return full or getattr(u, "username", None)

class SaleLinePublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleLine
        fields = [
            "id",
            "product_name",     # stored snapshot on line
            "variant_name",     # stored snapshot on line
            "sku",
            "quantity",
            "unit_price",
            "discount",
            "tax",
            "fee",
            "line_total",
        ]

class SalePaymentPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalePayment
        fields = [
            "id",
            "tender_type",      # CASH|CARD|OTHER
            "amount",
            "received",
            "change",
            "txn_ref",
            "meta",
            "created_at",
        ]

class SaleDetailSerializer(serializers.ModelSerializer):
    store_name = serializers.SerializerMethodField()
    cashier_name = serializers.SerializerMethodField()
    lines = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            "id", "receipt_no", "created_at", "updated_at",
            "store_name", "cashier_name",
            "status",
            "subtotal", "discount_total", "tax_total", "fee_total", "total",
            "receipt_data",     # JSON; used for printable receipt/tax breakdown
            "lines",
            "payments",
        ]

    def get_store_name(self, obj):
        return SaleListSerializer().get_store_name(obj)

    def get_cashier_name(self, obj):
        return SaleListSerializer().get_cashier_name(obj)

    def get_lines(self, obj):
        qs = getattr(obj, "lines", None) or SaleLine.objects.filter(sale=obj)
        return SaleLinePublicSerializer(qs, many=True).data

    def get_payments(self, obj):
        qs = getattr(obj, "pos_payments", None) or SalePayment.objects.filter(sale=obj)
        return SalePaymentPublicSerializer(qs, many=True).data