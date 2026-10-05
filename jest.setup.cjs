/* global jest, beforeEach, afterEach, expect */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// A manual mock under src/__mocks__/ for a BARE node_modules package name
// (react-native-reanimated, expo-audio, redux-persist, @rific/scroll-view, etc.) is picked up
// automatically, with zero registration needed — confirmed by every one of those working with no
// jest.mock() call anywhere for them. A manual mock for a deep SUBPATH of a package is not
// reliably auto-applied the same way: confirmed directly (a console.warn planted in the real,
// un-mocked file still fired for @expo/vector-icons/build/MaterialCommunityIcons, and separately
// for react-native-paper's own MaterialCommunityIcon, with no explicit jest.mock() call for
// either, even though a same-shaped file already sits under src/__mocks__/ for both). Each
// subpath mock below is registered explicitly so Jest actually uses its adjacent src/__mocks__/
// file — this app's own pre-migration jest.setup.ts always registered these the same explicit
// way (inline jest.mock(path, factory) calls); only the factory bodies moved into
// src/__mocks__/*.ts, not the registration itself. See this repo's .claude/CLAUDE.md for the
// full story, including the one specifier below (@expo/vector-icons/MaterialCommunityIcons, no
// "/build/") that the app's original jest.setup.ts never mocked at all and needed adding fresh.
jest.mock('@expo/vector-icons/createIconSet')
jest.mock('@expo/vector-icons/createIconSetFromFontello')
jest.mock('@expo/vector-icons/build/createIconSet')
try {
  jest.mock('@expo/vector-icons/build/MaterialCommunityIcons')
} catch {
  // ignore if not present
}
// Theme.tsx imports this bare subpath directly (`@expo/vector-icons/MaterialCommunityIcons`,
// no "/build/") to preload the icon font — a real module never mocked by this app's own
// pre-migration jest.setup.ts either, but registering it only at the build/ subpath above isn't
// enough to keep Theme.tsx's own import from loading the real font-glyph component (confirmed:
// the real file's console.warn still fired with only the build/ registration in place). An
// inline factory here, not a src/__mocks__/ file, since a bare jest.mock('specifier') call for
// this exact one didn't reliably pick up an adjacent manual mock file either — same asymmetry as
// everything else in this comment block, verified directly rather than assumed.
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: ({ children }) => children || null,
  font: {}
}))
jest.mock('redux-persist/integration/react')
// useClickSound.ts, usePopSound.ts, and useSoundEffects.ts all import this exact subpath
// directly (`@rific/feedback-press/audio`) — a fresh occurrence of the same asymmetry as every
// other entry in this block: neither a bare `@rific/feedback-press` mock (there isn't one) nor
// any other subpath registration covers it, so it was loading for real, completely unmocked, in
// every test. Confirmed directly, not assumed: a console.warn planted in the real, installed
// `@rific/feedback-press/audio` resolved file (its `src/audio/index.ts`, not `dist/` — this
// package's own `exports` map has a `"react-native"` condition pointing at raw source, which
// @react-native/jest-preset's custom resolver picks for this app, same "resolves differently
// depending on the caller" shape already noted below for react-native-paper) fired repeatedly
// while running this app's full suite. Left real, its `useAudioPool` hook defers building its
// player pool and every trigger behind real `setTimeout(0)` calls inside a mount effect; in any
// test that merely renders a component using Game/Keyboard's click or pop sound (Game.test.tsx,
// Keyboard.test.tsx, PacksScreen.test.tsx, PnpFlow.test.tsx, etc. — none of which care about
// audio pooling at all), those real, un-awaited timers pile up across every render in the file,
// producing exactly the "Active timers... worker process failed to exit gracefully" warning Jest
// reports and inflating those suites' run times into the hundreds of seconds.
//
// useClickSound.test.ts and usePopSound.test.ts are the deliberate exception: they exist
// specifically to exercise useAudioPool's own real pooling/round-robin/timing behavior end to
// end (against the already-mocked expo-audio createAudioPlayer above), asserting on real
// createAudioPlayer call counts and ordering — a blanket stub breaks both files outright.
// Confirmed empirically, not assumed: applying the blanket stub below with no carve-out turned
// both files' tests (4 total) from passing to failing before this per-file branch was added.
// `expect.getState().testPath` is already populated by the time this factory runs (confirmed by
// logging it), so the two files needing the real module ask for it via jest.requireActual;
// every other test file gets the inert stub.
jest.mock('@rific/feedback-press/audio', () => {
  const testPath = expect.getState().testPath || ''
  if (/[/\\](useClickSound|usePopSound)\.test\.ts$/.test(testPath)) {
    return jest.requireActual('@rific/feedback-press/audio')
  }
  return {
    __esModule: true,
    useAudioPool: () => () => {}
  }
})
// react-native-paper's own package entry resolves differently depending on the caller: a plain
// require() (e.g. from this .cjs file) lands on lib/commonjs/index.js, while the app's real ESM
// `import ... from 'react-native-paper'` (transformed by babel-preset-expo) lands on
// src/index.tsx instead — confirmed directly, not assumed, by planting a console.warn in each and
// watching which one actually fired for a real component render. Both are registered here so
// either resolution is covered. lib/commonjs/src/components/MaterialCommunityIcon was never a
// real file in this installed version (there is no lib/commonjs/src/ directory at all) — that
// jest.mock() call is expected to throw and is caught, matching this app's own original
// jest.setup.ts, which already guarded the same (already-dead) path the same way.
try {
  jest.mock('react-native-paper/src/components/MaterialCommunityIcon')
} catch {
  // ignore if path not found
}
try {
  jest.mock('react-native-paper/lib/commonjs/src/components/MaterialCommunityIcon')
} catch {
  // ignore if path not found
}
jest.mock('react-native-paper/lib/commonjs/components/MaterialCommunityIcon')

