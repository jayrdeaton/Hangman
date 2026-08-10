/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/display-name */

/* global jest */

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native')
  const { useRef } = require('react')
  const passthrough = (value: unknown) => value
  const passthroughLast = (...values: unknown[]) => values[values.length - 1]

  const Animated = {
    View: RN.View,
    Text: RN.Text,
    Image: RN.Image,
    ScrollView: RN.ScrollView,
    FlatList: RN.FlatList,
    createAnimatedComponent: (Component: unknown) => Component,
    // Real shared values are stable across re-renders (ref-like) — a fresh `{ value }` object per
    // call, as this used to be, silently drops any mutation the instant something else triggers a
    // re-render, since the next render just makes a brand new one starting back at the initial
    // value. Anything that mutates .value from an event callback and expects a later render to
    // still see it (e.g. a Keyboard listener feeding an animated transform) breaks under that,
    // even though the real library handles it fine.
    useSharedValue: (initial: unknown) => {
      const ref: { current: { value: unknown } | null } = useRef(null)
      if (ref.current === null) ref.current = { value: initial }
      return ref.current
    },
    useAnimatedStyle: (updater?: () => unknown) => {
      try {
        return typeof updater === 'function' ? updater() : {}
      } catch {
        return {}
      }
    },
    useAnimatedProps: (updater?: () => unknown) => {
      try {
        return typeof updater === 'function' ? updater() : {}
      } catch {
        return {}
      }
    },
    useAnimatedScrollHandler: (handler: (...args: unknown[]) => unknown) => handler,
    useAnimatedKeyboard: jest.fn(() => ({ height: { value: 0 }, state: { value: 0 } })),
    useAnimatedReaction: (prepare: () => unknown, react: (current: unknown, previous: unknown) => void) => {
      try {
        react(prepare(), undefined)
      } catch {
        // Swallowed, same as useAnimatedStyle/useAnimatedProps above — a reaction that throws on
        // this one-shot mock call shouldn't fail a test that isn't exercising it.
      }
    },
    useDerivedValue: (updater?: () => unknown) => ({ value: typeof updater === 'function' ? updater() : undefined }),
    withTiming: passthrough,
    withSpring: passthrough,
    withDecay: passthrough,
    withDelay: (_ms: number, value: unknown) => value,
    withRepeat: (value: unknown) => value,
    withSequence: passthroughLast,
    cancelAnimation: jest.fn(),
    interpolate: passthrough,
    interpolateColor: () => '#000000',
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedRef: () => ({ current: null }),
    measure: () => ({ x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 }),
    scrollTo: jest.fn(),
    Easing: {
      linear: passthrough,
      ease: passthrough,
      in: passthrough,
      out: passthrough,
      inOut: passthrough,
      bezier: () => passthrough
    },
    Extrapolation: {
      CLAMP: 'clamp',
      EXTEND: 'extend',
      IDENTITY: 'identity'
    },
    FadeIn: { duration: () => ({}) },
    FadeInDown: { duration: () => ({}) },
    FadeInUp: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    FadeOutDown: { duration: () => ({}) },
    FadeOutUp: { duration: () => ({}) },
    Layout: { duration: () => ({}) },
    LinearTransition: { duration: () => ({}) },
    default: {
      View: RN.View,
      Text: RN.Text,
      Image: RN.Image,
      ScrollView: RN.ScrollView,
      FlatList: RN.FlatList,
      createAnimatedComponent: (Component: unknown) => Component,
      call: jest.fn()
    }
  }

  return Animated
})

jest.mock('react-native-worklets', () => ({
  createSerializable: (value: unknown) => value,
  isWorkletFunction: () => false,
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
  scheduleOnRN: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args)
}))

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native')
  const RESULTS = {
    DENIED: 'denied',
    GRANTED: 'granted',
    NEVER_ASK_AGAIN: 'never_ask_again'
  }
  const PERMISSIONS = {
    ...RN.PermissionsAndroid?.PERMISSIONS
  }
  const mockedReactNative = Object.create(RN)

  Object.defineProperty(mockedReactNative, 'PermissionsAndroid', {
    configurable: true,
    enumerable: true,
    value: {
      ...RN.PermissionsAndroid,
      PERMISSIONS,
      RESULTS,
      check: jest.fn().mockResolvedValue(true),
      request: jest.fn().mockResolvedValue(RESULTS.GRANTED),
      requestMultiple: jest.fn().mockResolvedValue({})
    }
  })

  Object.defineProperty(mockedReactNative, 'Linking', {
    configurable: true,
    enumerable: true,
    value: {
      ...RN.Linking,
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      removeEventListener: jest.fn(),
      getInitialURL: jest.fn().mockResolvedValue(null),
      openURL: jest.fn().mockResolvedValue(true),
      canOpenURL: jest.fn().mockResolvedValue(true)
    }
  })

  Object.defineProperty(mockedReactNative, 'AppState', {
    configurable: true,
    enumerable: true,
    value: {
      ...RN.AppState,
      currentState: 'active',
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      removeEventListener: jest.fn()
    }
  })

  Object.defineProperty(mockedReactNative, 'Vibration', {
    configurable: true,
    enumerable: true,
    value: {
      ...RN.Vibration,
      cancel: jest.fn(),
      vibrate: jest.fn()
    }
  })

  Object.defineProperty(mockedReactNative, 'Modal', {
    configurable: true,
    enumerable: true,
    value: ({ children, visible }: any) => (visible ? children : null)
  })

  return mockedReactNative
})

