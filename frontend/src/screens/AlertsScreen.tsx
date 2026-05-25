/**
 * SmartPOS AI – Alerts Screen
 * Business intelligence alerts with severity filtering and AI anomaly detection.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert as RNAlert,
  Animated,
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
import {Alert, AlertSeverity} from '../types';
import {colors, radius, shadows, spacing, typography, severityColor} from '../utils/theme';
import {timeAgo} from '../utils/format';
import {
  AnimatedPressable,
  AppButton,
  EmptyState,
  SkeletonListItem,
  SeverityBadge,
} from '../components/ui';

const ALERT_ICONS: Record<string, string> = {
  profit_drop:    '📉',
  low_stock:      '📦',
  overdue_credit: '💳',
  anomaly:        '🔍',
  fraud_suspect:  '🚫',
  price_change:   '🏷️',
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  low_stock:      'Low Stock',
  fraud_suspect:  'Fraud',
  overdue_credit: 'Credit',
  profit_drop:    'Profit',
  anomaly:        'Anomaly',
};

export const AlertsScreen: React.FC = () => {
  const {user} = useAuth();
  const storeId = user?.store_id ?? 1;

  const [alerts,     setAlerts]     = useState<Alert[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [runningAI,  setRunningAI]  = useState(false);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);

  const loadAlerts = useCallback(async (p = 1, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params: Record<string, any> = {store_id: storeId, page: p, page_size: 30};
      if (unreadOnly) params.unread_only = true;

      const res = await api.get<{total: number; page: number; items: Alert[]}>(
        '/analytics/alerts', {params},
      );
      setAlerts(p === 1 ? res.data.items : (prev: Alert[]) => [...prev, ...res.data.items]);
      setTotal(res.data.total);
      setPage(p);
    } catch (err: any) {
      RNAlert.alert('Error', err?.response?.data?.detail || 'Failed to load alerts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, unreadOnly]);

  useEffect(() => {loadAlerts(1);}, [loadAlerts]);

  const onRefresh = () => {setRefreshing(true); loadAlerts(1, true);};

  const markRead = async (alertId: number) => {
    try {
      await api.patch(`/analytics/alerts/${alertId}/read`);
      setAlerts((prev: Alert[]) => prev.map((a: Alert) => a.id === alertId ? {...a, is_read: true} : a));
    } catch {}
  };

  const resolve = async (alertId: number) => {
    try {
      await api.patch(`/analytics/alerts/${alertId}/resolve`);
      setAlerts((prev: Alert[]) => prev.filter((a: Alert) => a.id !== alertId));
      setTotal((t: number) => Math.max(0, t - 1));
    } catch {}
  };

  const runAnomalyDetection = async () => {
    setRunningAI(true);
    try {
      const res = await api.post('/analytics/run-anomaly-detection', null, {
        params: {store_id: storeId},
      });
      const count = res.data.alerts_created ?? 0;
      RNAlert.alert(
        'AI Analysis Complete',
        count === 0
          ? '✅ No anomalies detected. Your business looks healthy!'
          : `⚠️ ${count} new alert${count > 1 ? 's' : ''} generated. Check the list below.`,
      );
      loadAlerts(1, true);
    } catch (err: any) {
      RNAlert.alert('Error', err?.response?.data?.detail || 'Analysis failed.');
    } finally {
      setRunningAI(false);
    }
  };

  const unreadCount    = alerts.filter((a: Alert) => !a.is_read).length;
  const filteredAlerts = typeFilter
    ? alerts.filter((a: Alert) => a.alert_type === typeFilter)
    : alerts;

  return (
    <View style={styles.container}>

      {/* ── Header bar ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>
            {total > 0 ? `${total} Alert${total > 1 ? 's' : ''}` : 'Business Alerts'}
          </Text>
          {unreadCount > 0 && (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadPillText}>{unreadCount} unread</Text>
            </View>
          )}
        </View>
        <AppButton
          label={runningAI ? 'Analysing…' : '🤖 Run AI'}
          onPress={runAnomalyDetection}
          variant="primary"
          size="sm"
          loading={runningAI}
        />
      </View>

      {/* ── Filter chips ────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}>
        {[
          {key: null,             label: 'All'},
          {key: 'low_stock',      label: '📦 Stock'},
          {key: 'overdue_credit', label: '💳 Credit'},
          {key: 'fraud_suspect',  label: '🚫 Fraud'},
          {key: 'profit_drop',    label: '📉 Profit'},
        ].map(f => (
          <FilterChip
            key={f.key ?? 'all'}
            label={f.label}
            active={f.key === null ? (!unreadOnly && !typeFilter) : typeFilter === f.key}
            onPress={() => {
              setUnreadOnly(false);
              setTypeFilter((prev: string | null) => prev === f.key ? null : f.key);
            }}
          />
        ))}
        <FilterChip
          label="Unread"
          active={unreadOnly}
          onPress={() => { setUnreadOnly((v: boolean) => !v); setTypeFilter(null); }}
        />
      </ScrollView>

      {/* ── List ──────────────────────────────────────────────────── */}
      {loading && page === 1 ? (
        <View style={styles.skeletonList}>
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
          <SkeletonListItem />
        </View>
      ) : (
        <FlatList
          data={filteredAlerts}
          keyExtractor={(a: Alert) => String(a.id)}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon={typeFilter || unreadOnly ? '✅' : '🔔'}
              title={
                typeFilter
                  ? `No ${ALERT_TYPE_LABELS[typeFilter] ?? typeFilter} alerts`
                  : unreadOnly ? 'All caught up!'
                  : 'No alerts yet'
              }
              subtitle={
                typeFilter
                  ? 'Try a different filter or run an AI scan.'
                  : unreadOnly
                  ? 'No unread alerts right now.'
                  : 'Tap "Run AI" to scan for anomalies.'
              }
              actionLabel={!typeFilter && !unreadOnly ? 'Run AI Scan' : undefined}
              onAction={runAnomalyDetection}
            />
          }
          ListFooterComponent={
            alerts.length < total ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => loadAlerts(page + 1, true)}>
                <Text style={styles.loadMoreText}>Load more alerts</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({item, index}: {item: Alert; index: number}) => (
            <AlertCard
              alert={item}
              index={index}
              onRead={() => markRead(item.id)}
              onResolve={() => resolve(item.id)}
            />
          )}
        />
      )}
    </View>
  );
};

