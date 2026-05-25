/**
 * OfflineBar — sync status indicator bar.
 * Shows offline / syncing / sync-error states with animated slide-in.
 */

import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {colors, spacing, typography} from '../../utils/theme';

type SyncStatus = 'online' | 'offline' | 'syncing' | 'error';

interface Props {
  status:     SyncStatus;
  queueCount?: number;
  onSync?:    () => void;
}

const STATUS_CONFIG: Record<SyncStatus, {bg: string; text: string; icon: string; label: string}> = {
  online:  {bg: colors.success,  text: '#fff', icon: '✓',  label: 'All synced'},
  offline: {bg: colors.warning,  text: '#fff', icon: '📴', label: 'Working offline — data saved locally'},
  syncing: {bg: colors.primary,  text: '#fff', icon: '↻',  label: 'Syncing…'},
  error:   {bg: colors.error,    text: '#fff', icon: '⚠',  label: 'Sync failed — tap to retry'},
};

export const OfflineBar: React.FC<Props> = ({status, queueCount, onSync}) => {
  const translateY = useRef(new Animated.Value(-48)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  const visible = status !== 'online';

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue:         visible ? 0 : -48,
        useNativeDriver: true,
        speed:           20,
        bounciness:      0,
      }),
      Animated.timing(opacity, {
        toValue:         visible ? 1 : 0,
        duration:        200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, translateY, opacity]);

  const cfg = STATUS_CONFIG[status];

  return (
    <Animated.View
      style={[
        styles.bar,
        {backgroundColor: cfg.bg, transform: [{translateY}], opacity},
      ]}>
      <Text style={[styles.icon, {color: cfg.text}]}>{cfg.icon}</Text>
      <Text style={[styles.label, {color: cfg.text}]} numberOfLines={1}>
        {cfg.label}
        {queueCount && queueCount > 0 ? ` · ${queueCount} pending` : ''}
      </Text>
      {(status === 'error' || status === 'offline') && onSync ? (
        <TouchableOpacity onPress={onSync} activeOpacity={0.8} style={styles.syncBtn}>
          <Text style={[styles.syncBtnText, {color: cfg.text}]}>Sync</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    gap:             spacing.xs,
  },
  icon: {
    fontSize:   13,
    fontWeight: '700',
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    flex:       1,
  },
  syncBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
    backgroundColor:   'rgba(255,255,255,0.25)',
    borderRadius:      20,
  },
  syncBtnText: {
    fontSize:   11,
    fontWeight: '700',
  },
});
