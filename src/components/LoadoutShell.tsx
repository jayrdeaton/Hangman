import { resolveSeedColor, useThemeSettings } from '@rific/auto-paper'
import { IconButton } from '@rific/feedback-press'
import { ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { useFocusEffect } from 'expo-router'
import { JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, StyleSheet, View } from 'react-native'
import { Icon, Portal, Text, useTheme } from 'react-native-paper'

import { useCatalogActions } from '@/hooks/useCatalog'
import { fullyDrawnMistakes } from '@/modes/shared/fullyDrawnMistakes'
import type { GameMode } from '@/types/gameModes'
import { safeBack } from '@/utils/navigation'
import { gameShell } from '@/utils/webLayout'

import { GameVisual } from './GameVisual'
import { PackRow } from './PackRow'
import { SettingsDialog } from './SettingsDialog'

// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on the header) brings
// the tap target up to 48x48 without the visible circle growing.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

// The art summary row both loadouts share: the current art, drawn complete, opening Customize (the
// palette and the art carousel, ModePickerDrawer).
export const ArtRow = ({ mode, onPress }: { mode: GameMode; onPress: () => void }): JSX.Element => {
  const theme = useTheme()
  const { settings } = useThemeSettings()
  // Same triad PuzzleStage builds for the real board, so the preview shows the art's full colors.
  const colors = useMemo(() => [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary], [theme.colors.primary, theme.colors.secondary, theme.colors.tertiary])
  return <PackRow label={mode.label} subtitle={mode.description} leading={<GameVisual mode={mode} mistakes={fullyDrawnMistakes(mode)} color={resolveSeedColor(settings.color)} colors={colors} style={[styles.artPreview, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} />} trailing={<Icon source='chevron-right' size={24} color={theme.colors.onSurfaceVariant} />} onPress={onPress} accessibilityLabel={`Art: ${mode.label}. Change art`} />
}

export const SectionLabel = ({ children, first = false }: { children: ReactNode; first?: boolean }): JSX.Element => (
  <Text variant='titleMedium' style={[styles.sectionLabel, first && styles.firstSectionLabel]}>
    {children}
  </Text>
)

export type LoadoutShellProps = {
  title: string
  children: ReactNode
  footer: ReactNode
  // Closes the top-most drawer open over the page, if one is, for Android's back button. Returns
  // whether it closed one.
  closeOverlay: () => boolean
  // Closes every drawer, when the page stops being the one showing (a browser back on the web, a
  // share link pushed over it): an open art picker would otherwise keep its demo loop running.
  closeAllOverlays: () => void
  overlays?: ReactNode
}

// What both loadouts (SoloLoadout, PnpLoadout) share: the header (back to Home, the title, the
// Settings cog), the scrolling body, the docked footer, Android back, and the Settings sheet.
// Transparent, over the app's one board (see BoardBackground), like every screen.
export const LoadoutShell = ({ title, children, footer, closeOverlay, closeAllOverlays, overlays }: LoadoutShellProps): JSX.Element => {
  const theme = useTheme()
  const { refreshUnlocks } = useCatalogActions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Read through refs so the back listener below is registered once per focus and never again: React
  // Native runs the newest listener first, and re-registering whenever a drawer opened or closed put
  // this one ahead of a confirm that opened in the same commit (picking a puzzle in a pack's list
  // opens the abandon confirm and closes the list together), so back left the page instead of
  // cancelling the confirm.
  const closeOverlayRef = useRef(closeOverlay)
  const closeAllOverlaysRef = useRef(closeAllOverlays)
  useEffect(() => {
    closeOverlayRef.current = closeOverlay
    closeAllOverlaysRef.current = closeAllOverlays
  })

  // Back closes an open drawer first, then leaves for Home. safeBack replaces with Home when there's
  // nothing beneath (this loadout replaced a resumed game), where the navigator would close the app.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!closeOverlayRef.current()) safeBack()
        return true
      })
      return () => {
        subscription.remove()
        closeAllOverlaysRef.current()
      }
    }, [])
  )

  return (
    <Portal.Host>
      <View style={[styles.flex, gameShell]}>
        <ScrollViewProvider>
          <ScrollViewHeader actionSize={40} backAction={<IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={safeBack} accessibilityLabel='Back' />} title={title} trailingAction={<IconButton icon='cog' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={() => setSettingsOpen(true)} accessibilityLabel='Settings' />} />
          {children}
          <ScrollViewFooter style={styles.footer}>{footer}</ScrollViewFooter>
        </ScrollViewProvider>
      </View>
      {overlays}
      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} onUnlocksChanged={refreshUnlocks} />
    </Portal.Host>
  )
}

const styles = StyleSheet.create({
  artPreview: { borderRadius: 8, borderWidth: 2, height: 56, overflow: 'hidden', width: 56 },
  firstSectionLabel: { marginTop: 12 },
  flex: { flex: 1 },
  // A column of full-width buttons, with the header's own 4pt margins top and bottom.
  footer: { alignItems: 'stretch', flexDirection: 'column', paddingBottom: 4, paddingHorizontal: 16, paddingTop: 4 },
  sectionLabel: { fontWeight: '700', marginBottom: 8, marginTop: 16 }
})
