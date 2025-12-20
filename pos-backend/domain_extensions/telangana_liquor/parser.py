# domain_extensions/telangana_liquor/parser.py
"""
ICDC PDF Parser for Telangana Liquor invoices.

Supports both text-based PDFs (direct text extraction) and scanned PDFs (OCR).

Version 3.0.0: Rewritten to use docTR (Document Text Recognition) library
for high-accuracy OCR with deep learning models.

This module now uses parser_doctr.py which implements docTR-based parsing.
Falls back to geometry-based parser if docTR is not available.
"""

import logging

logger = logging.getLogger(__name__)

# Try to import docTR parser first, fall back to geometry parser
try:
    from .parser_doctr import ICDCParserDoctr, PARSER_VERSION, ParsingError
    # Test if docTR can actually be used (requires PyTorch and torchvision)
    try:
        import torch  # Check if PyTorch is available
        import torchvision  # Check if torchvision is available
        ICDCParser = ICDCParserDoctr
        logger.info("Using docTR-based parser (high accuracy OCR with PyTorch)")
    except ImportError as e:
        missing = "torchvision" if "torchvision" in str(e) else "torch"
        logger.warning(f"{missing.capitalize()} not available for docTR, falling back to geometry-based parser. Install with: pip install torch torchvision python-doctr")
        from .parser_geometry import ICDCParserGeometry, PARSER_VERSION, ParsingError
        ICDCParser = ICDCParserGeometry
except ImportError as e:
    logger.warning(f"docTR not available ({e}), falling back to geometry-based parser. Install with: pip install torch torchvision python-doctr")
    from .parser_geometry import ICDCParserGeometry, PARSER_VERSION, ParsingError
    ICDCParser = ICDCParserGeometry

# Re-export for external imports
__all__ = ['ICDCParser', 'PARSER_VERSION', 'ParsingError']
