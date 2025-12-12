"""
Temporary script to inspect variant tenant relationships
Run with: python manage.py shell < catalog/inspect_variants.py
Or copy-paste into: python manage.py shell
"""
from catalog.models import Variant, Product
from tenants.models import Tenant

# Check for variants where variant.tenant != variant.product.tenant
print("\n=== Checking for variant/product tenant mismatches ===\n")

mismatches = []
for variant in Variant.objects.select_related('product', 'tenant', 'product__tenant').all():
    if variant.product and variant.tenant_id != variant.product.tenant_id:
        mismatches.append({
            'variant_id': variant.id,
            'variant_sku': variant.sku,
            'variant_tenant_id': variant.tenant_id,
            'variant_tenant_code': variant.tenant.code if variant.tenant else None,
            'product_id': variant.product.id,
            'product_name': variant.product.name,
            'product_tenant_id': variant.product.tenant_id,
            'product_tenant_code': variant.product.tenant.code if variant.product.tenant else None,
        })

if mismatches:
    print(f"Found {len(mismatches)} variants with tenant mismatches:\n")
    for m in mismatches[:10]:  # Show first 10
        print(f"Variant ID {m['variant_id']} (SKU: {m['variant_sku']}):")
        print(f"  Variant tenant: {m['variant_tenant_id']} ({m['variant_tenant_code']})")
        print(f"  Product tenant: {m['product_tenant_id']} ({m['product_tenant_code']})")
        print(f"  Product: {m['product_name']} (ID: {m['product_id']})")
        print()
    if len(mismatches) > 10:
        print(f"... and {len(mismatches) - 10} more\n")
else:
    print("✓ No tenant mismatches found\n")

# Check for variants with missing product
print("\n=== Checking for variants with missing products ===\n")
missing_products = Variant.objects.filter(product__isnull=True).count()
if missing_products:
    print(f"⚠ Found {missing_products} variants with NULL product\n")
else:
    print("✓ All variants have products\n")

# Check for variants with missing tenant
print("\n=== Checking for variants with missing tenant ===\n")
missing_tenant = Variant.objects.filter(tenant__isnull=True).count()
if missing_tenant:
    print(f"⚠ Found {missing_tenant} variants with NULL tenant\n")
else:
    print("✓ All variants have tenant\n")

# Check for products with missing tenant
print("\n=== Checking for products with missing tenant ===\n")
products_missing_tenant = Product.objects.filter(tenant__isnull=True).count()
if products_missing_tenant:
    print(f"⚠ Found {products_missing_tenant} products with NULL tenant\n")
else:
    print("✓ All products have tenant\n")

# Per-tenant analysis
print("\n=== Per-tenant variant counts ===\n")
for tenant in Tenant.objects.all():
    variant_count = Variant.objects.filter(tenant=tenant).count()
    variant_count_by_product = Variant.objects.filter(product__tenant=tenant).count()
    product_count = Product.objects.filter(tenant=tenant).count()
    
    if variant_count != variant_count_by_product:
        print(f"⚠ Tenant {tenant.code} (ID: {tenant.id}):")
        print(f"  Variants by variant.tenant: {variant_count}")
        print(f"  Variants by product.tenant: {variant_count_by_product}")
        print(f"  Difference: {variant_count_by_product - variant_count}")
        print(f"  Products: {product_count}\n")
    else:
        print(f"✓ Tenant {tenant.code}: {variant_count} variants, {product_count} products\n")

# Check specific tenant that's not working
print("\n=== Variants accessible by product__tenant filter (as used in search) ===\n")
# This simulates what the search API does
for tenant in Tenant.objects.all():
    variants_by_product = Variant.objects.filter(product__tenant=tenant).count()
    variants_by_direct = Variant.objects.filter(tenant=tenant).count()
    
    if variants_by_direct > 0 and variants_by_product == 0:
        print(f"⚠ Tenant {tenant.code} (ID: {tenant.id}):")
        print(f"  Has {variants_by_direct} variants but search would find 0!")
        print(f"  This tenant likely has the issue.\n")
        
        # Show sample variants
        sample_variants = Variant.objects.filter(tenant=tenant).select_related('product')[:5]
        for v in sample_variants:
            print(f"    Variant {v.id} ({v.sku}):")
            print(f"      variant.tenant_id = {v.tenant_id}")
            if v.product:
                print(f"      product.tenant_id = {v.product.tenant_id}")
            else:
                print(f"      product = NULL")
            print()

