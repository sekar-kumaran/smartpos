/**
 * AnimatedPressable — scale-on-press wrapper using the built-in Animated API.
 * Works on both React Native and React Native Web.
 */

import React, {useRef} from 'react';
import {
  Animated,
  GestureResponderEvent,
  StyleProp,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';

interface Props {
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  scaleDown?: number;
  activeOpacity?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
}

export const AnimatedPressable: React.FC<Props> = ({
  onPress,
  onLongPress,
  disabled,
  style,
  children,
  scaleDown = 0.96,
  activeOpacity = 1,
  accessibilityLabel,
  accessibilityRole = 'button',
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue:         scaleDown,
      useNativeDriver: true,
      speed:           40,
      bounciness:      0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue:         1,
      useNativeDriver: true,
      speed:           30,
      bounciness:      4,
    }).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      activeOpacity={activeOpacity}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}>
      <Animated.View style={[style, {transform: [{scale}]}]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};
