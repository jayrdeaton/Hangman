import { SegmentedButtons } from '@rific/haptic-press'
import { FlatList, ScrollViewContext } from '@rific/scroll-view'
import { JSX, useContext, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, ProgressBar, Text, useTheme } from 'react-native-paper'

import type { Puzzle } from '@/types/puzzle'
import { commaString } from '@/utils/commaString'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { getPuzzleManifest, getPuzzlesForCategory, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { getPuzzleUnlockMap } from '@/utils/unlocks'

import { PackRow } from './PackRow'

const DIFFICULTY_LABELS: Record<PuzzleDifficultyTier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

// Masks the NORMALIZED phrase, not the raw answer — resolveChosenPuzzle plays
// normalizePhrase(puzzle.answer), which strips punctuation/digits/accents and can drop or shrink
// whole words (an answer like "Bob Marley & The Wailers" normalizes to just four words, the lone
// "&" gone entirely). Masking the raw string instead would show a blank shape the player would
// never actually get. Matches the in-round blank convention (see PuzzleStage.tsx's guessWords) —
// letters within a word joined by a single space, a wider gap between words — so an unsolved row
// here looks like the board it'd become.
export const maskAnswer = (answer: string): string =>
  normalizePhrase(answer)
    .split(' ')
    .map((word) => word.split('').fill('_').join(' '))
    .join('   ')

export type PackPuzzleFilter = 'all' | 'solved' | 'unsolved'

const EMPTY_MESSAGES: Record<PackPuzzleFilter, string> = {
  all: 'This pack has no puzzles yet.',
  solved: 'No puzzles solved yet.',
  unsolved: 'All puzzles solved!'
}

const FILTER_OPTIONS: { label: string; value: PackPuzzleFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Unsolved', value: 'unsolved' },
  { label: 'Solved', value: 'solved' }
]

export type PackPuzzleListProps = {
  packKey: string | null
  // The filter shown the moment this pack is opened — 'all' everywhere today, since every one of
  // this list's callers opens on a pack the player might want to pick something from, not a
  // trophy case. The filter buttons this renders let the player narrow it down afterward; that's
  // local UI state a caller never needs to read back.
  initialFilter: PackPuzzleFilter
  // Rows become tappable to play that exact puzzle when supplied. Omitted for read-only browsing
  // (PacksScreen's "view contents" step) — that caller has no mode/difficulty context to actually
  // start a round with, so there's nothing a tap could do.
  onPlayPuzzle?: (puzzleId: string) => void
}

// The puzzle list for one pack, shared by every screen that shows "what's in this pack": browsing
// to play (PackPuzzlesDrawer and AchievementsDrawer's own pack detail step, both onPlayPuzzle
// wired up) and reviewing progress read-only (PacksScreen's "view contents" step, no
// onPlayPuzzle) — all three open on filter='all'. One row-rendering, masking, and progress
// implementation instead of independently-maintained ones that had quietly drifted apart.
export const PackPuzzleList = ({ packKey, initialFilter, onPlayPuzzle }: PackPuzzleListProps): JSX.Element => {
  const theme = useTheme()
  // Every caller renders this inside a parent ScrollViewProvider now (see PackPuzzlesDrawer/
  // AchievementsDrawer) — its floating ScrollViewHeader overlays whatever sits at the very top of
  // that provider, and progressHeader below is a plain in-flow sibling with no padding of its own
  // to clear it, unlike this file's own FlatList (which already gets a correct top inset for free
  // via useScrollList internally, see @rific/scroll-view's FlatList.tsx). headerHeight is null until
  // the header's very first layout pass measures it — reading it directly from context, the same
  // value ScrollViewHeader/ScrollView/Footer already key their own positioning off of.
  const { headerHeight } = useContext(ScrollViewContext)
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<PackPuzzleFilter>(initialFilter)

  // Re-fetched per packKey rather than once — the unlock map itself doesn't push updates, but a
  // fresh read here is what makes a puzzle solved during THIS session show up revealed without
  // needing an explicit refresh trigger threaded in from above.
  useEffect(() => {
    if (!packKey) return
    let mounted = true
    void getPuzzleUnlockMap().then((unlockMap) => {
      if (mounted) setUnlockedIds(new Set(unlockMap[packKey] ?? []))
    })
    return () => {
      mounted = false
    }
  }, [packKey])

  // Resets to the caller's declared starting filter every time a different pack is opened — this
  // list stays mounted across pack switches (see PackPuzzlesDrawer's own doc comment on packKey),
  // so without this a filter picked while browsing one pack would silently carry over and confuse
  // whichever pack gets opened next. Deliberately NOT keyed on initialFilter itself: it's a fixed
  // choice each caller makes once, not something that should fight the player's own in-session
  // filter pick if it were to re-render for an unrelated reason.
  /* eslint-disable react-hooks/set-state-in-effect -- syncs from an external prop on a real transition (packKey change), not derived from other state */
  useEffect(() => {
    setFilter(initialFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialFilter is deliberately excluded, see above
  }, [packKey])
  /* eslint-enable react-hooks/set-state-in-effect */

  const pack = useMemo(() => getPuzzleManifest().find((item) => item.key === packKey), [packKey])
  const allPuzzles = useMemo(() => (packKey ? getPuzzlesForCategory(packKey) : []), [packKey])

  const puzzles = useMemo(() => {
    if (filter === 'all') return allPuzzles
    if (filter === 'solved') return allPuzzles.filter((puzzle) => unlockedIds.has(puzzle.id))
    return allPuzzles.filter((puzzle) => !unlockedIds.has(puzzle.id))
  }, [allPuzzles, filter, unlockedIds])

  const unlockedCount = unlockedIds.size
  const totalCount = pack?.count ?? 0
  const progress = totalCount > 0 ? unlockedCount / totalCount : 0

  const renderItem = ({ item }: { item: Puzzle }) => {
    const solved = unlockedIds.has(item.id)
    const wordLabel = item.wordCount === 1 ? 'word' : 'words'
    return <PackRow testID={`puzzle-row-${item.id}`} label={solved ? item.answer : maskAnswer(item.answer)} subtitle={DIFFICULTY_LABELS[item.difficultyTier]} onPress={onPlayPuzzle ? () => onPlayPuzzle(item.id) : undefined} accessibilityLabel={solved ? `${item.answer}, ${DIFFICULTY_LABELS[item.difficultyTier]}, solved` : `Hidden puzzle, ${item.letterCount} letters, ${item.wordCount} ${wordLabel}, ${DIFFICULTY_LABELS[item.difficultyTier]}`} trailing={solved ? <Icon source='check-circle' size={20} color={theme.colors.primary} /> : undefined} />
  }

  if (!pack) return <View style={styles.flex} />

  return (
    // Hidden until the header measures, same as the FlatList below already does internally — this
    // View's own top padding depends on headerHeight too (see progressHeader below), so revealing
    // it before that first measurement would flash it in unpadded, up under the floating header.
    <View style={[styles.flex, headerHeight === null && styles.hidden]}>
      {/* Fixed, not part of the scrollable list below — stays in view as a running tally while
          scrolling through a long pack instead of scrolling away with row 1. paddingTop reserves
          space for the floating ScrollViewHeader above, which overlays rather than pushing this
          down itself. */}
      <View style={[styles.progressHeader, { paddingTop: (headerHeight ?? 0) + 4 }]}>
        <Text variant='bodySmall' style={styles.muted}>
          {commaString(unlockedCount)} of {commaString(totalCount)} unlocked
        </Text>
        <View style={styles.progressBarWrapper}>
          <ProgressBar progress={progress} style={[styles.progressBar, { backgroundColor: theme.colors.background }]} />
        </View>
        <SegmentedButtons value={filter} onValueChange={(value) => setFilter(value as PackPuzzleFilter)} buttons={FILTER_OPTIONS} style={styles.filterButtons} />
      </View>

      {puzzles.length === 0 ? (
        <Text variant='bodySmall' style={styles.emptyText}>
          {EMPTY_MESSAGES[filter]}
        </Text>
      ) : (
        <FlatList data={puzzles} keyExtractor={(item) => item.id} renderItem={renderItem} showsVerticalScrollIndicator={false} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps='handled' />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  emptyText: { marginTop: 12, opacity: 0.7, paddingHorizontal: 16 },
  filterButtons: { marginTop: 10 },
  flex: { flex: 1 },
  hidden: { opacity: 0 },
  list: { flex: 1 },
  listContent: {
    paddingBottom: 16,
    paddingHorizontal: 16
  },
  muted: { opacity: 0.7 },
  progressBar: {
    borderRadius: 6,
    height: 8
  },
  progressBarWrapper: {
    height: 8,
    marginTop: 10,
    overflow: 'hidden'
  },
  // paddingTop is applied dynamically at the call site (see above) — always overrides whatever's
  // declared here, so it's deliberately left out of this static object rather than left dead.
  progressHeader: {
    paddingBottom: 8,
    paddingHorizontal: 16
  }
})
