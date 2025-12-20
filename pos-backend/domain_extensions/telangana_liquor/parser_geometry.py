# domain_extensions/telangana_liquor/parser_geometry.py
"""
Geometry-based ICDC PDF Parser for Telangana Liquor invoices.

Uses OCR with bounding boxes to reconstruct table structure from scanned PDFs.
This approach is more reliable than regex-based text parsing for table-based documents.

Based on the proven approach from generate_catalog_from_pdf_v3.py
"""

import os
import re
from typing import Dict, List, Optional, Tuple, Any
from decimal import Decimal, InvalidOperation
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

PARSER_VERSION = "2.0.0"  # Major version bump for geometry-based rewrite


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except Exception:
        return default


# OCR Configuration (tunable via environment for ops without code changes)
DEFAULT_OCR_DPI = _env_int("ICDC_PARSER_OCR_DPI", 350)
MIN_WORD_CONF = _env_int("ICDC_PARSER_MIN_WORD_CONF", 12)  # Minimum OCR confidence to include a word
PRIMARY_PSM = _env_int("ICDC_PARSER_PSM", 6)
SECONDARY_PSM = _env_int("ICDC_PARSER_SECONDARY_PSM", 4)
SECOND_PASS_MIN_WORDS = _env_int("ICDC_PARSER_SECOND_PASS_MIN_WORDS", 25)
LINE_Y_TOL_FRAC = _env_float("ICDC_PARSER_LINE_Y_TOL_FRAC", 0.006)  # Fraction of page height for grouping words into lines
HEADER_CUTOFF_FRAC = _env_float("ICDC_PARSER_HEADER_CUTOFF_FRAC", 0.18)  # Ignore top portion of page (header)
MIN_COL_CLUSTER_SIZE = _env_int("ICDC_PARSER_MIN_COL_CLUSTER_SIZE", 4)  # Minimum words needed to detect a column
BAND_HALF_WIDTH_PX = _env_int("ICDC_PARSER_BAND_HALF_WIDTH_PX", 150)  # Half-width of column bands in pixels


class ParsingError(Exception):
    """Custom exception for parsing errors"""
    pass


class OCRWord:
    """Represents a single word from OCR with its position and confidence"""
    def __init__(self, text: str, conf: int, x0: int, y0: int, x1: int, y1: int):
        self.text = text
        self.conf = conf
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1
    
    @property
    def cx(self) -> float:
        """Center X coordinate"""
        return (self.x0 + self.x1) / 2
    
    @property
    def cy(self) -> float:
        """Center Y coordinate"""
        return (self.y0 + self.y1) / 2


