import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportButton } from "../ExportButton";
import { vi } from "vitest";
import { exportReport } from "../../api/reports";

vi.mock("../../api/reports", () => ({
  exportReport: vi.fn(() => Promise.resolve()),
}));

describe("ExportButton", () => {
  const defaultProps = {
    reportType: "sales" as const,
    params: {
      store_id: "1",
      date_from: "2024-01-01",
      date_to: "2024-01-31",
    },
  };

  it("invokes exportReport when clicking a format button", async () => {
    const user = userEvent.setup();
    render(<ExportButton {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /pdf/i }));

    await waitFor(() => {
      expect(exportReport).toHaveBeenCalledWith({
        report_type: "sales",
        format: "pdf",
        params: defaultProps.params,
      });
    });
  });

  it("supports Ctrl/Cmd + E keyboard shortcut for PDF export", async () => {
    render(<ExportButton {...defaultProps} />);

    fireEvent.keyDown(window, { key: "e", ctrlKey: true });

    await waitFor(() => {
      expect(exportReport).toHaveBeenCalledTimes(1);
      expect(exportReport).toHaveBeenCalledWith({
        report_type: "sales",
        format: "pdf",
        params: defaultProps.params,
      });
    });
  });
});
