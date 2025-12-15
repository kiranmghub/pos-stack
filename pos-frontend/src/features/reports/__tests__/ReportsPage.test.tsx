import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportsPage from "../ReportsPage";
import { vi } from "vitest";

const salesTabMock = vi.fn();
vi.mock("../tabs/SalesReportsTab", () => ({
  SalesReportsTab: (props: any) => {
    salesTabMock(props);
    return <div data-testid="sales-tab" />;
  },
}));

const productTabMock = vi.fn();
vi.mock("../tabs/ProductReportsTab", () => ({
  ProductReportsTab: (props: any) => {
    productTabMock(props);
    return <div data-testid="product-tab" />;
  },
}));

const financialTabMock = vi.fn();
vi.mock("../tabs/FinancialReportsTab", () => ({
  FinancialReportsTab: (props: any) => {
    financialTabMock(props);
    return <div data-testid="financial-tab" />;
  },
}));

const customerTabMock = vi.fn();
vi.mock("../tabs/CustomerReportsTab", () => ({
  CustomerReportsTab: (props: any) => {
    customerTabMock(props);
    return <div data-testid="customer-tab" />;
  },
}));

const employeeTabMock = vi.fn();
vi.mock("../tabs/EmployeeReportsTab", () => ({
  EmployeeReportsTab: (props: any) => {
    employeeTabMock(props);
    return <div data-testid="employee-tab" />;
  },
}));

const returnsTabMock = vi.fn();
vi.mock("../tabs/ReturnsReportsTab", () => ({
  ReturnsReportsTab: (props: any) => {
    returnsTabMock(props);
    return <div data-testid="returns-tab" />;
  },
}));

function renderReportsPage(initialUrl = "/reports") {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/reports" element={<ReportsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ReportsPage", () => {
  it("applies deep-linked filters from URL parameters", () => {
    renderReportsPage("/reports?tab=financial&store_id=42&date_from=2024-01-01&date_to=2024-01-02");

    expect(financialTabMock).toHaveBeenCalledTimes(1);
    const financialProps = financialTabMock.mock.calls[0][0];
    expect(financialProps.storeId).toBe("42");
    expect(financialProps.dateFrom).toBe("2024-01-01");
    expect(financialProps.dateTo).toBe("2024-01-02");
    expect(screen.getByRole("tab", { name: /financial/i })).toHaveAttribute("aria-selected", "true");
  });

  it("switches tabs while preserving shared filter state", async () => {
    const user = userEvent.setup();
    renderReportsPage("/reports?store_id=5&date_from=2024-02-01&date_to=2024-02-10");

    expect(salesTabMock).toHaveBeenCalledTimes(1);
    const initialProps = salesTabMock.mock.calls[0][0];
    expect(initialProps.storeId).toBe("5");

    await user.click(screen.getByRole("tab", { name: /products/i }));
    await waitFor(() => expect(productTabMock).toHaveBeenCalledTimes(1));

    const productProps = productTabMock.mock.calls[0][0];
    expect(productProps.storeId).toBe("5");
    expect(productProps.dateFrom).toBe("2024-02-01");
    expect(productProps.dateTo).toBe("2024-02-10");
  });
});