class ICDCParserGeometry:
    """
    Geometry-based parser for ICDC PDFs.
    
    Uses OCR with bounding boxes to reconstruct table structure,
    making it more reliable for scanned multi-page table documents.
    """
    
    def __init__(self):
        self.version = PARSER_VERSION
    
    def parse(self, pdf_file_path: str, debug_dump: Optional[str] = None) -> Dict[str, Any]:
        """
        Parse an ICDC PDF file using geometry-based OCR.
        
        Args:
            pdf_file_path: Path to the PDF file
            debug_dump: Optional directory path to dump debug artifacts
            
        Returns:
            Dictionary containing parsed data with metadata
        """
        errors = []
        warnings = []
        parsing_method = None
        confidence = 0.0
        
        try:
            # Try text-based parsing first (for native PDFs)
            try:
                result = self._parse_text_based(pdf_file_path)
                parsing_method = "text"
                confidence = 1.0
                logger.info("Successfully parsed PDF using text extraction")
            except Exception as e:
                logger.info(f"Text-based parsing failed: {e}, falling back to OCR")
                warnings.append(f"Text extraction failed: {str(e)}")
                # Fall back to geometry-based OCR
                result = self._parse_ocr_geometry(pdf_file_path, debug_dump=debug_dump)
                parsing_method = "ocr_geometry"
                result_meta = result.get("metadata", {}) or {}
                confidence = result_meta.get("confidence", 0.5)
                # Carry forward any warnings the OCR routine produced
                warnings.extend(result_meta.get("warnings", []))
        except Exception as e:
            logger.error(f"PDF parsing failed: {e}", exc_info=True)
            errors.append(f"Failed to parse PDF: {str(e)}")
            result = {
                "header": {},
                "lines": [],
                "totals": {},
            }
            parsing_method = "failed"
            confidence = 0.0
        
        # Add metadata
        result["metadata"] = {
            "parser_version": self.version,
            "parsing_method": parsing_method,
            "confidence": confidence,
            "errors": errors,
            "warnings": warnings,
        }
        
        return result
    
    def _parse_text_based(self, pdf_file_path: str) -> Dict[str, Any]:
        """Parse text-based PDF using pdfplumber"""
        try:
            import pdfplumber
        except ImportError:
            raise ParsingError("pdfplumber is not installed")
        
        with pdfplumber.open(pdf_file_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                full_text += (page.extract_text() or "") + "\n"
            
            if not full_text.strip():
                raise ParsingError("No text found in PDF")
            
            return self._parse_text_content(full_text)
    
    def _parse_text_content(self, text: str) -> Dict[str, Any]:
        """Parse text content - this is a fallback for text-based PDFs"""
        lines_list = [line.strip() for line in text.split('\n') if line.strip()]
        
        header = self._parse_header_text(lines_list)
        invoice_lines = self._parse_line_items_text(lines_list)
        totals = self._parse_totals_text(lines_list)
        
        # If text extraction yields no rows, force OCR fallback
        if not invoice_lines:
            raise ParsingError("Text extraction yielded no line items; fallback to OCR")
        
        return {
            "header": header,
            "lines": invoice_lines,
            "totals": totals,
        }
    
    def _parse_ocr_geometry(self, pdf_file_path: str, debug_dump: Optional[str] = None) -> Dict[str, Any]:
        """
        Parse scanned PDF using geometry-based OCR.
        
        This is the main method that uses bounding boxes to reconstruct table structure.
        """
        try:
            import pdfplumber
            import pytesseract
            from PIL import Image
        except ImportError as e:
            raise ParsingError(f"Required OCR libraries not installed: {e}")
        
        # Optional: OpenCV for deskew
        try:
            import cv2
            import numpy as np
            has_opencv = True
        except ImportError:
            has_opencv = False
            logger.warning("OpenCV not available, deskew will be disabled")
        
        all_items = []
        header = {}
        totals = {}
        all_words = []
        page_confidences = []
        cached_bands = None  # Cache bands from successful detection to reuse on subsequent pages
        warnings_local: List[str] = []
        
        rejected_rows_samples: List[Dict[str, Any]] = []
        
        with pdfplumber.open(pdf_file_path) as pdf:
            num_pages = len(pdf.pages)
            logger.info(f"Processing {num_pages} page(s) from PDF")
            
            for pageno, page in enumerate(pdf.pages, start=1):
                logger.info(f"Processing page {pageno}/{num_pages}")
                
                # Render page to image using pdfplumber (avoids pdf2image/poppler dependency)
                try:
                    pil_img = page.to_image(resolution=DEFAULT_OCR_DPI).original.convert("RGB")
                except Exception as e:
                    logger.error(f"Failed to render page {pageno}: {e}")
                    continue
                
                page_w, page_h = pil_img.size
                
                # Apply deskew if available
                if has_opencv:
                    try:
                        pil_img = self._deskew_image(pil_img)
                    except Exception as e:
                        logger.warning(f"Deskew failed for page {pageno}: {e}")
                
                # Extract words with bounding boxes
                words = self._ocr_words(pil_img)
                if not words:
                    logger.warning(f"No OCR words found on page {pageno}")
                    continue
                
                logger.info(f"Page {pageno}: Extracted {len(words)} OCR words")
                
                # Calculate average confidence for this page
                if words:
                    avg_conf = sum(w.conf for w in words) / len(words)
                    page_confidences.append(avg_conf)
                    logger.debug(f"Page {pageno}: Average OCR confidence: {avg_conf:.1f}%")
                
                # Parse header from first page only
                if pageno == 1:
                    header = self._parse_header_from_words(words, page_w, page_h)
                
                # Detect column bands - try detection first, fall back to cached bands if available
                bands = None
                try:
                    bands = self._auto_detect_columns(words, page_w, page_h, cached_bands=cached_bands)
                    logger.debug(f"Page {pageno}: Detected columns: {list(bands.keys())}")
                    # Cache successful bands for use on subsequent pages
                    cached_bands = bands
                except Exception as e:
                    logger.warning(f"Column detection failed on page {pageno}: {e}")
                    if cached_bands:
                        logger.info(f"Page {pageno}: Reusing column bands from previous successful page")
                        bands = cached_bands
                    else:
                        logger.warning(f"Page {pageno}: No cached bands available, skipping this page")
                        continue
                
                # Parse line items from this page
                try:
                    page_items, page_rejections = self._parse_rows_from_words(words, page_w, page_h, bands)
                    logger.info(f"Page {pageno}: Extracted {len(page_items)} line items")
                    all_items.extend(page_items)
                    if page_rejections and len(rejected_rows_samples) < 5:
                        rejected_rows_samples.extend(page_rejections[:5 - len(rejected_rows_samples)])
                except Exception as e:
                    logger.warning(f"Failed to parse rows from page {pageno}: {e}")
                    # Continue with next page instead of failing completely
                    continue
                
                # Parse totals from last page
                if pageno == num_pages:
                    totals = self._parse_totals_from_words(words, page_w, page_h)
                
                # Debug dump
                if debug_dump:
                    self._debug_dump_page(pil_img, words, bands, pageno, debug_dump, page_items)
        
        # Calculate overall confidence
        overall_confidence = sum(page_confidences) / len(page_confidences) / 100.0 if page_confidences else 0.5
        # Boost confidence if we extracted line items
        if all_items:
            overall_confidence = min(0.95, overall_confidence + (len(all_items) / 100.0))
        else:
            warnings_local.append("OCR extraction returned no valid line items; check PDF quality or adjust OCR settings.")
        
        return {
            "header": header,
            "lines": all_items,
            "totals": totals,
            "metadata": {
                "confidence": overall_confidence,
                "pages_processed": num_pages,
                "total_line_items": len(all_items),
                "last_detected_bands": cached_bands,
                "rejected_row_samples": rejected_rows_samples,
                "warnings": warnings_local,
            }
        }
    
    def _ocr_words(self, img) -> List[OCRWord]:
        """
        Extract words from image with bounding boxes using pytesseract.
        
        Uses image_to_data() instead of image_to_string() to get positional information.
        """
        try:
            import pytesseract
            from PIL import ImageEnhance
        except ImportError:
            raise ParsingError("pytesseract is not installed")
        
        def run_ocr(image, psm: int, min_conf: int) -> List[OCRWord]:
            config = f"--oem 1 --psm {psm}"
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config=config)
            words_local: List[OCRWord] = []
            n = len(data["text"])
            for i in range(n):
                txt = (data["text"][i] or "").strip()
                if not txt:
                    continue
                
                try:
                    conf = int(float(data["conf"][i]))
                except (ValueError, TypeError):
                    conf = -1
                
                if conf < min_conf:
                    continue
                
                x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
                words_local.append(OCRWord(txt, conf, x, y, x + w, y + h))
            return words_local
        
        # Light preprocessing to boost contrast before OCR
        try:
            gray = img.convert("L")
            enhanced = ImageEnhance.Contrast(gray).enhance(1.6)
        except Exception:
            enhanced = img
        
        words = run_ocr(enhanced, PRIMARY_PSM, MIN_WORD_CONF)
        
        # If OCR is too sparse, retry with more permissive settings
        if len(words) < SECOND_PASS_MIN_WORDS:
            alt_min_conf = max(5, MIN_WORD_CONF - 5)
            try:
                logger.warning(f"OCR first pass returned {len(words)} words; retrying with PSM={SECONDARY_PSM}, min_conf={alt_min_conf}")
                words = run_ocr(enhanced, SECONDARY_PSM, alt_min_conf)
            except Exception as e:
                logger.warning(f"Secondary OCR pass failed: {e}")
        
        return words
    
    def _deskew_image(self, img) -> Any:
        """
        Deskew image using OpenCV minAreaRect.
        Returns original image if deskew fails or OpenCV unavailable.
        """
        from PIL import Image
        
        try:
            import cv2
            import numpy as np
        except ImportError:
            return img
        
        try:
            cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
            
            # Binarize
            blur = cv2.GaussianBlur(gray, (5, 5), 0)
            _, bw = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            
            coords = cv2.findNonZero(bw)
            if coords is None:
                return img
            
            rect = cv2.minAreaRect(coords)
            angle = rect[-1]
            
            # Normalize angle
            if angle < -45:
                angle = -(90 + angle)
            else:
                angle = -angle
            
            # Only rotate if angle is significant
            if abs(angle) < 0.5:
                return img
            
            (h, w) = gray.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            
            rotated = cv2.warpAffine(cv_img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
            out = Image.fromarray(cv2.cvtColor(rotated, cv2.COLOR_BGR2RGB))
            logger.debug(f"Deskewed image by {angle:.2f} degrees")
            return out
        except Exception as e:
            logger.warning(f"Deskew processing failed: {e}")
            return img
    
    def _group_words_into_lines(self, words: List[OCRWord], page_h: int) -> List[List[OCRWord]]:
        """
        Group words into lines based on Y-coordinate proximity.
        Uses adaptive tolerance based on average word height.
        """
        if not words:
            return []
        
        # Adaptive line tolerance: use average word height if available, otherwise use fraction of page
        avg_word_height = sum(w.y1 - w.y0 for w in words) / len(words) if words else 0
        if avg_word_height > 0:
            # Use 0.3 * average word height as tolerance (allows for some variation)
            tol = max(2, int(avg_word_height * 0.3))
        else:
            tol = max(2, int(page_h * LINE_Y_TOL_FRAC))
        
        ws = sorted(words, key=lambda w: (w.cy, w.cx))
        
        lines: List[List[OCRWord]] = []
        cur: List[OCRWord] = [ws[0]]
        cur_y = ws[0].cy
        
        for w in ws[1:]:
            if abs(w.cy - cur_y) <= tol:
                cur.append(w)
                cur_y = cur_y * 0.9 + w.cy * 0.1  # Weighted average
            else:
                lines.append(sorted(cur, key=lambda x: x.cx))
                cur = [w]
                cur_y = w.cy
        
        lines.append(sorted(cur, key=lambda x: x.cx))
        return lines
    
    def _auto_detect_columns(self, words: List[OCRWord], page_w: int, page_h: int, cached_bands: Optional[Dict[str, Tuple[int, int]]] = None) -> Dict[str, Tuple[int, int]]:
        """
        Automatically detect column bands using X-coordinate clustering.
        
        Detects columns for:
        - brand_number (leftmost numeric column)
        - brand_name (between brand_number and pack)
        - pack (pack qty/size pattern)
        - cases (numeric, typically after pack)
        - bottles (numeric, after cases)
        - unit_rate (money value, typically case rate)
        - btl_rate (money value, typically rightmost)
        - total (money value, rightmost)
        
        Args:
            words: List of OCR words
            page_w: Page width in pixels
            page_h: Page height in pixels
            cached_bands: Optional cached bands from previous successful detection
            
        Returns:
            Dictionary mapping column names to (x_min, x_max) tuples
        """
        # Dynamically adjust header cutoff - try multiple values and pick the one with most data rows
        best_cutoff = None
        best_word_count = 0
        best_ws = None
        
        # Try different header cutoff fractions (from 0.15 to 0.30)
        for cutoff_frac in [0.15, 0.20, 0.25, 0.30]:
            cutoff_y = int(page_h * cutoff_frac)
            ws = [w for w in words if w.y0 >= cutoff_y]
            # Count potential data rows (lines with brand numbers)
            brand_count = sum(1 for w in ws if self._is_brand_number_token(w.text))
            if brand_count > best_word_count:
                best_word_count = brand_count
                best_cutoff = cutoff_y
                best_ws = ws
        
        # Use the best cutoff found, or fall back to default
        cutoff_y = best_cutoff if best_cutoff is not None else int(page_h * HEADER_CUTOFF_FRAC)
        ws = best_ws if best_ws is not None else [w for w in words if w.y0 >= cutoff_y]
        
        logger.debug(f"Using header cutoff at {cutoff_y}px ({cutoff_y/page_h*100:.1f}% of page height), found {len(ws)} words with {best_word_count} brand numbers")
        
        if not ws:
            raise RuntimeError("No words found below header cutoff")
        
        # Detect brand number column (leftmost cluster of 2-6 digit numbers)
        # Use adaptive minimum cluster size - reduce if we have fewer words
        adaptive_min_cluster = max(2, min(MIN_COL_CLUSTER_SIZE, max(2, len(ws) // 30)))
        
        # Find all potential brand numbers (2-6 digits, more lenient to catch OCR variance)
        # Filter out words that are clearly OCR artifacts (single chars, symbols, etc.)
        brand_candidates = [w for w in ws if self._is_brand_number_token(w.text)]
        brand_x = [w.cx for w in brand_candidates]
        
        # Debug: Log brand candidates found
        if brand_candidates:
            sample_brands = [f"'{w.text}'@{w.cx}" for w in brand_candidates[:10]]
            logger.warning(f"[BRAND_CANDIDATES] Found {len(brand_candidates)} candidates: {sample_brands}")
        
        # Filter brand numbers to left half of page (they should be leftmost column)
        if brand_x:
            left_half_x = [x for x in brand_x if x < page_w * 0.5]
            if len(left_half_x) >= 2:
                brand_x = left_half_x
                logger.warning(f"[BRAND_FILTER] Filtered to {len(brand_x)} left-half candidates")
        
        brand_c = self._robust_cluster_center(brand_x, min_cluster_size=adaptive_min_cluster)
        
        # If brand detection failed, try with even lower threshold but still require left-side
        if brand_c is None and len(brand_x) >= 2:
            brand_c = self._robust_cluster_center(brand_x, min_cluster_size=2)
        
        # Detect pack column (contains patterns like "12/650" or "12x650")
        # Pack should be to the right of brand_number
        pack_candidates = [w for w in ws if self._is_pack_token(w.text)]
        pack_x = [w.cx for w in pack_candidates]
        
        # Filter pack to be between brand_number and middle-right of page
        if brand_c and pack_x:
            pack_x = [x for x in pack_x if brand_c < x < page_w * 0.75]
        
        pack_c = self._robust_cluster_center(pack_x, min_cluster_size=adaptive_min_cluster)
        
        # If pack detection failed, try with lower threshold
        if pack_c is None and len(pack_x) >= 2:
            pack_c = self._robust_cluster_center(pack_x, min_cluster_size=2)
        
        # Detect money columns (all numeric values with decimals/commas OR integers)
        money_x = [w.cx for w in ws if self._is_money_token(w.text)]
        
        # If detection fails, try using cached bands if available
        if (brand_c is None or pack_c is None) and cached_bands:
            logger.info("Column detection failed, attempting to adapt cached bands to this page")
            # Normalize cached_bands keys (handle old 'rate' -> 'btl_rate' migration)
            normalized_cached = self._normalize_bands_keys(cached_bands)
            if page_w > 0 and "brand_no" in normalized_cached:
                # Scale bands proportionally if page width differs significantly
                scale_factor = 1.0
                # For now, just use cached bands as-is (assuming same page dimensions)
                return normalized_cached
        
        if brand_c is None or pack_c is None:
            logger.warning(f"Column detection failed: brand_c={brand_c}, pack_c={pack_c}, brand_x_count={len(brand_x)}, pack_x_count={len(pack_x)}")
            if cached_bands:
                logger.info("Using cached bands as fallback")
                normalized_cached = self._normalize_bands_keys(cached_bands)
                return normalized_cached
            raise RuntimeError(f"Could not detect brand_number (found: {brand_c}) or pack columns (found: {pack_c})")
        
        # Sort money columns and identify positions (matching working script logic)
        # The working script only detects btl_rate (rightmost money column), not separate unit_rate/total
        money_x_sorted = sorted(money_x)
        # btl_rate is typically the rightmost money column; use the upper quartile to avoid left rate/case columns
        right_money = money_x_sorted[int(0.75 * len(money_x_sorted)):] if len(money_x_sorted) >= MIN_COL_CLUSTER_SIZE else money_x_sorted
        rate_c = self._robust_cluster_center(right_money, min_cluster_size=max(2, adaptive_min_cluster))
        
        if brand_c is None or pack_c is None or rate_c is None:
            logger.warning(f"Column detection incomplete: brand_c={brand_c}, pack_c={pack_c}, rate_c={rate_c}")
            if cached_bands:
                logger.info("Using cached bands as fallback")
                return cached_bands
            raise RuntimeError(
                f"Auto column detection failed. brand_c={brand_c}, pack_c={pack_c}, rate_c={rate_c}. "
                "Try increasing DPI or lowering MIN_WORD_CONF."
            )
        
        # Use fixed band width (matching working script)
        def band(center: float) -> Tuple[int, int]:
            lo = max(0, int(center - BAND_HALF_WIDTH_PX))
            hi = min(page_w, int(center + BAND_HALF_WIDTH_PX))
            return (lo, hi)
        
        brand_band = band(brand_c)
        pack_band = band(pack_c)
        rate_band = band(rate_c)
        
        # Brand name likely sits between brand number and pack columns (matching working script)
        name_lo = min(brand_band[1], pack_band[0])
        name_hi = max(brand_band[1], pack_band[0])
        # widen a bit
        name_lo = max(0, name_lo - 30)
        name_hi = min(page_w, name_hi + 30)
        brand_name_band = (name_lo, name_hi)
        
        # Simplified bands - only detect the 3 core columns like the working script
        # Other fields (cases, bottles, unit_rate, total, pack_type, product_type) will be extracted from full line text
        bands_dict = {
            "brand_no": brand_band,
            "brand_name": brand_name_band,
            "pack": pack_band,
            "btl_rate": rate_band,  # Match working script naming
        }
        
        logger.warning(f"[COLUMN_DETECTION] Detected columns: brand_no={brand_band}, brand_name={brand_name_band}, pack={pack_band}, btl_rate={rate_band}")
        
        return bands_dict
    
    def _normalize_bands_keys(self, bands: Dict[str, Tuple[int, int]]) -> Dict[str, Tuple[int, int]]:
        """Normalize band keys to current format (e.g., 'rate' -> 'btl_rate' for backwards compatibility)"""
        normalized = {}
        for key, value in bands.items():
            if key == "rate":
                normalized["btl_rate"] = value
            else:
                normalized[key] = value
        return normalized
    
    def _is_brand_number_token(self, text: str) -> bool:
        """Check if token looks like a brand number (3-5 digits, matching working script)"""
        # Brand numbers in your docs are usually 3–5 digits; keep leading zeros
        # This matches the working script exactly
        digits = re.sub(r"\D", "", text)
        return bool(re.fullmatch(r"\d{3,5}", digits))
    
    def _is_pack_token(self, text: str) -> bool:
        """Check if token looks like pack qty/size (e.g., "12/650", "12x650", "12*650")"""
        # Filter out obvious OCR noise
        cleaned = (
            text.replace("ML", "")
            .replace("ml", "")
            .replace(" ", "")
            .replace("*", "x")
            .strip()
        )
        if len(cleaned) < 3:  # Pack patterns are at least 3 chars (e.g., "1/2")
            return False
        # Must contain a separator with digits on both sides
        return bool(re.search(r"\d+[/\\xX]\d+", cleaned))
    
    def _is_money_token(self, text: str) -> bool:
        """Check if token looks like a money value"""
        cleaned = text.replace(",", "").strip()
        return bool(re.fullmatch(r"\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?", cleaned) or re.fullmatch(r"\d{1,6}", cleaned))
    
    def _robust_cluster_center(self, xs: List[float], min_cluster_size: Optional[int] = None) -> Optional[float]:
        """
        Return median of x-coordinates, robust to outliers.
        
        Args:
            xs: List of x-coordinates
            min_cluster_size: Minimum number of points required (defaults to MIN_COL_CLUSTER_SIZE)
        """
        if min_cluster_size is None:
            min_cluster_size = MIN_COL_CLUSTER_SIZE
        
        if len(xs) < min_cluster_size:
            return None
        
        xs_sorted = sorted(xs)
        # Trim 10% from each end (adaptive trimming)
        trim = max(1, int(0.10 * len(xs_sorted)))
        core = xs_sorted[trim:-trim] if len(xs_sorted) > 2 * trim else xs_sorted
        
        if not core:
            return None
        
        # Use median for robustness
        return float(core[len(core) // 2])
    
    def _words_in_band(self, line: List[OCRWord], xband: Tuple[int, int]) -> List[OCRWord]:
        """Get words from a line that fall within an X-band (column)"""
        lo, hi = xband
        # Include words that overlap with the band (not just centered in it)
        return [w for w in line if not (w.x1 < lo or w.x0 > hi)]
    
    def _line_text(self, words: List[OCRWord]) -> str:
        """Convert list of words to text string"""
        return " ".join(w.text for w in sorted(words, key=lambda x: x.cx)).strip()
    
    def _parse_rows_from_words(self, words: List[OCRWord], page_w: int, page_h: int, bands: Dict[str, Tuple[int, int]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Parse line items from OCR words using column bands.
        Implements row stitching for wrapped brand names.
        """
        cutoff_y = int(page_h * HEADER_CUTOFF_FRAC)
        words2 = [w for w in words if w.y0 >= cutoff_y]
        lines = self._group_words_into_lines(words2, page_h)
        
        # Extract raw rows first (brand_no, brand_name, pack_type, pack, cases, bottles, rate, total)
        # Note: We extract from column bands, matching the working script approach
        # cases and bottles are now integers (extracted from patterns), not strings
        raw_rows: List[Tuple[str, str, str, str, int, int, str, str]] = []
        
        # Debug: Log column band positions
        # Support both 'rate' and 'btl_rate' keys for logging
        rate_key = "btl_rate" if "btl_rate" in bands else "rate"
        logger.warning(f"[ROW_EXTRACTION] Extracting rows using column bands: brand_no={bands['brand_no']}, pack={bands['pack']}, btl_rate={bands[rate_key]}")
        
        for line_idx, line_words in enumerate(lines):
            # Skip lines with no words
            if not line_words:
                continue
            
            # Extract cells using column bands (matching working script - center point check)
            # Only extract the 3 core columns; other fields will be extracted from full line text
            # Handle both old 'rate' key (for backwards compatibility) and new 'btl_rate' key
            brand_no_words = self._words_in_band(line_words, bands["brand_no"])
            brand_name_words = self._words_in_band(line_words, bands["brand_name"])
            pack_words = self._words_in_band(line_words, bands["pack"])
            # Support both 'rate' and 'btl_rate' keys for backwards compatibility
            rate_key = "btl_rate" if "btl_rate" in bands else "rate"
            btl_rate_words = self._words_in_band(line_words, bands[rate_key])
            
            # Get full line text for extracting other fields (cases, bottles, unit_rate, total, pack_type, product_type)
            full_line_text = self._line_text(line_words)
            
            # Debug: Log actual words in brand_no column for first few rows
            if line_idx < 3 and brand_no_words:
                word_details = [f"'{w.text}'@{w.cx}" for w in brand_no_words]
                logger.warning(f"[WORDS_ROW_{line_idx}] brand_no words: {word_details}")
            
            # Convert to text - preserve order by x-coordinate (matching working script)
            brand_no_text = self._line_text(brand_no_words)
            brand_name_text = self._line_text(brand_name_words)
            pack_text = self._line_text(pack_words).replace("ML", "").replace("ml", "").strip()  # Match working script
            btl_rate_text = self._line_text(btl_rate_words)
            
            # Extract other fields from full line text using patterns
            # Pack type: single uppercase letter (G, C, P) - typically between product type and pack
            # Look for single letter that's not part of a word
            pack_type_text = ""
            pack_type_match = re.search(r'(?<!\w)([A-Z])(?!\w)', full_line_text)
            if pack_type_match:
                pack_type_text = pack_type_match.group(1)
            
            # Cases and bottles: extract from full line text
            # In ICDC format: "Qty(Cases. Delivered)" and "Qty(Bottles. Delivered)" columns
            # These are typically integers after the pack column
            cases_delivered = 0
            bottles_delivered = 0
            
            # Strategy 1: Look for pattern like "61 / 0" or "10, 0" (cases / bottles)
            # But be careful not to match money patterns like "125.08" (which has a decimal point)
            # Quantities are typically integers separated by "/" or ","
            # First, check if there's a decimal point nearby - if so, it's likely money, not quantities
            qty_pattern = None
            # Look for integer patterns with "/" separator (cases/bottles format)
            qty_slash_match = re.search(r'\b(\d{1,3})\s*/\s*(\d{1,3})\b', full_line_text)
            if qty_slash_match:
                # Check that this isn't part of a money pattern or pack pattern
                match_start = qty_slash_match.start()
                match_end = qty_slash_match.end()
                # Get surrounding context (20 chars before and after)
                context_start = max(0, match_start - 20)
                context_end = min(len(full_line_text), match_end + 20)
                context = full_line_text[context_start:context_end]
                # If there's a decimal point nearby, it's probably money, skip it
                if '.' not in context.replace(' ml', '').replace(' ML', ''):
                    qty_pattern = qty_slash_match
            
            if qty_pattern:
                try:
                    qty1 = int(qty_pattern.group(1))
                    qty2 = int(qty_pattern.group(2))
                    # Quantities should be reasonable (0-500 for cases, 0-100 for bottles typically)
                    if 0 <= qty1 <= 500 and 0 <= qty2 <= 100:
                        cases_delivered = qty1
                        bottles_delivered = qty2
                except (ValueError, IndexError):
                    pass
            
            # Strategy 2: If pattern not found, quantities remain 0
            # We don't try to guess quantities from standalone numbers to avoid misalignment issues
            
            # Extract rates from btl_rate column and full line text
            # The rate column may contain "unit_rate / btl_rate" or just "btl_rate"
            rate_text = btl_rate_text
            # Also look for money patterns in the full line for unit_rate and total
            # Money patterns: "1,501.00" or "125.08" format
            money_patterns = re.findall(r'\d{1,3}(?:,\d{3})*(?:\.\d{2})', full_line_text)
            total_text = ""
            if money_patterns:
                # Last money value is typically total
                total_text = money_patterns[-1] if len(money_patterns) > 0 else ""
            
            # If column extraction failed (likely misalignment), try extracting from entire line
            # This is a fallback for severe column misalignment
            if not brand_no_text and not brand_name_text and not pack_text:
                # Try to locate brand number and pack anywhere in the line
                any_bn_match = re.search(r"\b(\d{2,6})\b", full_line_text)
                any_pack_match = re.search(r"(\d+)[/\\xX](\d+)", full_line_text.replace(" ", ""))
                if any_bn_match:
                    brand_no_text = any_bn_match.group(1)
                if any_pack_match:
                    pack_text = any_pack_match.group(0)
                # Use remaining text as brand name
                if full_line_text and full_line_text != pack_text and full_line_text != brand_no_text:
                    brand_name_text = full_line_text
            
            # Skip completely empty rows (matching working script logic)
            if not (brand_no_text or brand_name_text or pack_text or btl_rate_text):
                continue
            
            # Filter out footer/summary rows (rows with patterns like "Cases/Bus", "198x19=", "Total", etc.)
            full_line_upper = full_line_text.upper()
            footer_patterns = [
                r'CASES/BUS', r'CASES/BILLS', r'TOTAL\s*\(CASES', r'INVOICE\s*VALUE',
                r'BREAKAGE', r'SHORTAGE', r'REVERTED', r'AMOUNT\s*IN\s*WORDS',
                r'PREVIOUS\s*CREDIT', r'SUB\s*TOTAL', r'CREDIT\s*BALANCE',
                r'\d+x\d+\s*=', r'^\d+\s*/\s*\d+\s*$',  # Patterns like "198x19=" or "121/0"
            ]
            if any(re.search(pattern, full_line_upper) for pattern in footer_patterns):
                logger.debug(f"Skipping footer row: {full_line_text[:60]}")
                continue
            
            # Debug: Log first few raw rows to see what we're extracting
            if line_idx < 5:
                logger.warning(f"[RAW_ROW_{line_idx}] bn='{brand_no_text}', name='{brand_name_text[:40] if brand_name_text else ''}', pack_type='{pack_type_text}', pack='{pack_text}', cases={cases_delivered}, bottles={bottles_delivered}, rate='{rate_text}', total='{total_text}'")
            
            raw_rows.append((brand_no_text, brand_name_text, pack_type_text, pack_text, cases_delivered, bottles_delivered, rate_text, total_text))
        
        logger.debug(f"Extracted {len(raw_rows)} raw rows from {len(lines)} lines using column bands")
        
        # Stitch wrapped brand names (similar to working script)
        stitched: List[Tuple[str, str, str, str, int, int, str, str]] = []
        i = 0
        while i < len(raw_rows):
            bn, nm, pt, pk, cs, bt, rt, tot = raw_rows[i]
            bn_digits = re.sub(r"\D", "", bn)
            has_bn = bool(bn_digits)
            
            # If we have a brand number but name is short, check if next line continues it
            if has_bn and (not nm or len(nm.strip()) < 4):
                if i + 1 < len(raw_rows):
                    bn2, nm2, pt2, pk2, cs2, bt2, rt2, tot2 = raw_rows[i + 1]
                    bn2_digits = re.sub(r"\D", "", bn2)
                    # Next line continues name if it has no brand_no but has some name text
                    if not bn2_digits and nm2 and nm2.strip():
                        nm = (nm + " " + nm2).strip()
                        # Prefer values that exist
                        pt = pt if pt else pt2
                        pk = pk if pk else pk2
                        cs = cs if cs else cs2
                        bt = bt if bt else bt2
                        rt = rt if rt else rt2
                        tot = tot if tot else tot2
                        i += 1
            
            if bn or nm or pk:  # Only add if we have some data
                stitched.append((bn, nm, pt, pk, cs, bt, rt, tot))
            i += 1
        
        logger.debug(f"After stitching: {len(stitched)} rows (from {len(raw_rows)} raw rows)")
        
        # Debug: Log first few stitched rows to see what we extracted
        if stitched and len(stitched) > 0:
            logger.debug(f"Sample stitched rows (first 3):")
            for i, (bn, nm, pt, pk, cs, bt, rt, tot) in enumerate(stitched[:3]):
                logger.debug(f"  Row {i}: bn='{bn}', name='{nm[:40]}', pack_type='{pt}', pack='{pk}', cases='{cs}', bottles='{bt}', rate='{rt}', total='{tot}'")
        
        # Convert stitched rows to validated items
        items = []
        skipped_count = 0
        skipped_reasons = {}
        sample_rejected_rows = []  # Store first few rejected rows for debugging
        
        for row_idx, (bn, nm, pt, pk, cs, bt, rt, tot) in enumerate(stitched):
            # Reconstruct full line text for this row (for debugging and fallback extraction)
            # This is approximate since we've already stitched, but useful for validation
            full_row_text = f"{bn} {nm} {pk} {rt} {tot}".strip()
            # Try multiple strategies to find brand number due to potential column misalignment
            bn_digits = re.sub(r"\D", "", bn)
            
            # Strategy 1: If brand_number column is empty/too short, check if first part of brand_name is actually the brand number
            if not bn_digits or len(bn_digits) < 2:
                # Look for leading digits in brand_name (common OCR misalignment)
                # Accept 2-5 digits (matching our validation)
                nm_leading_digits = re.match(r'^(\d{2,5})', nm.strip())
                if nm_leading_digits:
                    bn_digits = nm_leading_digits.group(1)
                    logger.debug(f"Row {row_idx}: Found brand number at start of name column: {bn_digits}")
            
            # Strategy 2: Check if pack column has the brand number (severe misalignment)
            if not bn_digits or len(bn_digits) < 2:
                pk_digits = re.sub(r"\D", "", pk.split('/')[0] if '/' in pk else pk)
                # Brand numbers are 2-6 digits, but exclude pack qty like "12" or "24" (unless it's 3+ digits)
                if re.fullmatch(r"\d{2,6}", pk_digits):
                    # If 2 digits, must be > 24 (to exclude pack quantities)
                    # If 3+ digits, accept it
                    if len(pk_digits) >= 3 or (pk_digits and int(pk_digits) > 24):
                        bn_digits = pk_digits
                        logger.debug(f"Row {row_idx}: Found brand number in pack column: {bn_digits}")
            
            # Validate brand number (must be 2-6 digits, allowing some flexibility)
            # Some brand numbers can be 2 digits (like "18", "78"), but typically 3-5 digits
            # We'll accept 2-6 digits to handle edge cases, but log warnings for unusual lengths
            if not bn_digits or not re.fullmatch(r"\d{2,6}", bn_digits):
                # Reject if too short (< 2) or too long (> 6)
                skipped_count += 1
                skipped_reasons["no_brand_number"] = skipped_reasons.get("no_brand_number", 0) + 1
                if len(sample_rejected_rows) < 3:
                    sample_rejected_rows.append({
                        "row": row_idx,
                        "reason": "no_brand_number",
                        "bn": bn,
                        "bn_digits": bn_digits,
                        "nm": nm[:50],
                        "pk": pk,
                    })
                continue
            
            # Log warning for unusual brand number lengths but still accept them
            if len(bn_digits) == 2:
                logger.debug(f"Row {row_idx}: Brand number '{bn_digits}' has only 2 digits (unusual but accepted)")
            elif len(bn_digits) > 5:
                logger.debug(f"Row {row_idx}: Brand number '{bn_digits}' has {len(bn_digits)} digits (unusual but accepted)")
                skipped_count += 1
                skipped_reasons["no_brand_number"] = skipped_reasons.get("no_brand_number", 0) + 1
                if len(sample_rejected_rows) < 3:
                    sample_rejected_rows.append({
                        "row": row_idx,
                        "reason": "no_brand_number",
                        "bn": bn,
                        "bn_digits": bn_digits,
                        "nm": nm[:50],
                        "pk": pk,
                    })
                continue
            
            # Parse pack qty/size - be more flexible with pattern matching
            # Handle formats like "G 24/375", "24/375", "24x375", etc.
            # First, remove common prefixes (like single letters: G, C, P) that might be pack type
            pack_cleaned = re.sub(r'^[A-Z]\s*', '', pk)  # Remove leading single letter (pack type)
            pack_cleaned = (
                pack_cleaned.replace(" ", "")
                .replace("ML", "")
                .replace("ml", "")
                .replace("Ml", "")
                .replace("*", "x")
            )
            pack_match = re.search(r"(\d+)[/\\xX](\d+)", pack_cleaned)  # Allow /, \, x, *
            if not pack_match:
                skipped_count += 1
                skipped_reasons["no_pack_pattern"] = skipped_reasons.get("no_pack_pattern", 0) + 1
                if len(sample_rejected_rows) < 3:
                    sample_rejected_rows.append({
                        "row": row_idx,
                        "reason": "no_pack_pattern",
                        "bn": bn_digits,
                        "pk": pk,
                        "pk_cleaned": pack_cleaned,
                    })
                continue
            
            pack_qty = int(pack_match.group(1))
            size_ml = int(pack_match.group(2))
            
            # Quantities are already extracted as integers from raw_rows
            # cs and bt are now integers, not strings
            
            # Parse rates (unit_rate / btl_rate) - matching working script approach
            # The rate column typically has format "unit_rate / btl_rate" or just "btl_rate"
            # Look for money patterns in the rate text
            rate_cleaned = rt.replace(" ", "").replace(",", "")
            # Try to find money patterns (with decimals and commas)
            money_patterns = re.findall(r'\d{1,3}(?:,\d{3})*(?:\.\d{2})', rt)
            if len(money_patterns) >= 2:
                # Two or more money values - use last two (unit_rate / btl_rate)
                unit_rate = self._parse_money(money_patterns[-2])
                btl_rate = self._parse_money(money_patterns[-1])
            elif len(money_patterns) == 1:
                # Only one money value - assume it's btl_rate, calculate unit_rate
                btl_rate = self._parse_money(money_patterns[0])
                unit_rate = btl_rate * Decimal(str(pack_qty))
            else:
                # Try to find any numeric patterns as fallback
                rate_numbers = re.findall(r'\d+\.?\d*', rate_cleaned)
                if len(rate_numbers) >= 2:
                    unit_rate = self._parse_money(rate_numbers[-2])
                    btl_rate = self._parse_money(rate_numbers[-1])
                elif len(rate_numbers) == 1:
                    btl_rate = self._parse_money(rate_numbers[0])
                    unit_rate = btl_rate * Decimal(str(pack_qty))
                else:
                    skipped_count += 1
                    skipped_reasons["no_rate"] = skipped_reasons.get("no_rate", 0) + 1
                    if len(sample_rejected_rows) < 3:
                        sample_rejected_rows.append({
                            "row": row_idx,
                            "reason": "no_rate",
                            "bn": bn_digits,
                            "rt": rt,
                            "rt_cleaned": rate_cleaned,
                        })
                    continue  # Can't parse rates, skip this row
            
            total = self._parse_money(tot) if tot else Decimal("0")
            
            # Clean brand name - be more lenient (allow shorter names)
            brand_name = re.sub(r'\s+', ' ', nm.strip())
            if len(brand_name) < 2:  # Reduced from 3 to 2
                skipped_count += 1
                skipped_reasons["short_brand_name"] = skipped_reasons.get("short_brand_name", 0) + 1
                if len(sample_rejected_rows) < 3:
                    sample_rejected_rows.append({
                        "row": row_idx,
                        "reason": "short_brand_name",
                        "bn": bn_digits,
                        "nm": nm,
                        "nm_len": len(brand_name),
                    })
                continue
            
            # Detect product type from brand name (look for "BEER", "IML", etc.)
            product_type = ""
            brand_upper = brand_name.upper()
            if "BEER" in brand_upper:
                product_type = "Beer"
            elif any(x in brand_upper for x in ["WHISKY", "BRANDY", "VODKA", "RUM", "GIN"]):
                product_type = "IML"
            
            calculated_total = self._calculate_line_total(unit_rate, cases_delivered, btl_rate, bottles_delivered)
            has_discrepancy = abs(total - calculated_total) > Decimal("1.00")  # 1 rupee tolerance
            
            items.append({
                "line_number": len(items) + 1,
                "brand_number": bn_digits,  # Preserve leading zeros as string
                "brand_name": brand_name,
                "product_type": product_type,
                "pack_type": pt.strip() if pt else "",  # Pack type (G, C, P, etc.)
                "pack_qty": pack_qty,
                "size_ml": size_ml,
                "cases_delivered": cases_delivered,
                "bottles_delivered": bottles_delivered,
                "unit_rate": str(unit_rate),
                "btl_rate": str(btl_rate),
                "total": str(total),
                "calculated_total": str(calculated_total),
                "has_discrepancy": has_discrepancy,
                "discrepancy_reason": f"Total mismatch: PDF={total}, Calculated={calculated_total}" if has_discrepancy else "",
                "raw_data": {},
            })
        
        if skipped_count > 0:
            logger.warning(f"Skipped {skipped_count} rows out of {len(stitched)}: {skipped_reasons}")
            if sample_rejected_rows:
                logger.info(f"Sample rejected rows: {sample_rejected_rows[:3]}")
        if len(stitched) > 0 and len(items) == 0:
            logger.error(f"Parsed {len(stitched)} stitched rows but extracted 0 valid items. Skipped reasons: {skipped_reasons}. Sample rejected: {sample_rejected_rows[:3]}")
        
        return items, sample_rejected_rows
    
    def _parse_money(self, text: str) -> Decimal:
        """Parse money value from text, handling commas and spaces"""
        cleaned = re.sub(r'[,\s₹$]', '', text.strip())
        try:
            return Decimal(cleaned)
        except (InvalidOperation, ValueError):
            return Decimal("0")
    
    def _calculate_line_total(self, unit_rate: Decimal, cases: int, btl_rate: Decimal, bottles: int) -> Decimal:
        """Calculate line total: (unit_rate * cases) + (btl_rate * bottles)"""
        case_total = unit_rate * Decimal(str(cases))
        bottle_total = btl_rate * Decimal(str(bottles))
        return case_total + bottle_total
    
    def _parse_header_from_words(self, words: List[OCRWord], page_w: int, page_h: int) -> Dict[str, Any]:
        """Parse header information from OCR words (first page only)"""
        header = {}
        
        # Group words into lines for header parsing
        header_cutoff = int(page_h * HEADER_CUTOFF_FRAC)
        header_words = [w for w in words if w.y0 < header_cutoff]
        lines = self._group_words_into_lines(header_words, page_h)
        
        full_text = "\n".join(self._line_text(line) for line in lines)
        lines_list = full_text.split('\n')
        
        # Extract ICDC number
        icdc_match = re.search(r'ICDC\s*(\d+)', full_text, re.IGNORECASE)
        if icdc_match:
            header["icdc_number"] = f"ICDC{icdc_match.group(1)}"
        
        # Extract date (with OCR error handling)
        date_patterns = [
            r'(\d{2})[-/](\w{3,4})[-/](\d{4})',  # DD-MMM-YYYY
            r'(\d{2})[-/](\d{2})[-/](\d{4})',     # DD-MM-YYYY
        ]
        for line in lines_list:
            for pattern in date_patterns:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    try:
                        if len(match.group(2)) == 3 or len(match.group(2)) == 4:  # Month abbreviation
                            date_str = f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
                            header["invoice_date"] = self._parse_date_ocr(date_str)
                            break
                        else:  # Numeric
                            date_str = f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
                            header["invoice_date"] = self._parse_date_numeric(date_str)
                            break
                    except Exception:
                        continue
            if "invoice_date" in header:
                break
        
        return header
    
    def _parse_date_ocr(self, date_str: str) -> str:
        """Parse date with OCR error handling (e.g., "Deo" -> "Dec")"""
        ocr_fixes = {"Deo": "Dec", "Oeo": "Oct", "Fab": "Feb", "Fob": "Feb"}
        month_part = date_str.split("-")[1] if "-" in date_str else ""
        if month_part in ocr_fixes:
            date_str = date_str.replace(month_part, ocr_fixes[month_part])
        
        try:
            dt = datetime.strptime(date_str, "%d-%b-%Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            try:
                dt = datetime.strptime(date_str, "%d-%B-%Y")
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                logger.warning(f"Could not parse date: {date_str}, using current date")
                return datetime.now().strftime("%Y-%m-%d")
    
    def _parse_date_numeric(self, date_str: str) -> str:
        """Parse numeric date DD-MM-YYYY"""
        try:
            dt = datetime.strptime(date_str, "%d-%m-%Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            logger.warning(f"Could not parse numeric date: {date_str}")
            return datetime.now().strftime("%Y-%m-%d")
    
    def _parse_totals_from_words(self, words: List[OCRWord], page_w: int, page_h: int) -> Dict[str, Any]:
        """Parse totals section from OCR words (last page only)"""
        totals_region_y = int(page_h * 0.70)
        region_words = [w for w in words if w.y0 >= totals_region_y]
        money_tokens = [(w, self._parse_money(w.text)) for w in region_words if self._is_money_token(w.text)]
        if not money_tokens:
            return {}
        
        # Pick the largest amount as grand total, second largest as subtotal if available
        money_tokens.sort(key=lambda t: t[1], reverse=True)
        totals: Dict[str, Any] = {
            "grand_total": str(money_tokens[0][1])
        }
        if len(money_tokens) > 1:
            totals["subtotal"] = str(money_tokens[1][1])
        return totals
    
    def _parse_header_text(self, lines: List[str]) -> Dict[str, Any]:
        """Parse header from text lines (fallback for text-based PDFs)"""
        header = {}
        full_text = "\n".join(lines)
        
        icdc_match = re.search(r'ICDC\s*(\d+)', full_text, re.IGNORECASE)
        if icdc_match:
            header["icdc_number"] = f"ICDC{icdc_match.group(1)}"
        
        return header
    
    def _parse_line_items_text(self, lines: List[str]) -> List[Dict[str, Any]]:
        """Parse line items from text lines (fallback for text-based PDFs)"""
        # This is a simplified version - full implementation would be more complex
        return []
    
    def _parse_totals_text(self, lines: List[str]) -> Dict[str, Any]:
        """Parse totals from text lines (fallback for text-based PDFs)"""
        return {}
    
    def _debug_dump_page(self, img, words: List[OCRWord], bands: Dict[str, Tuple[int, int]], 
                         pageno: int, debug_dir: str, items: List[Dict[str, Any]]) -> None:
        """Dump debug artifacts (image with overlays, extracted rows CSV)"""
        import os
        try:
            import cv2
            import numpy as np
            import csv
        except ImportError:
            logger.warning("Debug dump requires cv2 and csv - skipping")
            return
        
        os.makedirs(debug_dir, exist_ok=True)
        
        # Draw overlays
        cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        h, w = cv_img.shape[:2]
        
        # Draw column bands
        for key, (x0, x1) in bands.items():
            cv2.rectangle(cv_img, (x0, 0), (x1, h), (0, 255, 255), 2)
            cv2.putText(cv_img, key, (x0 + 5, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        
        # Draw word boxes
        for word in words:
            cv2.rectangle(cv_img, (word.x0, word.y0), (word.x1, word.y1), (0, 255, 0), 1)
        
        overlay_path = os.path.join(debug_dir, f"page_{pageno:02d}_overlay.png")
        cv2.imwrite(overlay_path, cv_img)
        
        # Save extracted items as CSV
        if items:
            csv_path = os.path.join(debug_dir, f"page_{pageno:02d}_items.csv")
            with open(csv_path, 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=items[0].keys())
                writer.writeheader()
                writer.writerows(items)
