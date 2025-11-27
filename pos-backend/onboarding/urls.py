from django.urls import path
from .views import (
    OnboardingStateView,
    OnboardingMarkView,
    GenerateCodeView,
    StoreCreateView,
    RegisterCreateView,
    TaxCategoryCreateView,
    TaxRuleCreateView,
    CatalogImportCompleteView,
    TenantMetaView,
)

urlpatterns = [
    path("state", OnboardingStateView.as_view(), name="onboarding-state"),
    path("mark", OnboardingMarkView.as_view(), name="onboarding-mark"),
    path("generate-code", GenerateCodeView.as_view(), name="onboarding-generate-code"),
    path("store", StoreCreateView.as_view(), name="onboarding-store"),
    path("register", RegisterCreateView.as_view(), name="onboarding-register"),
    path("tax-category", TaxCategoryCreateView.as_view(), name="onboarding-tax-category"),
    path("tax-rule", TaxRuleCreateView.as_view(), name="onboarding-tax-rule"),
    path("catalog-import-complete", CatalogImportCompleteView.as_view(), name="onboarding-catalog-import-complete"),
    path("tenant", TenantMetaView.as_view(), name="onboarding-tenant-meta"),
]
