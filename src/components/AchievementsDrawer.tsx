import { type AutoPaperTheme, getBlendedColor, useAutoPaperTheme } from '@rific/auto-paper'
import { Drawer } from '@rific/drawer'
import { Button, IconButton } from '@rific/feedback-press'
import { FlatList, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { getAchievementCatalogRows } from '@tastic/achievements'
import { AchievementRow, ConfirmDialog, LOCKED_BADGE_COLOR } from '@tastic/hud/chrome'
import { JSX, memo, useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Card, Icon, ProgressBar, Text } from 'react-native-paper'
import { useSharedValue } from 'react-native-reanimated'
import { useSelector } from 'react-redux'

import { ACHIEVEMENT_CATALOG } from '@/constants/achievements'
import { DRAWER_ACHIEVEMENTS_Z_INDEX } from '@/constants/drawerStacking'
import { useDrawerWidth } from '@/hooks/useDrawerWidth'
import { useGameStats } from '@/hooks/useGameStats'
import type { RootState } from '@/redux/store'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { pickHangmanFile, shareProgressBackupFile } from '@/utils/hangmanFile'
import { getPuzzleManifest, PuzzleDifficultyTier, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolveChosenPuzzle, resolvePuzzle } from '@/utils/puzzlePicker'
import { getManifestUnlockProgress, getPuzzleUnlockMap, getUnlockedCountForPack, mergePuzzleUnlocks, parseProgressBackup, PuzzleUnlockMap } from '@/utils/unlocks'

import { PackPuzzleList } from './PackPuzzleList'
import { PackRow } from './PackRow'

// 4px on every side of a 40x40 icon button (see the matching actionSize={40} on this drawer's own
// ScrollViewHeader) brings the actual tap target up to 48x48, without the visible circle itself
// growing to fill that whole area.
const ICON_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 }

// Wins/Losses read as a plain win-loss signal regardless of which stat grid (solo or pass & play)
// they're in, so both share this rather than each grid hand-picking its own accents; every other
// tile stays neutral (onSecondaryContainer) rather than turning the whole grid into a rainbow.
const statValueColor = (label: string, theme: AutoPaperTheme): string => {
  if (label === 'Wins') return theme.colors.success
  if (label === 'Losses') return theme.colors.error
  return theme.colors.onSecondaryContainer
}

export type AchievementsDrawerProps = {
  visible: boolean
  onDismiss: () => void
  unlockVersion: number
  onUnlocksChanged: () => void
  mode: GameMode
  difficulty: 'any' | PuzzleDifficultyTier
  onConfirm: (payload: GameStartPayload, config: PuzzleConfig) => void
}

// A drawer, not a dialog: the achievement list plus one row per pack is a genuinely long scroll,
// and the old DialogShell capped its content at a fixed maxHeight regardless of screen size,
// forcing a cramped nested scroll; a drawer gets the browser's full height instead. Left-side,
// matching PuzzleDrawer (the Game Menu) - this only opens from a tap on that drawer's own
// quick-look progress card now, not a standalone trophy button on the opposite corner, so it
// stacks above PuzzleDrawer's own panel (see DRAWER_ACHIEVEMENTS_Z_INDEX) rather than sliding in
// independently; no edge-swipe of its own, same as PackPuzzlesDrawer (also only reached via a tap
// from inside another drawer). Progress backup/reset lives at the bottom of this drawer rather
// than a standalone Settings screen, since those actions operate directly on the unlock/
// achievement data shown above them.
// mode/difficulty are read live in this file only inside handlePlayPuzzle/handleRandom (see
// below) - event handlers that fire from an actual tap, never from rendering - so while this
// drawer is closed, a mode/difficulty change happening elsewhere (e.g. the player picking a
// difficulty in PuzzleDrawer, on the opposite side of the screen) has nothing here for it to
// affect. Comparing them only once `visible` is true (or transitioning) means this drawer's own
// heavy render - a card per achievement, a row per pack - skips entirely for the common case of
// "closed, and something else on screen just changed," without going stale: the moment `visible`
// flips true this falls through to the full comparison, so the render that actually mounts the
// panel on screen always picks up Main.tsx's current mode/difficulty, not a cached one.
const areAchievementsDrawerPropsEqual = (prev: AchievementsDrawerProps, next: AchievementsDrawerProps): boolean => {
  if (!prev.visible && !next.visible) {
    return prev.onDismiss === next.onDismiss && prev.unlockVersion === next.unlockVersion && prev.onUnlocksChanged === next.onUnlocksChanged && prev.onConfirm === next.onConfirm
  }
  return prev.visible === next.visible && prev.onDismiss === next.onDismiss && prev.unlockVersion === next.unlockVersion && prev.onUnlocksChanged === next.onUnlocksChanged && prev.mode === next.mode && prev.difficulty === next.difficulty && prev.onConfirm === next.onConfirm
}

