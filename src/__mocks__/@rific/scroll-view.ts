/* global jest */
const React = jest.requireActual('react')
const RN = require('react-native')

const defaultScrollViewSettings = {
  backActionFixed: true,
  footerFixed: false,
  headerFixed: false,
  snapBack: false
}

module.exports = {
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
  // needs this mock to actually put them in the tree. backAction mirrors the real component's
  // own dual signature (see @rific/scroll-view's ScrollViewHeader.tsx): a function still gets
  // wrapped in a bare Pressable with a default accessibilityLabel of 'Back' (matching react-
  // native-paper's own Appbar.BackAction default, for the same reason backActionAccessibilityLabel
  // exists), but every drawer in this app now passes a ReactNode instead (its own IconButton,
  // with its own onPress/accessibilityLabel already baked in) — that has to render as-is, not get
  // swallowed into an onPress prop that's never called.
  ScrollViewHeader: ({ backAction, backActionAccessibilityLabel, caption, centerContent, children, title, trailingAction }: any) => (children !== undefined ? children : React.createElement(React.Fragment, null, backAction && (typeof backAction === 'function' ? React.createElement(RN.Pressable, { accessibilityLabel: backActionAccessibilityLabel ?? 'Back', accessibilityRole: 'button', onPress: backAction }) : backAction), centerContent !== undefined ? centerContent : React.createElement(React.Fragment, null, title && React.createElement(RN.Text, null, title), caption && React.createElement(RN.Text, null, caption)), trailingAction ?? null)),
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
