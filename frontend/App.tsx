/**
 * SmartPOS AI – Application Entry Point
 */

import React from 'react';
import {StatusBar} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {AuthProvider}    from './src/store/AuthContext';
import {RootNavigator}   from './src/navigation/RootNavigator';
import {colors}          from './src/utils/theme';

const App: React.FC = () => (
  <GestureHandlerRootView style={{flex: 1}}>
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={colors.surface}
        translucent={false}
      />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

export default App;
