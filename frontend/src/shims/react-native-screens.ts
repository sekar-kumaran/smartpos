import React from 'react';
import {StyleSheet, View, ViewProps} from 'react-native';

const Stub: React.FC<ViewProps> = ({children, ...rest}) =>
  React.createElement(
    View,
    {...rest, style: [styles.fill, rest.style]},
    children,
  );

export const Screen = Stub;
export const ScreenContainer = Stub;
export const ScreenStack = Stub;
export const ScreenStackHeaderConfig = Stub;
export const ScreenStackHeaderCenterView = Stub;
export const ScreenStackHeaderLeftView = Stub;
export const ScreenStackHeaderRightView = Stub;
export const ScreenStackHeaderBackButtonImage = Stub;

export const enableScreens = () => {};
export const enableFreeze = () => {};

export default {
  Screen,
  ScreenContainer,
  ScreenStack,
  enableScreens,
  enableFreeze,
};

const styles = StyleSheet.create({
  fill: {flex: 1, minHeight: 0},
});
