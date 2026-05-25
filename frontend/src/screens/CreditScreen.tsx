/**
 * SmartPOS AI – Credit Screen
 * Credit book with exposure summary, ledger, and repayment recording.
 */

import React, {useCallback, useEffect, useState} from 'react';
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
import {Credit, CreditExposure, CreditStatus, Paginated, PaymentMethod} from '../types';
import {colors, radius, shadows, spacing, typography} from '../utils/theme';
import {formatCurrency, formatDate, timeAgo} from '../utils/format';
import {SkeletonListItem, EmptyState, AnimatedPressable} from '../components/ui';

const STATUS_CONFIG: Record<CreditStatus, {color: string; label: string; icon: string}> = {
  open:    {color: colors.info,    label: 'Open',    icon: '🔵'},
  partial: {color: colors.warning, label: 'Partial',  icon: '🟡'},
  paid:    {color: colors.success, label: 'Paid',    icon: '✅'},
  overdue: {color: colors.error,   label: 'Overdue', icon: '🔴'},
};

export const CreditScreen: React.FC = () => {
  const {user} = useAuth();
  const storeId = user?.store_id ?? 1;

  const [credits,      setCredits]      = useState<Credit[]>([]);
  const [exposure,     setExposure]     = useState<CreditExposure | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [statusFilter, setStatusFilter] = useState<CreditStatus | 'all'>('all');
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);

  // Repayment modal
  const [repayTarget,  setRepayTarget]  = useState<Credit | null>(null);
  const [repayAmount,  setRepayAmount]  = useState('');
  const [repayMethod,  setRepayMethod]  = useState<PaymentMethod>('cash');
  const [repayLoading, setRepayLoading] = useState(false);

  // WhatsApp reminders
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [sendingBulk,       setSendingBulk]       = useState(false);
  const [waStatus,          setWaStatus]          = useState<{configured: boolean} | null>(null);

  useEffect(() => {
    api.get<{configured: boolean}>('/whatsapp/status').then(r => setWaStatus(r.data)).catch(() => {});
  }, []);

  const sendReminder = async (creditId: number) => {
    setSendingReminderId(creditId);
    try {
      await api.post('/whatsapp/send-reminder', {credit_id: creditId});
      Alert.alert('✅ Sent', 'WhatsApp reminder sent successfully.');
    } catch (err: any) {
      Alert.alert('Send Failed', err?.response?.data?.detail || 'Could not send reminder.');
    } finally {
      setSendingReminderId(null);
    }
  };

  const sendBulkOverdueReminders = async () => {
    setSendingBulk(true);
    try {
      const res = await api.post<{reminders_sent: number; skipped: number; total_overdue: number}>(
        `/whatsapp/send-overdue-reminders?store_id=${storeId}`,
      );
      Alert.alert(
        '📱 Reminders Sent',
        `Sent: ${res.data.reminders_sent} · Skipped: ${res.data.skipped} (no phone)\nTotal overdue: ${res.data.total_overdue}`,
      );
    } catch (err: any) {
      Alert.alert('Failed', err?.response?.data?.detail || 'Could not send reminders.');
    } finally {
      setSendingBulk(false);
    }
  };

  // New credit modal
  const [showNewCredit,    setShowNewCredit]    = useState(false);
  const [newAmount,        setNewAmount]        = useState('');
  const [newCustomerId,    setNewCustomerId]    = useState('');
  const [newDueDate,       setNewDueDate]       = useState('');
  const [newNotes,         setNewNotes]         = useState('');
  const [newCreditLoading, setNewCreditLoading] = useState(false);

  // ─── Load ────────────────────────────────────────────────────────

  const loadExposure = useCallback(async () => {
    try {
      const res = await api.get<CreditExposure>('/credit/exposure', {
        params: {store_id: storeId},
      });
      setExposure(res.data);
    } catch {}
  }, [storeId]);

  const loadCredits = useCallback(async (p = 1, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params: Record<string, any> = {store_id: storeId, page: p, page_size: 30};
      if (statusFilter !== 'all') params.status = statusFilter;

      const res = await api.get<Paginated<Credit>>('/credit/', {params});
      setCredits(p === 1 ? res.data.items : (prev: Credit[]) => [...prev, ...res.data.items]);
      setTotal(res.data.total);
      setPage(p);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Failed to load credits');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, statusFilter]);

  useEffect(() => {
    loadExposure();
    loadCredits(1);
  }, [loadExposure, loadCredits]);

  const onRefresh = () => {
    setRefreshing(true);
    loadExposure();
    loadCredits(1, true);
  };

  // ─── Repayment ───────────────────────────────────────────────────

  const submitRepayment = async () => {
    if (!repayTarget) return;
    const amount = parseFloat(repayAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a valid repayment amount.');
      return;
    }
    setRepayLoading(true);
    try {
      await api.post('/credit/repay', {
        credit_id: repayTarget.id,
        amount,
        method: repayMethod,
      });
      setRepayTarget(null);
      setRepayAmount('');
      loadExposure();
      loadCredits(1, true);
    } catch (err: any) {
      Alert.alert('Failed', err?.response?.data?.detail || 'Please try again.');
    } finally {
      setRepayLoading(false);
    }
  };

  // ─── New Credit ──────────────────────────────────────────

  const submitNewCredit = async () => {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a valid amount greater than zero.');
      return;
    }
    const customerId = parseInt(newCustomerId, 10);
    if (!newCustomerId.trim() || isNaN(customerId)) {
      Alert.alert('Customer Required', 'Enter the customer ID. Credit must be linked to a customer.');
      return;
    }
    setNewCreditLoading(true);
    try {
      const body: Record<string, any> = {store_id: storeId, amount, customer_id: customerId};
      if (newDueDate.trim())   body.due_date = newDueDate.trim();
      if (newNotes.trim())     body.notes    = newNotes.trim();
      await api.post('/credit/', body);
      setShowNewCredit(false);
      setNewAmount('');
      setNewCustomerId('');
      setNewDueDate('');
      setNewNotes('');
      loadExposure();
      loadCredits(1, true);
    } catch (err: any) {
      Alert.alert('Failed to Create', err?.response?.data?.detail || 'Please try again.');
    } finally {
      setNewCreditLoading(false);
    }
  };

  const statusTabs: (CreditStatus | 'all')[] = ['all', 'open', 'partial', 'overdue', 'paid'];

  return (
    <View style={styles.container}>

      {/* ── Exposure Summary ─────────────────────────────────────── */}
      {exposure && (
        <View style={styles.exposureCard}>
          <View style={styles.exposureRow}>
            <View style={styles.exposureMetric}>
              <Text style={styles.exposureLabel}>Outstanding</Text>
              <Text style={styles.exposureValue}>
                {formatCurrency(exposure.total_outstanding)}
              </Text>
            </View>

            <View style={styles.exposureDivider} />

            <View style={styles.exposureMetric}>
              <Text style={[styles.exposureLabel, {color: colors.error}]}>Overdue</Text>
              <Text style={[styles.exposureValue, {color: colors.error}]}>
                {formatCurrency(exposure.overdue_amount)}
              </Text>
            </View>

            <View style={styles.exposureDivider} />

            <View style={styles.exposureMetric}>
              <Text style={styles.exposureLabel}>Customers</Text>
              <Text style={styles.exposureValue}>{exposure.customer_count}</Text>
            </View>
          </View>

          {exposure.overdue_count > 0 && (
            <View style={styles.overdueWarning}>
              <Text style={styles.overdueWarningText}>
                🔴 {exposure.overdue_count} overdue account{exposure.overdue_count > 1 ? 's' : ''}
              </Text>
              {waStatus?.configured && (
                <TouchableOpacity
                  style={styles.bulkReminderBtn}
                  onPress={sendBulkOverdueReminders}
                  disabled={sendingBulk}
                  activeOpacity={0.8}>
                  {sendingBulk
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.bulkReminderText}>📱 Send All Reminders</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Status Tabs ──────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabRow}>
        {statusTabs.map(s => {
          const active   = statusFilter === s;
          const cfg      = s !== 'all' ? STATUS_CONFIG[s] : null;
          const label    = s === 'all' ? 'All' : cfg?.label ?? s;
          const tabColor = cfg?.color ?? colors.primary;
          return (
            <AnimatedPressable
              key={s}
              style={[styles.tab, active && {backgroundColor: tabColor, borderColor: tabColor}]}
              onPress={() => setStatusFilter(s)}
              scaleDown={0.94}>
              {cfg ? <Text style={styles.tabIcon}>{cfg.icon}</Text> : null}
              <Text style={[styles.tabText, active && {color: '#fff'}]}>{label}</Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>

      {/* ── Credit List ──────────────────────────────────────────── */}
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
          data={credits}
          keyExtractor={(c: Credit) => String(c.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="📒"
              title={statusFilter !== 'all' ? `No ${statusFilter} credits` : 'No credit records'}
              subtitle="Credit entries appear when a sale is completed on credit."
            />
          }
          ListFooterComponent={
            credits.length < total ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => loadCredits(page + 1, true)}>
                <Text style={styles.loadMoreText}>Load more</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({item}) => (
            <CreditCard
              credit={item}
              onRepay={() => {
                setRepayTarget(item);
                setRepayAmount(String(item.balance));
                setRepayMethod('cash');
              }}
              onWhatsApp={waStatus?.configured && item.status !== 'paid'
                ? () => sendReminder(item.id)
                : undefined}
              sendingWhatsApp={sendingReminderId === item.id}
            />
          )}
        />
      )}

      {/* ── Add Credit FAB ───────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowNewCredit(true)}
        activeOpacity={0.85}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      {/* ── New Credit Modal ──────────────────────────────────────── */}
      <Modal
        visible={showNewCredit}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewCredit(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add New Credit</Text>

            <Text style={styles.fieldLabel}>Amount (₹) *</Text>
            <TextInput
              style={styles.fieldInput}
              value={newAmount}
              onChangeText={setNewAmount}
              keyboardType="numeric"
              placeholder="Enter amount"
              placeholderTextColor={colors.textMuted}
              selectTextOnFocus
              autoFocus
            />

            <Text style={[styles.fieldLabel, {marginTop: spacing.sm}]}>Customer ID *</Text>
            <TextInput
              style={styles.fieldInput}
              value={newCustomerId}
              onChangeText={setNewCustomerId}
              keyboardType="numeric"
              placeholder="Enter customer ID (required)"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.fieldLabel, {marginTop: spacing.sm}]}>Due Date (optional)</Text>
            <TextInput
              style={styles.fieldInput}
              value={newDueDate}
              onChangeText={setNewDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.fieldLabel, {marginTop: spacing.sm}]}>Notes (optional)</Text>
            <TextInput
              style={[styles.fieldInput, styles.notesInput]}
              value={newNotes}
              onChangeText={setNewNotes}
              placeholder="Add a note…"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowNewCredit(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={submitNewCredit}
                disabled={newCreditLoading}>
                {newCreditLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmText}>Create Credit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Repayment Modal ──────────────────────────────────────── */}
      <Modal
        visible={!!repayTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setRepayTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>Record Payment</Text>
            <Text style={styles.modalBalance}>
              Balance Due:{' '}
              <Text style={styles.modalBalanceAmt}>
                {formatCurrency(repayTarget?.balance ?? 0)}
              </Text>
            </Text>

            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <TextInput
              style={styles.fieldInput}
              value={repayAmount}
              onChangeText={setRepayAmount}
              keyboardType="numeric"
              selectTextOnFocus
              placeholderTextColor={colors.textMuted}
            />

            <Text style={[styles.fieldLabel, {marginTop: spacing.sm}]}>Payment Method</Text>
            <View style={styles.methodRow}>
              {(['cash', 'upi', 'card'] as PaymentMethod[]).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodBtn, repayMethod === m && styles.methodBtnActive]}
                  onPress={() => setRepayMethod(m)}
                  activeOpacity={0.8}>
                  <Text style={[styles.methodText, repayMethod === m && {color: '#fff'}]}>
                    {m.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRepayTarget(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={submitRepayment}
                disabled={repayLoading}>
                {repayLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmText}>Record Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Credit Card ──────────────────────────────────────────────────────────────

const CreditCard: React.FC<{
  credit:          Credit;
  onRepay:         () => void;
  onWhatsApp?:     () => void;
  sendingWhatsApp?: boolean;
}> = ({credit, onRepay, onWhatsApp, sendingWhatsApp}) => {
  const cfg    = STATUS_CONFIG[credit.status];
  const paidPct = credit.amount > 0
    ? Math.min(100, (credit.amount_repaid / credit.amount) * 100)
    : 0;

  return (
    <View style={[styles.creditCard, {borderLeftColor: cfg.color}]}>

      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.creditId}>Credit #{credit.id}</Text>
          {credit.due_date && (
            <Text style={[
              styles.creditDue,
              credit.status === 'overdue' && {color: colors.error},
            ]}>
              Due: {formatDate(credit.due_date)}
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, {backgroundColor: cfg.color + '18'}]}>
          <Text style={styles.statusIcon}>{cfg.icon}</Text>
          <Text style={[styles.statusText, {color: cfg.color}]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[
          styles.progressFill,
          {width: `${paidPct}%` as any, backgroundColor: cfg.color},
        ]} />
      </View>

      {/* Amounts */}
      <View style={styles.amountsRow}>
        <AmountItem label="Total" value={formatCurrency(credit.amount)} />
        <AmountItem label="Paid" value={formatCurrency(credit.amount_repaid)} color={colors.success} />
        <AmountItem
          label="Balance"
          value={formatCurrency(credit.balance)}
          color={credit.balance > 0 ? colors.error : colors.success}
        />
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.cardTime}>{timeAgo(credit.created_at)}</Text>
        <View style={styles.cardActions}>
          {onWhatsApp && (
            <TouchableOpacity
              style={styles.waBtn}
              onPress={onWhatsApp}
              disabled={sendingWhatsApp}
              activeOpacity={0.8}>
              {sendingWhatsApp
                ? <ActivityIndicator color={colors.success} size="small" />
                : <Text style={styles.waBtnText}>📱 Remind</Text>
              }
            </TouchableOpacity>
          )}
          {credit.status !== 'paid' && (
            <AnimatedPressable style={styles.repayBtn} onPress={onRepay} scaleDown={0.95}>
              <Text style={styles.repayBtnText}>💳 Record Payment</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>
    </View>
  );
};

const AmountItem: React.FC<{label: string; value: string; color?: string}> = (
  {label, value, color},
) => (
  <View style={styles.amountItem}>
    <Text style={styles.amountLabel}>{label}</Text>
    <Text style={[styles.amountValue, color ? {color} : null]}>{value}</Text>
  </View>
);

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},

  // Exposure card
  exposureCard: {
    backgroundColor: colors.surface,
    margin:          spacing.sm,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    borderWidth:     1,
    borderColor:     colors.border,
    ...shadows.sm,
  },
  exposureRow:    {flexDirection: 'row', alignItems: 'center'},
  exposureMetric: {flex: 1, alignItems: 'center'},
  exposureLabel: {
    ...typography.caption,
    color:        colors.textMuted,
    marginBottom: 4,
    textAlign:    'center',
  },
  exposureValue: {
    ...typography.h2,
    color:    colors.text,
    fontSize: 18,
    textAlign:'center',
  },
  exposureDivider: {width: 1, height: 36, backgroundColor: colors.border},
  overdueWarning: {
    marginTop:       spacing.sm,
    paddingTop:      spacing.sm,
    borderTopWidth:  1,
    borderTopColor:  colors.border,
    alignItems:      'center',
    gap:             spacing.xs,
  },
  overdueWarningText: {...typography.caption, color: colors.error, fontWeight: '600'},
  bulkReminderBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#25D366',
    borderRadius:    radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    gap:             4,
  },
  bulkReminderText: {
    ...typography.label,
    color:      '#fff',
    fontWeight: '700',
  },

  // Tabs
  tabScroll: {
    backgroundColor:   colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    maxHeight:         52,
  },
  tabRow: {
    flexDirection: 'row',
    gap:           spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical:   spacing.xs,
    alignItems:    'center',
  },
  tab: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: spacing.sm,
    paddingVertical:   7,
    borderRadius:      radius.full,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surfaceAlt,
  },
  tabIcon: {fontSize: 12},
  tabText: {...typography.caption, color: colors.text, fontWeight: '600'},

  // Loading
  loadingWrap: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    gap:            spacing.sm,
  },
  loadingText: {...typography.body2, color: colors.textMuted},

  // List
  skeletonList: {padding: spacing.sm, gap: spacing.xs},
  listContent: {padding: spacing.sm, paddingBottom: spacing.xxl},

  loadMoreBtn:  {alignItems: 'center', paddingVertical: spacing.md},
  loadMoreText: {...typography.body2, color: colors.primary, fontWeight: '600'},

  // Credit card
  creditCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    marginBottom:    spacing.sm,
    borderLeftWidth: 4,
    borderWidth:     1,
    borderColor:     colors.border,
    ...shadows.card,
  },
  cardHeader:     {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm},
  cardHeaderLeft: {flex: 1},
  creditId:       {...typography.body1, color: colors.text, fontWeight: '700'},
  creditDue:      {...typography.caption, color: colors.textMuted, marginTop: 2},
  statusBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:      radius.md,
  },
  statusIcon: {fontSize: 12},
  statusText: {...typography.caption, fontWeight: '700'},

  progressBar: {
    height:           5,
    backgroundColor:  colors.border,
    borderRadius:     radius.full,
    marginBottom:     spacing.sm,
    overflow:         'hidden',
  },
  progressFill: {height: '100%', borderRadius: radius.full},

  amountsRow:  {flexDirection: 'row', marginBottom: spacing.sm},
  amountItem:  {flex: 1, alignItems: 'center'},
  amountLabel: {...typography.caption, color: colors.textMuted, marginBottom: 2},
  amountValue: {...typography.label, color: colors.text},

  cardFooter: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingTop:     spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cardTime:   {...typography.caption, color: colors.textMuted},
  cardActions: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
  },
  waBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.sm,
    paddingVertical:   6,
    backgroundColor:   '#25D366' + '15',
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       '#25D366' + '30',
    minWidth:          56,
    justifyContent:    'center',
  },
  waBtnText: {...typography.caption, color: '#1a9e4b', fontWeight: '700'},
  repayBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.sm,
    paddingVertical:   6,
    backgroundColor:   colors.success + '15',
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.success + '30',
  },
  repayBtnText: {...typography.caption, color: colors.success, fontWeight: '600'},

  // Modal
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent:  'flex-end',
  },
  modalSheet: {
    backgroundColor:      colors.surface,
    borderTopLeftRadius:  radius.xl,
    borderTopRightRadius: radius.xl,
    padding:              spacing.lg,
    paddingBottom:        spacing.xl + spacing.md,
    gap:                  spacing.sm,
  },
  modalHandle: {
    width:           40,
    height:          4,
    backgroundColor: colors.border,
    borderRadius:    radius.full,
    alignSelf:       'center',
    marginBottom:    spacing.sm,
  },
  modalTitle:      {...typography.h2, color: colors.text},
  modalBalance:    {...typography.body2, color: colors.textMuted},
  modalBalanceAmt: {color: colors.error, fontWeight: '700'},

  fieldLabel: {...typography.label, color: colors.text, marginBottom: 4},
  fieldInput: {
    height:            50,
    backgroundColor:   colors.surfaceAlt,
    borderRadius:      radius.md,
    borderWidth:       1,
    borderColor:       colors.border,
    paddingHorizontal: spacing.md,
    ...typography.body1,
    color:             colors.text,
    fontWeight:        '700',
  },

  methodRow: {flexDirection: 'row', gap: spacing.xs},
  methodBtn: {
    flex:            1,
    paddingVertical: 10,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    alignItems:      'center',
    backgroundColor: colors.surfaceAlt,
  },
  methodBtnActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  methodText:      {...typography.label, color: colors.text},

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
  cancelText:  {...typography.button, color: colors.textMuted},
  confirmBtn: {
    flex:            1,
    height:          50,
    backgroundColor: colors.success,
    borderRadius:    radius.lg,
    justifyContent:  'center',
    alignItems:      'center',
    ...shadows.sm,
  },
  confirmText: {...typography.button, color: '#fff'},

  // FAB
  fab: {
    position:        'absolute',
    bottom:          spacing.xl,
    right:           spacing.md,
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: colors.primary,
    justifyContent:  'center',
    alignItems:      'center',
    zIndex:          100,
    ...shadows.lg,
  },
  fabText: {
    color:      '#fff',
    fontSize:   28,
    fontWeight: '300',
    lineHeight: 32,
  },

  // Notes input
  notesInput: {
    height:           72,
    textAlignVertical:'top',
    paddingTop:       12,
  },
});
