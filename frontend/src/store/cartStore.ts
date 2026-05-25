/**
 * SmartPOS AI - Cart Store (Zustand + AsyncStorage persistence)
 * Manages billing cart state with offline support.
 */

import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {CartItem, PaymentMethod, Product} from '../types';
import type {VoiceBillItem} from '../components/ui';
import 'react-native-get-random-values';
import {v4 as uuidv4} from 'uuid';

interface CartState {
  // State
  items:          CartItem[];
  discount:       number;
  paymentMethod:  PaymentMethod;
  customerId?:    number;
  storeId:        number;
  localId:        string;

  // Voice pre-fill: set by DashboardScreen, consumed by BillingScreen
  pendingVoiceItems: VoiceBillItem[] | null;

  // Computed
  subtotal:    () => number;
  taxAmount:   () => number;
  totalAmount: () => number;
  itemCount:   () => number;

  // Actions
  addItem:              (product: Product) => void;
  addItemWithQty:       (product: Product, qty: number) => void;
  removeItem:           (productId: number) => void;
  updateQty:            (productId: number, qty: number) => void;
  updateDiscount:       (productId: number, discount: number) => void;
  setDiscount:          (discount: number) => void;
  setPaymentMethod:     (method: PaymentMethod) => void;
  setCustomer:          (customerId?: number) => void;
  setStoreId:           (storeId: number) => void;
  clearCart:            () => void;
  setPendingVoiceItems: (items: VoiceBillItem[] | null) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items:             [],
      discount:          0,
      paymentMethod:     'cash',
      customerId:        undefined,
      storeId:           1,
      localId:           uuidv4(),
      pendingVoiceItems: null,

      subtotal: () =>
        get().items.reduce((sum, i) => sum + i.line_total, 0),

      taxAmount: () =>
        get().items.reduce((sum, i) => {
          const rate = i.product.tax_rate && i.product.tax_rate > 0
            ? i.product.tax_rate
            : i.product.gst_rate ?? 0;
          return sum + (i.line_total * (rate / 100));
        }, 0),

      totalAmount: () => {
        const s = get();
        return s.subtotal() + s.taxAmount() - s.discount;
      },

      itemCount: () =>
        get().items.reduce((sum, i) => sum + i.qty, 0),

      addItem: product => {
        set(state => {
          const existing = state.items.find(i => i.product.id === product.id);
          if (existing) {
            return {
              items: state.items.map(i =>
                i.product.id === product.id
                  ? {
                      ...i,
                      qty:        i.qty + 1,
                      line_total: (i.qty + 1) * i.unit_price - i.discount,
                    }
                  : i,
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                product,
                qty:        1,
                unit_price: product.selling_price,
                discount:   0,
                line_total: product.selling_price,
              },
            ],
          };
        });
      },

      addItemWithQty: (product, qty) => {
        if (qty <= 0) return;
        set(state => {
          const existing = state.items.find(i => i.product.id === product.id);
          if (existing) {
            const newQty = existing.qty + qty;
            return {
              items: state.items.map(i =>
                i.product.id === product.id
                  ? {...i, qty: newQty, line_total: newQty * i.unit_price - i.discount}
                  : i,
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                product,
                qty,
                unit_price: product.selling_price,
                discount:   0,
                line_total: qty * product.selling_price,
              },
            ],
          };
        });
      },

      removeItem: productId =>
        set(state => ({items: state.items.filter(i => i.product.id !== productId)})),

      updateQty: (productId, qty) => {
        if (qty <= 0) { get().removeItem(productId); return; }
        set(state => ({
          items: state.items.map(i =>
            i.product.id === productId
              ? {...i, qty, line_total: qty * i.unit_price - i.discount}
              : i,
          ),
        }));
      },

      updateDiscount: (productId, discount) =>
        set(state => ({
          items: state.items.map(i =>
            i.product.id === productId
              ? {...i, discount, line_total: i.qty * i.unit_price - discount}
              : i,
          ),
        })),

      setDiscount:          discount => set({discount}),
      setPaymentMethod:     paymentMethod => set({paymentMethod}),
      setCustomer:          customerId => set({customerId}),
      setStoreId:           storeId => set({storeId}),
      setPendingVoiceItems: items => set({pendingVoiceItems: items}),

      clearCart: () =>
        set({
          items:             [],
          discount:          0,
          paymentMethod:     'cash',
          customerId:        undefined,
          localId:           uuidv4(),
          pendingVoiceItems: null,
        }),
    }),
    {
      name:    'smartpos-cart',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        items:         state.items,
        discount:      state.discount,
        paymentMethod: state.paymentMethod,
        customerId:    state.customerId,
        storeId:       state.storeId,
        localId:       state.localId,
        // pendingVoiceItems intentionally NOT persisted — transient state
      }),
    },
  ),
);
