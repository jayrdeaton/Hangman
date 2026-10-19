import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import MaskedView from '@react-native-masked-view/masked-view'
import { Provider, themeActions, type ThemeSettings, useAutoPaperTheme, useThemeSettings } from '@rific/auto-paper'
import * as ExpoBlur from 'expo-blur'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import * as SystemUI from 'expo-system-ui'
import { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import { ThemeProvider } from 'react-native-paper'
import Reanimated from 'react-native-reanimated'
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux'

import { boardColor } from '@/components/BoardBackground'
import { useActivePlayer } from '@/hooks/useActivePlayer'
import { isSamePlayerTheme, isSamePlayerThemeEntry, playerThemeActions, resolvePlayerTheme, sameColor } from '@/redux/playerThemeSlice'
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
// theme always holds the active player's: their Hangman pick (playerTheme); else, for a profile, the
// profile's own color with the default harmony; else, for a guest, whatever is on screen (a Pass &
// Play guest seat is given colors of its own before it first plays, see useProfiles' selectPlayer, so
// that's only ever Single Player's guest). A profile's
// pick lapses once the profile's own color changes (playerThemeSlice's resolvePlayerTheme), so a new
// color given to the profile on the Profiles screen, or in another game, shows here too. When the
// active player changes, or their profile's color does, their colors go on screen, and every change
// after that (the player picker's color page, Settings' HARMONY) is saved as theirs, with the profile's
// color it was picked against. A guest with none saved yet keeps the colors on screen and has them
// saved as theirs, so switching back to whoever was playing before brings their colors back too.
// Loop-free: putting a player's colors on screen writes nothing until they're there, and only a real
// difference is ever written either way. Renders inside Provider, for useThemeSettings.
const PlayerThemeSync = (): null => {
  const store = useStore<RootState>()
  const dispatch = useDispatch()
  const { key: playerKey, profileId } = useActivePlayer()
  // The active profile's own color as the roster has it now; null for a guest.
  const profileColor = useSelector((state: RootState) => (profileId ? (state.profiles.find((profile) => profile.id === profileId)?.color ?? null) : null))
  const { settings, set } = useThemeSettings()
  const { color, harmony } = settings
  // Whose colors are on screen, and against which profile color. null until the first run.
  const syncedRef = useRef<{ playerKey: PlayerKey; profileColor: string | null } | null>(null)

  useEffect(() => {
    const live = { color, harmony }
    const saved = store.getState().playerTheme[playerKey]
    const synced = syncedRef.current
    if (!synced || synced.playerKey !== playerKey || !sameColor(synced.profileColor, profileColor)) {
      syncedRef.current = { playerKey, profileColor }
      const wanted = resolvePlayerTheme(saved, profileColor)
      if (wanted && !isSamePlayerTheme(wanted, live)) {
        // Their colors land on the next render, which then files them (with this profile color) and
        // puts nothing else on screen.
        set(wanted)
        return
      }
    }
    const next = profileColor ? { ...live, profileColor } : live
    if (!isSamePlayerThemeEntry(saved, next)) dispatch(playerThemeActions.setPlayerTheme({ playerKey, theme: next }))
  }, [playerKey, profileColor, color, harmony, set, store, dispatch])

  return null
}

// The scrim behind every card and sheet in dark appearance: black rather than MD3's grey
// (rgba(51, 47, 55, 0.4)). The chalkboard is a step darker than the cards' surface (BoardBackground's
// boardColor), and the grey scrim lifted it to the cards' own color, so a card's edge vanished into the
// board (Jay, 2026-10-19). Light appearance keeps MD3's.
export const DARK_BACKDROP = 'rgba(0, 0, 0, 0.6)'

// The theme with DARK_BACKDROP for the whole app, under auto-paper's Provider (Paper's Portal carries
// it into every card and sheet from where each is declared).
const BackdropTheme = ({ children }: { children: ReactNode }) => {
  const theme = useAutoPaperTheme()
  const scrimTheme = useMemo(() => (theme.dark ? { ...theme, colors: { ...theme.colors, backdrop: DARK_BACKDROP } } : theme), [theme])
  return <ThemeProvider theme={scrimTheme}>{children}</ThemeProvider>
}

// How much of the theme's surface every frosted card and sheet lays over its blur (auto-paper's
// `blurTint`, 0.2 by default). The board's art is drawn in thick, bright strokes right where the cards
// open, and at 0.2 the gallows, the figure and the keyboard read clearly through every card, right
// behind its title and the answer, and in dark mode a card's edge all but vanished into the board (Jay,
// 2026-10-19). Hangman's own, set here rather than stored: nothing lets a player change it.
export const CARD_BLUR_TINT = 0.7

export const Theme = ({ children }: ThemeProps) => {
  const storedSettings = useSelector((state: RootState) => state.theme, shallowEqual)
  const settings = useMemo(() => ({ ...storedSettings, blurTint: CARD_BLUR_TINT }), [storedSettings])
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
      <BackdropTheme>{children}</BackdropTheme>
    </Provider>
  )
}
