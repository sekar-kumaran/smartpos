/**
 * SmartPOS AI – Offline-First Behavior Tests
 *
 * Verifies the guarantees that make the app safe to use without a network:
 *  1. Cart state is durable — survives async resets via localId stability.
 *  2. localId (sale dedup key) is stable across retry attempts and only
 *     rotates after an explicit clearCart(), preventing duplicate sales.
 *  3. Sale payloads constructed from cart state contain all required fields
 *     the backend needs to process and deduplicate submissions.
 *  4. Per-item GST is computed correctly before payload submission so
 *     offline-generated totals match what the backend would compute.
 */

import { useCartStore } from '../src/store/cartStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product, CreateSalePayload } from '../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeProduct = (id: number, price: number, gst = 18): Product => ({
  id,
  store_id:      1,
  name:          `Product ${id}`,
  sku:           `SKU-${id}`,
  unit:          'pcs',
  cost_price:    price * 0.6,
  selling_price: price,
  tax_rate:      gst,
  gst_rate:      gst,
  stock_qty:     100,
  min_stock_qty: 5,
  is_active:     true,
  created_at:    '2024-01-01T00:00:00Z',
});

const buildSalePayload = (): CreateSalePayload => {
  const s = useCartStore.getState();
  return {
    store_id:       s.storeId,
    customer_id:    s.customerId,
    items:          s.items.map(i => ({
      product_id: i.product.id,
      qty:        i.qty,
      unit_price: i.unit_price,
      discount:   i.discount,
    })),
    payment_method: s.paymentMethod,
    discount:       s.discount,
    local_id:       s.localId,
  };
};

const resetStore = (localId = 'stable-uuid-for-tests') =>
  useCartStore.setState({
    items: [], discount: 0, paymentMethod: 'cash',
    customerId: undefined, storeId: 1, localId,
  });

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

// ─── localId dedup semantics ──────────────────────────────────────────────────

describe('localId — deduplication across retries', () => {
  it('localId does not change when items are added', () => {
    const idBefore = useCartStore.getState().localId;
    useCartStore.getState().addItem(makeProduct(1, 100));
    useCartStore.getState().addItem(makeProduct(2, 200));
    expect(useCartStore.getState().localId).toBe(idBefore);
  });

  it('localId does not change when qty or discount is updated', () => {
    useCartStore.getState().addItem(makeProduct(1, 100));
    const idBefore = useCartStore.getState().localId;
    useCartStore.getState().updateQty(1, 5);
    useCartStore.getState().updateDiscount(1, 20);
    expect(useCartStore.getState().localId).toBe(idBefore);
  });

  it('localId does not change when payment method or customer is set', () => {
    const idBefore = useCartStore.getState().localId;
    useCartStore.getState().setPaymentMethod('upi');
    useCartStore.getState().setCustomer(42);
    expect(useCartStore.getState().localId).toBe(idBefore);
  });

  it('localId is identical across two sale payload builds for same cart', () => {
    useCartStore.getState().addItem(makeProduct(1, 100));
    // Simulate: first submission attempt fails (no network)
    const payload1 = buildSalePayload();
    // Simulate: second attempt (retry)
    const payload2 = buildSalePayload();
    // Same localId → backend treats both as the same sale (idempotent)
    expect(payload1.local_id).toBe(payload2.local_id);
  });

  it('localId rotates only after clearCart()', () => {
    const idBeforeSale = useCartStore.getState().localId;
    useCartStore.getState().addItem(makeProduct(1, 100));

    // Submission succeeded → clear cart
    useCartStore.getState().clearCart();

    const idNextSale = useCartStore.getState().localId;
    expect(idNextSale).not.toBe(idBeforeSale);
  });

  it('each clearCart() produces a unique localId for the next sale', () => {
    useCartStore.getState().clearCart();
    const id1 = useCartStore.getState().localId;
    useCartStore.getState().clearCart();
    const id2 = useCartStore.getState().localId;
    useCartStore.getState().clearCart();
    const id3 = useCartStore.getState().localId;

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });
});

// ─── Sale payload construction ────────────────────────────────────────────────

