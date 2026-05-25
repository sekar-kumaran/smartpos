/**
 * Web shim for @react-native-async-storage/async-storage
 * Uses localStorage on web.
 */

const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Silent fail
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Silent fail
    }
  },

  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    return keys.map(key => [key, localStorage.getItem(key)]);
  },

  multiSet: async (pairs: [string, string][]): Promise<void> => {
    pairs.forEach(([key, value]) => localStorage.setItem(key, value));
  },

  multiRemove: async (keys: string[]): Promise<void> => {
    keys.forEach(key => localStorage.removeItem(key));
  },

  clear: async (): Promise<void> => {
    localStorage.clear();
  },

  getAllKeys: async (): Promise<string[]> => {
    return Object.keys(localStorage);
  },
};

export default AsyncStorage;
