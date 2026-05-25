/**
 * SmartPOS AI – Billing Screen
 * Product search → animated cart → payment → receipt.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import api from '../services/api';
import {useCartStore}  from '../store/cartStore';
import {useAuth}       from '../store/AuthContext';
import {CreateSalePayload, Customer, Paginated, PaymentMethod, Product, Sale} from '../types';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';
import {formatCurrency} from '../utils/format';
import {
  AnimatedPressable,
  SearchBar,
  EmptyState,
  SkeletonProductCard,
  SkeletonListItem,
} from '../components/ui';

export const BillingScreen: React.FC<{navigation: any}> = () => {
  const {user}  = useAuth();
  const cart    = useCartStore();
  const {width} = useWindowDimensions();
  const isMobile = width < 640;

  const [products,       setProducts]       = useState<Product[]>([]);
  const [search,         setSearch]         = useState('');
  const [loading,        setLoading]        = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [showCheckout,   setShowCheckout]   = useState(false);
  const [lastSale,       setLastSale]       = useState<Sale | null>(null);
  const [showReceipt,    setShowReceipt]    = useState(false);
  const [showScanner,    setShowScanner]    = useState(false);
  const [showCart,       setShowCart]       = useState(false);
  const [voiceBanner,    setVoiceBanner]    = useState<string | null>(null);

  // ─── Customer + Price Category ─────────────────────────────────────
  const [selectedCustomer,    setSelectedCustomer]    = useState<Customer | null>(null);
  const [showCustomerPicker,  setShowCustomerPicker]  = useState(false);
  const [customerSearch,      setCustomerSearch]      = useState('');
  const [customerResults,     setCustomerResults]     = useState<Customer[]>([]);
  const [customerLoading,     setCustomerLoading]     = useState(false);

  // ─── Customer search ──────────────────────────────────────────────

  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setCustomerResults([]); return; }
    setCustomerLoading(true);
    try {
      const res = await api.get<{items: Customer[]}>('/credit/customers', {
        params: {store_id: user?.store_id ?? 1, search: q.trim(), page_size: 20},
      });
      setCustomerResults(res.data.items ?? []);
    } catch {
      setCustomerResults([]);
    } finally {
      setCustomerLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 350);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    cart.setCustomer(c.id);
    setShowCustomerPicker(false);
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    cart.setCustomer(undefined);
  };

  // ─── Load products ────────────────────────────────────────────────

  const loadProducts = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const params: Record<string, any> = {store_id: user?.store_id ?? 1, page_size: 50};
      if (query.trim()) params.search = query.trim();
      const res = await api.get<Paginated<Product>>('/inventory/products', {params});
      setProducts(res.data.items);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {loadProducts();}, [loadProducts]);

  useEffect(() => {
    const timer = setTimeout(() => loadProducts(search), 400);
    return () => clearTimeout(timer);
  }, [search, loadProducts]);

  // Consume pending voice items once the product list is ready
  useEffect(() => {
    const pending = cart.pendingVoiceItems;
    if (!pending || pending.length === 0 || products.length === 0) return;

    let added = 0;
    for (const vi of pending) {
      // Try matched_id first (backend already resolved it)
      let match = vi.matched_id
        ? products.find(p => p.id === vi.matched_id)
        : undefined;

      // Fall back to fuzzy name match
      if (!match) {
        const name = vi.product_name.toLowerCase();
        match =
          products.find(p => p.name.toLowerCase() === name) ??
          products.find(p => p.name.toLowerCase().includes(name)) ??
          products.find(p => name.includes(p.name.toLowerCase()));
      }

      if (match) {
        cart.addItemWithQty(match, Math.round(vi.quantity || 1));
        added++;
      }
    }

    cart.setPendingVoiceItems(null);

    if (added > 0) {
      setVoiceBanner(`Added ${added} item${added > 1 ? 's' : ''} from voice`);
      const t = setTimeout(() => setVoiceBanner(null), 4000);
      return () => clearTimeout(t);
    }
  }, [products, cart.pendingVoiceItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Checkout ─────────────────────────────────────────────────────

  const handleCheckout = async (paymentMethod: PaymentMethod, amountPaid?: number) => {
    if (cart.items.length === 0) {
      Alert.alert('Empty Cart', 'Add at least one product before checking out.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateSalePayload = {
        store_id:       user?.store_id ?? 1,
        customer_id:    cart.customerId,
        payment_method: paymentMethod,
        discount:       cart.discount,
        amount_paid:    amountPaid,
        local_id:       cart.localId,
        items: cart.items.map(i => ({
          product_id: i.product.id,
          qty:        i.qty,
          unit_price: i.unit_price,
          discount:   i.discount,
        })),
      };
      const res = await api.post<Sale>('/billing/sales', payload);
      setLastSale(res.data);
      setShowCheckout(false);
      setShowReceipt(true);
      cart.clearCart();
    } catch (err: any) {
      Alert.alert('Checkout Failed', err?.response?.data?.detail || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const itemCount = cart.itemCount();

  // ─── Product panel ────────────────────────────────────────────────

  // Live-filter products for dropdown (client-side, instant)
  const dropdownItems = search.trim().length > 0
    ? products.filter(p => {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false) ||
          (p.default_barcode?.includes(q) ?? false)
        );
      }).slice(0, 8)
    : [];

  const productPanel = (
    <View style={isMobile ? styles.productPanelMobile : styles.productPanel}>
      {/* Customer selector bar */}
      {selectedCustomer ? (
        <View style={styles.customerBar}>
          <View style={styles.customerBarLeft}>
            <Text style={styles.customerBarIcon}>👤</Text>
            <View>
              <Text style={styles.customerBarName}>{selectedCustomer.name}</Text>
              {selectedCustomer.price_category_name ? (
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>
                    🏷 {selectedCustomer.price_category_name}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <TouchableOpacity onPress={clearCustomer} style={styles.customerBarClear}>
            <Text style={styles.customerBarClearText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.customerSelectBtn}
          onPress={() => setShowCustomerPicker(true)}
          activeOpacity={0.8}>
          <Text style={styles.customerSelectIcon}>👤</Text>
          <Text style={styles.customerSelectText}>Add Customer (for tier pricing)</Text>
          <Text style={styles.customerSelectChevron}>›</Text>
        </TouchableOpacity>
      )}

      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search product or barcode…"
          loading={loading}
          onScan={() => setShowScanner(true)}
          style={styles.searchBar}
        />
      </View>

      {/* Search dropdown — instant local filter while typing */}
      {dropdownItems.length > 0 && (
        <View style={styles.searchDropdown}>
          {dropdownItems.map(p => {
            const oos = (p.total_stock ?? p.stock_qty) <= 0;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.dropdownItem, oos && styles.dropdownItemOos]}
                onPress={() => {
                  if (!oos) {
                    cart.addItem(p);
                    setSearch('');
                  }
                }}
                activeOpacity={0.75}>
                <View style={styles.dropdownItemLeft}>
                  <Text style={styles.dropdownItemName} numberOfLines={1}>{p.name}</Text>
                  {p.sku ? (
                    <Text style={styles.dropdownItemSku}>SKU: {p.sku}</Text>
                  ) : null}
                </View>
                <View style={styles.dropdownItemRight}>
                  <Text style={styles.dropdownItemPrice}>
                    {formatCurrency(p.selling_price)}
                  </Text>
                  <Text style={[
                    styles.dropdownItemStock,
                    oos && {color: colors.error},
                  ]}>
                    {oos ? 'Out of stock' : `${p.total_stock ?? p.stock_qty} ${p.unit}`}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {loading && products.length === 0 ? (
        <View style={styles.skeletonGrid}>
          <SkeletonProductCard />
          <SkeletonProductCard />
          <SkeletonProductCard />
          <SkeletonProductCard />
          <SkeletonProductCard />
          <SkeletonProductCard />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={p => String(p.id)}
          showsVerticalScrollIndicator={false}
          numColumns={2}
          columnWrapperStyle={styles.productGrid}
          contentContainerStyle={[
            styles.productListContent,
            isMobile && {paddingBottom: 80},
          ]}
          ListEmptyComponent={
            <EmptyState
              icon="🔍"
              title="No products found"
              subtitle={search ? `No results for "${search}"` : 'Add products in Inventory first.'}
              compact
            />
          }
          renderItem={({item}) => (
            <ProductCard
              product={item}
              onAdd={() => cart.addItem(item)}
            />
          )}
        />
      )}
    </View>
  );

  // ─── Cart panel ───────────────────────────────────────────────────

  const cartPanel = (
    <View style={styles.cartPanel}>
      <CartHeader itemCount={itemCount} />

      {cart.items.length === 0 ? (
        <View style={styles.emptyCart}>
          <Text style={styles.emptyCartIcon}>🛒</Text>
          <Text style={styles.emptyCartText}>Cart is empty</Text>
          <Text style={styles.emptyCartSub}>Tap any product to add it</Text>
        </View>
      ) : (
        <FlatList
          data={cart.items}
          keyExtractor={i => String(i.product.id)}
          showsVerticalScrollIndicator={false}
          style={styles.cartList}
          renderItem={({item}) => (
            <CartItemRow
              item={item}
              onQtyChange={qty => cart.updateQty(item.product.id, qty)}
              onRemove={() => cart.removeItem(item.product.id)}
            />
          )}
        />
      )}

      <View style={styles.totalsBox}>
        <TotalRow label="Subtotal" value={formatCurrency(cart.subtotal())} />
        <TotalRow label="Tax"      value={formatCurrency(cart.taxAmount())} />
        {cart.discount > 0 && (
          <TotalRow
            label="Discount"
            value={`– ${formatCurrency(cart.discount)}`}
            valueColor={colors.success}
          />
        )}
        <View style={styles.totalDivider} />
        <TotalRow label="TOTAL" value={formatCurrency(cart.totalAmount())} bold />
      </View>

      <AnimatedPressable
        style={[styles.checkoutBtn, cart.items.length === 0 && styles.checkoutBtnDisabled]}
        onPress={() => { setShowCart(false); setShowCheckout(true); }}
        disabled={cart.items.length === 0}
        scaleDown={0.97}>
        <Text style={styles.checkoutBtnText}>Checkout  →</Text>
      </AnimatedPressable>
    </View>
  );

  return (
    <View style={styles.root}>

      {/* Voice-added items banner */}
      {voiceBanner && (
        <TouchableOpacity
          style={styles.voiceBanner}
          onPress={() => setVoiceBanner(null)}
          activeOpacity={0.85}>
          <Text style={styles.voiceBannerText}>🎙️ {voiceBanner} — tap to dismiss</Text>
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        {isMobile ? (
          <>
            {productPanel}

            {/* Floating animated cart bar */}
            <FloatingCartBar
              itemCount={itemCount}
              total={cart.totalAmount()}
              onPress={() => setShowCart(true)}
            />

            {/* Mobile cart bottom sheet */}
            <Modal
              visible={showCart}
              transparent
              animationType="slide"
              onRequestClose={() => setShowCart(false)}>
              <View style={styles.cartSheetOverlay}>
                <TouchableOpacity
                  style={styles.cartSheetBackdrop}
                  onPress={() => setShowCart(false)}
                  activeOpacity={1}
                />
                <View style={styles.cartSheet}>
                  <View style={styles.cartSheetHandle} />
                  {cartPanel}
                </View>
              </View>
            </Modal>
          </>
        ) : (
          <>
            {productPanel}
            {cartPanel}
          </>
        )}
      </View>

      {/* Customer Picker Modal */}
      <Modal
        visible={showCustomerPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomerPicker(false)}>
        <View style={styles.cpOverlay}>
          <TouchableOpacity
            style={styles.cpBackdrop}
            onPress={() => setShowCustomerPicker(false)}
            activeOpacity={1}
          />
          <View style={styles.cpSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.cpTitle}>Select Customer</Text>
            <TextInput
              style={styles.cpSearchInput}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Search by name or phone…"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            {customerLoading ? (
              <View style={styles.cpLoadingRow}>
                <SkeletonListItem />
                <SkeletonListItem />
              </View>
            ) : customerResults.length === 0 && customerSearch.length > 0 ? (
              <Text style={styles.cpEmpty}>No customers found.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={styles.cpList}>
                {customerResults.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.cpItem}
                    onPress={() => selectCustomer(c)}
                    activeOpacity={0.8}>
                    <View style={styles.cpItemLeft}>
                      <Text style={styles.cpItemName}>{c.name}</Text>
                      {c.phone ? (
                        <Text style={styles.cpItemPhone}>{c.phone}</Text>
                      ) : null}
                    </View>
                    {c.price_category_name ? (
                      <View style={styles.cpCategoryBadge}>
                        <Text style={styles.cpCategoryBadgeText}>
                          {c.price_category_name}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {customerSearch.length === 0 && (
              <Text style={styles.cpHint}>Type a customer name or phone number to search</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Scanner Modal */}
      <ScannerModal
        visible={showScanner}
        onDetect={code => { setSearch(code); setShowScanner(false); }}
        onClose={() => setShowScanner(false)}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        visible={showCheckout}
        total={cart.totalAmount()}
        onClose={() => setShowCheckout(false)}
        onConfirm={handleCheckout}
        submitting={submitting}
      />

      {/* Receipt Modal */}
      {lastSale && (
        <ReceiptModal
          visible={showReceipt}
          sale={lastSale}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </View>
  );
};

// ─── Floating Cart Bar ────────────────────────────────────────────────────────

const FloatingCartBar: React.FC<{
  itemCount: number;
  total:     number;
  onPress:   () => void;
}> = ({itemCount, total, onPress}) => {
  const translateY = useRef(new Animated.Value(80)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;
  const prevCount  = useRef(0);

  // Slide in / out
  useEffect(() => {
    Animated.spring(translateY, {
      toValue:         itemCount > 0 ? 0 : 80,
      useNativeDriver: true,
      speed:           18,
      bounciness:      6,
    }).start();
  }, [itemCount > 0, translateY]);

  // Pulse badge on count change
  useEffect(() => {
    if (itemCount !== prevCount.current && itemCount > 0) {
      prevCount.current = itemCount;
      Animated.sequence([
        Animated.spring(badgeScale, {toValue: 1.4, useNativeDriver: true, speed: 60, bounciness: 0}),
        Animated.spring(badgeScale, {toValue: 1,   useNativeDriver: true, speed: 30, bounciness: 8}),
      ]).start();
    }
  }, [itemCount, badgeScale]);

  return (
    <Animated.View style={[styles.floatingCart, {transform: [{translateY}]}]}>
      <TouchableOpacity
        style={styles.floatingCartInner}
        onPress={onPress}
        activeOpacity={0.92}>
        <Animated.View style={[styles.floatingCartBadge, {transform: [{scale: badgeScale}]}]}>
          <Text style={styles.floatingCartBadgeText}>{itemCount}</Text>
        </Animated.View>
        <Text style={styles.floatingCartLabel}>View Cart</Text>
        <Text style={styles.floatingCartTotal}>{formatCurrency(total)}</Text>
        <Text style={styles.floatingCartArrow}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Cart Header ─────────────────────────────────────────────────────────────

const CartHeader: React.FC<{itemCount: number}> = ({itemCount}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const prev  = useRef(0);

  useEffect(() => {
    if (itemCount !== prev.current) {
      prev.current = itemCount;
      Animated.sequence([
        Animated.spring(scale, {toValue: 1.3, useNativeDriver: true, speed: 80, bounciness: 0}),
        Animated.spring(scale, {toValue: 1,   useNativeDriver: true, speed: 40, bounciness: 6}),
      ]).start();
    }
  }, [itemCount, scale]);

  return (
    <View style={styles.cartHeader}>
      <Text style={styles.cartTitle}>Cart</Text>
      {itemCount > 0 && (
        <Animated.View style={[styles.cartBadge, {transform: [{scale}]}]}>
          <Text style={styles.cartBadgeText}>{itemCount}</Text>
        </Animated.View>
      )}
    </View>
  );
};

// ─── Product Card ─────────────────────────────────────────────────────────────

const ProductCard: React.FC<{product: Product; onAdd: () => void}> = ({product, onAdd}) => {
  const isOOS   = product.stock_qty === 0;
  const isLow   = !isOOS && product.stock_qty <= product.min_stock_qty;
  const flash   = useRef(new Animated.Value(0)).current;

  const handleAdd = () => {
    if (isOOS) return;
    onAdd();
    // Flash green border on add
    Animated.sequence([
      Animated.timing(flash, {toValue: 1, duration: 100, useNativeDriver: false}),
      Animated.timing(flash, {toValue: 0, duration: 400, useNativeDriver: false}),
    ]).start();
  };

  const borderColor = flash.interpolate({
    inputRange:  [0, 1],
    outputRange: [colors.border, colors.success],
  });

  return (
    <AnimatedPressable
      style={[styles.productCardWrapper, isOOS && styles.productCardOOS]}
      onPress={handleAdd}
      disabled={isOOS}
      scaleDown={0.94}>
      <Animated.View style={[styles.productCard, {borderColor}]}>
        {isOOS && (
          <View style={styles.oosBadge}>
            <Text style={styles.oosBadgeText}>Out of Stock</Text>
          </View>
        )}
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.productPrice}>{formatCurrency(product.selling_price)}</Text>
        <View style={styles.productFooter}>
          {isOOS ? (
            <Text style={[styles.stockText, {color: colors.error}]}>—</Text>
          ) : isLow ? (
            <View style={styles.stockBadge}>
              <Text style={[styles.stockBadgeText, {color: colors.warning}]}>
                Low · {product.stock_qty}
              </Text>
            </View>
          ) : (
            <Text style={[styles.stockText, {color: colors.textMuted}]}>
              Qty: {product.stock_qty}
            </Text>
          )}
          {!isOOS && (
            <View style={styles.addHint}>
              <Text style={styles.addHintText}>+</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </AnimatedPressable>
  );
};

// ─── Cart Item Row ────────────────────────────────────────────────────────────

const CartItemRow: React.FC<{
  item: {product: Product; qty: number; unit_price: number; line_total: number};
  onQtyChange: (qty: number) => void;
  onRemove: () => void;
}> = ({item, onQtyChange, onRemove}) => (
  <View style={styles.cartRow}>
    <View style={styles.cartRowInfo}>
      <Text style={styles.cartItemName} numberOfLines={1}>{item.product.name}</Text>
      <Text style={styles.cartItemPrice}>{formatCurrency(item.unit_price)} each</Text>
    </View>
    <View style={styles.qtyControls}>
      <TouchableOpacity
        style={styles.qtyBtn}
        onPress={() => onQtyChange(item.qty - 1)}
        hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
        <Text style={styles.qtyBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.qtyText}>{item.qty}</Text>
      <TouchableOpacity
        style={[styles.qtyBtn, styles.qtyBtnAdd]}
        onPress={() => onQtyChange(item.qty + 1)}
        hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}>
        <Text style={[styles.qtyBtnText, {color: colors.primary}]}>+</Text>
      </TouchableOpacity>
    </View>
    <Text style={styles.lineTotal}>{formatCurrency(item.line_total)}</Text>
    <TouchableOpacity
      onPress={onRemove}
      style={styles.removeBtn}
      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
      <Text style={styles.removeBtnText}>✕</Text>
    </TouchableOpacity>
  </View>
);

// ─── Total Row ────────────────────────────────────────────────────────────────

const TotalRow: React.FC<{
  label: string; value: string; bold?: boolean; valueColor?: string;
}> = ({label, value, bold, valueColor}) => (
  <View style={styles.totalRow}>
    <Text style={[styles.totalLabel, bold && styles.totalBold]}>{label}</Text>
    <Text style={[styles.totalValue, bold && styles.totalBold, valueColor ? {color: valueColor} : null]}>
      {value}
    </Text>
  </View>
);

// ─── Checkout Modal ───────────────────────────────────────────────────────────

const CheckoutModal: React.FC<{
  visible:    boolean;
  total:      number;
  onClose:    () => void;
  onConfirm:  (method: PaymentMethod, amountPaid?: number) => void;
  submitting: boolean;
}> = ({visible, total, onClose, onConfirm, submitting}) => {
  const [method,     setMethod]     = useState<PaymentMethod>('cash');
  const [amountPaid, setAmountPaid] = useState('');

  useEffect(() => {
    if (visible) setAmountPaid(total.toFixed(2));
  }, [visible, total]);

  const PAYMENT_METHODS: {key: PaymentMethod; label: string; icon: string}[] = [
    {key: 'cash',   label: 'Cash',   icon: '💵'},
    {key: 'upi',    label: 'UPI',    icon: '📱'},
    {key: 'card',   label: 'Card',   icon: '💳'},
    {key: 'credit', label: 'Credit', icon: '📒'},
  ];

  const parsed   = parseFloat(amountPaid);
  const change   = parsed > total ? parsed - total : 0;
  const isCredit = method === 'credit';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <Text style={styles.modalTitle}>Complete Payment</Text>
          <Text style={styles.modalTotalAmt}>{formatCurrency(total)}</Text>

          <Text style={styles.modalLabel}>Payment Method</Text>
          <View style={styles.methodGrid}>
            {PAYMENT_METHODS.map(m => (
              <AnimatedPressable
                key={m.key}
                style={[styles.methodBtn, method === m.key && styles.methodBtnActive]}
                onPress={() => setMethod(m.key)}
                scaleDown={0.95}>
                <Text style={styles.methodIcon}>{m.icon}</Text>
                <Text style={[styles.methodLabel, method === m.key && {color: '#fff'}]}>
                  {m.label}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          {!isCredit && (
            <View style={styles.amountSection}>
              <Text style={styles.modalLabel}>Amount Received (₹)</Text>
              <TextInput
                style={styles.amountInput}
                value={amountPaid}
                onChangeText={setAmountPaid}
                keyboardType="numeric"
                selectTextOnFocus
                placeholderTextColor={colors.textMuted}
              />
              {change > 0 && (
                <View style={styles.changeBanner}>
                  <Text style={styles.changeText}>
                    💰 Return change: {formatCurrency(change)}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <AnimatedPressable
              style={[styles.confirmBtn, submitting && {opacity: 0.7}]}
              onPress={() => onConfirm(method, isCredit ? total : (parsed || total))}
              disabled={submitting}
              scaleDown={0.97}>
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>✓  Confirm Sale</Text>
              )}
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Receipt Modal ────────────────────────────────────────────────────────────

const ReceiptModal: React.FC<{visible: boolean; sale: Sale; onClose: () => void}> = (
  {visible, sale, onClose},
) => {
  const scale   = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.6);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale,   {toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10}),
        Animated.timing(opacity, {toValue: 1, duration: 200, useNativeDriver: true}),
      ]).start();
    }
  }, [visible, scale, opacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.receiptBox, {transform: [{scale}], opacity}]}>
          <View style={styles.successCircle}>
            <Text style={styles.successEmoji}>✓</Text>
          </View>
          <Text style={styles.receiptTitle}>Sale Complete!</Text>
          <Text style={styles.receiptInvoice}>{sale.invoice_number}</Text>
          <Text style={styles.receiptAmount}>{formatCurrency(sale.total_amount)}</Text>
          <View style={styles.receiptMethodBadge}>
            <Text style={styles.receiptMethod}>
              {sale.payment_method?.toUpperCase()}
            </Text>
          </View>
          {sale.amount_due > 0 && (
            <Text style={styles.receiptDue}>
              Credit due: {formatCurrency(sale.amount_due)}
            </Text>
          )}
          <AnimatedPressable
            style={styles.newSaleBtn}
            onPress={onClose}
            scaleDown={0.97}>
            <Text style={styles.newSaleBtnText}>+ New Sale</Text>
          </AnimatedPressable>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ─── Scanner Modal ────────────────────────────────────────────────────────────

const ScannerModal: React.FC<{
  visible:   boolean;
  onDetect:  (code: string) => void;
  onClose:   () => void;
}> = ({visible, onDetect, onClose}) => {
  const [scanning,    setScanning]    = useState(false);
  const [error,       setError]       = useState('');
  const [manualCode,  setManualCode]  = useState('');
  const [hasDetector, setHasDetector] = useState(false);

  const videoRef     = useRef<HTMLVideoElement | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const containerRef = useRef<any>(null);
  const animRef      = useRef<number>(0);

  const isWeb = typeof navigator !== 'undefined' && !!navigator.mediaDevices;

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current && containerRef.current) {
      try { containerRef.current.removeChild(videoRef.current); } catch {}
    }
    videoRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      stopCamera();
      setError('');
      setManualCode('');
      return;
    }
    if (!isWeb) return;

    const timer = setTimeout(() => {
      if (!containerRef.current) return;

      const hasBD = 'BarcodeDetector' in window;
      setHasDetector(hasBD);

      const video = document.createElement('video') as HTMLVideoElement;
      video.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;';
      video.autoplay    = true;
      video.playsInline = true;
      video.muted       = true;
      containerRef.current.appendChild(video);
      videoRef.current = video;

      navigator.mediaDevices
        .getUserMedia({video: {facingMode: {ideal: 'environment'}}})
        .then(stream => {
          if (!videoRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
          streamRef.current = stream;
          video.srcObject   = stream;
          setScanning(true);

          if (!hasBD) return;

          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'qr_code', 'code_128', 'code_39', 'upc_a', 'upc_e'],
          });
          const detect = async () => {
            if (!videoRef.current || video.readyState < 2) {
              animRef.current = requestAnimationFrame(detect);
              return;
            }
            try {
              const codes = await detector.detect(video);
              if (codes.length > 0) {
                onDetect(codes[0].rawValue);
                stopCamera();
                return;
              }
            } catch {}
            animRef.current = requestAnimationFrame(detect);
          };
          animRef.current = requestAnimationFrame(detect);
        })
        .catch((e: Error) => setError(e.message || 'Camera access denied'));
    }, 300);

    return () => {
      clearTimeout(timer);
      stopCamera();
    };
  }, [visible, isWeb, onDetect, stopCamera]);

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    onDetect(code);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={scanStyles.overlay}>
        <View style={scanStyles.sheet}>
          <View style={scanStyles.handle} />
          <Text style={scanStyles.title}>Scan Barcode</Text>

          {isWeb ? (
            <View style={scanStyles.viewfinder}>
              <View ref={containerRef} style={scanStyles.videoContainer} />
              {!scanning && !error && (
                <View style={scanStyles.loadingOverlay}>
                  <ActivityIndicator color="#fff" size="large" />
                  <Text style={scanStyles.loadingText}>Starting camera…</Text>
                </View>
              )}
              {scanning && !hasDetector && (
                <View style={scanStyles.noDetectorBanner}>
                  <Text style={scanStyles.noDetectorText}>
                    BarcodeDetector unavailable — use manual entry below
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={scanStyles.noCamera}>
              <Text style={scanStyles.noCameraIcon}>📷</Text>
              <Text style={scanStyles.noCameraText}>Camera scanning available on web build</Text>
            </View>
          )}

          {!!error && (
            <View style={scanStyles.errorBanner}>
              <Text style={scanStyles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          <Text style={scanStyles.orText}>— or enter barcode manually —</Text>
          <View style={scanStyles.manualRow}>
            <TextInput
              style={scanStyles.manualInput}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder="Enter barcode / SKU"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={submitManual}
              returnKeyType="search"
              autoFocus={!isWeb}
            />
            <TouchableOpacity
              style={[scanStyles.manualBtn, !manualCode.trim() && {opacity: 0.4}]}
              onPress={submitManual}
              disabled={!manualCode.trim()}>
              <Text style={scanStyles.manualBtnText}>Search</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={scanStyles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={scanStyles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Scanner Styles ──────────────────────────────────────────────────────────

const scanStyles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent:  'flex-end',
  },
  sheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    padding:              spacing.lg,
    paddingBottom:        spacing.xl + spacing.md,
    gap:                  spacing.sm,
  },
  handle: {
    width:           40,
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    radius.full,
    alignSelf:       'center',
    marginBottom:    spacing.sm,
  },
  title:        {...typography.h2, color: colors.text, textAlign: 'center'},
  viewfinder: {
    height:          220,
    borderRadius:    radius.lg,
    overflow:        'hidden',
    backgroundColor: '#000',
    position:        'relative',
  },
  videoContainer:   {width: '100%' as any, height: '100%' as any},
  loadingOverlay: {
    position:       'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems:     'center',
    gap:            spacing.sm,
  },
  loadingText:      {color: '#fff', ...typography.body2},
  noDetectorBanner: {
    position:        'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding:         spacing.xs,
  },
  noDetectorText: {...typography.caption, color: '#fff', textAlign: 'center'},
  noCamera: {
    height:          140,
    borderRadius:    radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth:     1,
    borderColor:     colors.border,
    justifyContent:  'center',
    alignItems:      'center',
    gap:             spacing.xs,
  },
  noCameraIcon: {fontSize: 36},
  noCameraText: {...typography.body2, color: colors.textMuted, textAlign: 'center'},
  errorBanner: {
    backgroundColor: colors.error + '15',
    borderRadius:    radius.sm,
    padding:         spacing.sm,
    borderWidth:     1,
    borderColor:     colors.error + '30',
  },
  errorText:    {...typography.caption, color: colors.error},
  orText:       {...typography.caption, color: colors.textMuted, textAlign: 'center'},
  manualRow:    {flexDirection: 'row', gap: spacing.xs},
  manualInput: {
    flex:              1,
    height:            46,
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: spacing.md,
    ...typography.body2,
    color:             colors.text,
  },
  manualBtn: {
    paddingHorizontal: spacing.md,
    height:            46,
    backgroundColor:   colors.primary,
    borderRadius:      radius.md,
    justifyContent:    'center',
    alignItems:        'center',
  },
  manualBtnText: {...typography.label, color: '#fff'},
  closeBtn: {
    height:          46,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    justifyContent:  'center',
    alignItems:      'center',
  },
  closeBtnText: {...typography.button, color: colors.textMuted},
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    flexDirection:   'column',
    backgroundColor: colors.background,
  },

  content: {
    flex:          1,
    flexDirection: 'row',
  },

  voiceBanner: {
    backgroundColor:   colors.primary,
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems:        'center',
    justifyContent:    'center',
  },
  voiceBannerText: {
    ...typography.body2,
    color:      '#fff',
    fontWeight: '600',
    textAlign:  'center',
  },

  // Product panel
  productPanelMobile: {
    flex:            1,
    backgroundColor: colors.background,
  },
  productPanel: {
    flex:             1.3,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor:  colors.background,
  },
  // Customer bar
  customerBar: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primaryFaint,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '30',
  },
  customerBarLeft:      {flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.xs},
  customerBarIcon:      {fontSize: 16},
  customerBarName:      {...typography.label, color: colors.primary, fontWeight: '700'},
  categoryBadge: {
    backgroundColor: colors.primary + '20',
    borderRadius:    radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf:       'flex-start',
    marginTop:       2,
  },
  categoryBadgeText: {...typography.caption, color: colors.primary, fontWeight: '700'},
  customerBarClear: {padding: spacing.xs},
  customerBarClearText: {...typography.label, color: colors.textMuted},
  customerSelectBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap:             spacing.xs,
  },
  customerSelectIcon:    {fontSize: 14},
  customerSelectText:    {...typography.caption, color: colors.textMuted, flex: 1},
  customerSelectChevron: {...typography.h3, color: colors.textMuted, fontSize: 18},

  // Search dropdown
  searchDropdown: {
    position:        'absolute',
    top:             126,          // below customerBar + searchWrap
    left:            0,
    right:           0,
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    marginHorizontal: spacing.sm,
    zIndex:          100,
    ...shadows.md,
    overflow:        'hidden',
  },
  dropdownItem: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap:               spacing.sm,
  },
  dropdownItemOos:   {opacity: 0.45},
  dropdownItemLeft:  {flex: 1},
  dropdownItemName:  {...typography.body2, color: colors.text, fontWeight: '600'},
  dropdownItemSku:   {...typography.caption, color: colors.textMuted},
  dropdownItemRight: {alignItems: 'flex-end'},
  dropdownItemPrice: {...typography.label, color: colors.primary, fontWeight: '700'},
  dropdownItemStock: {...typography.caption, color: colors.textMuted},

  // Customer Picker Modal
  cpOverlay:   {flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'},
  cpBackdrop:  {flex: 1},
  cpSheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    padding:              spacing.md,
    paddingBottom:        spacing.xl,
    maxHeight:            '70%',
  },
  modalHandle: {
    width:           40,
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    radius.full,
    alignSelf:       'center',
    marginBottom:    spacing.md,
  },
  cpTitle:       {...typography.h3, color: colors.text, marginBottom: spacing.sm},
  cpSearchInput: {
    height:            48,
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: spacing.md,
    ...typography.body1,
    color:             colors.text,
    marginBottom:      spacing.sm,
  },
  cpLoadingRow:  {gap: spacing.xs},
  cpList:        {maxHeight: 320},
  cpEmpty:       {...typography.body2, color: colors.textMuted, textAlign: 'center', padding: spacing.lg},
  cpHint:        {...typography.caption, color: colors.textMuted, textAlign: 'center', padding: spacing.md},
  cpItem: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap:               spacing.sm,
  },
  cpItemLeft:     {flex: 1},
  cpItemName:     {...typography.body2, color: colors.text, fontWeight: '700'},
  cpItemPhone:    {...typography.caption, color: colors.textMuted},
  cpCategoryBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   4,
    borderRadius:      radius.full,
    backgroundColor:   colors.accent + '20',
    borderWidth:       1,
    borderColor:       colors.accent + '40',
  },
  cpCategoryBadgeText: {...typography.caption, color: colors.accent, fontWeight: '700'},

  searchWrap: {
    padding:    spacing.sm,
    paddingTop: spacing.sm,
  },
  searchBar: {
    // extends SearchBar container
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.xs,
    padding:       spacing.xs,
  },
  productGrid:        {gap: spacing.xs, paddingHorizontal: spacing.xs},
  productListContent: {padding: spacing.xs, paddingBottom: spacing.lg},

  // Product card
  productCardWrapper: {
    flex:        1,
    marginBottom: spacing.xs,
  },
  productCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.sm + 2,
    borderWidth:     1.5,
    borderColor:     colors.border,
    minHeight:       96,
    justifyContent:  'space-between',
    ...shadows.xs,
  },
  productCardOOS: {opacity: 0.4},
  oosBadge: {
    position:        'absolute',
    top:             6,
    right:           6,
    backgroundColor: colors.error + '18',
    borderRadius:    radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex:          1,
  },
  oosBadgeText: {
    fontSize:   9,
    fontWeight: '700',
    color:      colors.error,
  },
  productName: {
    ...typography.label,
    color:      colors.text,
    marginBottom: 4,
    lineHeight:  18,
  },
  productPrice: {
    ...typography.body1,
    color:      colors.primary,
    fontWeight: '800',
  },
  productFooter: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      4,
  },
  stockText:  {...typography.caption, color: colors.textMuted},
  stockBadge: {
    backgroundColor: colors.warningFaint,
    borderRadius:    radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  stockBadgeText: {
    fontSize:   9,
    fontWeight: '700',
  },
  addHint: {
    width:           20,
    height:          20,
    borderRadius:    radius.full,
    backgroundColor: colors.primary + '18',
    alignItems:      'center',
    justifyContent:  'center',
  },
  addHintText: {
    color:      colors.primary,
    fontSize:   14,
    fontWeight: '800',
    lineHeight: 18,
  },

  // Cart panel
  cartPanel: {
    flex:            1,
    backgroundColor: colors.surface,
    padding:         spacing.sm,
    borderLeftWidth: 0,
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  spacing.sm,
    gap:           spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cartTitle: {
    ...typography.h3,
    color: colors.text,
    flex:  1,
  },
  cartBadge: {
    backgroundColor: colors.primary,
    borderRadius:    radius.full,
    width:           24,
    height:          24,
    justifyContent:  'center',
    alignItems:      'center',
  },
  cartBadgeText: {
    ...typography.caption,
    color:      '#fff',
    fontWeight: '700',
  },
  cartList: {flex: 1},
  emptyCart: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    gap:            spacing.xs,
    paddingBottom:  spacing.xxl,
  },
  emptyCartIcon: {fontSize: 44},
  emptyCartText: {...typography.h3, color: colors.textMuted},
  emptyCartSub:  {...typography.caption, color: colors.textMuted},

  cartRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap:               6,
  },
  cartRowInfo:  {flex: 1},
  cartItemName: {...typography.body2, color: colors.text, fontWeight: '600'},
  cartItemPrice: {...typography.caption, color: colors.textMuted, marginTop: 1},

  qtyControls: {flexDirection: 'row', alignItems: 'center', gap: 4},
  qtyBtn: {
    width:           28,
    height:          28,
    borderRadius:    radius.sm,
    backgroundColor: colors.surfaceAlt,
    justifyContent:  'center',
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     colors.border,
  },
  qtyBtnAdd: {
    backgroundColor: colors.primaryFaint,
    borderColor:     colors.primary + '40',
  },
  qtyBtnText: {...typography.body1, fontWeight: '800', color: colors.text},
  qtyText: {
    ...typography.body2,
    color:      colors.text,
    minWidth:   22,
    textAlign:  'center',
    fontWeight: '700',
  },
  lineTotal: {
    ...typography.body2,
    color:      colors.text,
    fontWeight: '700',
    minWidth:   52,
    textAlign:  'right',
  },
  removeBtn:     {padding: 4},
  removeBtnText: {color: colors.error, fontWeight: '700', fontSize: 14},

  // Totals
  totalsBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop:     spacing.sm,
    marginTop:      spacing.xs,
    gap:            3,
  },
  totalRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  totalLabel:   {...typography.body2, color: colors.textMuted},
  totalValue:   {...typography.body2, color: colors.text},
  totalBold:    {fontWeight: '800', fontSize: 15, color: colors.text},
  totalDivider: {height: 1, backgroundColor: colors.border, marginVertical: spacing.xs},

  checkoutBtn: {
    height:          52,
    backgroundColor: colors.primary,
    borderRadius:    radius.lg,
    justifyContent:  'center',
    alignItems:      'center',
    marginTop:       spacing.sm,
    ...shadows.colored(colors.primary),
  },
  checkoutBtnDisabled: {opacity: 0.35},
  checkoutBtnText:     {...typography.button, color: '#fff', fontSize: 16},

  // Floating cart bar
  floatingCart: {
    position: 'absolute',
    bottom:   12,
    left:     12,
    right:    12,
  },
  floatingCartInner: {
    height:          56,
    backgroundColor: colors.primary,
    borderRadius:    radius.lg,
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: spacing.md,
    gap:             spacing.sm,
    ...shadows.xl,
  },
  floatingCartBadge: {
    width:           28,
    height:          28,
    borderRadius:    radius.full,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  floatingCartBadgeText: {...typography.label, color: '#fff', fontWeight: '800'},
  floatingCartLabel:     {...typography.button, color: '#fff', flex: 1},
  floatingCartTotal:     {...typography.button, color: '#fff', fontWeight: '800'},
  floatingCartArrow:     {fontSize: 22, color: 'rgba(255,255,255,0.7)', fontWeight: '300'},

  // Mobile cart sheet
  cartSheetOverlay: {
    flex:            1,
    justifyContent:  'flex-end',
  },
  cartSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cartSheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight:            '80%',
    paddingTop:           spacing.sm,
  },
  cartSheetHandle: {
    width:           40,
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    radius.full,
    alignSelf:       'center',
    marginBottom:    spacing.sm,
  },

  // Checkout modal
  modalOverlay: {
    flex:            1,
    backgroundColor: colors.overlay,
    justifyContent:  'center',
    alignItems:      'center',
  },
  modalSheet: {
    width:           '92%',
    maxWidth:        460,
    backgroundColor: colors.surface,
    borderRadius:    radius.xl,
    padding:         spacing.lg,
    gap:             spacing.sm,
  },
  modalTitle:    {...typography.h2, color: colors.text, textAlign: 'center'},
  modalTotalAmt: {
    fontSize:      34,
    fontWeight:    '800',
    color:         colors.primary,
    textAlign:     'center',
    marginBottom:  spacing.xs,
  },
  modalLabel:    {...typography.label, color: colors.textMuted, marginTop: spacing.xs},
  methodGrid:    {flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap'},
  methodBtn: {
    flex:            1,
    minWidth:        '22%',
    paddingVertical: spacing.sm,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    alignItems:      'center',
    gap:             3,
    backgroundColor: colors.surfaceAlt,
  },
  methodBtnActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  methodIcon:      {fontSize: 18},
  methodLabel:     {...typography.caption, color: colors.text, fontWeight: '600'},
  amountSection:   {gap: spacing.xs},
  amountInput: {
    height:            52,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: spacing.md,
    ...typography.body1,
    color:             colors.text,
    backgroundColor:   colors.surfaceAlt,
    fontWeight:        '700',
  },
  changeBanner: {
    backgroundColor: colors.success + '15',
    borderRadius:    radius.sm,
    padding:         spacing.sm,
    borderWidth:     1,
    borderColor:     colors.success + '30',
  },
  changeText:   {...typography.body2, color: colors.successDark, fontWeight: '600'},
  modalActions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs},
  cancelBtn: {
    flex:           1,
    height:         50,
    borderRadius:   radius.lg,
    borderWidth:    1,
    borderColor:    colors.border,
    justifyContent: 'center',
    alignItems:     'center',
  },
  cancelBtnText: {...typography.button, color: colors.textMuted},
  confirmBtn: {
    flex:            1,
    height:          50,
    backgroundColor: colors.primary,
    borderRadius:    radius.lg,
    justifyContent:  'center',
    alignItems:      'center',
    ...shadows.colored(colors.primary),
  },
  confirmBtnText: {...typography.button, color: '#fff'},

  // Receipt
  receiptBox: {
    width:           '82%',
    maxWidth:        360,
    backgroundColor: colors.surface,
    borderRadius:    radius.xl,
    padding:         spacing.xl,
    alignItems:      'center',
    gap:             spacing.sm,
    ...shadows.xl,
  },
  successCircle: {
    width:           72,
    height:          72,
    borderRadius:    radius.full,
    backgroundColor: colors.success,
    alignItems:      'center',
    justifyContent:  'center',
    ...shadows.colored(colors.success),
  },
  successEmoji:       {fontSize: 34, color: '#fff', fontWeight: '800'},
  receiptTitle:       {...typography.h2, color: colors.text},
  receiptInvoice:     {...typography.caption, color: colors.textMuted},
  receiptAmount: {
    fontSize:   32,
    fontWeight: '800',
    color:      colors.text,
  },
  receiptMethodBadge: {
    backgroundColor:   colors.successFaint,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   5,
  },
  receiptMethod: {...typography.label, color: colors.success},
  receiptDue:    {...typography.body2, color: colors.error, fontWeight: '600'},
  newSaleBtn: {
    marginTop:         spacing.xs,
    backgroundColor:   colors.primary,
    borderRadius:      radius.lg,
    paddingVertical:   12,
    paddingHorizontal: spacing.xl,
    ...shadows.colored(colors.primary),
  },
  newSaleBtnText: {...typography.button, color: '#fff'},
});
