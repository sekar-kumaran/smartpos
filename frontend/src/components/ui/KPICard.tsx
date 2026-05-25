/**
 * KPICard — animated metric card with staggered fade+slide entry.
 * Accepts an Animated.Value for the entry animation so parent
 * can stagger multiple cards via Animated.stagger.
 */

import React from 'react';
import {Animated, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {colors, radius, shadows, spacing, typography} from '../../utils/theme';

interface Props {
  label:        string;
  value:        string;
  icon:         string;
  accentColor:  string;
  subtitle?:    string;
  trend?:       'up' | 'down' | 'flat';
  trendValue?:  string;
  onPress?:     () => void;
  animOpacity?: Animated.Value;
  animTranslateY?: Animated.Value;
}

export const KPICard: React.FC<Props> = ({
  label,
  value,
  icon,
  accentColor,
  subtitle,
  trend,
  trendValue,
  onPress,
  animOpacity,
  animTranslateY,
}) => {
  const trendColor =
    trend === 'up'   ? colors.success :
    trend === 'down' ? colors.error   : colors.textMuted;

  const trendArrow =
    trend === 'up'   ? '↑' :
    trend === 'down' ? '↓' : '→';

  const inner = (
    <Animated.View
      style={[
        styles.card,
        {borderTopColor: accentColor},
        animOpacity    ? {opacity: animOpacity}                          : {},
        animTranslateY ? {transform: [{translateY: animTranslateY}]}    : {},
      ]}>
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, {backgroundColor: accentColor + '18'}]}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        {trend && trendValue ? (
          <View style={[styles.trendBadge, {backgroundColor: trendColor + '15'}]}>
            <Text style={[styles.trendText, {color: trendColor}]}>
              {trendArrow} {trendValue}
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={[styles.value, {color: accentColor}]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.wrapper}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={styles.wrapper}>{inner}</View>;
};

// ─── KPI Row — 4-card single-row layout ──────────────────────────────────────

interface KPIRowProps {
  cards: Omit<Props, 'animOpacity' | 'animTranslateY'>[];
  animated?: boolean;
}

export const KPIRow: React.FC<KPIRowProps> = ({cards, animated = true}) => {
  const anims = React.useRef(
    cards.map(() => ({
      opacity:    new Animated.Value(animated ? 0 : 1),
      translateY: new Animated.Value(animated ? 14 : 0),
    })),
  ).current;

  React.useEffect(() => {
    if (!animated) return;
    Animated.stagger(
      60,
      anims.map(a =>
        Animated.parallel([
          Animated.timing(a.opacity,    {toValue: 1, duration: 320, useNativeDriver: true}),
          Animated.timing(a.translateY, {toValue: 0, duration: 320, useNativeDriver: true}),
        ]),
      ),
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated]);

  return (
    <View style={styles.row}>
      {cards.map((card, i) => (
        <KPICard
          key={card.label}
          {...card}
          animOpacity={anims[i].opacity}
          animTranslateY={anims[i].translateY}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         spacing.md,
    borderTopWidth:  3,
    ...shadows.sm,
  },
  topRow: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
    marginBottom:   spacing.xs,
  },
  iconWrap: {
    width:        34,
    height:       34,
    borderRadius: radius.sm,
    alignItems:   'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  trendBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      radius.full,
  },
  trendText: {
    fontSize:   10,
    fontWeight: '700',
  },
  value: {
    ...typography.h2,
    fontSize:     20,
    marginBottom: 2,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  subtitle: {
    ...typography.overline,
    color:     colors.textMuted,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
});
