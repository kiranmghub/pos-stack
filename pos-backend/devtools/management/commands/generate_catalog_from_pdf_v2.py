#!/usr/bin/env python3
"""
Generate products + variants CSVs from Telangana Excise "Invoice Cum Delivery Challan" PDFs.

Key features:
- Robust extraction from scanned PDFs via OCR using word bounding boxes (geometry-based parsing)
- Handles multi-page tables, skew/quality variations, and wrapped brand names
- Preserves leading zeros in Brand Number
- Generates deterministic 10-char SKU per (brand_name + size_ml)
- Generates EAN-13 compliant barcodes (12-digit base + check digit)

Dependencies:
  pip install pandas pdfplumber pytesseract pillow

System dependency:
  Tesseract OCR must be installed and on PATH.

Usage:
  python generate_catalog_from_pdf.py --pdf sheet2.pdf --out_dir out


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
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import pandas as pd

import pdfplumber  # type: ignore
import pytesseract  # type: ignore
from PIL import Image  # type: ignore


# ----------------------------
# Config
# ----------------------------

PRODUCT_COLUMNS = ["code", "name", "category", "description", "active", "tax_category", "image_url"]
VARIANT_COLUMNS = [
    "product_name", "product_code", "sku", "name", "barcode",
    "price", "cost", "uom", "active", "tax_category", "image_url"
]

# OCR / parsing tuning knobs
DEFAULT_OCR_DPI = 300
# Group words into "lines" if their vertical centers are within this fraction of page height
LINE_Y_TOL_FRAC = 0.006  # adjust if needed (works well across your samples)
# Drop rows above this fraction (header area) to reduce false positives
HEADER_CUTOFF_FRAC = 0.20
# Minimum confidence (0-100) for OCR words; lower values = more recall, more noise
MIN_WORD_CONF = 35

# Column regions as fractions of page width; these are approximate and robust across your examples.
# If the layout changes, adjust these ranges.
COL_BRAND_NO_X = (0.05, 0.17)
COL_BRAND_NAME_X = (0.17, 0.50)
COL_PACK_X = (0.50, 0.63)
COL_BTL_RATE_X = (0.83, 0.93)  # “Unit Rate / Btl Rate” (lower value under rate/case)


# ----------------------------
# Models
# ----------------------------

@dataclass(frozen=True)
class LineItem:
    brand_number: str          # keep leading zeros
    brand_name: str
    pack_qty_size: str         # like "12/650"
    btl_rate: float            # bottle rate (cost)

    @property
    def size_ml(self) -> str:
        parts = self.pack_qty_size.split("/")
        return parts[-1].strip() if parts else ""


@dataclass(frozen=True)
class OCRWord:
    text: str
    conf: int
    x0: int
    y0: int
    x1: int
    y1: int

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2


# ----------------------------
# Logging
# ----------------------------

def setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(message)s",
    )


# ----------------------------
# Helpers / Validation
# ----------------------------

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def safe_float(s: str) -> Optional[float]:
    s = (s or "").strip().replace(",", "")
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def normalize_brand_number(raw: str) -> str:
    # Keep leading zeros; remove non-digits only.
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        raise ValueError(f"Invalid brand number: {raw!r}")
    return digits


def normalize_pack_size(raw: str) -> str:
    s = (raw or "").strip().replace(" ", "")
    if not re.fullmatch(r"\d+/\d+", s):
        raise ValueError(f"Invalid pack qty/size: {raw!r}")
    return s


def money_2dp(x: float) -> str:
    return f"{x:.2f}"


def make_sku_10(brand_name: str, size_ml: str) -> str:
    base = f"{brand_name}|{size_ml}".upper()
    base = re.sub(r"[^A-Z0-9|]", "", base)
    return hashlib.sha1(base.encode("utf-8")).hexdigest().upper()[:10]


def picsum_url(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/300/300"


# ----------------------------
# EAN-13 Barcode
# ----------------------------

def ean13_check_digit(d12: str) -> str:
    """
    EAN-13 check digit for a 12-digit base.
    Algorithm:
      sum_odd = sum(digits in odd positions (1,3,5,...,11))
      sum_even = sum(digits in even positions (2,4,6,...,12))
      total = sum_odd + 3*sum_even
      check = (10 - (total % 10)) % 10
    """
    if not (isinstance(d12, str) and d12.isdigit() and len(d12) == 12):
        raise ValueError(f"EAN base must be 12 digits, got: {d12!r}")

    digits = [int(ch) for ch in d12]
    sum_odd = sum(digits[0::2])
    sum_even = sum(digits[1::2])
    total = sum_odd + 3 * sum_even
    check = (10 - (total % 10)) % 10
    return str(check)


def make_ean13(barcode_base_start: int, offset: int) -> str:
    """
    Generate an EAN-13 barcode as:
      base12 = zero-padded 12-digit number from (barcode_base_start + offset)
      ean13 = base12 + checkdigit(base12)

    IMPORTANT: barcode_base_start should be <= 999999999999
    """
    n = barcode_base_start + offset
    if n < 0 or n > 999_999_999_999:
        raise ValueError("barcode_base_start+offset must fit in 12 digits")
    base12 = str(n).zfill(12)
    return base12 + ean13_check_digit(base12)


# ----------------------------
# OCR extraction
# ----------------------------

def ocr_words_from_page_image(img: Image.Image) -> List[OCRWord]:
    """
    Extract OCR words with bounding boxes and confidence.
    """
    # Use Tesseract in LSTM mode; psm=6 works well for table-like content.
    config = "--oem 1 --psm 6"
    data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT, config=config)

    words: List[OCRWord] = []
    n = len(data["text"])
    for i in range(n):
        text = (data["text"][i] or "").strip()
        if not text:
            continue
        try:
            conf = int(float(data["conf"][i]))
        except Exception:
            conf = -1
        if conf < MIN_WORD_CONF:
            continue

        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        words.append(OCRWord(text=text, conf=conf, x0=x, y0=y, x1=x + w, y1=y + h))
    return words


def group_words_into_lines(words: Sequence[OCRWord], page_h: int) -> List[List[OCRWord]]:
    """
    Group OCR words into horizontal lines using y-center clustering.
    """
    if not words:
        return []

    tol = max(2, int(page_h * LINE_Y_TOL_FRAC))
    sorted_words = sorted(words, key=lambda w: (w.cy, w.cx))

    lines: List[List[OCRWord]] = []
    current: List[OCRWord] = [sorted_words[0]]
    cur_y = sorted_words[0].cy

    for w in sorted_words[1:]:
        if abs(w.cy - cur_y) <= tol:
            current.append(w)
            cur_y = (cur_y * 0.9) + (w.cy * 0.1)  # smooth
        else:
            lines.append(sorted(current, key=lambda x: x.cx))
            current = [w]
            cur_y = w.cy

    lines.append(sorted(current, key=lambda x: x.cx))
    return lines


def words_in_xband(line: Sequence[OCRWord], x0: float, x1: float, page_w: int) -> List[OCRWord]:
    lo = x0 * page_w
    hi = x1 * page_w
    return [w for w in line if lo <= w.cx <= hi]


def line_text(ws: Sequence[OCRWord]) -> str:
    return " ".join(w.text for w in sorted(ws, key=lambda x: x.cx)).strip()


def parse_rows_from_ocr(words: Sequence[OCRWord], page_w: int, page_h: int) -> List[LineItem]:
    """
    Build table rows by extracting cells from column bands and validating.
    Includes a stitch step for wrapped brand names.
    """
    # Drop header region to reduce noise
    cutoff_y = int(page_h * HEADER_CUTOFF_FRAC)
    words2 = [w for w in words if w.y0 >= cutoff_y]

    lines = group_words_into_lines(words2, page_h=page_h)

    raw_rows: List[Tuple[str, str, str, str]] = []  # brand_no, brand_name, pack, btl_rate_text
    for ln in lines:
        brand_no_txt = line_text(words_in_xband(ln, *COL_BRAND_NO_X, page_w))
        brand_name_txt = line_text(words_in_xband(ln, *COL_BRAND_NAME_X, page_w))
        pack_txt = line_text(words_in_xband(ln, *COL_PACK_X, page_w))
        btl_txt = line_text(words_in_xband(ln, *COL_BTL_RATE_X, page_w))

        # quick filters
        if not brand_no_txt and not pack_txt and not btl_txt:
            continue

        # Normalize likely OCR variants (e.g., "12/650ml" -> "12/650")
        pack_txt = pack_txt.replace("ml", "").replace("ML", "").strip()

        raw_rows.append((brand_no_txt, brand_name_txt, pack_txt, btl_txt))

    # Stitch wrapped names:
    # If a row has a brand number but empty name, and next row has name but empty brand number,
    # merge them. Also merge if brand name seems too short and next line continues.
    stitched: List[Tuple[str, str, str, str]] = []
    i = 0
    while i < len(raw_rows):
        bn, nm, pk, br = raw_rows[i]

        bn_clean = re.sub(r"\D", "", bn)
        has_bn = bool(bn_clean)
        has_pk = bool(re.search(r"\d+/\d+", pk))
        has_rate = safe_float(re.sub(r"[^\d.,]", "", br) or "") is not None

        if has_bn and (not nm or len(nm) < 4):
            # lookahead for continuation
            if i + 1 < len(raw_rows):
                bn2, nm2, pk2, br2 = raw_rows[i + 1]
                bn2_clean = re.sub(r"\D", "", bn2)
                if not bn2_clean and nm2 and (pk2 == "" or pk2 == pk) and (br2 == "" or br2 == br):
                    nm = (nm + " " + nm2).strip()
                    # prefer pack/rate from the first row if present
                    pk = pk if pk else pk2
                    br = br if br else br2
                    i += 1

        stitched.append((bn, nm, pk, br))
        i += 1

    # Convert stitched rows into LineItems with strong validation
    items: List[LineItem] = []
    for bn, nm, pk, br in stitched:
        # brand number must be present and 3-5 digits typically (keep leading zeros)
        bn_digits = re.sub(r"\D", "", bn)
        if not bn_digits:
            continue

        # pack must exist
        m_pack = re.search(r"(\d+/\d+)", pk.replace(" ", ""))
        if not m_pack:
            continue
        pack_norm = m_pack.group(1)

        # btl rate: choose the last numeric in btl cell (OCR sometimes includes two numbers)
        nums = re.findall(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?", br)
        if not nums:
            continue
        btl = safe_float(nums[-1])
        if btl is None:
            continue

        try:
            brand_number = normalize_brand_number(bn_digits)
            pack_qty_size = normalize_pack_size(pack_norm)
            brand_name = re.sub(r"\s+", " ", (nm or "").strip())
            if len(brand_name) < 3:
                continue
            items.append(LineItem(brand_number=brand_number, brand_name=brand_name, pack_qty_size=pack_qty_size, btl_rate=btl))
        except Exception:
            continue

    return items


def extract_line_items(pdf_path: str, dpi: int = DEFAULT_OCR_DPI) -> List[LineItem]:
    """
    OCR every page and parse rows geometrically.
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(pdf_path)

    all_items: List[LineItem] = []
    with pdfplumber.open(pdf_path) as pdf:
        for pageno, page in enumerate(pdf.pages, start=1):
            # Render page image at DPI
            pil_img = page.to_image(resolution=dpi).original.convert("RGB")

            # OCR words
            words = ocr_words_from_page_image(pil_img)
            if not words:
                logging.warning("No OCR words found on page %d", pageno)
                continue

            page_w, page_h = pil_img.size
            items = parse_rows_from_ocr(words, page_w=page_w, page_h=page_h)

            logging.info("Parsed %d line items from page %d", len(items), pageno)
            all_items.extend(items)

    if not all_items:
        raise RuntimeError("No line items extracted. Consider increasing DPI or lowering MIN_WORD_CONF.")
    return all_items


