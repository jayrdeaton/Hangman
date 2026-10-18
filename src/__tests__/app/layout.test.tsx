import { BlurView, themeActions, useBlur } from '@rific/auto-paper'
import { getDrawerConfig } from '@rific/drawer'
import { useUpdater } from '@rific/updater'
import { act, render, waitFor } from '@testing-library/react-native'
import { DarkTheme, DefaultTheme } from 'expo-router'
import { Platform } from 'react-native'

import RootLayout from '@/app/_layout'
import { store } from '@/redux/store'

// Stack, Stack.Screen and ThemeProvider record their props, so the options RootLayout hands the
// native stack (and the navigation theme around it) can be read back; the rest is the shared
// expo-router mock. The Stack draws a plain View (testID 'stack') where the screens would go, and the
// two navigation themes are told apart by their colors.
const mockStack = jest.fn()
const mockStackScreen = jest.fn()
const mockThemeProvider = jest.fn()
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { View } = require('react-native')
  const navigationTheme = (dark: boolean) => ({ dark, colors: { primary: dark ? '#d0bcff' : '#6750a4', background: dark ? '#121212' : '#f2f2f2', card: dark ? '#1e1e1e' : '#ffffff', text: dark ? '#ffffff' : '#000000', border: dark ? '#272727' : '#d8d8d8', notification: '#ff453a' }, fonts: {} })
  return {
    ...jest.requireActual('../../__mocks__/expo-router'),
    Stack: Object.assign(
      (props: { children?: unknown }) => {
        mockStack(props)
        return createElement(View, { testID: 'stack' }, props.children)
      },
      {
        Screen: (props: unknown) => {
          mockStackScreen(props)
          return null
        }
      }
    ),
    ThemeProvider: (props: { value: unknown; children?: unknown }) => {
      mockThemeProvider(props)
      return props.children
    },
    DarkTheme: navigationTheme(true),
    DefaultTheme: navigationTheme(false)
  }
})

// Spied, not stubbed: the real hook still runs (it never checks under Jest, where __DEV__ is true), so
// the layout renders for real. The spy only records the options each instance passes.
jest.mock('@rific/updater', () => {
  const actual = jest.requireActual('@rific/updater')
  return { ...actual, useUpdater: jest.fn(actual.useUpdater) }
})

type ScreenProps = { name: string; options?: object | ((args: { route: { params?: object } }) => object) }

const latest = <T,>(mock: jest.Mock): T => mock.mock.calls[mock.mock.calls.length - 1][0]
const screenOptions = () => latest<{ screenOptions: Record<string, unknown> }>(mockStack).screenOptions
const navigationTheme = () => latest<{ value: typeof DarkTheme }>(mockThemeProvider).value
const screens = () => {
  // Every render registers the same screens again: keep the latest props per name.
  const byName = new Map<string, ScreenProps>()
  mockStackScreen.mock.calls.forEach(([props]: [ScreenProps]) => byName.set(props.name, props))
  return byName
}

// The theme settings live in the real (module singleton) store, and Theme's Provider adopts a change
// to them after mount, so this is how a test picks the appearance, before rendering or during.
const setAppearance = (appearance: 'light' | 'dark') => store.dispatch(themeActions.initialize({ appearance }))
const initialTheme = store.getState().theme

// The Stack only renders once Theme's Provider has computed the theme (in an effect after mount).
const renderLayout = async () => {
  const result = await render(<RootLayout />)
  await waitFor(() => expect(mockStack).toHaveBeenCalled())
  return result
}

const originalOS = Platform.OS

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  store.dispatch(themeActions.initialize(initialTheme))
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS })
})

describe('RootLayout', () => {
  it('renders without crashing', async () => {
    await expect(renderLayout()).resolves.toBeTruthy()
  })

  // Moved here from the old App.tsx: without it every drawer's panel falls back to a solid backdrop.
  it('hands the drawers auto-paper once, at load', () => {
    expect(getDrawerConfig().autoPaper).toMatchObject({ BlurView, useBlur })
  })

  // The old App test: App used to call useUpdater() bare, which confirms an update through the native
  // Alert (a no-op on web). Every instance that checks on its own must be UpdateDialog's, which
  // confirms through the themed card. A manual-only instance (autoCheck: false) is skipped.
  it('confirms every automatic update check through the themed UpdateDialog', async () => {
    await renderLayout()

    const autoChecking = jest
      .mocked(useUpdater)
      .mock.calls.map(([options]) => options)
      .filter((options) => options?.autoCheck !== false)
    expect(autoChecking.length).toBeGreaterThan(0)
    autoChecking.forEach((options) => expect(options?.onConfirm).toEqual(expect.any(Function)))
  })

  // Every screen is transparent over the one board, so the board has to be drawn first: a later
  // sibling draws on top.
  it('draws the board behind the stack', async () => {
    const { getByTestId } = await renderLayout()

    const board = getByTestId('board-background')
    const stack = getByTestId('stack')
    expect(board.parent).toBe(stack.parent)
    const siblings = board.parent?.children ?? []
    expect(siblings.indexOf(board)).toBeLessThan(siblings.indexOf(stack))
    expect(board).toHaveProp('pointerEvents', 'none')
  })
})