// Surface unhandled promise rejections and uncaught exceptions during tests
const handleUnhandledRejection = (reason) => {
  // eslint-disable-next-line no-console
  console.error('UnhandledRejection in tests:', reason)
}

const handleUncaughtException = (err) => {
  // eslint-disable-next-line no-console
  console.error('UncaughtException in tests:', err)
}

if (typeof process !== 'undefined' && process && process.on) {
  process.on('unhandledRejection', handleUnhandledRejection)
  process.on('uncaughtException', handleUncaughtException)
}

// Force react-native Animated to use JS driver (not native) to avoid
// findHostInstanceWithWarning failures in test-renderer environment
try {
  const AnimatedImpl = require('react-native/Libraries/Animated/AnimatedImplementation')
  const realSpring = AnimatedImpl.spring
  AnimatedImpl.spring = (value, config) => realSpring(value, { ...config, useNativeDriver: false })
  const realTiming = AnimatedImpl.timing
  AnimatedImpl.timing = (value, config) => realTiming(value, { ...config, useNativeDriver: false })
  const realDecay = AnimatedImpl.decay
  AnimatedImpl.decay = (value, config) => realDecay(value, { ...config, useNativeDriver: false })
} catch {
  // ignore if module path not found
}

// Patch NativeAnimatedModule to call endCallback synchronously instead of via
// setTimeout(..., 16), preventing timer leaks that fire after test environment teardown.
// This must run before any test to take effect on all animation starts.
beforeEach(() => {
  try {
    const { NativeModules } = require('react-native')
    const mod = NativeModules?.NativeAnimatedModule
    if (mod?.startAnimatingNode?.mockImplementation) {
      mod.startAnimatingNode.mockImplementation((_animId, _nodeTag, _config, endCallback) => {
        endCallback({ finished: true })
      })
    }
  } catch {
    // ignore if NativeModules unavailable
  }
})

afterEach(() => {
  jest.clearAllTimers()
  // A test that calls jest.useFakeTimers() but gets killed by Jest's own per-test
  // timeout before reaching its own jest.useRealTimers() cleanup would otherwise leak
  // fake timers into every later test in the file. No-op when already on real timers.
  jest.useRealTimers()
})
