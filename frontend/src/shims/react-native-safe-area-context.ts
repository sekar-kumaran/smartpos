import React from 'react';
import {StyleSheet, View, ViewProps} from 'react-native';

export const SafeAreaProvider: React.FC<ViewProps> = ({children, ...rest}) =>
  React.createElement(
    View,
    {...rest, style: [styles.fill, rest.style]},
    children,
  );

export const SafeAreaView: React.FC<ViewProps> = ({children, ...rest}) =>
  React.createElement(
    View,
    {...rest, style: [styles.fill, rest.style]},
    children,
  );

export const useSafeAreaInsets = () => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
});

export const initialWindowMetrics = null;

export const SafeAreaInsetsContext = React.createContext({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
});

const styles = StyleSheet.create({
  fill: {flex: 1, minHeight: 0},
});
