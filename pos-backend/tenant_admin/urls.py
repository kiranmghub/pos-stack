# pos-backend/tenant_admin/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import tenant_roles, TenantDetailView, TenantLogoUploadView

from .views import (
    TenantUserViewSet,
    StoreViewSet,
    RegisterViewSet,
    TaxCategoryViewSet,
    TaxRuleViewSet,
    DiscountRuleViewSet,
    CouponViewSet,
)

router = DefaultRouter()
router.register("users", TenantUserViewSet, basename="admin-users")
router.register("stores", StoreViewSet, basename="admin-stores")
router.register("registers", RegisterViewSet, basename="admin-registers")
router.register("tax-categories", TaxCategoryViewSet, basename="admin-tax-categories")
router.register("tax-rules", TaxRuleViewSet, basename="admin-tax-rules")
router.register("discount-rules", DiscountRuleViewSet, basename="admin-discount-rules")
router.register("coupons", CouponViewSet, basename="admin-coupons")

urlpatterns = [
    path("", include(router.urls)),
    path("roles/tenant", tenant_roles, name="tenant-roles"),
    path("tenant", TenantDetailView.as_view(), name="tenant-detail"),
    path("tenant/logo", TenantLogoUploadView.as_view(), name="tenant-logo-upload"),
]
