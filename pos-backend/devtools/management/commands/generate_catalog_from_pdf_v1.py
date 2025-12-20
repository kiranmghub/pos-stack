#!/usr/bin/env python3
"""
Generate products + variants CSVs from a liquor invoice PDF.

- Keeps leading zeros in Brand Number
- Extracts brand number, brand name, pack size, and bottle rate (cost)
- Generates products and variants according to business rules
- Uses OCR fallback for scanned PDFs

Usage:
  python generate_catalog_from_pdf.py \
      --pdf sheet2.pdf \
      --out_dir ./out \
      --barcode_start 8900000000001

Outputs:
  out/products-generated.csv
  out/variants-generated.csv

pip install pandas pdfplumber pytesseract pillow
# OCR engine needed (system-level):
#  - macOS: brew install tesseract
#  - Ubuntu: sudo apt-get install tesseract-ocr
#  - Windows: install tesseract and add to PATH

"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import re
import sys
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

import pandas as pd

# Optional imports (OCR fallback)
try:
    import pdfplumber  # type: ignore
except Exception as e:
    pdfplumber = None  # noqa

try:
    import pytesseract  # type: ignore
    from PIL import Image  # type: ignore
except Exception:
    pytesseract = None  # noqa
    Image = None  # noqa


# ----------------------------
# Configuration + Data Models
# ----------------------------

PRODUCT_COLUMNS = ["code", "name", "category", "description", "active", "tax_category", "image_url"]
VARIANT_COLUMNS = [
    "product_name", "product_code", "sku", "name", "barcode",
    "price", "cost", "uom", "active", "tax_category", "image_url"
]

ALLOWED_TRUE_FALSE = {"true", "false", "True", "False", True, False}


@dataclass(frozen=True)
class LineItem:
    brand_number: str
    brand_name: str
    pack_qty_size: str  # like "12/650"
    btl_rate: float     # cost per bottle

    @property
    def size_ml(self) -> str:
        parts = self.pack_qty_size.split("/")
        return parts[-1].strip() if parts else ""


# ----------------------------
# Logging
# ----------------------------

def setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )


# ----------------------------
# Utilities
# ----------------------------

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def safe_float(x: str) -> Optional[float]:
    if x is None:
        return None
    s = str(x).strip()
    # remove commas
    s = s.replace(",", "")
    # allow "1,501.00" or "125.08"
    m = re.fullmatch(r"-?\d+(\.\d+)?", s)
    if not m:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def normalize_brand_number(raw: str) -> str:
    """
    Keep leading zeros: brand numbers like '0019' are meaningful.
    We strip non-digits but DO NOT int() cast.
    """
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        raise ValueError(f"Invalid brand number: {raw!r}")
    return digits


def normalize_pack_size(raw: str) -> str:
    """
    Expected format: "<qty>/<ml>" e.g. "12/650"
    """
    s = (raw or "").strip()
    s = s.replace(" ", "")
    if not re.fullmatch(r"\d+/\d+", s):
        raise ValueError(f"Invalid pack qty/size: {raw!r}")
    return s


def make_sku_10(brand_name: str, size_ml: str) -> str:
    """
    Deterministic 10-char SKU derived from (brand name + size).
    Uses SHA1 hex (uppercase) truncated to 10.
    """
    base = f"{brand_name}|{size_ml}".upper()
    base = re.sub(r"[^A-Z0-9|]", "", base)
    return hashlib.sha1(base.encode("utf-8")).hexdigest().upper()[:10]


def make_variant_barcode(start: int, offset: int) -> str:
    """
    Generates unique 13-digit numeric barcode.
    NOTE: This does not calculate a GS1 check digit; it satisfies
    'unique 13 chars number' requirement.
    """
    val = start + offset
    s = str(val).zfill(13)
    if len(s) != 13 or not s.isdigit():
        raise ValueError("Barcode generation failed")
    return s


def picsum_url(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/300/300"


def money_2dp(x: float) -> str:
    return f"{x:.2f}"


# ----------------------------
# PDF Extraction
# ----------------------------

def extract_text_pdfplumber(pdf_path: str) -> List[str]:
    if pdfplumber is None:
        raise RuntimeError("pdfplumber is not installed. Install: pip install pdfplumber")

    lines: List[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            if text.strip():
                lines.extend(text.splitlines())
            logging.info("pdfplumber extracted page %d (%d chars)", i + 1, len(text))
    return lines


def extract_text_ocr(pdf_path: str) -> List[str]:
    if pytesseract is None or Image is None or pdfplumber is None:
        raise RuntimeError(
            "OCR dependencies missing. Install: pip install pytesseract pillow pdfplumber "
            "and ensure tesseract is installed on the system."
        )

    lines: List[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            img = page.to_image(resolution=300).original
            text = pytesseract.image_to_string(img)
            if text.strip():
                lines.extend(text.splitlines())
            logging.info("OCR extracted page %d (%d chars)", i + 1, len(text))
    return lines


def parse_line_items_from_text(lines: Iterable[str]) -> List[LineItem]:
    """
    Robust-ish parser for invoices that have columns:
      Brand Number | Brand Name | Pack Qty/Size (ml) | ... | Unit Rate / Btl Rate

    Approach:
      - scan for patterns:
          brand number: 3-5 digits (may contain leading zeros)
          pack: \d+/\d+
          btl rate: float number near the end
      - brand name is what's between brand number and pack
    """

    # Many invoices wrap. We'll build a rolling buffer of joined lines too.
    raw_lines = [ln.strip() for ln in lines if ln and ln.strip()]
    joined = " \n ".join(raw_lines)

    # Pattern for a row-like segment:
    # brand_number ... brand_name ... pack_qty/size ... (some numbers) ... btl_rate
    # We'll capture brand_number, brand_name (lazy), pack, btl_rate (last float in segment)
    row_pattern = re.compile(
        r"""
        (?P<brand>\b\d{3,5}\b)          # brand number 3-5 digits (keeps leading zeros)
        \s+
        (?P<name>.+?)                  # brand name (lazy)
        \s+
        (?P<pack>\d+/\d+)\s*           # pack qty/size
        .*?
        (?P<btl>\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*$  # last money-ish number on the line
        """,
        re.VERBOSE,
    )

    items: List[LineItem] = []

    # First pass: line-based parse
    for ln in raw_lines:
        m = row_pattern.search(ln)
        if not m:
            continue

        brand_raw = m.group("brand")
        name_raw = m.group("name")
        pack_raw = m.group("pack")
        btl_raw = m.group("btl")

        btl = safe_float(btl_raw)
        if btl is None:
            continue

        try:
            brand = normalize_brand_number(brand_raw)
            pack = normalize_pack_size(pack_raw)
            brand_name = re.sub(r"\s+", " ", name_raw).strip()
            # guardrail: ignore header-like lines
            if len(brand_name) < 3 or "brand name" in brand_name.lower():
                continue
            items.append(LineItem(brand, brand_name, pack, btl))
        except Exception:
            continue

    # If no items found, it's likely a scanned PDF / table layout not captured in lines.
    if not items:
        logging.warning("No items parsed from line-based extraction.")
    return items


def extract_line_items(pdf_path: str, prefer_ocr: bool = False) -> List[LineItem]:
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    # Try text extraction first unless prefer_ocr is set.
    lines: List[str] = []
    errors: List[str] = []

    if not prefer_ocr:
        try:
            lines = extract_text_pdfplumber(pdf_path)
        except Exception as e:
            errors.append(f"pdfplumber failed: {e}")

    items = parse_line_items_from_text(lines)
    if items:
        return items

    # Fallback to OCR
    try:
        ocr_lines = extract_text_ocr(pdf_path)
        items = parse_line_items_from_text(ocr_lines)
        return items
    except Exception as e:
        errors.append(f"OCR failed: {e}")

    raise RuntimeError(
        "Failed to extract line items from PDF. "
        "Tried pdfplumber and OCR. Errors: " + " | ".join(errors)
    )


# ----------------------------
# CSV Generation
# ----------------------------

def build_products(items: List[LineItem]) -> pd.DataFrame:
    # Unique products by brand_number (keep leading zeros)
    by_brand: dict[str, str] = {}
    for it in items:
        by_brand.setdefault(it.brand_number, it.brand_name)

    rows = []
    for brand_number, brand_name in sorted(by_brand.items(), key=lambda x: x[0]):
        rows.append({
            "code": brand_number,
            "name": brand_name,
            "category": "Alcohol",
            "description": f"Alcohol product: {brand_name.title()}",
            "active": "True",
            "tax_category": "Alcohol",
            "image_url": "",
        })

    df = pd.DataFrame(rows, columns=PRODUCT_COLUMNS)
    validate_products_df(df)
    return df


def build_variants(items: List[LineItem], barcode_start: int) -> pd.DataFrame:
    rows = []
    for idx, it in enumerate(items):
        size_ml = it.size_ml
        sku = make_sku_10(it.brand_name, size_ml)
        barcode = make_variant_barcode(barcode_start, idx)
        cost = float(it.btl_rate)
        price = round(cost * 1.20, 2)

        rows.append({
            "product_name": it.brand_name,
            "product_code": it.brand_number,
            "sku": sku,
            "name": f"{it.brand_name}-{size_ml}ml",
            "barcode": barcode,
            "price": money_2dp(price),
            "cost": money_2dp(cost),
            "uom": "each",
            "active": "True",
            "tax_category": "Alcohol",
            "image_url": picsum_url(sku),
        })

    df = pd.DataFrame(rows, columns=VARIANT_COLUMNS)
    validate_variants_df(df)
    return df


# ----------------------------
# Validations / Guardrails
# ----------------------------

def validate_products_df(df: pd.DataFrame) -> None:
    missing_cols = [c for c in PRODUCT_COLUMNS if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Products DF missing columns: {missing_cols}")

    if df["code"].isna().any():
        raise ValueError("Products DF has missing code(s).")

    # ensure code is string to preserve leading zeros
    if not all(isinstance(x, str) for x in df["code"].tolist()):
        raise ValueError("Products code column must be string values.")

    if df["code"].duplicated().any():
        dups = df[df["code"].duplicated()]["code"].tolist()
        raise ValueError(f"Duplicate product codes found: {dups}")

    if (df["category"] != "Alcohol").any():
        raise ValueError("Products category must be 'Alcohol' for all rows.")

    if (df["tax_category"] != "Alcohol").any():
        raise ValueError("Products tax_category must be 'Alcohol' for all rows.")


def validate_variants_df(df: pd.DataFrame) -> None:
    missing_cols = [c for c in VARIANT_COLUMNS if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Variants DF missing columns: {missing_cols}")

    # Required fields
    for col in ["product_code", "product_name", "sku", "name", "barcode", "price", "cost"]:
        if df[col].isna().any():
            raise ValueError(f"Variants DF has missing values in required column: {col}")

    # Keep leading zeros in product_code
    if not all(isinstance(x, str) for x in df["product_code"].tolist()):
        raise ValueError("Variants product_code must be string values (to preserve leading zeros).")

    # SKU uniqueness
    if df["sku"].duplicated().any():
        dups = df[df["sku"].duplicated()]["sku"].tolist()
        raise ValueError(f"Duplicate SKUs found: {dups}")

    # Barcode checks
    if not df["barcode"].map(lambda x: isinstance(x, str) and x.isdigit() and len(x) == 13).all():
        raise ValueError("All barcodes must be 13-digit numeric strings.")

    # Numeric checks
    for col in ["price", "cost"]:
        if not df[col].map(lambda x: safe_float(str(x)) is not None).all():
            raise ValueError(f"Column {col} must contain valid numeric values.")

    if (df["uom"].str.lower() != "each").any():
        raise ValueError("Variants uom must be 'each'.")

    if (df["tax_category"] != "Alcohol").any():
        raise ValueError("Variants tax_category must be 'Alcohol'.")

    if (df["active"] != "True").any():
        raise ValueError("Variants active must be True.")


# ----------------------------
# Main
# ----------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Generate products and variants CSVs from a PDF invoice.")
    parser.add_argument("--pdf", required=True, help="Path to input PDF")
    parser.add_argument("--out_dir", default="out", help="Output directory")
    parser.add_argument("--barcode_start", type=int, default=8900000000001, help="Starting 13-digit barcode number")
    parser.add_argument("--prefer_ocr", action="store_true", help="Prefer OCR extraction first")
    parser.add_argument("--log_level", default="INFO", help="Logging level (DEBUG, INFO, WARNING, ERROR)")
    args = parser.parse_args()

    setup_logging(args.log_level)
    ensure_dir(args.out_dir)

    try:
        items = extract_line_items(args.pdf, prefer_ocr=args.prefer_ocr)
        if not items:
            raise RuntimeError("No line items extracted. Check PDF quality / parsing rules.")

        # Build output
        products_df = build_products(items)
        variants_df = build_variants(items, args.barcode_start)

        # Cross-check: variants.product_code exists in products.code
        prod_codes = set(products_df["code"].tolist())
        bad = variants_df[~variants_df["product_code"].isin(prod_codes)]
        if not bad.empty:
            raise ValueError(f"Variants contain product_code not in products: {bad['product_code'].unique().tolist()}")

        products_path = os.path.join(args.out_dir, "products-generated.csv")
        variants_path = os.path.join(args.out_dir, "variants-generated.csv")

        products_df.to_csv(products_path, index=False)
        variants_df.to_csv(variants_path, index=False)

        logging.info("Wrote: %s", products_path)
        logging.info("Wrote: %s", variants_path)
        return 0

    except Exception as e:
        logging.error("Failed: %s", e, exc_info=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
