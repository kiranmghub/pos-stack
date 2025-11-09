# pos-backend/orders/serializers.py

from rest_framework import serializers
from .models import Sale, SaleLine, SalePayment, Return, ReturnItem, Refund
from decimal import Decimal
from django.db.models import Sum

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
    # annotated, not model fields → declare explicitly
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discount_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    tax_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    # we do not include fee_total in list fields by default; add if you plan to show it
 

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
    # Keep frontend contract: expose `quantity` and `tender_type` even though
    # model fields are `qty` and `type`. Also compute names/sku from relations.
    product_name = serializers.SerializerMethodField()
    variant_name = serializers.SerializerMethodField()
    sku = serializers.SerializerMethodField()
    quantity = serializers.IntegerField(source="qty", read_only=True)

    class Meta:
        model = SaleLine
        fields = [
            "id",
            "product_name",
            "variant_name",
            "sku",
            "quantity",
            "unit_price",
            "discount",
            "tax",
            "fee",
            "line_total",
        ]

    def get_product_name(self, obj):
        # prefer snapshot if your model stores it; else traverse relations
        name = getattr(obj, "product_name", None)
        if name:
            return name
        v = getattr(obj, "variant", None)
        p = getattr(v, "product", None) if v is not None else None
        return getattr(p, "name", None)

    def get_variant_name(self, obj):
        name = getattr(obj, "variant_name", None)
        if name:
            return name
        v = getattr(obj, "variant", None)
        return getattr(v, "name", None)

    def get_sku(self, obj):
        val = getattr(obj, "sku", None)
        if val:
            return val
        v = getattr(obj, "variant", None)
        return getattr(v, "sku", None)

class SalePaymentPublicSerializer(serializers.ModelSerializer):
    # Keep frontend contract: expose `tender_type` mapped from model field `type`
    tender_type = serializers.CharField(source="type", read_only=True)

    class Meta:
        model = SalePayment
        fields = [
            "id",
            "tender_type",
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
    # detail also exposes these as non-model fields → compute via methods below
    subtotal = serializers.SerializerMethodField()
    discount_total = serializers.SerializerMethodField()
    tax_total = serializers.SerializerMethodField()
    fee_total = serializers.SerializerMethodField()
    refunded_total = serializers.SerializerMethodField()
    total_returns = serializers.SerializerMethodField()


    class Meta:
        model = Sale
        fields = [
            "id", "receipt_no", "created_at", "updated_at",
            "store_name", "cashier_name",
            "status",
            "subtotal", "discount_total", "tax_total", "fee_total", "total",
            "refunded_total", "total_returns",
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
    
    # ---- aggregate helpers for detail view (compute from lines) ----
    def _lines_qs(self, obj):
        # Handles both prefetched manager and direct queryset cases safely
        lines_attr = getattr(obj, "lines", None)
        if lines_attr is None:
            return SaleLine.objects.filter(sale=obj).only(
                "line_total", "discount", "tax", "fee"
            )
        # If it's a RelatedManager (e.g. obj.lines), use .all()
        if hasattr(lines_attr, "all"):
            return lines_attr.all()
        # If it's already an iterable (prefetched list), just return it
        return lines_attr


    def get_subtotal(self, obj):
        total = sum(
            (ln.line_total or 0) + (ln.discount or 0) - (ln.tax or 0) - (ln.fee or 0)
            for ln in self._lines_qs(obj)
        )
        # DRF will serialize Decimal fine; if None, return 0
        return total

    def get_discount_total(self, obj):
        return sum((ln.discount or 0) for ln in self._lines_qs(obj))

    def get_tax_total(self, obj):
        return sum((ln.tax or 0) for ln in self._lines_qs(obj))

    def get_fee_total(self, obj):
        return sum((ln.fee or 0) for ln in self._lines_qs(obj))
    
    # def get_refunded_total(self, obj):
    #     # Sum of finalized returns' refund_total to date
    #     total = Return.objects.filter(sale=obj, status="finalized").aggregate(
    #         s=serializers.DecimalField(max_digits=12, decimal_places=2).to_internal_value(
    #             sum((r.refund_total or Decimal("0")) for r in Return.objects.filter(sale=obj, status="finalized"))
    #         )
    #     )
    #     return total.get("s", Decimal("0"))
    def get_refunded_total(self, obj):
        # Sum of finalized returns' refund_total to date (pure ORM expression)
        val = Return.objects.filter(sale=obj, status="finalized").aggregate(s=Sum("refund_total"))["s"]
        return val or Decimal("0")

    def get_total_returns(self, obj):
        return Return.objects.filter(sale=obj).count()


# ---- Returns API ----

class ReturnItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReturnItem
        fields = [
            "id", "sale_line", "qty_returned", "restock", "condition",
            "refund_subtotal", "refund_tax", "refund_total", "created_at",
        ]
        read_only_fields = ("refund_subtotal", "refund_tax", "refund_total", "created_at")


class RefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = Refund
        fields = ["id", "method", "amount", "external_ref", "created_at"]


class ReturnSerializer(serializers.ModelSerializer):
    items = ReturnItemSerializer(many=True, read_only=True)
    refunds = RefundSerializer(many=True, read_only=True)
    sale_receipt_no = serializers.CharField(source="sale.receipt_no", read_only=True)

    class Meta:
        model = Return
        fields = [
            "id", "return_no", "status", "sale", "sale_receipt_no",
            "store", "processed_by", "reason_code", "notes",
            "refund_total", "items", "refunds",
            "created_at", "updated_at",
        ]
        read_only_fields = ("return_no", "refund_total", "created_at", "updated_at")


class ReturnStartSerializer(serializers.ModelSerializer):
    """
    For POST /orders/{sale_id}/returns — create a draft Return
    """
    class Meta:
        model = Return
        fields = ["id", "sale", "store", "processed_by", "reason_code", "notes", "status"]
        read_only_fields = ("status",)


class ReturnAddItemsSerializer(serializers.Serializer):
    """
    For POST /returns/{id}/items — add or replace line selections
    """
    items = serializers.ListField(child=serializers.DictField(), allow_empty=False)

    def validate(self, data):
        # Validate quantities don’t exceed refundable (sold minus returned)
        ret: Return = self.context["return"]
        sale = ret.sale
        refundable = {}
        for ln in sale.lines.all():
            already = sum(ri.qty_returned for ri in ln.return_items.select_related("return_ref").filter(return_ref__status="finalized"))
            refundable[ln.id] = max(0, ln.qty - already)
        for idx, item in enumerate(data["items"]):
            line_id = int(item.get("sale_line"))
            qty = int(item.get("qty_returned"))
            if qty <= 0:
                raise serializers.ValidationError({idx: "qty_returned must be > 0"})
            if qty > refundable.get(line_id, 0):
                raise serializers.ValidationError({idx: "qty exceeds refundable quantity"})
        return data


class ReturnFinalizeSerializer(serializers.Serializer):
    refunds = RefundSerializer(many=True)