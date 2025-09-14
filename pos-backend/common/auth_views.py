# common/auth_views.py
from rest_framework_simplejwt.views import TokenObtainPairView
from .auth_tokens import TenantAwareTokenObtainPairSerializer


class TenantAwareTokenObtainPairView(TokenObtainPairView):
    serializer_class = TenantAwareTokenObtainPairSerializer
