# devtools/management/commands/seed_demo.py
import random
from decimal import Decimal
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction

from tenants.models import Tenant
from stores.models import Store
from catalog.models import Product, Variant, TaxCategory
from inventory.models import InventoryItem
from orders.models import Sale, SaleLine

# Optional imports (present in your project)
try:
    from tenants.models import TenantUser
except Exception:
    TenantUser = None

try:
    from common.roles import TenantRole
except Exception:
    class TenantRole:
        OWNER = "owner"
        MANAGER = "manager"
        CASHIER = "cashier"


DEMO_PRODUCT_NAMES = [
    "Acrylic Paint Gallon",
    "Pro Brush Set (5pc)",
    "9\" Roller Pro",
    "Painter's Tape 2\"",
    "Thinner 1L",
    "Drop Cloth XL",
    "Primer 1G",
    "Edger Tool",
]


class Command(BaseCommand):
    help = "Seed demo data for Owner dashboard: tenant, stores, catalog, inventory, and recent sales."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-code", default="KIRASHASHI123")
        parser.add_argument("--owner-username", default="owner1")
        parser.add_argument("--owner-password", default="owner123")
        parser.add_argument("--stores", type=int, default=3)
        parser.add_argument("--products", type=int, default=6)
        parser.add_argument("--variants-per-product", type=int, default=2)
        parser.add_argument("--days", type=int, default=14)
        parser.add_argument("--max-orders-per-day", type=int, default=12)
        parser.add_argument("--cashier-password", default="cashier123")

    @transaction.atomic
    def handle(self, *args, **opts):
        tenant_code = opts["tenant_code"]
        owner_username = opts["owner_username"]
        owner_password = opts["owner_password"]
        num_stores = opts["stores"]
        num_products = opts["products"]
        variants_per_product = opts["variants_per_product"]
        days = opts["days"]
        max_orders_per_day = opts["max_orders_per_day"]
        cashier_password = opts["cashier_password"]

        User = get_user_model()

        # -- Tenant
        tenant, _ = Tenant.objects.get_or_create(code=tenant_code, defaults={"name": f"{tenant_code} Tenant"})
        self.stdout.write(self.style.SUCCESS(f"Tenant: {tenant.code} (id={tenant.id})"))

        # -- Owner user
        owner, created = User.objects.get_or_create(
            username=owner_username,
            defaults={"email": f"{owner_username}@demo.local"}
        )
        if created:
            owner.set_password(owner_password)
            owner.save(update_fields=["password"])
            self.stdout.write(self.style.SUCCESS(f"Created owner user: {owner_username} / {owner_password}"))
        else:
            self.stdout.write(self.style.WARNING(f"Owner user exists: {owner_username} (password unchanged)"))

        # -- Tenant membership (owner)
        if TenantUser:
            tu, _ = TenantUser.objects.get_or_create(
                tenant=tenant, user=owner,
                defaults={"role": TenantRole.OWNER, "is_active": True}
            )
            changed = False
            if getattr(tu, "role", None) != TenantRole.OWNER:
                tu.role = TenantRole.OWNER; changed = True
            if getattr(tu, "is_active", True) is not True:
                tu.is_active = True; changed = True
            if changed:
                tu.save(update_fields=["role", "is_active"])
            self.stdout.write(self.style.SUCCESS(f"Tenant membership ensured for {owner_username} as OWNER"))

        # -- Stores
        stores = []
        base_codes = ["CHI-01", "DAL-02", "AUS-01", "NYC-01", "SFO-01", "SEA-01"]
        for i in range(num_stores):
            code = base_codes[i % len(base_codes)]
            store, _ = Store.objects.get_or_create(
                tenant=tenant, code=code,
                defaults={"name": f"Store {code}", "timezone": "America/Chicago"}
            )
            stores.append(store)
        self.stdout.write(self.style.SUCCESS(f"Stores: {[s.code for s in stores]}"))

        # -- Per-store cashiers (so Sale.cashier is never NULL)
        cashiers_by_store = {}
        for store in stores:
            uname = f"cashier_{store.code.lower()}"
            user, u_created = User.objects.get_or_create(
                username=uname,
                defaults={"email": f"{uname}@demo.local"}
            )
            if u_created:
                user.set_password(cashier_password)
                user.save(update_fields=["password"])
            if TenantUser:
                ctu, _ = TenantUser.objects.get_or_create(
                    tenant=tenant, user=user,
                    defaults={"role": TenantRole.CASHIER, "is_active": True}
                )
                # keep them active cashiers
                changed = False
                if getattr(ctu, "role", None) != TenantRole.CASHIER:
                    ctu.role = TenantRole.CASHIER; changed = True
                if getattr(ctu, "is_active", True) is not True:
                    ctu.is_active = True; changed = True
                if changed:
                    ctu.save(update_fields=["role", "is_active"])
            cashiers_by_store[store.id] = user
        self.stdout.write(self.style.SUCCESS("Cashier users ensured per store."))

        # -- Optional: registers (if Sale has a non-nullable register FK)
        # -- Optional: registers (if Sale has a non-nullable register FK)
        registers_by_store = {}
        sale_field_names = {f.name for f in Sale._meta.get_fields()}
        if "register" in sale_field_names:
            from stores.models import Register

            reg_field_names = {f.name for f in Register._meta.get_fields()}

            for store in stores:
                # Build lookup: most schemas use unique_together (store, code)
                lookup = {"store": store}
                if "code" in reg_field_names:
                    lookup["code"] = "REG-1"
                elif "slug" in reg_field_names:
                    lookup["slug"] = "reg-1"
                elif "identifier" in reg_field_names:
                    lookup["identifier"] = "REG-1"
                else:
                    # Fallback: only store; we will still create one but without a code-like field
                    pass

                # Build defaults only with fields that truly exist
                defaults = {}

                # Friendly display name
                if "label" in reg_field_names:
                    defaults["label"] = f"Front Register - {store.code}"
                elif "display_name" in reg_field_names:
                    defaults["display_name"] = f"Front Register - {store.code}"
                # (Do NOT set 'name' unless it's present)
                elif "name" in reg_field_names:
                    defaults["name"] = f"Front Register - {store.code}"

                # Active flag, if present
                if "is_active" in reg_field_names:
                    defaults["is_active"] = True

                # Some schemas include tenant directly on Register (even though Store already has tenant)
                if "tenant" in reg_field_names:
                    defaults.setdefault("tenant", tenant)

                reg, _ = Register.objects.get_or_create(**lookup, defaults=defaults)
                registers_by_store[store.id] = reg

            self.stdout.write(self.style.SUCCESS("Registers ensured per store."))

        # -- Tax Category (tenant-scoped)
        tax_defaults = {"rate": Decimal("0.0825")}
        if hasattr(TaxCategory, "code"):
            tax_defaults["code"] = "STD"
        tax_cat, _ = TaxCategory.objects.get_or_create(
            tenant=tenant, name="Standard", defaults=tax_defaults
        )

        # -- Catalog: Products & Variants
        products = []
        for i in range(num_products):
            name = DEMO_PRODUCT_NAMES[i % len(DEMO_PRODUCT_NAMES)]
            # add tenant if Product is tenant-scoped
            prod_field_names = {f.name for f in Product._meta.get_fields()}
            if "tenant" in prod_field_names:
                p, _ = Product.objects.get_or_create(tenant=tenant, name=name)
            else:
                p, _ = Product.objects.get_or_create(name=name)
            products.append(p)

        variants = []
        for p in products:
            for j in range(variants_per_product):
                sku = f"{slugify_sku(p.name)}-{j+1:02d}"
                var_lookup = {"sku": sku}
                var_field_names = {f.name for f in Variant._meta.get_fields()}
                if "tenant" in var_field_names:
                    var_lookup["tenant"] = tenant
                v_defaults = {
                    "product": p,
                    "price": Decimal(str(round(random.uniform(5, 80), 2))),
                    "cost": Decimal(str(round(random.uniform(2, 40), 2))),
                    "uom": "ea",
                    "tax_category": tax_cat,
                }
                v, _ = Variant.objects.get_or_create(**var_lookup, defaults=v_defaults)
                if getattr(v, "product_id", None) is None:
                    v.product = p
                    v.save(update_fields=["product"])
                variants.append(v)

        self.stdout.write(self.style.SUCCESS(f"Products: {len(products)} | Variants: {len(variants)}"))

        # -- Inventory (wipe this tenant first to avoid dupes)
        InventoryItem.objects.filter(tenant=tenant).delete()
        inv_rows = []
        for store in stores:
            for v in variants:
                inv_rows.append(InventoryItem(
                    tenant=tenant,
                    store=store,
                    variant=v,
                    on_hand=random.randint(0, 40),
                    reserved=random.randint(0, 8),
                ))
        InventoryItem.objects.bulk_create(inv_rows, batch_size=500)
        self.stdout.write(self.style.SUCCESS(f"Inventory rows: {len(inv_rows)}"))

        # -- Sales: wipe recent demo data for this tenant, then create with cashier (and register if needed)
        SaleLine.objects.filter(sale__store__tenant=tenant).delete()
        Sale.objects.filter(store__tenant=tenant).delete()

        now = timezone.now()
        sale_count = 0
        line_count = 0

        # detect if 'cashier' is required (non-nullable)
        cashier_field = Sale._meta.get_field("cashier") if "cashier" in sale_field_names else None
        cashier_required = bool(cashier_field and not getattr(cashier_field, "null", True))

        for day_back in range(days, 0, -1):
            day_dt = (now - timedelta(days=day_back)).replace(hour=12, minute=0, second=0, microsecond=0)
            for store in stores:
                orders_today = random.randint(2, max_orders_per_day)
                for _ in range(orders_today):
                    sale_kwargs = {
                        "store": store,
                        "created_at": day_dt,
                        "total": Decimal("0.00"),
                    }

                    # NEW: if Sale is tenant-scoped, set it
                    if "tenant" in sale_field_names:
                        sale_kwargs["tenant"] = tenant

                    if cashier_required:
                        sale_kwargs["cashier"] = cashiers_by_store[store.id]
                    if "register" in sale_field_names:
                        sale_kwargs["register"] = registers_by_store.get(store.id)

                    sale = Sale.objects.create(**sale_kwargs)
                    sale_total = Decimal("0.00")

                    for _ in range(random.randint(1, 4)):
                        v = random.choice(variants)
                        qty = random.randint(1, 4)
                        unit_price = Decimal(str(getattr(v, "price", Decimal(str(round(random.uniform(5, 80), 2))))))
                        line_total = (unit_price * Decimal(qty)).quantize(Decimal("0.01"))
                        SaleLine.objects.create(
                            sale=sale,
                            variant=v,
                            qty=qty,
                            unit_price=unit_price,
                            line_total=line_total,
                        )
                        sale_total += line_total
                        line_count += 1

                    sale.total = sale_total.quantize(Decimal("0.01"))
                    sale.save(update_fields=["total"])
                    sale_count += 1

        self.stdout.write(self.style.SUCCESS(f"Sales created: {sale_count}, Lines: {line_count}"))
        self.stdout.write(self.style.SUCCESS("✅ Demo seed complete — turn OFF mock and refresh the dashboard."))


def slugify_sku(name: str) -> str:
    s = name.upper()
    for ch in [' ', '"', "'", "(", ")", ",", ".", "/"]:
        s = s.replace(ch, "-")
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")
