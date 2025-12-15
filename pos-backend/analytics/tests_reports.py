"""
Automated tests covering the analytics reports feature (Phase 8).
Validates calculation helpers, API views, caching, rate limiting, and exports.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any, Dict

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate

from analytics.api_exports import ReportExportView
from analytics.api_reports import (
    BaseReportView,
    CustomerAnalyticsReportView,
    EmployeePerformanceReportView,
    FinancialSummaryReportView,
    ProductPerformanceReportView,
    ReturnsAnalysisReportView,
    SalesDetailReportView,
    SalesSummaryReportView,
)
from analytics.reports.base import get_cache_key, parse_date_range, rate_limit_report
from analytics.reports.customer_reports import calculate_customer_analytics
from analytics.reports.employee_reports import calculate_employee_performance
from analytics.reports.financial_reports import calculate_financial_summary
from analytics.reports.product_reports import calculate_product_performance
from analytics.reports.returns_reports import calculate_returns_analysis
from analytics.reports.sales_reports import calculate_sales_summary
from catalog.models import Product, Variant
from common.roles import TenantRole
from customers.models import Customer
from orders.models import Return, ReturnItem, Sale, SaleLine, SalePayment
from stores.models import Register, Store
from tenants.models import Tenant, TenantUser

User = get_user_model()


class ReportsTestBase(TestCase):
    """Provides shared fixtures for reports tests."""

    def setUp(self):
        cache.clear()
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="reports-owner",
            email="owner@example.com",
            password="test-pass",
            first_name="Riley",
            last_name="Owner",
        )
        self.tenant = Tenant.objects.create(
            name="Reports Tenant",
            code="reports-tenant",
            currency_code="USD",
            default_currency="USD",
        )
        TenantUser.objects.create(tenant=self.tenant, user=self.user, role=TenantRole.OWNER)

        self.store = Store.objects.create(
            tenant=self.tenant,
            name="Downtown",
            code="dt",
            timezone="UTC",
            region="",
            street="1 Main St",
            city="Austin",
            state="TX",
            postal_code="73301",
            country="US",
        )
        self.register = Register.objects.create(
            tenant=self.tenant,
            store=self.store,
            name="Front Register",
            code="reg-1",
        )

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            first_name="Casey",
            last_name="Customer",
            email="customer@example.com",
            total_spend=Decimal("250.00"),
            visits_count=3,
        )

        self.product = Product.objects.create(
            tenant=self.tenant,
            name="Premium Widget",
            code="widget-premium",
            category="Widgets",
        )
        self.variant = Variant.objects.create(
            tenant=self.tenant,
            product=self.product,
            name="Widget Variant",
            sku="WID-001",
            barcode="111111",
            price=Decimal("75.00"),
        )

        now = timezone.now()
        self.date_from = now - timedelta(days=2)
        self.date_to = now

        # Sale in range
        self.sale = Sale.objects.create(
            tenant=self.tenant,
            store=self.store,
            register=self.register,
            cashier=self.user,
            customer=self.customer,
            total=Decimal("150.00"),
            currency_code="USD",
            status="completed",
            created_at=now - timedelta(hours=1),
            receipt_data={
                "discount_by_rule": [
                    {"rule_id": 10, "name": "Promo 10", "code": "PROMO10", "amount": "5.00"}
                ],
                "tax_by_rule": [
                    {"rule_id": 99, "name": "TX State", "code": "TX-TAX", "amount": "12.00"}
                ],
            },
        )
        self.sale_line = SaleLine.objects.create(
            sale=self.sale,
            variant=self.variant,
            qty=2,
            unit_price=Decimal("75.00"),
            discount=Decimal("5.00"),
            tax=Decimal("12.00"),
            fee=Decimal("1.00"),
            line_total=Decimal("150.00"),
        )
        SalePayment.objects.create(
            sale=self.sale,
            type=SalePayment.CARD,
            currency_code="USD",
            amount=Decimal("120.00"),
            received=Decimal("120.00"),
        )
        SalePayment.objects.create(
            sale=self.sale,
            type=SalePayment.CASH,
            currency_code="USD",
            amount=Decimal("30.00"),
            received=Decimal("30.00"),
        )

        # Sale outside current range to mark customer as returning
        Sale.objects.create(
            tenant=self.tenant,
            store=self.store,
            register=self.register,
            cashier=self.user,
            customer=self.customer,
            total=Decimal("99.00"),
            currency_code="USD",
            status="completed",
            created_at=now - timedelta(days=5),
        )

        # Return linked to sale for returns/employee metrics
        self.return_obj = Return.objects.create(
            tenant=self.tenant,
            store=self.store,
            sale=self.sale,
            processed_by=self.user,
            status="finalized",
            refund_total=Decimal("20.00"),
            reason_code="DAMAGED",
            created_at=now - timedelta(minutes=30),
        )
        ReturnItem.objects.create(
            return_ref=self.return_obj,
            sale_line=self.sale_line,
            qty_returned=1,
            restock=True,
            disposition="RESTOCK",
            refund_subtotal=Decimal("18.00"),
            refund_tax=Decimal("2.00"),
            refund_total=Decimal("20.00"),
        )

    # ------------------------------------------------------------------ helpers
    def build_request(
        self,
        method: str,
        path: str,
        data: Dict[str, Any] | None = None,
        user: User | None = None,
    ):
        """Create an authenticated request and attach tenant context."""
        if method.lower() == "get":
            request = self.factory.get(path, data or {})
        else:
            request = self.factory.post(path, data or {}, format="json")
        force_authenticate(request, user=user or self.user)
        request.tenant = self.tenant
        return request


# ---------------------------------------------------------------------- utility tests
class ReportUtilityTests(ReportsTestBase):
    def test_parse_date_range_validates_pairing_and_length(self):
        df, dt_, error = parse_date_range("2024-01-01", "2024-01-10")
        self.assertIsNone(error)
        self.assertLess(df, dt_)

        _, _, error = parse_date_range("2024-01-10", None)
        self.assertIsNotNone(error)
        self.assertIn("Both date_from and date_to", error)

        _, _, error = parse_date_range("2024-01-01", "2026-01-01", max_days=30)
        self.assertIsNotNone(error)
        self.assertIn("cannot exceed", error)

    def test_rate_limit_helper_blocks_after_threshold(self):
        cache_key = "rate_limit:reports:user:999"
        cache.delete(cache_key)
        over_limit = False
        retry_after = None

        for _ in range(65):
            over_limit, retry_after = rate_limit_report(999, limit=5, window_seconds=60)
            if over_limit:
                break

        self.assertTrue(over_limit)
        self.assertEqual(retry_after, 60)

    def test_cache_helpers_avoid_duplicate_calculations(self):
        class DummyReportView(BaseReportView):
            invoke_count = 0

            def get(self, request):
                tenant, error = self.get_tenant(request)
                self.assertIsNone(error)
                params = {"foo": request.GET.get("foo", "bar")}
                cached = self.get_cache("dummy", tenant.id, params)
                if cached:
                    return Response(cached)
                DummyReportView.invoke_count += 1
                payload = {"value": DummyReportView.invoke_count}
                self.set_cache("dummy", tenant.id, params, payload, timeout=30)
                return Response(payload)

        view = DummyReportView.as_view()
        request_a = self.build_request("get", "/dummy", {"foo": "x"})
        response_a = view(request_a)
        self.assertEqual(response_a.data["value"], 1)

        request_b = self.build_request("get", "/dummy", {"foo": "x"})
        response_b = view(request_b)
        self.assertEqual(response_b.data["value"], 1)
        self.assertEqual(DummyReportView.invoke_count, 1)


# ---------------------------------------------------------------------- calculation tests
class ReportCalculationTests(ReportsTestBase):
    def test_sales_summary_calculation_contains_expected_sections(self):
        data = calculate_sales_summary(
            tenant=self.tenant,
            store_id=None,
            date_from=self.date_from,
            date_to=self.date_to,
            group_by="day",
            tz=timezone.utc,
        )
        self.assertGreater(data["summary"]["total_revenue"], 0)
        self.assertEqual(data["summary"]["order_count"], 1)
        self.assertTrue(data["time_series"])
        self.assertTrue(data["store_breakdown"])

    def test_financial_summary_provides_payment_discount_and_tax_breakdowns(self):
        report = calculate_financial_summary(
            tenant=self.tenant,
            store_id=None,
            date_from=self.date_from,
            date_to=self.date_to,
        )
        summary = report["summary"]
        self.assertGreater(summary["total_revenue"], 0)
        self.assertGreater(len(report["payment_methods"]), 0)
        self.assertEqual(report["discount_rules"][0]["code"], "PROMO10")
        self.assertEqual(report["tax_rules"][0]["code"], "TX-TAX")

    def test_product_performance_returns_top_lists(self):
        report = calculate_product_performance(
            tenant=self.tenant,
            store_id=None,
            date_from=self.date_from,
            date_to=self.date_to,
            limit=10,
        )
        self.assertEqual(report["summary"]["total_products"], 1)
        self.assertEqual(len(report["top_products_by_revenue"]), 1)
        self.assertEqual(report["top_products_by_revenue"][0]["sku"], "WID-001")

    def test_customer_analytics_tracks_repeat_rate(self):
        report = calculate_customer_analytics(
            tenant=self.tenant,
            store_id=None,
            date_from=self.date_from,
            date_to=self.date_to,
            limit=10,
        )
        self.assertEqual(report["top_customers"][0]["customer_id"], self.customer.id)
        self.assertGreaterEqual(report["summary"]["repeat_customer_rate"], 0)

    def test_employee_performance_includes_return_statistics(self):
        report = calculate_employee_performance(
            tenant=self.tenant,
            store_id=None,
            date_from=self.date_from,
            date_to=self.date_to,
            limit=5,
        )
        self.assertEqual(report["top_employees"][0]["employee_id"], self.user.id)
        self.assertGreaterEqual(report["top_employees"][0]["return_rate"], 0)

    def test_returns_analysis_reports_refunds_and_reason_breakdown(self):
        report = calculate_returns_analysis(
            tenant=self.tenant,
            store_id=None,
            date_from=self.date_from,
            date_to=self.date_to,
            tz=timezone.utc,
        )
        self.assertEqual(report["summary"]["total_returns"], 1)
        self.assertEqual(report["reason_breakdown"][0]["reason_code"], "DAMAGED")
        self.assertTrue(report["trend"])


# ---------------------------------------------------------------------- API tests
class ReportAPITests(ReportsTestBase):
    def test_sales_summary_view_scopes_to_tenant(self):
        other_tenant = Tenant.objects.create(name="Other", code="other")
        other_store = Store.objects.create(
            tenant=other_tenant,
            name="Other Store",
            code="other",
            timezone="UTC",
            region="",
            street="2 Main",
            city="Austin",
            state="TX",
            postal_code="73301",
            country="US",
        )
        register = Register.objects.create(tenant=other_tenant, store=other_store, name="Other", code="reg-2")
        Sale.objects.create(
            tenant=other_tenant,
            store=other_store,
            register=register,
            cashier=self.user,
            total=Decimal("999.00"),
            status="completed",
            created_at=timezone.now(),
        )

        view = SalesSummaryReportView.as_view()
        params = {"date_from": self.date_from.date().isoformat(), "date_to": self.date_to.date().isoformat()}
        request = self.build_request("get", "/api/v1/analytics/reports/sales/summary", params)
        response = view(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["order_count"], 1)

    def test_sales_detail_view_enforces_page_size_cap(self):
        view = SalesDetailReportView.as_view()
        params = {
            "date_from": self.date_from.date().isoformat(),
            "date_to": self.date_to.date().isoformat(),
            "page_size": 5000,
        }
        request = self.build_request("get", "/api/v1/analytics/reports/sales/detail", params)
        response = view(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLessEqual(response.data["page_size"], 1000)
        self.assertEqual(response.data["count"], 1)

    def test_product_financial_customer_employee_and_returns_views(self):
        endpoints = [
            (ProductPerformanceReportView.as_view(), {"date_from": self.date_from.date().isoformat(), "date_to": self.date_to.date().isoformat()}),
            (FinancialSummaryReportView.as_view(), {"date_from": self.date_from.date().isoformat(), "date_to": self.date_to.date().isoformat()}),
            (CustomerAnalyticsReportView.as_view(), {"date_from": self.date_from.date().isoformat(), "date_to": self.date_to.date().isoformat()}),
            (EmployeePerformanceReportView.as_view(), {"date_from": self.date_from.date().isoformat(), "date_to": self.date_to.date().isoformat()}),
            (ReturnsAnalysisReportView.as_view(), {"date_from": self.date_from.date().isoformat(), "date_to": self.date_to.date().isoformat()}),
        ]
        for view, params in endpoints:
            response = view(self.build_request("get", "/dummy", params))
            self.assertEqual(response.status_code, status.HTTP_200_OK, msg=f"{view.__name__} failed")

    def test_report_export_view_streams_file(self):
        view = ReportExportView.as_view()
        payload = {
            "report_type": "sales",
            "format": "csv",
            "params": {
                "date_from": self.date_from.date().isoformat(),
                "date_to": self.date_to.date().isoformat(),
            },
        }
        request = self.build_request("post", "/api/v1/analytics/reports/export", payload)
        response = view(request)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("attachment; filename=", response["Content-Disposition"])
        self.assertTrue(response.content.startswith(b"id,"), msg="CSV header missing")


# ---------------------------------------------------------------------- cache-key tests
class CacheKeyDeterminismTests(TestCase):
    def test_cache_key_uses_sorted_params(self):
        key_a = get_cache_key("sales", 1, {"a": 1, "b": 2})
        key_b = get_cache_key("sales", 1, {"b": 2, "a": 1})
        self.assertEqual(key_a, key_b)
