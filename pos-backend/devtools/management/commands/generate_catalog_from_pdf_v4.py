#!/usr/bin/env python3
"""
ICDC PDF Parser (Telangana Liquor) — Production-grade, robust, tunable.

This script extracts product + variant data from scanned Telangana Excise
Invoice-cum-Delivery-Challan PDFs.

Key characteristics:
- Line-item table can appear on ANY page
- Pages without tables are safely skipped
- Geometry-based OCR parsing (robust for scanned tables)
- All OCR & parsing thresholds are CLI-tunable
- Debug artifacts available for visual inspection

RECOMMENDED USAGE (first run):
--------------------------------
python generate_catalog_from_pdf_v4.py \
  --pdf sheet2.pdf \
  --out_dir out \
  --dpi 400 \
  --no_deskew \
  --min_word_conf 15 \
  --min_cluster_size 5 \
  --debug_dump debug

Dependencies:
--------------
pip install pandas pdfplumber pytesseract pillow opencv-python

System dependency:
-------------------
Tesseract OCR must be installed and available in PATH.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

import pandas as pd
import pdfplumber
import pytesseract
from PIL import Image

# Optional OpenCV (deskew + overlays)
try:
    import cv2
    import numpy as np
except Exception:
    cv2 = None
    np = None


# ============================================================
# Data Models
# ============================================================

@dataclass(frozen=True)
class OCRWord:
    """Single OCR word with bounding box."""
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


@dataclass(frozen=True)
class LineItem:
    """Normalized line-item extracted from table."""
    brand_number: str
    brand_name: str
    pack_qty_size: str
    btl_rate: float

    @property
    def size_ml(self) -> str:
        return self.pack_qty_size.split("/")[-1]


# ============================================================
# Utility helpers
# ============================================================

def safe_float(s: str) -> Optional[float]:
    s = (s or "").replace(",", "").strip()
    try:
        return float(s)
    except Exception:
        return None


def normalize_brand_number(raw: str) -> Optional[str]:
    """Preserve leading zeros."""
    digits = re.sub(r"\D", "", raw or "")
    return digits if digits else None


def normalize_pack_size(raw: str) -> Optional[str]:
    s = (raw or "").replace("ml", "").replace("ML", "").replace(" ", "")
    return s if re.fullmatch(r"\d+/\d+", s) else None


def make_sku_10(name: str, size: str) -> str:
    base = f"{name}|{size}".upper()
    base = re.sub(r"[^A-Z0-9|]", "", base)
    return hashlib.sha1(base.encode()).hexdigest().upper()[:10]


# ============================================================
# OCR & Deskew
# ============================================================

def deskew_image(img: Image.Image, max_angle: float) -> Image.Image:
    """
    Deskew image safely.
    Skips deskew if detected angle is extreme (e.g. ±90°).
    """
    if cv2 is None or np is None:
        return img

    gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    coords = cv2.findNonZero(bw)
    if coords is None:
        return img

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    if abs(angle) > max_angle:
        logging.warning("Skipping deskew (angle %.2f too large)", angle)
        return img

    h, w = gray.shape
    M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    rotated = cv2.warpAffine(np.array(img), M, (w, h),
                             flags=cv2.INTER_CUBIC,
                             borderMode=cv2.BORDER_REPLICATE)
    return Image.fromarray(rotated)


def ocr_words(
    img: Image.Image,
    min_conf: int,
    psm: int
) -> List[OCRWord]:
    """
    Run OCR and return words with bounding boxes.
    Tune min_conf if OCR misses numbers.
    """
    data = pytesseract.image_to_data(
        img,
        output_type=pytesseract.Output.DICT,
        config=f"--oem 1 --psm {psm}"
    )

    words = []
    for i, txt in enumerate(data["text"]):
        if not txt.strip():
            continue
        try:
            conf = int(float(data["conf"][i]))
        except Exception:
            continue
        if conf < min_conf:
            continue
        x, y, w, h = (
            data["left"][i],
            data["top"][i],
            data["width"][i],
            data["height"][i],
        )
        words.append(OCRWord(txt.strip(), conf, x, y, x + w, y + h))
    return words


# ============================================================
# Geometry parsing
# ============================================================

def group_lines(words: Sequence[OCRWord], tol_frac: float, page_h: int):
    tol = max(2, int(page_h * tol_frac))
    words = sorted(words, key=lambda w: (w.cy, w.cx))
    lines, cur = [], [words[0]] if words else []

    for w in words[1:]:
        if abs(w.cy - cur[-1].cy) <= tol:
            cur.append(w)
        else:
            lines.append(sorted(cur, key=lambda x: x.cx))
            cur = [w]
    if cur:
        lines.append(sorted(cur, key=lambda x: x.cx))
    return lines


def detect_columns(
    words: Sequence[OCRWord],
    page_w: int,
    min_cluster_size: int,
    band_half_width: int,
):
    """
    Auto-detect Brand / Pack / Rate columns.
    Returns None if detection confidence is low.
    """

    brand_x = [w.cx for w in words if re.fullmatch(r"\d{3,5}", re.sub(r"\D", "", w.text))]
    pack_x = [w.cx for w in words if re.fullmatch(r"\d+/\d+", w.text.replace(" ", ""))]
    rate_x = [w.cx for w in words if re.fullmatch(r"\d+(?:,\d{3})*\.\d{2}", w.text)]

    if len(brand_x) < min_cluster_size or len(pack_x) < min_cluster_size or len(rate_x) < min_cluster_size:
        return None

    def band(center):
        return (max(0, int(center - band_half_width)),
                min(page_w, int(center + band_half_width)))

    brand_c = sorted(brand_x)[len(brand_x) // 2]
    pack_c = sorted(pack_x)[len(pack_x) // 2]
    rate_c = sorted(rate_x)[int(0.75 * len(rate_x))]

    return {
        "brand": band(brand_c),
        "pack": band(pack_c),
        "rate": band(rate_c),
        "name": (band(brand_c)[1], band(pack_c)[0]),
    }


def extract_items_from_page(
    img: Image.Image,
    words: List[OCRWord],
    args,
    page_no: int,
    debug_dir: Optional[str],
) -> List[LineItem]:
    """
    Extract line-items from a single page.
    Safe to return empty list if no table present.
    """
    page_w, page_h = img.size
    cols = detect_columns(
        words,
        page_w,
        args.min_cluster_size,
        args.band_half_width,
    )
    if not cols:
        logging.info("Page %d: no table detected", page_no)
        return []

    lines = group_lines(words, args.line_tol_frac, page_h)
    items = []

    for ln in lines:
        bn = " ".join(w.text for w in ln if cols["brand"][0] <= w.cx <= cols["brand"][1])
        pk = " ".join(w.text for w in ln if cols["pack"][0] <= w.cx <= cols["pack"][1])
        rt = " ".join(w.text for w in ln if cols["rate"][0] <= w.cx <= cols["rate"][1])
        nm = " ".join(w.text for w in ln if cols["name"][0] <= w.cx <= cols["name"][1])

        brand = normalize_brand_number(bn)
        pack = normalize_pack_size(pk)
        rate = safe_float(rt)

        if not brand or not pack or rate is None:
            continue

        items.append(LineItem(brand, nm.strip(), pack, rate))

    if debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        img.save(os.path.join(debug_dir, f"page_{page_no:02d}.png"))

    logging.info("Page %d: %d items", page_no, len(items))
    return items


# ============================================================
# Main extraction pipeline
# ============================================================

def extract_items(pdf_path: str, args) -> List[LineItem]:
    all_items: List[LineItem] = []

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            img = page.to_image(resolution=args.dpi).original.convert("RGB")
            if not args.no_deskew:
                img = deskew_image(img, args.max_deskew_angle)

            words = ocr_words(img, args.min_word_conf, args.psm)
            if not words:
                continue

            items = extract_items_from_page(img, words, args, i, args.debug_dump)
            all_items.extend(items)

    if not all_items:
        raise RuntimeError("No line-items found in any page.")
    return all_items


# ============================================================
# CLI
# ============================================================

def main():
    ap = argparse.ArgumentParser(
        description="Robust ICDC PDF line-item extractor (Telangana Liquor)."
    )

    ap.add_argument("--pdf", required=True, help="Input PDF file")
    ap.add_argument("--out_dir", required=True, help="Output directory for CSVs")
    ap.add_argument("--debug_dump", help="Directory to dump debug images")

    # OCR tuning
    ap.add_argument("--dpi", type=int, default=400,
                    help="PDF render DPI (higher = better OCR, slower)")
    ap.add_argument("--psm", type=int, default=6,
                    help="Tesseract page segmentation mode (6 works best for tables)")
    ap.add_argument("--min_word_conf", type=int, default=15,
                    help="Minimum OCR confidence to keep a word (lower for noisy scans)")

    # Geometry tuning
    ap.add_argument("--min_cluster_size", type=int, default=5,
                    help="Min tokens needed to detect a column")
    ap.add_argument("--band_half_width", type=int, default=140,
                    help="Half-width of detected column band (pixels)")
    ap.add_argument("--line_tol_frac", type=float, default=0.006,
                    help="Row grouping tolerance as fraction of page height")

    # Deskew tuning
    ap.add_argument("--no_deskew", action="store_true",
                    help="Disable deskew entirely")
    ap.add_argument("--max_deskew_angle", type=float, default=45.0,
                    help="Max angle (deg) allowed for deskew rotation")

    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO)

    os.makedirs(args.out_dir, exist_ok=True)
    items = extract_items(args.pdf, args)

    # Build CSVs
    prod = {}
    for it in items:
        prod[it.brand_number] = it.brand_name

    pd.DataFrame(
        [{"code": k, "name": v} for k, v in prod.items()]
    ).to_csv(os.path.join(args.out_dir, "products.csv"), index=False)

    pd.DataFrame(
        [{
            "product_code": it.brand_number,
            "name": f"{it.brand_name}-{it.size_ml}ml",
            "cost": it.btl_rate,
            "sku": make_sku_10(it.brand_name, it.size_ml),
        } for it in items]
    ).to_csv(os.path.join(args.out_dir, "variants.csv"), index=False)

    logging.info("Extraction completed successfully.")


if __name__ == "__main__":
    main()