;(global as any).IS_REACT_ACT_ENVIRONMENT = true

// @rific/scroll-view — replace Reanimated-context-dependent components with RN primitives
jest.mock('@rific/scroll-view', () => {
  const React = jest.requireActual('react')
  const RN = require('react-native')

  const defaultScrollViewSettings = {
    backActionFixed: true,
    footerFixed: false,
    headerFixed: false,
    snapBack: false
  }

  return {
    FlatList: ({ onRefresh, refreshing, ...props }: any) => {
      const safeProps = onRefresh !== undefined ? { onRefresh, refreshing: refreshing !== undefined ? refreshing : false, ...props } : props
      return React.createElement(RN.FlatList, safeProps)
    },
    ScrollView: RN.ScrollView,
    SectionList: ({ onRefresh, refreshing, ...props }: any) => {
      const safeProps = onRefresh !== undefined ? { onRefresh, refreshing: refreshing !== undefined ? refreshing : false, ...props } : props
      return React.createElement(RN.SectionList, safeProps)
    },
    CustomList: ({ onRefresh, refreshing, ...props }: any) => {
      const safeProps = onRefresh !== undefined ? { onRefresh, refreshing: refreshing !== undefined ? refreshing : false, ...props } : props
      return React.createElement(RN.FlatList, safeProps)
    },
    PullSearch: () => null,
    // Renders title/caption/centerContent and back/trailing actions for real (unlike a bare
    // `children || null` stand-in) — every drawer migrated onto this package drives its header
    // through those props, not children, so a test asserting on "Hangman" or pressing "Close"
    // needs this mock to actually put them in the tree. accessibilityLabel default of 'Back'
    // mirrors react-native-paper's own Appbar.BackAction default, for the same reason the real
    // package's backActionAccessibilityLabel prop exists — most callers here override it.
    ScrollViewHeader: ({ backAction, backActionAccessibilityLabel, caption, centerContent, children, title, trailingAction }: any) => (children !== undefined ? children : React.createElement(React.Fragment, null, backAction && React.createElement(RN.Pressable, { accessibilityLabel: backActionAccessibilityLabel ?? 'Back', accessibilityRole: 'button', onPress: backAction }), centerContent !== undefined ? centerContent : React.createElement(React.Fragment, null, title && React.createElement(RN.Text, null, title), caption && React.createElement(RN.Text, null, caption)), trailingAction ?? null)),
    ScrollViewFooter: ({ children }: any) => children || null,
    ScrollViewProvider: ({ children }: any) => children,
    ScrollViewSettingsProvider: ({ children }: any) => children,
    defaultScrollViewSettings,
    scrollViewActions: {
      initialize: (settings: unknown) => ({ type: 'scrollView/initialize', payload: settings })
    },
    scrollViewReducer: (state = defaultScrollViewSettings, action: any) => {
      if (action?.type === 'scrollView/initialize') return action.payload
      return state
    },
    ScrollViewContext: React.createContext({
      blur: true,
      footerFixed: false,
      footerHeight: 0,
      footerHeightShared: { value: 0 },
      footerOffset: { value: 0 },
      headerFixed: false,
      headerHeight: 0,
      headerHeightShared: { value: 0 },
      headerOffset: { value: 0 },
      progress: null,
      progressing: false,
      pullSearchHeightShared: { value: 0 },
      scrollHeight: 0,
      scrollPosition: { value: 0 },
      snapBackFooterShared: { value: false },
      snapBackHeaderShared: { value: false },
      tabBarHeight: 0,
      setFooterHeight: jest.fn(),
      setHeaderHeight: jest.fn(),
      setProgress: jest.fn(),
      setProgressing: jest.fn()
    }),
    ScrollViewSettingsContext: React.createContext({ settings: defaultScrollViewSettings, set: () => {} }),
    useScrollView: () => ({}),
    useScrollViewSettings: () => ({ settings: defaultScrollViewSettings, set: jest.fn() }),
    useKeyboardInset: () => 0
  }
})

