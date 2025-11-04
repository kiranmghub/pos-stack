# pos-backend/core/urls.py
"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from django.conf import settings
from django.conf.urls.static import static

from catalog.api_variants import VariantSearchView
from common.auth_views import TenantAwareTokenObtainPairView
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView
from .api import router  # ← single router for everything

from catalog.api import (
    CatalogProductListCreateView,
    CatalogProductDetailView,
    VariantDetailView,
    TaxCategoryListView,
    CategoryListView, ProductImageUploadView, VariantImageUploadView, CodeGenerateView, BarcodeGenerateView
)
# from inventory.api import AdjustStockView
from rest_framework.routers import DefaultRouter
from catalog.api import ProductViewSet, VariantViewSet
from stores.views import StoreLiteViewSet


router = DefaultRouter()
router.register(r"catalog/products", ProductViewSet, basename="catalog-products")
router.register(r"catalog/variants", VariantViewSet, basename="catalog-variants")


urlpatterns = [
    path("", RedirectView.as_view(url="/admin/", permanent=False)),
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),

    # Auth
    path("api/v1/auth/token/", TenantAwareTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/v1/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/v1/auth/verify/", TokenVerifyView.as_view(), name="token_verify"),

    # API & docs
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/v1/docs/", SpectacularSwaggerView.as_view(url_name="schema")),
    path("api/v1/", include(router.urls)),
    path("api/v1/analytics/", include("analytics.urls")),
    # path("api/v1/inventory/", include("inventory.urls")),
    path("api/v1/orders/", include("orders.urls", namespace="orders")),
    path("api/v1/pos/", include("pos.urls", namespace="pos")),
    # Catalog
    path("api/v1/catalog/products", CatalogProductListCreateView.as_view()),
    path("api/v1/catalog/products/<int:pk>", CatalogProductDetailView.as_view()),
    path("api/v1/catalog/variants/<int:pk>", VariantDetailView.as_view()),
    # path("api/v1/catalog/taxes", TaxCategoryListView.as_view()),
    path("api/v1/catalog/tax_categories", TaxCategoryListView.as_view()),
    path("api/v1/catalog/categories", CategoryListView.as_view()),

    # Inventory
    # path("api/v1/inventory/adjust", AdjustStockView.as_view()),
    path("api/v1/inventory/", include("inventory.urls", namespace="inventory")),
    # Variants
    path("api/v1/catalog/variants", VariantSearchView.as_view(), name="variant-search"),
    path("api/v1/catalog/products/<int:pk>/image", ProductImageUploadView.as_view()),
    path("api/v1/catalog/variants/<int:pk>/image", VariantImageUploadView.as_view()),
    path("api/v1/tenant_admin/", include("tenant_admin.urls")),
    path("api/v1/discounts/", include("discounts.urls", namespace="discounts")),
    path("api/v1/taxes/", include("taxes.urls", namespace="taxes")),
    path("api/v1/tenant-admin/", include("tenant_admin.urls")),
    path("api/v1/catalog/codes", CodeGenerateView.as_view()),
    path("api/v1/catalog/barcodes", BarcodeGenerateView.as_view()),
    path("api/v1/stores/stores-lite", StoreLiteViewSet.as_view({"get": "list"}), name="stores-lite",
    ),


]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

