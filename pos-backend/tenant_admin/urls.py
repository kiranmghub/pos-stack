# tenant_admin/urls.py
# from django.urls import path
# from .api import (
#     AdminUsersView, AdminUserDetailView,
#     AdminStoresView, AdminStoreDetailView,
#     AdminRegistersView, AdminRegisterDetailView,
#     AdminTaxCategoriesView, AdminTaxCategoryDetailView,
# )

# urlpatterns = [
#     path("users", AdminUsersView.as_view()),
#     path("users/<int:pk>", AdminUserDetailView.as_view()),
#     path("stores", AdminStoresView.as_view()),
#     path("stores/<int:pk>", AdminStoreDetailView.as_view()),
#     path("registers", AdminRegistersView.as_view()),
#     path("registers/<int:pk>", AdminRegisterDetailView.as_view()),
#     path("tax_categories", AdminTaxCategoriesView.as_view()),
#     path("tax_categories/<int:pk>", AdminTaxCategoryDetailView.as_view()),
# ]

# pos-backend/tenant_admin/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

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
]
