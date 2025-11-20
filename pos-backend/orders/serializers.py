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
    total_returns = serializers.IntegerField(read_only=True)
 

    class Meta:
        model = Sale
        fields = [
            "id", "receipt_no", "created_at",
            "store_name", "cashier_name",
            "subtotal", "discount_total", "tax_total", "total",
            "status",  # pending/completed/void
            "lines_count",
            "total_returns",
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
    line_subtotal = serializers.SerializerMethodField()
    returned_qty = serializers.SerializerMethodField()
    refundable_qty = serializers.SerializerMethodField()


    class Meta:
        model = SaleLine
        fields = [
            "id",
            "product_name",
            "variant_name",
            "sku",
            "quantity",
            "line_subtotal",
            "returned_qty",
            "refundable_qty",
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
    
    def get_line_subtotal(self, obj):
        """
        Original line subtotal, pre-tax & pre-fee, post-discount.
        Mirrors SaleDetail subtotal logic, but per line.
        """
        line_total = obj.line_total or Decimal("0")
        discount = obj.discount or Decimal("0")
        tax = obj.tax or Decimal("0")
        fee = obj.fee or Decimal("0")
        return line_total + discount - tax - fee
    
    def get_returned_qty(self, obj):
        # sum of all finalized returns for this sale line
        from .models import ReturnItem  # local import to avoid cycles
        return int(
            ReturnItem.objects.filter(
                sale_line=obj, return_ref__status="finalized"
            ).aggregate(s=Sum("qty_returned"))["s"] or 0
        )

    def get_refundable_qty(self, obj):
        returned = self.get_returned_qty(obj)
        qty = int(getattr(obj, "qty", 0) or 0)
        rem = qty - returned
        return rem if rem > 0 else 0

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
    # Enrich each returned line with names and sku from the original sale_line → variant → product
    product_name = serializers.SerializerMethodField()
    variant_name = serializers.SerializerMethodField()
    sku = serializers.SerializerMethodField()
        # Original sale line context (single source of truth from SaleLine)
    original_quantity = serializers.IntegerField(source="sale_line.qty", read_only=True)
    original_unit_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, source="sale_line.unit_price", read_only=True
    )
    original_discount = serializers.DecimalField(
        max_digits=10, decimal_places=2, source="sale_line.discount", read_only=True
    )
    original_tax = serializers.DecimalField(
        max_digits=10, decimal_places=2, source="sale_line.tax", read_only=True
    )
    original_fee = serializers.DecimalField(
        max_digits=10, decimal_places=2, source="sale_line.fee", read_only=True
    )
    original_total = serializers.DecimalField(
        max_digits=10, decimal_places=2, source="sale_line.line_total", read_only=True
    )
    original_subtotal = serializers.SerializerMethodField()

    class Meta:
        model = ReturnItem
        fields = [
            "id", "sale_line", "qty_returned", "restock", "condition",
            "refund_subtotal", "refund_tax", "refund_total", "created_at",
            "reason_code", "notes",   # NEW (writeable in draft; read-only in finalized)
            "product_name", "variant_name", "sku",
            # original sale line context
            "original_quantity",
            "original_unit_price",
            "original_subtotal",
            "original_discount",
            "original_tax",
            "original_fee",
            "original_total",
        ]
        read_only_fields = ("refund_subtotal", "refund_tax", "refund_total", "created_at")

    def get_original_subtotal(self, obj):
        sl = obj.sale_line
        line_total = sl.line_total or Decimal("0")
        discount = sl.discount or Decimal("0")
        tax = sl.tax or Decimal("0")
        fee = sl.fee or Decimal("0")
        return line_total + discount - tax - fee

    def get_product_name(self, obj):
        # prefer snapshots on sale_line if present; else traverse variant → product
        sl = getattr(obj, "sale_line", None)
        if sl is None:
            return None
        snap = getattr(sl, "product_name", None)
        if snap:
            return snap
        v = getattr(sl, "variant", None)
        p = getattr(v, "product", None) if v is not None else None
        return getattr(p, "name", None)

    def get_variant_name(self, obj):
        sl = getattr(obj, "sale_line", None)
        if sl is None:
            return None
        snap = getattr(sl, "variant_name", None)
        if snap:
            return snap
        v = getattr(sl, "variant", None)
        return getattr(v, "name", None)

    def get_sku(self, obj):
        sl = getattr(obj, "sale_line", None)
        if sl is None:
            return None
        snap = getattr(sl, "sku", None)
        if snap:
            return snap
        v = getattr(sl, "variant", None)
        return getattr(v, "sku", None)


class RefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = Refund
        fields = ["id", "method", "amount", "external_ref", "created_at"]


class ReturnSerializer(serializers.ModelSerializer):
    items = ReturnItemSerializer(many=True, read_only=True)
    refunds = RefundSerializer(many=True, read_only=True)
    sale_receipt_no = serializers.CharField(source="sale.receipt_no", read_only=True)
    refund_subtotal_total = serializers.SerializerMethodField()
    refund_tax_total = serializers.SerializerMethodField()


    class Meta:
        model = Return
        fields = [
            "id", "return_no", "status", "sale", "sale_receipt_no",
            "store", "processed_by", "reason_code", "notes",
            "refund_total", "items", "refunds",
            "refund_subtotal_total", "refund_tax_total",
            "created_at", "updated_at",
        ]
        read_only_fields = ("return_no", "refund_total", "created_at", "updated_at")

    def get_refund_subtotal_total(self, obj):
        val = obj.items.aggregate(s=Sum("refund_subtotal"))["s"]
        return val or Decimal("0.00")

    def get_refund_tax_total(self, obj):
        val = obj.items.aggregate(s=Sum("refund_tax"))["s"]
        return val or Decimal("0.00")


class ReturnListSerializer(serializers.ModelSerializer):
    sale_receipt_no = serializers.CharField(source="sale.receipt_no", read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    store_code = serializers.CharField(source="store.code", read_only=True)
    cashier_name = serializers.SerializerMethodField()
    processed_by_name = serializers.SerializerMethodField()
    reason_summary = serializers.SerializerMethodField()
    refund_subtotal_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    refund_tax_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    items_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Return
        fields = [
            "id",
            "return_no",
            "status",
            "sale",
            "sale_receipt_no",
            "store",
            "store_name",
            "store_code",
            "cashier_name",
            "processed_by_name",
            "reason_code",
            "reason_summary",
            "refund_total",
            "refund_subtotal_total",
            "refund_tax_total",
            "items_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_cashier_name(self, obj):
        cashier = getattr(obj.sale, "cashier", None)
        if not cashier:
            return None
        return cashier.get_full_name() or cashier.username

    def get_processed_by_name(self, obj):
        user = getattr(obj, "processed_by", None)
        if not user:
            return None
        return user.get_full_name() or user.username

    def get_reason_summary(self, obj):
        if obj.reason_code:
            return obj.reason_code
        return getattr(obj, "first_item_reason", None)


class SalePaymentListSerializer(serializers.ModelSerializer):
    sale_receipt_no = serializers.CharField(source="sale.receipt_no", read_only=True)
    store_name = serializers.CharField(source="sale.store.name", read_only=True)
    store_code = serializers.CharField(source="sale.store.code", read_only=True)
    cashier_name = serializers.SerializerMethodField()

    class Meta:
        model = SalePayment
        fields = [
            "id",
            "sale_id",
            "sale_receipt_no",
            "store_name",
            "store_code",
            "cashier_name",
            "type",
            "amount",
            "received",
            "change",
            "txn_ref",
            "meta",
            "created_at",
        ]
        read_only_fields = fields

    def get_cashier_name(self, obj):
        cashier = getattr(obj.sale, "cashier", None)
        if not cashier:
            return None
        return cashier.get_full_name() or cashier.username


class RefundListSerializer(serializers.ModelSerializer):
    return_no = serializers.CharField(source="return_ref.return_no", read_only=True)
    sale_id = serializers.IntegerField(source="return_ref.sale_id", read_only=True)
    sale_receipt_no = serializers.CharField(source="return_ref.sale.receipt_no", read_only=True)
    store_name = serializers.CharField(source="return_ref.store.name", read_only=True)
    store_code = serializers.CharField(source="return_ref.store.code", read_only=True)

    class Meta:
        model = Refund
        fields = [
            "id",
            "return_ref_id",
            "return_no",
            "sale_id",
            "sale_receipt_no",
            "store_name",
            "store_code",
            "method",
            "amount",
            "external_ref",
            "created_at",
        ]
        read_only_fields = fields


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
            # NEW: per-line reason/notes validation
            reason = (item.get("reason_code") or "").strip()
            notes = (item.get("notes") or "").strip()
            if not reason:
                raise serializers.ValidationError({idx: "reason_code is required when returning an item"})
            if len(notes) > 250:
                raise serializers.ValidationError({idx: "notes must be ≤ 250 characters"})

        return data


class ReturnFinalizeSerializer(serializers.Serializer):
    refunds = RefundSerializer(many=True)
