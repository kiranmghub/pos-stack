# tenant_admin/urls.py
from django.urls import path
from .api import (
    AdminUsersView, AdminUserDetailView,
    AdminStoresView, AdminStoreDetailView,
    AdminRegistersView, AdminRegisterDetailView,
    AdminTaxCategoriesView, AdminTaxCategoryDetailView,
)

urlpatterns = [
    path("users", AdminUsersView.as_view()),
    path("users/<int:pk>", AdminUserDetailView.as_view()),
    path("stores", AdminStoresView.as_view()),
    path("stores/<int:pk>", AdminStoreDetailView.as_view()),
    path("registers", AdminRegistersView.as_view()),
    path("registers/<int:pk>", AdminRegisterDetailView.as_view()),
    path("tax_categories", AdminTaxCategoriesView.as_view()),
    path("tax_categories/<int:pk>", AdminTaxCategoryDetailView.as_view()),
]
