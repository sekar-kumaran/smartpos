/**
 * SmartPOS AI – Shift Screen
 * Open/close shifts with real-time running totals and cash reconciliation.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  Animated,
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
import {ShiftSession} from '../types';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';
import {formatCurrency, formatDate, timeAgo} from '../utils/format';
import {
  AnimatedPressable,
  AppButton,
  EmptyState,
  SkeletonBlock,
} from '../components/ui';

export const ShiftScreen: React.FC = () => {
  const {user} = useAuth();
  const storeId = user?.store_id ?? 1;

  const [currentShift, setCurrentShift] = useState<ShiftSession | null>(null);
  const [history,      setHistory]      = useState<ShiftSession[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [opening,      setOpening]      = useState(false);
  const [closing,      setClosing]      = useState(false);

  // Open shift form
  const [openingCash, setOpeningCash] = useState('0');
  const [openNotes,   setOpenNotes]   = useState('');

  // Close shift form
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes,  setCloseNotes]  = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);

  // Animated card entry
  const cardAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [currentRes, historyRes] = await Promise.all([
        api.get<ShiftSession | null>(`/shifts/current?store_id=${storeId}`),
        api.get<{items: ShiftSession[]}>(`/shifts?store_id=${storeId}&page_size=10`),
      ]);
      setCurrentShift(currentRes.data);
      setHistory(historyRes.data.items ?? []);

      if (currentRes.data) {
        setClosingCash(String(currentRes.data.expected_cash ?? 0));
      }
    } catch {
      setCurrentShift(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
      Animated.spring(cardAnim, {
        toValue: 1, useNativeDriver: true, speed: 10, bounciness: 4,
      }).start();
    }
  }, [storeId, cardAnim]);

  useEffect(() => { load(); }, [load]);

  const handleOpenShift = async () => {
    const cash = parseFloat(openingCash);
    if (isNaN(cash) || cash < 0) {
      Alert.alert('Invalid amount', 'Enter a valid opening cash amount.');
      return;
    }
    setOpening(true);
    try {
      const res = await api.post<ShiftSession>('/shifts/open', {
        store_id:     storeId,
        opening_cash: cash,
        notes:        openNotes || undefined,
      });
      setCurrentShift(res.data);
      setOpeningCash('0');
      setOpenNotes('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to open shift');
    } finally {
      setOpening(false);
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) return;
    const cash = parseFloat(closingCash);
    if (isNaN(cash) || cash < 0) {
      Alert.alert('Invalid amount', 'Enter the actual cash in drawer.');
      return;
    }
    const variance = cash - (currentShift.expected_cash ?? 0);
    const varStr = variance >= 0
      ? `+${formatCurrency(variance)} surplus`
      : `${formatCurrency(Math.abs(variance))} short`;

    Alert.alert(
      'Close Shift?',
      `Cash variance: ${varStr}\n\nThis will end the current shift and generate a reconciliation report.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Close Shift', style: 'destructive',
          onPress: async () => {
            setClosing(true);
            try {
              await api.post(`/shifts/${currentShift.id}/close`, {
                closing_cash: cash,
                notes: closeNotes || undefined,
              });
              setShowCloseForm(false);
              setCurrentShift(null);
              load(true);
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || 'Failed to close shift');
            } finally {
              setClosing(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <SkeletonBlock height={160} borderRadius={radius.xl} style={{marginBottom: spacing.md}} />
        <SkeletonBlock height={80} borderRadius={radius.lg} style={{marginBottom: spacing.xs}} />
        <SkeletonBlock height={80} borderRadius={radius.lg} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(true); }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }>

      {/* ── Active Shift Card ─────────────────────────────────── */}
      {currentShift ? (
        <Animated.View style={{
          opacity: cardAnim,
          transform: [{translateY: cardAnim.interpolate({inputRange: [0, 1], outputRange: [20, 0]})}],
        }}>
          <View style={styles.activeCard}>
            <View style={styles.activeCardHeader}>
              <View style={styles.shiftStatusPill}>
                <View style={styles.shiftDot} />
                <Text style={styles.shiftStatusText}>Shift Open</Text>
              </View>
              <Text style={styles.shiftTime}>{timeAgo(currentShift.opened_at)}</Text>
            </View>

            <Text style={styles.activeRevenue}>{formatCurrency(currentShift.total_revenue)}</Text>
            <Text style={styles.activeRevenueLabel}>Total Revenue this shift</Text>

            {/* Payment breakdown */}
            <View style={styles.breakdownRow}>
              <PaymentChip label="Cash" amount={currentShift.cash_sales} color={colors.success} />
              <PaymentChip label="UPI"  amount={currentShift.upi_sales}  color={colors.primary} />
              <PaymentChip label="Card" amount={currentShift.card_sales} color={colors.info} />
              <PaymentChip label="Credit" amount={currentShift.credit_sales} color={colors.warning} />
            </View>

            <View style={styles.metaRow}>
              <MetaStat label="Sales" value={String(currentShift.total_sales)} />
              <MetaStat label="Opening Cash" value={formatCurrency(currentShift.opening_cash)} />
              <MetaStat label="Expected Cash" value={formatCurrency(currentShift.expected_cash ?? 0)} />
            </View>

            {/* Close form */}
            {showCloseForm ? (
              <View style={styles.closeForm}>
                <Text style={styles.closeFormTitle}>Cash Reconciliation</Text>
                <Text style={styles.closeFormLabel}>Actual cash in drawer (₹)</Text>
                <TextInput
                  style={styles.closeFormInput}
                  value={closingCash}
                  onChangeText={setClosingCash}
                  keyboardType="numeric"
                  selectTextOnFocus
                  autoFocus
                  placeholderTextColor={colors.textMuted}
                />
                {closingCash !== '' && !isNaN(parseFloat(closingCash)) && (
                  <VarianceRow
                    actual={parseFloat(closingCash)}
                    expected={currentShift.expected_cash ?? 0}
                  />
                )}
                <TextInput
                  style={styles.closeFormNotes}
                  value={closeNotes}
                  onChangeText={setCloseNotes}
                  placeholder="Notes (optional)…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={2}
                />
                <View style={styles.closeFormActions}>
                  <AppButton
                    label="Cancel"
                    onPress={() => setShowCloseForm(false)}
                    variant="ghost"
                    size="md"
                    style={{flex: 1}}
                  />
                  <AppButton
                    label={closing ? 'Closing…' : 'Close Shift'}
                    onPress={handleCloseShift}
                    variant="danger"
                    size="md"
                    loading={closing}
                    style={{flex: 1}}
                  />
                </View>
              </View>
            ) : (
              <AnimatedPressable
                style={styles.closeBtn}
                onPress={() => setShowCloseForm(true)}
                scaleDown={0.97}>
                <Text style={styles.closeBtnText}>Close Shift</Text>
              </AnimatedPressable>
            )}
          </View>
        </Animated.View>
      ) : (
        /* ── Open New Shift ───────────────────────────────────── */
        <View style={styles.openCard}>
          <Text style={styles.openCardTitle}>Start New Shift</Text>
          <Text style={styles.openCardSub}>
            Opening a shift tracks all sales and enables cash reconciliation at the end.
          </Text>

          <Text style={styles.openLabel}>Opening cash in drawer (₹)</Text>
          <TextInput
            style={styles.openInput}
            value={openingCash}
            onChangeText={setOpeningCash}
            keyboardType="numeric"
            selectTextOnFocus
            placeholderTextColor={colors.textMuted}
          />

          <Text style={[styles.openLabel, {marginTop: spacing.sm}]}>Notes (optional)</Text>
          <TextInput
            style={styles.openNotes}
            value={openNotes}
            onChangeText={setOpenNotes}
            placeholder="e.g. Opened by Ravi at 9:00 AM"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={2}
          />

          <AppButton
            label={opening ? 'Opening…' : 'Open Shift'}
            onPress={handleOpenShift}
            variant="primary"
            size="lg"
            loading={opening}
            fullWidth
            style={{marginTop: spacing.md}}
          />
        </View>
      )}

      {/* ── Shift History ──────────────────────────────────────── */}
      {history.length > 0 && (
        <>
          <Text style={styles.historyTitle}>Recent Shifts</Text>
          {history.filter(s => s.status === 'closed').map(s => (
            <ShiftHistoryCard key={s.id} shift={s} />
          ))}
        </>
      )}

      {history.length === 0 && !currentShift && (
        <EmptyState
          icon="🕐"
          title="No shift history"
          subtitle="Your shift reports will appear here after you close a shift."
        />
      )}

      <View style={{height: spacing.xxl}} />
    </ScrollView>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const PaymentChip: React.FC<{label: string; amount: number; color: string}> = (
  {label, amount, color},
) => (
  <View style={[styles.paymentChip, {borderColor: color + '40', backgroundColor: color + '10'}]}>
    <Text style={[styles.paymentChipLabel, {color}]}>{label}</Text>
    <Text style={[styles.paymentChipAmt, {color}]}>{formatCurrency(amount)}</Text>
  </View>
);

