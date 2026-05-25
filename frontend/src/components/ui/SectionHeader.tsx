/**
 * SectionHeader — section title row with optional badge, action, and subtitle.
 */

import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {CountBadge} from './Badge';
import {colors, spacing, typography} from '../../utils/theme';

interface Props {
  title:        string;
  subtitle?:    string;
  badge?:       number;
  actionLabel?: string;
  onAction?:    () => void;
  icon?:        string;
  style?:       object;
}

export const SectionHeader: React.FC<Props> = ({
  title,
  subtitle,
  badge,
  actionLabel,
  onAction,
  icon,
  style,
}) => (
  <View style={[styles.container, style]}>
    <View style={styles.left}>
      <View style={styles.titleRow}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {badge != null && badge > 0 ? (
          <CountBadge count={badge} />
        ) : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {actionLabel && onAction ? (
      <TouchableOpacity onPress={onAction} activeOpacity={0.7} style={styles.action}>
        <Text style={styles.actionText}>{actionLabel}</Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    marginTop:      spacing.lg,
    marginBottom:   spacing.sm,
  },
  left: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs + 2,
  },
  icon: {
    fontSize: 16,
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color:     colors.textMuted,
    marginTop: 3,
  },
  action: {
    paddingLeft: spacing.sm,
    paddingTop:  2,
  },
  actionText: {
    ...typography.label,
    color: colors.primary,
  },
});
