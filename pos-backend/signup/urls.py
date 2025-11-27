from django.urls import path
from .views import SignupStartView, SignupVerifyOtpView, SignupCompleteProfileView, GeoMetaView

urlpatterns = [
    path("meta/geo", GeoMetaView.as_view(), name="signup-geo-meta"),
    path("signup/start", SignupStartView.as_view(), name="signup-start"),
    path("signup/verify-otp", SignupVerifyOtpView.as_view(), name="signup-verify-otp"),
    path("signup/complete-profile", SignupCompleteProfileView.as_view(), name="signup-complete-profile"),
]
