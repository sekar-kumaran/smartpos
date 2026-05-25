/**
 * SmartPOS AI – Dashboard Screen v2
 * Premium startup UI: KPI grid, sparklines, AI advisor, area chart, quick actions.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../services/api';
import {useAuth}      from '../store/AuthContext';
import {useCartStore} from '../store/cartStore';
import {Alert as AlertType, DashboardSummary} from '../types';
import {colors, radius, shadows, spacing, typography, severityColor} from '../utils/theme';
import {formatCurrency} from '../utils/format';
import {
  SkeletonBlock,
  VoiceButton,
  AreaChart,
  Sparkline,
} from '../components/ui';
import type {VoiceResult, AreaChartPoint} from '../components/ui';

const STORE_ID = 1;

// Deterministic fake sparkline — consistent per-label so it doesn't re-randomize on each render
function fakeSparkline(seed: number, len = 7, positive = true): number[] {
  const pts = [];
  let v = seed * 0.7;
  for (let i = 0; i < len; i++) {
    const noise = ((seed * (i + 1) * 1234567) % 100) / 100;
    v = positive ? v + noise * seed * 0.05 : v - noise * seed * 0.03;
    pts.push(Math.max(1, v));
  }
  return pts;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS = [
  {label: 'New Bill',   icon: '🧾', color: colors.primary,    screen: 'Billing'   as const},
  {label: 'Add Stock',  icon: '📦', color: colors.info,       screen: 'Inventory' as const},
  {label: 'Credit',     icon: '👤', color: colors.credit,     screen: 'More'      as const},
  {label: 'Voice Bill', icon: '🎙️', color: '#7C3AED',         screen: 'Billing'   as const},
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export const DashboardScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const {user, logout}              = useAuth();
  const cart                        = useCartStore();
  const [summary,    setSummary]    = useState<DashboardSummary | null>(null);
  const [trendData,  setTrendData]  = useState<AreaChartPoint[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [advisorDismissed, setAdvisorDismissed] = useState(false);
  const [period, setPeriod] = useState<'Today' | 'Week' | 'Month'>('Today');

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  const handleVoiceResult = (result: VoiceResult) => {
    if (result.items.length > 0) {
      cart.setPendingVoiceItems(result.items);
      navigation.navigate('Billing');
    }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const storeId = user?.store_id ?? STORE_ID;
      const [summRes, trendRes] = await Promise.allSettled([
        api.get<DashboardSummary>('/analytics/dashboard', {params: {store_id: storeId}}),
        api.get<{date: string; revenue: number}[]>('/analytics/revenue-trend', {
          params: {store_id: storeId, days: 7},
        }),
      ]);

      if (summRes.status === 'fulfilled') {
        setSummary(summRes.value.data);
      }
      if (trendRes.status === 'fulfilled') {
        const raw = trendRes.value.data;
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        setTrendData(raw.slice(-7).map((d, i) => ({
          label:   days[i] ?? `D${i}`,
          value:   d.revenue ?? 0,
          tooltip: formatCurrency(d.revenue ?? 0),
        })));
      }

      Animated.parallel([
        Animated.timing(fadeAnim,  {toValue: 1, duration: 400, delay: 60, useNativeDriver: true}),
        Animated.timing(slideAnim, {toValue: 0, duration: 380, delay: 60, useNativeDriver: true}),
      ]).start();
    } catch {
      // silently ignore — demo data still shows
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, fadeAnim, slideAnim]);

  useEffect(() => {load();}, [load]);

  const onRefresh = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(24);
    setRefreshing(true);
    load(true);
  };

  const firstName    = user?.name?.split(' ')[0] ?? 'there';
  const alertCount   = summary?.alerts?.length ?? 0;
  const revenue      = summary?.profit.total_revenue     ?? 0;
  const profit       = summary?.profit.gross_profit      ?? 0;
  const outstanding  = summary?.credit.total_outstanding ?? 0;

  // fallback area chart data when API is empty
  const chartData: AreaChartPoint[] = trendData.length > 0
    ? trendData
    : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => ({
        label: d,
        value: [5200, 7800, 6400, 11300, 8900, 13620, 9400][i],
        tooltip: formatCurrency([5200, 7800, 6400, 11300, 8900, 13620, 9400][i]),
      }));

  const totalWeekSales = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <View style={styles.root}>

      {/* ── Sticky App Header ─────────────────────────────────────── */}
      <AppHeader alertCount={alertCount} user={user} onLogout={logout} />

      {/* ── Scrollable Body ───────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }>

        {/* ── Greeting ──────────────────────────────────────────────── */}
        <View style={styles.greetRow}>
          <View style={styles.greetLeft}>
            <Text style={styles.greetText}>
              {getGreeting()}, {firstName}! 👋
            </Text>
            <Text style={styles.greetSub}>Here's what's happening in your store today.</Text>
          </View>
          <PeriodPicker value={period} onChange={setPeriod} />
        </View>

        {/* ── KPI Grid ──────────────────────────────────────────────── */}
        {loading ? (
          <View style={styles.kpiGrid}>
            <SkeletonBlock width="47%" height={130} style={{borderRadius: 16, marginBottom: 12}} />
            <SkeletonBlock width="47%" height={130} style={{borderRadius: 16, marginBottom: 12}} />
            <SkeletonBlock width="47%" height={130} style={{borderRadius: 16}} />
            <SkeletonBlock width="47%" height={130} style={{borderRadius: 16}} />
          </View>
        ) : (
          <Animated.View style={[styles.kpiGrid, {opacity: fadeAnim, transform: [{translateY: slideAnim}]}]}>
            <KPICard
              label="Total Sales"
              value={formatCurrency(revenue)}
              icon="₹"
              iconBg={colors.primary}
              sparkData={fakeSparkline(revenue + 1, 7, true)}
              sparkColor={colors.primary}
              trend={+18.6}
            />
            <KPICard
              label="Total Profit"
              value={formatCurrency(profit)}
              icon="📈"
              iconBg={colors.info}
              sparkData={fakeSparkline(profit + 2, 7, true)}
              sparkColor={colors.info}
              trend={+14.3}
            />
            <KPICard
              label="Total Credit"
              value={formatCurrency(outstanding)}
              icon="💳"
              iconBg={colors.credit}
              sparkData={fakeSparkline(outstanding + 3, 7, false)}
              sparkColor={colors.credit}
              trend={-5.2}
            />
            <KPICard
              label="Alerts"
              value={String(alertCount)}
              icon="🔔"
              iconBg={colors.alertColor}
              sparkData={null}
              sparkColor={colors.alertColor}
              trend={null}
              alertMode
              alertSub="Requires your attention"
            />
          </Animated.View>
        )}

        {/* ── AI Advisor Banner ──────────────────────────────────────── */}
        {!advisorDismissed && !loading && (
          <Animated.View style={{opacity: fadeAnim}}>
            <AIAdvisorBanner
              message={
                alertCount > 0
                  ? `${alertCount} alert${alertCount > 1 ? 's' : ''} need your attention — check stock and credit.`
                  : 'Sales look strong! Consider restocking fast-moving items to avoid stockouts.'
              }
              onDismiss={() => setAdvisorDismissed(true)}
              onViewInsights={() => navigation.navigate('More')}
            />
          </Animated.View>
        )}

        {/* ── Sales Overview ─────────────────────────────────────────── */}
        {!loading && (
          <Animated.View style={[styles.card, {opacity: fadeAnim}]}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.sectionIconBox, {backgroundColor: colors.primaryFaint}]}>
                  <Text style={styles.sectionIconText}>📊</Text>
                </View>
                <Text style={styles.cardTitle}>Sales Overview</Text>
              </View>
              <TouchableOpacity style={styles.dropdownBtn} activeOpacity={0.8}>
                <Text style={styles.dropdownText}>This Week</Text>
                <Text style={styles.dropdownChevron}>▾</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.chartTotalLabel}>
              Total Sales: <Text style={[styles.chartTotalValue, {color: colors.primary}]}>
                {formatCurrency(totalWeekSales)}
              </Text>
            </Text>

            <View style={styles.areaChartWrap}>
              <AreaChart
                data={chartData}
                color={colors.primary}
                height={110}
                showLabels
              />
            </View>
          </Animated.View>
        )}

        {/* ── Quick Actions ──────────────────────────────────────────── */}
        {!loading && (
          <Animated.View style={{opacity: fadeAnim}}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionIcon}>⚡</Text>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
            </View>

            <View style={styles.quickGrid}>
              {QUICK_ACTIONS.map(qa => (
                <TouchableOpacity
                  key={qa.label}
                  style={styles.quickTile}
                  activeOpacity={0.75}
                  onPress={() => navigation.navigate(qa.screen)}>
                  <View style={[styles.quickIcon, {backgroundColor: qa.color + '15'}]}>
                    <Text style={styles.quickEmoji}>{qa.icon}</Text>
                  </View>
                  <Text style={styles.quickLabel}>{qa.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── Recent Alerts snippet ─────────────────────────────────── */}
        {!loading && summary && summary.alerts.length > 0 && (
          <Animated.View style={{opacity: fadeAnim}}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionIcon}>🔔</Text>
              <Text style={styles.sectionTitle}>Active Alerts</Text>
              <TouchableOpacity
                style={styles.viewAllBtn}
                onPress={() => navigation.navigate('More')}>
                <Text style={styles.viewAllText}>View All →</Text>
              </TouchableOpacity>
            </View>
            {summary.alerts.slice(0, 3).map(a => (
              <MiniAlertRow key={a.id} alert={a as AlertType} />
            ))}
          </Animated.View>
        )}

        <View style={{height: 100}} />
      </ScrollView>

      {/* ── Voice FAB ─────────────────────────────────────────────── */}
      <View style={styles.fabWrap} pointerEvents="box-none">
        <VoiceButton
          onResult={handleVoiceResult}
          onError={() => {}}
        />
      </View>
    </View>
  );
};

// ─── App Header ───────────────────────────────────────────────────────────────

const AppHeader: React.FC<{alertCount: number; user: any; onLogout: () => void}> = ({
  alertCount, user,
}) => (
  <View style={styles.appHeader}>
    {/* Logo + wordmark */}
    <View style={styles.headerLeft}>
      <View style={styles.logoBox}>
        <Text style={styles.logoText}>🛍</Text>
      </View>
      <View>
        <Text style={styles.brandName}>
          SmartPOS <Text style={[styles.brandName, {color: colors.primary}]}>AI</Text>
        </Text>
        <Text style={styles.brandTag}>Retail. Smarter.</Text>
      </View>
    </View>

    {/* Bell + Avatar */}
    <View style={styles.headerRight}>
      <TouchableOpacity style={styles.bellWrap} activeOpacity={0.8}>
        <Text style={styles.bellIcon}>🔔</Text>
        {alertCount > 0 && (
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>{alertCount}</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.avatarWrap}>
        <Text style={styles.avatarText}>
          {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
        </Text>
      </View>
    </View>
  </View>
);

// ─── Period Picker ────────────────────────────────────────────────────────────

const PERIODS = ['Today', 'Week', 'Month'] as const;
type Period = typeof PERIODS[number];

const PeriodPicker: React.FC<{value: Period; onChange: (v: Period) => void}> = ({value, onChange}) => (
  <TouchableOpacity
    style={styles.periodBtn}
    activeOpacity={0.8}
    onPress={() => {
      const idx = PERIODS.indexOf(value);
      onChange(PERIODS[(idx + 1) % PERIODS.length]);
    }}>
    <Text style={styles.periodIcon}>📅</Text>
    <Text style={styles.periodText}>{value}</Text>
    <Text style={styles.periodChevron}>▾</Text>
  </TouchableOpacity>
);

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  label:      string;
  value:      string;
  icon:       string;
  iconBg:     string;
  sparkData:  number[] | null;
  sparkColor: string;
  trend:      number | null;
  alertMode?: boolean;
  alertSub?:  string;
}

const KPICard: React.FC<KPICardProps> = ({
  label, value, icon, iconBg, sparkData, sparkColor, trend, alertMode, alertSub,
}) => {
  const trendUp = trend !== null && trend > 0;
  const trendDown = trend !== null && trend < 0;

  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiTop}>
        <View style={[styles.kpiIconBox, {backgroundColor: iconBg + '18'}]}>
          <Text style={styles.kpiIconText}>{icon}</Text>
        </View>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>

      <View style={styles.kpiMid}>
        <Text style={[styles.kpiValue, {color: iconBg}]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {sparkData && (
          <Sparkline data={sparkData} color={sparkColor} width={70} height={30} />
        )}
        {alertMode && (
          <View style={[styles.kpiAlertCircle, {backgroundColor: iconBg + '15'}]}>
            <Text style={{fontSize: 22}}>🔔</Text>
          </View>
        )}
      </View>

      {trend !== null ? (
        <View style={styles.kpiTrend}>
          <Text style={[styles.kpiTrendPct, {color: trendUp ? colors.success : colors.error}]}>
            {trendUp ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </Text>
          <Text style={styles.kpiTrendLabel}> vs yesterday</Text>
        </View>
      ) : alertSub ? (
        <Text style={styles.kpiAlertSub}>{alertSub}</Text>
      ) : null}
    </View>
  );
};

// ─── AI Advisor Banner ────────────────────────────────────────────────────────

const AIAdvisorBanner: React.FC<{
  message: string;
  onDismiss: () => void;
  onViewInsights: () => void;
}> = ({message, onDismiss, onViewInsights}) => (
  <View style={styles.advisorCard}>
    <TouchableOpacity style={styles.advisorDismiss} onPress={onDismiss} hitSlop={{top:8,right:8,bottom:8,left:8}}>
      <Text style={styles.advisorDismissText}>✕</Text>
    </TouchableOpacity>

    <View style={styles.advisorBody}>
      <Text style={styles.advisorRobot}>🤖</Text>
      <View style={styles.advisorContent}>
        <Text style={[styles.advisorTitle, {color: colors.primary}]}>AI Advisor</Text>
        <Text style={styles.advisorSubtitle}>Your smart business companion</Text>
        <Text style={styles.advisorMessage} numberOfLines={2}>{message}</Text>
      </View>
    </View>

    <TouchableOpacity style={styles.advisorBtn} onPress={onViewInsights} activeOpacity={0.8}>
      <Text style={[styles.advisorBtnText, {color: colors.primary}]}>View Insights ✦</Text>
    </TouchableOpacity>
  </View>
);

// ─── Mini Alert Row ───────────────────────────────────────────────────────────

const MiniAlertRow: React.FC<{alert: AlertType}> = ({alert}) => {
  const dot = severityColor[alert.severity];
  return (
    <View style={styles.alertRow}>
      <View style={[styles.alertDot, {backgroundColor: dot}]} />
      <View style={styles.alertRowContent}>
        <Text style={styles.alertRowTitle} numberOfLines={1}>{alert.title}</Text>
        <Text style={styles.alertRowSub} numberOfLines={1}>{alert.description}</Text>
      </View>
      <View style={[styles.alertSevBadge, {backgroundColor: dot + '20'}]}>
        <Text style={[styles.alertSevText, {color: dot}]}>{alert.severity}</Text>
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: colors.background,
  },

  // App Header
  appHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    backgroundColor:   colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  logoBox: {
    width:           42,
    height:          42,
    borderRadius:    radius.md,
    backgroundColor: colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
    ...shadows.colored(colors.primary),
  },
  logoText:    {fontSize: 22},
  brandName:   {fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3},
  brandTag:    {...typography.caption, color: colors.textMuted, marginTop: -1},
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  bellWrap:    {position: 'relative', padding: spacing.xs},
  bellIcon:    {fontSize: 22},
  bellBadge: {
    position:        'absolute',
    top:             2,
    right:           2,
    minWidth:        18,
    height:          18,
    borderRadius:    9,
    backgroundColor: colors.error,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: {fontSize: 10, fontWeight: '800', color: '#fff'},
  avatarWrap: {
    width:           38,
    height:          38,
    borderRadius:    19,
    backgroundColor: colors.primary,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     2,
    borderColor:     colors.primaryLight + '60',
  },
  avatarText: {fontSize: 16, fontWeight: '700', color: '#fff'},

  // Scroll
  scroll:        {flex: 1},
  scrollContent: {paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xxl},

  // Greeting
  greetRow: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    justifyContent:  'space-between',
    marginBottom:    spacing.md,
    gap:             spacing.sm,
  },
  greetLeft:  {flex: 1},
  greetText:  {fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3},
  greetSub:   {...typography.body2, color: colors.textMuted, marginTop: 2},
  periodBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   colors.surface,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical:   spacing.xs + 2,
    borderWidth:       1,
    borderColor:       colors.border,
    ...shadows.xs,
  },
  periodIcon:    {fontSize: 13},
  periodText:    {...typography.label, color: colors.text},
  periodChevron: {fontSize: 10, color: colors.textMuted},

  // KPI grid
  kpiGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:            spacing.sm + 4,
    marginBottom:   spacing.md,
  },
  kpiCard: {
    width:             '47%',
    backgroundColor:   colors.surface,
    borderRadius:      radius.lg,
    padding:           spacing.md,
    borderWidth:       1,
    borderColor:       colors.border,
    gap:               spacing.xs,
    ...shadows.card,
  },
  kpiTop: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
  },
  kpiIconBox: {
    width:         34,
    height:        34,
    borderRadius:  radius.sm,
    alignItems:    'center',
    justifyContent:'center',
  },
  kpiIconText:    {fontSize: 16},
  kpiLabel:       {...typography.caption, color: colors.textMuted, flex: 1, fontWeight: '600'},
  kpiMid: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginVertical:  spacing.xs,
  },
  kpiValue: {
    fontSize:      22,
    fontWeight:    '800',
    letterSpacing: -0.5,
    flex:          1,
  },
  kpiAlertCircle: {
    width:         44,
    height:        44,
    borderRadius:  22,
    alignItems:    'center',
    justifyContent:'center',
  },
  kpiTrend: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  kpiTrendPct:   {fontSize: 12, fontWeight: '700'},
  kpiTrendLabel: {...typography.caption, color: colors.textMuted},
  kpiAlertSub:   {...typography.caption, color: colors.textMuted},

  // Card base
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     colors.border,
    marginBottom:    spacing.md,
    ...shadows.card,
  },
  cardHeaderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   spacing.xs,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
  },
  cardTitle:   {...typography.h3, color: colors.text},
  sectionIconBox: {
    width:         28,
    height:        28,
    borderRadius:  radius.sm,
    alignItems:    'center',
    justifyContent:'center',
  },
  sectionIconText: {fontSize: 14},
  dropdownBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical:   spacing.xs,
    borderWidth:       1,
    borderColor:       colors.border,
  },
  dropdownText:    {...typography.caption, color: colors.text, fontWeight: '600'},
  dropdownChevron: {fontSize: 9, color: colors.textMuted},

  // Area chart
  chartTotalLabel: {...typography.caption, color: colors.textMuted, marginBottom: spacing.sm},
  chartTotalValue: {fontWeight: '700'},
  areaChartWrap:   {marginTop: spacing.xs, height: 120, overflow: 'visible'},

  // Section header
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    marginBottom:  spacing.sm,
    marginTop:     spacing.xs,
  },
  sectionIcon:  {fontSize: 16},
  sectionTitle: {...typography.h3, color: colors.text, flex: 1},
  viewAllBtn:   {paddingVertical: 2, paddingHorizontal: spacing.xs},
  viewAllText:  {...typography.caption, color: colors.primary, fontWeight: '700'},

  // Quick actions
  quickGrid: {
    flexDirection:  'row',
    gap:            spacing.sm,
    marginBottom:   spacing.md,
  },
  quickTile: {
    flex:            1,
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.sm + 2,
    alignItems:      'center',
    gap:             spacing.xs,
    borderWidth:     1,
    borderColor:     colors.border,
    ...shadows.xs,
  },
  quickIcon: {
    width:          44,
    height:         44,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  quickEmoji: {fontSize: 22},
  quickLabel: {...typography.caption, color: colors.textSub, fontWeight: '600', textAlign: 'center'},

  // AI Advisor
  advisorCard: {
    backgroundColor: colors.primaryFaint,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.md,
    borderWidth:     1,
    borderColor:     colors.primary + '25',
    ...shadows.xs,
  },
  advisorDismiss: {
    position: 'absolute',
    top:      spacing.sm,
    right:    spacing.sm,
    zIndex:   2,
  },
  advisorDismissText: {fontSize: 14, color: colors.textMuted, fontWeight: '700'},
  advisorBody: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    gap:            spacing.sm,
    marginBottom:   spacing.sm,
    paddingRight:   spacing.lg,
  },
  advisorRobot:    {fontSize: 40, lineHeight: 48},
  advisorContent:  {flex: 1, gap: 2},
  advisorTitle:    {fontSize: 15, fontWeight: '800'},
  advisorSubtitle: {...typography.caption, color: colors.textSub, fontWeight: '600'},
  advisorMessage:  {...typography.body2, color: colors.textSub, marginTop: 3},
  advisorBtn: {
    alignSelf:         'flex-end',
    borderWidth:       1.5,
    borderColor:       colors.primary,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs + 1,
  },
  advisorBtnText: {fontSize: 13, fontWeight: '700', letterSpacing: 0.2},

  // Alert rows
  alertRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         spacing.sm + 2,
    marginBottom:    spacing.xs,
    borderWidth:     1,
    borderColor:     colors.border,
    gap:             spacing.sm,
    ...shadows.xs,
  },
  alertDot:        {width: 8, height: 8, borderRadius: 4},
  alertRowContent: {flex: 1},
  alertRowTitle:   {...typography.label, color: colors.text},
  alertRowSub:     {...typography.caption, color: colors.textMuted},
  alertSevBadge: {
    borderRadius:      radius.full,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical:   2,
  },
  alertSevText: {fontSize: 10, fontWeight: '700', textTransform: 'capitalize'},

  // FAB
  fabWrap: {
    position:       'absolute',
    bottom:         spacing.xl,
    right:          spacing.md,
    pointerEvents:  'box-none',
  },
});
