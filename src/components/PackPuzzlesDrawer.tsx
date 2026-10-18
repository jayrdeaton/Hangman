import { Drawer } from '@rific/drawer'
import { Button, IconButton } from '@rific/feedback-press'
import { ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, useMemo } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useTheme } from 'react-native-paper'

import { DRAWER_PACK_DETAIL_Z_INDEX } from '@/constants/drawerStacking'
import { usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { getPuzzleManifest, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolveChosenPuzzle, resolvePuzzle } from '@/utils/puzzlePicker'

import { PackHeaderTitle } from './PackHeaderTitle'
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
  // What a puzzle started here is played with (the active player's art and difficulty), and where it
  // goes (the Single Player loadout's start, through Choose Packs).
  mode: GameMode
  difficulty: 'any' | PuzzleDifficultyTier
  onConfirm: (payload: GameStartPayload, config: PuzzleConfig) => void
  // The footer's Only This Pack, which makes this pack the player's whole pack selection (so Ready
  // draws from just this pack). This drawer closes itself after calling it, the same as after starting
  // a puzzle, back onto Choose Packs, where the trimmed selection shows.
  onOnlyThisPack: (packKey: string) => void
  // Whether the selection is already just this pack, which leaves Only This Pack nothing to do. A plain
  // boolean, not the selection itself, so a change to some other pack's selection doesn't re-render
  // this memoized drawer.
  onlyThisPackSelected?: boolean
}

// One pack's full puzzle list, titled with the pack's name, opened from a pack's info button in Choose
// Packs (PacksScreen): tapping a row plays that exact puzzle, the footer's Play This Pack draws one
// from just this pack, and Only This Pack trims the pack selection down to it. Every puzzle in the pack
// shows as its own row (via PackPuzzleList), masked to blanks unless already solved.
// Memoized: it stays mounted (translated off-screen) under Choose Packs even while closed, and an
// always-mounted, never-visible-right-now subtree still costs a re-render without this whenever an
// unrelated ancestor state change bubbles through it.
export const PackPuzzlesDrawer = memo(({ visible, packKey, onDismiss, mode, difficulty, onConfirm, onOnlyThisPack, onlyThisPackSelected = false }: PackPuzzlesDrawerProps): JSX.Element => {
  const { width: windowWidth } = useWindowDimensions()
  const theme = useTheme()

  const pack = useMemo(() => getPuzzleManifest().find((item) => item.key === packKey), [packKey])

  // The active player's, read again whenever this drawer opens and whenever a count moves while it's
  // open, like Choose Packs' own. Feeds Play This Pack below so it prefers a puzzle the player hasn't
  // unlocked yet in THIS pack over one they have (see resolvePuzzle).
  const { unlockMap } = usePuzzleUnlocks({ enabled: visible })

  const handlePlayPuzzle = (puzzleId: string) => {
    if (!packKey) return
    const result = resolveChosenPuzzle(packKey, puzzleId, mode)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    onConfirm(result.payload, { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' })
    // Starting a round closes this: the abandon confirm (when the waiting round has a guess on it)
    // opens over the loadout (which closes Choose Packs too), not over this drawer, and the page should
    // be clear when the player comes back from the round.
    onDismiss()
  }

  // Play This Pack: a random puzzle from just this pack. A one-pack draw is packScope 'single' (see
  // resolvePuzzle), so the game screen's Next keeps drawing from this pack too.
  const handlePlayThisPack = () => {
    if (!packKey) return
    const configToResolve: PuzzleConfig = { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' }
    const result = resolvePuzzle(configToResolve, [packKey], unlockMap)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    onConfirm(result.payload, configToResolve)
    onDismiss()
  }

  const handleOnlyThisPack = () => {
    if (!packKey) return
    onOnlyThisPack(packKey)
    onDismiss()
  }

  return (
    <Drawer open={visible} onClose={onDismiss} width={windowWidth} zIndex={DRAWER_PACK_DETAIL_Z_INDEX}>
      <View testID='pack-puzzles-panel' style={styles.panel} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
        {pack ? (
          <ScrollViewProvider>
            {/* Close sits on the LEADING (left) side, where Choose Packs' own Close and the loadout's
                Home corner sit, so every exit in the chain is in one place. 'Close', not the
                Appbar.BackAction default of 'Back' - this dismisses the whole panel rather than
                stepping back a level within it. A plain arrow in the surface's ink (the fleet's
                back-button style); @rific/feedback-press's IconButton fires the app's haptic itself. */}
            <ScrollViewHeader
              actionSize={40}
              // The pack's own name, so the footer's "This Pack" actions say which pack they mean. The
              // rest of its identity (icon, genre, progress) is PackPuzzleList's in-flow pack summary
              // row, the same card the player tapped to get here.
              centerContent={<PackHeaderTitle label={pack.label} />}
              backAction={<IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={onDismiss} accessibilityLabel='Close' />}
            />

            <PackPuzzleList packKey={packKey} unlockMap={unlockMap} onPlayPuzzle={handlePlayPuzzle} />

            <ScrollViewFooter style={styles.footer}>
              <Button mode='contained' icon='play' onPress={handlePlayThisPack}>
                Play This Pack
              </Button>
              <Button mode='outlined' icon='filter-outline' onPress={handleOnlyThisPack} disabled={onlyThisPackSelected} style={styles.secondButton}>
                Only This Pack
              </Button>
            </ScrollViewFooter>
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
  // ScrollViewFooter's own styles.row); flexDirection has to flip to 'column' too so the buttons
  // actually stretch full width, stacked like Choose Packs' own footer.
  footer: {
    alignItems: 'stretch',
    flexDirection: 'column',
    // Matches ScrollViewHeader's own actionMargin (4pt), so this bar reads as the same weight of
    // chrome as the header.
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  panel: { flex: 1 },
  // Choose Packs' footer's own gap between its stacked buttons.
  secondButton: { marginTop: 8 }
})
