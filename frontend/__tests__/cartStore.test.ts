/**
 * SmartPOS AI – Cart Store Unit Tests
 *
 * Covers: addItem, removeItem, updateQty, updateDiscount, setDiscount,
 *         setPaymentMethod, setCustomer, clearCart, computed values
 *         (subtotal, taxAmount, totalAmount, itemCount).
 */

import { useCartStore } from '../src/store/cartStore';
import type { Product } from '../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id:            1,
  store_id:      1,
  name:          'Test Atta 5kg',
  sku:           'SKU-ATTA-5KG',
  unit:          'bag',
  cost_price:    220,
  selling_price: 275,
  tax_rate:      5,
  gst_rate:      5,
  stock_qty:     50,
  min_stock_qty: 5,
  is_active:     true,
  created_at:    '2024-01-01T00:00:00Z',
  ...overrides,
});

const resetStore = () =>
  useCartStore.setState({
    items:         [],
    discount:      0,
    paymentMethod: 'cash',
    customerId:    undefined,
    storeId:       1,
    localId:       'test-uuid-seed',
  });

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with an empty cart', () => {
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });

  it('itemCount() is 0 when empty', () => {
    expect(useCartStore.getState().itemCount()).toBe(0);
  });

  it('subtotal() is 0 when empty', () => {
    expect(useCartStore.getState().subtotal()).toBe(0);
  });

  it('taxAmount() is 0 when empty', () => {
    expect(useCartStore.getState().taxAmount()).toBe(0);
  });

  it('totalAmount() is 0 when empty', () => {
    expect(useCartStore.getState().totalAmount()).toBe(0);
  });

  it('default paymentMethod is cash', () => {
    expect(useCartStore.getState().paymentMethod).toBe('cash');
  });

  it('default storeId is 1', () => {
    expect(useCartStore.getState().storeId).toBe(1);
  });
});

// ─── addItem ──────────────────────────────────────────────────────────────────

describe('addItem', () => {
  it('adds a product with qty 1', () => {
    const p = makeProduct({ id: 1, selling_price: 100 });
    useCartStore.getState().addItem(p);
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(1);
    expect(items[0].unit_price).toBe(100);
    expect(items[0].line_total).toBe(100);
  });

  it('increments qty when same product added again', () => {
    const p = makeProduct({ id: 1, selling_price: 100 });
    useCartStore.getState().addItem(p);
    useCartStore.getState().addItem(p);
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(2);
    expect(items[0].line_total).toBe(200);
  });

  it('adds distinct products as separate line items', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1 }));
    useCartStore.getState().addItem(makeProduct({ id: 2 }));
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('new item has zero discount', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1, selling_price: 100 }));
    expect(useCartStore.getState().items[0].discount).toBe(0);
  });
});

// ─── removeItem ───────────────────────────────────────────────────────────────

describe('removeItem', () => {
  it('removes the correct product', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1 }));
    useCartStore.getState().addItem(makeProduct({ id: 2 }));
    useCartStore.getState().removeItem(1);
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].product.id).toBe(2);
  });

  it('is a no-op for unknown product id', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1 }));
    useCartStore.getState().removeItem(999);
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});

// ─── updateQty ────────────────────────────────────────────────────────────────

describe('updateQty', () => {
  it('updates qty and recalculates line_total', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1, selling_price: 100 }));
    useCartStore.getState().updateQty(1, 4);
    const item = useCartStore.getState().items[0];
    expect(item.qty).toBe(4);
    expect(item.line_total).toBe(400);
  });

  it('removes item when qty set to 0', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1 }));
    useCartStore.getState().updateQty(1, 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('removes item when qty set to negative', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1 }));
    useCartStore.getState().updateQty(1, -5);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('respects existing line-level discount when recalculating', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1, selling_price: 100 }));
    useCartStore.getState().updateDiscount(1, 10);
    useCartStore.getState().updateQty(1, 3);
    // 3 × 100 - 10 = 290
    expect(useCartStore.getState().items[0].line_total).toBe(290);
  });
});

// ─── updateDiscount ───────────────────────────────────────────────────────────

describe('updateDiscount', () => {
  it('applies per-item discount and recalculates line_total', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1, selling_price: 100 }));
    useCartStore.getState().updateDiscount(1, 15);
    const item = useCartStore.getState().items[0];
    expect(item.discount).toBe(15);
    expect(item.line_total).toBe(85);
  });

  it('zero discount leaves line_total unchanged', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1, selling_price: 200 }));
    useCartStore.getState().updateDiscount(1, 0);
    expect(useCartStore.getState().items[0].line_total).toBe(200);
  });
});

