import { Drawer } from '@rific/drawer'
import { Button, useVibration } from '@rific/haptic-press'
import { ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, useEffect, useMemo, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'

import { DRAWER_PACK_DETAIL_Z_INDEX } from '@/constants/drawerStacking'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { getPuzzleManifest, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolveChosenPuzzle, resolvePuzzle } from '@/utils/puzzlePicker'
import { getPuzzleUnlockMap, type PuzzleUnlockMap } from '@/utils/unlocks'

import { PackPuzzleList } from './PackPuzzleList'

export type PackPuzzlesDrawerProps = {
  visible: boolean
  // The pack being browsed. Deliberately NOT reset to null on dismiss by the caller — this drawer,
  // like @rific/drawer's own Drawer, translates away rather than unmounting, so the content needs
  // to hold steady through that close animation instead of blanking out mid-slide.
  packKey: string | null
  onDismiss: () => void
  // Omitted for read-only browsing (PacksScreen's "view contents" on a built-in pack) — no Random
  // footer, no tap-to-play, since there's no mode/difficulty context there to actually start a
  // round with. A caller supplies either all three (playable, PuzzleDrawer's own usage) or none of
  // them (read-only) — never a partial mix.
  mode?: GameMode
  difficulty?: 'any' | PuzzleDifficultyTier
  onConfirm?: (payload: GameStartPayload, config: PuzzleConfig) => void
}

// One pack's full puzzle list. Two callers: PuzzleDrawer's own quick-start list opens this
// playable (tapping a row plays that exact puzzle, Random in the footer draws one) when a player
// taps a pack they've selected; PacksScreen's built-in-pack info icon opens it read-only (mode/
// difficulty/onConfirm all omitted) — there's no round to start from Choose Packs, just browsing
// what's inside. Every puzzle in the pack shows as its own row (via PackPuzzleList,
// initialFilter='all'), masked to blanks unless already solved either way.
// Memoized: two instances of this stay mounted (translated off-screen) even while closed — one
// under PuzzleDrawer, one under PacksScreen — see PuzzleDrawer's own memo comment for why an
// always-mounted, never-visible-right-now subtree still costs a re-render without this whenever
// an unrelated ancestor state change bubbles through it.
export const PackPuzzlesDrawer = memo(({ visible, packKey, onDismiss, mode, difficulty, onConfirm }: PackPuzzlesDrawerProps): JSX.Element => {
  const { width: windowWidth } = useWindowDimensions()
  const { selection } = useVibration()
  const playable = Boolean(mode && difficulty && onConfirm)

  const pack = useMemo(() => getPuzzleManifest().find((item) => item.key === packKey), [packKey])

  // Re-fetched whenever this drawer opens on a pack, not subscribed to live — same one-shot
  // pattern PuzzleDrawer's own unlockMap uses. Feeds Random below so it prefers a puzzle the
  // player hasn't unlocked yet in THIS pack over one they have (see resolvePuzzle). Skipped
  // entirely in read-only mode — nothing here reads it without Random to feed.
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})
  useEffect(() => {
    if (!visible || !playable) return
    let mounted = true
    void getPuzzleUnlockMap().then((map) => {
      if (mounted) setUnlockMap(map)
    })
    return () => {
      mounted = false
    }
  }, [visible, packKey, playable])

  const handlePlayPuzzle = (puzzleId: string) => {
    if (!packKey || !mode || !onConfirm) return
    const result = resolveChosenPuzzle(packKey, puzzleId, mode)
    if (!result.ok) {
      void alert('No puzzles available', result.error)
      return
    }
    onConfirm(result.payload, { sourceMode: 'random', difficulty: difficulty ?? 'any', mode, customPhrase: '', customHint: '' })
    // Starting a round is what closes this — otherwise it's left stacked on top of the game that
    // just started, blocking it from view (and from accessibility/keyboard focus) until the
    // player finds and taps the close icon themselves.
    onDismiss()
  }

  const handleRandom = () => {
    if (!packKey || !mode || !difficulty || !onConfirm) return
    const configToResolve: PuzzleConfig = { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' }
    const result = resolvePuzzle(configToResolve, [packKey], unlockMap)
    if (!result.ok) {
      void alert('No puzzles available', result.error)
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
            {/* Close sits on the LEADING (left) side — this drawer is reached from the Game Menu's
                hamburger icon (top-left of the game screen), whether directly (a pack row in
                PuzzleDrawer) or via Choose Packs (also reached from there) — same left-anchored
                lineage either way, so closing it lands back under the same thumb that opened the
                chain. 'Close', not the Appbar.BackAction default of 'Back' — see PuzzleDrawer's own
                ScrollViewHeader comment for why. */}
            <ScrollViewHeader
              title={pack.label}
              backAction={() => {
                selection()
                onDismiss()
              }}
              backActionAccessibilityLabel='Close'
            />

            <PackPuzzleList packKey={packKey} initialFilter='all' onPlayPuzzle={playable ? handlePlayPuzzle : undefined} />

            {playable ? (
              <ScrollViewFooter style={styles.footer}>
                <Button mode='contained' icon='play' onPress={handleRandom} contentStyle={styles.confirmContent} labelStyle={styles.confirmLabel}>
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
  confirmContent: { height: 52 },
  confirmLabel: { fontSize: 16, fontWeight: '700' },
  // alignItems override ScrollViewFooter's own centered default — Random stretches full width,
  // matching this footer's look before the scroll-view migration.
  footer: {
    alignItems: 'stretch',
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  panel: { flex: 1 }
})
