import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native$': 'react-native-web',
      'react-native': 'react-native-web',
      'react-native-gesture-handler': path.resolve(
        __dirname,
        'src/shims/react-native-gesture-handler.ts',
      ),
      'react-native-screens': path.resolve(
        __dirname,
        'src/shims/react-native-screens.ts',
      ),
      'react-native-safe-area-context': path.resolve(
        __dirname,
        'src/shims/react-native-safe-area-context.ts',
      ),
      'react-native-vector-icons': path.resolve(
        __dirname,
        'src/shims/react-native-vector-icons.ts',
      ),
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        'src/shims/async-storage.ts',
      ),
      'react-native-get-random-values': path.resolve(
        __dirname,
        'src/shims/react-native-get-random-values.ts',
      ),
      '@': path.resolve(__dirname, 'src'),
    },
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js'],
  },
  optimizeDeps: {
    include: [
      'react-native-web',
      '@react-navigation/native',
      '@react-navigation/native-stack',
      '@react-navigation/bottom-tabs',
    ],
    exclude: [
      'react-native',
      'react-native-gesture-handler',
      'react-native-screens',
      'react-native-safe-area-context',
    ],
  },
  define: {
    __DEV__: JSON.stringify(true),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
