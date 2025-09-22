# tenant_admin/api.py
from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from common.permissions import IsOwnerOrAdmin
from common.roles import TenantRole
from stores.models import Store, Register
from catalog.models import TaxCategory
from tenants.models import TenantUser

User = get_user_model()

def _resolve_request_tenant(request):
    return getattr(request, "tenant", None)

# ---------- SERIALIZERS ----------

class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "is_active")

class TenantUserSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer()

    class Meta:
        model = TenantUser
        fields = ("id", "user", "role")

class TenantUserCreateUpdateSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)  # for update
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(allow_blank=True, required=False)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=TenantRole.choices)

    def validate_role(self, val):
        if val not in (TenantRole.OWNER, TenantRole.ADMIN, TenantRole.MANAGER, TenantRole.CASHIER, TenantRole.ACCOUNTANT, TenantRole.AUDITOR):
            raise serializers.ValidationError("Invalid role")
        return val

# Stores / Registers / Tax categories

class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = (
            "id", "code", "name",
            "timezone", "street", "city", "state", "postal_code", "country",
            "is_active",
        )


class RegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Register
        fields = ("id", "store", "code", "name")

class TaxCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCategory
        fields = ("id", "name", "code", "rate")

# ---------- VIEWS ----------

class AdminUsersView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        q = (request.GET.get("q") or "").strip()
        qs = TenantUser.objects.select_related("user").filter(tenant=tenant)
        if q:
            qs = qs.filter(user__username__icontains=q) | qs.filter(user__email__icontains=q) | qs.filter(user__first_name__icontains=q) | qs.filter(user__last_name__icontains=q)
        rows = [
            {
                "id": tu.id,
                "user": {
                    "id": tu.user.id,
                    "username": tu.user.username,
                    "email": tu.user.email or "",
                    "first_name": tu.user.first_name or "",
                    "last_name": tu.user.last_name or "",
                    "is_active": tu.user.is_active,
                },
                "role": tu.role,
            }
            for tu in qs.order_by("user__username")
        ]
        return Response(rows)

    @transaction.atomic
    def post(self, request):
        tenant = _resolve_request_tenant(request)
        ser = TenantUserCreateUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        # Create or update User
        user = User.objects.filter(username=data["username"]).first()
        if not user:
            user = User(username=data["username"])
        for f in ("email", "first_name", "last_name"):
            if f in data:
                setattr(user, f, data.get(f) or "")
        if data.get("password"):
            user.set_password(data["password"])
        user.is_active = True
        user.save()

        # Ensure TenantUser link
        tu, _ = TenantUser.objects.get_or_create(tenant=tenant, user=user, defaults={"role": data["role"]})
        if tu.role != data["role"]:
            tu.role = data["role"]
            tu.save(update_fields=["role"])

        out = {
            "id": tu.id,
            "user": UserMiniSerializer(user).data,
            "role": tu.role,
        }
        return Response(out, status=status.HTTP_201_CREATED)

class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    @transaction.atomic
    def patch(self, request, pk):
        tenant = _resolve_request_tenant(request)
        tu = get_object_or_404(TenantUser.objects.select_related("user"), pk=pk, tenant=tenant)

        ser = TenantUserCreateUpdateSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        # Update user fields
        user = tu.user
        for f in ("email", "first_name", "last_name"):
            if f in data:
                setattr(user, f, data.get(f) or "")
        if "password" in data and (data.get("password") or ""):
            user.set_password(data["password"])
        user.save()

        # Update role
        if "role" in data and data["role"] != tu.role:
            tu.role = data["role"]
            tu.save(update_fields=["role"])

        return Response({
            "id": tu.id,
            "user": UserMiniSerializer(user).data,
            "role": tu.role,
        })

    @transaction.atomic
    def delete(self, request, pk):
        tenant = _resolve_request_tenant(request)
        tu = get_object_or_404(TenantUser, pk=pk, tenant=tenant)
        user = tu.user
        tu.delete()
        # If user has no other tenant memberships, deactivate
        if not TenantUser.objects.filter(user=user).exists():
            user.is_active = False
            user.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)

