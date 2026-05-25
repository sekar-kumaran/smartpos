/**
 * Web shim for react-native-vector-icons
 * Returns emoji text as fallback on web.
 */

import React from 'react';
import {Text} from 'react-native';

const Icon: React.FC<{name?: string; size?: number; color?: string; children?: React.ReactNode}> = ({
  name,
  size = 20,
  color = '#000',
  children,
}) =>
  React.createElement(Text, {style: {fontSize: size, color}}, children || name || '●');

export default Icon;
export const MaterialIcons = Icon;
export const MaterialCommunityIcons = Icon;
export const Ionicons = Icon;
export const FontAwesome = Icon;
export const Feather = Icon;
