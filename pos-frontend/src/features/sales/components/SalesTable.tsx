// pos-frontend/src/features/sales/components/SalesTable.tsx

import * as React from "react";
import type { SaleRow } from "../api";
import { useMoney } from "../useMoney";

export function SalesTable(props: {
  rows: SaleRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  count: number;
  lastPage: number;
  onOpenDetail: (id: number) => void;
  onPageChange: (n: number) => void;
  onPageSizeChange: (n: number) => void;
  onOpenReturns?: (id: number) => void;
}) {
  const {
    rows,
    loading,
    page,
    pageSize,
    count,
    lastPage,
    onOpenDetail,
    onPageChange,
    onPageSizeChange,
    onOpenReturns,
  } = props;
  const { safeMoney } = useMoney();

  return (
    <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Table Header */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100/80 border-b border-gray-200">
        <div className="grid grid-cols-[8rem_13rem_minmax(12rem,1fr)_6rem_minmax(3.5rem,auto)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(6rem,auto)] gap-4 px-6 py-3.5">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Receipt
          </div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Date & Time
          </div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Store / Cashier
          </div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Status
          </div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
            Lines
          </div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
            Subtotal
          </div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
            Discount
          </div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
            Tax
          </div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
            Total
          </div>
        </div>
      </div>

      {/* Table Body */}
      <div className="divide-y divide-gray-100">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm text-gray-500 font-medium">Loading sales...</span>
            </div>
          </div>
        )}

        {!loading &&
          rows.map((r, idx) => (
            <button
              key={r.id}
              className="w-full text-left grid grid-cols-[8rem_13rem_minmax(12rem,1fr)_6rem_minmax(3.5rem,auto)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(6rem,auto)] items-center gap-4 px-6 py-4 text-sm transition-all duration-150 hover:bg-blue-50/50 hover:shadow-sm group"
              onClick={() => onOpenDetail(r.id)}
            >
              {/* Receipt Number & Returns */}
              <div className="flex flex-col gap-1">
                <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  #{r.receipt_no || r.id}
                </div>
                {typeof onOpenReturns === "function" && (
                  <div className="text-[11px] leading-tight">
                    {(r as any).total_returns > 0 ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 font-medium hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReturns(r.id);
                        }}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        {(r as any).total_returns} {(r as any).total_returns === 1 ? 'return' : 'returns'}
                      </button>
                    ) : (
                      <span className="text-gray-400 font-normal">No returns</span>
                    )}
                  </div>
                )}
              </div>

              {/* Date & Time */}
              <div className="flex flex-col gap-0.5">
                <div className="text-gray-900 font-medium">
                  {new Date(r.created_at).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(r.created_at).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </div>
              </div>

              {/* Store & Cashier */}
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {r.store_name || "—"}
                </div>
                <div className="text-xs text-gray-500 truncate flex items-center gap-1.5">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {r.cashier_name || "—"}
                </div>
              </div>

              {/* Status */}
              <div className="flex justify-start">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                    r.status === "completed"
                      ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-600/20"
                      : r.status === "pending"
                      ? "bg-amber-100 text-amber-700 ring-1 ring-amber-600/20"
                      : r.status === "void"
                      ? "bg-red-100 text-red-700 ring-1 ring-red-600/20"
                      : "bg-gray-100 text-gray-700 ring-1 ring-gray-600/20"
                  }`}
                >
                  {r.status === "completed" && (
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  {r.status === "pending" && (
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  )}
                  {r.status === "void" && (
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span className="capitalize">{r.status}</span>
                </span>
              </div>

              {/* Lines Count */}
              <div className="text-right">
                <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md text-xs font-semibold tabular-nums">
                  {r.lines_count}
                </span>
              </div>

              {/* Subtotal */}
              <div className="text-right text-gray-700 font-medium tabular-nums">
                {safeMoney(r.subtotal)}
              </div>

              {/* Discount */}
              <div className="text-right text-orange-600 font-medium tabular-nums">
                {r.discount_total > 0 ? `-${safeMoney(r.discount_total)}` : "—"}
              </div>

              {/* Tax */}
              <div className="text-right text-blue-600 font-medium tabular-nums">
                {safeMoney(r.tax_total)}
              </div>

              {/* Total */}
              <div className="text-right text-gray-900 font-bold tabular-nums text-base">
                {safeMoney(r.total)}
              </div>
            </button>
          ))}

        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-500 font-medium">No sales found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {count === 0 ? (
            <span className="font-medium">No results</span>
          ) : (
            <>
              <span className="text-gray-500">Showing</span>
              <span className="font-semibold text-gray-900">
                {Math.min((page - 1) * pageSize + 1, count)}–{Math.min(page * pageSize, count)}
              </span>
              <span className="text-gray-500">of</span>
              <span className="font-semibold text-gray-900">{count.toLocaleString()}</span>
              <span className="text-gray-500">sales</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-6">
          {/* Rows per page selector */}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-medium">Rows per page:</span>
            <select
              className="pl-3 pr-8 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer appearance-none bg-no-repeat bg-right"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1.25rem 1.25rem'
              }}
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
              }}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {/* Pagination controls */}
          <div className="flex items-center gap-1">
            <button
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 transition-colors"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              Previous
            </button>
            
            <div className="px-4 py-1.5 text-sm text-gray-700 font-medium min-w-[8rem] text-center">
              <span className="text-gray-900 font-semibold">Page {page}</span>
              <span className="text-gray-500 mx-1">of</span>
              <span className="text-gray-900 font-semibold">{lastPage}</span>
            </div>

            <button
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300 transition-colors"
              onClick={() => onPageChange(Math.min(lastPage, page + 1))}
              disabled={page >= lastPage}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}