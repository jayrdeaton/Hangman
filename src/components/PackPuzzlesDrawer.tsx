import { Drawer } from '@rific/drawer'
import { Button, IconButton } from '@rific/feedback-press'
import { ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useTheme } from 'react-native-paper'

import { DRAWER_PACK_DETAIL_Z_INDEX } from '@/constants/drawerStacking'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { getPuzzleManifest, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolveChosenPuzzle, resolvePuzzle } from '@/utils/puzzlePicker'
import { getPuzzleUnlockMap, type PuzzleUnlockMap } from '@/utils/unlocks'

import { PackPuzzleList } from './PackPuzzleList'

// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on this drawer's own
// ScrollViewHeader) brings the actual tap target up to 48x48, without the visible circle itself
// growing to fill that whole area.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

export type PackPuzzlesDrawerProps = {
  visible: boolean
  // The pack being browsed. Deliberately NOT reset to null on dismiss by the caller - this drawer,
  // like @rific/drawer's own Drawer, translates away rather than unmounting, so the content needs
  // to hold steady through that close animation instead of blanking out mid-slide.
  packKey: string | null
  onDismiss: () => void
  // Omitted for read-only browsing (PacksScreen's "view contents" on a built-in pack) - no Random
  // footer, no tap-to-play, since there's no mode/difficulty context there to actually start a
  // round with. A caller supplies either all three (playable, the loadout's own usage) or none of
  // them (read-only) - never a partial mix.
  mode?: GameMode
  difficulty?: 'any' | PuzzleDifficultyTier
  onConfirm?: (payload: GameStartPayload, config: PuzzleConfig) => void
}

// One pack's full puzzle list. Two callers: the Single Player loadout's quick-start list opens this
// playable (tapping a row plays that exact puzzle, Random in the footer draws one) from a selected
// pack's info icon; PacksScreen's built-in-pack info icon opens it read-only (mode/
// difficulty/onConfirm all omitted) - there's no round to start from Choose Packs, just browsing
// what's inside. Every puzzle in the pack shows as its own row (via PackPuzzleList), masked to
// blanks unless already solved either way.
// Memoized: two instances of this stay mounted (translated off-screen) even while closed - one
// over the Single Player loadout, one under PacksScreen - and an always-mounted,
// never-visible-right-now subtree still costs a re-render without this whenever an unrelated
// ancestor state change bubbles through it.
export const PackPuzzlesDrawer = memo(({ visible, packKey, onDismiss, mode, difficulty, onConfirm }: PackPuzzlesDrawerProps): JSX.Element => {
  const { width: windowWidth } = useWindowDimensions()
  const theme = useTheme()
  const playable = Boolean(mode && difficulty && onConfirm)

  const pack = useMemo(() => getPuzzleManifest().find((item) => item.key === packKey), [packKey])

  // Re-fetched whenever this drawer opens on a pack, not subscribed to live - same fetch-on-open
  // pattern PackProgressDrawer's own unlockMap uses. Feeds Random below so it prefers a puzzle the
  // player hasn't unlocked yet in THIS pack over one they have (see resolvePuzzle).
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})
  useEffect(() => {
    if (!visible) return
    let mounted = true
    void getPuzzleUnlockMap().then((map) => {
      if (mounted) setUnlockMap(map)
    })
    return () => {
      mounted = false
    }
  }, [visible, packKey])

  const handlePlayPuzzle = (puzzleId: string) => {
    if (!packKey || !mode || !onConfirm) return
    const result = resolveChosenPuzzle(packKey, puzzleId, mode)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    onConfirm(result.payload, { sourceMode: 'random', difficulty: difficulty ?? 'any', mode, customPhrase: '', customHint: '' })
    // Starting a round closes this: the abandon confirm (when the waiting round has a guess on it)
    // opens over the page this drawer was opened from, not over this drawer, and the page should be
    // clear when the player comes back from the round.
    onDismiss()
  }

  const handleRandom = () => {
    if (!packKey || !mode || !difficulty || !onConfirm) return
    const configToResolve: PuzzleConfig = { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' }
    const result = resolvePuzzle(configToResolve, [packKey], unlockMap)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    onConfirm(result.payload, configToResolve)
    onDismiss()
  }

  return (
    <Drawer open={visible} onClose={onDismiss} width={windowWidth} zIndex={DRAWER_PACK_DETAIL_Z_INDEX}>
      <View testID='pack-puzzles-panel' style={styles.panel} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
        {pack ? (
          <ScrollViewProvider>
            {/* Close sits on the LEADING (left) side - this drawer opens over the Single Player
                loadout, whether directly (a quick-start row's info icon) or via Choose Packs (its
                All Packs row) - same left-anchored lineage either way, so its exit sits in the same
                top-left corner as the loadout's own Back arrow. 'Close', not the Appbar.BackAction
                default of 'Back' - this dismisses the whole panel rather than stepping back a level
                within it. Custom IconButton, not the default
                callback-driven Appbar.BackAction: a plain arrow in the surface's ink (the fleet's back-button style), matching every other
                back/close action in the app; IconButton already fires the app's own haptic
                convention on press itself, so this needs no manual selection() call the way the
                callback form used to. */}
            <ScrollViewHeader
              actionSize={40}
              // Generic "Pack" rather than the pack's own name or group tint - its actual identity
              // (icon, genre, title, progress) lives entirely in PackPuzzleList's own in-flow pack
              // summary row now; this is just enough of a label that the floating bar doesn't read
              // as unexpectedly bare.
              title='Pack'
              backAction={<IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={onDismiss} accessibilityLabel='Close' />}
            />

            <PackPuzzleList packKey={packKey} onPlayPuzzle={playable ? handlePlayPuzzle : undefined} />

            {playable ? (
              <ScrollViewFooter style={styles.footer}>
                <Button mode='contained' icon='play' onPress={handleRandom}>
                  Random
                </Button>
              </ScrollViewFooter>
            ) : null}
          </ScrollViewProvider>
        ) : null}
      </View>
    </Drawer>
  )
})
PackPuzzlesDrawer.displayName = 'PackPuzzlesDrawer'

const styles = StyleSheet.create({
  // flexDirection/alignItems override ScrollViewFooter's own row+center defaults - alignItems
  // alone stretches the CROSS axis, which is height while flexDirection stays 'row' (see
  // ScrollViewFooter's own styles.row); flexDirection has to flip to 'column' too so Random
  // actually stretches full width, matching this footer's look before the scroll-view migration.
  footer: {
    alignItems: 'stretch',
    flexDirection: 'column',
    // Matches ScrollViewHeader's own actionMargin (4pt), so this bar reads as the same weight of
    // chrome as the header.
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  panel: { flex: 1 }
})
