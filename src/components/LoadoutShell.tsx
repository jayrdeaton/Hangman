import { CornerActionButtons, type PopoverHost, PressAwayOverlay, usePopoverHost } from '@tastic/hud/chrome'
import { useFocusEffect, useIsFocused } from 'expo-router'
import { createContext, JSX, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { Portal, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useCatalogActions } from '@/hooks/useCatalog'
import { goHome, safeBack } from '@/utils/navigation'
import { gameShell } from '@/utils/webLayout'

import { SettingsDialog } from './SettingsDialog'

// The corners' strip: 8pt in, a 40pt button with Paper's 6pt margin, 8pt out (the 56pt Home leaves
// above its hero too). The body starts under it.
export const CORNER_BAND_HEIGHT = 56

// The page's one popover host (hud's usePopoverHost), for the pickers on it (each seat's, and
// Difficulty's): opening one closes any other. LoadoutShell owns it, so Android back, losing focus
// and the Settings cog close an open popover before anything else.
const LoadoutPopoverContext = createContext<PopoverHost>({ openId: null, toggle: () => {}, close: () => {} })

export const useLoadoutPopoverHost = (): PopoverHost => useContext(LoadoutPopoverContext)

// Whether the page is out of sight: another screen pushed over it (it stays mounted under the game,
// and the web keeps a left screen mounted), or the Settings sheet open on it. Anything on the page that
// animates on timers (the art carousel) pauses while it is.
const LoadoutCoveredContext = createContext(false)

export const useLoadoutCovered = (): boolean => useContext(LoadoutCoveredContext)

// hud's invisible "press away to close" catcher for the page's popover, placed by the page itself, as
// the first child of its content: on native, zIndex only orders the children of one parent, so a
// catcher over the whole page would sit above the popover's own rows (which belong to the content)
// and swallow every tap on them, as Solitaire found. The page lifts whatever holds the picker above
// it. `style` sizes it past the content it starts in.
export const LoadoutPressAway = ({ style }: { style?: StyleProp<ViewStyle> }): JSX.Element | null => {
  const { openId, close } = useLoadoutPopoverHost()
  return <PressAwayOverlay active={openId !== null} onPress={close} style={style} />
}

export type LoadoutShellProps = {
  // The page, which lays itself out in the room under the corners (scrolling only when it has to; see
  // LoadoutScreen).
  children: ReactNode
  // Closes the top-most drawer open over the page, if one is, for Android's back button. Returns
  // whether it closed one.
  closeOverlay: () => boolean
  // Closes every drawer, when the page stops being the one showing (a browser back on the web, a
  // share link pushed over it): an open art picker would otherwise keep its demo loop running.
  closeAllOverlays: () => void
  overlays?: ReactNode
}

// The loadout's frame (see LoadoutScreen): the corners, the body under them, Android back, the page's
// popover host, and the Settings sheet. Transparent, over the app's one board (see BoardBackground),
// like every screen. No title, and the fleet's plain-glyph corners rather than the scroll view header's
// blurred action circles, like the other games' loadouts (Jay, 2026-10-18): Home top-left, as on the
// game screen (Solitaire's), the Settings cog top-right. The body starts below the corners and runs
// down to the bottom safe area.
export const LoadoutShell = ({ children, closeOverlay, closeAllOverlays, overlays }: LoadoutShellProps): JSX.Element => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { refreshUnlocks } = useCatalogActions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const covered = !useIsFocused() || settingsOpen
  // usePopoverHost hands back a new object every render; the context only changes with what's open.
  const { openId, toggle, close: closePopover } = usePopoverHost()
  const popoverHost = useMemo(() => ({ openId, toggle, close: closePopover }), [openId, toggle, closePopover])
  const popoverOpenRef = useRef(false)
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
    popoverOpenRef.current = openId !== null
  })

  // Back closes an open popover first (it sits over the page, under any drawer, and a drawer can't
  // open while it's up: the tap that would open one presses it away), then an open drawer, then
  // leaves for Home. safeBack replaces with Home when there's nothing beneath (this loadout replaced a
  // resumed game), where the navigator would close the app. One listener, through closeOverlay, so a
  // popover never registers its own (see CLAUDE.md's Android back ordering).
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (popoverOpenRef.current) closePopover()
        else if (!closeOverlayRef.current()) safeBack()
        return true
      })
      return () => {
        subscription.remove()
        closePopover()
        closeAllOverlaysRef.current()
      }
    }, [closePopover])
  )

  // The cog opens the sheet over the page, so an open popover closes first.
  const openSettings = useCallback(() => {
    closePopover()
    setSettingsOpen(true)
  }, [closePopover])

  return (
    <Portal.Host>
      {/* The page runs the screen's full height, under the corners and the home indicator; it pads itself
          clear of them (see LoadoutScreen's pagePadding) and scrolls up under them. */}
      <View style={[styles.flex, gameShell]}>
        <LoadoutCoveredContext.Provider value={covered}>
          <LoadoutPopoverContext.Provider value={popoverHost}>{children}</LoadoutPopoverContext.Provider>
        </LoadoutCoveredContext.Provider>
      </View>
      {/* The corner strip's own press away catcher: a tap between Home and the cog closes an open popover
          (Jay, 2026-10-18) even when the page has scrolled its own catcher out from under the strip. The
          corners sit over it, so Home and the cog still take their taps (the cog closes the popover first
          anyway). Out of a screen reader's way: the page's own catcher is the one it reaches. */}
      <View testID='loadout-corner-press-away' style={[styles.strip, { height: insets.top + CORNER_BAND_HEIGHT }]} pointerEvents='box-none' accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
        <PressAwayOverlay active={openId !== null} onPress={closePopover} />
      </View>
      {/* The same corner pair as Home and the game screen, over the whole screen like theirs. box-none
          lets taps between them reach the page. hitSlop={4} makes each a 48pt target. */}
      <View style={[StyleSheet.absoluteFill, styles.corners]} pointerEvents='box-none'>
        <CornerActionButtons backIcon='home' backLabel='Home' onBack={goHome} onSettings={openSettings} fg={theme.colors.onSurface} insets={insets} hitSlop={4} />
      </View>
      {overlays}
      <SettingsDialog visible={settingsOpen} onDismiss={() => setSettingsOpen(false)} onUnlocksChanged={refreshUnlocks} />
    </Portal.Host>
  )
}

const styles = StyleSheet.create({
  corners: { zIndex: 10 },
  flex: { flex: 1 },
  // The corners' strip, the whole width of the screen (past the game's column on the web).
  strip: { left: 0, position: 'absolute', right: 0, top: 0 }
})