// @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const Icon = ({ children }: any) => children || null
  return {
    Ionicons: Icon,
    MaterialCommunityIcons: Icon,
    MaterialIcons: Icon,
    FontAwesome: Icon,
    default: { Ionicons: Icon }
  }
})

// Some code imports deeper paths (createIconSet / createIconSetFromFontello)
jest.mock('@expo/vector-icons/createIconSet', () => {
  const Icon = ({ children }: any) => children || null
  return Icon
})
jest.mock('@expo/vector-icons/createIconSetFromFontello', () => {
  const Icon = ({ children }: any) => children || null
  return Icon
})
// also mock potential built paths
jest.mock('@expo/vector-icons/build/createIconSet', () => {
  const Icon = ({ children }: any) => children || null
  return Icon
})
// also mock potential built path for MaterialCommunityIcons createIconSet
try {
  jest.mock('@expo/vector-icons/build/MaterialCommunityIcons', () => {
    const Icon = ({ children }: any) => children || null
    return Icon
  })
} catch {
  // ignore if not present
}

// @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  clear: () => Promise.resolve(null),
  getAllKeys: () => Promise.resolve([]),
  getItem: () => Promise.resolve(null),
  removeItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(null)
}))

// expo-audio
jest.mock('expo-audio', () => ({
  Audio: {
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    Sound: jest.fn().mockImplementation(() => ({
      getStatusAsync: jest.fn().mockResolvedValue({}),
      loadAsync: jest.fn().mockResolvedValue(undefined),
      pauseAsync: jest.fn().mockResolvedValue(undefined),
      playAsync: jest.fn().mockResolvedValue(undefined),
      setOnPlaybackStatusUpdate: jest.fn(),
      stopAsync: jest.fn().mockResolvedValue(undefined),
      unloadAsync: jest.fn().mockResolvedValue(undefined)
    }))
  },
  setAudioModeAsync: jest.fn(),
  useAudioPlayer: jest.fn(() => ({
    duration: 0,
    currentTime: 0,
    isLoaded: false,
    isPlaying: false,
    load: jest.fn().mockResolvedValue(undefined),
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    seekTo: jest.fn(),
    addListener: jest.fn(() => ({
      remove: jest.fn()
    }))
  }))
}))

// expo-blur
jest.mock('expo-blur', () => ({
  BlurView: ({ children }: any) => children
}))

// expo-font — real useFonts returns a Map-keyed loaded state that resolves async; tests need
// fonts already "loaded" synchronously so Theme.tsx's own splash gate (see splashGate.ts) doesn't
// stay stuck waiting on it forever.
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: () => true
}))

// expo-linking
jest.mock('expo-linking', () => ({
  useLinkingURL: () => null,
  clearInitialURL: jest.fn()
}))

// expo-splash-screen
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  setOptions: jest.fn(),
  hideAsync: jest.fn().mockResolvedValue(undefined)
}))

// react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const makeGesture = () => {
    const g: any = {}
    g.activeOffsetX = () => g
    g.activeOffsetY = () => g
    g.enabled = () => g
    g.failOffsetX = () => g
    g.failOffsetY = () => g
    g.manualActivation = () => g
    g.maxPointers = () => g
    g.minDistance = () => g
    g.minPointers = () => g
    g.onBegin = () => g
    g.onChange = () => g
    g.onEnd = () => g
    g.onFinalize = () => g
    g.onStart = () => g
    g.onTouchesDown = () => g
    g.onTouchesMove = () => g
    g.onTouchesUp = () => g
    g.onUpdate = () => g
    g.requireExternalGestureToFail = () => g
    g.runOnJS = () => g
    g.shouldCancelWhenOutside = () => g
    g.simultaneousWithExternalGesture = () => g
    return g
  }

  return {
    GestureHandlerRootView: ({ children }: any) => children,
    PanGestureHandler: ({ children }: any) => children,
    PinchGestureHandler: ({ children }: any) => children,
    State: { ACTIVE: 'ACTIVE', END: 'END' },
    Gesture: {
      Native: () => makeGesture(),
      Pinch: () => makeGesture(),
      Pan: () => makeGesture(),
      Simultaneous: (..._gs: any[]) => makeGesture(),
      Race: (..._gs: any[]) => makeGesture(),
      Sequence: (..._gs: any[]) => makeGesture()
    },
    GestureDetector: ({ children }: any) => children
  }
})

// react-native-keyboard-controller
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardController: {
    addListener: jest.fn(),
    dismiss: jest.fn(),
    removeListener: jest.fn(),
    setInputMode: jest.fn()
  },
  KeyboardProvider: ({ children }: any) => children,
  KeyboardAwareScrollView: ({ children }: any) => children,
  useKeyboardHandler: jest.fn(),
  useReanimatedKeyboardAnimation: jest.fn(() => ({ height: { value: 0 }, progress: { value: 0 } }))
}))

