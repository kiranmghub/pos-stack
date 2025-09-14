# # core/api.py
# from rest_framework.routers import DefaultRouter
#
# from catalog.views import ProductViewSet, VariantViewSet, TaxCategoryViewSet
# from stores.views import StoreViewSet, RegisterViewSet  # if you have them
# from orders.views import SaleViewSet, SaleLineViewSet   # if you have them
# from inventory.views import InventoryItemViewSet, StockLedgerEntryViewSet
# from customers.views import CustomerViewSet
# from payments.views import PaymentViewSet
# from pricing.views import PriceListViewSet, PriceListItemViewSet
#
# router = DefaultRouter()
# # Catalog
# router.register(r"products", ProductViewSet, basename="product")
# router.register(r"variants", VariantViewSet, basename="variant")
# router.register(r"tax-categories", TaxCategoryViewSet, basename="taxcategory")
# # Stores
# # router.register(r"stores", StoreViewSet, basename="store")
# # router.register(r"registers", RegisterViewSet, basename="register")
# # Orders
# # router.register(r"sales", SaleViewSet, basename="sale")
# # router.register(r"sale-lines", SaleLineViewSet, basename="saleline")
# # Inventory
# # router.register(r"inventory-items", InventoryItemViewSet, basename="inventoryitem")
# # router.register(r"stock-ledger", StockLedgerEntryViewSet, basename="stockledgerentry")
# # Customers
# # router.register(r"customers", CustomerViewSet, basename="customer")
# # Payments
# # router.register(r"payments", PaymentViewSet, basename="payment")
# # Pricing
# # router.register(r"price-lists", PriceListViewSet, basename="pricelist")
# # router.register(r"price-list-items", PriceListItemViewSet, basename="pricelistitem")


# core/api.py
from rest_framework.routers import DefaultRouter

from catalog.views import ProductViewSet, VariantViewSet, TaxCategoryViewSet
from stores.views import StoreViewSet, RegisterViewSet

router = DefaultRouter()
# Catalog
router.register(r"products", ProductViewSet, basename="product")
router.register(r"variants", VariantViewSet, basename="variant")
router.register(r"tax-categories", TaxCategoryViewSet, basename="taxcategory")
# Stores
router.register(r"stores", StoreViewSet, basename="store")
router.register(r"registers", RegisterViewSet, basename="register")