// ─── Filter Chip ──────────────────────────────────────────────────────────────

const FilterChip: React.FC<{label: string; active: boolean; onPress: () => void}> = (
  {label, active, onPress},
) => (
  <AnimatedPressable
    style={[styles.chip, active && styles.chipActive]}
    onPress={onPress}
    scaleDown={0.95}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </AnimatedPressable>
);

// ─── Alert Card ───────────────────────────────────────────────────────────────

const AlertCard: React.FC<{
  alert:     Alert;
  index:     number;
  onRead:    () => void;
  onResolve: () => void;
}> = ({alert, index, onRead, onResolve}) => {
  const color      = severityColor[alert.severity as AlertSeverity] ?? colors.info;
  const alertIcon  = ALERT_ICONS[alert.alert_type] ?? '🔔';
  const [expanded, setExpanded] = useState(false);

  const opacity    = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    {toValue: 1, duration: 260, delay: Math.min(index, 8) * 50, useNativeDriver: true}),
      Animated.timing(translateX, {toValue: 0, duration: 260, delay: Math.min(index, 8) * 50, useNativeDriver: true}),
    ]).start();
  }, [opacity, translateX, index]);

  const handlePress = () => {
    setExpanded((v: boolean) => !v);
    if (!alert.is_read) onRead();
  };

  return (
    <Animated.View style={{opacity, transform: [{translateX}]}}>
      <TouchableOpacity
        style={[
          styles.alertCard,
          {borderLeftColor: color},
          !alert.is_read && styles.alertCardUnread,
        ]}
        onPress={handlePress}
        activeOpacity={0.88}>

        <View style={styles.alertRow}>
          <View style={[styles.alertIconWrap, {backgroundColor: color + '18'}]}>
            <Text style={styles.alertTypeIcon}>{alertIcon}</Text>
          </View>

          <View style={styles.alertMeta}>
            <View style={styles.alertTitleRow}>
              <Text style={styles.alertTitle} numberOfLines={expanded ? undefined : 2}>
                {alert.title}
              </Text>
              {!alert.is_read && <View style={styles.unreadDot} />}
            </View>
            <View style={styles.alertInfo}>
              <SeverityBadge severity={alert.severity as any} />
              <Text style={styles.alertTime}>{timeAgo(alert.created_at)}</Text>
            </View>
          </View>

          <Text style={styles.expandChevron}>{expanded ? '▲' : '▼'}</Text>
        </View>

        {expanded && (
          <View style={styles.expandedContent}>
            <Text style={styles.alertDesc}>{alert.description}</Text>
            {!alert.is_resolved && (
              <AnimatedPressable
                style={styles.resolveBtn}
                onPress={onResolve}
                scaleDown={0.96}>
                <Text style={styles.resolveBtnText}>✓  Mark Resolved</Text>
              </AnimatedPressable>
            )}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    padding:           spacing.md,
    paddingBottom:     spacing.sm,
    backgroundColor:   colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap:               spacing.sm,
    ...shadows.xs,
  },
  headerLeft:     {flex: 1, gap: 3},
  headerTitle:    {...typography.h3, color: colors.text},
  unreadPill: {
    alignSelf:         'flex-start',
    backgroundColor:   colors.primaryFaint,
    borderRadius:      radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
  },
  unreadPillText: {...typography.caption, color: colors.primary, fontWeight: '700'},

  filterRow: {
    backgroundColor:   colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterRowContent: {
    flexDirection: 'row',
    gap:           spacing.xs,
    padding:       spacing.sm,
    paddingTop:    spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical:   6,
    borderRadius:      radius.full,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surfaceAlt,
  },
  chipActive:     {backgroundColor: colors.primary, borderColor: colors.primary},
  chipText:       {...typography.caption, color: colors.textSub, fontWeight: '600'},
  chipTextActive: {color: '#fff'},

  skeletonList: {
    padding: spacing.sm,
    gap:     spacing.xs,
  },
  listContent:  {padding: spacing.sm, paddingBottom: spacing.xxl},
  loadMoreBtn:  {alignItems: 'center', paddingVertical: spacing.md},
  loadMoreText: {...typography.body2, color: colors.primary, fontWeight: '600'},

  alertCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.sm + 2,
    marginBottom:    spacing.xs + 2,
    borderLeftWidth: 4,
    borderWidth:     1,
    borderColor:     colors.border,
    ...shadows.card,
  },
  alertCardUnread: {
    backgroundColor: colors.primaryFaint,
    borderColor:     colors.primary + '25',
  },
  alertRow:    {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  alertIconWrap: {
    width:          36,
    height:         36,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  alertTypeIcon: {fontSize: 18},
  alertMeta:    {flex: 1},
  alertTitleRow:{flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 5},
  alertTitle:   {...typography.body2, color: colors.text, fontWeight: '600', flex: 1},
  unreadDot:    {
    width:        8,
    height:       8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    marginTop:    4,
    flexShrink:   0,
  },
  alertInfo:    {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  alertTime:    {...typography.caption, color: colors.textMuted},
  expandChevron:{...typography.caption, color: colors.textMuted, paddingTop: 4},
  expandedContent: {
    marginTop:  spacing.sm,
    paddingLeft: 44,
    gap:         spacing.sm,
  },
  alertDesc: {
    ...typography.body2,
    color:      colors.textSub,
    lineHeight: 20,
  },
  resolveBtn: {
    alignSelf:         'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical:   8,
    backgroundColor:   colors.successFaint,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.success + '40',
  },
  resolveBtnText: {...typography.caption, color: colors.success, fontWeight: '700'},
});
