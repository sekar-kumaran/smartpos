/**
 * SmartPOS AI – Inventory Screen
 * Product list with search, stock management, and health overview.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../services/api';
import {useAuth} from '../store/AuthContext';
import {InventoryHealth, Paginated, Product} from '../types';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';
import {formatCurrency, formatPct} from '../utils/format';
import {SearchBar, SkeletonListItem, EmptyState, AnimatedPressable} from '../components/ui';

export const InventoryScreen: React.FC = () => {
  const {user} = useAuth();

  const [products,    setProducts]    = useState<Product[]>([]);
  const [health,      setHealth]      = useState<InventoryHealth | null>(null);
  const [search,      setSearch]      = useState('');
  const [lowOnly,     setLowOnly]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);

  // Modal state for stock adjustment
  const [adjustTarget,  setAdjustTarget]  = useState<Product | null>(null);
  const [adjustDelta,   setAdjustDelta]   = useState('');
  const [adjustReason,  setAdjustReason]  = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  const storeId = user?.store_id ?? 1;

  // ─── Load data ──────────────────────────────────────────────────

  const loadHealth = useCallback(async () => {
    try {
      const res = await api.get<InventoryHealth>('/inventory/health', {
        params: {store_id: storeId},
      });
      setHealth(res.data);
    } catch {}
  }, [storeId]);

  const loadProducts = useCallback(async (p = 1, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params: Record<string, any> = {
        store_id:  storeId,
        page:      p,
        page_size: 30,
      };
      if (search.trim())  params.search         = search.trim();
      if (lowOnly)        params.low_stock_only  = true;

      const res = await api.get<Paginated<Product>>('/inventory/products', {params});
      setProducts(p === 1 ? res.data.items : (prev: Product[]) => [...prev, ...res.data.items]);
      setTotal(res.data.total);
      setPage(p);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to load products');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, search, lowOnly]);

  useEffect(() => {
    loadHealth();
    loadProducts(1);
  }, [loadHealth, loadProducts]);

  useEffect(() => {
    const timer = setTimeout(() => loadProducts(1), 400);
    return () => clearTimeout(timer);
  }, [search, lowOnly]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHealth();
    loadProducts(1, true);
  };

  // ─── Stock Adjustment ───────────────────────────────────────────

  const submitAdjustment = async () => {
    if (!adjustTarget) return;
    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta) || delta === 0) {
      Alert.alert('Invalid', 'Enter a non-zero quantity.');
      return;
    }
    if (!adjustReason.trim()) {
      Alert.alert('Required', 'Please enter a reason for the adjustment.');
      return;
    }
    setAdjustLoading(true);
    try {
      await api.post('/inventory/stock/adjust', {
        product_id: adjustTarget.id,
        delta,
        reason:     adjustReason.trim(),
      });
      setAdjustTarget(null);
      setAdjustDelta('');
      setAdjustReason('');
      loadProducts(1, true);
      loadHealth();
    } catch (err: any) {
      Alert.alert('Adjustment Failed', err?.response?.data?.detail || 'Please try again.');
    } finally {
      setAdjustLoading(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {/* ── Health Summary ─────────────────────────────────────── */}
      {health && (
        <View style={styles.healthBar}>
          <HealthPill label="Total" value={health.total_products} color={colors.primary} />
          <HealthPill label="Low Stock" value={health.low_stock_count} color={colors.warning} />
          <HealthPill label="Out of Stock" value={health.out_of_stock_count} color={colors.error} />
          <View style={styles.healthValue}>
            <Text style={styles.healthValueLabel}>Inv. Value</Text>
            <Text style={styles.healthValueAmount}>
              {formatCurrency(health.total_inventory_value)}
            </Text>
          </View>
        </View>
      )}

      {/* ── Filters ────────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, SKU or barcode…"
          loading={loading && search.length > 0}
          style={styles.searchBar}
        />
        <AnimatedPressable
          style={[styles.filterBtn, lowOnly && styles.filterBtnActive]}
          onPress={() => setLowOnly((v: boolean) => !v)}
          scaleDown={0.94}>
          <Text style={[styles.filterBtnText, lowOnly && {color: '#fff'}]}>
            ⚠️ Low
          </Text>
        </AnimatedPressable>
      </View>

      {/* ── Product List ───────────────────────────────────────── */}
      {loading && page === 1 ? (
        <View style={styles.skeletonList}>
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p: Product) => String(p.id)}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon={lowOnly ? '✅' : '📦'}
              title={lowOnly ? 'No low-stock items' : search ? 'No products found' : 'No products yet'}
              subtitle={search ? `No matches for "${search}"` : 'Add products using the API or import.'}
              compact
            />
          }
          ListFooterComponent={
            products.length < total ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => loadProducts(page + 1, true)}>
                <Text style={styles.loadMoreText}>Load more</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({item}) => (
            <ProductRow
              product={item}
              onAdjust={() => {
                setAdjustTarget(item);
                setAdjustDelta('');
                setAdjustReason('');
              }}
            />
          )}
        />
      )}

      {/* ── Stock Adjustment Modal ──────────────────────────────── */}
      <Modal
        visible={!!adjustTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setAdjustTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Adjust Stock</Text>
            <Text style={styles.modalProduct}>{adjustTarget?.name}</Text>
            <Text style={styles.modalCurrent}>
              Current stock: <Text style={{fontWeight: '700'}}>{adjustTarget?.stock_qty}</Text>
            </Text>

            <Text style={styles.fieldLabel}>Quantity Change</Text>
            <Text style={styles.fieldHint}>Use + to add, − to subtract (e.g. −5)</Text>
            <TextInput
              style={styles.fieldInput}
              value={adjustDelta}
              onChangeText={setAdjustDelta}
              placeholder="+10 or -5"
              keyboardType="numbers-and-punctuation"
              placeholderTextColor={colors.textMuted}
              selectTextOnFocus
            />

            {adjustDelta && !isNaN(parseInt(adjustDelta)) && (
              <Text style={styles.newQtyPreview}>
                New qty:{' '}
                <Text style={{fontWeight: '700', color: colors.primary}}>
                  {(adjustTarget?.stock_qty ?? 0) + parseInt(adjustDelta, 10)}
                </Text>
              </Text>
            )}

            <Text style={[styles.fieldLabel, {marginTop: 14}]}>Reason</Text>
            <TextInput
              style={[styles.fieldInput, {height: 72, textAlignVertical: 'top'}]}
              value={adjustReason}
              onChangeText={setAdjustReason}
              placeholder="e.g. Purchase received, Damaged goods…"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setAdjustTarget(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={submitAdjustment}
                disabled={adjustLoading}>
                {adjustLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Product Row ─────────────────────────────────────────────────────────────

const ProductRow: React.FC<{product: Product; onAdjust: () => void}> = (
  {product, onAdjust},
) => {
  const isLow = product.stock_qty > 0 && product.stock_qty <= product.min_stock_qty;
  const isOOS = product.stock_qty === 0;
  const margin = product.selling_price > 0
    ? ((product.selling_price - product.cost_price) / product.selling_price) * 100
    : 0;

  return (
    <View style={styles.productRow}>
      <View style={styles.productInfo}>
        <View style={styles.productNameRow}>
          <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
          {isOOS && <View style={[styles.badge, {backgroundColor: colors.error + '20'}]}>
            <Text style={[styles.badgeText, {color: colors.error}]}>Out of Stock</Text>
          </View>}
          {isLow && !isOOS && <View style={[styles.badge, {backgroundColor: colors.warning + '20'}]}>
            <Text style={[styles.badgeText, {color: colors.warning}]}>Low Stock</Text>
          </View>}
        </View>
        {product.sku && (
          <Text style={styles.productSku}>SKU: {product.sku}</Text>
        )}
        <View style={styles.productMeta}>
          <Text style={styles.metaItem}>
            Cost <Text style={styles.metaValue}>{formatCurrency(product.cost_price)}</Text>
          </Text>
          <Text style={styles.metaItem}>
            Price <Text style={styles.metaValue}>{formatCurrency(product.selling_price)}</Text>
          </Text>
          <Text style={[styles.metaItem, {color: colors.success}]}>
            Margin <Text style={[styles.metaValue, {color: colors.success}]}>{formatPct(margin)}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.stockSection}>
        <Text
          style={[
            styles.stockQty,
            isOOS ? {color: colors.error} : isLow ? {color: colors.warning} : {color: colors.success},
          ]}>
          {product.stock_qty}
        </Text>
        <Text style={styles.stockUnit}>{product.unit}</Text>
        <AnimatedPressable style={styles.adjustBtn} onPress={onAdjust} scaleDown={0.93}>
          <Text style={styles.adjustBtnText}>± Adjust</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
};

// ─── Health Pill ─────────────────────────────────────────────────────────────

const HealthPill: React.FC<{label: string; value: number; color: string}> = (
  {label, value, color},
) => (
  <View style={styles.healthPill}>
    <Text style={[styles.healthPillValue, {color}]}>{value}</Text>
    <Text style={styles.healthPillLabel}>{label}</Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      {flex: 1, backgroundColor: colors.background},
  healthBar: {
    flexDirection:     'row',
    backgroundColor:   colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems:        'center',
    gap:               spacing.xs,
    ...shadows.xs,
  },
  healthPill:       {flex: 1, alignItems: 'center'},
  healthPillValue:  {...typography.h3},
  healthPillLabel:  {...typography.caption, color: colors.textMuted, marginTop: 1},
  healthValue:      {flex: 1.4, alignItems: 'flex-end'},
  healthValueLabel: {...typography.caption, color: colors.textMuted},
  healthValueAmount:{...typography.label, color: colors.text, marginTop: 1},

  filterRow:  {flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, alignItems: 'center'},
  searchBar:  {flex: 1},
  filterBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical:   10,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
  },
  filterBtnActive:  {backgroundColor: colors.warning, borderColor: colors.warning},
  filterBtnText:    {...typography.caption, color: colors.text, fontWeight: '700'},
  skeletonList: {padding: spacing.sm, gap: spacing.xs},

  loadMoreBtn:   {alignItems: 'center', paddingVertical: 16},
  loadMoreText:  {...typography.body2, color: colors.primary, fontWeight: '600'},

  productRow: {
    flexDirection:     'row',
    backgroundColor:   colors.surface,
    marginHorizontal:  spacing.sm,
    marginBottom:      spacing.xs + 2,
    borderRadius:      radius.lg,
    padding:           spacing.sm + 2,
    borderWidth:       1,
    borderColor:       colors.border,
    alignItems:        'center',
    ...shadows.card,
  },
  productInfo:     {flex: 1},
  productNameRow:  {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2},
  productName:     {...typography.body1, color: colors.text, fontWeight: '600', flex: 1},
  productSku:      {...typography.caption, color: colors.textMuted, marginBottom: 6},
  productMeta:     {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  metaItem:        {...typography.caption, color: colors.textMuted},
  metaValue:       {fontWeight: '600', color: colors.text},
  badge:           {paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4},
  badgeText:       {...typography.caption, fontWeight: '600'},

  stockSection:    {alignItems: 'center', marginLeft: 10, minWidth: 70},
  stockQty:        {fontSize: 24, fontWeight: '800'},
  stockUnit:       {...typography.caption, color: colors.textMuted, marginTop: 1},
  adjustBtn: {
    marginTop:       8,
    paddingHorizontal: 10,
    paddingVertical:   6,
    backgroundColor: colors.primary + '15',
    borderRadius:    8,
    borderWidth:     1,
    borderColor:     colors.primary + '30',
  },
  adjustBtnText:   {...typography.caption, color: colors.primary, fontWeight: '600'},

  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent:  'flex-end',
  },
  modalBox: {
    backgroundColor: colors.surface,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:         24,
    paddingBottom:   36,
    gap:             6,
  },
  modalTitle:      {...typography.h2, color: colors.text, marginBottom: 4},
  modalProduct:    {...typography.body1, color: colors.text, fontWeight: '600'},
  modalCurrent:    {...typography.body2, color: colors.textMuted, marginBottom: 8},
  fieldLabel:      {...typography.label, color: colors.text},
  fieldHint:       {...typography.caption, color: colors.textMuted, marginBottom: 6},
  fieldInput: {
    height:            48,
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      10,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: 14,
    paddingVertical:   10,
    ...typography.body1,
    color:             colors.text,
  },
  newQtyPreview:   {...typography.body2, color: colors.textMuted, marginTop: 4},
  modalBtns:       {flexDirection: 'row', gap: 12, marginTop: 16},
  cancelBtn: {
    flex:            1,
    height:          48,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     colors.border,
    justifyContent:  'center',
    alignItems:      'center',
  },
  cancelText:   {...typography.button, color: colors.textMuted},
  confirmBtn: {
    flex:            1,
    height:          48,
    backgroundColor: colors.primary,
    borderRadius:    12,
    justifyContent:  'center',
    alignItems:      'center',
  },
  confirmText:  {...typography.button, color: '#fff'},
});
