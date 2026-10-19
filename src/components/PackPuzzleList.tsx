import { type PopoverHost, PressAwayOverlay } from '@tastic/hud/chrome'
import { JSX, useCallback, useMemo } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { Avatar, Icon, ProgressBar, Text, useTheme } from 'react-native-paper'

import { useDifficultyOptionColors } from '@/hooks/useDifficultyColors'
import { type PackPuzzleDifficultyFilter, type PackPuzzleStatusFilter, usePackPuzzleListPrefs } from '@/hooks/usePackPuzzleListPrefs'
import type { DifficultyFilter } from '@/redux/playerSettingsSlice'
import type { Puzzle } from '@/types/puzzle'
import { commaString } from '@/utils/commaString'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { packGroupColors, packGroupIcon, packGroupLabel } from '@/utils/packGroupStyle'
import { getPuzzleManifest, getPuzzlesForCategory, type PuzzleDifficultyTier, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import type { PuzzleUnlockMap } from '@/utils/unlocks'

import { renderFadingScrollComponent } from './fadingScrollComponent'
import { PackRow } from './PackRow'
import { DifficultyPicker, PillPicker, type PillPickerOption } from './PillPicker'

const DIFFICULTY_LABELS: Record<PuzzleDifficultyTier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

// The filters' popover ids, on the page's popover host (PacksScreen's, handed down through
// PackPuzzlesPage).
export const PACK_STATUS_PICKER_ID = 'pack-status'
export const PACK_DIFFICULTY_PICKER_ID = 'pack-difficulty'

// "All puzzles" rather than a bare "All", which beside the difficulty's "Any" said nothing.
const STATUS_OPTIONS: PillPickerOption<PackPuzzleStatusFilter>[] = [
  { value: 'all', label: 'All puzzles', icon: 'format-list-bulleted' },
  { value: 'unsolved', label: 'Unsolved', icon: 'circle-outline' },
  { value: 'solved', label: 'Solved', icon: 'check-circle' }
]

// Masks the NORMALIZED phrase, not the raw answer - resolveChosenPuzzle plays
// normalizePhrase(puzzle.answer), which strips punctuation/digits/accents and can drop or shrink
// whole words (an answer like "Bob Marley & The Wailers" normalizes to just four words, the lone
// "&" gone entirely). Masking the raw string instead would show a blank shape the player would
// never actually get. Matches the in-round blank convention (see PuzzleStage.tsx's guessWords) -
// letters within a word joined by a single space, a wider gap between words - so an unsolved row
// here looks like the board it'd become.
export const maskAnswer = (answer: string): string =>
  normalizePhrase(answer)
    .split(' ')
    .map((word) => word.split('').fill('_').join(' '))
    .join('   ')

// Combines the status filter with the difficulty filter so "no puzzles" always describes what's
// actually hiding them - a bare "All puzzles solved!" would be misleading if the player is also
// filtered to Hard and there are still unsolved Easy ones sitting outside that filter.
const emptyMessage = (statusFilter: PackPuzzleStatusFilter, difficultyFilter: PackPuzzleDifficultyFilter): string => {
  const difficultyPhrase = difficultyFilter === 'all' ? '' : `${DIFFICULTY_LABELS[difficultyFilter].toLowerCase()} `
  if (statusFilter === 'solved') return `No ${difficultyPhrase}puzzles solved yet.`
  if (statusFilter === 'unsolved') return `All ${difficultyPhrase}puzzles solved!`
  return `This pack has no ${difficultyPhrase}puzzles yet.`
}

export type PackPuzzleListProps = {
  packKey: string | null
  // The active player's unlocked puzzles, from the page showing this list (PackPuzzlesPage), which
  // reads them only while it's open. Not read here: a page that's away keeps this list mounted, and a
  // read of its own would follow every win behind the game screen.
  unlockMap: PuzzleUnlockMap
  // Rows become tappable to play that exact puzzle when supplied (the pages that play from Choose
  // Packs); omitted, the list only browses.
  onPlayPuzzle?: (puzzleId: string) => void
  // The page's popover host, for the two filters' popovers. The page closes it on leaving, and on
  // Android back before anything else (PacksScreen's closeTopOverlay).
  popoverHost: PopoverHost
}

// The pack at the top of its page, under the title that already names it (Jay, 2026-10-19: no card
// repeating the name): its category's badge and eyebrow, how many of its puzzles are unlocked, and
// the bar, drawn straight on the board in the category's colors. One element to a screen reader.
const PackSummary = ({ pack, unlocked }: { pack: PuzzleManifestItem; unlocked: number }): JSX.Element => {
  const theme = useTheme()
  const colors = packGroupColors(pack.group, theme)
  const count = `${commaString(unlocked)} of ${commaString(pack.count)} unlocked`
  return (
    <View testID='pack-summary' accessible accessibilityLabel={`${packGroupLabel(pack.group)}, ${count}`} style={styles.summary}>
      <Avatar.Icon size={40} icon={packGroupIcon(pack.group)} color={colors.onColor} style={{ backgroundColor: colors.color }} />
      <View style={styles.summaryText}>
        <Text variant='labelSmall' style={[styles.eyebrow, { color: colors.color }]}>
          {packGroupLabel(pack.group).toUpperCase()}
        </Text>
        <Text variant='bodySmall' style={{ color: theme.colors.onSurfaceVariant }}>
          {count}
        </Text>
        <View style={styles.barWrapper}>
          <ProgressBar progress={pack.count > 0 ? unlocked / pack.count : 0} color={colors.color} style={[styles.bar, { backgroundColor: colors.container }]} />
        </View>
      </View>
    </View>
  )
}

// The puzzle list for one pack, "what's in this pack": PackPuzzlesPage's body, opened from Choose
// Packs to browse a pack and play from it (onPlayPuzzle wired up). The pack's summary and the
// filters stay put above the rows, which scroll under them and fade at the list's edges while there's
// more past them (auto-paper's FadingScrollView, as every scrolling screen here).
export const PackPuzzleList = ({ packKey, unlockMap, onPlayPuzzle, popoverHost }: PackPuzzleListProps): JSX.Element => {
  const theme = useTheme()
  // The four-way (Any and the three tiers) vibrant/container set the loadout's Difficulty picker uses,
  // for each row's difficulty badge (the filter's own pill reads it itself, DifficultyPicker).
  const difficultyOptionColors = useDifficultyOptionColors()
  // The theme's own primary/secondary/tertiary for All/Unsolved/Solved, which aren't a severity scale
  // the way Easy/Medium/Hard are, so they don't borrow the difficulty colors.
  const statusOptionColors = useMemo(
    (): Record<PackPuzzleStatusFilter, { vibrant: string; container: string }> => ({
      all: { vibrant: theme.colors.primary, container: theme.colors.primaryContainer },
      unsolved: { vibrant: theme.colors.secondary, container: theme.colors.secondaryContainer },
      solved: { vibrant: theme.colors.tertiary, container: theme.colors.tertiaryContainer }
    }),
    [theme.colors.primary, theme.colors.primaryContainer, theme.colors.secondary, theme.colors.secondaryContainer, theme.colors.tertiary, theme.colors.tertiaryContainer]
  )
  // A shared, persisted preference (see usePackPuzzleListPrefs's own doc comment on why) rather
  // than local component state - every pack this opens on should reflect the same status/
  // difficulty filter the player last picked, not reset to defaults each time.
  const { prefs, setPrefs } = usePackPuzzleListPrefs()
  // The difficulty filter stores 'all' where the loadout's picker says 'any'.
  const difficultyValue: DifficultyFilter = prefs.difficultyFilter === 'all' ? 'any' : prefs.difficultyFilter
  const handleStatusChange = useCallback((value: PackPuzzleStatusFilter) => setPrefs({ statusFilter: value }), [setPrefs])
  const handleDifficultyChange = useCallback((value: DifficultyFilter) => setPrefs({ difficultyFilter: value === 'any' ? 'all' : value }), [setPrefs])
  const popoverOpen = popoverHost.openId === PACK_STATUS_PICKER_ID || popoverHost.openId === PACK_DIFFICULTY_PICKER_ID

  const unlockedIds = useMemo(() => new Set(packKey ? (unlockMap[packKey] ?? []) : []), [unlockMap, packKey])

  const pack = useMemo(() => getPuzzleManifest().find((item) => item.key === packKey), [packKey])
  const allPuzzles = useMemo(() => (packKey ? getPuzzlesForCategory(packKey) : []), [packKey])

  const puzzles = useMemo(() => {
    let result = allPuzzles
    if (prefs.statusFilter === 'solved') result = result.filter((puzzle) => unlockedIds.has(puzzle.id))
    else if (prefs.statusFilter === 'unsolved') result = result.filter((puzzle) => !unlockedIds.has(puzzle.id))
    if (prefs.difficultyFilter !== 'all') result = result.filter((puzzle) => puzzle.difficultyTier === prefs.difficultyFilter)
    return result
  }, [allPuzzles, prefs.statusFilter, prefs.difficultyFilter, unlockedIds])

  const renderItem = ({ item }: { item: Puzzle }) => {
    const solved = unlockedIds.has(item.id)
    const wordLabel = item.wordCount === 1 ? 'word' : 'words'
    const difficultyBadge = (
      <View style={[styles.difficultyBadge, { backgroundColor: difficultyOptionColors[item.difficultyTier].vibrant }]}>
        <Text style={[styles.difficultyBadgeText, { color: difficultyOptionColors[item.difficultyTier].onVibrant }]}>{DIFFICULTY_LABELS[item.difficultyTier]}</Text>
      </View>
    )
    return <PackRow testID={`puzzle-row-${item.id}`} label={solved ? item.answer : maskAnswer(item.answer)} subtitleBadge={difficultyBadge} onPress={onPlayPuzzle ? () => onPlayPuzzle(item.id) : undefined} accessibilityLabel={solved ? `${item.answer}, ${DIFFICULTY_LABELS[item.difficultyTier]}, solved` : `Hidden puzzle, ${item.letterCount} letters, ${item.wordCount} ${wordLabel}, ${DIFFICULTY_LABELS[item.difficultyTier]}`} trailing={solved ? <Icon source='check-circle' size={20} color={theme.colors.primary} /> : undefined} />
  }

  if (!pack) return <View style={styles.flex} />

  return (
    // Over the page's own press away catcher (PackPuzzlesPage's) while a filter's popover is open, which
    // drops down over the puzzles: on native, zIndex only orders one parent's children.
    <View style={[styles.flex, popoverOpen && styles.lifted]}>
      {/* Under the filters and over the rows while a popover is open, so a tap on a row only closes it. */}
      <PressAwayOverlay active={popoverOpen} onPress={popoverHost.close} style={styles.pressAway} />
      {/* Fixed, not part of the scrolling list: stays in view while scrolling through a long pack. */}
      <View style={[styles.progressHeader, popoverOpen && styles.lifted]}>
        <PackSummary pack={pack} unlocked={unlockedIds.size} />
        {/* The loadout's picker pills (Jay, 2026-10-19), in place of red pills over Paper menus. */}
        <View style={styles.controlsRow}>
          <PillPicker id={PACK_STATUS_PICKER_ID} host={popoverHost} options={STATUS_OPTIONS} colors={statusOptionColors} value={prefs.statusFilter} onChange={handleStatusChange} />
          <DifficultyPicker id={PACK_DIFFICULTY_PICKER_ID} host={popoverHost} value={difficultyValue} onChange={handleDifficultyChange} />
        </View>
      </View>

      {puzzles.length === 0 ? (
        <Text variant='bodySmall' style={styles.emptyText}>
          {emptyMessage(prefs.statusFilter, prefs.difficultyFilter)}
        </Text>
      ) : (
        <FlatList data={puzzles} keyExtractor={(item) => item.id} renderItem={renderItem} ItemSeparatorComponent={RowGap} renderScrollComponent={renderFadingScrollComponent} showsVerticalScrollIndicator={false} style={styles.flex} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps='handled' />
      )}
    </View>
  )
}

// The room between two puzzle rows.
const RowGap = (): JSX.Element => <View style={styles.rowGap} />

const styles = StyleSheet.create({
  bar: { borderRadius: 6, height: 6 },
  barWrapper: { height: 6, marginTop: 8, overflow: 'hidden' },
  controlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // alignSelf keeps the pill sized to its own text rather than stretching to PackRow's full text
  // column width - matches PuzzleInfoRow's own difficulty pill shape, just smaller (a list row's
  // subtitle line, not a standalone gameplay badge).
  difficultyBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  difficultyBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  emptyText: { marginTop: 12, opacity: 0.7, paddingHorizontal: 16 },
  eyebrow: { fontWeight: '700', letterSpacing: 0.5 },
  flex: { flex: 1 },
  // Over the press away catcher (zIndex 1).
  lifted: { zIndex: 2 },
  listContent: { paddingBottom: 16, paddingHorizontal: 16, paddingTop: 4 },
  pressAway: { zIndex: 1 },
  progressHeader: { gap: 16, paddingBottom: 12, paddingHorizontal: 16, paddingTop: 4 },
  rowGap: { height: 8 },
  summary: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  summaryText: { flex: 1, flexShrink: 1 }
})