# Stores
class AdminStoresView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        q = (request.GET.get("q") or "").strip()
        qs = Store.objects.filter(tenant=tenant)
        if q:
        #     qs = qs.filter(name__icontains=q) | qs.filter(code__icontains=q)
        # return Response(StoreSerializer(qs.order_by("name"), many=True).data)
            qs = qs.filter(code__icontains=q) | qs.filter(name__icontains=q) | qs.filter(city__icontains=q) | qs.filter(state__icontains=q)
        data = StoreSerializer(qs.order_by("name"), many=True).data
        return Response(data)

    @transaction.atomic
    def post(self, request):
        tenant = _resolve_request_tenant(request)
        ser = StoreSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        obj = Store(tenant=tenant, **ser.validated_data)
        obj.save()
        return Response(StoreSerializer(obj).data, status=status.HTTP_201_CREATED)

class AdminStoreDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    @transaction.atomic
    def patch(self, request, pk):
        tenant = _resolve_request_tenant(request)
        obj = get_object_or_404(Store, pk=pk, tenant=tenant)
        ser = StoreSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.update(obj, ser.validated_data)
        return Response(StoreSerializer(obj).data)

    @transaction.atomic
    def delete(self, request, pk):
        tenant = _resolve_request_tenant(request)
        obj = get_object_or_404(Store, pk=pk, tenant=tenant)
        # Optional: prevent delete if registers exist
        if Register.objects.filter(store=obj).exists():
            return Response({"detail": "Cannot delete store with registers."}, status=400)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# Registers
class AdminRegistersView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        store_id = request.GET.get("store_id")
        qs = Register.objects.select_related("store").filter(store__tenant=tenant)
        if store_id:
            qs = qs.filter(store_id=store_id)
        return Response(RegisterSerializer(qs.order_by("store__name", "code"), many=True).data)

    @transaction.atomic
    def post(self, request):
        tenant = _resolve_request_tenant(request)
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        store = get_object_or_404(Store, pk=ser.validated_data["store"].id, tenant=tenant)
        obj = Register(store=store, code=ser.validated_data["code"], name=ser.validated_data.get("name") or ser.validated_data["code"])
        obj.save()
        return Response(RegisterSerializer(obj).data, status=status.HTTP_201_CREATED)

class AdminRegisterDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def patch(self, request, pk):
        tenant = _resolve_request_tenant(request)
        obj = get_object_or_404(Register.objects.select_related("store"), pk=pk, store__tenant=tenant)
        ser = RegisterSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.update(obj, ser.validated_data)
        return Response(RegisterSerializer(obj).data)

    def delete(self, request, pk):
        tenant = _resolve_request_tenant(request)
        obj = get_object_or_404(Register.objects.select_related("store"), pk=pk, store__tenant=tenant)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# Tax categories
class AdminTaxCategoriesView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        q = (request.GET.get("q") or "").strip()
        qs = TaxCategory.objects.filter(tenant=tenant)
        if q:
            qs = qs.filter(name__icontains=q) | qs.filter(code__icontains=q)
        return Response(TaxCategorySerializer(qs.order_by("name"), many=True).data)

    @transaction.atomic
    def post(self, request):
        tenant = _resolve_request_tenant(request)
        ser = TaxCategorySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        obj = TaxCategory(tenant=tenant, **ser.validated_data)
        obj.save()
        return Response(TaxCategorySerializer(obj).data, status=status.HTTP_201_CREATED)

class AdminTaxCategoryDetailView(APIView):
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def patch(self, request, pk):
        tenant = _resolve_request_tenant(request)
        obj = get_object_or_404(TaxCategory, pk=pk, tenant=tenant)
        ser = TaxCategorySerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.update(obj, ser.validated_data)
        return Response(TaxCategorySerializer(obj).data)

    def delete(self, request, pk):
        tenant = _resolve_request_tenant(request)
        obj = get_object_or_404(TaxCategory, pk=pk, tenant=tenant)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
