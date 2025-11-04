# pos-backend/catalog/api_import_export.py
from __future__ import annotations
import csv
import io
from typing import Dict, List, Tuple, Any, Optional

from django.db import transaction
from django.db.models import Q
from django.http import StreamingHttpResponse, HttpResponse
from django.utils.encoding import smart_str

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
    GET /api/v1/catalog/export?scope=products|variants|combined&format=csv|json
         [&store_id=... (ignored for now; computed fields omitted in v1)]
         [&q=... (search by code/name)]
    - products: flat rows of product data (no aggregates in v1 export)
    - variants: flat rows of variant data (with product_code)
    - combined: JSON array of products, each with embedded variants (round-trip friendly)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scope = request.query_params.get("scope", "products").lower()
        fmt = request.query_params.get("format", "csv").lower()
        q = (request.query_params.get("q") or "").strip()
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"detail": "Tenant not resolved"}, status=status.HTTP_400_BAD_REQUEST)

        if scope not in {"products", "variants", "combined"}:
            return Response({"detail": "Invalid scope"}, status=status.HTTP_400_BAD_REQUEST)
        if fmt not in {"csv", "json"}:
            return Response({"detail": "Invalid format"}, status=status.HTTP_400_BAD_REQUEST)

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
            if fmt == "json":
                return Response(rows)
            return self._csv_response("products.csv", PRODUCT_HEADERS, rows)

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
            if fmt == "json":
                return Response(rows)
            return self._csv_response("variants.csv", VARIANT_HEADERS, rows)

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
        return Response(data)

    def _csv_response(self, filename: str, headers: List[str], rows: List[Dict[str, Any]]) -> HttpResponse:
        buf = io.StringIO(newline="")
        writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            writer.writerow({k: "" if r.get(k) is None else smart_str(r.get(k)) for k in headers})
        resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{filename}"'
        return resp


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
        fmt = request.query_params.get("format", "csv").lower()
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
                serializer.save(tenant=tenant)
                results["updated"] += 1
            else:
                results["errors"].append({"row": results["total_rows"] + 1, "message": serializer.errors})
        else:
            if mode == "create" or mode == "upsert":
                serializer = ProductWriteSerializer(data=payload, context={"tenant": tenant})
                if serializer.is_valid():
                    serializer.save(tenant=tenant)
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
                serializer.save(tenant=tenant)
                results["updated"] += 1
            else:
                results["errors"].append({"row": results["total_rows"] + 1, "message": serializer.errors})
        else:
            if mode == "create" or mode == "upsert":
                serializer = VariantWriteSerializer(data=payload, context={"tenant": tenant})
                if serializer.is_valid():
                    serializer.save(tenant=tenant)
                    results["created"] += 1
                else:
                    results["errors"].append({"row": results["total_rows"] + 1, "message": serializer.errors})
            else:
                results["skipped"] += 1