// react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaInsetsContext: {
    Consumer: ({ children }: any) => children({ top: 0, right: 0, bottom: 0, left: 0 })
  },
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

// react-native-svg
// Every primitive any mode in src/modes/*.tsx actually imports needs an entry here — this used to
// only cover whichever ones happened to get exercised, since GameVisual/ModeSelector's own
// measure-then-mount gates meant most modes' <Visual> never actually rendered in tests at all
// (Ellipse was missing and nothing surfaced it until those gates came out).
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
  Svg: ({ children }: any) => children,
  Circle: 'Circle',
  Ellipse: 'Ellipse',
  G: 'G',
  Line: 'Line',
  Path: 'Path',
  Rect: 'Rect',
  Text: 'Text'
}))

// redux-persist
jest.mock('redux-persist', () => {
  const actual = jest.requireActual('redux-persist')
  return {
    ...actual,
    persistStore: jest.fn(() => ({ purge: jest.fn(), flush: jest.fn() })),
    persistReducer: (_config: any, reducer: any) => reducer,
    persistCombineReducers: (_config: any, reducers: any) => reducers,
    createMigrate: jest.fn(),
    createTransform: jest.fn(),
    getStoredState: jest.fn().mockResolvedValue(undefined)
  }
})

// redux-persist PersistGate (integration/react)
jest.mock('redux-persist/integration/react', () => ({
  PersistGate: ({ children }: any) => children
}))

// Mock react-native-paper MaterialCommunityIcon implementations (different build paths)
try {
  jest.mock('react-native-paper/src/components/MaterialCommunityIcon', () => {
    const React = jest.requireActual('react')
    return ({ children }: any) => React.createElement('Text', null, children || null)
  })
} catch {
  /* ignore if path not found */
}
try {
  jest.mock('react-native-paper/lib/commonjs/src/components/MaterialCommunityIcon', () => {
    const React = jest.requireActual('react')
    return ({ children }: any) => React.createElement('Text', null, children || null)
  })
} catch {
  /* ignore if path not found */
}

// Surface unhandled promise rejections and uncaught exceptions during tests
const handleUnhandledRejection = (reason: any) => {
  // eslint-disable-next-line no-console
  console.error('UnhandledRejection in tests:', reason)
}

const handleUncaughtException = (err: any) => {
  // eslint-disable-next-line no-console
  console.error('UncaughtException in tests:', err)
}

if (typeof process !== 'undefined' && process && process.on) {
  process.on('unhandledRejection', handleUnhandledRejection)
  process.on('uncaughtException', handleUncaughtException)
}

// Suppress Animated native warnings in tests and provide RAF polyfills
try {
  // suppress the 'Animated: `useNativeDriver`' warnings from RN Animated native helper
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper')
} catch {
  // ignore if the path isn't present in this environment
}

// Force react-native Animated to use JS driver (not native) to avoid
// findHostInstanceWithWarning failures in test-renderer environment
try {
  const AnimatedImpl = require('react-native/Libraries/Animated/AnimatedImplementation')
  const realSpring = AnimatedImpl.spring
  AnimatedImpl.spring = (value: unknown, config: Record<string, unknown>) => realSpring(value, { ...config, useNativeDriver: false })
  const realTiming = AnimatedImpl.timing
  AnimatedImpl.timing = (value: unknown, config: Record<string, unknown>) => realTiming(value, { ...config, useNativeDriver: false })
  const realDecay = AnimatedImpl.decay
  AnimatedImpl.decay = (value: unknown, config: Record<string, unknown>) => realDecay(value, { ...config, useNativeDriver: false })
} catch {
  // ignore if module path not found
}

// Provide a basic requestAnimationFrame/cancelAnimationFrame for animation updates in tests
if (typeof global.requestAnimationFrame === 'undefined') {
  global.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0)
}
if (typeof global.cancelAnimationFrame === 'undefined') {
  global.cancelAnimationFrame = (id: any) => clearTimeout(id)
}

// Patch NativeAnimatedModule to call endCallback synchronously instead of via
// setTimeout(..., 16), preventing timer leaks that fire after test environment teardown.
// This must run before any test to take effect on all animation starts.
beforeEach(() => {
  try {
    const { NativeModules } = require('react-native')
    const mod = NativeModules?.NativeAnimatedModule
    if (mod?.startAnimatingNode?.mockImplementation) {
      mod.startAnimatingNode.mockImplementation((_animId: unknown, _nodeTag: unknown, _config: unknown, endCallback: (result: { finished: boolean }) => void) => {
        endCallback({ finished: true })
      })
    }
  } catch {
    // ignore if NativeModules unavailable
  }
})

afterEach(() => {
  jest.clearAllTimers()
})
