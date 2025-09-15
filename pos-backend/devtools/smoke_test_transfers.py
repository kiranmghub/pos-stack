import json
from django.contrib.auth.models import User
from tenants.models import Tenant, TenantUser
from stores.models import Store
from catalog.models import Product, Variant
from inventory.models import InventoryTransfer, InventoryTransferLine, InventoryItem
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

# Setup data
user, _ = User.objects.get_or_create(username='tester', defaults={'email': 't@example.com'})
user.set_password('pass')
user.is_staff = True
user.save()

tenant, _ = Tenant.objects.get_or_create(code='t1', defaults={'name': 'Tenant 1'})
TenantUser.objects.get_or_create(user=user, tenant=tenant)

from_store, _ = Store.objects.get_or_create(
    tenant=tenant, code='s1',
    defaults={'name': 'Store 1', 'street': '1 Main', 'city': 'Austin', 'state': 'TX', 'postal_code': '73301'}
)
to_store, _ = Store.objects.get_or_create(
    tenant=tenant, code='s2',
    defaults={'name': 'Store 2', 'street': '2 Main', 'city': 'Austin', 'state': 'TX', 'postal_code': '73301'}
)

prod, _ = Product.objects.get_or_create(tenant=tenant, name='Widget')
var, _ = Variant.objects.get_or_create(product=prod, sku='W1', defaults={'price': 10, 'cost': 5})

# Ensure some stock exists at from_store
InventoryItem.objects.get_or_create(tenant=tenant, store=from_store, variant=var, defaults={'on_hand': 5})

# Create a draft transfer
t = InventoryTransfer.objects.create(tenant=tenant, from_store=from_store, to_store=to_store, notes='test', created_by=user)
InventoryTransferLine.objects.create(transfer=t, variant=var, qty=2)

# Build auth
access = AccessToken.for_user(user)
client = APIClient()
client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(access)}', HTTP_X_TENANT_ID=str(tenant.id))

# Path-style send
resp1 = client.post(f'/api/v1/inventory/transfers/{t.id}/send')

# Query-style receive
resp2 = client.post(f'/api/v1/inventory/transfers/{t.id}?action=receive')

print(json.dumps({
    'created_transfer_id': t.id,
    'send_status': resp1.status_code,
    'send_body': resp1.json() if hasattr(resp1, 'json') else getattr(resp1, 'data', str(resp1.content)[:200]).__class__.__name__,
    'receive_status': resp2.status_code,
    'receive_body': resp2.json() if hasattr(resp2, 'json') else getattr(resp2, 'data', str(resp2.content)[:200]).__class__.__name__,
}))

