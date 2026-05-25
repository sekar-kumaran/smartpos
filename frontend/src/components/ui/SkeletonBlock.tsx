/**
 * SkeletonBlock — shimmer loading placeholder.
 * Uses Animated API translateX for the shimmer sweep; web-compatible.
 */

import React, {useEffect, useRef} from 'react';
import {Animated, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {colors, radius} from '../../utils/theme';

interface Props {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonBlock: React.FC<Props> = ({
  width = '100%',
  height = 16,
  borderRadius = radius.sm,
  style,
}) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue:         1,
          duration:        900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue:         0,
          duration:        900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.55, 1],
  });

  return (
    <Animated.View
      style={[
        styles.block,
        {width: width as any, height, borderRadius, opacity},
        style,
      ]}
    />
  );
};

// ─── Compound layouts ────────────────────────────────────────────────────────

export const SkeletonKPICard: React.FC = () => (
  <View style={styles.kpiCard}>
    <SkeletonBlock width={28} height={28} borderRadius={radius.sm} />
    <SkeletonBlock width="60%" height={20} style={{marginTop: 10}} />
    <SkeletonBlock width="40%" height={12} style={{marginTop: 6}} />
  </View>
);

export const SkeletonListItem: React.FC = () => (
  <View style={styles.listItem}>
    <View style={styles.listItemLeft}>
      <SkeletonBlock width={40} height={40} borderRadius={radius.md} />
      <View style={styles.listItemText}>
        <SkeletonBlock width="70%" height={14} />
        <SkeletonBlock width="45%" height={11} style={{marginTop: 6}} />
      </View>
    </View>
    <SkeletonBlock width={60} height={20} borderRadius={radius.sm} />
  </View>
);

export const SkeletonProductCard: React.FC = () => (
  <View style={styles.productCard}>
    <SkeletonBlock width="80%" height={14} />
    <SkeletonBlock width="50%" height={18} style={{marginTop: 8}} />
    <SkeletonBlock width="35%" height={12} style={{marginTop: 6}} />
    <SkeletonBlock height={32} borderRadius={radius.md} style={{marginTop: 12}} />
  </View>
);

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.skeletonBase,
  },
  kpiCard: {
    width:           '48.5%',
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         16,
    borderTopWidth:  3,
    borderTopColor:  colors.skeletonBase,
  },
  listItem: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         12,
    marginBottom:    8,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    flex:          1,
  },
  listItemText: {
    flex: 1,
    gap:  4,
  },
  productCard: {
    width:           '48.5%',
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    padding:         12,
  },
});
