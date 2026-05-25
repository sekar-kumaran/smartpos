/**
 * AppButton — primary / secondary / ghost / danger variants.
 * Animated press scale + opacity feedback.
 */

import React, {useRef} from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import {colors, radius, shadows, typography} from '../../utils/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size    = 'sm' | 'md' | 'lg';

interface Props {
  label:       string;
  onPress:     () => void;
  variant?:    Variant;
  size?:       Size;
  loading?:    boolean;
  disabled?:   boolean;
  icon?:       string;
  iconRight?:  string;
  fullWidth?:  boolean;
  style?:      StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const VARIANT_STYLES: Record<Variant, {bg: string; text: string; border?: string; shadow?: any}> = {
  primary:   {bg: colors.primary,   text: '#fff',         shadow: shadows.colored(colors.primary)},
  secondary: {bg: colors.primaryFaint, text: colors.primary, border: colors.primary + '30'},
  ghost:     {bg: 'transparent',    text: colors.text,    border: colors.border},
  danger:    {bg: colors.error,     text: '#fff',         shadow: shadows.colored(colors.error)},
  success:   {bg: colors.success,   text: '#fff',         shadow: shadows.colored(colors.success)},
};

const SIZE_STYLES: Record<Size, {height: number; px: number; textStyle: any}> = {
  sm: {height: 36, px: 14, textStyle: typography.buttonSm},
  md: {height: 48, px: 20, textStyle: typography.button},
  lg: {height: 56, px: 24, textStyle: {...typography.button, fontSize: 16}},
};

export const AppButton: React.FC<Props> = ({
  label,
  onPress,
  variant    = 'primary',
  size       = 'md',
  loading    = false,
  disabled   = false,
  icon,
  iconRight,
  fullWidth  = false,
  style,
  accessibilityLabel,
}) => {
  const scale   = useRef(new Animated.Value(1)).current;
  const v       = VARIANT_STYLES[variant];
  const s       = SIZE_STYLES[size];
  const isDisabled = disabled || loading;

  const onPressIn = () => {
    Animated.spring(scale, {toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0}).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, {toValue: 1, useNativeDriver: true, speed: 35, bounciness: 5}).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={isDisabled}
      activeOpacity={1}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button">
      <Animated.View
        style={[
          styles.base,
          {
            height:            s.height,
            paddingHorizontal: s.px,
            backgroundColor:   v.bg,
            borderColor:       v.border ?? 'transparent',
            borderWidth:       v.border ? 1 : 0,
            ...(v.shadow && !isDisabled ? v.shadow : {}),
          },
          fullWidth && {width: '100%'},
          isDisabled && styles.disabled,
          {transform: [{scale}]},
          style,
        ]}>
        {loading ? (
          <ActivityIndicator color={v.text} size="small" />
        ) : (
          <>
            {icon ? <Text style={[styles.icon, {color: v.text}]}>{icon}</Text> : null}
            <Text style={[s.textStyle, {color: v.text}]}>{label}</Text>
            {iconRight ? <Text style={[styles.icon, {color: v.text}]}>{iconRight}</Text> : null}
          </>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   radius.lg,
    gap:            6,
    alignSelf:      'flex-start',
  },
  disabled: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 16,
  },
});
