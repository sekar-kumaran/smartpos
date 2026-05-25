/**
 * SmartPOS AI – Loyalty Points Screen
 * Customer reward tracking, points leaderboard, redemption overview.
 * Lightweight — avoids overcomplicated CRM behavior.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../services/api';
import {useAuth} from '../store/AuthContext';
import {CustomerLoyalty, LoyaltyConfig} from '../types';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';
import {formatCurrency} from '../utils/format';
import {EmptyState, KPIRow, SearchBar, SectionHeader, SkeletonListItem} from '../components/ui';

const TIER_COLOR: Record<CustomerLoyalty['tier'], {bg: string; text: string; emoji: string}> = {
  bronze:   {bg: '#CD7F3220', text: '#CD7F32', emoji: '🥉'},
  silver:   {bg: '#C0C0C020', text: '#707070', emoji: '🥈'},
  gold:     {bg: '#FFD70020', text: '#B8860B', emoji: '🥇'},
  platinum: {bg: colors.primaryFaint, text: colors.primary, emoji: '💎'},
};

// Demo data for when backend endpoint isn't yet implemented
const DEMO_CUSTOMERS: CustomerLoyalty[] = [
  {customer_id: 1, customer_name: 'Ramesh Kumar',   phone: '9876543210', total_points: 2840, redeemed_points: 400,  available_points: 2440, tier: 'gold',     total_spent: 28400, last_txn_date: '2026-05-20'},
  {customer_id: 2, customer_name: 'Priya Sharma',   phone: '9887654321', total_points: 1520, redeemed_points: 200,  available_points: 1320, tier: 'silver',   total_spent: 15200, last_txn_date: '2026-05-19'},
  {customer_id: 3, customer_name: 'Amit Patel',     phone: '9765432190', total_points: 640,  redeemed_points: 0,    available_points: 640,  tier: 'bronze',   total_spent: 6400,  last_txn_date: '2026-05-18'},
  {customer_id: 4, customer_name: 'Sunita Devi',    phone: '9654321087', total_points: 5200, redeemed_points: 1000, available_points: 4200, tier: 'platinum', total_spent: 52000, last_txn_date: '2026-05-20'},
  {customer_id: 5, customer_name: 'Vijay Singh',    phone: '9543210976', total_points: 320,  redeemed_points: 0,    available_points: 320,  tier: 'bronze',   total_spent: 3200,  last_txn_date: '2026-05-15'},
];

const DEFAULT_CONFIG: LoyaltyConfig = {
  enabled:               true,
  points_per_rupee:      0.1,    // 1 point per ₹10
  rupees_per_point:      0.1,    // 1 point = ₹0.10 redemption
  min_redemption_points: 100,
  max_redemption_pct:    20,
};

export const LoyaltyScreen: React.FC = () => {
  const {user}  = useAuth();
  const storeId = user?.store_id ?? 1;

  const [customers,  setCustomers]  = useState<CustomerLoyalty[]>([]);
  const [config,     setConfig]     = useState<LoyaltyConfig>(DEFAULT_CONFIG);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [custRes, cfgRes] = await Promise.all([
        api.get<{items: CustomerLoyalty[]}>('/loyalty/customers', {
          params: {store_id: storeId, page_size: 100},
        }),
        api.get<LoyaltyConfig>('/loyalty/config', {params: {store_id: storeId}}),
      ]);
      setCustomers(custRes.data.items ?? []);
      setConfig(cfgRes.data ?? DEFAULT_CONFIG);
      setIsDemoMode(false);
    } catch {
      setCustomers(DEMO_CUSTOMERS);
      setConfig(DEFAULT_CONFIG);
      setIsDemoMode(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? customers.filter(c => c.customer_name.toLowerCase().includes(search.toLowerCase()))
    : customers;

  const totalPoints   = customers.reduce((s, c) => s + c.available_points, 0);
  const totalRedeemed = customers.reduce((s, c) => s + c.redeemed_points,  0);
  const goldPlus      = customers.filter(c => c.tier === 'gold' || c.tier === 'platinum').length;

  return (
    <View style={styles.root}>
      {isDemoMode && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoBannerText}>📊 Demo data — loyalty backend coming soon</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={c => String(c.customer_id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* KPI row */}
            <View style={styles.kpiSection}>
              <KPIRow
                cards={[
                  {label: 'Points Active',  value: totalPoints.toLocaleString(),   icon: '⭐', accentColor: '#B8860B'},
                  {label: 'Redeemed',       value: totalRedeemed.toLocaleString(), icon: '🔄', accentColor: colors.success},
                  {label: 'Gold+ Members',  value: String(goldPlus),               icon: '💎', accentColor: colors.primary},
                  {label: 'Total Members',  value: String(customers.length),       icon: '👥', accentColor: colors.accent},
                ]}
              />
            </View>

            {/* Config card */}
            <View style={styles.configCard}>
              <Text style={styles.configTitle}>⚙️ Loyalty Rules</Text>
              <View style={styles.configRules}>
                <RuleItem
                  icon="🧾"
                  text={`Earn 1 point per ₹${Math.round(1 / config.points_per_rupee)} spent`}
                />
                <RuleItem
                  icon="🎁"
                  text={`1 point = ₹${config.rupees_per_point.toFixed(2)} discount`}
                />
                <RuleItem
                  icon="✅"
                  text={`Min ${config.min_redemption_points} points to redeem`}
                />
                <RuleItem
                  icon="📊"
                  text={`Max ${config.max_redemption_pct}% of bill redeemable`}
                />
              </View>
            </View>

            {/* Search + tier filter */}
            <View style={styles.searchRow}>
              <SearchBar
                value={search}
                onChangeText={setSearch}
                placeholder="Search members…"
                style={styles.searchBar}
              />
            </View>

            <SectionHeader title="Members Leaderboard" icon="🏆" />

            {loading && (
              <View style={styles.skeletonWrap}>
                <SkeletonListItem />
                <SkeletonListItem />
                <SkeletonListItem />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="⭐"
              title="No loyalty members yet"
              subtitle="Customers automatically join when they earn their first points at billing."
            />
          ) : null
        }
        renderItem={({item, index}) => (
          <LoyaltyCard customer={item} rank={index + 1} config={config} />
        )}
      />
    </View>
  );
};

