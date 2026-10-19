import { Button } from '@rific/feedback-press'
import { type PopoverHost, PressAwayOverlay } from '@tastic/hud/chrome'
import { JSX, memo, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { getPuzzleManifest, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolveChosenPuzzle, resolvePuzzle } from '@/utils/puzzlePicker'

import { FullScreenLayer } from './FullScreenLayer'
import { PackPuzzleList } from './PackPuzzleList'
import { ScreenHeader } from './ScreenHeader'

// A page's column on a wide screen: one list of puzzles reads badly stretched across a whole window.
export const PAGE_MAX_WIDTH = 720

export type PackPuzzlesPageProps = {
  visible: boolean
  // The pack being browsed. Deliberately NOT reset to null on leaving by the caller - this page, like
  // Choose Packs itself, slides away rather than unmounting, so the content has to hold steady through
  // that slide instead of blanking out mid-way.
  packKey: string | null
  onDismiss: () => void
  // What a puzzle started here is played with (the active player's art and difficulty), and where it
  // goes (the loadout's start, through Choose Packs). Without onConfirm the pack is only browsed (the
  // Pass & Play table on the packs, whose puzzles come by turns): no row plays, and there's no Play This
  // Pack.
  mode: GameMode
  difficulty: 'any' | PuzzleDifficultyTier
  onConfirm?: (payload: GameStartPayload, config: PuzzleConfig) => void
  // The footer's Only This Pack, which makes this pack the player's whole pack selection (so Ready
  // draws from just this pack). This page closes itself after calling it, the same as after starting a
  // puzzle, back onto Choose Packs, where the trimmed selection shows.
  onOnlyThisPack: (packKey: string) => void
  // Whether the selection is already just this pack, which leaves Only This Pack nothing to do. A plain
  // boolean, not the selection itself, so a change to some other pack's selection doesn't re-render
  // this memoized page.
  onlyThisPackSelected?: boolean
  // The page's popover host, for its list's two filters (PackPuzzleList), owned by PacksScreen so its
  // Android back can close an open filter first. A new object only when a popover opens or closes.
  popoverHost: PopoverHost
}

// One pack's puzzles, titled with the pack's name, opened from a pack's info button in Choose Packs
// (PacksScreen): a page that slides in over its list (FullScreenLayer), under the same screen header
// with a Back arrow. Tapping a row plays that exact puzzle, the footer's Play This Pack draws one from
// just this pack (neither while it's only browsed, see onConfirm), and Only This Pack trims the pack
// selection down to it. Every puzzle in the pack shows as its own row (PackPuzzleList), masked to blanks
// unless already solved.
// Memoized: it stays mounted (off the screen's edge) inside Choose Packs even while away, and an
// always-mounted subtree still costs a re-render without this whenever something above it changes.
export const PackPuzzlesPage = memo(({ visible, packKey, onDismiss, mode, difficulty, onConfirm, onOnlyThisPack, onlyThisPackSelected = false, popoverHost }: PackPuzzlesPageProps): JSX.Element => {
  const insets = useSafeAreaInsets()
  const pack = useMemo(() => getPuzzleManifest().find((item) => item.key === packKey), [packKey])

  // The active player's, read again whenever this page opens and whenever a count moves while it's
  // open, like Choose Packs' own. Feeds Play This Pack below so it prefers a puzzle the player hasn't
  // unlocked yet in THIS pack over one they have (see resolvePuzzle).
  const { unlockMap } = usePuzzleUnlocks({ enabled: visible })

  const handlePlayPuzzle = (puzzleId: string) => {
    if (!packKey || !onConfirm) return
    const result = resolveChosenPuzzle(packKey, puzzleId, mode)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    onConfirm(result.payload, { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' })
    // Starting a round closes this: the abandon confirm (when the waiting round has a guess on it)
    // opens over the loadout (which closes Choose Packs too), not over this page, and the page should
    // be clear when the player comes back from the round.
    onDismiss()
  }

  // Play This Pack: a random puzzle from just this pack. A one-pack draw is packScope 'single' (see
  // resolvePuzzle), so the game screen's Next keeps drawing from this pack too.
  const handlePlayThisPack = () => {
    if (!packKey || !onConfirm) return
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
    <FullScreenLayer visible={visible} from='right'>
      <View testID='pack-puzzles-panel' style={styles.panel} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? onDismiss : undefined}>
        {pack ? (
          <View style={[styles.column, { paddingLeft: insets.left, paddingRight: insets.right }]}>
            {/* Over the header and the footer while a filter's popover is open, so a tap on Back or a
                footer button only closes it (the list, lifted over this, has its own over its rows). */}
            <PressAwayOverlay active={popoverHost.openId !== null} onPress={popoverHost.close} style={styles.pressAway} />
            {/* Back, not Close: it steps back to Choose Packs' list, which is still under it. The pack's own
                name, so the footer's "This Pack" actions say which pack they mean; the rest of its
                identity (icon, genre, progress) is PackPuzzleList's pack summary, the same card the player
                tapped to get here. */}
            <ScreenHeader icon='arrow-left' label='Back' title={pack.label} onPress={onDismiss} />

            <PackPuzzleList packKey={packKey} unlockMap={unlockMap} onPlayPuzzle={onConfirm ? handlePlayPuzzle : undefined} popoverHost={popoverHost} />

            <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
              {onConfirm ? (
                <Button mode='contained' icon='play' onPress={handlePlayThisPack} contentStyle={styles.buttonContent}>
                  Play This Pack
                </Button>
              ) : null}
              <Button mode='outlined' icon='filter-outline' onPress={handleOnlyThisPack} disabled={onlyThisPackSelected} contentStyle={styles.buttonContent}>
                Only This Pack
              </Button>
            </View>
          </View>
        ) : null}
      </View>
    </FullScreenLayer>
  )
})
PackPuzzlesPage.displayName = 'PackPuzzlesPage'

const styles = StyleSheet.create({
  buttonContent: { height: 48 },
  column: { alignSelf: 'center', flex: 1, maxWidth: PAGE_MAX_WIDTH, width: '100%' },
  // Pinned under the list, the buttons stacked.
  footer: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  panel: { flex: 1 },
  pressAway: { zIndex: 1 }
})