describe('RootLayout screen options', () => {
  // No header (every screen draws its own), no iOS swipe-back (it would run over the keyboard's left
  // column, and every screen has its own back), and no screen color of its own over the board.
  it('hides the header, turns swipe-back off and leaves every screen transparent', async () => {
    await renderLayout()

    expect(screenOptions()).toMatchObject({ headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: 'transparent' } })
    // iOS keeps the native push.
    expect(screenOptions()).not.toHaveProperty('animation')
  })

  // A slide would show the screen underneath through the transparent one coming in.
  it('crossfades between screens on Android', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
    await renderLayout()

    expect(screenOptions()).toMatchObject({ animation: 'fade', headerShown: false, gestureEnabled: false })
  })

  it('registers the six screens, with options only on game and play', async () => {
    await renderLayout()

    const registered = screens()
    expect([...registered.keys()]).toEqual(['index', 'loadout', 'game', 'achievements', 'profiles', 'play'])
    expect(['index', 'loadout', 'achievements', 'profiles'].map((name) => registered.get(name)?.options)).toEqual([undefined, undefined, undefined, undefined])
  })

  // Home's cold-launch resume redirects with resume=1: that game is where the player already was, so
  // it appears without a push. A game reached any other way pushes as usual.
  it("skips the game screen's push only for a resumed game", async () => {
    await renderLayout()

    const options = screens().get('game')?.options
    expect(options).toEqual(expect.any(Function))
    const optionsFor = options as (args: { route: { params?: object } }) => object
    expect(optionsFor({ route: { params: { mode: 'solo', resume: '1' } } })).toEqual({ animation: 'none' })
    expect(optionsFor({ route: { params: { mode: 'pnp', resume: '1' } } })).toEqual({ animation: 'none' })
    expect(optionsFor({ route: { params: { mode: 'solo' } } })).toEqual({})
    expect(optionsFor({ route: { params: {} } })).toEqual({})
    expect(optionsFor({ route: {} })).toEqual({})
  })

  // /play draws nothing of its own (it hands straight off to the game), so there's nothing to animate.
  it('never animates the play screen in', async () => {
    await renderLayout()

    expect(screens().get('play')?.options).toEqual({ animation: 'none' })
  })
})

describe('RootLayout theming', () => {
  it('writes the status bar in light ink on the dark board', async () => {
    setAppearance('dark')
    await renderLayout()

    await waitFor(() => expect(screenOptions().statusBarStyle).toBe('light'))
  })

  it('writes the status bar in dark ink on the light board', async () => {
    setAppearance('light')
    await renderLayout()

    await waitFor(() => expect(screenOptions().statusBarStyle).toBe('dark'))
  })

  // The ink follows the in-app theme, not the system appearance, so it has to follow a change made in
  // Settings while the app is open.
  it("follows a change to the player's appearance setting while open", async () => {
    setAppearance('light')
    await renderLayout()
    await waitFor(() => expect(screenOptions().statusBarStyle).toBe('dark'))

    await act(async () => {
      setAppearance('dark')
    })

    await waitFor(() => expect(screenOptions().statusBarStyle).toBe('light'))
  })

  // React Navigation paints its theme's background around every screen; it has to be transparent or
  // it would hide the board. Everything else is the stock dark or light navigation theme.
  it('hands the navigation a transparent background on the dark theme', async () => {
    setAppearance('dark')
    await renderLayout()

    await waitFor(() => expect(navigationTheme().dark).toBe(true))
    expect(navigationTheme()).toEqual({ ...DarkTheme, colors: { ...DarkTheme.colors, background: 'transparent' } })
  })

  it('hands the navigation a transparent background on the light theme', async () => {
    setAppearance('light')
    await renderLayout()

    await waitFor(() => expect(navigationTheme().dark).toBe(false))
    expect(navigationTheme()).toEqual({ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: 'transparent' } })
  })
})
