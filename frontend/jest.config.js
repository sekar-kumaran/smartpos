module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  // Allow babel to transform ESM packages that Jest can't handle natively
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|zustand|uuid)/)',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/__mocks__/@react-native-async-storage/async-storage.js',
    '^react-native-get-random-values$':
      '<rootDir>/__mocks__/react-native-get-random-values.js',
    '^uuid$': '<rootDir>/__mocks__/uuid.js',
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/store/**/*.ts',
    'src/services/**/*.ts',
    'src/utils/**/*.ts',
  ],
  coverageThreshold: {
    global: {
      branches:   50,
      functions:  70,
      lines:      70,
      statements: 70,
    },
  },
};
