# pos-backend/catalog/api_images.py
from rest_framework import status, views
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from .models import Product, Variant

class ProductImageUploadView(views.APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        product = Product.objects.get(pk=pk)
        image = request.data.get("image")
        if not image:
            return Response({"detail": "image required"}, status=status.HTTP_400_BAD_REQUEST)
        product.image_file = image  # adjust if many-to-many gallery
        product.save(update_fields=["image_file"])
        return Response({"ok": True})

class VariantImageUploadView(views.APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        variant = Variant.objects.get(pk=pk)
        image = request.data.get("image")
        if not image:
            return Response({"detail": "image required"}, status=status.HTTP_400_BAD_REQUEST)
        variant.image_file = image
        variant.save(update_fields=["image_file"])
        return Response({"ok": True})
