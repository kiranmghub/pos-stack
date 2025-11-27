from rest_framework import serializers


class OnboardingMarkSerializer(serializers.Serializer):
    step = serializers.ChoiceField(
        choices=[
            "basic_profile",
            "store_setup",
            "registers",
            "taxes",
            "catalog",
            "variants",
            "live",
        ]
    )


class GenerateCodeSerializer(serializers.Serializer):
    model = serializers.ChoiceField(choices=["store", "register", "taxcategory", "taxrule", "product"])
    base = serializers.CharField(max_length=120, required=False, allow_blank=True)


class StoreCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    code = serializers.SlugField()
    timezone = serializers.CharField(max_length=64, required=False, allow_blank=True)
    street = serializers.CharField(max_length=200, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    country = serializers.CharField(max_length=50, required=False, allow_blank=True)
    region = serializers.CharField(max_length=100, required=False, allow_blank=True)
    phone_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    mobile_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    fax_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    contact_person = serializers.CharField(max_length=120, required=False, allow_blank=True)
    landmark = serializers.CharField(max_length=200, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.JSONField(required=False)
    geo_lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    geo_lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    opening_time = serializers.TimeField(required=False, allow_null=True)
    closing_time = serializers.TimeField(required=False, allow_null=True)
    tax_id = serializers.CharField(max_length=50, required=False, allow_blank=True)
    is_primary = serializers.BooleanField(required=False)


class RegisterCreateSerializer(serializers.Serializer):
    store_id = serializers.IntegerField()
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    code = serializers.SlugField()
    pin = serializers.CharField(max_length=10, required=False, allow_blank=True)


class TaxCategoryCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    code = serializers.SlugField()
    rate = serializers.DecimalField(max_digits=6, decimal_places=4)


class TaxRuleCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    code = serializers.SlugField()
    basis = serializers.ChoiceField(choices=["PCT", "FLAT"], default="PCT")
    rate = serializers.DecimalField(max_digits=6, decimal_places=4, required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    apply_scope = serializers.ChoiceField(choices=["LINE", "RECEIPT"], default="LINE")
    tax_category_id = serializers.IntegerField(required=False)


class CatalogImportCompleteSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["products", "variants"])


class TenantMetaSerializer(serializers.Serializer):
    code = serializers.CharField()
    country = serializers.CharField(allow_blank=True, required=False)
