/**
 * Badge — severity / status chip and count pill.
 */

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  Severity,
  StatusVariant,
  colors,
  radius,
  severityColor,
  statusColor,
  typography,
} from '../../utils/theme';

// ─── SeverityBadge ───────────────────────────────────────────────────────────

interface SeverityBadgeProps {
  severity: Severity;
  label?: string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({severity, label}) => {
  const color = severityColor[severity];
  const text  = label ?? (severity.charAt(0).toUpperCase() + severity.slice(1));

  return (
    <View style={[styles.chip, {backgroundColor: color + '18', borderColor: color + '40'}]}>
      <View style={[styles.dot, {backgroundColor: color}]} />
      <Text style={[styles.chipText, {color}]}>{text}</Text>
    </View>
  );
};

// ─── StatusBadge ─────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status:  StatusVariant;
  label:   string;
  icon?:   string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({status, label, icon}) => {
  const s = statusColor[status];

  return (
    <View style={[styles.chip, {backgroundColor: s.bg, borderColor: s.border}]}>
      {icon ? <Text style={styles.chipIcon}>{icon}</Text> : null}
      <Text style={[styles.chipText, {color: s.text}]}>{label}</Text>
    </View>
  );
};

// ─── CountBadge ─────────────────────────────────────────────────────────────

interface CountBadgeProps {
  count: number;
  color?: string;
  max?:   number;
}

export const CountBadge: React.FC<CountBadgeProps> = ({
  count,
  color = colors.primary,
  max   = 99,
}) => {
  const display = count > max ? `${max}+` : String(count);

  return (
    <View style={[styles.countBadge, {backgroundColor: color}]}>
      <Text style={styles.countText}>{display}</Text>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  chip: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius:    radius.full,
    borderWidth:     1,
    alignSelf:       'flex-start',
  },
  dot: {
    width:        6,
    height:       6,
    borderRadius: radius.full,
  },
  chipIcon: {
    fontSize: 11,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '600',
  },
  countBadge: {
    minWidth:        18,
    height:          18,
    borderRadius:    radius.full,
    paddingHorizontal: 5,
    alignItems:      'center',
    justifyContent:  'center',
  },
  countText: {
    color:      '#fff',
    fontSize:   10,
    fontWeight: '700',
    lineHeight: 13,
  },
});
