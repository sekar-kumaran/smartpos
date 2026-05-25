import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import api from '../services/api';
import {demoSales} from '../data/demo';
import {useAuth} from '../store/AuthContext';
import {Paginated, Sale} from '../types';
import {colors, typography} from '../utils/theme';
import {formatCurrency, formatDateTime} from '../utils/format';

export const SalesScreen: React.FC = () => {
  const {user} = useAuth();
  const storeId = user?.store_id ?? 1;
  const [sales, setSales] = useState<Sale[]>(demoSales);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(true);
  const [selected, setSelected] = useState<Sale | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Paginated<Sale>>('/billing/sales', {
        params: {store_id: storeId, page_size: 50},
      });
      setSales(res.data.items.length ? res.data.items : demoSales);
      setDemoMode(res.data.items.length === 0);
    } catch {
      setSales(demoSales);
      setDemoMode(true);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const voidSale = async (sale: Sale) => {
    try {
      const res = await api.patch<Sale>(`/billing/sales/${sale.id}/void`);
      setSales(prev => prev.map(item => item.id === sale.id ? res.data : item));
      setSelected(res.data);
    } catch (err: any) {
      if (demoMode) {
        const next = {...sale, status: 'void' as const};
        setSales(prev => prev.map(item => item.id === sale.id ? next : item));
        setSelected(next);
      } else {
        Alert.alert('Void failed', err?.response?.data?.detail || 'Please try again.');
      }
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Sales History</Text>
          <Text style={styles.subtitle}>Invoices, payments, and void controls</Text>
        </View>
        {demoMode ? <Text style={styles.demoBadge}>Demo data</Text> : null}
      </View>

      <FlatList
        data={sales}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({item}) => (
          <Pressable style={styles.saleRow} onPress={() => setSelected(item)}>
            <View style={styles.saleMain}>
              <Text style={styles.invoice}>{item.invoice_number}</Text>
              <Text style={styles.meta}>{formatDateTime(item.invoice_date || item.created_at)} | {item.payment_method.toUpperCase()}</Text>
            </View>
            <View style={styles.amountBlock}>
              <Text style={styles.amount}>{formatCurrency(item.total_amount)}</Text>
              <Text style={[styles.status, item.status === 'void' && {color: colors.error}]}>{item.status.toUpperCase()}</Text>
            </View>
          </Pressable>
        )}
      />

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Invoice Detail</Text>
            <Text style={styles.invoiceLarge}>{selected?.invoice_number}</Text>
            <Info label="Amount" value={formatCurrency(selected?.total_amount)} />
            <Info label="Paid" value={formatCurrency(selected?.amount_paid)} />
            <Info label="Due" value={formatCurrency(selected?.amount_due)} />
            <Info label="Tax" value={formatCurrency(selected?.total_tax)} />
            <Info label="Status" value={selected?.status.toUpperCase() || '-'} />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setSelected(null)}>
                <Text style={styles.cancelText}>Close</Text>
              </Pressable>
              {selected?.status !== 'void' ? (
                <Pressable style={styles.voidBtn} onPress={() => selected && voidSale(selected)}>
                  <Text style={styles.voidText}>Void sale</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const Info = ({label, value}: {label: string; value: string}) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border},
  title: {...typography.h1, color: colors.text},
  subtitle: {...typography.body2, color: colors.textMuted},
  demoBadge: {...typography.caption, color: colors.warning, backgroundColor: colors.warning + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontWeight: '800'},
  list: {padding: 12, paddingBottom: 48},
  saleRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, marginBottom: 10},
  saleMain: {flex: 1},
  invoice: {...typography.body1, color: colors.text, fontWeight: '800'},
  meta: {...typography.caption, color: colors.textMuted, marginTop: 3},
  amountBlock: {alignItems: 'flex-end'},
  amount: {...typography.h3, color: colors.text},
  status: {...typography.caption, color: colors.success, fontWeight: '800'},
  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center'},
  modalBox: {width: '88%', maxWidth: 460, backgroundColor: colors.surface, borderRadius: 8, padding: 20, gap: 9},
  modalTitle: {...typography.h2, color: colors.text},
  invoiceLarge: {...typography.body2, color: colors.textMuted, marginBottom: 6},
  infoRow: {flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 7},
  infoLabel: {...typography.body2, color: colors.textMuted},
  infoValue: {...typography.body2, color: colors.text, fontWeight: '800'},
  modalActions: {flexDirection: 'row', gap: 10, marginTop: 8},
  cancelBtn: {flex: 1, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  cancelText: {...typography.button, color: colors.textMuted},
  voidBtn: {flex: 1, height: 44, backgroundColor: colors.error, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  voidText: {...typography.button, color: '#fff'},
});
