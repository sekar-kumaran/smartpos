import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import React from 'react';
import {AppRegistry} from 'react-native';

import App from '../App';

// Ensure Node-style global exists for web-only polyfills.
if (typeof (globalThis as typeof globalThis & {global?: unknown}).global === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).global = globalThis;
}

const appName = 'smartpos-ai';

AppRegistry.registerComponent(appName, () => App);

const rootTag = document.getElementById('root');
if (!rootTag) {
  throw new Error('Root element not found');
}

AppRegistry.runApplication(appName, {
  initialProps: {},
  rootTag,
});