describe('sale payload construction', () => {
  it('payload contains all required fields', () => {
    useCartStore.getState().addItem(makeProduct(1, 100));
    const payload = buildSalePayload();

    expect(payload).toHaveProperty('store_id');
    expect(payload).toHaveProperty('items');
    expect(payload).toHaveProperty('payment_method');
    expect(payload).toHaveProperty('discount');
    expect(payload).toHaveProperty('local_id');
    expect(typeof payload.local_id).toBe('string');
    expect(payload.local_id).toBeTruthy();
  });

  it('payload items map product_id, qty, unit_price, discount correctly', () => {
    useCartStore.getState().addItem(makeProduct(7, 150));
    useCartStore.getState().updateQty(7, 3);
    useCartStore.getState().updateDiscount(7, 10);

    const payload = buildSalePayload();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toEqual({
      product_id: 7,
      qty:        3,
      unit_price: 150,
      discount:   10,
    });
  });

  it('payload reflects correct payment_method', () => {
    useCartStore.getState().setPaymentMethod('credit');
    const payload = buildSalePayload();
    expect(payload.payment_method).toBe('credit');
  });

  it('payload includes customer_id when set', () => {
    useCartStore.getState().setCustomer(55);
    const payload = buildSalePayload();
    expect(payload.customer_id).toBe(55);
  });

  it('payload customer_id is undefined when no customer selected', () => {
    const payload = buildSalePayload();
    expect(payload.customer_id).toBeUndefined();
  });

  it('payload cart-level discount matches setDiscount value', () => {
    useCartStore.getState().addItem(makeProduct(1, 200));
    useCartStore.getState().setDiscount(25);
    expect(buildSalePayload().discount).toBe(25);
  });

  it('empty cart produces empty items array (no null/undefined)', () => {
    const payload = buildSalePayload();
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items).toHaveLength(0);
  });

  it('multi-product payload preserves order', () => {
    useCartStore.getState().addItem(makeProduct(10, 100));
    useCartStore.getState().addItem(makeProduct(20, 200));
    useCartStore.getState().addItem(makeProduct(30, 300));
    const ids = buildSalePayload().items.map(i => i.product_id);
    expect(ids).toEqual([10, 20, 30]);
  });
});

// ─── GST computation (offline totals) ────────────────────────────────────────

describe('GST computation for offline receipt', () => {
  it('5% GST on ₹100 item = ₹5 tax', () => {
    useCartStore.getState().addItem(makeProduct(1, 100, 5));
    expect(useCartStore.getState().taxAmount()).toBeCloseTo(5, 2);
  });

  it('12% GST on ₹200 item = ₹24 tax', () => {
    useCartStore.getState().addItem(makeProduct(1, 200, 12));
    expect(useCartStore.getState().taxAmount()).toBeCloseTo(24, 2);
  });

  it('18% GST on ₹275 item = ₹49.50 tax', () => {
    useCartStore.getState().addItem(makeProduct(1, 275, 18));
    expect(useCartStore.getState().taxAmount()).toBeCloseTo(49.5, 2);
  });

  it('mixed GST rates accumulate correctly', () => {
    useCartStore.getState().addItem(makeProduct(1, 100, 5));   // tax = 5
    useCartStore.getState().addItem(makeProduct(2, 200, 18));  // tax = 36
    expect(useCartStore.getState().taxAmount()).toBeCloseTo(41, 2);
  });

  it('totalAmount = subtotal + tax − cartDiscount', () => {
    useCartStore.getState().addItem(makeProduct(1, 100, 0));
    useCartStore.getState().addItem(makeProduct(2, 200, 0));
    useCartStore.getState().setDiscount(30);
    // 300 + 0 − 30 = 270
    expect(useCartStore.getState().totalAmount()).toBeCloseTo(270, 2);
  });

  it('per-item discount reduces taxable base', () => {
    useCartStore.getState().addItem(makeProduct(1, 100, 18));
    useCartStore.getState().updateDiscount(1, 10);
    // line_total after discount = 90; tax = 18% of 90 = 16.2
    expect(useCartStore.getState().taxAmount()).toBeCloseTo(16.2, 2);
  });
});

// ─── AsyncStorage mock integration ───────────────────────────────────────────

describe('AsyncStorage mock', () => {
  it('setItem can be inspected via jest mock', async () => {
    const mock = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
    await AsyncStorage.setItem('test-key', 'test-value');
    expect(mock.setItem).toHaveBeenCalledWith('test-key', 'test-value');
  });

  it('getItem returns null for unknown key', async () => {
    const val = await AsyncStorage.getItem('no-such-key');
    expect(val).toBeNull();
  });

  it('getItem returns previously set value', async () => {
    await AsyncStorage.setItem('k', 'v');
    const val = await AsyncStorage.getItem('k');
    expect(val).toBe('v');
  });
});
