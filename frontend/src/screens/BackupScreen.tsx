import React, {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import api from '../services/api';
import {useAuth} from '../store/AuthContext';
import {colors, typography} from '../utils/theme';
import {formatDateTime} from '../utils/format';

export const BackupScreen: React.FC = () => {
  const {user} = useAuth();
  const storeId = user?.store_id ?? 1;
  const isOwner = user?.role === 'owner' || !user;
  const [loading, setLoading] = useState<'create' | 'upload' | null>(null);
  const [result, setResult] = useState<any>(null);
  const [encrypted, setEncrypted] = useState('');
  const [preview, setPreview] = useState('');

  const createBackup = async (upload = false) => {
    setLoading(upload ? 'upload' : 'create');
    try {
      const res = await api.post(upload ? '/backup/upload' : '/backup/create', null, {params: {store_id: storeId}});
      setResult(res.data);
    } catch (err: any) {
      if (!isOwner) {
        Alert.alert('Owner only', 'Backup operations are restricted to store owners.');
      } else {
        setResult({
          filename: `smartpos-store-${storeId}-demo.enc`,
          size_bytes: 428812,
          created_at: new Date().toISOString(),
          store_id: storeId,
          message: upload ? 'Demo upload completed' : 'Demo backup created',
        });
      }
    } finally {
      setLoading(null);
    }
  };

  const restorePreview = async () => {
    if (!encrypted.trim()) {
      setPreview('Paste an encrypted backup blob to preview metadata.');
      return;
    }
    try {
      const res = await api.post('/backup/restore/preview', {encrypted_b64: encrypted.trim()});
      setPreview(JSON.stringify(res.data, null, 2));
    } catch {
      setPreview('Unable to preview this blob. Check that it was created by SmartPOS AI.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Backup</Text>
        <Text style={styles.subtitle}>Encrypted store export, cloud upload, and restore preview</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Owner Backup Controls</Text>
        <Text style={styles.cardText}>
          Create an encrypted snapshot of inventory, billing, credits, customers, and analytics records for this store.
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.primaryBtn} onPress={() => createBackup(false)} disabled={!!loading}>
            {loading === 'create' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create backup</Text>}
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => createBackup(true)} disabled={!!loading}>
            {loading === 'upload' ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryText}>Upload backup</Text>}
          </Pressable>
        </View>
      </View>

      {result ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Latest Backup</Text>
          <Info label="File" value={result.filename || '-'} />
          <Info label="Size" value={`${Math.round((result.size_bytes || 0) / 1024)} KB`} />
          <Info label="Created" value={formatDateTime(result.created_at)} />
          <Text style={styles.message}>{result.message}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Restore Preview</Text>
        <TextInput
          style={styles.textArea}
          value={encrypted}
          onChangeText={setEncrypted}
          placeholder="Paste encrypted_b64 here"
          placeholderTextColor={colors.textMuted}
          multiline
        />
        <Pressable style={styles.secondaryBtn} onPress={restorePreview}>
          <Text style={styles.secondaryText}>Preview restore</Text>
        </Pressable>
        {preview ? <Text style={styles.preview}>{preview}</Text> : null}
      </View>
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
  container: {flex: 1, backgroundColor: colors.background, padding: 16},
  header: {marginBottom: 12},
  title: {...typography.h1, color: colors.text},
  subtitle: {...typography.body2, color: colors.textMuted},
  card: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 16, marginBottom: 12},
  cardTitle: {...typography.h3, color: colors.text, marginBottom: 6},
  cardText: {...typography.body2, color: colors.textSub, marginBottom: 12},
  actions: {flexDirection: 'row', gap: 10},
  primaryBtn: {flex: 1, height: 46, backgroundColor: colors.primary, borderRadius: 8, alignItems: 'center', justifyContent: 'center'},
  primaryText: {...typography.button, color: '#fff'},
  secondaryBtn: {flex: 1, minHeight: 46, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12},
  secondaryText: {...typography.button, color: colors.primary},
  infoRow: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border},
  infoLabel: {...typography.body2, color: colors.textMuted},
  infoValue: {...typography.body2, color: colors.text, fontWeight: '800'},
  message: {...typography.body2, color: colors.success, marginTop: 10},
  textArea: {height: 110, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.text, verticalAlign: 'top', marginBottom: 10},
  preview: {...typography.caption, color: colors.textSub, marginTop: 10, backgroundColor: colors.surfaceAlt, padding: 10, borderRadius: 8},
});
