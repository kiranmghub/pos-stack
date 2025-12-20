# domain_extensions/telangana_liquor/parser_doctr.py
"""
ICDC PDF Parser using docTR (Document Text Recognition) library.

Uses Mindee's docTR library for high-accuracy OCR with deep learning models.
This provides better accuracy than pytesseract for scanned documents.

Based on: https://github.com/mindee/doctr
"""

import os
import re
from typing import Dict, List, Optional, Tuple, Any
from decimal import Decimal, InvalidOperation
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

PARSER_VERSION = "3.0.0"  # Major version bump for docTR integration


class ParsingError(Exception):
    """Custom exception for parsing errors"""
    pass


class OCRWord:
    """Represents a single word from OCR with its position and confidence"""
    def __init__(self, text: str, conf: float, x0: float, y0: float, x1: float, y1: float):
        self.text = text
        self.conf = int(conf * 100) if conf <= 1.0 else int(conf)  # Normalize to 0-100
        self.x0 = int(x0)
        self.y0 = int(y0)
        self.x1 = int(x1)
        self.y1 = int(y1)
    
    @property
    def cx(self) -> float:
        """Center X coordinate"""
        return (self.x0 + self.x1) / 2
    
    @property
    def cy(self) -> float:
        """Center Y coordinate"""
        return (self.y0 + self.y1) / 2


