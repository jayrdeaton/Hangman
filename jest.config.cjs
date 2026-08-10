module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./jest.setup.ts', './node_modules/react-native-gesture-handler/jestSetup.js'],
  transformIgnorePatterns: [],
  // Without the worktrees exclusion, Jest also picks up any `.claude/worktrees/*` checkout's own
  // frozen copy of src/__tests__ as a second, stale test suite -- it fails independently of
  // whatever's actually being worked on in this checkout (it's pinned to whatever commit that
  // worktree was created at) and reads as a false alarm about the real change under test.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/worktrees/'],
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
