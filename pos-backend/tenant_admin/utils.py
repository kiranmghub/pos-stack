# pos-backend/tenant_admin/utils.py
"""
Utility functions for tenant_admin app, including image-to-PDF conversion.
"""
import logging
from io import BytesIO
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)


def convert_image_to_pdf(image_file):
    """
    Convert an image file to PDF.
    
    Args:
        image_file: Django UploadedFile (image)
    
    Returns:
        ContentFile: PDF file ready to be saved
    
    Raises:
        ValueError: If conversion fails
    """
    try:
        # Reset file pointer to beginning (in case it was read before)
        image_file.seek(0)
        
        # Open image with Pillow
        img = Image.open(image_file)
        
        # Convert RGBA to RGB if necessary (for PNG with transparency)
        if img.mode == "RGBA":
            rgb_img = Image.new("RGB", img.size, (255, 255, 255))
            rgb_img.paste(img, mask=img.split()[3])  # Use alpha channel as mask
            img = rgb_img
        elif img.mode != "RGB":
            img = img.convert("RGB")
        
        # Create PDF buffer
        buffer = BytesIO()
        
        # Calculate page size (fit image to page, maintaining aspect ratio)
        img_width, img_height = img.size
        page_width, page_height = A4
        
        # Scale to fit page (with some margin)
        margin = 20  # 20 points margin on all sides
        available_width = page_width - (2 * margin)
        available_height = page_height - (2 * margin)
        
        # Calculate scale factor to fit within available space
        scale_width = available_width / img_width
        scale_height = available_height / img_height
        scale = min(scale_width, scale_height, 1.0)  # Don't scale up
        
        scaled_width = img_width * scale
        scaled_height = img_height * scale
        
        # Center image on page
        x_offset = (page_width - scaled_width) / 2
        y_offset = (page_height - scaled_height) / 2
        
        # Create PDF canvas
        pdf = canvas.Canvas(buffer, pagesize=A4)
        
        # Convert PIL image to format reportlab can use
        img_buffer = BytesIO()
        img.save(img_buffer, format="JPEG", quality=95)
        img_buffer.seek(0)
        img_reader = ImageReader(img_buffer)
        
        # Draw image on PDF
        pdf.drawImage(
            img_reader,
            x_offset,
            y_offset,
            width=scaled_width,
            height=scaled_height,
            preserveAspectRatio=True,
        )
        
        pdf.save()
        buffer.seek(0)
        
        # Create ContentFile with .pdf extension
        original_name = image_file.name or "image"
        # Extract base name without extension
        if "." in original_name:
            base_name = ".".join(original_name.split(".")[:-1])
        else:
            base_name = original_name
        pdf_filename = f"{base_name}.pdf"
        
        return ContentFile(buffer.read(), name=pdf_filename)
        
    except Exception as e:
        logger.error(f"Error converting image to PDF: {str(e)}", exc_info=True)
        raise ValueError(f"Failed to convert image to PDF: {str(e)}")

