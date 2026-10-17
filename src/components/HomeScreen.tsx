import { Button } from '@rific/feedback-press'
import { CornerActionButtons } from '@tastic/hud/chrome'
import { Redirect, router, useIsFocused } from 'expo-router'
import { JSX, useCallback, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Portal, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useActiveGame } from '@/hooks/useActiveGame'
import { useCatalogActions } from '@/hooks/useCatalog'
import { gameHref, loadoutHref } from '@/utils/navigation'

import { HeroTitle } from './HeroTitle'
import { SettingsDialog } from './SettingsDialog'

// The fleet's title screen: the hero, Single Player and Pass & Play (each to its own loadout), the
// Stats & Achievements trophy top-left and the Settings cog top-right.
const HomeMenu = (): JSX.Element => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  // Home stays mounted under every other screen, so the hero's art loop pauses while it's covered.
  const focused = useIsFocused()
  const { refreshUnlocks } = useCatalogActions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openStats = useCallback(() => router.push('/achievements'), [])
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  return (
    <Portal.Host>
      <View style={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }]}>
        <HeroTitle paused={!focused} />
        <View style={styles.actions}>
          <Button testID='mode-solo' mode='contained' icon='account' onPress={() => router.push(loadoutHref('solo'))} style={styles.actionButton} buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary}>
            Single Player
          </Button>
          <Button testID='mode-pnp' mode='contained' icon='account-multiple' onPress={() => router.push(loadoutHref('pnp'))} style={styles.actionButton} buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary}>
            Pass &amp; Play
          </Button>
        </View>
      </View>

      {/* The same corner pair the game screen uses, with the trophy in the back slot as every fleet
          title screen has it. pointerEvents='box-none' lets taps between them reach the screen. */}
      <View style={[StyleSheet.absoluteFill, styles.corners]} pointerEvents='box-none'>
        <CornerActionButtons backIcon='trophy' backLabel='Stats & Achievements' onBack={openStats} onSettings={openSettings} fg={theme.colors.onSurface} insets={insets} hitSlop={4} />
      </View>

      <SettingsDialog visible={settingsOpen} onDismiss={closeSettings} onUnlocksChanged={refreshUnlocks} />
    </Portal.Host>
  )
}

// The / route. At a cold launch with a game left open (see useActiveGame), it redirects straight back
// into that game before the menu ever mounts, so Home never flashes on the way: the redirect paints
// nothing, and the board shows behind it. `resume` turns off the game screen's push animation for that
// one trip (see _layout.tsx). The decision is read once, when Home first mounts, never again.
export const HomeScreen = (): JSX.Element => {
  const { consumeResumeMode } = useActiveGame()
  const [resumeMode] = useState(consumeResumeMode)
  if (resumeMode) return <Redirect href={{ ...gameHref(resumeMode), params: { mode: resumeMode, resume: '1' } }} />
  return <HomeMenu />
}

const styles = StyleSheet.create({
  actionButton: { minWidth: 220 },
  actions: { alignItems: 'center', gap: 16 },
  content: { alignItems: 'center', flex: 1, gap: 48, justifyContent: 'center' },
  corners: { zIndex: 10 }
})
