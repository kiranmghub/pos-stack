# analytics/serializers.py
from rest_framework import serializers


class OwnerSummarySerializer(serializers.Serializer):
    revenue_today = serializers.FloatField()
    orders_today = serializers.IntegerField()
    aov_today = serializers.FloatField()
    active_stores = serializers.IntegerField()
    delta_revenue_pct = serializers.FloatField(required=False)


class TrendPointSerializer(serializers.Serializer):
    date = serializers.CharField()
    revenue = serializers.FloatField()
    orders = serializers.IntegerField()


class StoreRevenueSerializer(serializers.Serializer):
    store_code = serializers.CharField()
    store_name = serializers.CharField()
    revenue = serializers.FloatField()
    orders = serializers.IntegerField()


class TopProductSerializer(serializers.Serializer):
    sku = serializers.CharField()
    name = serializers.CharField()
    revenue = serializers.FloatField()
    qty = serializers.IntegerField()
