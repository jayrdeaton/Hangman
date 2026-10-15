import { render } from '@testing-library/react-native'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

import { Theme } from '@/components/Theme'

// @tastic/core's config plugin turns UIViewControllerBasedStatusBarAppearance on, and with it on, every
// React Native StatusBar logs an error (a red box in a dev build). An app linked against the iOS 27 SDK
// can't set the bar through one anyway: that component only sets it app-wide, which UIKit ignores
// there. So nothing in the app may mount one: not a component here, and not auto-paper's own.

const mockAutoPaperProvider = jest.fn(({ children }: { children: unknown }) => children)
jest.mock('@rific/auto-paper', () => ({
  Provider: (props: { children: unknown }) => mockAutoPaperProvider(props),
  themeActions: { initialize: (settings: unknown) => ({ type: 'theme/initialize', payload: settings }) },
  useThemeBridgeProps: (props: object) => props,
  useAutoPaperTheme: () => ({ colors: { surface: '#ffffff' } })
}))
jest.mock('react-redux', () => ({ shallowEqual: () => true, useDispatch: () => () => {}, useSelector: () => ({}) }))
jest.mock('@/utils/splashGate', () => ({ markSplashReady: () => {}, useSplashReady: () => {} }))
jest.mock('expo-blur', () => ({ BlurView: () => null }))
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }))
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({ __esModule: true, default: { font: {} } }))
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: () => Promise.resolve() }))

const SRC = join(__dirname, '..')

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
    const offenders = [...sourceFiles(), join(SRC, '..', 'App.tsx')].filter((file) => {
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
