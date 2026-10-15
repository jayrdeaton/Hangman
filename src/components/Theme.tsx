import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Provider, themeActions, type ThemeSettings, useAutoPaperTheme } from '@rific/auto-paper'
import * as ExpoBlur from 'expo-blur'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import * as SystemUI from 'expo-system-ui'
import { ReactNode, useCallback, useEffect } from 'react'
import Reanimated from 'react-native-reanimated'
import { shallowEqual, useDispatch, useSelector } from 'react-redux'

import { RootState } from '@/redux/store'
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
// hook's black or white, but this app paints its theme's surface behind every screen (Main.tsx), so
// it repaints the root with that instead: the iOS window and root view, the Android decor view, and
// the web page body. That's what shows at the corners while an iPad turns upside down, behind an
// Android keyboard resize, and past the page edges on web. Effects run after every module has
// loaded, so this always lands after the import-time call, and it renders inside Provider, which
// renders nothing until the computed theme exists.
const RootBackground = (): null => {
  const { colors } = useAutoPaperTheme()
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.surface)
  }, [colors.surface])
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
  // (see e.g. Main.tsx's AppbarAction icon='menu', PuzzleInfoRow.tsx's <Icon source='lightbulb...'),
  // which always resolves to this exact font (see node_modules/react-native-paper's own
  // MaterialCommunityIcon.tsx). @expo/vector-icons has never loaded this font by the time it's
  // first asked to render a glyph: each Icon instance mounts already-blank (`Font.isLoaded` false),
  // independently kicks off its own `Font.loadAsync` in componentDidMount, and only swaps in the
  // real glyph once that resolves (see @expo/vector-icons/build/createIconSet.js). A handful of
  // icons all across the app (the header's menu/trophy, the hint pill's lightbulb, every drawer
  // icon) popping in a beat after everything else already rendered. Loading it here and marking the
  // 'fonts' gate ready only once it resolves means every icon this app will ever show is already
  // loaded by the time the splash lifts, so nothing pops in afterward.
  const [fontsLoaded] = useFonts(MaterialCommunityIcons.font)
  useSplashReady('fonts', fontsLoaded)

  return (
    // expoBlur is no longer auto-detected (Metro doesn't resolve a require()-in-try/catch into an
    // ESM build's module graph) — every dialog's frosted backdrop depends on this being passed
    // explicitly, or it silently falls back to a solid fill. reanimated is the same story for
    // Dialog's animatedStyle prop (see DialogShell.tsx) — without it, a keyboard-avoidance transform
    // would just be dropped rather than painted.
    <Provider initialValue={settings} onChange={onChange} onReady={onReady} expoBlur={ExpoBlur} reanimated={Reanimated}>
      <RootBackground />
      {children}
    </Provider>
  )
}
