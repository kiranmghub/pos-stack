from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import exceptions
from tenants.models import Tenant, TenantUser

class TenantAwareTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Accepts username, password, and optional tenant_code.
    Embeds tenant + role in the resulting tokens.
    """

    def validate(self, attrs):
        # Let SimpleJWT authenticate the user (sets self.user)
        data = super().validate(attrs)

        request = self.context["request"]
        tenant_code = request.data.get("tenant_code")

        # Find the tenant to bind this session to
        if tenant_code:
            tenant = Tenant.objects.filter(code=tenant_code, is_active=True).first()
            if not tenant:
                raise exceptions.AuthenticationFailed("Invalid tenant")
            membership = TenantUser.objects.filter(user=self.user, tenant=tenant, is_active=True).first()
            if not membership:
                raise exceptions.AuthenticationFailed("User is not a member of this tenant")
        else:
            membership = self.user.tenant_memberships.filter(is_active=True).select_related("tenant").first()
            if not membership:
                raise exceptions.AuthenticationFailed("User has no active tenant memberships")
            tenant = membership.tenant

        # Build fresh tokens WITH custom claims (ignore the ones created by super())
        refresh = self.get_token(self.user)
        refresh["tenant_id"] = tenant.id
        refresh["tenant_code"] = tenant.code
        refresh["role"] = membership.role

        data["refresh"] = str(refresh)
        data["access"] = str(refresh.access_token)
        data["tenant"] = {"id": tenant.id, "code": tenant.code}
        data["role"] = membership.role
        return data
