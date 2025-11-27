from datetime import datetime, timedelta
from collections import defaultdict

from django.utils import timezone
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count

from common.api_mixins import IsOwner
from otp.models import OtpRequest, OtpAudit
from signup.models import SignupAudit
from subscriptions.models import SubscriptionAudit, Subscription
from emails.models import EmailLog


def _parse_date(date_str):
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        return None


def _default_range():
    end = timezone.localtime(timezone.now()).date()
    start = end - timedelta(days=13)
    return start, end


def _tenant_timezone(request):
    tz_name = None
    tenant = getattr(request, "tenant", None)
    if tenant:
        tz_name = getattr(tenant, "timezone", None) or getattr(tenant, "tz", None)
        if not tz_name:
            try:
                from stores.models import Store
                tz_name = (
                    Store.objects.filter(tenant=tenant, timezone__isnull=False, timezone__gt="").values_list("timezone", flat=True).first()
                )
            except Exception:
                tz_name = None
    if not tz_name:
        tz_name = getattr(settings, "TIME_ZONE", "UTC")
    try:
        return timezone.pytz.timezone(tz_name)
    except Exception:
        return timezone.utc


def _daterange(start_date, end_date):
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


class MetricsOverviewView(APIView):
    """
    Returns high-level metrics for OTP, signup, subscriptions, and emails.
    Supports ?start=YYYY-MM-DD&end=YYYY-MM-DD (defaults to last 14 days).
    """

    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request):
        start_param = request.GET.get("start")
        end_param = request.GET.get("end")
        start_date = _parse_date(start_param) if start_param else None
        end_date = _parse_date(end_param) if end_param else None
        tz = _tenant_timezone(request)
        if not start_date or not end_date:
            end_date = timezone.localtime(timezone.now(), tz).date()
            start_date = end_date - timedelta(days=13)
        if start_date > end_date:
            start_date, end_date = end_date, start_date

        tenant = request.tenant
        start_dt = timezone.make_aware(datetime.combine(start_date, datetime.min.time()), tz)
        end_dt = timezone.make_aware(datetime.combine(end_date, datetime.max.time()), tz)

        days = list(_daterange(start_date, end_date))
        day_keys = [d.isoformat() for d in days]

        def bucket_for(model_qs, date_field="created_at", extra_filters=None):
            qs = model_qs
            if extra_filters:
                qs = qs.filter(**extra_filters)
            qs = qs.filter(**{f"{date_field}__gte": start_dt, f"{date_field}__lte": end_dt})
            bucket = defaultdict(int)
            for row in qs.values_list(date_field, flat=True):
                if row is None:
                    continue
                d = row.date().isoformat()
                bucket[d] += 1
            return {k: bucket.get(k, 0) for k in day_keys}

        def bucket_for_prev(model_qs, date_field="created_at", extra_filters=None):
            # previous period of same length for deltas
            delta_days = (end_date - start_date).days + 1
            prev_end = start_dt - timedelta(seconds=1)
            prev_start = prev_end - timedelta(days=delta_days - 1)
            qs = model_qs
            if extra_filters:
                qs = qs.filter(**extra_filters)
            qs = qs.filter(**{f"{date_field}__gte": prev_start, f"{date_field}__lte": prev_end})
            return qs.count()

        # OTP metrics
        otp_sent_bucket = bucket_for(OtpRequest.objects.all(), date_field="created_at", extra_filters={"purpose": "signup"})
        otp_failed_bucket = bucket_for(OtpAudit.objects.all(), date_field="created_at")
        otp_sent_total = sum(otp_sent_bucket.values())
        otp_failed_total = sum(otp_failed_bucket.values())
        otp_sent_prev = bucket_for_prev(OtpRequest.objects.all(), date_field="created_at", extra_filters={"purpose": "signup"})
        otp_failed_prev = bucket_for_prev(OtpAudit.objects.all(), date_field="created_at")

        # Signup metrics
        signup_qs = SignupAudit.objects.filter(email__isnull=False)
        signup_qs = signup_qs.filter(created_at__gte=start_dt, created_at__lte=end_dt)
        signup_counts = defaultdict(int)
        signup_day_buckets = {k: {"start": 0, "verify_ok": 0, "complete": 0} for k in day_keys}
        for audit in signup_qs.values("action", "created_at"):
            action = audit["action"]
            d = audit["created_at"].date().isoformat()
            signup_counts[action] += 1
            if d in signup_day_buckets and action in signup_day_buckets[d]:
                signup_day_buckets[d][action] += 1
        signup_prev = bucket_for_prev(SignupAudit.objects.all(), date_field="created_at")

        # Subscription metrics
        sub_qs = SubscriptionAudit.objects.filter(tenant=tenant, created_at__gte=start_dt, created_at__lte=end_dt)
        sub_counts = defaultdict(int)
        sub_day_buckets = {k: {"created": 0, "status_changed": 0} for k in day_keys}
        for audit in sub_qs.values("action", "created_at"):
            action = audit["action"]
            d = audit["created_at"].date().isoformat()
            sub_counts[action] += 1
            if d in sub_day_buckets and action in sub_day_buckets[d]:
                sub_day_buckets[d][action] += 1

        status_counts = (
            Subscription.objects.filter(tenant=tenant)
            .values("status")
            .order_by("status")
            .annotate(count=Count("id"))
        )
        status_counts = {row["status"]: row["count"] for row in status_counts}
        subs_prev = bucket_for_prev(SubscriptionAudit.objects.filter(tenant=tenant), date_field="created_at")

        # Email metrics
        email_qs = EmailLog.objects.filter(created_at__gte=start_dt, created_at__lte=end_dt)
        email_status_bucket = bucket_for(email_qs, date_field="created_at")
        email_fail_bucket = bucket_for(email_qs.filter(status="failed"), date_field="created_at")
        email_sent_total = sum(email_status_bucket.values())
        email_failed_total = sum(email_fail_bucket.values())
        email_sent_prev = bucket_for_prev(EmailLog.objects.all(), date_field="created_at")
        email_failed_prev = bucket_for_prev(EmailLog.objects.filter(status="failed"), date_field="created_at")

        return Response(
            {
                "range": {"start": start_date.isoformat(), "end": end_date.isoformat(), "timezone": str(tz)},
                "otp": {
                    "sent": otp_sent_total,
                    "failed": otp_failed_total,
                    "prev_sent": otp_sent_prev,
                    "prev_failed": otp_failed_prev,
                    "by_day": [
                        {"date": k, "sent": otp_sent_bucket[k], "failed": otp_failed_bucket[k]} for k in day_keys
                    ],
                },
                "signup": {
                    "start": signup_counts.get("start", 0),
                    "verify_ok": signup_counts.get("verify_ok", 0),
                    "complete": signup_counts.get("complete", 0),
                    "prev_total": signup_prev,
                    "by_day": [
                        {"date": k, **signup_day_buckets[k]} for k in day_keys
                    ],
                },
                "subscriptions": {
                    "created": sub_counts.get("created", 0),
                    "status_changed": sub_counts.get("status_changed", 0),
                    "status_counts": status_counts,
                    "prev_total": subs_prev,
                    "by_day": [
                        {"date": k, **sub_day_buckets[k]} for k in day_keys
                    ],
                },
                "emails": {
                    "sent": email_sent_total,
                    "failed": email_failed_total,
                    "prev_sent": email_sent_prev,
                    "prev_failed": email_failed_prev,
                    "by_day": [
                        {"date": k, "sent": email_status_bucket[k], "failed": email_fail_bucket[k]} for k in day_keys
                    ],
                },
            }
        )
