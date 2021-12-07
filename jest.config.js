import pkg from 'ts-jest/presets/index.js';
const { defaultsESM } = pkg;

export default {
  transform: {
    ...defaultsESM.transform,
  },
  testRegex: '.*\\.test\\.ts$',
  roots: [ '<rootDir>/tests'],
  moduleFileExtensions: ['js', 'ts', 'mjs'],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
  coveragePathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: { // allow import from file.js
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // 'source-map-support/register': 'identity-obj-proxy',
  },
};
