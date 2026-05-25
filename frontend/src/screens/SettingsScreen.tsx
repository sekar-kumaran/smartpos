import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {demoAccount, useAuth} from '../store/AuthContext';
import {demoCreditExposure, demoDashboard, demoInventoryHealth} from '../data/demo';
import {colors, typography} from '../utils/theme';
import {formatCurrency} from '../utils/format';

const storeProfile = {
  name: 'Sharma Kirana & Daily Needs',
  city: 'Bengaluru',
  gstin: '29ABCDE1234F1Z5',
  plan: 'Owner demo workspace',
  lastSeeded: '14 May 2026',
};

export const SettingsScreen: React.FC = () => {
  const {user, loginDemo} = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View>
          <Text style={styles.eyebrow}>Active demo account</Text>
          <Text style={styles.title}>{user?.name || 'Aarav Sharma'}</Text>
          <Text style={styles.subtitle}>{storeProfile.name}</Text>
        </View>
        <Pressable style={styles.refreshBtn} onPress={loginDemo}>
          <Text style={styles.refreshText}>Reset Demo</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        <InfoCard label="Role" value={user?.role || 'owner'} />
        <InfoCard label="Email" value={user?.email || demoAccount.email} />
        <InfoCard label="Store ID" value={String(user?.store_id ?? 1)} />
        <InfoCard label="Phone" value={user?.phone || '9876543210'} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Demo Access</Text>
        <InfoRow label="Email" value={demoAccount.email} />
        <InfoRow label="Mode" value="One-tap demo sign-in (no password stored)" />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Seeded Store Data</Text>
        <InfoRow label="Store" value={`${storeProfile.name}, ${storeProfile.city}`} />
        <InfoRow label="GSTIN" value={storeProfile.gstin} />
        <InfoRow label="Products" value={String(demoInventoryHealth.total_products)} />
        <InfoRow label="Today revenue" value={formatCurrency(demoDashboard.profit.total_revenue)} />
        <InfoRow label="Outstanding credit" value={formatCurrency(demoCreditExposure.total_outstanding)} />
        <InfoRow label="Last seeded" value={storeProfile.lastSeeded} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Completed Pages</Text>
        {[
          'Dashboard with KPIs, stock health, alerts, and quick actions',
          'Billing screen with product grid, GST preview, checkout, and receipt',
          'Inventory screen with search, low-stock filters, suppliers, and purchase orders',
          'Analytics screen with revenue trend, best sellers, and hourly heatmap',
        ].map(item => (
          <Text key={item} style={styles.check}>{item}</Text>
        ))}
      </View>
    </ScrollView>
  );
};

const InfoCard = ({label, value}: {label: string; value: string}) => (
  <View style={styles.infoCard}>
    <Text style={styles.infoValue}>{value}</Text>
    <Text style={styles.infoLabel}>{label}</Text>
  </View>
);

const InfoRow = ({label, value}: {label: string; value: string}) => (
  <View style={styles.infoRow}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  content: {padding: 16, paddingBottom: 44},
  hero: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  eyebrow: {...typography.caption, color: colors.primary, fontWeight: '800', textTransform: 'uppercase'},
  title: {...typography.h1, color: colors.text},
  subtitle: {...typography.body2, color: colors.textMuted, marginTop: 2},
  refreshBtn: {height: 40, justifyContent: 'center', borderRadius: 8, backgroundColor: colors.primary, paddingHorizontal: 14},
  refreshText: {...typography.caption, color: '#fff', fontWeight: '800'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12},
  infoCard: {width: '23.5%', minWidth: 150, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14},
  infoValue: {...typography.body1, color: colors.text, fontWeight: '800'},
  infoLabel: {...typography.caption, color: colors.textMuted, marginTop: 3},
  card: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 16, marginBottom: 12},
  cardTitle: {...typography.h3, color: colors.text, marginBottom: 10},
  infoRow: {flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border},
  rowLabel: {...typography.body2, color: colors.textMuted},
  rowValue: {...typography.body2, color: colors.text, fontWeight: '800', textAlign: 'right', flex: 1},
  check: {...typography.body2, color: colors.textSub, marginBottom: 8},
});
