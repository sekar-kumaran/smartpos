/**
 * SearchBar — styled search input with loading indicator and scan action.
 */

import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {colors, radius, shadows, spacing, typography} from '../../utils/theme';

interface Props {
  value:           string;
  onChangeText:    (text: string) => void;
  placeholder?:    string;
  loading?:        boolean;
  onScan?:         () => void;
  onClear?:        () => void;
  autoFocus?:      boolean;
  returnKeyType?:  'search' | 'done' | 'next';
  onSubmit?:       () => void;
  style?:          StyleProp<ViewStyle>;
}

export const SearchBar: React.FC<Props> = ({
  value,
  onChangeText,
  placeholder = 'Search…',
  loading     = false,
  onScan,
  onClear,
  autoFocus   = false,
  returnKeyType = 'search',
  onSubmit,
  style,
}) => {
  const [focused, setFocused] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;

  const onFocus = () => {
    setFocused(true);
    Animated.timing(borderAnim, {toValue: 1, duration: 200, useNativeDriver: false}).start();
  };
  const onBlur = () => {
    setFocused(false);
    Animated.timing(borderAnim, {toValue: 0, duration: 200, useNativeDriver: false}).start();
  };

  const borderColor = borderAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [colors.border, colors.borderFocus],
  });

  const shadowOpacity = borderAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 0.15],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {borderColor, shadowOpacity},
        style,
      ]}>
      <Text style={styles.searchIcon}>🔍</Text>

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onBlur={onBlur}
        clearButtonMode="never"
      />

      {loading && (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.loader}
        />
      )}

      {!loading && value.length > 0 && (
        <TouchableOpacity
          onPress={() => { onChangeText(''); onClear?.(); }}
          style={styles.clearBtn}
          activeOpacity={0.7}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
          <Text style={styles.clearIcon}>✕</Text>
        </TouchableOpacity>
      )}

      {onScan && (
        <TouchableOpacity
          onPress={onScan}
          style={styles.scanBtn}
          activeOpacity={0.7}
          accessibilityLabel="Scan barcode">
          <Text style={styles.scanIcon}>📷</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    borderWidth:     1.5,
    paddingHorizontal: spacing.sm + 2,
    height:          48,
    shadowColor:     colors.primary,
    shadowOffset:    {width: 0, height: 2},
    shadowRadius:    6,
    elevation:       0,
    gap:             spacing.xs,
  },
  searchIcon: {
    fontSize: 15,
  },
  input: {
    flex:     1,
    ...typography.body2,
    color:    colors.text,
    height:   '100%',
    padding:  0,
  },
  loader: {
    marginHorizontal: 4,
  },
  clearBtn: {
    width:           22,
    height:          22,
    borderRadius:    radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },
  clearIcon: {
    fontSize:   10,
    color:      colors.textMuted,
    fontWeight: '700',
  },
  scanBtn: {
    width:           36,
    height:          36,
    borderRadius:    radius.md,
    backgroundColor: colors.primaryFaint,
    alignItems:      'center',
    justifyContent:  'center',
    marginLeft:      spacing.xs,
  },
  scanIcon: {
    fontSize: 17,
  },
});
