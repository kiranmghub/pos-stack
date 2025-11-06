# pos-backend/catalog/api_import_export.py
from __future__ import annotations
import csv
import io
from typing import Dict, List, Tuple, Any, Optional

from django.db import transaction
from django.db.models import Q, Sum, F
from django.http import StreamingHttpResponse, HttpResponse
from django.utils.encoding import smart_str
from django.utils import timezone
from django.utils.text import slugify
from django.utils.functional import cached_property
from inventory.models import InventoryItem

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import Product, Variant, TaxCategory
from .api import ProductWriteSerializer, VariantWriteSerializer

# ---- Tenant resolver (mirror your catalog pattern) ----
def _resolve_request_tenant(request):
    tenant = getattr(request, "tenant", None)
    if tenant:
        return tenant

    # JWT payload may carry tenant_id depending on your auth setup
    payload = getattr(request, "auth", None)
    if isinstance(payload, dict) and payload.get("tenant_id"):
        from tenants.models import Tenant
        from django.shortcuts import get_object_or_404
        return get_object_or_404(Tenant, id=payload["tenant_id"])

    user = getattr(request, "user", None)
    if user is not None:
        if getattr(user, "tenant", None):
            return user.tenant
        if getattr(user, "active_tenant", None):
            return user.active_tenant
    return None

# ---- Column definitions for templates (Option C) ----
PRODUCT_HEADERS: List[str] = [
    "code",           # required for upsert
    "name",
    "category",
    "description",
    "active",         # maps to is_active
    "tax_category",   # code or name
    "image_url",
]

VARIANT_HEADERS: List[str] = [
    "product_name",
    "product_code",   # required to link to Product
    "sku",            # required for upsert
    "name",
    "barcode",
    "price",
    "cost",
    "uom",
    "active",         # maps to is_active
    "tax_category",   # code or name
    "image_url",
]


