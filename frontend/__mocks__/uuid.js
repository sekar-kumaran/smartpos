/**
 * Deterministic uuid mock for Jest.
 * Each call to v4() returns a unique, predictable string.
 * The counter increments globally across the test run so distinct calls
 * always produce distinct values (important for clearCart() localId tests).
 */

let counter = 0;

module.exports = {
  v4: jest.fn(() => `test-uuid-${++counter}`),
};
