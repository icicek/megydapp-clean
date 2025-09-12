import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  preset: 'ts-jest/presets/default-esm',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.jest.json' }]
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  setupFiles: ['<rootDir>/test/polyfills.ts'],          // 👈 ÖNEMLİ
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'], // jest-dom burada
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/dist/'],
  collectCoverageFrom: ['hooks/**/*.{ts,tsx}']
};

export default config;
