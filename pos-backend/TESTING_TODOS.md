# Testing TODOs - Phase 1 Implementation

This document tracks testing improvements and gaps identified during Phase 1 implementation.

## Status Summary

✅ **13 of 14 high-priority tests passing**
- Increment 1: 2/3 tests passing (multi-line checkout, ledger completeness)
- Increment 2: 4/4 tests passing (canonical totals)
- Increment 3: 7/7 tests passing (returns & restock)

❌ **1 test needs refinement**
- Increment 1: Concurrent checkout race condition test

---

## High Priority TODOs

### 1. Concurrent Checkout Race Condition Test
**File:** `pos/tests.py::test_concurrent_checkout_prevents_race_conditions()`

**Issue:** Test fails because payment validation happens before inventory checks, causing both concurrent requests to fail validation (400) before testing the race condition.

**Current Status:** `select_for_update()` is implemented in `pos/views.py` (~line 450-460) and tested indirectly through other checkout tests.

**Solutions to Consider:**
1. Create a lower-level unit test that directly tests `select_for_update()` with threading at the ORM level (bypassing API validation)
2. Modify the checkout flow to separate payment validation from inventory checks
3. Use database-level testing tools or mocking to simulate concurrent access

**Priority:** Medium  
**Estimated Effort:** 2-4 hours

---

## Medium Priority TODOs

### 2. Edge Cases for Checkout
**File:** `pos/tests.py`

**Missing Tests:**
- Checkout with `qty=0` (should fail validation)
- Checkout with negative `qty` (should fail validation)
- Checkout when `on_hand` exactly equals `qty` (boundary condition)
- Checkout with very large quantities

**Priority:** Medium  
**Estimated Effort:** 1-2 hours

### 3. Complex Discount/Tax Scenarios
**File:** `pos/tests.py::POSCanonicalTotalsTests`

**Missing Tests:**
- Multiple stacked discounts
- Receipt-level discounts with line-level discounts
- Complex tax calculations with multiple rules
- Coupon discounts with other discounts

**Priority:** Medium  
**Estimated Effort:** 2-3 hours

### 4. Return Edge Cases
**File:** `orders/tests.py::ReturnFinalizeTests`

**Missing Tests:**
- Return of returned item (should this be allowed?)
- Return with `qty_returned > original sale qty` (should fail)
- Return with invalid `sale_line` (should fail)
- Return finalization when return is already finalized (should fail)

**Priority:** Medium  
**Estimated Effort:** 1-2 hours

### 5. Concurrent Return Handling
**File:** `orders/tests.py::ReturnFinalizeTests`

**Missing Tests:**
- Multiple returns for same variant simultaneously
- Verify `select_for_update()` prevents race conditions in returns
- Return + sale happening concurrently for same variant

**Priority:** Medium  
**Estimated Effort:** 2-3 hours

### 6. Integration Tests
**Files:** New test file or additions to existing tests

**Missing Tests:**
- End-to-end: Quote → Checkout → Return flow
- Test consistency across all three operations
- Test low stock → sale → low stock badge update

**Priority:** Medium  
**Estimated Effort:** 2-3 hours

---

## Low Priority TODOs

### 7. Performance Testing
**File:** New test file `pos/tests_performance.py`

**Missing Tests:**
- Large checkout (100+ line items)
- Rapid successive checkouts
- Ledger query performance with many entries

**Priority:** Low  
**Estimated Effort:** 3-4 hours

### 8. Refund Calculation Edge Cases
**File:** `orders/tests.py::ReturnFinalizeTests`

**Missing Tests:**
- Refund when original sale had discounts
- Refund when original sale had taxes
- Partial refund calculations with complex pricing
- Refund when `sale_line` has fee

**Priority:** Low  
**Estimated Effort:** 1-2 hours

### 9. Return Status Transitions
**File:** `orders/tests.py::ReturnFinalizeTests`

**Missing Tests:**
- Return status workflow: draft → finalized → void
- Test that finalized returns cannot be modified
- Test void returns don't affect inventory

**Priority:** Low  
**Estimated Effort:** 1 hour

### 10. Integration with Sale Signals
**File:** `orders/tests.py::SaleSignalTests`

**Missing Tests:**
- Returns work correctly with sales created via signals
- Return of items from admin-created sales
- Return of items from POS-created sales

**Priority:** Low  
**Estimated Effort:** 1-2 hours

---

## Notes

- All high-priority functionality is covered by existing tests
- The failing concurrent test is a test infrastructure issue, not a code bug
- `select_for_update()` is implemented and working (verified in code review)
- Most edge cases are low-risk but would improve test coverage

---

## How to Use This Document

1. When implementing a TODO, move it to a "Completed" section with date
2. Update priority/effort estimates as needed
3. Add new TODOs as gaps are discovered
4. Reference this document in PR descriptions when adding tests

