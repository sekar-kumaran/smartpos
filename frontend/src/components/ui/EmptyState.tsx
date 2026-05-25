/**
 * EmptyState — illustrated empty / error / offline state with optional CTA.
 */

import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {AppButton} from './AppButton';
import {colors, radius, spacing, typography} from '../../utils/theme';

interface Props {
  icon:         string;
  title:        string;
  subtitle?:    string;
  actionLabel?: string;
  onAction?:    () => void;
  compact?:     boolean;
}

export const EmptyState: React.FC<Props> = ({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  compact,
}) => {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    {toValue: 1, duration: 350, delay: 100, useNativeDriver: true}),
      Animated.timing(translateY, {toValue: 0, duration: 350, delay: 100, useNativeDriver: true}),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View
      style={[
        styles.container,
        compact && styles.compact,
        {opacity, transform: [{translateY}]},
      ]}>
      <View style={styles.iconWrap}>
        <Text style={[styles.icon, compact && styles.iconCompact]}>{icon}</Text>
      </View>
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="sm"
          style={{marginTop: spacing.md}}
        />
      ) : null}
    </Animated.View>
  );
};

// ─── Offline variant ────────────────────────────────────────────────────────

export const OfflineEmptyState: React.FC<{onRetry?: () => void}> = ({onRetry}) => (
  <EmptyState
    icon="📡"
    title="You're offline"
    subtitle="Connect to the internet to sync your data. Local data is safe."
    actionLabel={onRetry ? 'Retry' : undefined}
    onAction={onRetry}
  />
);

// ─── Error variant ──────────────────────────────────────────────────────────

export const ErrorEmptyState: React.FC<{message?: string; onRetry?: () => void}> = ({
  message,
  onRetry,
}) => (
  <EmptyState
    icon="⚠️"
    title="Something went wrong"
    subtitle={message ?? 'An error occurred. Please try again.'}
    actionLabel={onRetry ? 'Try Again' : undefined}
    onAction={onRetry}
  />
);

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems:  'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  compact: {
    paddingVertical: spacing.lg,
  },
  iconWrap: {
    width:           80,
    height:          80,
    borderRadius:    radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    spacing.md,
  },
  icon: {
    fontSize: 38,
  },
  iconCompact: {
    fontSize: 28,
  },
  title: {
    ...typography.h3,
    color:     colors.text,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 15,
  },
  subtitle: {
    ...typography.body2,
    color:     colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  subtitleCompact: {
    fontSize: 12,
  },
});
