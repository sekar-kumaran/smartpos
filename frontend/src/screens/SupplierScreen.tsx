/**
 * SmartPOS AI – Supplier & Purchase Order Screen
 * Supplier list + PO creation + stock replenishment workflow.
 * Offline-first: POs are composed locally, synced when online.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../services/api';
import {useAuth} from '../store/AuthContext';
import {PurchaseOrder, PurchaseOrderStatus, Supplier} from '../types';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';
import {formatCurrency, formatDate} from '../utils/format';
import {AnimatedPressable, EmptyState, SearchBar, SkeletonListItem} from '../components/ui';

const STATUS_COLOR: Record<PurchaseOrderStatus, {bg: string; text: string; label: string}> = {
  draft:             {bg: colors.surfaceAlt,    text: colors.textMuted,  label: 'Draft'},
  sent:              {bg: colors.infoFaint,     text: colors.info,       label: 'Sent'},
  partial_received:  {bg: colors.warningFaint,  text: colors.warning,    label: 'Partial'},
  received:          {bg: colors.successFaint,  text: colors.success,    label: 'Received'},
  cancelled:         {bg: colors.errorFaint,    text: colors.error,      label: 'Cancelled'},
};

type ActiveTab = 'suppliers' | 'orders';

export const SupplierScreen: React.FC = () => {
  const {user}  = useAuth();
  const storeId = user?.store_id ?? 1;

  const [tab,        setTab]        = useState<ActiveTab>('suppliers');
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [orders,     setOrders]     = useState<PurchaseOrder[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');

  // New supplier modal
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [supName,   setSupName]   = useState('');
  const [supPhone,  setSupPhone]  = useState('');
  const [supEmail,  setSupEmail]  = useState('');
  const [supGstin,  setSupGstin]  = useState('');
  const [supContact, setSupContact] = useState('');
  const [saving,    setSaving]    = useState(false);

  // New PO modal
  const [showNewPO,   setShowNewPO]   = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poExpDate,   setPoExpDate]   = useState('');
  const [poNotes,     setPoNotes]     = useState('');
  const [poSaving,    setPoSaving]    = useState(false);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [supRes, poRes] = await Promise.all([
        api.get<{items: Supplier[]}>('/inventory/suppliers', {params: {store_id: storeId, page_size: 100}}),
        api.get<{items: PurchaseOrder[]}>('/inventory/purchase-orders', {params: {store_id: storeId, page_size: 50}}),
      ]);
      setSuppliers(supRes.data.items ?? []);
      setOrders(poRes.data.items ?? []);
    } catch {
      // Demo mode — show empty states
      setSuppliers([]);
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveSupplier = async () => {
    if (!supName.trim()) {
      Alert.alert('Required', 'Supplier name is required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/inventory/suppliers', {
        store_id: storeId,
        name:     supName.trim(),
        phone:    supPhone.trim() || null,
        email:    supEmail.trim() || null,
        gstin:    supGstin.trim() || null,
        contact_person: supContact.trim() || null,
      });
      setShowNewSupplier(false);
      setSupName(''); setSupPhone(''); setSupEmail(''); setSupGstin(''); setSupContact('');
      loadAll(true);
    } catch (err: any) {
      Alert.alert('Failed', err?.response?.data?.detail || 'Could not save supplier.');
    } finally {
      setSaving(false);
    }
  };

  const savePO = async () => {
    const supId = parseInt(poSupplierId, 10);
    if (!poSupplierId.trim() || isNaN(supId)) {
      Alert.alert('Required', 'Select a supplier for this purchase order.');
      return;
    }
    setPoSaving(true);
    try {
      await api.post('/inventory/purchase-orders', {
        store_id:      storeId,
        supplier_id:   supId,
        expected_date: poExpDate.trim() || null,
        notes:         poNotes.trim() || null,
        items:         [],
      });
      setShowNewPO(false);
      setPoSupplierId(''); setPoExpDate(''); setPoNotes('');
      loadAll(true);
    } catch (err: any) {
      Alert.alert('Failed', err?.response?.data?.detail || 'Could not create PO.');
    } finally {
      setPoSaving(false);
    }
  };

  const filteredSuppliers = search.trim()
    ? suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : suppliers;

  return (
    <View style={styles.root}>
      {/* ── Tab Toggle ──────────────────────────────────────────────────── */}
      <View style={styles.tabRow}>
        <TabBtn label="Suppliers" emoji="🏭" active={tab === 'suppliers'} onPress={() => setTab('suppliers')} />
        <TabBtn label="Purchase Orders" emoji="📋" active={tab === 'orders'} onPress={() => setTab('orders')} count={orders.filter(o => o.status === 'draft').length} />
      </View>

      {/* ── Suppliers Tab ──────────────────────────────────────────────── */}
      {tab === 'suppliers' && (
        <>
          <View style={styles.searchRow}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search suppliers…"
              style={styles.searchBar}
            />
            <AnimatedPressable
              style={styles.addBtn}
              onPress={() => setShowNewSupplier(true)}
              scaleDown={0.94}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </AnimatedPressable>
          </View>

          {loading ? (
            <View style={styles.skeletonList}>
              {[1,2,3,4].map(i => <SkeletonListItem key={i} />)}
            </View>
          ) : (
            <FlatList
              data={filteredSuppliers}
              keyExtractor={s => String(s.id)}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(true); }} tintColor={colors.primary} colors={[colors.primary]} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <EmptyState
                  icon="🏭"
                  title="No suppliers yet"
                  subtitle="Add your first supplier to start creating purchase orders."
                  actionLabel="+ Add Supplier"
                  onAction={() => setShowNewSupplier(true)}
                />
              }
              renderItem={({item}) => <SupplierCard supplier={item} />}
            />
          )}
        </>
      )}

      {/* ── Purchase Orders Tab ─────────────────────────────────────────── */}
      {tab === 'orders' && (
        <>
          <View style={styles.searchRow}>
            <View style={{flex: 1}} />
            <AnimatedPressable
              style={styles.addBtn}
              onPress={() => setShowNewPO(true)}
              scaleDown={0.94}>
              <Text style={styles.addBtnText}>+ New PO</Text>
            </AnimatedPressable>
          </View>

          {loading ? (
            <View style={styles.skeletonList}>
              {[1,2,3].map(i => <SkeletonListItem key={i} />)}
            </View>
          ) : (
            <FlatList
              data={orders}
              keyExtractor={o => String(o.id)}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(true); }} tintColor={colors.primary} colors={[colors.primary]} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <EmptyState
                  icon="📋"
                  title="No purchase orders"
                  subtitle="Create a PO to track stock replenishment from your suppliers."
                  actionLabel="+ Create PO"
                  onAction={() => setShowNewPO(true)}
                />
              }
              renderItem={({item}) => (
                <POCard
                  order={item}
                  supplierName={suppliers.find(s => s.id === item.supplier_id)?.name ?? `Supplier #${item.supplier_id}`}
                />
              )}
            />
          )}
        </>
      )}

      {/* ── New Supplier Modal ──────────────────────────────────────────── */}
      <Modal visible={showNewSupplier} transparent animationType="slide" onRequestClose={() => setShowNewSupplier(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add Supplier</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              <FieldBlock label="Supplier Name *" value={supName} onChange={setSupName} placeholder="e.g. Raj Wholesale Distributors" autoFocus />
              <FieldBlock label="Contact Person" value={supContact} onChange={setSupContact} placeholder="e.g. Rajesh Kumar" />
              <FieldBlock label="Phone" value={supPhone} onChange={setSupPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" />
              <FieldBlock label="Email" value={supEmail} onChange={setSupEmail} placeholder="supplier@example.com" keyboardType="email-address" />
              <FieldBlock label="GSTIN (optional)" value={supGstin} onChange={setSupGstin} placeholder="29ABCDE1234F1Z5" autoCapitalize="characters" />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowNewSupplier(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={saveSupplier} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmText}>Save Supplier</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── New PO Modal ─────────────────────────────────────────────────── */}
      <Modal visible={showNewPO} transparent animationType="slide" onRequestClose={() => setShowNewPO(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>New Purchase Order</Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Supplier ID *</Text>
              <TextInput
                style={styles.fieldInput}
                value={poSupplierId}
                onChangeText={setPoSupplierId}
                keyboardType="numeric"
                placeholder="Enter supplier ID"
                placeholderTextColor={colors.textMuted}
              />
              {suppliers.length > 0 && (
                <View style={styles.supplierHintRow}>
                  {suppliers.slice(0, 4).map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.supplierHintChip}
                      onPress={() => setPoSupplierId(String(s.id))}>
                      <Text style={styles.supplierHintText}>{s.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <FieldBlock label="Expected Delivery Date" value={poExpDate} onChange={setPoExpDate} placeholder="YYYY-MM-DD" />
            <FieldBlock label="Notes" value={poNotes} onChange={setPoNotes} placeholder="Optional notes for this order…" multiline />

            <View style={styles.poInfoBanner}>
              <Text style={styles.poInfoText}>
                💡 After creating the PO, you can add items and update status when stock arrives.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowNewPO(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={savePO} disabled={poSaving}>
                {poSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmText}>Create PO</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Tab Btn ──────────────────────────────────────────────────────────────────

const TabBtn: React.FC<{
  label:   string;
  emoji:   string;
  active:  boolean;
  onPress: () => void;
  count?:  number;
}> = ({label, emoji, active, onPress, count}) => (
  <TouchableOpacity
    style={[styles.tabBtn, active && styles.tabBtnActive]}
    onPress={onPress}
    activeOpacity={0.8}>
    <Text style={styles.tabBtnEmoji}>{emoji}</Text>
    <Text style={[styles.tabBtnText, active && {color: colors.primary, fontWeight: '700'}]}>
      {label}
    </Text>
    {(count ?? 0) > 0 && (
      <View style={styles.tabBtnBadge}>
        <Text style={styles.tabBtnBadgeText}>{count}</Text>
      </View>
    )}
  </TouchableOpacity>
);

// ─── Supplier Card ────────────────────────────────────────────────────────────

const SupplierCard: React.FC<{supplier: Supplier}> = ({supplier}) => (
  <View style={styles.card}>
    <View style={styles.cardIconWrap}>
      <Text style={styles.cardIcon}>🏭</Text>
    </View>
    <View style={styles.cardBody}>
      <Text style={styles.cardTitle}>{supplier.name}</Text>
      {supplier.contact_person && (
        <Text style={styles.cardSub}>👤 {supplier.contact_person}</Text>
      )}
      <View style={styles.cardMeta}>
        {supplier.phone && <Text style={styles.cardMetaItem}>📞 {supplier.phone}</Text>}
        {supplier.gstin && <Text style={styles.cardMetaItem}>GST: {supplier.gstin}</Text>}
      </View>
    </View>
    {supplier.credit_days ? (
      <View style={styles.creditDaysBadge}>
        <Text style={styles.creditDaysText}>{supplier.credit_days}d</Text>
        <Text style={styles.creditDaysLabel}>credit</Text>
      </View>
    ) : null}
  </View>
);

// ─── PO Card ──────────────────────────────────────────────────────────────────

const POCard: React.FC<{order: PurchaseOrder; supplierName: string}> = ({order, supplierName}) => {
  const cfg = STATUS_COLOR[order.status];
  return (
    <View style={[styles.card, styles.poCard]}>
      <View style={styles.poHeader}>
        <View>
          <Text style={styles.poNumber}>{order.po_number}</Text>
          <Text style={styles.poSupplier}>📦 {supplierName}</Text>
        </View>
        <View style={[styles.statusBadge, {backgroundColor: cfg.bg}]}>
          <Text style={[styles.statusText, {color: cfg.text}]}>{cfg.label}</Text>
        </View>
      </View>
      <View style={styles.poMeta}>
        <Text style={styles.poMetaItem}>
          💰 {formatCurrency(order.total_amount)}
        </Text>
        {order.expected_date && (
          <Text style={styles.poMetaItem}>
            📅 Expected: {formatDate(order.expected_date)}
          </Text>
        )}
        <Text style={styles.poMetaItem}>
          🗓 Created: {formatDate(order.created_at)}
        </Text>
      </View>
    </View>
  );
};

// ─── Field Block ──────────────────────────────────────────────────────────────

const FieldBlock: React.FC<{
  label:           string;
  value:           string;
  onChange:        (v: string) => void;
  placeholder:     string;
  autoFocus?:      boolean;
  keyboardType?:   'default' | 'phone-pad' | 'email-address' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?:      boolean;
}> = ({label, value, onChange, placeholder, autoFocus, keyboardType, autoCapitalize, multiline}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      autoFocus={autoFocus}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      multiline={multiline}
      numberOfLines={multiline ? 3 : 1}
    />
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:       {flex: 1, backgroundColor: colors.background},

  tabRow: {
    flexDirection:     'row',
    backgroundColor:   colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.xs,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {borderBottomColor: colors.primary},
  tabBtnEmoji:  {fontSize: 15},
  tabBtnText:   {...typography.label, color: colors.textMuted},
  tabBtnBadge: {
    backgroundColor:   colors.warning,
    borderRadius:      radius.full,
    width:             18,
    height:            18,
    alignItems:        'center',
    justifyContent:    'center',
  },
  tabBtnBadgeText: {
    fontSize:   9,
    fontWeight: '800',
    color:      '#fff',
  },

  searchRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.xs,
    padding:           spacing.sm,
    backgroundColor:   colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBar: {flex: 1},
  addBtn: {
    backgroundColor:   colors.primary,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   9,
    ...shadows.colored(colors.primary),
  },
  addBtnText: {...typography.label, color: '#fff', fontWeight: '700'},

  skeletonList: {padding: spacing.sm, gap: spacing.xs},
  listContent:  {padding: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xxl},

  card: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     colors.border,
    gap:             spacing.md,
    ...shadows.xs,
  },
  cardIconWrap: {
    width:          44,
    height:         44,
    borderRadius:   radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  cardIcon:  {fontSize: 22},
  cardBody:  {flex: 1, gap: 3},
  cardTitle: {...typography.body1, color: colors.text, fontWeight: '700'},
  cardSub:   {...typography.caption, color: colors.textMuted},
  cardMeta:  {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2},
  cardMetaItem: {...typography.caption, color: colors.textMuted},

  creditDaysBadge: {
    backgroundColor:   colors.infoFaint,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical:   4,
    alignItems:        'center',
    minWidth:          36,
  },
  creditDaysText:  {...typography.label, color: colors.info, fontWeight: '800'},
  creditDaysLabel: {fontSize: 9, color: colors.info, fontWeight: '600'},

  // PO Card
  poCard:    {flexDirection: 'column', gap: spacing.xs},
  poHeader:  {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'},
  poNumber:  {...typography.body1, color: colors.text, fontWeight: '700'},
  poSupplier:{...typography.caption, color: colors.textMuted, marginTop: 2},
  poMeta:    {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs},
  poMetaItem:{...typography.caption, color: colors.textMuted},
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   4,
    borderRadius:      radius.full,
  },
  statusText: {...typography.caption, fontWeight: '700'},

  // Modal
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent:  'flex-end',
  },
  modalSheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding:              spacing.lg,
    paddingBottom:        spacing.xl + spacing.md,
    gap:                  spacing.sm,
    maxHeight:            '85%',
  },
  modalHandle: {
    width:           40,
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    radius.full,
    alignSelf:       'center',
    marginBottom:    spacing.sm,
  },
  modalTitle:  {...typography.h2, color: colors.text},
  modalScroll: {maxHeight: 380},
  fieldWrap:   {gap: 4, marginBottom: spacing.sm},
  fieldLabel:  {...typography.label, color: colors.textSub},
  fieldInput: {
    height:            48,
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      radius.lg,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: spacing.md,
    ...typography.body2,
    color:             colors.text,
  },
  fieldInputMulti: {
    height:      80,
    paddingTop:  spacing.sm,
    textAlignVertical: 'top',
  },
  supplierHintRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.xs,
    marginTop:     spacing.xs,
  },
  supplierHintChip: {
    backgroundColor:   colors.primaryFaint,
    borderRadius:      radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   4,
    borderWidth:       1,
    borderColor:       colors.primary + '30',
  },
  supplierHintText: {...typography.caption, color: colors.primary, fontWeight: '600'},
  poInfoBanner: {
    backgroundColor: colors.infoFaint,
    borderRadius:    radius.md,
    padding:         spacing.sm,
    borderWidth:     1,
    borderColor:     colors.info + '30',
  },
  poInfoText: {...typography.caption, color: colors.info},
  modalActions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs},
  cancelBtn: {
    flex:           1,
    height:         48,
    borderRadius:   radius.lg,
    borderWidth:    1,
    borderColor:    colors.border,
    justifyContent: 'center',
    alignItems:     'center',
  },
  cancelText:  {...typography.button, color: colors.textMuted},
  confirmBtn: {
    flex:            1,
    height:          48,
    backgroundColor: colors.primary,
    borderRadius:    radius.lg,
    justifyContent:  'center',
    alignItems:      'center',
    ...shadows.colored(colors.primary),
  },
  confirmText: {...typography.button, color: '#fff'},
});
