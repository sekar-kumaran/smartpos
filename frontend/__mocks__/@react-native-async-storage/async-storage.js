/**
 * In-memory AsyncStorage mock for Jest.
 * Mirrors the real API surface used by cartStore and AuthContext.
 */

const storage = new Map();

const AsyncStorage = {
  getItem:     jest.fn((key) => Promise.resolve(storage.get(key) ?? null)),
  setItem:     jest.fn((key, value) => { storage.set(key, String(value)); return Promise.resolve(); }),
  removeItem:  jest.fn((key) => { storage.delete(key); return Promise.resolve(); }),
  multiGet:    jest.fn((keys) => Promise.resolve(keys.map((k) => [k, storage.get(k) ?? null]))),
  multiSet:    jest.fn((pairs) => { pairs.forEach(([k, v]) => storage.set(k, String(v))); return Promise.resolve(); }),
  multiRemove: jest.fn((keys) => { keys.forEach((k) => storage.delete(k)); return Promise.resolve(); }),
  clear:       jest.fn(() => { storage.clear(); return Promise.resolve(); }),
  getAllKeys:   jest.fn(() => Promise.resolve([...storage.keys()])),
  // Expose underlying map so tests can inspect state
  _storage:    storage,
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
