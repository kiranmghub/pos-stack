#!/usr/bin/env python3
"""
Generate products + variants CSVs from scanned Telangana Excise invoice PDFs.

Enhancements:
1) Automatic deskew (OpenCV, optional but default ON)
2) Auto-detection of column bands (no fixed x-fractions)
3) --debug_dump to export:
   - deskewed images
   - OCR overlay images
   - per-page extracted rows

Dependencies:
  pip install pandas pdfplumber pytesseract pillow opencv-python

System dependency:
  Tesseract OCR must be installed and on PATH.

Usage:
  python generate_catalog_from_pdf.py --pdf sheet2.pdf --out_dir out --debug_dump debug


pip install opencv-python
pip install pandas pdfplumber pytesseract pillow
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

# Optional: OpenCV for deskew + overlays
try:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
except Exception:
    cv2 = None  # noqa
    np = None  # noqa


# ----------------------------
# Output schemas
# ----------------------------

PRODUCT_COLUMNS = ["code", "name", "category", "description", "active", "tax_category", "image_url"]
VARIANT_COLUMNS = [
    "product_name", "product_code", "sku", "name", "barcode",
    "price", "cost", "uom", "active", "tax_category", "image_url"
]


# ----------------------------
# OCR + parsing knobs
# ----------------------------

DEFAULT_OCR_DPI = 300
MIN_WORD_CONF = 15

# Group words into "lines" if their vertical centers within this fraction of page height
LINE_Y_TOL_FRAC = 0.006

# Ignore top header portion (fraction of page height)
HEADER_CUTOFF_FRAC = 0.20

# Auto-column detection:
# We cluster “anchor” x-positions for key columns using OCR tokens:
# - brand number: tokens like 0019, 5030
# - pack: tokens like 12/650
# - btl rate: money like 125.08 (we’ll pick rightmost money cluster)
MIN_COL_CLUSTER_SIZE = 5

# Cell extraction band padding (pixels) around detected column center
BAND_HALF_WIDTH_PX = 140  # grows/shrinks bands; adjust if needed


# ----------------------------
# Data models
# ----------------------------

@dataclass(frozen=True)
class LineItem:
    brand_number: str
    brand_name: str
    pack_qty_size: str
    btl_rate: float

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


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


# ----------------------------
# Numeric + normalization
# ----------------------------

def safe_float(s: str) -> Optional[float]:
    s = (s or "").strip().replace(",", "")
    if not re.fullmatch(r"-?\d+(\.\d+)?", s):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def normalize_brand_number(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        raise ValueError(f"Invalid brand number: {raw!r}")
    return digits  # keep leading zeros


def normalize_pack_size(raw: str) -> str:
    s = (raw or "").strip().replace(" ", "").replace("ML", "").replace("ml", "")
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
# EAN-13
# ----------------------------

def ean13_check_digit(d12: str) -> str:
    if not (isinstance(d12, str) and d12.isdigit() and len(d12) == 12):
        raise ValueError(f"EAN base must be 12 digits, got: {d12!r}")

    digits = [int(ch) for ch in d12]
    sum_odd = sum(digits[0::2])
    sum_even = sum(digits[1::2])
    total = sum_odd + 3 * sum_even
    check = (10 - (total % 10)) % 10
    return str(check)


def make_ean13(barcode_base_start: int, offset: int) -> str:
    n = barcode_base_start + offset
    if n < 0 or n > 999_999_999_999:
        raise ValueError("barcode_base_start+offset must fit in 12 digits")
    base12 = str(n).zfill(12)
    return base12 + ean13_check_digit(base12)


def valid_ean13(e: str) -> bool:
    if not (isinstance(e, str) and e.isdigit() and len(e) == 13):
        return False
    return ean13_check_digit(e[:12]) == e[12]


# ----------------------------
# Deskew
# ----------------------------

def deskew_pil_image(img: Image.Image) -> Image.Image:
    """
    Deskew using OpenCV minAreaRect on binary image.
    If OpenCV isn't available, returns the original image.
    """
    if cv2 is None or np is None:
        logging.warning("OpenCV not installed; deskew disabled.")
        return img

    cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
    # binarize
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, bw = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    coords = cv2.findNonZero(bw)
    if coords is None:
        return img

    rect = cv2.minAreaRect(coords)
    angle = rect[-1]

    # angle normalization
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    (h, w) = gray.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)

    rotated = cv2.warpAffine(cv_img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    out = Image.fromarray(cv2.cvtColor(rotated, cv2.COLOR_BGR2RGB))
    logging.info("Deskew angle: %.2f degrees", angle)
    return out


# ----------------------------
# OCR word extraction
# ----------------------------

def ocr_words(img: Image.Image) -> List[OCRWord]:
    config = "--oem 1 --psm 6"
    data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT, config=config)

    words: List[OCRWord] = []
    n = len(data["text"])
    for i in range(n):
        txt = (data["text"][i] or "").strip()
        if not txt:
            continue
        try:
            conf = int(float(data["conf"][i]))
        except Exception:
            conf = -1
        if conf < MIN_WORD_CONF:
            continue

        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        words.append(OCRWord(txt, conf, x, y, x + w, y + h))
    return words


# ----------------------------
# Line grouping
# ----------------------------

def group_words_into_lines(words: Sequence[OCRWord], page_h: int) -> List[List[OCRWord]]:
    if not words:
        return []

    tol = max(2, int(page_h * LINE_Y_TOL_FRAC))
    ws = sorted(words, key=lambda w: (w.cy, w.cx))

    lines: List[List[OCRWord]] = []
    cur: List[OCRWord] = [ws[0]]
    cur_y = ws[0].cy

    for w in ws[1:]:
        if abs(w.cy - cur_y) <= tol:
            cur.append(w)
            cur_y = cur_y * 0.9 + w.cy * 0.1
        else:
            lines.append(sorted(cur, key=lambda x: x.cx))
            cur = [w]
            cur_y = w.cy

    lines.append(sorted(cur, key=lambda x: x.cx))
    return lines


def line_text(ws: Sequence[OCRWord]) -> str:
    return " ".join(w.text for w in sorted(ws, key=lambda x: x.cx)).strip()


# ----------------------------
# Auto column detection
# ----------------------------

def is_brand_number_token(t: str) -> bool:
    # Brand numbers in your docs are usually 3–5 digits; keep leading zeros
    return bool(re.fullmatch(r"\d{3,5}", re.sub(r"\D", "", t)))


def is_pack_token(t: str) -> bool:
    t = t.replace("ML", "").replace("ml", "").replace(" ", "")
    return bool(re.fullmatch(r"\d+/\d+", t))


def is_money_token(t: str) -> bool:
    # often OCR yields "125.08" or "1,501.00"
    return bool(re.fullmatch(r"\d{1,3}(?:,\d{3})*(?:\.\d{2})", t.strip()))


def robust_cluster_center(xs: List[float]) -> Optional[float]:
    """
    Return a robust cluster center using median after trimming extremes.
    """
    if len(xs) < MIN_COL_CLUSTER_SIZE:
        return None
    xs2 = sorted(xs)
    trim = max(1, int(0.10 * len(xs2)))
    core = xs2[trim:-trim] if len(xs2) > 2 * trim else xs2
    if not core:
        return None
    return float(core[len(core) // 2])


def auto_detect_columns(words: Sequence[OCRWord], page_w: int, page_h: int) -> Dict[str, Tuple[int, int]]:
    """
    Detect x-bands for:
      - brand_no
      - pack
      - btl_rate
      - brand_name (inferred as band between brand_no and pack)
    """
    cutoff_y = int(page_h * HEADER_CUTOFF_FRAC)
    ws = [w for w in words if w.y0 >= cutoff_y]

    brand_x = [w.cx for w in ws if is_brand_number_token(w.text)]
    pack_x = [w.cx for w in ws if is_pack_token(w.text)]
    money_x = [w.cx for w in ws if is_money_token(w.text)]

    brand_c = robust_cluster_center(brand_x)
    pack_c = robust_cluster_center(pack_x)

    # btl_rate is typically the rightmost money column; use the upper quartile to avoid left rate/case columns
    money_x_sorted = sorted(money_x)
    right_money = money_x_sorted[int(0.75 * len(money_x_sorted)):] if len(money_x_sorted) >= MIN_COL_CLUSTER_SIZE else money_x_sorted
    rate_c = robust_cluster_center(right_money)

    if brand_c is None or pack_c is None or rate_c is None:
        raise RuntimeError(
            "Auto column detection failed. "
            "Try increasing DPI, lowering MIN_WORD_CONF, or enabling --debug_dump to inspect."
        )

    def band(center: float) -> Tuple[int, int]:
        lo = max(0, int(center - BAND_HALF_WIDTH_PX))
        hi = min(page_w, int(center + BAND_HALF_WIDTH_PX))
        return (lo, hi)

    brand_band = band(brand_c)
    pack_band = band(pack_c)
    rate_band = band(rate_c)

    # brand name likely sits between brand number and pack columns
    name_lo = min(brand_band[1], pack_band[0])
    name_hi = max(brand_band[1], pack_band[0])
    # widen a bit
    name_lo = max(0, name_lo - 30)
    name_hi = min(page_w, name_hi + 30)

    return {
        "brand_no": brand_band,
        "brand_name": (name_lo, name_hi),
        "pack": pack_band,
        "btl_rate": rate_band,
    }


def words_in_band(line: Sequence[OCRWord], xband: Tuple[int, int]) -> List[OCRWord]:
    lo, hi = xband
    return [w for w in line if lo <= w.cx <= hi]


# ----------------------------
# Row parsing (with stitch)
# ----------------------------

def parse_rows(words: Sequence[OCRWord], page_w: int, page_h: int, bands: Dict[str, Tuple[int, int]]) -> List[LineItem]:
    cutoff_y = int(page_h * HEADER_CUTOFF_FRAC)
    words2 = [w for w in words if w.y0 >= cutoff_y]
    lines = group_words_into_lines(words2, page_h)

    raw_rows: List[Tuple[str, str, str, str]] = []
    for ln in lines:
        bn = line_text(words_in_band(ln, bands["brand_no"]))
        nm = line_text(words_in_band(ln, bands["brand_name"]))
        pk = line_text(words_in_band(ln, bands["pack"])).replace("ML", "").replace("ml", "").strip()
        br = line_text(words_in_band(ln, bands["btl_rate"]))

        if not (bn or nm or pk or br):
            continue
        raw_rows.append((bn, nm, pk, br))

    # Stitch wrapped brand names:
    stitched: List[Tuple[str, str, str, str]] = []
    i = 0
    while i < len(raw_rows):
        bn, nm, pk, br = raw_rows[i]
        bn_digits = re.sub(r"\D", "", bn)
        has_bn = bool(bn_digits)
        has_pack = bool(re.search(r"\d+/\d+", pk.replace(" ", "")))

        if has_bn and (not nm or len(nm) < 4):
            if i + 1 < len(raw_rows):
                bn2, nm2, pk2, br2 = raw_rows[i + 1]
                bn2_digits = re.sub(r"\D", "", bn2)
                # next line continues name if it has no brand_no but has some name text
                if not bn2_digits and nm2:
                    nm = (nm + " " + nm2).strip()
                    # prefer pack/rate that exist
                    pk = pk if pk else pk2
                    br = br if br else br2
                    i += 1

        stitched.append((bn, nm, pk, br))
        i += 1

    # Convert into validated items
    items: List[LineItem] = []
    for bn, nm, pk, br in stitched:
        bn_digits = re.sub(r"\D", "", bn)
        if not bn_digits:
            continue
        mpack = re.search(r"(\d+/\d+)", pk.replace(" ", ""))
        if not mpack:
            continue
        pack_norm = mpack.group(1)

        # rate: pick last numeric-like token in rate cell
        nums = re.findall(r"\d{1,3}(?:,\d{3})*(?:\.\d{2})", br)
        if not nums:
            continue
        btl = safe_float(nums[-1])
        if btl is None:
            continue

        brand_name = re.sub(r"\s+", " ", (nm or "").strip())
        if len(brand_name) < 3:
            continue

        try:
            brand_number = normalize_brand_number(bn_digits)
            pack_qty_size = normalize_pack_size(pack_norm)
        except Exception:
            continue

        items.append(LineItem(brand_number, brand_name, pack_qty_size, btl))

    return items


# ----------------------------
# Debug overlays
# ----------------------------

def draw_debug_overlay(img: Image.Image, words: Sequence[OCRWord], bands: Dict[str, Tuple[int, int]], out_path: str) -> None:
    """
    Writes a PNG with:
      - word boxes
      - vertical column bands
    """
    if cv2 is None or np is None:
        logging.warning("OpenCV not installed; debug overlay disabled.")
        return

    cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    # Draw bands
    h, w = cv_img.shape[:2]
    for key, (x0, x1) in bands.items():
        cv2.rectangle(cv_img, (x0, 0), (x1, h), (0, 255, 255), 2)  # yellow-ish
        cv2.putText(cv_img, key, (x0 + 5, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

    # Draw word boxes
    for wd in words:
        cv2.rectangle(cv_img, (wd.x0, wd.y0), (wd.x1, wd.y1), (0, 255, 0), 1)

    cv2.imwrite(out_path, cv_img)


# ----------------------------
# Extraction pipeline
# ----------------------------

def extract_items_from_pdf(pdf_path: str, dpi: int, deskew: bool, debug_dump: Optional[str] = None) -> List[LineItem]:
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(pdf_path)

    all_items: List[LineItem] = []

    with pdfplumber.open(pdf_path) as pdf:
        for pageno, page in enumerate(pdf.pages, start=1):
            pil_img = page.to_image(resolution=dpi).original.convert("RGB")

            if deskew:
                pil_img = deskew_pil_image(pil_img)

            words = ocr_words(pil_img)
            if not words:
                logging.warning("No OCR words on page %d", pageno)
                continue

            page_w, page_h = pil_img.size
            bands = auto_detect_columns(words, page_w, page_h)
            items = parse_rows(words, page_w, page_h, bands)

            logging.info("Page %d: %d items", pageno, len(items))
            all_items.extend(items)

            if debug_dump:
                ensure_dir(debug_dump)
                img_out = os.path.join(debug_dump, f"page_{pageno:02d}_deskewed.png")
                overlay_out = os.path.join(debug_dump, f"page_{pageno:02d}_overlay.png")
                rows_out = os.path.join(debug_dump, f"page_{pageno:02d}_rows.csv")

                pil_img.save(img_out)
                draw_debug_overlay(pil_img, words, bands, overlay_out)

                pd.DataFrame([{
                    "brand_number": it.brand_number,
                    "brand_name": it.brand_name,
                    "pack_qty_size": it.pack_qty_size,
                    "btl_rate": it.btl_rate
                } for it in items]).to_csv(rows_out, index=False)

    if not all_items:
        raise RuntimeError("No line items extracted. Try increasing DPI or lowering MIN_WORD_CONF.")
    return all_items


# ----------------------------
# Build outputs + validations
# ----------------------------

def validate_products_df(df: pd.DataFrame) -> None:
    for c in PRODUCT_COLUMNS:
        if c not in df.columns:
            raise ValueError(f"Products missing column {c}")

    if df["code"].isna().any():
        raise ValueError("Products has missing codes")

    if not all(isinstance(x, str) for x in df["code"].tolist()):
        raise ValueError("Products.code must be string (preserve leading zeros)")

    if df["code"].duplicated().any():
        raise ValueError(f"Duplicate product codes: {df[df['code'].duplicated()]['code'].tolist()}")


def validate_variants_df(df: pd.DataFrame) -> None:
    for c in VARIANT_COLUMNS:
        if c not in df.columns:
            raise ValueError(f"Variants missing column {c}")

    if df["sku"].duplicated().any():
        raise ValueError(f"Duplicate SKUs: {df[df['sku'].duplicated()]['sku'].tolist()}")

    if not df["barcode"].map(valid_ean13).all():
        raise ValueError("Invalid EAN-13 barcode(s) found")


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
    ap.add_argument("--pdf", required=True, help="Input PDF file")
    ap.add_argument("--out_dir", default="out", help="Output directory")
    ap.add_argument("--dpi", type=int, default=DEFAULT_OCR_DPI)
    ap.add_argument("--no_deskew", action="store_true", help="Disable deskew")
    ap.add_argument("--debug_dump", default=None, help="Directory to dump debug artifacts")
    ap.add_argument(
        "--barcode_base_start",
        type=int,
        default=890000000000,  # 12-digit base; check digit will be appended
        help="Starting 12-digit base for EAN-13 barcode generation",
    )
    ap.add_argument("--log_level", default="INFO")
    args = ap.parse_args()

    setup_logging(args.log_level)
    ensure_dir(args.out_dir)

    try:
        items = extract_items_from_pdf(
            pdf_path=args.pdf,
            dpi=args.dpi,
            deskew=not args.no_deskew,
            debug_dump=args.debug_dump,
        )

        products_df = build_products(items)
        variants_df = build_variants(items, barcode_base_start=args.barcode_base_start)

        # Cross-check variant product_code in products
        prod_codes = set(products_df["code"].tolist())
        bad = variants_df[~variants_df["product_code"].isin(prod_codes)]
        if not bad.empty:
            raise ValueError(f"Variants contain unknown product_code(s): {bad['product_code'].unique().tolist()}")

        prod_path = os.path.join(args.out_dir, "products-generated.csv")
        var_path = os.path.join(args.out_dir, "variants-generated.csv")

        products_df.to_csv(prod_path, index=False)
        variants_df.to_csv(var_path, index=False)

        logging.info("Wrote %s", prod_path)
        logging.info("Wrote %s", var_path)
        return 0

    except Exception as e:
        logging.exception("Failed: %s", e)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
