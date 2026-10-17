import { render } from '@testing-library/react-native'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

import { Theme } from '@/components/Theme'

// @tastic/core's config plugin turns UIViewControllerBasedStatusBarAppearance on, and with it on, every
// React Native StatusBar logs an error (a red box in a dev build). An app linked against the iOS 27 SDK
// can't set the bar through one anyway: that component only sets it app-wide, which UIKit ignores
// there. So nothing in the app may mount one: not a component here, and not auto-paper's own. The
// bar's ink is set per screen instead, through the root Stack's statusBarStyle (see
// app/layout.test.tsx).

const mockAutoPaperProvider = jest.fn(({ children }: { children: unknown }) => children)
jest.mock('@rific/auto-paper', () => ({
  Provider: (props: { children: unknown }) => mockAutoPaperProvider(props),
  themeActions: { initialize: (settings: unknown) => ({ type: 'theme/initialize', payload: settings }) },
  useThemeBridgeProps: (props: object) => props,
  useAutoPaperTheme: () => ({ colors: { surface: '#ffffff' } }),
  useThemeSettings: () => ({ settings: { color: '#f44336', harmony: 'split-complementary' }, set: () => {} })
}))
// Just enough of the store for Theme and its per-player color sync: the guest, with nothing saved.
const mockState = { theme: {}, activePlayer: { profileId: null }, playerTheme: {} }
jest.mock('react-redux', () => ({ shallowEqual: () => true, useDispatch: () => () => {}, useSelector: (select: (state: typeof mockState) => unknown) => select(mockState), useStore: () => ({ getState: () => mockState }) }))
jest.mock('@/utils/splashGate', () => ({ markSplashReady: () => {}, useSplashReady: () => {} }))
jest.mock('expo-blur', () => ({ BlurView: () => null }))
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }))
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({ __esModule: true, default: { font: {} } }))
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: () => Promise.resolve() }))

const SRC = join(__dirname, '..')
// The one app file outside src/: expo-router's entry (src/app/_layout.tsx, the old App.tsx's
// replacement, is under src/ and scanned with the rest).
const ENTRY = join(SRC, '..', 'index.js')

/** Every app source file (tests and mocks left out). */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' || name === '__mocks__' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('the status bar', () => {
  it('is never a StatusBar component: no source file imports expo-status-bar or React Native StatusBar', () => {
    const files = [...sourceFiles(), ENTRY]
    // Guards the scan itself: the routes and the root layout have to be in it.
    expect(files).toEqual(expect.arrayContaining([join(SRC, 'app', '_layout.tsx'), join(SRC, 'app', 'game.tsx'), join(SRC, 'components', 'Theme.tsx')]))

    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /from ['"]expo-status-bar['"]/.test(source) || /import\s*\{[^}]*\bStatusBar\b[^}]*\}\s*from ['"]react-native['"]/.test(source)
    })
    expect(offenders.map((file) => relative(SRC, file))).toEqual([])
  })

  it("turns auto-paper's own StatusBar off", async () => {
    await render(<Theme>{null}</Theme>)
    expect(mockAutoPaperProvider).toHaveBeenCalledWith(expect.objectContaining({ statusBar: false }))
  })
})