// Memoized: this stays mounted (translated off-screen) even while closed and renders a card per
// achievement plus a row per pack, so re-rendering it on every unrelated ancestor state change
// (e.g. Main.tsx's config changing because the player picked a difficulty in a completely
// different drawer) is real, needless work - see PuzzleDrawer's own memo comment for the full
// reasoning. Callers must pass referentially stable props (Main.tsx wraps onDismiss in
// useCallback) or this memo does nothing. Uses the custom comparator above (not memo's own
// default shallow-equal) specifically to ALSO ignore mode/difficulty while closed - see its own
// comment for why that's safe.
export const AchievementsDrawer = memo(({ visible, onDismiss, unlockVersion, onUnlocksChanged, mode, difficulty, onConfirm }: AchievementsDrawerProps): JSX.Element => {
  const theme = useAutoPaperTheme()
  const drawerWidth = useDrawerWidth()
  // Closed position for a `side='left'` drawer (the default, see @rific/drawer's own
  // getClosedOffset) is -drawerWidth, the same seed PuzzleDrawer's own panel uses.
  const translateX = useSharedValue(-drawerWidth)
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [])
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})
  const [detailPackKey, setDetailPackKey] = useState<string | null>(null)
  const [confirmResetVisible, setConfirmResetVisible] = useState(false)
  // Stats and unlocks from the store, followed only while open. Closed, the equality check always
  // passes, so a round finishing elsewhere doesn't re-render this mounted-but-hidden drawer (see the
  // memo below), and the drawer keeps showing what it had while it slides shut.
  const achievements = useSelector(
    (state: RootState) => state.achievements,
    (prev, next) => !visible || prev === next
  )
  const { stats } = achievements
  const { resetAll } = useGameStats()

  // Always reopens on the overview, same as PacksScreen resetting its own step on open -
  // otherwise a drawer left mid-pack-detail on last close would silently resume there next time.
  useEffect(() => {
    if (visible) setDetailPackKey(null)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let mounted = true
    void getPuzzleUnlockMap().then((nextUnlocks) => {
      if (mounted) setUnlockMap(nextUnlocks)
    })
    return () => {
      mounted = false
    }
  }, [visible, unlockVersion])

  const { totalUnlocked, totalAvailable, overallProgress } = useMemo(() => getManifestUnlockProgress(manifest, unlockMap), [manifest, unlockMap])

  // Solo and Pass & Play stay two separate stat groups, as in the stats themselves (see
  // statsEngine): a Pass & Play result is a contest between two people on one device, not the
  // player's own record. Win % is derived, a plain tile in the same grid as everything else, so the
  // whole section stays one uniform rhythm of {number, label} tiles.
  const winPercent = (wins: number, played: number) => (played > 0 ? Math.round((wins / played) * 100) : 0)
  const soloStats = [
    { label: 'Wins', value: stats.solo.wins },
    { label: 'Losses', value: stats.solo.losses },
    { label: 'Win %', value: winPercent(stats.solo.wins, stats.solo.played), suffix: '%' },
    { label: 'Played', value: stats.solo.played },
    { label: 'Current Streak', value: stats.soloStreak.currentWinStreak },
    { label: 'Best Streak', value: stats.soloStreak.bestWinStreak },
    { label: 'Letters Guessed', value: stats.lettersGuessed },
    { label: 'Letters Correct', value: stats.lettersCorrect }
  ]
  const pnpStats = [
    { label: 'Wins', value: stats.pnp.wins },
    { label: 'Losses', value: stats.pnp.losses },
    { label: 'Win %', value: winPercent(stats.pnp.wins, stats.pnp.played), suffix: '%' },
    { label: 'Played', value: stats.pnp.played }
  ]
  // The fleet's achievement rows: unlocked ones in their tier's color with the date, locked ones
  // grey with a progress bar toward the next rung.
  const achievementRows = getAchievementCatalogRows(ACHIEVEMENT_CATALOG, stats, stats, achievements.unlocked, null)
  // Gold and silver progress bars and check marks barely show on light surfaces, so in light mode
  // they're drawn in the tier color darkened by half. The badges keep the real tier color, whose
  // black glyph reads fine on it.
  const tierAccent = (tierColor: string) => (theme.dark ? tierColor : getBlendedColor('#000000', tierColor, 0.5))

  const handleExport = async () => {
    try {
      const shared = await shareProgressBackupFile()
      if (!shared) void alert("Couldn't Share", 'Sharing is not available on this device.')
    } catch {
      void alert("Couldn't Share", 'Something went wrong sharing your progress backup. Please try again.')
    }
  }

  // Reads a file straight off the device (a real "pick a .hangman file" flow) rather than a
  // paste-text box - see hangmanFile.ts's own doc comments for why. parseProgressBackup validates
  // the shape first so picking a custom pack file by mistake surfaces as "Invalid backup" instead
  // of silently merging zero entries (mergePuzzleUnlocks alone is lenient about bare-map shapes and
  // wouldn't otherwise catch that).
  const handleImportFile = async () => {
    const raw = await pickHangmanFile()
    if (!raw) return

    try {
      parseProgressBackup(raw)
      const result = await mergePuzzleUnlocks(raw)
      onUnlocksChanged()
      void alert('Import Complete', `Merged ${result.importedCount} entries. Added ${result.addedCount} new unlocks.`)
    } catch {
      void alert('Invalid Backup', 'Could not read that as a Hangman progress backup file.')
    }
  }

  // Mirrors PackPuzzlesDrawer's own row-tap-to-play (same resolve-then-close shape as handleRandom
  // below) - a specific puzzle row should start that puzzle here exactly like it does there.
  const handlePlayPuzzle = (puzzleId: string) => {
    if (!detailPackKey) return
    const result = resolveChosenPuzzle(detailPackKey, puzzleId, mode)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    onConfirm(result.payload, { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' })
    // Starting a round is what closes this - otherwise it's left stacked on top of the game that
    // just started, blocking it from view until the player finds and taps Close themselves.
    onDismiss()
  }

  // Mirrors PackPuzzlesDrawer's own Random button - browsing into a pack's progress here would
  // otherwise be a dead end with no way to act on it. Uses the app's current mode/difficulty
  // (passed down from Main.tsx) rather than exposing pickers of its own; this drawer is about
  // reviewing progress, not choosing settings.
  const handleRandom = () => {
    if (!detailPackKey) return
    const configToResolve: PuzzleConfig = { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' }
    const result = resolvePuzzle(configToResolve, [detailPackKey], unlockMap)
    if (!result.ok) {
      void alert('No Puzzles Available', result.error)
      return
    }
    onConfirm(result.payload, configToResolve)
    // Starting a round is what closes this - otherwise it's left stacked on top of the game that
    // just started, blocking it from view until the player finds and taps Close themselves.
    onDismiss()
  }

  // Only reachable from the confirm dialog's own Reset button (see the ConfirmDialog rendered
  // below) - by the time this runs, the player has already agreed.
  const handleConfirmReset = async () => {
    setConfirmResetVisible(false)
    // Clears the stats, achievements and unlocked puzzles together (see useGameStats).
    await resetAll()
    onUnlocksChanged()
  }

  // "Browse by pack" - the full 50-pack manifest, real enough on-device render cost that the old
  // plain .map() inside a ScrollView (rendering every row unconditionally even though this whole
  // drawer stays mounted off-screen most of the time) was worth virtualizing: this becomes the
  // FlatList's own `data` below, everything else on the overview screen splits into
  // listHeader/listFooter around it.
  const renderPackRow = useCallback(
    ({ item }: { item: PuzzleManifestItem }) => {
      const unlocked = getUnlockedCountForPack(unlockMap, item.key)
      const complete = item.count > 0 && unlocked >= item.count
      const progress = item.count > 0 ? unlocked / item.count : 0
      return <PackRow label={item.label} group={item.group} isPack subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`} progress={progress} onPress={() => setDetailPackKey(item.key)} trailing={<Icon source={complete ? 'trophy' : 'chevron-right'} size={24} color={complete ? theme.colors.primary : theme.colors.onSurfaceVariant} />} />
    },
    [unlockMap, theme.colors.primary, theme.colors.onSurfaceVariant]
  )
  const packRowKeyExtractor = useCallback((item: PuzzleManifestItem) => item.key, [])

  // Total progress card through the "Browse by pack" label, as the FlatList's own scrolling
  // header rather than a sibling before it - same ListHeaderComponent approach as PuzzleDrawer's
  // and PacksScreen's own pack lists (see PuzzleDrawer's own comment on this). Not memoized:
  // unlike those two, this drawer only re-renders at all when actually open (see
  // areAchievementsDrawerPropsEqual above), so there's no needless-cascade cost left to guard
  // against here - just the same JSX this screen always rendered, moved into a variable.
  const listHeader = (
    <>
      <Card style={[styles.card, styles.firstCard, { backgroundColor: theme.colors.primaryContainer }]} mode='contained'>
        <Card.Content>
          <Text variant='labelLarge' style={[styles.overline, { color: theme.colors.onPrimaryContainer }]}>
            Total Progress
          </Text>
          <Text variant='displaySmall' style={[styles.bigNumber, { color: theme.colors.primary }]}>
            {commaString(totalUnlocked)}
            <Text variant='titleMedium' style={[styles.muted, { color: theme.colors.onPrimaryContainer }]}>
              {' '}
              / {commaString(totalAvailable)}
            </Text>
          </Text>
          <Text variant='bodySmall' style={[styles.muted, { color: theme.colors.onPrimaryContainer }]}>
            Puzzles Unlocked
          </Text>
          <View style={styles.progressBarWrapper}>
            <ProgressBar progress={overallProgress} style={[styles.progressBar, { backgroundColor: theme.colors.surface }]} />
          </View>
        </Card.Content>
      </Card>

      <Text variant='titleMedium' style={styles.sectionLabel}>
        Stats
      </Text>
      <Card style={[styles.card, { backgroundColor: theme.colors.secondaryContainer }]} mode='contained'>
        <Card.Content>
          <View style={styles.statsGrid}>
            {soloStats.map((stat) => (
              <View key={stat.label} testID={`stat-${stat.label}`} style={styles.statTile}>
                <Text variant='titleLarge' style={[styles.statValue, { color: statValueColor(stat.label, theme) }]}>
                  {commaString(stat.value)}
                  {stat.suffix ?? ''}
                </Text>
                <Text variant='bodySmall' style={[styles.muted, { color: theme.colors.onSecondaryContainer }]}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>

          <Text variant='labelLarge' style={[styles.statsSubLabel, { color: theme.colors.onSecondaryContainer }]}>
            Pass & Play
          </Text>
          <View style={styles.statsGrid}>
            {pnpStats.map((stat) => (
              <View key={stat.label} testID={`stat-pnp-${stat.label}`} style={styles.statTile}>
                <Text variant='titleLarge' style={[styles.statValue, { color: statValueColor(stat.label, theme) }]}>
                  {commaString(stat.value)}
                  {stat.suffix ?? ''}
                </Text>
                <Text variant='bodySmall' style={[styles.muted, { color: theme.colors.onSecondaryContainer }]}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        </Card.Content>
      </Card>

      <Text variant='titleMedium' style={styles.sectionLabel}>
        Achievements
      </Text>
      <View style={styles.achievementList}>
        {achievementRows.map((row) => (
          <AchievementRow key={row.id} icon={row.icon} title={row.title} description={row.description} badgeColor={row.unlockedAt !== undefined ? row.tierColor : LOCKED_BADGE_COLOR} checkColor={tierAccent(row.tierColor)} unlockedLabel={row.unlockedLabel} progress={row.progress} fg={theme.colors.onSurface} fgMuted={theme.colors.onSurfaceVariant} />
        ))}
      </View>

      <Text variant='titleMedium' style={styles.sectionLabel}>
        Browse by Pack
      </Text>
    </>
  )

  const listFooter = (
    <>
      <Text variant='titleMedium' style={styles.sectionLabel}>
        Progress Backup
      </Text>
      <Button mode='contained' buttonColor={theme.colors.secondary} textColor={theme.colors.onSecondary} icon='export-variant' onPress={() => void handleExport()}>
        Export
      </Button>
      <Button mode='contained' buttonColor={theme.colors.tertiary} textColor={theme.colors.onTertiary} icon='import' onPress={() => void handleImportFile()} style={styles.spaced}>
        Import
      </Button>
      <Text variant='bodySmall' style={styles.muted}>
        Imports merge with your existing progress
      </Text>

      <Text variant='titleMedium' style={styles.sectionLabel}>
        Danger Zone
      </Text>
      <Button mode='contained' buttonColor={theme.colors.danger} textColor={theme.colors.onDanger} icon='delete-outline' onPress={() => setConfirmResetVisible(true)}>
        Reset All Progress
      </Button>
    </>
  )

  return (
    <>
      <Drawer open={visible} onClose={onDismiss} panelShadow translateOffset={translateX} width={drawerWidth} zIndex={DRAWER_ACHIEVEMENTS_Z_INDEX}>
        <View testID='achievements-drawer-panel' style={styles.panelContent} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? (detailPackKey ? () => setDetailPackKey(null) : onDismiss) : undefined}>
          <ScrollViewProvider>
            {/* Both the top-level close and the drilled-in back-arrow sit on the LEADING (left)
                side, matching PuzzleDrawer (the Game Menu) - this only opens from a tap on that
                drawer's own quick-look card now, so its own exit action stays under the same
                thumb that opened it, same as PackPuzzlesDrawer already does for the same reason.
                backAction, not trailingAction - IconButton here is @rific/feedback-press's own
                wrapper (already fires haptics), unlike Appbar.BackAction, so no manual selection()
                call is needed the way backAction needs one elsewhere. The top-level exit is
                arrow-left, not X - mirrors PuzzleDrawer's own close icon exactly, rather than the
                top-right-corner-X convention. The drilled-in back-arrow stays arrow-left too -
                that's page-level "go back one level" navigation within this drawer, not the
                whole-panel dismiss, but both read the same direction now that this panel itself is
                left-anchored. */}
            <ScrollViewHeader
              actionSize={40}
              // Generic "Pack" while drilled in, rather than the pack's own name or group tint -
              // its actual identity (icon, genre, title, progress) lives entirely in
              // PackPuzzleList's own in-flow pack summary row now; this is just enough of a label
              // that the floating bar doesn't read as unexpectedly bare.
              title={detailPackKey ? 'Pack' : 'Achievements'}
              backAction={detailPackKey ? <IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={() => setDetailPackKey(null)} accessibilityLabel='Back to achievements' /> : <IconButton icon='arrow-left' hitSlop={ICON_ACTION_HIT_SLOP} iconColor={theme.colors.onSurface} onPress={onDismiss} accessibilityLabel='Close' />}
            />

            {detailPackKey ? (
              <>
                <PackPuzzleList packKey={detailPackKey} onPlayPuzzle={handlePlayPuzzle} />
                <ScrollViewFooter style={styles.footer}>
                  <Button mode='contained' icon='play' onPress={handleRandom}>
                    Random
                  </Button>
                </ScrollViewFooter>
              </>
            ) : (
              // Total progress/Stats/Achievements through Progress backup/Danger zone live in
              // listHeader/listFooter (see their own declarations above) - everything around the
              // pack list scrolls with it exactly as it did back when this was all one plain
              // ScrollView; only the pack list itself (the full 50-pack manifest) needed to
              // become a real FlatList.
              <FlatList
                data={manifest}
                keyExtractor={packRowKeyExtractor}
                renderItem={renderPackRow}
                ListHeaderComponent={listHeader}
                ListFooterComponent={listFooter}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                // Solid vibrant fill, not the chip's own default muted surface tint - matches
                // every other accent in this drawer now instead of being the one control still
                // washed out.
                chipProps={{ style: { backgroundColor: theme.colors.primary }, selectedColor: theme.colors.onPrimary }}
              />
            )}
          </ScrollViewProvider>
        </View>
      </Drawer>

      <ConfirmDialog visible={confirmResetVisible} title='Reset Progress?' message='This permanently clears every unlocked puzzle and achievement. This cannot be undone.' icon='delete-forever-outline' confirmLabel='Reset' cancelLabel='Cancel' destructive onConfirm={() => void handleConfirmReset()} onCancel={() => setConfirmResetVisible(false)} />
    </>
  )
}, areAchievementsDrawerPropsEqual)
AchievementsDrawer.displayName = 'AchievementsDrawer'

const styles = StyleSheet.create({
  // hud's AchievementRow has no spacing of its own (on the fleet's stats screen the screen supplies it).
  achievementList: { gap: 8 },
  bigNumber: { fontWeight: '800', marginTop: 4 },
  card: { marginBottom: 4 },
  // scrollContent's own paddingTop is clobbered by the FlatList's header-height inset (see
  // useScrollList's contentPadding, applied after externalContentContainerStyle in its style
  // array), so it can't create breathing room below the fixed header - this has to sit on the
  // first card itself instead, same as PuzzleDrawer's modeSelectorBleed.
  firstCard: { marginTop: 12 },
  // flexDirection/alignItems override matches every other migrated footer - see PuzzleDrawer's
  // own footer comment: alignItems alone only stretches the cross axis, which is height while
  // ScrollViewFooter's own row stays flexDirection 'row', so flexDirection has to flip to
  // 'column' too for Random to actually stretch full width instead of shrinking to content.
  footer: {
    alignItems: 'stretch',
    flexDirection: 'column',
    // Matches ScrollViewHeader's own actionMargin - see PuzzleDrawer's own footer comment for why.
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  muted: { opacity: 0.7 },
  overline: { letterSpacing: 1, opacity: 0.7, textTransform: 'uppercase' },
  panelContent: {
    flex: 1,
    overflow: 'hidden'
  },
  progressBar: {
    borderRadius: 6,
    height: 8
  },
  progressBarWrapper: {
    height: 8,
    marginTop: 10,
    overflow: 'hidden'
  },
  scrollContent: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 4
  },
  sectionLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16
  },
  spaced: { marginTop: 12 },
  statTile: { flexBasis: '48%', flexGrow: 1 },
  statValue: { fontWeight: '800' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  statsSubLabel: {
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16
  }
})
