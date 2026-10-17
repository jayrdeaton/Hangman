/* global jest */
// expo-router, for screens rendered on their own (not through a navigator): the router's calls are
// recorded on `router`, the screen counts as focused, and useFocusEffect runs like a mount effect.
// A bare-package mock, so Jest picks it up with no registration (see jest.setup.cjs). A test that
// needs a screen unfocused sets useIsFocused's return value itself.
const React = require('react')
const { Text } = require('react-native')

const router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  dismissTo: jest.fn(),
  dismiss: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => false)
}

const Stack = Object.assign(({ children }: any) => React.createElement(React.Fragment, null, children), { Screen: () => null })

const theme = (dark: boolean) => ({ dark, colors: { primary: '#000', background: dark ? '#000' : '#fff', card: '#fff', text: '#000', border: '#000', notification: '#000' }, fonts: {} })

module.exports = {
  __esModule: true,
  router,
  useRouter: () => router,
  useLocalSearchParams: jest.fn(() => ({})),
  useGlobalSearchParams: jest.fn(() => ({})),
  usePathname: jest.fn(() => '/'),
  useIsFocused: jest.fn(() => true),
  // The real hook runs the effect on focus and its cleanup on blur; here the screen is always focused.
  useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(() => effect(), [effect]),
  // Renders where it would send the player, so a test can read it.
  Redirect: ({ href }: any) => React.createElement(Text, { testID: 'redirect' }, typeof href === 'string' ? href : JSON.stringify(href)),
  Link: ({ children }: any) => children,
  Stack,
  ThemeProvider: ({ children }: any) => children,
  DarkTheme: theme(true),
  DefaultTheme: theme(false)
}