class ICDCParserDoctr:
    """
    ICDC PDF Parser using docTR library.
    
    Uses deep learning-based OCR for better accuracy on scanned documents.
    """
    
    def __init__(self):
        self.version = PARSER_VERSION
        self._model = None
    
    def _get_model(self):
        """Lazy load docTR model"""
        if self._model is None:
            try:
                # Check if PyTorch and torchvision are available (docTR requires both)
                try:
                    import torch
                    import torchvision
                    logger.info("PyTorch and torchvision are available for docTR")
                except ImportError as e:
                    missing = "torchvision" if "torchvision" in str(e) else "torch"
                    raise ParsingError(
                        f"{missing.capitalize()} is required for docTR. Install with: pip install torch torchvision python-doctr"
                    )
                
                from doctr.io import DocumentFile
                from doctr.models import ocr_predictor
                
                # Use fast and accurate models
                # db_resnet50 for detection, crnn_vgg16_bn for recognition
                self._model = ocr_predictor(
                    det_arch='db_resnet50',
                    reco_arch='crnn_vgg16_bn',
                    pretrained=True
                )
                logger.info("Loaded docTR OCR model")
            except ImportError as e:
                raise ParsingError(
                    "docTR library not installed. Install with: pip install python-doctr torch"
                ) from e
            except Exception as e:
                error_msg = str(e)
                if "TensorFlow" in error_msg or "PyTorch" in error_msg or "USE_TF" in error_msg or "USE_TORCH" in error_msg:
                    raise ParsingError(
                        "docTR requires PyTorch or TensorFlow. Install with: pip install torch python-doctr"
                    ) from e
                raise ParsingError(f"Failed to load docTR model: {e}") from e
        
        return self._model
    
    def parse(self, pdf_file_path: str, debug_dump: Optional[str] = None) -> Dict[str, Any]:
        """
        Parse an ICDC PDF file using docTR OCR.
        
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
                logger.info(f"Text-based parsing failed: {e}, falling back to docTR OCR")
                warnings.append(f"Text extraction failed: {str(e)}")
                # Fall back to docTR OCR
                result = self._parse_doctr_ocr(pdf_file_path, debug_dump=debug_dump)
                parsing_method = "doctr_ocr"
                result_meta = result.get("metadata", {}) or {}
                confidence = result_meta.get("confidence", 0.5)
                warnings.extend(result_meta.get("warnings", []))
        except Exception as e:
            logger.error(f"PDF parsing failed: {e}", exc_info=True)
            errors.append(str(e))
            parsing_method = "failed"
            result = {
                "header": {},
                "lines": [],
                "totals": {},
            }
        
        return {
            **result,
            "metadata": {
                "parser_version": self.version,
                "parsing_method": parsing_method,
                "confidence": confidence,
                "errors": errors,
                "warnings": warnings,
            }
        }
    
    def _parse_text_based(self, pdf_file_path: str) -> Dict[str, Any]:
        """Parse text-based PDF using pdfplumber"""
        import pdfplumber
        
        header = {}
        invoice_lines = []
        totals = {}
        
        with pdfplumber.open(pdf_file_path) as pdf:
            all_text = ""
            for page in pdf.pages:
                all_text += page.extract_text() or ""
        
        if not all_text or len(all_text.strip()) < 100:
            raise ParsingError("Text extraction yielded no line items; fallback to OCR")
        
        lines_list = all_text.split('\n')
        
        # Parse header
        header = self._parse_header_text(lines_list)
        
        # Parse line items
        invoice_lines = self._parse_lines_text(lines_list)
        
        # Parse totals
        totals = self._parse_totals_text(lines_list)
        
        if not invoice_lines:
            raise ParsingError("Text extraction yielded no line items; fallback to OCR")
        
        return {
            "header": header,
            "lines": invoice_lines,
            "totals": totals,
        }
    
    def _parse_doctr_ocr(self, pdf_file_path: str, debug_dump: Optional[str] = None) -> Dict[str, Any]:
        """
        Parse PDF using docTR OCR.
        
        docTR provides words with bounding boxes, which we use to reconstruct tables.
        """
        # Check PyTorch and torchvision availability first
        try:
            import torch
            import torchvision
        except ImportError as e:
            missing = "torchvision" if "torchvision" in str(e) else "torch"
            raise ParsingError(
                f"{missing.capitalize()} is required for docTR OCR. Install with: pip install torch torchvision python-doctr. "
                "The system will fall back to geometry-based OCR if PyTorch/torchvision are not available."
            )
        
        from doctr.io import DocumentFile
        
        model = self._get_model()
        
        # Load PDF and get page dimensions first
        try:
            doc = DocumentFile.from_pdf(pdf_file_path)
        except Exception as e:
            raise ParsingError(f"Failed to load PDF: {e}") from e
        
        if not doc:
            raise ParsingError("PDF file is empty or invalid")
        
        # Get actual page dimensions from PDF using pdfplumber
        # docTR uses normalized coordinates, so we need real page dimensions
        import pdfplumber
        page_dimensions = []
        with pdfplumber.open(pdf_file_path) as pdf:
            for page in pdf.pages:
                # Get page dimensions in points (1 point = 1/72 inch)
                # Convert to pixels at 300 DPI: pixels = points * (300/72)
                width_pt = page.width
                height_pt = page.height
                width_px = int(width_pt * (300 / 72))  # 300 DPI
                height_px = int(height_pt * (300 / 72))
                page_dimensions.append((width_px, height_px))
                logger.info(f"Page {len(page_dimensions)} dimensions: {width_px}x{height_px} pixels (from {width_pt:.1f}x{height_pt:.1f} points)")
        
        # Run OCR
        try:
            result = model(doc)
        except Exception as e:
            raise ParsingError(f"docTR OCR failed: {e}") from e
        
        # Extract words from docTR results
        all_words: List[OCRWord] = []
        page_confidences = []
        header = {}
        all_items = []
        totals = {}
        cached_bands = None
        warnings_local: List[str] = []
        rejected_rows_samples: List[Dict[str, Any]] = []
        
        # docTR result structure: result.pages is a list of Document objects
        # Each page has: .pages attribute (list of pages) or direct access
        # Check the actual structure
        if not hasattr(result, 'pages'):
            # Try alternative access patterns
            if hasattr(result, 'export') and callable(result.export):
                # Try exporting to see structure
                try:
                    exported = result.export()
                    logger.warning(f"[DEBUG] Exported result type: {type(exported)}")
                    if isinstance(exported, dict) and 'pages' in exported:
                        result_pages = exported['pages']
                    else:
                        raise ParsingError(f"docTR result does not have 'pages' attribute. Result type: {type(result)}, exported: {type(exported)}")
                except Exception as e:
                    logger.warning(f"[DEBUG] Failed to export result: {e}")
                    raise ParsingError(f"docTR result does not have 'pages' attribute. Result type: {type(result)}") from e
            else:
                raise ParsingError(f"docTR result does not have 'pages' attribute. Result type: {type(result)}")
        else:
            result_pages = result.pages
        
        num_pages = len(result_pages)
        logger.info(f"Processing {num_pages} page(s) from PDF using docTR")
        logger.warning(f"[DEBUG] Result type: {type(result)}, Pages type: {type(result_pages)}, num_pages: {num_pages}")
        
        for pageno, page_result in enumerate(result_pages, start=1):
            logger.info(f"Processing page {pageno}/{num_pages}")
            
            # Get actual page dimensions for this page
            if pageno <= len(page_dimensions):
                page_w, page_h = page_dimensions[pageno - 1]
            else:
                # Fallback if dimensions not available
                page_w, page_h = 2480, 3508  # A4 at 300 DPI
                logger.warning(f"Page {pageno}: Using fallback dimensions {page_w}x{page_h}")
            
            page_words: List[OCRWord] = []
            page_conf_sum = 0.0
            page_conf_count = 0
            
            # Extract words from docTR page result
            # docTR structure: page -> blocks -> lines -> words
            # Each word has: value (text), geometry (4 points), confidence
            
            # First pass: collect all words to determine page dimensions
            temp_words = []
            
            # Debug: Check page_result structure
            logger.warning(f"[DEBUG] Page {pageno} result type: {type(page_result)}")
            logger.warning(f"[DEBUG] Page {pageno} has 'blocks': {hasattr(page_result, 'blocks')}")
            attrs = [x for x in dir(page_result) if not x.startswith('_')]
            logger.warning(f"[DEBUG] Page {pageno} attributes: {attrs[:15]}")
            
            # Try different ways to access blocks
            blocks = None
            if hasattr(page_result, 'blocks'):
                blocks = page_result.blocks
                logger.warning(f"[DEBUG] Page {pageno}: Found blocks via .blocks attribute: {len(blocks) if blocks else 0}")
            elif hasattr(page_result, 'pages') and len(page_result.pages) > 0:
                # Sometimes the structure is nested
                blocks = page_result.pages[0].blocks if hasattr(page_result.pages[0], 'blocks') else []
                logger.warning(f"[DEBUG] Page {pageno}: Found blocks via nested .pages[0].blocks")
            elif isinstance(page_result, dict) and 'blocks' in page_result:
                blocks = page_result['blocks']
                logger.warning(f"[DEBUG] Page {pageno}: Found blocks via dict['blocks']")
            elif hasattr(page_result, 'export'):
                # Try exporting to dict
                try:
                    exported = page_result.export()
                    logger.warning(f"[DEBUG] Page {pageno}: Exported to {type(exported)}")
                    if isinstance(exported, dict):
                        if 'blocks' in exported:
                            blocks = exported['blocks']
                        elif 'pages' in exported and len(exported['pages']) > 0:
                            first_page = exported['pages'][0]
                            if isinstance(first_page, dict) and 'blocks' in first_page:
                                blocks = first_page['blocks']
                except Exception as e:
                    logger.warning(f"[DEBUG] Page {pageno}: Export failed: {e}")
            else:
                # Try to access directly as a list
                blocks = page_result if isinstance(page_result, (list, tuple)) else []
                logger.warning(f"[DEBUG] Page {pageno}: Tried direct list access")
            
            if not blocks:
                logger.warning(f"Page {pageno}: No blocks found. Page result type: {type(page_result)}")
                # Try to inspect the structure more
                if hasattr(page_result, '__dict__'):
                    logger.warning(f"[DEBUG] Page {pageno} __dict__ keys: {list(page_result.__dict__.keys())[:10]}")
                # Try to call export if available
                if hasattr(page_result, 'export'):
                    try:
                        exported = page_result.export()
                        logger.warning(f"[DEBUG] Page {pageno} exported structure: {type(exported)}")
                        if isinstance(exported, dict):
                            logger.warning(f"[DEBUG] Page {pageno} exported keys: {list(exported.keys())[:10]}")
                    except Exception as e:
                        logger.warning(f"[DEBUG] Page {pageno} export error: {e}")
                continue
            
            logger.warning(f"[DEBUG] Page {pageno}: Found {len(blocks)} blocks")
            
            for block_idx, block in enumerate(blocks):
                logger.warning(f"[DEBUG] Page {pageno} Block {block_idx} type: {type(block)}")
                logger.warning(f"[DEBUG] Page {pageno} Block {block_idx} attributes: {[x for x in dir(block) if not x.startswith('_')][:15]}")
                
                # Try different ways to access lines
                lines = None
                if hasattr(block, 'lines'):
                    lines = block.lines
                    logger.warning(f"[DEBUG] Page {pageno} Block {block_idx}: Found {len(lines) if lines else 0} lines via .lines")
                elif isinstance(block, dict) and 'lines' in block:
                    lines = block['lines']
                    logger.warning(f"[DEBUG] Page {pageno} Block {block_idx}: Found lines via dict['lines']")
                elif hasattr(block, 'words'):
                    # Sometimes blocks directly contain words
                    lines = [block]  # Treat as single line
                    logger.warning(f"[DEBUG] Page {pageno} Block {block_idx}: Block has .words, treating as line")
                else:
                    logger.warning(f"[DEBUG] Page {pageno} Block {block_idx}: No lines/words found, skipping")
                    continue
                
                if not lines:
                    logger.warning(f"[DEBUG] Page {pageno} Block {block_idx}: lines is empty/None")
                    continue
                
                for line_idx, line in enumerate(lines):
                    logger.warning(f"[DEBUG] Page {pageno} Block {block_idx} Line {line_idx} type: {type(line)}")
                    
                    # Try different ways to access words
                    words = None
                    if hasattr(line, 'words'):
                        words = line.words
                        logger.warning(f"[DEBUG] Page {pageno} Block {block_idx} Line {line_idx}: Found {len(words) if words else 0} words via .words")
                    elif isinstance(line, dict) and 'words' in line:
                        words = line['words']
                        logger.warning(f"[DEBUG] Page {pageno} Block {block_idx} Line {line_idx}: Found words via dict['words']")
                    elif hasattr(line, 'value') or hasattr(line, 'text'):
                        # Line might be a word itself
                        words = [line]
                        logger.warning(f"[DEBUG] Page {pageno} Block {block_idx} Line {line_idx}: Line is a word itself")
                    else:
                        logger.warning(f"[DEBUG] Page {pageno} Block {block_idx} Line {line_idx}: No words found, attributes: {[x for x in dir(line) if not x.startswith('_')][:10]}")
                        continue
                    
                    if not words:
                        logger.warning(f"[DEBUG] Page {pageno} Block {block_idx} Line {line_idx}: words is empty/None")
                        continue
                    
                    word_count_in_line = len(words)
                    words_added = 0
                    for word_idx, word in enumerate(words):
                        # Get word geometry - docTR uses normalized coordinates (0-1)
                        geometry = getattr(word, 'geometry', None)
                        if not geometry:
                            continue
                        
                        # Convert to list if it's a numpy array or other format
                        if hasattr(geometry, 'tolist'):
                            geometry = geometry.tolist()
                        
                        # docTR geometry can be in different formats:
                        # 1. List/tuple of 4 points: [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]
                        # 2. Tuple of 2 points: ((x0, y0), (x1, y1)) - bounding box corners
                        # 3. Single tuple/list of 4 values: [x0, y0, x1, y1]
                        
                        try:
                            # Handle tuple of 2 points (bounding box format)
                            if isinstance(geometry, tuple) and len(geometry) == 2:
                                # Format: ((x0, y0), (x1, y1))
                                p0, p1 = geometry
                                if len(p0) >= 2 and len(p1) >= 2:
                                    x0_norm = float(p0[0])
                                    y0_norm = float(p0[1])
                                    x1_norm = float(p1[0])
                                    y1_norm = float(p1[1])
                                else:
                                    continue
                            # Handle list/tuple of 4 points (polygon format)
                            elif isinstance(geometry, (list, tuple)) and len(geometry) >= 4:
                                # Extract bounding box from 4-point polygon
                                x_coords = [float(p[0]) for p in geometry if isinstance(p, (list, tuple)) and len(p) >= 2]
                                y_coords = [float(p[1]) for p in geometry if isinstance(p, (list, tuple)) and len(p) >= 2]
                                if not x_coords or not y_coords:
                                    continue
                                x0_norm, x1_norm = min(x_coords), max(x_coords)
                                y0_norm, y1_norm = min(y_coords), max(y_coords)
                            # Handle flat list of 4 values [x0, y0, x1, y1]
                            elif isinstance(geometry, (list, tuple)) and len(geometry) == 4:
                                try:
                                    x0_norm = float(geometry[0])
                                    y0_norm = float(geometry[1])
                                    x1_norm = float(geometry[2])
                                    y1_norm = float(geometry[3])
                                except (TypeError, ValueError, IndexError):
                                    continue
                            else:
                                # Unknown format, skip
                                continue
                        except (IndexError, TypeError, ValueError) as e:
                            continue
                        
                        # Get word text and confidence
                        word_text = getattr(word, 'value', '') or getattr(word, 'text', '') or getattr(word, 'prediction', '')
                        if not word_text:
                            if word_idx < 3:
                                logger.warning(f"[DEBUG] Page {pageno} Block {block_idx} Line {line_idx} Word {word_idx}: No text found. Word attributes: {[x for x in dir(word) if not x.startswith('_')][:10]}")
                            continue
                        
                        conf = 0.5  # Default confidence
                        if hasattr(word, 'confidence'):
                            conf_val = word.confidence
                            if conf_val is not None:
                                conf = float(conf_val)
                        
                        # Ensure coordinates are in correct order (x0 < x1, y0 < y1)
                        if x0_norm > x1_norm:
                            x0_norm, x1_norm = x1_norm, x0_norm
                        if y0_norm > y1_norm:
                            y0_norm, y1_norm = y1_norm, y0_norm
                        
                        temp_words.append({
                            'text': word_text,
                            'conf': conf,
                            'x0_norm': x0_norm,
                            'y0_norm': y0_norm,
                            'x1_norm': x1_norm,
                            'y1_norm': y1_norm,
                        })
                        words_added += 1
            
            # Convert normalized coordinates to pixels using actual page dimensions
            # docTR uses normalized coordinates (0-1), we have actual page dimensions from pdfplumber
            if temp_words:
                # Convert normalized coordinates to pixels
                for w_data in temp_words:
                    word_obj = OCRWord(
                        text=w_data['text'],
                        conf=w_data['conf'],
                        x0=int(w_data['x0_norm'] * page_w),
                        y0=int(w_data['y0_norm'] * page_h),
                        x1=int(w_data['x1_norm'] * page_w),
                        y1=int(w_data['y1_norm'] * page_h)
                    )
                    page_words.append(word_obj)
                    page_conf_sum += w_data['conf']
                    page_conf_count += 1
            
            if not page_words:
                logger.warning(f"No OCR words found on page {pageno}")
                continue
            
            # Calculate average confidence for this page
            avg_conf = page_conf_sum / page_conf_count if page_conf_count > 0 else 0.5
            page_confidences.append(avg_conf)
            logger.info(f"Page {pageno}: Extracted {len(page_words)} words, avg confidence: {avg_conf:.2%}")
            
            # Parse header from first page only
            if pageno == 1:
                header = self._parse_header_from_words(page_words, page_w, page_h)
            
            # Detect column bands
            bands = None
            try:
                bands = self._auto_detect_columns(page_words, page_w, page_h, cached_bands=cached_bands)
                logger.debug(f"Page {pageno}: Detected columns: {list(bands.keys())}")
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
                page_items, page_rejections = self._parse_rows_from_words(page_words, page_w, page_h, bands)
                logger.info(f"Page {pageno}: Extracted {len(page_items)} line items")
                all_items.extend(page_items)
                if page_rejections and len(rejected_rows_samples) < 5:
                    rejected_rows_samples.extend(page_rejections[:5 - len(rejected_rows_samples)])
            except Exception as e:
                logger.warning(f"Failed to parse rows from page {pageno}: {e}")
                continue
            
            # Parse totals from last page
            if pageno == num_pages:
                totals = self._parse_totals_from_words(page_words, page_w, page_h)
        
        # Calculate overall confidence
        overall_confidence = sum(page_confidences) / len(page_confidences) if page_confidences else 0.5
        if all_items:
            overall_confidence = min(0.95, overall_confidence + (len(all_items) / 100.0))
        else:
            warnings_local.append("OCR extraction returned no valid line items; check PDF quality.")
        
        return {
            "header": header,
            "lines": all_items,
            "totals": totals,
            "metadata": {
                "confidence": overall_confidence,
                "pages_processed": num_pages,
                "total_line_items": len(all_items),
                "rejected_row_samples": rejected_rows_samples,
                "warnings": warnings_local,
            }
        }
    
    # Reuse column detection and row parsing methods from geometry parser
    # These methods work with OCRWord objects, so they're compatible
    
    def _auto_detect_columns(self, words: List[OCRWord], page_w: int, page_h: int, cached_bands: Optional[Dict[str, Tuple[int, int]]] = None) -> Dict[str, Tuple[int, int]]:
        """Auto-detect column bands - reuse logic from geometry parser"""
        from .parser_geometry import ICDCParserGeometry
        geometry_parser = ICDCParserGeometry()
        return geometry_parser._auto_detect_columns(words, page_w, page_h, cached_bands)
    
    def _parse_rows_from_words(self, words: List[OCRWord], page_w: int, page_h: int, bands: Dict[str, Tuple[int, int]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Parse rows from words - reuse logic from geometry parser"""
        from .parser_geometry import ICDCParserGeometry
        geometry_parser = ICDCParserGeometry()
        return geometry_parser._parse_rows_from_words(words, page_w, page_h, bands)
    
    def _parse_header_from_words(self, words: List[OCRWord], page_w: int, page_h: int) -> Dict[str, Any]:
        """Parse header from words - reuse logic from geometry parser"""
        from .parser_geometry import ICDCParserGeometry
        geometry_parser = ICDCParserGeometry()
        return geometry_parser._parse_header_from_words(words, page_w, page_h)
    
    def _parse_totals_from_words(self, words: List[OCRWord], page_w: int, page_h: int) -> Dict[str, Any]:
        """Parse totals from words - reuse logic from geometry parser"""
        from .parser_geometry import ICDCParserGeometry
        geometry_parser = ICDCParserGeometry()
        return geometry_parser._parse_totals_from_words(words, page_w, page_h)
    
    def _parse_header_text(self, lines: List[str]) -> Dict[str, Any]:
        """Parse header from text lines - reuse logic from geometry parser"""
        from .parser_geometry import ICDCParserGeometry
        geometry_parser = ICDCParserGeometry()
        return geometry_parser._parse_header_text(lines)
    
    def _parse_lines_text(self, lines: List[str]) -> List[Dict[str, Any]]:
        """Parse line items from text lines - reuse logic from geometry parser"""
        from .parser_geometry import ICDCParserGeometry
        geometry_parser = ICDCParserGeometry()
        return geometry_parser._parse_lines_text(lines)
    
    def _parse_totals_text(self, lines: List[str]) -> Dict[str, Any]:
        """Parse totals from text lines - reuse logic from geometry parser"""
        from .parser_geometry import ICDCParserGeometry
        geometry_parser = ICDCParserGeometry()
        return geometry_parser._parse_totals_text(lines)

