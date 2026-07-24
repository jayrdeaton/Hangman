module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./jest.setup.ts', './node_modules/react-native-gesture-handler/jestSetup.js'],
  transformIgnorePatterns: [],
  testPathIgnorePatterns: ['/node_modules/'],
  modulePathIgnorePatterns: [],
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/constants/(.*)$': '<rootDir>/src/constants/$1',
    '^@/effects/(.*)$': '<rootDir>/src/effects/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/modes/(.*)$': '<rootDir>/src/modes/$1',
    '^@/redux/(.*)$': '<rootDir>/src/redux/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/(.*)$': '<rootDir>/$1'
  }
}
