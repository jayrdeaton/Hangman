import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import MaskedView from '@react-native-masked-view/masked-view'
import { Provider, themeActions, type ThemeSettings, useAutoPaperTheme, useThemeSettings } from '@rific/auto-paper'
import * as ExpoBlur from 'expo-blur'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import * as SystemUI from 'expo-system-ui'
import { ReactNode, useCallback, useEffect, useRef } from 'react'
import Reanimated from 'react-native-reanimated'
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux'

import { boardColor } from '@/components/BoardBackground'
import { useActivePlayer } from '@/hooks/useActivePlayer'
import { isSamePlayerTheme, playerThemeActions } from '@/redux/playerThemeSlice'
import { RootState } from '@/redux/store'
import type { PlayerKey } from '@/utils/players'
import { markSplashReady, useSplashReady } from '@/utils/splashGate'

SplashScreen.preventAutoHideAsync()
SplashScreen.setOptions({
  duration: 500,
  fade: true
})

export type ThemeProps = {
  children: ReactNode
}

// @tastic/core sets the OS root background to black as soon as its barrel is imported (its
// useThemedRootBackground.ts calls SystemUI.setBackgroundColorAsync('#000000') at module scope), and
// every @tastic/hud/chrome component imports that barrel. The fleet's games correct it with that
// hook's black or white, but this app paints its board behind every screen (BoardBackground, the
// theme's surface in light appearance and a step below it in dark), so it repaints the root with the
// board's color instead: the iOS window and root view, the
// Android decor view, and the web page body. That's what shows at the corners while an iPad turns
// upside down, behind an Android keyboard resize, and past the page edges on web. Effects run after
// every module has loaded, so this always lands after the import-time call, and it renders inside
// Provider, which renders nothing until the computed theme exists.
const RootBackground = (): null => {
  const { colors, dark } = useAutoPaperTheme()
  const color = boardColor(dark, colors.surface)
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(color)
  }, [color])
  return null
}

// Each player's colors (the palette and its harmony; appearance and Blur stay the device's). The live
// theme always holds the active player's: when the active player changes, theirs (if they have any
// saved) go on screen, and every change after that (the palette picker in Customize) is saved as theirs.
// A player with none saved yet keeps the colors on screen and has them saved as theirs, so switching
// back to whoever was playing before brings their colors back too. Loop-free: putting a player's colors
// on screen writes nothing (they already match), and only a real difference is ever written either way.
// Renders inside Provider, for useThemeSettings.
const PlayerThemeSync = (): null => {
  const store = useStore<RootState>()
  const dispatch = useDispatch()
  const { key: playerKey } = useActivePlayer()
  const { settings, set } = useThemeSettings()
  const { color, harmony } = settings
  // The player whose colors are on screen. null until the first run.
  const syncedPlayerRef = useRef<PlayerKey | null>(null)

  useEffect(() => {
    const live = { color, harmony }
    const saved = store.getState().playerTheme[playerKey]
    if (syncedPlayerRef.current !== playerKey) {
      syncedPlayerRef.current = playerKey
      if (saved && !isSamePlayerTheme(saved, live)) {
        // Their colors land on the next render, which then finds them matching and writes nothing.
        set(saved)
        return
      }
    }
    if (!isSamePlayerTheme(saved, live)) dispatch(playerThemeActions.setPlayerTheme({ playerKey, theme: live }))
  }, [playerKey, color, harmony, set, store, dispatch])

  return null
}

export const Theme = ({ children }: ThemeProps) => {
  const settings = useSelector((state: RootState) => state.theme, shallowEqual)
  const dispatch = useDispatch()
  const onChange = useCallback((next: ThemeSettings) => dispatch(themeActions.initialize(next)), [dispatch])
  // A one-shot callback, not a boolean, so there's nothing for useSplashReady to watch. This marks
  // the 'theme' gate (see src/utils/splashGate.ts) directly instead.
  const onReady = useCallback(() => markSplashReady('theme'), [])
  // Every icon in this app renders through react-native-paper's own icon prop/Icon component
  // (see e.g. LoadoutScreen.tsx's IconButton icon='cog', PuzzleInfoRow.tsx's
  // <Icon source='lightbulb...'), which always resolves to this exact font (see
  // node_modules/react-native-paper's own MaterialCommunityIcon.tsx). @expo/vector-icons has never
  // loaded this font by the time it's first asked to render a glyph: each Icon instance mounts
  // already-blank (`Font.isLoaded` false), independently kicks off its own `Font.loadAsync` in
  // componentDidMount, and only swaps in the real glyph once that resolves (see
  // @expo/vector-icons/build/createIconSet.js). A handful of icons all across the app (the corners'
  // trophy, arrow and cog, the hint pill's lightbulb, every drawer icon) popping in a beat after
  // everything else already rendered. Loading it here and marking the 'fonts' gate ready only once
  // it resolves means every icon this app will ever show is already loaded by the time the splash
  // lifts, so nothing pops in afterward.
  // A failed load also counts as ready: `fontsLoaded` stays false forever after an error, which
  // would leave the splash up for good, so the app opens without the icon font instead (audit F010).
  const [fontsLoaded, fontError] = useFonts(MaterialCommunityIcons.font)
  useSplashReady('fonts', fontsLoaded || !!fontError)

  return (
    // expoBlur is no longer auto-detected (Metro doesn't resolve a require()-in-try/catch into an
    // ESM build's module graph): every frosted card and sheet depends on this being passed
    // explicitly, or it silently falls back to a solid fill. reanimated is the same story for
    // auto-paper Dialog's animatedStyle prop, which nothing in this app passes any more (the Settings
    // sheet's fade runs on React Native's own Animated); it stays wired for the next caller.
    // maskedView is what lets auto-paper's FadingScrollView fade scrolling rows out at their edges on
    // iOS/Android (the Settings sheet's and Rules' rows above Done, @tastic/profile's dropdown lists
    // above Manage); without it they just scroll with a hard edge. Web needs nothing.
    // statusBar={false}: auto-paper renders no React Native StatusBar (here or in Appbar.Header).
    // @tastic/core's config plugin turns UIViewControllerBasedStatusBarAppearance on, under which a
    // mounted StatusBar logs an error (a red box in a dev build), and an app linked against the iOS
    // 27 SDK can't set the status bar through one anyway. The bar is set per screen instead, by the
    // root Stack's statusBarStyle (src/app/_layout.tsx), which follows this theme.
    <Provider initialValue={settings} onChange={onChange} onReady={onReady} expoBlur={ExpoBlur} maskedView={MaskedView} reanimated={Reanimated} statusBar={false}>
      <RootBackground />
      <PlayerThemeSync />
      {children}
    </Provider>
  )
}
