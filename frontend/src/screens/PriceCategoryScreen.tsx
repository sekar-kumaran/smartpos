/**
 * SmartPOS AI – Price Category Screen
 * Manage customer pricing tiers: create categories (Retail, Hotel, Wholesale…)
 * and set per-product override prices for each category.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {PriceCategory, Product} from '../types';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';
import {formatCurrency} from '../utils/format';
import {EmptyState, SkeletonBlock} from '../components/ui';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TierEntry {
  product_id:       number;
  product_name:     string;
  sku?:             string;
  standard_price:   number;
  tier_price:       number;
}

// ─── Preset colours for category creation ────────────────────────────────────

const PRESET_COLORS = [
  '#4F46E5', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#8B5CF6', '#F97316', '#EC4899',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

const CategoryChip: React.FC<{
  cat: PriceCategory;
  active: boolean;
  onPress: () => void;
}> = ({cat, active, onPress}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      styles.chip,
      active && {backgroundColor: cat.color + '22', borderColor: cat.color},
    ]}>
    <View style={[styles.chipDot, {backgroundColor: cat.color}]} />
    <Text style={[styles.chipText, active && {color: cat.color, fontWeight: '700'}]}>
      {cat.name}
    </Text>
    {cat.is_default && (
      <View style={styles.defaultBadge}>
        <Text style={styles.defaultBadgeText}>Default</Text>
      </View>
    )}
  </TouchableOpacity>
);

const TierRow: React.FC<{
  entry: TierEntry;
  onSave: (productId: number, price: string) => void;
  onRemove: (productId: number) => void;
}> = ({entry, onSave, onRemove}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(String(entry.tier_price));

  const handleBlur = () => {
    setEditing(false);
    const num = parseFloat(draft);
    if (!isNaN(num) && num > 0 && num !== entry.tier_price) {
      onSave(entry.product_id, draft);
    }
  };

  const discount = ((entry.standard_price - entry.tier_price) / entry.standard_price * 100);

  return (
    <View style={styles.tierRow}>
      <View style={styles.tierLeft}>
        <Text style={styles.tierName} numberOfLines={1}>{entry.product_name}</Text>
        {entry.sku ? <Text style={styles.tierSku}>SKU: {entry.sku}</Text> : null}
      </View>
      <View style={styles.tierMid}>
        <Text style={styles.tierStdLabel}>MRP</Text>
        <Text style={styles.tierStdPrice}>{formatCurrency(entry.standard_price)}</Text>
      </View>
      <View style={styles.tierRight}>
        {editing ? (
          <TextInput
            style={styles.tierInput}
            value={draft}
            onChangeText={setDraft}
            onBlur={handleBlur}
            keyboardType="decimal-pad"
            autoFocus
          />
        ) : (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.tierPrice}>{formatCurrency(entry.tier_price)}</Text>
            {discount > 0.1 && (
              <Text style={styles.tierDiscount}>-{discount.toFixed(1)}%</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={styles.tierDelete} onPress={() => onRemove(entry.product_id)}>
        <Text style={styles.tierDeleteIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Product Picker Modal ─────────────────────────────────────────────────────

const ProductPickerModal: React.FC<{
  visible:   boolean;
  products:  Product[];
  onPick:    (p: Product) => void;
  onClose:   () => void;
}> = ({visible, products, onPick, onClose}) => {
  const [search, setSearch] = useState('');

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku ?? '').toLowerCase().includes(search.toLowerCase()),
  ).slice(0, 30);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>Add Product to Tier</Text>
          <TextInput
            style={styles.pickerSearch}
            placeholder="Search products…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          <FlatList
            data={filtered}
            keyExtractor={p => String(p.id)}
            renderItem={({item}) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { onPick(item); onClose(); }}>
                <View style={{flex: 1}}>
                  <Text style={styles.pickerItemName}>{item.name}</Text>
                  {item.sku ? <Text style={styles.pickerItemSku}>SKU: {item.sku}</Text> : null}
                </View>
                <Text style={styles.pickerItemPrice}>{formatCurrency(item.selling_price)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <EmptyState icon="📦" title="No products" subtitle="Adjust your search" />
            }
          />
          <TouchableOpacity style={styles.pickerClose} onPress={onClose}>
            <Text style={styles.pickerCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Create / Edit Category Modal ─────────────────────────────────────────────

const CategoryFormModal: React.FC<{
  visible:   boolean;
  initial?:  PriceCategory | null;
  onSave:    (data: {name: string; color: string; description?: string; is_default: boolean}) => void;
  onClose:   () => void;
}> = ({visible, initial, onSave, onClose}) => {
  const [name,        setName]       = useState(initial?.name ?? '');
  const [color,       setColor]      = useState(initial?.color ?? PRESET_COLORS[0]);
  const [desc,        setDesc]       = useState(initial?.description ?? '');
  const [isDefault,   setIsDefault]  = useState(initial?.is_default ?? false);

  useEffect(() => {
    setName(initial?.name ?? '');
    setColor(initial?.color ?? PRESET_COLORS[0]);
    setDesc(initial?.description ?? '');
    setIsDefault(initial?.is_default ?? false);
  }, [initial, visible]);

  const valid = name.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.formSheet}>
          <View style={styles.pickerHandle} />
          <Text style={styles.formTitle}>{initial ? 'Edit Category' : 'New Price Category'}</Text>

          <Text style={styles.formLabel}>Category Name</Text>
          <TextInput
            style={styles.formInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Hotel Price, Wholesale…"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.formLabel}>Description (optional)</Text>
          <TextInput
            style={styles.formInput}
            value={desc}
            onChangeText={setDesc}
            placeholder="Brief description"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.formLabel}>Category Color</Text>
          <View style={styles.colorRow}>
            {PRESET_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorDot, {backgroundColor: c}, color === c && styles.colorDotActive]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.defaultToggle, isDefault && styles.defaultToggleOn]}
            onPress={() => setIsDefault(v => !v)}>
            <Text style={[styles.defaultToggleText, isDefault && {color: colors.primary}]}>
              {isDefault ? '✓ ' : ''}Set as Default Category
            </Text>
          </TouchableOpacity>

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !valid && styles.saveBtnDisabled]}
              disabled={!valid}
              onPress={() => onSave({name: name.trim(), color, description: desc.trim() || undefined, is_default: isDefault})}>
              <Text style={styles.saveBtnText}>{initial ? 'Update' : 'Create'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Set Tier Price Modal ─────────────────────────────────────────────────────

const SetTierModal: React.FC<{
  visible:   boolean;
  product:   Product | null;
  onSave:    (price: string) => void;
  onClose:   () => void;
}> = ({visible, product, onSave, onClose}) => {
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (product) setPrice(String(product.selling_price));
  }, [product, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.setPriceSheet}>
          <Text style={styles.formTitle}>Set Tier Price</Text>
          {product && (
            <Text style={styles.setPriceProduct}>{product.name}</Text>
          )}
          <Text style={styles.setPriceStd}>
            Standard: {product ? formatCurrency(product.selling_price) : '—'}
          </Text>
          <TextInput
            style={[styles.formInput, {marginTop: spacing.md}]}
            value={price}
            onChangeText={setPrice}
            placeholder="Enter tier price"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            autoFocus
          />
          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => { onSave(price); onClose(); }}>
              <Text style={styles.saveBtnText}>Set Price</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export const PriceCategoryScreen: React.FC = () => {
  const {user} = useAuth();
  const storeId = user?.store_id ?? 1;

  const [categories,   setCategories]   = useState<PriceCategory[]>([]);
  const [activeCat,    setActiveCat]    = useState<PriceCategory | null>(null);
  const [tiers,        setTiers]        = useState<TierEntry[]>([]);
  const [products,     setProducts]     = useState<Product[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [refreshing,   setRefreshing]   = useState(false);

  // Modals
  const [showForm,      setShowForm]      = useState(false);
  const [editingCat,    setEditingCat]    = useState<PriceCategory | null>(null);
  const [showPicker,    setShowPicker]    = useState(false);
  const [pickedProduct, setPickedProduct] = useState<Product | null>(null);
  const [showSetPrice,  setShowSetPrice]  = useState(false);

  // Filter
  const [tierSearch, setTierSearch] = useState('');

  // ─── Load ─────────────────────────────────────────────────────────

  const loadCategories = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get<PriceCategory[]>('/price-categories', {
        params: {store_id: storeId},
      });
      setCategories(res.data);
      if (!activeCat && res.data.length > 0) setActiveCat(res.data[0]);
    } catch (e) {
      // ignore — network error handled globally
    } finally {
      setLoading(false);
    }
  }, [storeId, activeCat]);

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.get<{items: Product[]}>('/inventory/products', {
        params: {store_id: storeId, page_size: 500},
      });
      setProducts(res.data.items ?? []);
    } catch {}
  }, [storeId]);

  const loadTiers = useCallback(async (catId: number) => {
    setTiersLoading(true);
    setTierSearch('');
    try {
      const res = await api.get<{id: number; product_id: number; price: number; product_name: string}[]>(
        `/price-categories/${catId}/products`,
      );
      // Enrich with standard_price + sku from the already-loaded products list
      const enriched: TierEntry[] = res.data.map(t => {
        const prod = products.find(p => p.id === t.product_id);
        return {
          product_id:     t.product_id,
          product_name:   t.product_name ?? prod?.name ?? `Product ${t.product_id}`,
          sku:            prod?.sku ?? undefined,
          standard_price: prod?.selling_price ?? 0,
          tier_price:     t.price,
        };
      });
      setTiers(enriched);
    } catch {
      setTiers([]);
    } finally {
      setTiersLoading(false);
    }
  }, [products]);

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, [loadCategories, loadProducts]);

  useEffect(() => {
    if (activeCat) loadTiers(activeCat.id);
  }, [activeCat, loadTiers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCategories(true);
    if (activeCat) await loadTiers(activeCat.id);
    setRefreshing(false);
  };

  // ─── CRUD Categories ──────────────────────────────────────────────

  const createCategory = async (data: {name: string; color: string; description?: string; is_default: boolean}) => {
    try {
      const res = await api.post<PriceCategory>('/price-categories', {
        ...data, store_id: storeId,
      });
      setCategories(prev => [...prev, res.data]);
      setActiveCat(res.data);
      setShowForm(false);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to create category');
    }
  };

  const updateCategory = async (data: {name: string; color: string; description?: string; is_default: boolean}) => {
    if (!editingCat) return;
    try {
      const res = await api.patch<PriceCategory>(`/price-categories/${editingCat.id}`, data);
      setCategories(prev => prev.map(c => c.id === editingCat.id ? res.data : c));
      if (activeCat?.id === editingCat.id) setActiveCat(res.data);
      setEditingCat(null);
      setShowForm(false);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to update category');
    }
  };

  const deleteCategory = (cat: PriceCategory) => {
    Alert.alert(
      `Delete "${cat.name}"?`,
      'All tier prices for this category will also be removed. This cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/price-categories/${cat.id}`);
            setCategories(prev => prev.filter(c => c.id !== cat.id));
            if (activeCat?.id === cat.id) {
              const remaining = categories.filter(c => c.id !== cat.id);
              setActiveCat(remaining[0] ?? null);
            }
          } catch (e: any) {
            Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to delete');
          }
        }},
      ],
    );
  };

  // ─── CRUD Tier Prices ─────────────────────────────────────────────

  const upsertTierPrice = async (productId: number, price: string) => {
    if (!activeCat) return;
    const num = parseFloat(price);
    if (isNaN(num) || num <= 0) return;
    try {
      await api.post(`/price-categories/${activeCat.id}/products`, {
        product_id: productId,
        price:      num,
        store_id:   storeId,
      });
      setTiers(prev =>
        prev.some(t => t.product_id === productId)
          ? prev.map(t => t.product_id === productId ? {...t, tier_price: num} : t)
          : prev,
      );
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to set price');
    }
  };

  const addProductTier = async (product: Product, price: string) => {
    if (!activeCat) return;
    const num = parseFloat(price);
    if (isNaN(num) || num <= 0) return;
    try {
      await api.post(`/price-categories/${activeCat.id}/products`, {
        product_id: product.id,
        price:      num,
        store_id:   storeId,
      });
      const newEntry: TierEntry = {
        product_id:     product.id,
        product_name:   product.name,
        sku:            product.sku ?? undefined,
        standard_price: product.selling_price,
        tier_price:     num,
      };
      setTiers(prev =>
        prev.some(t => t.product_id === product.id)
          ? prev.map(t => t.product_id === product.id ? newEntry : t)
          : [...prev, newEntry],
      );
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to add tier price');
    }
  };

  const removeTierPrice = (productId: number) => {
    if (!activeCat) return;
    Alert.alert('Remove tier price?', 'The standard price will be used for this product.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/price-categories/${activeCat.id}/products/${productId}`);
          setTiers(prev => prev.filter(t => t.product_id !== productId));
        } catch (e: any) {
          Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to remove');
        }
      }},
    ]);
  };

  // ─── Handlers ─────────────────────────────────────────────────────

  const openCreateForm = () => {
    setEditingCat(null);
    setShowForm(true);
  };

  const openEditForm = (cat: PriceCategory) => {
    setEditingCat(cat);
    setShowForm(true);
  };

  const handlePickProduct = (product: Product) => {
    setPickedProduct(product);
    setShowSetPrice(true);
  };

  const handleSetPrice = (price: string) => {
    if (pickedProduct) {
      addProductTier(pickedProduct, price);
      setPickedProduct(null);
    }
  };

  // ─── Filtered tiers ───────────────────────────────────────────────

  const filteredTiers = tierSearch.trim()
    ? tiers.filter(t =>
        t.product_name.toLowerCase().includes(tierSearch.toLowerCase()) ||
        (t.sku ?? '').toLowerCase().includes(tierSearch.toLowerCase()),
      )
    : tiers;

  // Products not yet in this category (for add picker)
  const availableProducts = products.filter(
    p => p.is_active && !tiers.some(t => t.product_id === p.id),
  );

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonHeader}>
          {[1, 2, 3].map(i => (
            <SkeletonBlock key={i} width={90} height={34} borderRadius={radius.full} />
          ))}
        </View>
        <View style={styles.skeletonBody}>
          {[1, 2, 3, 4].map(i => (
            <SkeletonBlock key={i} width="100%" height={56} borderRadius={radius.md} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Category Strip ──────────────────────────────────────────── */}
      <View style={styles.catHeader}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catStrip}>
          {categories.map(cat => (
            <CategoryChip
              key={cat.id}
              cat={cat}
              active={activeCat?.id === cat.id}
              onPress={() => setActiveCat(cat)}
            />
          ))}
          <TouchableOpacity style={styles.newCatBtn} onPress={openCreateForm}>
            <Text style={styles.newCatBtnText}>+ New</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── Empty state: no categories ────────────────────────────────── */}
      {categories.length === 0 && (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="🏷️"
            title="No price categories yet"
            subtitle="Create a category like 'Hotel Price' or 'Wholesale' to offer special pricing to specific customers."
          />
          <TouchableOpacity style={styles.createFirstBtn} onPress={openCreateForm}>
            <Text style={styles.createFirstBtnText}>Create First Category</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Active category panel ─────────────────────────────────────── */}
      {activeCat && (
        <View style={styles.panel}>
          {/* Category meta */}
          <View style={styles.panelHeader}>
            <View style={styles.panelHeaderLeft}>
              <View style={[styles.catColorBar, {backgroundColor: activeCat.color}]} />
              <View>
                <Text style={styles.panelTitle}>{activeCat.name}</Text>
                {activeCat.description ? (
                  <Text style={styles.panelDesc}>{activeCat.description}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.panelActions}>
              <TouchableOpacity style={styles.editCatBtn} onPress={() => openEditForm(activeCat)}>
                <Text style={styles.editCatBtnText}>Edit</Text>
              </TouchableOpacity>
              {!activeCat.is_default && (
                <TouchableOpacity style={styles.deleteCatBtn} onPress={() => deleteCategory(activeCat)}>
                  <Text style={styles.deleteCatBtnText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Tier prices list */}
          <View style={styles.tierSection}>
            <View style={styles.tierSectionHeader}>
              <Text style={styles.tierSectionTitle}>
                Product Prices ({tiers.length})
              </Text>
              <TouchableOpacity
                style={[styles.addProductBtn, {borderColor: activeCat.color}]}
                onPress={() => setShowPicker(true)}>
                <Text style={[styles.addProductBtnText, {color: activeCat.color}]}>
                  + Add Product
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.tierSearchInput}
              placeholder="Search products in this tier…"
              placeholderTextColor={colors.textMuted}
              value={tierSearch}
              onChangeText={setTierSearch}
            />

            {tiersLoading ? (
              <View style={styles.tiersLoading}>
                <ActivityIndicator color={activeCat.color} />
                <Text style={styles.tiersLoadingText}>Loading prices…</Text>
              </View>
            ) : (
              <FlatList
                data={filteredTiers}
                keyExtractor={t => String(t.product_id)}
                renderItem={({item}) => (
                  <TierRow
                    entry={item}
                    onSave={upsertTierPrice}
                    onRemove={removeTierPrice}
                  />
                )}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={activeCat.color} />
                }
                ListHeaderComponent={
                  filteredTiers.length > 0 ? (
                    <View style={styles.tierListHeader}>
                      <Text style={[styles.tierListHeaderCell, {flex: 3}]}>Product</Text>
                      <Text style={[styles.tierListHeaderCell, {flex: 1.5, textAlign: 'right'}]}>Standard</Text>
                      <Text style={[styles.tierListHeaderCell, {flex: 1.5, textAlign: 'right', color: activeCat.color}]}>Tier Price</Text>
                      <View style={{width: 32}} />
                    </View>
                  ) : null
                }
                ListEmptyComponent={
                  !tiersLoading ? (
                    <EmptyState
                      icon="🏷️"
                      title={tierSearch ? 'No matches' : 'No tier prices set'}
                      subtitle={tierSearch ? 'Try a different search' : 'Tap "+ Add Product" to set a special price for a product in this category.'}
                    />
                  ) : null
                }
                contentContainerStyle={styles.tierList}
              />
            )}
          </View>
        </View>
      )}

      {/* ── Modals ────────────────────────────────────────────────────── */}
      <CategoryFormModal
        visible={showForm}
        initial={editingCat}
        onSave={editingCat ? updateCategory : createCategory}
        onClose={() => { setShowForm(false); setEditingCat(null); }}
      />

      <ProductPickerModal
        visible={showPicker}
        products={availableProducts}
        onPick={handlePickProduct}
        onClose={() => setShowPicker(false)}
      />

      <SetTierModal
        visible={showSetPrice}
        product={pickedProduct}
        onSave={handleSetPrice}
        onClose={() => { setShowSetPrice(false); setPickedProduct(null); }}
      />
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},

  // Skeleton
  skeletonHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  skeletonBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },

  // Category strip
  catHeader: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  catStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  chipText: {
    ...typography.body2,
    color: colors.textSub,
    fontWeight: '600',
  },
  defaultBadge: {
    backgroundColor: colors.primaryFaint,
    borderRadius: radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  defaultBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontSize: 9,
    fontWeight: '700',
  },
  newCatBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  newCatBtnText: {
    ...typography.body2,
    color: colors.primary,
    fontWeight: '700',
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  createFirstBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    ...shadows.colored(colors.primary),
  },
  createFirstBtnText: {
    ...typography.body1,
    color: '#fff',
    fontWeight: '700',
  },

  // Panel
  panel: {flex: 1},
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panelHeaderLeft: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1},
  catColorBar: {width: 4, height: 36, borderRadius: 2},
  panelTitle: {...typography.h3, color: colors.text},
  panelDesc: {...typography.caption, color: colors.textMuted, marginTop: 2},
  panelActions: {flexDirection: 'row', gap: spacing.sm},
  editCatBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.primaryFaint,
  },
  editCatBtnText: {...typography.caption, color: colors.primary, fontWeight: '700'},
  deleteCatBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.errorFaint,
  },
  deleteCatBtnText: {...typography.caption, color: colors.error, fontWeight: '700'},

  // Tier list
  tierSection: {flex: 1},
  tierSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  tierSectionTitle: {...typography.body1, color: colors.text, fontWeight: '700'},
  addProductBtn: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  addProductBtnText: {...typography.caption, fontWeight: '700'},
  tierSearchInput: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    ...typography.body2,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  tiersLoading: {flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', padding: spacing.xl},
  tiersLoadingText: {...typography.body2, color: colors.textMuted},
  tierList: {paddingHorizontal: spacing.md, paddingBottom: spacing.xl},
  tierListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  tierListHeaderCell: {...typography.caption, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase'},

  // Tier row
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tierLeft: {flex: 3},
  tierMid: {flex: 1.5, alignItems: 'flex-end'},
  tierRight: {flex: 1.5, alignItems: 'flex-end'},
  tierName: {...typography.body2, color: colors.text, fontWeight: '600'},
  tierSku: {...typography.caption, color: colors.textMuted},
  tierStdLabel: {...typography.caption, color: colors.textMuted},
  tierStdPrice: {...typography.body2, color: colors.textMuted},
  tierPrice: {...typography.body2, color: colors.success, fontWeight: '700'},
  tierDiscount: {...typography.caption, color: colors.success},
  tierInput: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    ...typography.body2,
    color: colors.text,
    textAlign: 'right',
    minWidth: 70,
  },
  tierDelete: {width: 32, alignItems: 'center'},
  tierDeleteIcon: {color: colors.error, fontSize: 14, fontWeight: '700'},

  // Overlay + modals
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
    paddingHorizontal: spacing.md,
  },
  formSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  setPriceSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    margin: spacing.lg,
    padding: spacing.lg,
  },
  pickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  pickerTitle: {...typography.h3, color: colors.text, marginBottom: spacing.sm},
  pickerSearch: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    ...typography.body2,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  pickerItemName: {...typography.body2, color: colors.text, fontWeight: '600'},
  pickerItemSku: {...typography.caption, color: colors.textMuted},
  pickerItemPrice: {...typography.body2, color: colors.primary, fontWeight: '700'},
  pickerClose: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  pickerCloseText: {...typography.body2, color: colors.textSub, fontWeight: '700'},

  // Form
  formTitle: {...typography.h3, color: colors.text, marginBottom: spacing.md},
  formLabel: {...typography.caption, color: colors.textMuted, fontWeight: '700', marginBottom: 4, marginTop: spacing.sm},
  formInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    ...typography.body2,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  colorRow: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap'},
  colorDot: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: colors.text,
    transform: [{scale: 1.2}],
  },
  defaultToggle: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  defaultToggleOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint,
  },
  defaultToggleText: {...typography.body2, color: colors.textMuted, fontWeight: '600'},
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  cancelBtnText: {...typography.body2, color: colors.textSub, fontWeight: '700'},
  saveBtn: {
    flex: 2,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    ...shadows.colored(colors.primary),
  },
  saveBtnDisabled: {opacity: 0.45},
  saveBtnText: {...typography.body2, color: '#fff', fontWeight: '700'},

  // Set price modal
  setPriceProduct: {...typography.body1, color: colors.text, fontWeight: '700', marginBottom: 4},
  setPriceStd: {...typography.body2, color: colors.textMuted},
});
