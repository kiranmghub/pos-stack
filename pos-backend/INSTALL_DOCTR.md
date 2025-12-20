# Installing docTR for ICDC PDF Parsing

docTR (Document Text Recognition) provides high-accuracy OCR for scanned PDFs using deep learning models.

## Installation

### Step 1: Install PyTorch and torchvision

docTR requires PyTorch and torchvision. We use PyTorch:

```bash
# For CPU-only (recommended for most servers)
pip install torch torchvision

# For GPU support (if you have CUDA)
# Visit https://pytorch.org/get-started/locally/ for GPU installation instructions
# Example: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

### Step 2: Install docTR

```bash
pip install python-doctr
```

### Step 3: Verify Installation

```bash
python3 -c "import torch; import torchvision; from doctr.io import DocumentFile; print('docTR installed successfully')"
```

## Fallback Behavior

If PyTorch is not installed, the system will automatically fall back to the geometry-based parser (using pytesseract). This ensures the system continues to work even without docTR.

## Benefits of docTR

- **Higher accuracy** on scanned documents
- **Better handling** of rotated/skewed text
- **Built-in confidence scores**
- **No external dependencies** (no Tesseract/poppler required)
- **Active development** and maintenance

## Troubleshooting

### Error: "DocTR requires either TensorFlow or PyTorch"

**Solution**: Install PyTorch and torchvision:
```bash
pip install torch torchvision
```

### Error: "No module named 'torchvision'"

**Solution**: Install torchvision:
```bash
pip install torchvision
```

### Error: "ModuleNotFoundError: No module named 'doctr'"

**Solution**: Install docTR:
```bash
pip install python-doctr
```

### Large Download Size

PyTorch is a large package (~500MB-2GB depending on version). The first installation may take several minutes.

### Memory Usage

docTR models require more memory than pytesseract. Ensure your server has at least 2GB RAM available for the OCR process.

## Current Status

Check which parser is active:
```bash
python3 manage.py shell
>>> from domain_extensions.telangana_liquor.parser import ICDCParser
>>> print(ICDCParser.__name__)
```

- `ICDCParserDoctr` = docTR is active (high accuracy)
- `ICDCParserGeometry` = Fallback parser (pytesseract-based)

