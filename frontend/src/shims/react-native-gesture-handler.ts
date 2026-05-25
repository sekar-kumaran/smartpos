import React from 'react';
import {StyleSheet, View, ViewProps} from 'react-native';

const Stub: React.FC<ViewProps> = ({children, ...rest}) =>
  React.createElement(
    View,
    {...rest, style: [styles.fill, rest.style]},
    children,
  );

export const GestureHandlerRootView: React.FC<ViewProps> = ({children, ...rest}) =>
  React.createElement(
    View,
    {...rest, style: [styles.fill, rest.style]},
    children,
  );
export const PanGestureHandler = Stub;
export const TapGestureHandler = Stub;
export const FlingGestureHandler = Stub;
export const LongPressGestureHandler = Stub;
export const PinchGestureHandler = Stub;
export const RotationGestureHandler = Stub;
export const NativeViewGestureHandler = Stub;

export const State = {};
export const Directions = {};

export const gestureHandlerRootHOC =
  <P extends object>(Component: React.ComponentType<P>) =>
  (props: P) => (
    React.createElement(
      View,
      {style: styles.fill},
      React.createElement(Component, {...props}),
    )
  );

export default {
  GestureHandlerRootView,
};

const styles = StyleSheet.create({
  fill: {flex: 1, minHeight: 0},
});
