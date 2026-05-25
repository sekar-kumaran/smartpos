/**
 * SmartPOS AI – API Service
 * Centralised Axios instance with JWT injection and token refresh.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, {AxiosInstance, AxiosRequestConfig, AxiosResponse} from 'axios';

// On web the request goes through the nginx proxy (/api/ -> backend).
// Native/dev builds use localhost. No production endpoint is shipped publicly.
const isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
const BASE_URL = isWeb
  ? '/api/v1'
  : 'http://localhost:8000/api/v1';

// ─── Axios Instance ────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {'Content-Type': 'application/json'},
});

// ─── Request Interceptor – inject JWT ─────────────────────────────────────

api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response Interceptor – auto refresh on 401 ───────────────────────────

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (res: AxiosResponse) => res,
  async error => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        return new Promise(resolve => {
          refreshQueue.push((token: string) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = await AsyncStorage.getItem('refresh_token');
        const res = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const {access_token, refresh_token} = res.data;
        await AsyncStorage.multiSet([
          ['access_token',  access_token],
          ['refresh_token', refresh_token],
        ]);
        refreshQueue.forEach(cb => cb(access_token));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${access_token}`;
        return api(original);
      } catch {
        await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('smartpos:auth-expired'));
        }
        // Navigate to login – handled by AuthContext
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