# ----------------------------
# Build CSVs + Validations
# ----------------------------

def validate_products_df(df: pd.DataFrame) -> None:
    missing = [c for c in PRODUCT_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Products missing columns: {missing}")

    if df["code"].isna().any():
        raise ValueError("Products has missing codes")

    # preserve leading zeros (string)
    if not all(isinstance(x, str) for x in df["code"].tolist()):
        raise ValueError("Products.code must be strings (preserves leading zeros)")

    if df["code"].duplicated().any():
        dups = df[df["code"].duplicated()]["code"].tolist()
        raise ValueError(f"Duplicate product codes: {dups}")


def validate_variants_df(df: pd.DataFrame) -> None:
    missing = [c for c in VARIANT_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Variants missing columns: {missing}")

    req = ["product_code", "product_name", "sku", "name", "barcode", "price", "cost"]
    for c in req:
        if df[c].isna().any():
            raise ValueError(f"Variants has missing values in {c}")

    if df["sku"].duplicated().any():
        dups = df[df["sku"].duplicated()]["sku"].tolist()
        raise ValueError(f"Duplicate skus: {dups}")

    # EAN-13 format check
    if not df["barcode"].map(lambda x: isinstance(x, str) and x.isdigit() and len(x) == 13).all():
        raise ValueError("All barcodes must be 13-digit numeric strings")

    # numeric checks
    for col in ["price", "cost"]:
        if not df[col].map(lambda x: safe_float(str(x)) is not None).all():
            raise ValueError(f"{col} must be numeric")

    # check-digit verification
    def valid_ean13(e: str) -> bool:
        if not (isinstance(e, str) and e.isdigit() and len(e) == 13):
            return False
        base12, cd = e[:12], e[12]
        return ean13_check_digit(base12) == cd

    if not df["barcode"].map(valid_ean13).all():
        raise ValueError("One or more EAN-13 barcodes have invalid check digits")


def build_products(items: List[LineItem]) -> pd.DataFrame:
    by_code: Dict[str, str] = {}
    for it in items:
        by_code.setdefault(it.brand_number, it.brand_name)

    rows = []
    for code, name in sorted(by_code.items(), key=lambda x: x[0]):
        rows.append({
            "code": code,
            "name": name,
            "category": "Alcohol",
            "description": f"Alcohol product: {name.title()}",
            "active": "True",
            "tax_category": "Alcohol",
            "image_url": "",
        })

    df = pd.DataFrame(rows, columns=PRODUCT_COLUMNS)
    validate_products_df(df)
    return df


def build_variants(items: List[LineItem], barcode_base_start: int) -> pd.DataFrame:
    rows = []
    for idx, it in enumerate(items):
        sku = make_sku_10(it.brand_name, it.size_ml)

        # EAN-13: base must be 12 digits start
        barcode = make_ean13(barcode_base_start, idx)

        cost = float(it.btl_rate)
        price = round(cost * 1.20, 2)

        rows.append({
            "product_name": it.brand_name,
            "product_code": it.brand_number,
            "sku": sku,
            "name": f"{it.brand_name}-{it.size_ml}ml",
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
# Main
# ----------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, help="Input PDF file path")
    ap.add_argument("--out_dir", default="out", help="Output directory")
    ap.add_argument("--dpi", type=int, default=DEFAULT_OCR_DPI, help="OCR render DPI")
    ap.add_argument(
        "--barcode_base_start",
        type=int,
        default=890000000000,  # NOTE: 12 digits (not 13). Check digit will be appended.
        help="Starting 12-digit base for EAN-13 barcode generation",
    )
    ap.add_argument("--log_level", default="INFO")
    args = ap.parse_args()

    setup_logging(args.log_level)
    ensure_dir(args.out_dir)

    try:
        items = extract_line_items(args.pdf, dpi=args.dpi)
        products_df = build_products(items)
        variants_df = build_variants(items, barcode_base_start=args.barcode_base_start)

        # Cross-check: all variant product_codes exist in products
        prod_codes = set(products_df["code"].tolist())
        bad = variants_df[~variants_df["product_code"].isin(prod_codes)]
        if not bad.empty:
            raise ValueError(f"Variants contain unknown product_code(s): {bad['product_code'].unique().tolist()}")

        prod_out = os.path.join(args.out_dir, "products-generated.csv")
        var_out = os.path.join(args.out_dir, "variants-generated.csv")

        products_df.to_csv(prod_out, index=False)
        variants_df.to_csv(var_out, index=False)

        logging.info("Wrote %s", prod_out)
        logging.info("Wrote %s", var_out)
        return 0

    except Exception as e:
        logging.exception("Failed: %s", e)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
