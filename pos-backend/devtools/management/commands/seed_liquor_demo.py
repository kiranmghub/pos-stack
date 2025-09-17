# devtools/management/commands/seed_liquor_demo.py
import random
from decimal import Decimal
from pathlib import Path
from typing import Tuple  # <-- Python 3.8 compatible

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction

from tenants.models import Tenant
from stores.models import Store
from catalog.models import Product, Variant, TaxCategory
from inventory.models import InventoryItem

# Optional imports (guarded for portability)
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

# ---------------- Demo content ----------------
SPIRITS = [
    "Jameson Irish Whiskey",
    "Jack Daniel's Tennessee Whiskey",
    "Maker's Mark Bourbon",
    "Johnnie Walker Black Label",
    "Patrón Silver Tequila",
    "Casamigos Reposado Tequila",
    "Grey Goose Vodka",
    "Tito's Handmade Vodka",
    "Bombay Sapphire Gin",
    "Hendrick's Gin",
    "Hennessy VS Cognac",
    "Bacardí Superior Rum",
    "Captain Morgan Spiced Rum",
]
WINES = [
    "Cabernet Sauvignon – Napa",
    "Pinot Noir – Willamette",
    "Malbec – Mendoza",
    "Merlot – Columbia Valley",
    "Sauvignon Blanc – Marlborough",
    "Chardonnay – Sonoma",
    "Prosecco – DOC",
    "Rosé – Provence",
]
BEERS = [
    "Lagunitas IPA (Bottles)",
    "Heineken (Bottles)",
    "Modelo Especial (Cans)",
    "Guinness Draught (Cans)",
    "Blue Moon Belgian White (Bottles)",
    "Samuel Adams Boston Lager (Bottles)",
]
MIXERS = [
    "Tonic Water", "Club Soda", "Ginger Beer", "Sweet & Sour Mix",
    "Simple Syrup", "Vermouth Dry", "Vermouth Sweet", "Lime Juice",
]

SPIRIT_SIZES = [("375ml", 0.5), ("750ml", 1.0), ("1L", 1.25), ("1.75L", 2.0)]
WINE_SIZES   = [("375ml", 0.6), ("750ml", 1.0)]
BEER_PACKS   = [("6-pack", 1.0), ("12-pack", 1.7), ("24-pack", 3.2)]
MIXER_SIZES  = [("750ml", 1.0), ("1L", 1.2)]

PRICE_ANCHORS = {
    "SPIRIT": (22, 65),
    "WINE":   (9, 35),
    "BEER":   (8, 24),   # per 6-pack baseline
    "MIXER":  (4, 12),
}

def to_money(n: float) -> Decimal:
    return Decimal(str(round(n, 2)))

def slug_simple(name: str) -> str:
    return "".join(ch for ch in name.upper() if ch.isalnum())[:12]

def make_barcode(seq_no: int, prefix: str = "LIQ") -> str:
    # Code 39–safe (letters+digits). Example: LIQ0001234
    return f"{prefix}{seq_no:07d}"

# --------------- Code 39 label rendering (Pillow) ---------------
from PIL import Image, ImageDraw, ImageFont

CODE39 = {
    '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
    '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
    'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn',
    'F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
    'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn',
    'P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
    'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn',
    'Z':'nwwnwnnnn','-':'nwnnnnwnw','.' :'wwnnnnwnn',' ' :'nwwnnnwnn','$':'nwnwnwnnn',
    '/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn',
}

def _encode39(text: str) -> str:
    valid = set(CODE39.keys())
    s = ''.join(ch for ch in text.upper() if ch in valid and ch != '*')
    return f"*{s}*"

def _measure(draw: ImageDraw.ImageDraw, text: str, font) -> Tuple[int, int]:
    """Pillow 10+ safe text measurement (works on 3.8)."""
    try:
        l, t, r, b = draw.textbbox((0, 0), text, font=font)
        return r - l, b - t
    except Exception:
        # Pillow <10 fallback(s)
        try:
            return draw.textsize(text, font=font)  # deprecated, but OK if available
        except Exception:
            try:
                return font.getsize(text)
            except Exception:
                return (len(text) * 8, 16)