// ─── Loyalty Card ─────────────────────────────────────────────────────────────

const LoyaltyCard: React.FC<{
  customer: CustomerLoyalty;
  rank:     number;
  config:   LoyaltyConfig;
}> = ({customer, rank, config}) => {
  const tierCfg    = TIER_COLOR[customer.tier];
  const redeemable = Math.floor(customer.available_points * config.rupees_per_point);

  return (
    <View style={[styles.card, rank === 1 && styles.cardFirst]}>
      {/* Rank */}
      <View style={styles.rankWrap}>
        <Text style={[styles.rankText, rank <= 3 && {color: '#B8860B'}]}>
          {rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : `#${rank}`}
        </Text>
      </View>

      {/* Customer info */}
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.customerName}>{customer.customer_name}</Text>
          <View style={[styles.tierBadge, {backgroundColor: tierCfg.bg}]}>
            <Text style={styles.tierEmoji}>{tierCfg.emoji}</Text>
            <Text style={[styles.tierText, {color: tierCfg.text}]}>
              {customer.tier.charAt(0).toUpperCase() + customer.tier.slice(1)}
            </Text>
          </View>
        </View>

        {customer.phone && (
          <Text style={styles.customerPhone}>{customer.phone}</Text>
        )}

        <View style={styles.pointsRow}>
          <View style={styles.pointsItem}>
            <Text style={styles.pointsValue}>⭐ {customer.available_points.toLocaleString()}</Text>
            <Text style={styles.pointsLabel}>Available</Text>
          </View>
          <View style={styles.pointsDivider} />
          <View style={styles.pointsItem}>
            <Text style={styles.pointsValue}>💰 {formatCurrency(redeemable)}</Text>
            <Text style={styles.pointsLabel}>Redeemable</Text>
          </View>
          <View style={styles.pointsDivider} />
          <View style={styles.pointsItem}>
            <Text style={styles.pointsValue}>{formatCurrency(customer.total_spent)}</Text>
            <Text style={styles.pointsLabel}>Total Spent</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

// ─── Rule Item ────────────────────────────────────────────────────────────────

const RuleItem: React.FC<{icon: string; text: string}> = ({icon, text}) => (
  <View style={styles.ruleItem}>
    <Text style={styles.ruleIcon}>{icon}</Text>
    <Text style={styles.ruleText}>{text}</Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},

  demoBanner: {
    backgroundColor: colors.warningFaint,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning + '30',
    padding:           spacing.sm,
    alignItems:        'center',
  },
  demoBannerText: {...typography.caption, color: colors.warningDark, fontWeight: '600'},

  listContent: {
    paddingBottom: spacing.xxl,
  },

  kpiSection: {
    padding:     spacing.md,
    paddingBottom: spacing.sm,
  },

  configCard: {
    backgroundColor:   colors.surface,
    marginHorizontal:  spacing.md,
    marginBottom:      spacing.sm,
    borderRadius:      radius.xl,
    padding:           spacing.md,
    borderWidth:       1,
    borderColor:       colors.border,
    ...shadows.xs,
  },
  configTitle: {...typography.h3, color: colors.text, marginBottom: spacing.sm},
  configRules: {gap: spacing.xs},
  ruleItem:    {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  ruleIcon:    {fontSize: 16, width: 24},
  ruleText:    {...typography.body2, color: colors.textSub},

  searchRow:   {paddingHorizontal: spacing.md, paddingBottom: spacing.xs},
  searchBar:   {},
  skeletonWrap:{paddingHorizontal: spacing.md, gap: spacing.xs},

  card: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    backgroundColor:   colors.surface,
    marginHorizontal:  spacing.md,
    marginBottom:      spacing.xs,
    borderRadius:      radius.xl,
    padding:           spacing.md,
    borderWidth:       1,
    borderColor:       colors.border,
    gap:               spacing.sm,
    ...shadows.xs,
  },
  cardFirst: {
    borderColor:       '#FFD700' + '50',
    backgroundColor:   '#FFFDF0',
  },

  rankWrap: {
    width:          32,
    alignItems:     'center',
    paddingTop:     2,
  },
  rankText: {
    ...typography.body1,
    fontWeight: '800',
    color:      colors.textMuted,
  },

  cardBody:    {flex: 1, gap: spacing.xs},
  cardTop: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            spacing.xs,
  },
  customerName:  {...typography.body1, color: colors.text, fontWeight: '700', flex: 1},
  customerPhone: {...typography.caption, color: colors.textMuted},

  tierBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    borderRadius:      radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
  },
  tierEmoji: {fontSize: 12},
  tierText:  {...typography.caption, fontWeight: '700'},

  pointsRow: {
    flexDirection:   'row',
    alignItems:      'center',
    marginTop:       spacing.xs,
    paddingTop:      spacing.xs,
    borderTopWidth:  1,
    borderTopColor:  colors.border,
  },
  pointsItem: {flex: 1, alignItems: 'center', gap: 2},
  pointsValue:{...typography.caption, color: colors.text, fontWeight: '700'},
  pointsLabel:{fontSize: 9, color: colors.textMuted, fontWeight: '600'},
  pointsDivider: {width: 1, height: 28, backgroundColor: colors.border},
});
