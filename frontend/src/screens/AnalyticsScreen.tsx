/**
 * SmartPOS AI – Analytics Screen
 * Revenue trend, top products, hourly heatmap — with animated bar chart.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import api from '../services/api';
import {demoHeatmap, demoRevenueTrend, demoTopProducts} from '../data/demo';
import {useAuth} from '../store/AuthContext';
import {HeatmapPoint, RevenueTrendPoint, TopProduct} from '../types';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';
import {formatCurrency, formatDate, toNumber} from '../utils/format';
import {SkeletonBlock, SectionHeader, AnimatedPressable} from '../components/ui';

export const AnalyticsScreen: React.FC = () => {
  const {user}  = useAuth();
  const storeId = user?.store_id ?? 1;

  const [days,         setDays]         = useState(14);
  const [trend,        setTrend]        = useState<RevenueTrendPoint[]>(demoRevenueTrend);
  const [topProducts,  setTopProducts]  = useState<TopProduct[]>(demoTopProducts);
  const [heatmap,      setHeatmap]      = useState<HeatmapPoint[]>(demoHeatmap);
  const [loading,      setLoading]      = useState(true);
  const [demoMode,     setDemoMode]     = useState(true);

  // Animated value for bar chart height reveals
  const barAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    setLoading(true);
    barAnim.setValue(0);
    try {
      const [trendRes, topRes, heatRes] = await Promise.all([
        api.get<RevenueTrendPoint[]>('/analytics/revenue-trend', {
          params: {store_id: storeId, days},
        }),
        api.get<TopProduct[]>('/analytics/top-products', {
          params: {store_id: storeId, limit: 8},
        }),
        api.get<HeatmapPoint[]>('/analytics/hourly-heatmap', {
          params: {store_id: storeId, days: Math.max(14, days)},
        }),
      ]);
      setTrend(trendRes.data.length      ? trendRes.data  : demoRevenueTrend);
      setTopProducts(topRes.data.length  ? topRes.data    : demoTopProducts);
      setHeatmap(heatRes.data.length     ? heatRes.data   : demoHeatmap);
      setDemoMode(!trendRes.data.length && !topRes.data.length);
    } catch {
      setTrend(demoRevenueTrend);
      setTopProducts(demoTopProducts);
      setHeatmap(demoHeatmap);
      setDemoMode(true);
    } finally {
      setLoading(false);
      // Animate bars in after data loads
      Animated.spring(barAnim, {
        toValue:         1,
        useNativeDriver: false,
        speed:           6,
        bounciness:      0,
      }).start();
    }
  }, [storeId, days, barAnim]);

  useEffect(() => { load(); }, [load]);

  const maxRevenue = useMemo(
    () => Math.max(1, ...trend.map(p => toNumber(p.revenue))),
    [trend],
  );
  const totalRevenue      = trend.reduce((s, p) => s + toNumber(p.revenue), 0);
  const totalTransactions = trend.reduce((s, p) => s + (p.transactions ?? 0), 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderLeft}>
          <Text style={styles.pageTitle}>Analytics</Text>
          <Text style={styles.pageSubtitle}>
            Revenue, product movement &amp; peak-hour patterns
          </Text>
        </View>
        {demoMode && (
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>Demo data</Text>
          </View>
        )}
      </View>

      {/* ── Date range picker ──────────────────────────────────── */}
      <View style={styles.rangeRow}>
        {([14, 30, 90] as const).map(option => (
          <AnimatedPressable
            key={option}
            style={[styles.rangeBtn, days === option && styles.rangeActive]}
            onPress={() => setDays(option)}
            scaleDown={0.94}>
            <Text style={[styles.rangeText, days === option && styles.rangeTextActive]}>
              {option}d
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      {/* ── KPI summary ────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}><SkeletonBlock height={22} width="60%" /><SkeletonBlock height={12} width="40%" style={{marginTop: 6}} /></View>
          <View style={styles.kpiCard}><SkeletonBlock height={22} width="60%" /><SkeletonBlock height={12} width="40%" style={{marginTop: 6}} /></View>
          <View style={styles.kpiCard}><SkeletonBlock height={22} width="60%" /><SkeletonBlock height={12} width="40%" style={{marginTop: 6}} /></View>
        </View>
      ) : (
        <View style={styles.kpiGrid}>
          <KpiCard
            label="Revenue"
            value={formatCurrency(totalRevenue)}
            icon="💰"
            color={colors.success}
          />
          <KpiCard
            label="Transactions"
            value={String(totalTransactions || '—')}
            icon="🧾"
            color={colors.primary}
          />
          <KpiCard
            label="Avg / Day"
            value={formatCurrency(totalRevenue / Math.max(1, trend.length))}
            icon="📅"
            color={colors.accent}
          />
        </View>
      )}

      {/* ── Revenue Trend ──────────────────────────────────────── */}
      <SectionHeader title="Revenue Trend" icon="📈" style={styles.sectionGap} />
      <View style={styles.card}>
        {loading ? (
          <View style={styles.chartSkeleton}>
            {Array.from({length: 14}).map((_, i) => (
              <SkeletonBlock
                key={i}
                width={`${100 / 14 - 1}%` as any}
                height={`${30 + Math.random() * 60}%` as any}
                style={{alignSelf: 'flex-end'}}
              />
            ))}
          </View>
        ) : (
          <View style={styles.chart}>
            {trend.map((point, i) => {
              const pct = Math.max(4, (toNumber(point.revenue) / maxRevenue) * 100);
              const barHeight = barAnim.interpolate({
                inputRange:  [0, 1],
                outputRange: [`0%`, `${pct}%`],
              });
              return (
                <View key={`${point.date}-${i}`} style={styles.barWrap}>
                  <Animated.View style={[styles.bar, {height: barHeight}]} />
                  {i % Math.ceil(trend.length / 7) === 0 ? (
                    <Text style={styles.axisLabel} numberOfLines={1}>
                      {formatDate(point.date).slice(0, 5)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Top Products ───────────────────────────────────────── */}
      <SectionHeader title="Top Products" icon="🏆" style={styles.sectionGap} />
      <View style={styles.card}>
        {loading ? (
          <>
            <SkeletonBlock height={14} width="80%" style={{marginBottom: 12}} />
            <SkeletonBlock height={14} width="65%" style={{marginBottom: 12}} />
            <SkeletonBlock height={14} width="70%" style={{marginBottom: 12}} />
          </>
        ) : (
          topProducts.map((item, i) => (
            <ProductRankRow key={`${item.product_name}-${i}`} item={item} rank={i + 1} />
          ))
        )}
      </View>

      {/* ── Hourly Heatmap ─────────────────────────────────────── */}
      <SectionHeader title="Peak Hours" icon="🕐" style={styles.sectionGap} />
      <View style={styles.card}>
        {loading ? (
          <View style={styles.heatGrid}>
            {Array.from({length: 12}).map((_, i) => (
              <SkeletonBlock key={i} width="23%" height={64} borderRadius={radius.lg} />
            ))}
          </View>
        ) : (
          <View style={styles.heatGrid}>
            {heatmap.map((point, i) => {
              const intensity = Math.min(1, toNumber(point.revenue) / 20000);
              const bg        = `rgba(79,70,229,${(0.10 + intensity * 0.75).toFixed(2)})`;
              const textColor = intensity > 0.4 ? '#fff' : colors.text;
              return (
                <View key={`${point.hour}-${i}`} style={[styles.heatCell, {backgroundColor: bg}]}>
                  <Text style={[styles.heatHour, {color: textColor}]}>{point.hour}:00</Text>
                  <Text style={[styles.heatValue, {color: textColor}]}>
                    {point.transactions}
                  </Text>
                  <Text style={[styles.heatSales, {color: textColor + 'CC'}]}>
                    {formatCurrency(toNumber(point.revenue))}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={{height: spacing.xxl}} />
    </ScrollView>
  );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{label: string; value: string; icon: string; color: string}> = (
  {label, value, icon, color},
) => (
  <View style={styles.kpiCard}>
    <View style={styles.kpiTop}>
      <View style={[styles.kpiIconWrap, {backgroundColor: color + '18'}]}>
        <Text style={styles.kpiIcon}>{icon}</Text>
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
    <Text style={[styles.kpiValue, {color}]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
  </View>
);

// ─── Product Rank Row ─────────────────────────────────────────────────────────

const ProductRankRow: React.FC<{item: TopProduct; rank: number}> = ({item, rank}) => {
  const RANK_COLORS = [colors.warning, colors.textMuted, '#CD7F32'];
  const rankColor   = RANK_COLORS[rank - 1] ?? colors.surfaceAlt;
  const isTop3      = rank <= 3;

  return (
    <View style={styles.productRow}>
      <View style={[styles.rankBadge, isTop3 && {backgroundColor: rankColor + '25'}]}>
        <Text style={[styles.rankText, isTop3 && {color: rankColor}]}>{rank}</Text>
      </View>
      <View style={styles.productMain}>
        <Text style={styles.productName} numberOfLines={1}>{item.product_name}</Text>
        <Text style={styles.productMeta}>{toNumber(item.qty_sold)} units sold</Text>
      </View>
      <Text style={styles.productRevenue}>{formatCurrency(item.revenue)}</Text>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.background,
  },
  content: {
    padding:       spacing.md,
    paddingBottom: spacing.xl,
  },

  pageHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   spacing.md,
  },
  pageHeaderLeft: {gap: 3},
  pageTitle:    {...typography.h2, color: colors.text},
  pageSubtitle: {...typography.caption, color: colors.textMuted},
  demoBadge: {
    backgroundColor: colors.warningFaint,
    borderRadius:    radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth:     1,
    borderColor:     colors.warning + '40',
  },
  demoBadgeText: {
    ...typography.caption,
    color:      colors.warningDark,
    fontWeight: '700',
  },

  // Date range
  rangeRow: {
    flexDirection: 'row',
    gap:           spacing.xs,
    marginBottom:  spacing.sm,
  },
  rangeBtn: {
    borderWidth:       1,
    borderColor:       colors.border,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   8,
    backgroundColor:   colors.surface,
  },
  rangeActive:    {backgroundColor: colors.primary, borderColor: colors.primary},
  rangeText:      {...typography.label, color: colors.textSub},
  rangeTextActive:{color: '#fff'},

  // KPI grid
  kpiGrid: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginBottom:  spacing.md,
  },
  kpiCard: {
    flex:            1,
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.sm + 2,
    ...shadows.card,
    gap:             spacing.xs,
  },
  kpiTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    marginBottom:  2,
  },
  kpiIconWrap: {
    width:          30,
    height:         30,
    borderRadius:   radius.sm,
    alignItems:     'center',
    justifyContent: 'center',
  },
  kpiIcon:  {fontSize: 15},
  kpiValue: {
    fontSize:      20,
    fontWeight:    '800',
    letterSpacing: -0.3,
  },
  kpiLabel: {...typography.caption, color: colors.textMuted, flex: 1, fontWeight: '600'},

  sectionGap: {
    marginTop: spacing.md,
  },

  // Card container
  card: {
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.xs,
    ...shadows.card,
  },

  // Chart
  chartSkeleton: {
    height:         180,
    flexDirection:  'row',
    alignItems:     'flex-end',
    gap:            4,
  },
  chart: {
    height:          180,
    flexDirection:   'row',
    alignItems:      'flex-end',
    gap:             3,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop:      spacing.sm,
    paddingBottom:   spacing.xs,
  },
  barWrap: {
    flex:           1,
    height:         '100%',
    justifyContent: 'flex-end',
    alignItems:     'center',
    gap:            3,
  },
  bar: {
    width:                 '82%',
    backgroundColor:       colors.primary,
    borderTopLeftRadius:   radius.xs,
    borderTopRightRadius:  radius.xs,
    minHeight:             4,
  },
  axisLabel: {
    ...typography.caption,
    color:    colors.textMuted,
    fontSize: 9,
  },

  // Top products
  productRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap:               spacing.sm,
  },
  rankBadge: {
    width:          28,
    height:         28,
    borderRadius:   radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems:     'center',
    justifyContent: 'center',
  },
  rankText:       {...typography.label, color: colors.textSub, fontWeight: '800'},
  productMain:    {flex: 1},
  productName:    {...typography.body2, color: colors.text, fontWeight: '700'},
  productMeta:    {...typography.caption, color: colors.textMuted, marginTop: 2},
  productRevenue: {...typography.body2, color: colors.text, fontWeight: '800'},

  // Heatmap
  heatGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.xs,
  },
  heatCell: {
    width:        '23%',
    minHeight:    68,
    borderRadius: radius.lg,
    padding:      spacing.xs + 2,
    justifyContent: 'space-between',
  },
  heatHour:  {...typography.caption, fontWeight: '800'},
  heatValue: {...typography.h3, fontWeight: '800'},
  heatSales: {fontSize: 9, fontWeight: '600'},
});