const MetaStat: React.FC<{label: string; value: string}> = ({label, value}) => (
  <View style={styles.metaStat}>
    <Text style={styles.metaStatValue}>{value}</Text>
    <Text style={styles.metaStatLabel}>{label}</Text>
  </View>
);

const VarianceRow: React.FC<{actual: number; expected: number}> = ({actual, expected}) => {
  const variance = actual - expected;
  const isShort  = variance < 0;
  const color    = variance === 0 ? colors.success : isShort ? colors.error : colors.warning;
  const label    = variance === 0
    ? '✅ Exact match'
    : isShort
    ? `⚠️  Short by ${formatCurrency(Math.abs(variance))}`
    : `ℹ️  Surplus of ${formatCurrency(variance)}`;

  return (
    <View style={[styles.varianceRow, {backgroundColor: color + '12', borderColor: color + '30'}]}>
      <Text style={[styles.varianceText, {color}]}>{label}</Text>
    </View>
  );
};

const ShiftHistoryCard: React.FC<{shift: ShiftSession}> = ({shift}) => {
  const variance = (shift.closing_cash ?? 0) - (shift.expected_cash ?? 0);
  const varColor = variance === 0 ? colors.success : variance < 0 ? colors.error : colors.warning;

  return (
    <View style={styles.historyCard}>
      <View style={styles.historyCardHeader}>
        <Text style={styles.historyCardDate}>{formatDate(shift.opened_at)}</Text>
        <Text style={styles.historyCardBy}>{shift.opened_by_name ?? '—'}</Text>
      </View>
      <View style={styles.historyBreakdown}>
        <View style={styles.historyStatCol}>
          <Text style={styles.historyStatVal}>{shift.total_sales}</Text>
          <Text style={styles.historyStatLbl}>Sales</Text>
        </View>
        <View style={styles.historyStatCol}>
          <Text style={[styles.historyStatVal, {color: colors.success}]}>
            {formatCurrency(shift.total_revenue)}
          </Text>
          <Text style={styles.historyStatLbl}>Revenue</Text>
        </View>
        <View style={styles.historyStatCol}>
          <Text style={[styles.historyStatVal, {color: varColor}]}>
            {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
          </Text>
          <Text style={styles.historyStatLbl}>Variance</Text>
        </View>
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content:   {padding: spacing.md},

  // Active shift card
  activeCard: {
    backgroundColor: colors.primary,
    borderRadius:    radius.xl,
    padding:         spacing.lg,
    marginBottom:    spacing.md,
    ...shadows.lg,
  },
  activeCardHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   spacing.md,
  },
  shiftStatusPill: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius:    radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap:             6,
  },
  shiftDot:        {width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80'},
  shiftStatusText: {...typography.label, color: '#fff', fontWeight: '700'},
  shiftTime:       {...typography.caption, color: 'rgba(255,255,255,0.7)'},

  activeRevenue:      {...typography.display ?? typography.h1, color: '#fff', fontWeight: '900', fontSize: 36},
  activeRevenueLabel: {...typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 4, marginBottom: spacing.md},

  breakdownRow: {
    flexDirection: 'row',
    gap:           spacing.xs,
    marginBottom:  spacing.md,
    flexWrap:      'wrap',
  },
  paymentChip: {
    flex:            1,
    minWidth:        70,
    borderRadius:    radius.md,
    borderWidth:     1,
    padding:         spacing.xs,
    alignItems:      'center',
  },
  paymentChipLabel: {...typography.caption, fontWeight: '700', fontSize: 10},
  paymentChipAmt:   {...typography.label,   fontWeight: '800', fontSize: 12},

  metaRow: {
    flexDirection:   'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius:    radius.lg,
    padding:         spacing.sm,
    marginBottom:    spacing.md,
  },
  metaStat:      {flex: 1, alignItems: 'center'},
  metaStatValue: {...typography.label, color: '#fff', fontWeight: '800'},
  metaStatLabel: {...typography.caption, color: 'rgba(255,255,255,0.65)', marginTop: 2},

  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius:    radius.lg,
    paddingVertical: 12,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.3)',
  },
  closeBtnText: {...typography.button, color: '#fff'},

  // Close form
  closeForm: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius:    radius.lg,
    padding:         spacing.md,
    gap:             spacing.xs,
  },
  closeFormTitle: {...typography.label, color: '#fff', fontWeight: '800', marginBottom: 4},
  closeFormLabel: {...typography.caption, color: 'rgba(255,255,255,0.75)'},
  closeFormInput: {
    height:            48,
    backgroundColor:   'rgba(255,255,255,0.15)',
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.3)',
    paddingHorizontal: spacing.md,
    ...typography.h3,
    color:             '#fff',
    fontWeight:        '800',
  },
  closeFormNotes: {
    backgroundColor:   'rgba(255,255,255,0.1)',
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.md,
    paddingTop:        spacing.sm,
    ...typography.body2,
    color:             '#fff',
    height:            64,
    textAlignVertical: 'top',
  },
  closeFormActions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs},

  varianceRow: {
    borderRadius: radius.md,
    borderWidth:  1,
    padding:      spacing.sm,
    alignItems:   'center',
  },
  varianceText: {...typography.label, fontWeight: '700'},

  // Open shift card
  openCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.xl,
    padding:         spacing.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    marginBottom:    spacing.md,
    ...shadows.md,
  },
  openCardTitle: {...typography.h2, color: colors.text},
  openCardSub:   {...typography.body2, color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg, lineHeight: 20},
  openLabel:     {...typography.label, color: colors.textSub, marginBottom: 6},
  openInput: {
    height:            52,
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: spacing.md,
    ...typography.h3,
    color:             colors.text,
    fontWeight:        '800',
  },
  openNotes: {
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: spacing.md,
    paddingTop:        spacing.sm,
    ...typography.body2,
    color:             colors.text,
    height:            64,
    textAlignVertical: 'top',
  },

  // History
  historyTitle:  {...typography.h3, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.xs},
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
    borderWidth:     1,
    borderColor:     colors.border,
    ...shadows.xs,
  },
  historyCardHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginBottom:   spacing.sm,
  },
  historyCardDate: {...typography.label, color: colors.text, fontWeight: '700'},
  historyCardBy:   {...typography.caption, color: colors.textMuted},
  historyBreakdown:{flexDirection: 'row'},
  historyStatCol:  {flex: 1, alignItems: 'center'},
  historyStatVal:  {...typography.label, color: colors.text, fontWeight: '800'},
  historyStatLbl:  {...typography.caption, color: colors.textMuted, marginTop: 2},
});
