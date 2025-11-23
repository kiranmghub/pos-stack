// pos-frontend/src/features/sales/components/SaleDetailsTab.tsx
import * as React from "react";

export function SaleDetailsTab(props: {
  detail: any;
  safeMoney: (v: any) => string;
  onStartReturn: () => void;
  onOpenCustomer?: (customerId: number) => void;
  onViewCustomerDetails?: (customerId: number) => void;
}) {
  const {
    detail,
    safeMoney,
    onStartReturn,
    onOpenCustomer,
    onViewCustomerDetails,
  } = props;
  const [showBreakdown, setShowBreakdown] = React.useState(false);
  const customer =
    (detail as any)?.receipt_data?.customer ||
    (detail as any)?.customer ||
    null;


  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-zinc-400">Store:</span> {detail.store_name || "—"}</div>
        <div><span className="text-zinc-400">Cashier:</span> {detail.cashier_name || "—"}</div>
        {customer && (
          <div className="mt-2 flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-zinc-400">Customer:</span>
              <span className="text-zinc-100">
                {customer.name ||
                  customer.full_name ||
                  customer.email ||
                  customer.phone ||
                  (customer.id ? `#${customer.id}` : "—")}
              </span>
              {customer.email && (
                <span className="text-xs text-zinc-400">{customer.email}</span>
              )}
              {customer.phone && (
                <span className="text-xs text-zinc-400">{customer.phone}</span>
              )}
            </div>

            {customer.id && (onOpenCustomer || onViewCustomerDetails) && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {onOpenCustomer && (
                  <button
                    type="button"
                    onClick={() => onOpenCustomer(customer.id)}
                    className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-100 hover:bg-zinc-800"
                  >
                    View history
                  </button>
                )}
                {onViewCustomerDetails && (
                  <button
                    type="button"
                    onClick={() => onViewCustomerDetails(customer.id)}
                    className="rounded-md border border-zinc-700 px-2 py-0.5 text-xs text-zinc-100 hover:bg-zinc-800"
                  >
                    Edit profile
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div><span className="text-zinc-400">Created:</span> {new Date(detail.created_at).toLocaleString()}</div>
        <div><span className="text-zinc-400">Updated:</span> {new Date(detail.updated_at).toLocaleString()}</div>
        <div><span className="text-zinc-400">Status:</span> {detail.status}</div>
      </div>

      <div className="mt-3">
        <button className="rounded-md bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-sm font-medium text-white" onClick={onStartReturn}>
          Start return
        </button>
      </div>

      {/* Lines */}
      <div className="rounded-xl border border-zinc-800">
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-sm text-zinc-300">Lines</div>
          <button className="text-xs text-zinc-300 rounded px-2 py-1 hover:bg-white/5"
            onClick={() => setShowBreakdown(v => !v)}
            aria-pressed={showBreakdown}
            title={showBreakdown ? "Hide breakdown" : "Show breakdown"}>
            {showBreakdown ? "Hide breakdown" : "Show breakdown"}
          </button>
        </div>
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-xs text-zinc-400 uppercase pb-1 border-b border-zinc-800">
            <div>Item</div><div className="justify-self-end">Subtotal</div>
            <div className="justify-self-end">Discount</div>
            <div className="justify-self-end">Tax</div>
            <div className="justify-self-end">Total</div>
          </div>
          {(Array.isArray((detail as any)?.receipt_data?.lines) && (detail as any).receipt_data.lines.length > 0
            ? (detail as any).receipt_data.lines.map((ln: any, idx: number) => (
              <div key={`${ln.sku ?? idx}`} className="rounded-lg border border-zinc-800 p-2.5 bg-zinc-900/40">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-start text-[13px]">
                  <div className="min-w-0">
                    <div className="text-zinc-100 truncate">{ln.name ?? "Product"}</div>
                    <div className="text-xs text-zinc-400 truncate">
                      SKU: {ln.sku ?? "—"} • Qty: {ln.qty ?? "—"} • Unit: {safeMoney(ln.unit_price)}
                    </div>
                  </div>
                  <div className="justify-self-end text-zinc-200">{safeMoney(ln.line_subtotal ?? 0)}</div>
                  <div className="justify-self-end text-amber-300">-{safeMoney(ln.line_discount ?? 0)}</div>
                  <div className="justify-self-end text-blue-300">{safeMoney(ln.tax ?? 0)}</div>
                  <div className="justify-self-end font-medium text-zinc-100">{safeMoney(ln.line_gross_after_tax ?? ln.line_total ?? 0)}</div>
                </div>
                {showBreakdown && (
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <div>Subtotal: <span className="text-zinc-200">{safeMoney(ln.line_subtotal ?? 0)}</span></div>
                    <div>Discount: <span className="text-amber-300">-{safeMoney(ln.line_discount ?? 0)}</span></div>
                    <div>Tax: <span className="text-blue-300">{safeMoney(ln.tax ?? 0)}</span></div>
                    <div>Fee: <span className="text-zinc-200">{safeMoney(ln.fee ?? 0)}</span></div>
                    <div>Net (pre-tax): <span className="text-zinc-200">{safeMoney(ln.line_net ?? 0)}</span></div>
                    <div>Gross after tax: <span className="text-zinc-100">{safeMoney(ln.line_gross_after_tax ?? ln.line_total ?? 0)}</span></div>
                  </div>
                )}
              </div>
            ))
            : detail.lines.map((it: any) => (
              <div key={it.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-sm">
                <div className="truncate">
                  <div className="text-zinc-100">{it.product_name || "Product"}</div>
                  <div className="text-xs text-zinc-400">{it.variant_name || it.sku}</div>
                </div>
                <div className="justify-self-end">{it.quantity}</div>
                <div className="justify-self-end">{safeMoney(it.unit_price)}</div>
                <div className="justify-self-end">{safeMoney(it.tax || 0)}</div>
                <div className="justify-self-end font-medium">{safeMoney(it.line_total)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Payments */}
      <div className="rounded-xl border border-zinc-800">
        <div className="px-3 py-2 border-b border-zinc-800 text-sm text-zinc-300">Payments</div>
        <div className="p-3 space-y-2">
          {detail.payments.length === 0 && <div className="text-sm text-zinc-500">No payments recorded.</div>}
          {detail.payments.map((p: any) => (
            <div key={p.id} className="grid grid-cols-[auto_auto_1fr] gap-3 text-sm">
              <div className="text-zinc-200">{p.tender_type}</div>
              <div className="text-zinc-200">{safeMoney(p.amount)}</div>
              <div className="text-zinc-500 text-xs">{p.txn_ref ? `Ref: ${p.txn_ref}` : ""}</div>
            </div>
          ))}
          {(detail as any)?.receipt_data?.payment && (
            <div className="mt-2 rounded border border-zinc-800 p-3 text-xs text-zinc-300">
              <div className="font-medium text-zinc-200 mb-1">Payment (Receipt)</div>
              <div className="grid grid-cols-3 gap-2">
                <div>Type: {(detail as any).receipt_data.payment.type}</div>
                <div>Amount: {safeMoney((detail as any).receipt_data.payment.amount)}</div>
                <div>Received: {safeMoney((detail as any).receipt_data.payment.received)}</div>
                <div>Change: {safeMoney((detail as any).receipt_data.payment.change)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Totals */}
      <div className="grid gap-2 text-sm justify-end">
        <div className="justify-self-end text-zinc-300">Subtotal: <span className="text-zinc-100">{safeMoney(detail.subtotal)}</span></div>
        <div className="justify-self-end text-zinc-300">Discounts: <span className="text-amber-300">-{safeMoney(detail.discount_total)}</span></div>
        <div className="justify-self-end text-zinc-300">Fees: <span className="text-zinc-100">{safeMoney(detail.fee_total)}</span></div>
        <div className="justify-self-end text-zinc-300">Tax: <span className="text-blue-300">{safeMoney(detail.tax_total)}</span></div>
        <div className="justify-self-end text-lg font-semibold">Total: <span>{safeMoney(detail.total)}</span></div>
      </div>

      {(detail as any)?.receipt_data?.totals && (
        <div className="rounded-xl border border-zinc-800">
          <div className="px-3 py-2 border-b border-zinc-800 text-sm text-zinc-300">Receipt breakdown</div>
          <div className="p-3 space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><span className="text-zinc-400">Subtotal:</span> <span className="text-zinc-100">{safeMoney((detail as any).receipt_data.totals?.subtotal)}</span></div>
              <div><span className="text-zinc-400">Discount:</span> <span className="text-amber-300">-{safeMoney((detail as any).receipt_data.totals?.discount)}</span></div>
              <div><span className="text-zinc-400">Fees:</span> <span className="text-zinc-100">{safeMoney((detail as any).receipt_data.totals?.fees)}</span></div>
              <div><span className="text-zinc-400">Tax:</span> <span className="text-blue-300">{safeMoney((detail as any).receipt_data.totals?.tax)}</span></div>
              <div className="col-span-2 md:col-span-4 justify-self-end font-medium">Grand total: <span className="text-zinc-100">{safeMoney((detail as any).receipt_data.totals?.grand_total)}</span></div>
            </div>

            {/* optional rule breakdowns */}
            {Array.isArray((detail as any).receipt_data.totals?.discount_by_rule) && (detail as any).receipt_data.totals.discount_by_rule.length > 0 && (
              <div>
                <div className="text-sm text-zinc-300 mb-1">Discounts by rule</div>
                <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                  {(detail as any).receipt_data.totals.discount_by_rule.map((d: any, i: number) => (
                    <div key={`disc-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="truncate">
                        <span className="font-medium">{d.name}</span>
                        {d.code ? <span className="text-xs text-zinc-500 ml-2">({d.code})</span> : null}
                      </div>
                      <div className="text-amber-300">-{safeMoney(d.amount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray((detail as any).receipt_data?.totalling) ? null : (
              <>
                {Array.isArray((detail as any).receipt_data.totals?.tax_by_rule) && (detail as any).receipt_data.totals.tax_by_rule.length > 0 && (
                  <div>
                    <div className="text-sm text-zinc-300 mb-1">Taxes by rule</div>
                    <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                      {(detail as any).receipt_data.totals.tax_by_rule.map((t: any, i: number) => (
                        <div key={`tax-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div className="truncate">
                            <span className="font-medium">{t.name}</span>
                            {t.code ? <span className="text-xs text-zinc-500 ml-2">({t.code})</span> : null}
                          </div>
                          <div className="text-blue-300">{safeMoney(t.amount)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