# =========================
# =  EXPORT ENDPOINT      =
# =========================
class CatalogExportView(APIView):
    """
    GET /api/v1/catalog/export?scope=products|variants|combined&output_format=csv|json
         [&store_id=... (ignored for now; computed fields omitted in v1)]
         [&q=... (search by code/name)]
    - products: flat rows of product data (no aggregates in v1 export)
    - variants: flat rows of variant data (with product_code)
    - combined: JSON array of products, each with embedded variants (round-trip friendly)
    """
    permission_classes = [IsAuthenticated]

    def _tenant_label(self, tenant) -> str:
        code = getattr(tenant, "code", None)
        name = getattr(tenant, "name", None)
        if code and name:
            # return f"{code} / {name}"
            return f"{name} ({code})"
        return code or name or "Tenant"

    def get(self, request):
        scope = request.query_params.get("scope", "products").lower()
        # fmt = request.query_params.get("format", "csv").lower()
        fmt = request.query_params.get("output_format", "csv").lower()
        q = (request.query_params.get("q") or "").strip()
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"detail": "Tenant not resolved"}, status=status.HTTP_400_BAD_REQUEST)
        
        # ---- On-hand controls ----
        include_on_hand = str(request.query_params.get("include_on_hand", "false")).lower() in {"1", "true", "yes"}
        on_hand_mode = (request.query_params.get("on_hand_mode") or "aggregate").lower()
        # store_id for single-store mode
        store_id = request.query_params.get("store_id")
        # multiple store ids for breakdown modes: accept both store_ids and store_ids[]
        store_ids = request.query_params.getlist("store_ids[]") or request.query_params.getlist("store_ids")
        store_ids = [int(s) for s in store_ids if str(s).isdigit()]

        if scope not in {"products", "variants", "combined"}:
            return Response({"detail": "Invalid scope"}, status=status.HTTP_400_BAD_REQUEST)
        if fmt not in {"csv", "json", "pdf"}:
            return Response({"detail": "Invalid format"}, status=status.HTTP_400_BAD_REQUEST)
        # PDF supports only aggregate or single-store
        if fmt == "pdf" and include_on_hand and on_hand_mode not in {"aggregate", "store"}:
            return Response({"detail": "PDF supports on-hand only for 'aggregate' or 'store' modes."},
                            status=status.HTTP_400_BAD_REQUEST)

        if scope == "products":
            qs = Product.objects.filter(tenant=tenant)
            if q:
                qs = qs.filter(Q(code__icontains=q) | Q(name__icontains=q))
            rows = []
            # NOTE: exporting essential fields (no aggregates in v1)
            for p in qs.select_related("tax_category").order_by("code"):
                rows.append({
                    "code": p.code or "",
                    "name": p.name or "",
                    "category": p.category or "",
                    "description": p.description or "",
                    "active": "true" if p.is_active else "false",
                    "tax_category": (p.tax_category.code if getattr(p, "tax_category", None) else ""),
                    "image_url": (p.image_url or ""),
                })
            # ---- augment rows with on-hand if requested ----
            if include_on_hand:
                rows = self._attach_on_hand_products(tenant, rows, on_hand_mode, store_id, store_ids)
            if fmt == "json":
                resp = Response(rows)
                fname = self._build_filename(
                    tenant, "products", "json",
                    include_on_hand=include_on_hand,
                    on_hand_mode=on_hand_mode,
                    store_id=store_id,
                    store_ids=store_ids,
                )
                resp["Content-Disposition"] = f'attachment; filename="{fname}"'
                return resp
            if fmt == "pdf":    
                fname = self._build_filename(
                tenant, "products", "pdf",
                include_on_hand=include_on_hand,
                on_hand_mode=on_hand_mode,
                store_id=store_id,
                store_ids=store_ids,
                )
                # omit image_url column for PDF
                headers = [h for h in PRODUCT_HEADERS if h != "image_url"]
                # include on_hand column in headers for pdf when present
                if include_on_hand and on_hand_mode in {"aggregate", "store"}:
                    if "on_hand" not in headers:
                        headers = headers + ["on_hand"]
                title = f"{self._tenant_label(tenant)}: Products"
                subtitle = self._subtitle_for_on_hand(on_hand_mode, store_id, store_ids, tenant)
                return self._pdf_response(fname, headers, rows, title, subtitle)
 
            
            fname = self._build_filename(
            tenant, "products", "csv",
            include_on_hand=include_on_hand,
            on_hand_mode=on_hand_mode,
            store_id=store_id,
            store_ids=store_ids,
            )
            # widen headers for CSV if we added on-hand columns dynamically
            headers = PRODUCT_HEADERS[:]
            if include_on_hand:
                dyn = self._dynamic_headers(rows, base=headers)
                headers = dyn
            return self._csv_response(fname, headers, rows)


        if scope == "variants":
            qs = Variant.objects.filter(tenant=tenant).select_related("product", "tax_category")
            if q:
                qs = qs.filter(
                    Q(sku__icontains=q) |
                    Q(name__icontains=q) |
                    Q(product__code__icontains=q) |
                    Q(product__name__icontains=q)
                )
            rows = []
            for v in qs.order_by("product__code", "sku", "id"):
                rows.append({
                    "product_name": v.product.name or "", 
                    "product_code": v.product.code or "",
                    "sku": v.sku or "",
                    "name": v.name or "",
                    "barcode": v.barcode or "",
                    "price": str(v.price if v.price is not None else ""),
                    "cost": str(v.cost if v.cost is not None else ""),
                    "uom": v.uom or "",
                    "active": "true" if v.is_active else "false",
                    "tax_category": (v.tax_category.code if getattr(v, "tax_category", None) else ""),
                    "image_url": (v.image_url or ""),
                })
            if include_on_hand:
                rows = self._attach_on_hand_variants(tenant, rows, on_hand_mode, store_id, store_ids)

            if fmt == "json":
                resp = Response(rows)
                fname = self._build_filename(
                    tenant, "variants", "json",
                    include_on_hand=include_on_hand,
                    on_hand_mode=on_hand_mode,
                    store_id=store_id,
                    store_ids=store_ids,
                )
                resp["Content-Disposition"] = f'attachment; filename="{fname}"'
                return resp
            if fmt == "pdf":
                fname = self._build_filename(
                tenant, "variants", "pdf",
                include_on_hand=include_on_hand,
                on_hand_mode=on_hand_mode,
                store_id=store_id,
                store_ids=store_ids,
                )
                
                # omit image_url column for PDF
                headers = [h for h in VARIANT_HEADERS if h != "image_url"]
                if include_on_hand and on_hand_mode in {"aggregate", "store"}:
                    if "on_hand" not in headers:
                        headers = headers + ["on_hand"]
                title = f"{self._tenant_label(tenant)}: Variants"
                subtitle = self._subtitle_for_on_hand(on_hand_mode, store_id, store_ids, tenant)
                return self._pdf_response(fname, headers, rows, title, subtitle)
            
            fname = self._build_filename(
            tenant, "variants", "csv",
            include_on_hand=include_on_hand,
            on_hand_mode=on_hand_mode,
            store_id=store_id,
            store_ids=store_ids,
            )
            headers = VARIANT_HEADERS[:]
            if include_on_hand:
                headers = self._dynamic_headers(rows, base=headers)
            return self._csv_response(fname, headers, rows)



        # combined JSON: each product with embedded variants (good round-trip)
        # (No CSV for combined to avoid confusing multi-line representations)
        products = Product.objects.filter(tenant=tenant).order_by("code")
        data = []
        # prefetch minimal variant fields
        variants = Variant.objects.filter(tenant=tenant, product__in=products)\
                                  .select_related("tax_category", "product")\
                                  .order_by("product__code", "sku", "id")
        variants_by_product = {}
        for v in variants:
            variants_by_product.setdefault(v.product_id, []).append({
                "sku": v.sku or "",
                "name": v.name or "",
                "barcode": v.barcode or "",
                "price": float(v.price) if v.price is not None else None,
                "cost": float(v.cost) if v.cost is not None else None,
                "uom": v.uom or "",
                "active": bool(v.is_active),
                "tax_category": (v.tax_category.code if getattr(v, "tax_category", None) else ""),
                "image_url": (v.image_url or ""),
            })
        for p in products.select_related("tax_category"):
            data.append({
                "code": p.code or "",
                "name": p.name or "",
                "category": p.category or "",
                "description": p.description or "",
                "active": bool(p.is_active),
                "tax_category": (p.tax_category.code if getattr(p, "tax_category", None) else ""),
                "image_url": (p.image_url or ""),
                "variants": variants_by_product.get(p.id, []),
            })
        # combined is JSON-only in v1; still set filename for download UX
        resp = Response(data)
        fname = self._build_filename(
        tenant, "combined", "json",
        include_on_hand=include_on_hand,
        on_hand_mode=on_hand_mode,
        store_id=store_id,
        store_ids=store_ids,
        )
        resp["Content-Disposition"] = f'attachment; filename="{fname}"'
        return resp
    

    # ---------- helpers for on-hand ----------
    def _subtitle_for_on_hand(self, mode: str, store_id: Optional[str], store_ids: List[int], tenant) -> Optional[str]:
        if not mode:
            return None
        if mode == "aggregate":
            return "On-Hand: Aggregate across all stores"
        if mode == "store":
            if not store_id:
                return "On-Hand: Store = (not specified)"
            try:
                from stores.models import Store
                s = Store.objects.filter(tenant=tenant, id=int(store_id)).first()
                if s:
                    label = f"{getattr(s,'code', '')} {f'({s.name})' if getattr(s,'name',None) else ''}".strip()
                    return f"On-Hand: Store = {label}"
            except Exception:
                pass
            return f"On-Hand: Store = {store_id}"
        if mode.startswith("breakdown"):
            return "On-Hand: Breakdown by store"
        return None

    def _dynamic_headers(self, rows: List[Dict[str, Any]], base: List[str]) -> List[str]:
        """Return base headers + any new keys encountered in rows, preserving order."""
        seen = set(base)
        out = list(base)
        for r in rows:
            for k in r.keys():
                if k not in seen:
                    seen.add(k)
                    out.append(k)
        return out

    def _attach_on_hand_products(self, tenant, rows, mode, store_id, store_ids):
        # Build a map of product_code -> on-hand numbers
        by_code = {r["code"]: r for r in rows}
        prod_codes = [c for c in by_code.keys() if c]
        if not prod_codes:
            return rows
        prod_ids = dict(Product.objects.filter(tenant=tenant, code__in=prod_codes).values_list("code", "id"))

        q = InventoryItem.objects.filter(tenant=tenant, variant__product_id__in=prod_ids.values())
        if mode == "store" and store_id:
            q = q.filter(store_id=int(store_id))

        if mode in {"aggregate", "store"}:
            # product-level sums
            for row in q.values("variant__product_id").annotate(on_hand=Sum("on_hand")):
                # map back by product code
                code = next((c for c, pid in prod_ids.items() if pid == row["variant__product_id"]), None)
                if code and code in by_code:
                    by_code[code]["on_hand"] = int(row["on_hand"] or 0)
            # ensure missing ones get 0
            for code in by_code:
                by_code[code].setdefault("on_hand", 0)
            return rows

        # breakdown modes require selected stores
        if mode in {"breakdown_columns", "breakdown_rows"}:
            if not store_ids:
                return rows
            q = q.filter(store_id__in=store_ids)
            # sum per product + store
            sums = q.values("variant__product_id", "store__code", "store_id").annotate(on_hand=Sum("on_hand"))
            if mode == "breakdown_columns":
                for rec in sums:
                    code = next((c for c, pid in prod_ids.items() if pid == rec["variant__product_id"]), None)
                    if code and code in by_code:
                        col = f'on_hand_{(rec["store__code"] or str(rec["store_id"])).replace(" ", "_")}'
                        by_code[code][col] = int(rec["on_hand"] or 0)
                return rows
            else:  # breakdown_rows
                expanded = []
                # prepare a lookup: prod_id -> code
                prod_id_to_code = {pid: code for code, pid in prod_ids.items()}
                # build a temp structure: (code -> store_code -> sum)
                tmp = {}
                for rec in sums:
                    pcode = prod_id_to_code.get(rec["variant__product_id"])
                    if not pcode: 
                        continue
                    scode = rec["store__code"] or str(rec["store_id"])
                    tmp.setdefault(pcode, {})[scode] = int(rec["on_hand"] or 0)
                # for each base row, emit one row per selected store
                for r in rows:
                    code = r.get("code")
                    if not code:
                        continue
                    for sid in store_ids:
                        # fetch store code once
                        from stores.models import Store
                        s = Store.objects.filter(tenant=tenant, id=int(sid)).only("code").first()
                        scode = getattr(s, "code", str(sid))
                        rr = dict(r)
                        rr["store_code"] = scode
                        rr["on_hand"] = tmp.get(code, {}).get(scode, 0)
                        expanded.append(rr)
                return expanded

        return rows

    def _attach_on_hand_variants(self, tenant, rows, mode, store_id, store_ids):
        # Build a map of sku -> row
        by_sku = {r["sku"]: r for r in rows if r.get("sku")}
        if not by_sku:
            return rows
        var_ids = dict(Variant.objects.filter(tenant=tenant, sku__in=by_sku.keys()).values_list("sku", "id"))
        q = InventoryItem.objects.filter(tenant=tenant, variant_id__in=var_ids.values())
        if mode == "store" and store_id:
            q = q.filter(store_id=int(store_id))

        if mode in {"aggregate", "store"}:
            for row in q.values("variant_id").annotate(on_hand=Sum("on_hand")):
                sku = next((s for s, vid in var_ids.items() if vid == row["variant_id"]), None)
                if sku and sku in by_sku:
                    by_sku[sku]["on_hand"] = int(row["on_hand"] or 0)
            for sku in by_sku:
                by_sku[sku].setdefault("on_hand", 0)
            return rows

        if mode in {"breakdown_columns", "breakdown_rows"}:
            if not store_ids:
                return rows
            q = q.filter(store_id__in=store_ids)
            sums = q.values("variant_id", "store__code", "store_id").annotate(on_hand=Sum("on_hand"))
            if mode == "breakdown_columns":
                for rec in sums:
                    sku = next((s for s, vid in var_ids.items() if vid == rec["variant_id"]), None)
                    if sku and sku in by_sku:
                        col = f'on_hand_{(rec["store__code"] or str(rec["store_id"])).replace(" ", "_")}'
                        by_sku[sku][col] = int(rec["on_hand"] or 0)
                return rows
            else:
                expanded = []
                from stores.models import Store
                for r in rows:
                    sku = r.get("sku")
                    if not sku:
                        continue
                    vid = var_ids.get(sku)
                    for sid in store_ids:
                        s = Store.objects.filter(tenant=tenant, id=int(sid)).only("code").first()
                        scode = getattr(s, "code", str(sid))
                        rr = dict(r)
                        rr["store_code"] = scode
                        # find sum for this variant+store
                        # we can pre-index sums but list is small; leave readable
                        total = 0
                        for rec in sums:
                            if rec["variant_id"] == vid and (rec["store__code"] or str(rec["store_id"])) == scode:
                                total = int(rec["on_hand"] or 0)
                                break
                        rr["on_hand"] = total
                        expanded.append(rr)
                return expanded

        return rows
    

    
    def _pdf_response(self, filename: str, headers: List[str], rows: List[Dict[str, Any]], title: str, subtitle: Optional[str]) -> HttpResponse:

        """
        Render a simple tabular PDF using reportlab (no images; compact; landscape).
        """
        try:
            from reportlab.lib.pagesizes import landscape, letter
            from reportlab.platypus import SimpleDocTemplate, LongTable, TableStyle, Paragraph, Spacer
            from reportlab.lib import colors
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        except Exception:
            return Response(
                {"detail": "PDF export requires reportlab. Please install it on the server."},
                status=status.HTTP_501_NOT_IMPLEMENTED,
            )
        
        # --- macOS / certain Python builds: hashlib.md5 doesn't accept 'usedforsecurity' kwarg.
        # ReportLab calls md5(usedforsecurity=False). If that's unsupported, monkey-patch
        # reportlab.pdfbase.pdfdoc.md5 to drop unknown kwargs. This is safe and scoped.
        try:
            import hashlib as _hashlib
            _hashlib.md5(usedforsecurity=False)  # probe support
        except TypeError:
            from reportlab.pdfbase import pdfdoc as _pdfdoc
            def _md5_no_kw(*args, **kwargs):
                # ignore any unexpected kwargs and call the standard md5
                return _hashlib.md5(*args)
            _pdfdoc.md5 = _md5_no_kw

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=landscape(letter),
            leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24
        )
        styles = getSampleStyleSheet()
        cell_style = ParagraphStyle(
            "Cell",
            parent=styles["BodyText"],
            fontSize=8, leading=10,
            spaceBefore=0, spaceAfter=0,
            wordWrap="LTR"
        )
        header_style = ParagraphStyle(
            "Header",
            parent=styles["Title"],
            fontSize=14, leading=18
        )
        sub_style = ParagraphStyle(
            "Sub",
            parent=styles["BodyText"],
            fontSize=9, textColor=colors.HexColor("#9CA3AF")  # zinc-400-ish
        )
        head_cell_style = ParagraphStyle(
            "HeadCell",
            parent=styles["BodyText"],
            fontSize=9, leading=11,
            textColor=colors.white,           # ensure visible over dark background
            fontName="Helvetica-Bold",        # bold headers
            spaceBefore=0, spaceAfter=0
        )
        story: List[Any] = []

        # Title + subtitle + "As of" timestamp (local time)
        story.append(Paragraph(title, header_style))
        from django.utils import timezone as _tz
        asof = _tz.localtime(_tz.now()).strftime("%Y-%m-%d %H:%M:%S %Z")
        if subtitle:
            story.append(Paragraph(subtitle, sub_style))
        story.append(Paragraph(f"As of: {asof}", sub_style))
        story.append(Spacer(1, 10))

        # Build table data (omit image_url already handled by caller); wrap each cell
        # Header cells: Title Case + explicit white/bold style
        data = [[Paragraph(h.replace("_", " ").title(), head_cell_style) for h in headers]]
        for r in rows:
            data.append([Paragraph(("" if r.get(h) is None else str(r.get(h))), cell_style) for h in headers])

        # Equal column widths across page width; Paragraph wraps to fit
        col_count = len(headers)
        col_widths = [doc.width / col_count] * col_count

        table = LongTable(data, colWidths=col_widths, repeatRows=1, splitByRow=1)
        table.setStyle(TableStyle([
            # Header
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),  # zinc-900
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),  # harmless now that head cells are white too
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("TOPPADDING", (0, 0), (-1, 0), 6),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
            # Body
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#374151")),  # zinc-700-ish
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ]))
        story.append(table)

        doc.build(story)
        pdf = buf.getvalue()
        buf.close()
        resp = HttpResponse(pdf, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="{filename}"'
        return resp

    def _csv_response(self, filename: str, headers: List[str], rows: List[Dict[str, Any]]) -> HttpResponse:
        buf = io.StringIO(newline="")
        writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow({k: "" if r.get(k) is None else smart_str(r.get(k)) for k in headers})

        resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{filename}"'
        return resp
    
    def _build_filename(
        self,
        tenant,
        scope: str,
        ext: str,
        *,
        include_on_hand: bool = False,
        on_hand_mode: Optional[str] = None,
        store_id: Optional[str] = None,
        store_ids: Optional[List[int]] = None,
    ) -> str:
        """
        Build filenames like:
          <tenant-code-or-name>_<scope>[_include_on_hand_<context>]_<timestamp>.<ext>
        context:
          - aggregate
          - store_<STORECODE or NAME>
          - stores_<CODE1>-<CODE2>-<CODE3>  (<=3 stores), else 'multiple-stores'
        """
        # Prefer code if present; else slugify name; else 'tenant'
        code = getattr(tenant, "code", None)
        if code:
            prefix = slugify(str(code))
        else:
            name = getattr(tenant, "name", "") or "tenant"
            prefix = slugify(str(name))
        ts = timezone.now().strftime("%Y%m%d_%H%M%S")
        parts = [prefix, scope]

        if include_on_hand:
            ctx = None
            mode = (on_hand_mode or "").lower()
            if mode == "aggregate" or mode == "":
                ctx = "aggregate"
            elif mode == "store":
                label = None
                try:
                    if store_id:
                        from stores.models import Store
                        s = Store.objects.filter(tenant=tenant, id=int(store_id)).only("code", "name").first()
                        if s:
                            label = slugify(s.code or s.name or str(store_id))
                except Exception:
                    label = slugify(str(store_id))
                ctx = f"store_{label or 'unknown'}"
            elif mode.startswith("breakdown"):
                labels: List[str] = []
                try:
                    ids = list(store_ids or [])
                    if ids:
                        from stores.models import Store
                        qs = Store.objects.filter(tenant=tenant, id__in=ids).only("code", "name")
                        # keep incoming order
                        code_by_id = {s.id: (s.code or s.name or str(s.id)) for s in qs}
                        for sid in ids:
                            if sid in code_by_id:
                                labels.append(slugify(code_by_id[sid]))
                except Exception:
                    pass
                if labels and len(labels) <= 3:
                    ctx = "stores_" + "-".join(labels)
                else:
                    ctx = "multiple-stores"
            if ctx:
                parts.extend(["include_on_hand", ctx])

        parts.append(ts)
        return f"{'_'.join(parts)}.{ext}"


# =========================
# =  TEMPLATE ENDPOINT    =
# =========================
class CatalogImportTemplateView(APIView):
    """
    GET /api/v1/catalog/import/template?scope=products|variants&format=csv
    Returns a header-only CSV with a sample row commented below the header.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = request.query_params.get("scope", "products").lower()
        fmt = request.query_params.get("output_format", "csv").lower()
        if scope not in {"products", "variants"}:
            return Response({"detail": "Invalid scope"}, status=status.HTTP_400_BAD_REQUEST)
        if fmt != "csv":
            return Response({"detail": "Only CSV template is supported in v1"}, status=status.HTTP_400_BAD_REQUEST)

        headers = PRODUCT_HEADERS if scope == "products" else VARIANT_HEADERS
        sample = self._sample_row(scope)

        buf = io.StringIO(newline="")
        writer = csv.writer(buf)
        writer.writerow(headers)
        # comment the sample row (helpful in editors; ignored by our parser)
        writer.writerow([f"# example: {sample.get(h, '')}" for h in headers])

        resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{scope}-template.csv"'
        return resp

    def _sample_row(self, scope: str) -> Dict[str, str]:
        if scope == "products":
            return {
                "code": "SHIRT-001",
                "name": "T-Shirt",
                "category": "Apparel",
                "description": "Soft cotton tee",
                "active": "true",
                "tax_category": "STANDARD",
                "image_url": "https://example.com/image.jpg",
            }
        return {
            "product_code": "SHIRT-001",
            "sku": "SHIRT-001-BLK-M",
            "name": "Black / M",
            "barcode": "0123456789012",
            "price": "19.99",
            "cost": "8.50",
            "uom": "EA",
            "active": "true",
            "tax_category": "STANDARD",
            "image_url": "https://example.com/variant.jpg",
        }


# =========================
# =  IMPORT ENDPOINT      =
# =========================
class CatalogImportView(APIView):
    """
    POST /api/v1/catalog/import?scope=products|variants&mode=create|upsert&dry_run=0|1
    Content-Type: multipart/form-data with 'file' = CSV.

    Behavior:
    - Validates each row via existing WriteSerializers, tenant-scoped.
    - mode=create  -> only create new rows; existing matches are skipped (or error).
    - mode=upsert  -> create or update (matched by product code / variant SKU).
    - dry_run=1    -> validate & return summary; do not mutate DB.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        scope = request.query_params.get("scope", "products").lower()
        mode = request.query_params.get("mode", "upsert").lower()
        dry_run = request.query_params.get("dry_run", "1") in {"1", "true", "True"}

        if scope not in {"products", "variants"}:
            return Response({"detail": "Invalid scope"}, status=status.HTTP_400_BAD_REQUEST)
        if mode not in {"create", "upsert"}:
            return Response({"detail": "Invalid mode"}, status=status.HTTP_400_BAD_REQUEST)

        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"detail": "Tenant not resolved"}, status=status.HTTP_400_BAD_REQUEST)

        f = request.FILES.get("file")
        if not f:
            return Response({"detail": "No file uploaded (expected 'file')"}, status=status.HTTP_400_BAD_REQUEST)

        raw = f.read()
        try:
            text = raw.decode("utf-8-sig")
        except Exception:
            # fallback for other encodings
            text = raw.decode(errors="ignore")

        reader = csv.DictReader(io.StringIO(text))
        expected = PRODUCT_HEADERS if scope == "products" else VARIANT_HEADERS
        missing = [h for h in expected if h not in reader.fieldnames]
        if missing:
            return Response({"detail": f"Missing columns: {', '.join(missing)}"}, status=status.HTTP_400_BAD_REQUEST)

        results = {
            "scope": scope,
            "mode": mode,
            "dry_run": bool(dry_run),
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "errors": [],     # list of {row, message}
            "total_rows": 0,
        }

        # Process
        with transaction.atomic():
            sid = transaction.savepoint()
            for i, row in enumerate(reader, start=2):  # 1=header, 2=first data row
                # Skip commented/example rows from our template
                if any((str(v).strip().startswith("#") for v in row.values() if v is not None)):
                    continue
                results["total_rows"] += 1
                try:
                    if scope == "products":
                        self._import_product_row(tenant, row, mode, results)
                    else:
                        self._import_variant_row(tenant, row, mode, results)
                except Exception as e:
                    results["errors"].append({"row": i, "message": str(e)})
            if dry_run:
                transaction.savepoint_rollback(sid)
            else:
                transaction.savepoint_commit(sid)

        http_status = status.HTTP_200_OK if not results["errors"] else status.HTTP_207_MULTI_STATUS
        return Response(results, status=http_status)

    # --- helpers ---
    def _parse_bool(self, val: Any) -> bool:
        return str(val).strip().lower() in {"1", "true", "yes", "y"}

    def _resolve_tax_category(self, tenant, val: str) -> Optional[TaxCategory]:
        if not val:
            return None
        # Try by code first, then name
        tc = TaxCategory.objects.filter(tenant=tenant, code__iexact=val).first()
        if tc:
            return tc
        return TaxCategory.objects.filter(tenant=tenant, name__iexact=val).first()

    def _import_product_row(self, tenant, row: Dict[str, str], mode: str, results: Dict):
        code = (row.get("code") or "").strip()
        payload = {
            "code": code or None,
            "name": (row.get("name") or "").strip() or None,
            "category": (row.get("category") or "").strip(),
            "description": (row.get("description") or "").strip(),
            "is_active": self._parse_bool(row.get("active", "true")),
            "image_url": (row.get("image_url") or "").strip() or None,
        }
        tc = self._resolve_tax_category(tenant, (row.get("tax_category") or "").strip())
        if tc:
            payload["tax_category"] = tc.id

        instance = None
        if code:
            instance = Product.objects.filter(tenant=tenant, code__iexact=code).first()

        if instance:
            if mode == "create":
                results["skipped"] += 1
                return
            serializer = ProductWriteSerializer(instance=instance, data=payload, context={"tenant": tenant}, partial=True)
            if serializer.is_valid():
                serializer.save()
                results["updated"] += 1
            else:
                results["errors"].append({"row": results["total_rows"] + 1, "message": serializer.errors})
        else:
            if mode == "create" or mode == "upsert":
                serializer = ProductWriteSerializer(data=payload, context={"tenant": tenant})
                if serializer.is_valid():
                    serializer.save()
                    results["created"] += 1
                else:
                    results["errors"].append({"row": results["total_rows"] + 1, "message": serializer.errors})
            else:
                results["skipped"] += 1

    def _import_variant_row(self, tenant, row: Dict[str, str], mode: str, results: Dict):
        product_code = (row.get("product_code") or "").strip()
        sku = (row.get("sku") or "").strip()
        if not product_code or not sku:
            raise ValueError("Both product_code and sku are required for variants")

        product = Product.objects.filter(tenant=tenant, code__iexact=product_code).first()
        if not product:
            raise ValueError(f"Product with code '{product_code}' not found")

        def _to_decimal(s: str) -> Optional[str]:
            s = (s or "").strip()
            if not s:
                return None
            # Let serializer parse the decimal correctly
            return s

        payload = {
            "product": product.id,  # write serializer expects FK id
            "sku": sku or None,
            "name": (row.get("name") or "").strip() or None,
            "barcode": (row.get("barcode") or "").strip() or None,
            "price": _to_decimal(row.get("price")),
            "cost": _to_decimal(row.get("cost")),
            "uom": (row.get("uom") or "").strip() or None,
            "is_active": self._parse_bool(row.get("active", "true")),
            "image_url": (row.get("image_url") or "").strip() or None,
        }
        tc = self._resolve_tax_category(tenant, (row.get("tax_category") or "").strip())
        if tc:
            payload["tax_category"] = tc.id

        instance = Variant.objects.filter(tenant=tenant, sku__iexact=sku).first()

        if instance:
            if mode == "create":
                results["skipped"] += 1
                return
            serializer = VariantWriteSerializer(instance=instance, data=payload, context={"tenant": tenant}, partial=True)
            if serializer.is_valid():
                serializer.save()
                results["updated"] += 1
            else:
                results["errors"].append({"row": results["total_rows"] + 1, "message": serializer.errors})
        else:
            if mode == "create" or mode == "upsert":
                serializer = VariantWriteSerializer(data=payload, context={"tenant": tenant})
                if serializer.is_valid():
                    serializer.save()
                    results["created"] += 1
                else:
                    results["errors"].append({"row": results["total_rows"] + 1, "message": serializer.errors})
            else:
                results["skipped"] += 1
