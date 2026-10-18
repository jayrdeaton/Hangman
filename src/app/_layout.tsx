import * as AutoPaper from '@rific/auto-paper'
import { useAutoPaperTheme } from '@rific/auto-paper'
import { configureDrawer } from '@rific/drawer'
import { DarkTheme, DefaultTheme, type NativeStackNavigationOptions, Stack, ThemeProvider } from 'expo-router'
import { JSX, useMemo } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { BoardBackground } from '@/components/BoardBackground'
import { IncomingFileImport } from '@/components/IncomingFileImport'
import { Providers } from '@/components/Providers'
import { UpdateDialog } from '@/components/UpdateDialog'

// @rific/drawer no longer auto-detects @rific/auto-paper (Metro doesn't resolve a
// require()-in-try/catch into an ESM build's module graph), so every drawer's panel needs this
// injected explicitly once, near the app root, or it falls back to a solid (non-blurred) backdrop.
configureDrawer({ autoPaper: AutoPaper })

// A resumed game (Home's cold-launch redirect, see HomeScreen.tsx) appears without the push: it's
// where the player already was, not somewhere new.
const gameOptions = ({ route }: { route: { params?: object } }): NativeStackNavigationOptions => ((route.params as { resume?: string } | undefined)?.resume ? { animation: 'none' } : {})

// Every screen is transparent over the one board (BoardBackground), Solitaire's felt pattern: the
// navigation theme's background too, or React Navigation paints its own color around each screen.
// Android crossfades instead of sliding, or the screen underneath would show through a push. iOS's
// swipe-back is off: it would run along the left edge, over the keyboard's Q, A and Z keys, and every
// screen has its own back. The status bar's ink follows the in-app theme, not the system appearance
// (react-native-screens sets it per screen; a mounted StatusBar can't, see CLAUDE.md's Status bar).
const RootStack = (): JSX.Element => {
  const { dark } = useAutoPaperTheme()
  const navigationTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme
    return { ...base, colors: { ...base.colors, background: 'transparent' } }
  }, [dark])
  const screenOptions = useMemo((): NativeStackNavigationOptions => ({ headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: 'transparent' }, statusBarStyle: dark ? 'light' : 'dark', ...(Platform.OS === 'android' ? { animation: 'fade' } : {}) }), [dark])

  return (
    <View style={styles.flex}>
      <BoardBackground />
      <ThemeProvider value={navigationTheme}>
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name='index' />
          <Stack.Screen name='loadout' />
          <Stack.Screen name='game' options={gameOptions} />
          <Stack.Screen name='achievements' />
          <Stack.Screen name='profiles' />
          {/* Draws nothing of its own (see PlayScreen), so there's nothing to animate in. */}
          <Stack.Screen name='play' options={{ animation: 'none' }} />
        </Stack>
      </ThemeProvider>
    </View>
  )
}

const RootLayout = (): JSX.Element => (
  <GestureHandlerRootView style={styles.flex}>
    <Providers>
      <RootStack />
      {/* Both render through the root Portal host, over whichever screen is showing. UpdateDialog is
          the app's one automatic update check; its card only mounts once an update is found. */}
      <IncomingFileImport />
      <UpdateDialog />
    </Providers>
  </GestureHandlerRootView>
)

export default RootLayout

const styles = StyleSheet.create({
  flex: { flex: 1 }
})