// ─── Computed values ──────────────────────────────────────────────────────────

describe('computed values', () => {
  it('subtotal sums all line totals', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1, selling_price: 100, tax_rate: 0, gst_rate: 0 }));
    useCartStore.getState().addItem(makeProduct({ id: 2, selling_price: 200, tax_rate: 0 }));
    expect(useCartStore.getState().subtotal()).toBe(300);
  });

  it('itemCount sums qty across all products', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1 }));
    useCartStore.getState().addItem(makeProduct({ id: 1 })); // qty → 2
    useCartStore.getState().addItem(makeProduct({ id: 2 })); // qty 1
    expect(useCartStore.getState().itemCount()).toBe(3);
  });

  it('taxAmount calculates 18% on line_total', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1, selling_price: 100, tax_rate: 18 }));
    expect(useCartStore.getState().taxAmount()).toBeCloseTo(18, 2);
  });

  it('taxAmount falls back to gst_rate when tax_rate is 0', () => {
    useCartStore.getState().addItem(
      makeProduct({ id: 1, selling_price: 100, tax_rate: 0, gst_rate: 12 }),
    );
    expect(useCartStore.getState().taxAmount()).toBeCloseTo(12, 2);
  });

  it('taxAmount is 0 when both tax_rate and gst_rate are 0', () => {
    useCartStore.getState().addItem(
      makeProduct({ id: 1, selling_price: 100, tax_rate: 0, gst_rate: 0 }),
    );
    expect(useCartStore.getState().taxAmount()).toBe(0);
  });

  it('totalAmount = subtotal + taxAmount - cart discount', () => {
    useCartStore.getState().addItem(makeProduct({ id: 1, selling_price: 100, tax_rate: 0, gst_rate: 0 }));
    useCartStore.getState().setDiscount(10);
    // 100 + 0 - 10 = 90
    expect(useCartStore.getState().totalAmount()).toBe(90);
  });

  it('totalAmount never returns NaN for zero-item cart', () => {
    useCartStore.getState().setDiscount(0);
    expect(isNaN(useCartStore.getState().totalAmount())).toBe(false);
  });
});

// ─── setters ──────────────────────────────────────────────────────────────────

describe('setters', () => {
  it('setPaymentMethod updates method', () => {
    useCartStore.getState().setPaymentMethod('upi');
    expect(useCartStore.getState().paymentMethod).toBe('upi');
  });

  it('setCustomer updates customerId', () => {
    useCartStore.getState().setCustomer(42);
    expect(useCartStore.getState().customerId).toBe(42);
  });

  it('setCustomer(undefined) clears customerId', () => {
    useCartStore.getState().setCustomer(42);
    useCartStore.getState().setCustomer(undefined);
    expect(useCartStore.getState().customerId).toBeUndefined();
  });

  it('setDiscount sets cart-level discount', () => {
    useCartStore.getState().setDiscount(50);
    expect(useCartStore.getState().discount).toBe(50);
  });

  it('setStoreId updates storeId', () => {
    useCartStore.getState().setStoreId(3);
    expect(useCartStore.getState().storeId).toBe(3);
  });
});

// ─── clearCart ────────────────────────────────────────────────────────────────

describe('clearCart', () => {
  beforeEach(() => {
    useCartStore.getState().addItem(makeProduct({ id: 1, selling_price: 100 }));
    useCartStore.getState().setDiscount(20);
    useCartStore.getState().setPaymentMethod('card');
    useCartStore.getState().setCustomer(99);
  });

  it('empties the items array', () => {
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('resets discount to 0', () => {
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().discount).toBe(0);
  });

  it('resets paymentMethod to cash', () => {
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().paymentMethod).toBe('cash');
  });

  it('clears customerId', () => {
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().customerId).toBeUndefined();
  });

  it('preserves storeId', () => {
    useCartStore.getState().setStoreId(2);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().storeId).toBe(2);
  });

  it('generates a new localId on each clearCart', () => {
    const before = useCartStore.getState().localId;
    useCartStore.getState().clearCart();
    const after = useCartStore.getState().localId;
    expect(after).not.toBe(before);
  });
});
