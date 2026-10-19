/* global jest */
const RN = require('react-native')
const { useRef } = require('react')
const passthrough = (value: unknown) => value
const passthroughLast = (...values: unknown[]) => values[values.length - 1]

// A layout animation builder (FadeIn, LinearTransition, ...): every modifier hands back the same
// builder, so a chain like `LinearTransition.duration(250).easing(...)` still ends on one. Nothing
// animates under Jest: Animated.View is React Native's own View, which only carries the prop.
const layoutAnimation = () => {
  const builder: Record<string, unknown> = {}
  for (const modifier of ['duration', 'delay', 'easing', 'springify', 'damping', 'stiffness', 'withInitialValues', 'withCallback', 'reduceMotion']) builder[modifier] = () => builder
  return builder
}

const Animated = {
  View: RN.View,
  Text: RN.Text,
  Image: RN.Image,
  ScrollView: RN.ScrollView,
  FlatList: RN.FlatList,
  createAnimatedComponent: (Component: unknown) => Component,
  // Real shared values are stable across re-renders (ref-like) - a fresh `{ value }` object per
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
      // Swallowed, same as useAnimatedStyle/useAnimatedProps above - a reaction that throws on
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
  FadeIn: layoutAnimation(),
  FadeInDown: layoutAnimation(),
  FadeInUp: layoutAnimation(),
  FadeOut: layoutAnimation(),
  FadeOutDown: layoutAnimation(),
  FadeOutUp: layoutAnimation(),
  Layout: layoutAnimation(),
  LinearTransition: layoutAnimation(),
  ZoomIn: layoutAnimation(),
  ZoomOut: layoutAnimation(),
  // Renders its children as they are (it only tells real layout animations to skip).
  LayoutAnimationConfig: ({ children }: { children: unknown }) => children,
  // The system's Reduce Motion, as reanimated read it at launch: off, unless a test says otherwise.
  useReducedMotion: jest.fn(() => false),
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

module.exports = Animated