def draw_code39_label(code: str, title: str, module=3, height=120, quiet=12) -> Image.Image:
    enc = _encode39(code)
    narrow, wide, gap = module, module * 3, module

    # width
    total_w = quiet * 2
    for i, ch in enumerate(enc):
        pat = CODE39[ch]
        total_w += sum((wide if e == 'w' else narrow) for e in pat)
        if i < len(enc) - 1:
            total_w += gap

    img_h = height + 48 + 36
    img = Image.new("RGB", (total_w, img_h), "white")
    d = ImageDraw.Draw(img)

    # bars
    x = quiet
    y_top = 12
    for i, ch in enumerate(enc):
        pat = CODE39[ch]
        is_bar = True
        for e in pat:
            w = wide if e == 'w' else narrow
            if is_bar:
                d.rectangle([x, y_top, x + w - 1, y_top + height], fill="black")
            x += w
            is_bar = not is_bar
        if i < len(enc) - 1:
            x += gap

    # fonts
    try:
        font_code = ImageFont.truetype("DejaVuSans.ttf", 18)
        font_title = ImageFont.truetype("DejaVuSans.ttf", 16)
    except Exception:
        font_code = ImageFont.load_default()
        font_title = ImageFont.load_default()

    # code text
    cw, ch = _measure(d, code, font_code)
    d.text(((total_w - cw) // 2, y_top + height + 8), code, fill="black", font=font_code)

    # product/variant title (truncate for width)
    label = title.strip()
    if len(label) > 46:
        label = label[:45] + "…"
    tw, th = _measure(d, label, font_title)
    d.text(((total_w - tw) // 2, y_top + height + 8 + ch + 8), label, fill="black", font=font_title)

    return img

def save_barcode_sheet(codes_and_titles, pdf_path: Path, cols=3, rows=10, dpi=300):
    PAGE_W, PAGE_H = int(8.5 * dpi), int(11 * dpi)
    MARGIN_X, MARGIN_Y = int(0.5 * dpi), int(0.5 * dpi)
    GAP_X, GAP_Y = int(0.2 * dpi), int(0.15 * dpi)
    content_w = PAGE_W - 2 * MARGIN_X - (cols - 1) * GAP_X
    content_h = PAGE_H - 2 * MARGIN_Y - (rows - 1) * GAP_Y
    LABEL_W = content_w // cols
    LABEL_H = content_h // rows

    pages = []
    current = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    pages.append(current)

    col = row = 0
    for code, title in codes_and_titles:
        label = draw_code39_label(code, title, module=3, height=120, quiet=12)
        max_w = LABEL_W - int(0.15 * dpi)
        max_h = LABEL_H - int(0.15 * dpi)
        scale = min(max_w / label.width, max_h / label.height, 1.0)
        if scale < 1.0:
            label = label.resize((int(label.width * scale), int(label.height * scale)), Image.LANCZOS)

        x = MARGIN_X + col * (LABEL_W + GAP_X) + (LABEL_W - label.width) // 2
        y = MARGIN_Y + row * (LABEL_H + GAP_Y) + (LABEL_H - label.height) // 2
        current.paste(label, (x, y))

        col += 1
        if col >= cols:
            col = 0
            row += 1
            if row >= rows:
                current = Image.new("RGB", (PAGE_W, PAGE_H), "white")
                pages.append(current)
                row = 0

    pages[0].save(str(pdf_path), "PDF", resolution=dpi, save_all=True, append_images=pages[1:])

# ---------------- Management command ----------------
class Command(BaseCommand):
    help = "Seed a Liquor Store demo (tenant, users, stores, catalog, inventory) and optionally print Code 39 barcode labels."

    def add_arguments(self, parser):
        # tenant + users
        parser.add_argument("--tenant-code", default="LIQDEMO1")
        parser.add_argument("--tenant-name", default=None)
        parser.add_argument("--owner-username", default="owner_liq")
        parser.add_argument("--owner-password", default="owner123")
        parser.add_argument("--cashier-password", default="cashier123")

        # stores & catalog
        parser.add_argument("--stores", type=int, default=3)
        parser.add_argument("--alcohol-tax-rate", default="0.1025")
        parser.add_argument("--standard-tax-rate", default="0.0825")

        # labels
        parser.add_argument("--print-labels", action="store_true", help="Generate a PDF of barcodes after seeding")
        parser.add_argument("--labels-limit", type=int, default=180, help="Max labels to include in the PDF")

    @transaction.atomic
    def handle(self, *args, **opts):
        tenant_code = opts["tenant_code"]
        tenant_name = opts["tenant_name"] or f"{tenant_code} Tenant"
        owner_username = opts["owner_username"]
        owner_password = opts["owner_password"]
        cashier_password = opts["cashier_password"]
        num_stores = int(opts["stores"])
        tax_rate_alc = Decimal(opts["alcohol_tax_rate"])
        tax_rate_std = Decimal(opts["standard_tax_rate"])
        do_print = bool(opts["print_labels"])
        labels_limit = int(opts["labels_limit"])

        User = get_user_model()

        # --- Tenant
        tenant, _ = Tenant.objects.get_or_create(code=tenant_code, defaults={"name": tenant_name})
        self.stdout.write(self.style.SUCCESS(f"Tenant: {tenant.code} (id={tenant.id})"))

        # --- Owner user
        owner, created = User.objects.get_or_create(username=owner_username, defaults={"email": f"{owner_username}@demo.local"})
        if created:
            owner.set_password(owner_password)
            owner.save(update_fields=["password"])
            self.stdout.write(self.style.SUCCESS(f"Created owner user: {owner_username} / {owner_password}"))

        # --- Tenant membership (owner)
        if TenantUser:
            TenantUser.objects.get_or_create(tenant=tenant, user=owner, defaults={"role": TenantRole.OWNER, "is_active": True})

        # --- Stores
        store_codes = ["LIQ-CHI", "LIQ-DAL", "LIQ-AUS", "LIQ-NYC", "LIQ-SFO", "LIQ-SEA"]
        stores = []
        for i in range(num_stores):
            code = store_codes[i % len(store_codes)]
            s, _ = Store.objects.get_or_create(
                tenant=tenant,
                code=code,
                defaults={"name": f"Liquor Store {code}", "timezone": "America/Chicago"}
            )
            stores.append(s)
        self.stdout.write(self.style.SUCCESS(f"Stores: {[s.code for s in stores]}"))

        # --- Cashiers per store
        if TenantUser:
            for s in stores:
                uname = f"cashier_{s.code.lower()}"
                u, uc = User.objects.get_or_create(username=uname, defaults={"email": f"{uname}@demo.local"})
                if uc:
                    u.set_password(cashier_password)
                    u.save(update_fields=["password"])
                TenantUser.objects.get_or_create(tenant=tenant, user=u, defaults={"role": TenantRole.CASHIER, "is_active": True})
        self.stdout.write(self.style.SUCCESS("Cashier users ensured per store."))

        # --- Tax categories
        alc_defaults = {"rate": tax_rate_alc}
        std_defaults = {"rate": tax_rate_std}
        if hasattr(TaxCategory, "code"):
            alc_defaults["code"] = "ALC"
            std_defaults["code"] = "STD"
        tax_alc, _ = TaxCategory.objects.get_or_create(tenant=tenant, name="Alcohol", defaults=alc_defaults)
        tax_std, _ = TaxCategory.objects.get_or_create(tenant=tenant, name="Standard", defaults=std_defaults)

        # --- Catalog + Inventory
        seq = 1000  # barcode sequence

        def ensure_product(name, category, tax_cat, variants_spec):
            nonlocal seq
            p, _ = Product.objects.get_or_create(tenant=tenant, name=name, defaults={"category": category, "is_active": True})
            for size_label, size_mult in variants_spec:
                base_low, base_high = PRICE_ANCHORS[category]
                price = random.uniform(base_low, base_high) * size_mult
                sku = f"{category[:2]}-{slug_simple(name)}-{size_label}".upper()
                seq += 1
                barcode = make_barcode(seq)
                v, created_v = Variant.objects.get_or_create(
                    product=p, sku=sku,
                    defaults={
                        "tenant": tenant,
                        "barcode": barcode,
                        "price": to_money(price),
                        "uom": "EA",
                        "is_active": True,
                        "tax_category": tax_cat,
                    },
                )
                if not created_v and not v.barcode:
                    v.barcode = barcode
                    v.save(update_fields=["barcode"])

                # per-store inventory
                for s in stores:
                    on_hand = random.randint(0, 36)
                    InventoryItem.objects.get_or_create(tenant=tenant, store=s, variant=v, defaults={"on_hand": on_hand})

        for nm in SPIRITS: ensure_product(nm, "SPIRIT", tax_alc, SPIRIT_SIZES)
        for nm in WINES:   ensure_product(nm, "WINE",   tax_alc, WINE_SIZES)
        for nm in BEERS:   ensure_product(nm, "BEER",   tax_alc, BEER_PACKS)
        for nm in MIXERS:  ensure_product(nm, "MIXER",  tax_std, MIXER_SIZES)

        self.stdout.write(self.style.SUCCESS("Catalog + inventory seeded."))

        # --- Labels PDF (optional)
        if do_print:
            qs = (Variant.objects
                  .filter(tenant=tenant, is_active=True)
                  .select_related("product")
                  .order_by("product__name", "sku")[:labels_limit])

            codes_and_titles = []
            for v in qs:
                code = (v.barcode or v.sku or f"V{v.id}").upper()
                size = (v.sku or "").split("-")[-1] if v.sku else v.uom or ""
                title = f"{v.product.name} – {size}"
                codes_and_titles.append((code, title))

            # Save next to this file with today's date (tenant-local time)
            out_dir = Path(__file__).resolve().parent
            today_local = timezone.localtime(timezone.now()).date()
            pdf_path = out_dir / f"barcodes_{today_local.isoformat()}.pdf"
            save_barcode_sheet(codes_and_titles, pdf_path)
            self.stdout.write(self.style.SUCCESS(f"Labels PDF created: {pdf_path}"))

        # print a few sample rows for sanity
        sample = list(
            Variant.objects.filter(tenant=tenant)
            .select_related("product")
            .order_by("id")
            .values_list("product__name", "sku", "barcode")[:6]
        )
        if sample:
            self.stdout.write(self.style.SUCCESS("Sample variants:"))
            for nm, sku, bc in sample:
                self.stdout.write(f" - {nm} | SKU={sku} | BARCODE={bc}")
