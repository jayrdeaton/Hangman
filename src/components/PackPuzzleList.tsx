import { Menu } from '@rific/auto-paper'
import { Button } from '@rific/haptic-press'
import { FlatList, ScrollViewContext } from '@rific/scroll-view'
import { JSX, useContext, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon, Text, useTheme } from 'react-native-paper'

import { type DifficultyOptionColors, useDifficultyOptionColors } from '@/hooks/useDifficultyColors'
import { type PackPuzzleDifficultyFilter, type PackPuzzleStatusFilter, usePackPuzzleListPrefs } from '@/hooks/usePackPuzzleListPrefs'
import type { Puzzle } from '@/types/puzzle'
import { commaString } from '@/utils/commaString'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { getPuzzleManifest, getPuzzlesForCategory, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import { getPuzzleUnlockMap } from '@/utils/unlocks'

import { PackRow } from './PackRow'

const DIFFICULTY_LABELS: Record<PuzzleDifficultyTier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const STATUS_LABELS: Record<PackPuzzleStatusFilter, string> = { all: 'All', unsolved: 'Unsolved', solved: 'Solved' }
const STATUS_OPTIONS: PackPuzzleStatusFilter[] = ['all', 'unsolved', 'solved']
const DIFFICULTY_OPTIONS: PackPuzzleDifficultyFilter[] = ['all', 'easy', 'medium', 'hard']

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

// Combines the status filter with the difficulty filter so "no puzzles" always describes what's
// actually hiding them — a bare "All puzzles solved!" would be misleading if the player is also
// filtered to Hard and there are still unsolved Easy ones sitting outside that filter.
const emptyMessage = (statusFilter: PackPuzzleStatusFilter, difficultyFilter: PackPuzzleDifficultyFilter): string => {
  const difficultyPhrase = difficultyFilter === 'all' ? '' : `${DIFFICULTY_LABELS[difficultyFilter].toLowerCase()} `
  if (statusFilter === 'solved') return `No ${difficultyPhrase}puzzles solved yet.`
  if (statusFilter === 'unsolved') return `All ${difficultyPhrase}puzzles solved!`
  return `This pack has no ${difficultyPhrase}puzzles yet.`
}

export type PackPuzzleListProps = {
  packKey: string | null
  // Rows become tappable to play that exact puzzle when supplied. Omitted for read-only browsing
  // (PacksScreen's "view contents" step) — that caller has no mode/difficulty context to actually
  // start a round with, so there's nothing a tap could do.
  onPlayPuzzle?: (puzzleId: string) => void
}

// The puzzle list for one pack, shared by every screen that shows "what's in this pack": browsing
// to play (PackPuzzlesDrawer and AchievementsDrawer's own pack detail step, both onPlayPuzzle
// wired up) and reviewing progress read-only (PacksScreen's "view contents" step, no
// onPlayPuzzle). One row-rendering, masking, and progress implementation instead of
// independently-maintained ones that had quietly drifted apart.
export const PackPuzzleList = ({ packKey, onPlayPuzzle }: PackPuzzleListProps): JSX.Element => {
  const theme = useTheme()
  // Same four-way (Any + the three real tiers) vibrant/container set PuzzleDrawer's own
  // Difficulty picker uses, for both the difficulty filter menu below and each row's own
  // difficulty badge — see useDifficultyOptionColors's own doc comment for why this is one
  // shared hook instead of two hand-rolled copies.
  const difficultyOptionColors = useDifficultyOptionColors()
  // Mirrors difficultyOptionColors' own {vibrant, onVibrant, container, onContainer} shape, using
  // the theme's own primary/secondary/tertiary triad instead of the difficulty semantic roles —
  // All/Unsolved/Solved aren't a severity scale the way Easy/Medium/Hard are, so they get the
  // app's plain accent triad rather than borrowing success/warning/danger.
  const statusOptionColors: Record<PackPuzzleStatusFilter, DifficultyOptionColors> = useMemo(
    () => ({
      all: { vibrant: theme.colors.primary, onVibrant: theme.colors.onPrimary, container: theme.colors.primaryContainer, onContainer: theme.colors.onPrimaryContainer },
      unsolved: { vibrant: theme.colors.secondary, onVibrant: theme.colors.onSecondary, container: theme.colors.secondaryContainer, onContainer: theme.colors.onSecondaryContainer },
      solved: { vibrant: theme.colors.tertiary, onVibrant: theme.colors.onTertiary, container: theme.colors.tertiaryContainer, onContainer: theme.colors.onTertiaryContainer }
    }),
    [theme.colors.primary, theme.colors.onPrimary, theme.colors.primaryContainer, theme.colors.onPrimaryContainer, theme.colors.secondary, theme.colors.onSecondary, theme.colors.secondaryContainer, theme.colors.onSecondaryContainer, theme.colors.tertiary, theme.colors.onTertiary, theme.colors.tertiaryContainer, theme.colors.onTertiaryContainer]
  )
  // Every caller renders this inside a parent ScrollViewProvider now (see PackPuzzlesDrawer/
  // AchievementsDrawer) — its floating ScrollViewHeader overlays whatever sits at the very top of
  // that provider, and progressHeader below is a plain in-flow sibling with no padding of its own
  // to clear it, unlike this file's own FlatList (which already gets a correct top inset for free
  // via useScrollList internally, see @rific/scroll-view's FlatList.tsx). headerHeight is null until
  // the header's very first layout pass measures it — reading it directly from context, the same
  // value ScrollViewHeader/ScrollView/Footer already key their own positioning off of.
  const { headerHeight } = useContext(ScrollViewContext)
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set())
  // A shared, persisted preference (see usePackPuzzleListPrefs's own doc comment on why) rather
  // than local component state — every pack this opens on should reflect the same status/
  // difficulty filter the player last picked, not reset to defaults each time.
  const { prefs, setPrefs } = usePackPuzzleListPrefs()
  const [statusMenuVisible, setStatusMenuVisible] = useState(false)
  const [difficultyMenuVisible, setDifficultyMenuVisible] = useState(false)

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

  const pack = useMemo(() => getPuzzleManifest().find((item) => item.key === packKey), [packKey])
  const allPuzzles = useMemo(() => (packKey ? getPuzzlesForCategory(packKey) : []), [packKey])

  const puzzles = useMemo(() => {
    let result = allPuzzles
    if (prefs.statusFilter === 'solved') result = result.filter((puzzle) => unlockedIds.has(puzzle.id))
    else if (prefs.statusFilter === 'unsolved') result = result.filter((puzzle) => !unlockedIds.has(puzzle.id))
    if (prefs.difficultyFilter !== 'all') result = result.filter((puzzle) => puzzle.difficultyTier === prefs.difficultyFilter)
    return result
  }, [allPuzzles, prefs.statusFilter, prefs.difficultyFilter, unlockedIds])

  const statusButtonColors = statusOptionColors[prefs.statusFilter]
  const difficultyButtonColors = difficultyOptionColors[prefs.difficultyFilter === 'all' ? 'any' : prefs.difficultyFilter]
  const difficultyButtonLabel = prefs.difficultyFilter === 'all' ? 'Any' : DIFFICULTY_LABELS[prefs.difficultyFilter]

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

  // A leading checkmark icon reserved on EVERY row, not just the selected one (rendered
  // transparent instead of omitted) — Menu.Item sizes its own leading-icon slot only when an item
  // actually has one, so a mix of "has an icon" and "has none" rows indent inconsistently against
  // each other. Always passing one, just invisible when not selected, keeps every row's label
  // starting at the same x position regardless of which one is checked.
  // eslint-disable-next-line react/display-name -- a render-prop factory (Menu.Item's own IconSource shape), not a component of its own
  const checkmark = (selected: boolean, color: string) => (iconProps: { size: number }) => <Icon source='check' size={iconProps.size} color={selected ? color : 'transparent'} />

  return (
    // Hidden until the header measures, same as the FlatList below already does internally — this
    // View's own top padding depends on headerHeight too (see progressHeader below), so revealing
    // it before that first measurement would flash it in unpadded, up under the floating header.
    <View style={[styles.flex, headerHeight === null && styles.hidden]}>
      {/* Fixed, not part of the scrollable list below — stays in view while scrolling through a
          long pack instead of scrolling away with row 1. paddingTop reserves space for the
          floating ScrollViewHeader above, which overlays rather than pushing this down itself. */}
      <View style={[styles.progressHeader, { paddingTop: (headerHeight ?? 0) + 12 }]}>
        {/* The same PackRow every pack list (PacksScreen/PuzzleDrawer's Choose Packs/
            AchievementsDrawer's "Browse by pack") already uses for this exact pack — its group
            icon+eyebrow, unlocked count, and progress bar, carried into the detail view it opens
            rather than left behind the moment you drill in. Lives here rather than in the fixed
            ScrollViewHeader above (PackPuzzlesDrawer's/AchievementsDrawer's own centerContent):
            that header is a fixed-height band, absolutely positioned and clipped to fit only a
            single title line — a 4-line PackRow doesn't fit it without getting cut off. No
            onPress/trailing — this is a read-only summary of the pack already open, not another
            navigable row. */}
        <View style={styles.packSummary}>
          <PackRow label={pack.label} group={pack.group} isPack subtitle={`${commaString(unlockedIds.size)} of ${commaString(pack.count)} unlocked`} progress={pack.count > 0 ? unlockedIds.size / pack.count : 0} />
        </View>
        <View style={styles.controlsRow}>
          <Menu
            visible={statusMenuVisible}
            onDismiss={() => setStatusMenuVisible(false)}
            contentStyle={styles.menuContent}
            anchor={
              <Button testID='status-filter-button' mode='contained' buttonColor={statusButtonColors.vibrant} textColor={statusButtonColors.onVibrant} icon='filter-variant' onPress={() => setStatusMenuVisible(true)} accessibilityLabel='Filter by solved status'>
                {STATUS_LABELS[prefs.statusFilter]}
              </Button>
            }
          >
            {STATUS_OPTIONS.map((value) => {
              const selected = prefs.statusFilter === value
              const colors = statusOptionColors[value]
              return (
                <Menu.Item
                  key={value}
                  testID={`status-filter-${value}`}
                  leadingIcon={checkmark(selected, colors.onVibrant)}
                  title={STATUS_LABELS[value]}
                  style={{ backgroundColor: selected ? colors.vibrant : colors.container }}
                  titleStyle={{ color: selected ? colors.onVibrant : colors.onContainer }}
                  onPress={() => {
                    setPrefs({ statusFilter: value })
                    setStatusMenuVisible(false)
                  }}
                />
              )
            })}
          </Menu>
          <Menu
            visible={difficultyMenuVisible}
            onDismiss={() => setDifficultyMenuVisible(false)}
            contentStyle={styles.menuContent}
            anchor={
              <Button testID='difficulty-filter-button' mode='contained' buttonColor={difficultyButtonColors.vibrant} textColor={difficultyButtonColors.onVibrant} icon='speedometer' onPress={() => setDifficultyMenuVisible(true)} accessibilityLabel='Filter by difficulty'>
                {difficultyButtonLabel}
              </Button>
            }
          >
            {DIFFICULTY_OPTIONS.map((value) => {
              const selected = prefs.difficultyFilter === value
              const colors = difficultyOptionColors[value === 'all' ? 'any' : value]
              return (
                <Menu.Item
                  key={value}
                  testID={`difficulty-filter-${value}`}
                  leadingIcon={checkmark(selected, colors.onVibrant)}
                  title={value === 'all' ? 'Any difficulty' : DIFFICULTY_LABELS[value]}
                  style={{ backgroundColor: selected ? colors.vibrant : colors.container }}
                  titleStyle={{ color: selected ? colors.onVibrant : colors.onContainer }}
                  onPress={() => {
                    setPrefs({ difficultyFilter: value })
                    setDifficultyMenuVisible(false)
                  }}
                />
              )
            })}
          </Menu>
        </View>
      </View>

      {/* Its own flex:1 box, a sibling of progressHeader rather than sharing a parent with it —
          @rific/scroll-view's FlatList switches its own outer container to StyleSheet.absoluteFill
          once its header height is measured (see useScrollList's containerStyle), which fills
          whatever View is its own DIRECT parent edge-to-edge. Without this wrapper, that parent
          was the same flex column progressHeader sits in, so the absolutely-filled FlatList
          ignored progressHeader's occupied space entirely and painted its rows starting right
          under the real header, overlapping the count text and filter buttons. Wrapping it here
          means the absoluteFill only fills THIS box, whose own bounds are already correctly
          placed below progressHeader by ordinary flex layout before that switch ever happens.
          overflow: 'hidden' — see the inner wrapper's own comment for why this box's bounds have
          to stay exactly here, unshifted, even though what's inside it isn't. */}
      <View style={styles.list}>
        {/* @rific/scroll-view's FlatList always adds its own contentContainerStyle paddingTop:
            headerHeight (see useScrollList's contentPadding), on the assumption it sits directly
            under the floating header with nothing else in between — true before progressHeader
            existed, not true now that progressHeader already reserves that same headerHeight
            worth of space itself. Left uncorrected, the list's first row sat a whole extra
            headerHeight below progressHeader's own bottom edge (a redundant gap, not the overlap
            the outer wrapper above already fixed). Shifting THIS inner box up by that amount
            cancels it, landing the FlatList's own internal padding back at progressHeader's true
            bottom edge.

            This has to be a SEPARATE inner box, not the same marginTop applied to the outer
            wrapper directly: a negative margin moves a view's entire box, touch target included —
            applied to the outer wrapper, that dragged the FlatList's real (if invisible) hit
            region up over progressHeader's own Filter/Sort buttons, silently swallowing their
            presses despite nothing being visibly wrong (the exact class of bug the drag-handle
            strip's own pointerEvents fix in @rific/drawer's Drawer.tsx addresses for a different
            component). Keeping the shift on an INNER box while the OUTER one stays fixed and
            clips via overflow: 'hidden' means anything this inner box renders above the outer
            box's own top edge — including its touch target — is clipped away along with it,
            the same way any other overflow: 'hidden' boundary in this app already behaves. */}
        <View style={[styles.listInner, { marginTop: -(headerHeight ?? 0) }]}>
          {puzzles.length === 0 ? (
            <Text variant='bodySmall' style={styles.emptyText}>
              {emptyMessage(prefs.statusFilter, prefs.difficultyFilter)}
            </Text>
          ) : (
            <FlatList
              data={puzzles}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps='handled'
              // Solid vibrant fill, not the chip's own default muted surface tint — matches every
              // other accent across the app now (see AchievementsDrawer's own doc comments on this
              // pattern), rather than being the one control that's still washed out.
              chipProps={{ style: { backgroundColor: theme.colors.primary }, selectedColor: theme.colors.onPrimary }}
            />
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  controlsRow: { flexDirection: 'row', gap: 8 },
  // alignSelf keeps the pill sized to its own text rather than stretching to PackRow's full text
  // column width — matches PuzzleInfoRow's own difficulty pill shape, just smaller (a list row's
  // subtitle line, not a standalone gameplay badge).
  difficultyBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  difficultyBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  emptyText: { marginTop: 12, opacity: 0.7, paddingHorizontal: 16 },
  flex: { flex: 1 },
  hidden: { opacity: 0 },
  // overflow: 'hidden' clips listInner's own upward shift (and its touch target) at exactly this
  // box's own top edge — see listInner's call-site comment for why that boundary has to stay
  // fixed here rather than moving with the shift.
  list: { flex: 1, overflow: 'hidden' },
  // paddingBottom matches progressHeader's own top clearance (12px past the header, see the call
  // site above) — the last row sits the same distance from what follows it as the first row sits
  // from the filter controls above it.
  listContent: {
    paddingBottom: 12,
    paddingHorizontal: 16
  },
  listInner: { flex: 1 },
  // Rounder than the Menu's own default (theme.roundness, MD3's subtle 4) — overflow: 'hidden' so
  // each Menu.Item's own colored background (see the checked/unchecked style above) gets clipped
  // to this shape too, instead of showing sharp item corners poking past a rounded outer edge.
  menuContent: { borderRadius: 16, overflow: 'hidden' },
  // Wraps the pack summary PackRow — its own default marginBottom (4, meant for stacking against
  // an identical row right below it in an ordinary pack list) reads as too tight against the
  // differently-shaped filter buttons that follow it here.
  packSummary: { marginBottom: 8 },
  // paddingTop is applied dynamically at the call site (see above) — always overrides whatever's
  // declared here, so it's deliberately left out of this static object rather than left dead.
  progressHeader: {
    paddingBottom: 8,
    paddingHorizontal: 16
  }
})
