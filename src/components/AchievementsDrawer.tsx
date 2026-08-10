import { useAutoPaperTheme } from '@rific/auto-paper'
import { Drawer } from '@rific/drawer'
import { Button, IconButton } from '@rific/haptic-press'
import { FlatList, ScrollViewFooter, ScrollViewHeader, ScrollViewProvider } from '@rific/scroll-view'
import { JSX, memo, useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Avatar, Card, Icon, ProgressBar, Text } from 'react-native-paper'

import { DRAWER_BASE_Z_INDEX } from '@/constants/drawerStacking'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { ACHIEVEMENT_DEFINITIONS, type AchievementId, type AchievementStats, clearAchievements, DEFAULT_ACHIEVEMENT_STATS, getAchievementStats } from '@/utils/achievements'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { pickHangmanFile, shareProgressBackupFile } from '@/utils/hangmanFile'
import { getPuzzleManifest, PuzzleDifficultyTier, type PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { type PuzzleConfig, resolveChosenPuzzle, resolvePuzzle } from '@/utils/puzzlePicker'
import { clearPuzzleUnlocks, getPuzzleUnlockMap, getUnlockedCountForPack, mergePuzzleUnlocks, parseProgressBackup, PuzzleUnlockMap } from '@/utils/unlocks'

import { ConfirmDialog } from './ConfirmDialog'
import { PackPuzzleList } from './PackPuzzleList'
import { PackRow } from './PackRow'

const DRAWER_WIDTH = 380
// Opacity folded into the color itself — boxShadow (unlike the deprecated shadow* props it
// replaces) has no separate opacity field.
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.3)'

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
// forcing a cramped nested scroll; a drawer gets the browser's full height instead. Right-side
// (matching the trophy button's position in the app bar) and no edge-swipe-to-open, matching
// PacksScreen (a secondary screen reached by tapping a button, not the app's primary
// hamburger-triggered drawer) rather than PuzzleDrawer, which anchors left with its hamburger
// trigger. Progress backup/reset lives at the bottom of this drawer rather than a standalone
// Settings screen, since those actions operate directly on the unlock/achievement data shown above
// them.
// mode/difficulty are read live in this file only inside handlePlayPuzzle/handleRandom (see
// below) — event handlers that fire from an actual tap, never from rendering — so while this
// drawer is closed, a mode/difficulty change happening elsewhere (e.g. the player picking a
// difficulty in PuzzleDrawer, on the opposite side of the screen) has nothing here for it to
// affect. Comparing them only once `visible` is true (or transitioning) means this drawer's own
// heavy render — a card per achievement, a row per pack — skips entirely for the common case of
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
// different drawer) is real, needless work — see PuzzleDrawer's own memo comment for the full
// reasoning. Callers must pass referentially stable props (Main.tsx wraps onDismiss in
// useCallback) or this memo does nothing. Uses the custom comparator above (not memo's own
// default shallow-equal) specifically to ALSO ignore mode/difficulty while closed — see its own
// comment for why that's safe.
export const AchievementsDrawer = memo(({ visible, onDismiss, unlockVersion, onUnlocksChanged, mode, difficulty, onConfirm }: AchievementsDrawerProps): JSX.Element => {
  const theme = useAutoPaperTheme()
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [])
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})
  const [detailPackKey, setDetailPackKey] = useState<string | null>(null)
  const [achievementStats, setAchievementStats] = useState<AchievementStats>(DEFAULT_ACHIEVEMENT_STATS)
  const [confirmResetVisible, setConfirmResetVisible] = useState(false)

  // Always reopens on the overview, same as PacksScreen resetting its own step on open —
  // otherwise a drawer left mid-pack-detail on last close would silently resume there next time.
  useEffect(() => {
    if (visible) setDetailPackKey(null)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let mounted = true
    void (async () => {
      const [nextUnlocks, nextAchievements] = await Promise.all([getPuzzleUnlockMap(), getAchievementStats()])
      if (mounted) {
        setUnlockMap(nextUnlocks)
        setAchievementStats(nextAchievements)
      }
    })()
    return () => {
      mounted = false
    }
  }, [visible, unlockVersion])

  const totalAvailable = useMemo(() => manifest.reduce((sum, item) => sum + item.count, 0), [manifest])
  const totalUnlocked = useMemo(() => {
    return manifest.reduce((sum, item) => {
      const count = getUnlockedCountForPack(unlockMap, item.key)
      return sum + Math.min(count, item.count)
    }, 0)
  }, [manifest, unlockMap])

  const overallProgress = totalAvailable > 0 ? totalUnlocked / totalAvailable : 0
  const detailPackLabel = useMemo(() => manifest.find((item) => item.key === detailPackKey)?.label ?? '', [manifest, detailPackKey])

  // Derived fresh from the same manifest/unlockMap "Browse by pack" and "Total progress" already
  // use, rather than a separately-persisted counter — a pack's completion state is exactly
  // "unlocked count caught up to its total", so there's nothing to get out of sync by tracking it
  // twice.
  const packsCompleted = useMemo(() => manifest.filter((item) => item.count > 0 && getUnlockedCountForPack(unlockMap, item.key) >= item.count).length, [manifest, unlockMap])

  // How many times each REPEATABLE achievement has actually been earned, shown as a small count
  // next to its badge below — unlike win_streak_5/the milestones/mode_master, which are one-shot
  // "eventually true forever" achievements a per-badge count wouldn't mean anything for.
  const achievementCounts: Partial<Record<AchievementId, number>> = {
    flawless: achievementStats.flawlessWins,
    no_hints: achievementStats.noHintWins,
    pack_complete: packsCompleted
  }

  // Solo and pass-and-play are kept as two separate stat groups here for the same reason
  // recordSolve/recordPnpWin keep them in separate counters (see achievements.ts) — a pnp result
  // is a contest between two people on one device, not the player's own record. Total played and
  // win % are derived, not stored — plain tiles in the same grid as everything else rather than
  // special-cased, so the whole section stays one uniform rhythm of {number, label} tiles.
  const soloPlayed = achievementStats.totalSolved + achievementStats.totalLost
  const soloWinPercent = soloPlayed > 0 ? Math.round((achievementStats.totalSolved / soloPlayed) * 100) : 0
  const soloStats = [
    { label: 'Won', value: achievementStats.totalSolved },
    { label: 'Lost', value: achievementStats.totalLost },
    { label: 'Win %', value: soloWinPercent, suffix: '%' },
    { label: 'Total played', value: soloPlayed },
    { label: 'Current streak', value: achievementStats.currentStreak },
    { label: 'Best streak', value: achievementStats.bestStreak },
    { label: 'Letters guessed', value: achievementStats.lettersGuessed },
    { label: 'Letters correct', value: achievementStats.lettersCorrect }
  ]
  const pnpPlayed = achievementStats.pnpWins + achievementStats.pnpLosses
  const pnpWinPercent = pnpPlayed > 0 ? Math.round((achievementStats.pnpWins / pnpPlayed) * 100) : 0
  const pnpStats = [
    { label: 'Wins', value: achievementStats.pnpWins },
    { label: 'Losses', value: achievementStats.pnpLosses },
    { label: 'Win %', value: pnpWinPercent, suffix: '%' },
    { label: 'Total played', value: pnpPlayed }
  ]

  const handleExport = async () => {
    try {
      const shared = await shareProgressBackupFile()
      if (!shared) void alert("Couldn't share", 'Sharing is not available on this device.')
    } catch {
      void alert("Couldn't share", 'Something went wrong sharing your progress backup. Please try again.')
    }
  }

  // Reads a file straight off the device (a real "pick a .hangman file" flow) rather than a
  // paste-text box — see hangmanFile.ts's own doc comments for why. parseProgressBackup validates
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
      void alert('Import complete', `Merged ${result.importedCount} entries. Added ${result.addedCount} new unlocks.`)
    } catch (_error) {
      void alert('Invalid backup', 'Could not read that as a Hangman progress backup file.')
    }
  }

  // Mirrors PackPuzzlesDrawer's own row-tap-to-play (same resolve-then-close shape as handleRandom
  // below) — a specific puzzle row should start that puzzle here exactly like it does there.
  const handlePlayPuzzle = (puzzleId: string) => {
    if (!detailPackKey) return
    const result = resolveChosenPuzzle(detailPackKey, puzzleId, mode)
    if (!result.ok) {
      void alert('No puzzles available', result.error)
      return
    }
    onConfirm(result.payload, { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' })
    // Starting a round is what closes this — otherwise it's left stacked on top of the game that
    // just started, blocking it from view until the player finds and taps Close themselves.
    onDismiss()
  }

  // Mirrors PackPuzzlesDrawer's own Random button — browsing into a pack's progress here would
  // otherwise be a dead end with no way to act on it. Uses the app's current mode/difficulty
  // (passed down from Main.tsx) rather than exposing pickers of its own; this drawer is about
  // reviewing progress, not choosing settings.
  const handleRandom = () => {
    if (!detailPackKey) return
    const configToResolve: PuzzleConfig = { sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' }
    const result = resolvePuzzle(configToResolve, [detailPackKey], unlockMap)
    if (!result.ok) {
      void alert('No puzzles available', result.error)
      return
    }
    onConfirm(result.payload, configToResolve)
    // Starting a round is what closes this — otherwise it's left stacked on top of the game that
    // just started, blocking it from view until the player finds and taps Close themselves.
    onDismiss()
  }

  // Only reachable from the confirm dialog's own Reset button (see the ConfirmDialog rendered
  // below) — by the time this runs, the player has already agreed.
  const handleConfirmReset = async () => {
    setConfirmResetVisible(false)
    await clearPuzzleUnlocks()
    await clearAchievements()
    onUnlocksChanged()
  }

  // "Browse by pack" — the full 50-pack manifest, real enough on-device render cost that the old
  // plain .map() inside a ScrollView (rendering every row unconditionally even though this whole
  // drawer stays mounted off-screen most of the time) was worth virtualizing: this becomes the
  // FlatList's own `data` below, everything else on the overview screen splits into
  // listHeader/listFooter around it.
  const renderPackRow = useCallback(
    ({ item }: { item: PuzzleManifestItem }) => {
      const unlocked = getUnlockedCountForPack(unlockMap, item.key)
      const complete = item.count > 0 && unlocked >= item.count
      const progress = item.count > 0 ? unlocked / item.count : 0
      return <PackRow label={item.label} group={item.group} subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`} progress={progress} onPress={() => setDetailPackKey(item.key)} trailing={<Icon source={complete ? 'trophy' : 'chevron-right'} size={24} color={complete ? theme.colors.primary : theme.colors.onSurfaceVariant} />} />
    },
    [unlockMap, theme.colors.primary, theme.colors.onSurfaceVariant]
  )
  const packRowKeyExtractor = useCallback((item: PuzzleManifestItem) => item.key, [])

  // Total progress card through the "Browse by pack" label, as the FlatList's own scrolling
  // header rather than a sibling before it — same ListHeaderComponent approach as PuzzleDrawer's
  // and PacksScreen's own pack lists (see PuzzleDrawer's own comment on this). Not memoized:
  // unlike those two, this drawer only re-renders at all when actually open (see
  // areAchievementsDrawerPropsEqual above), so there's no needless-cascade cost left to guard
  // against here — just the same JSX this screen always rendered, moved into a variable.
  const listHeader = (
    <>
      <Card style={styles.card} mode='contained'>
        <Card.Content>
          <Text variant='labelLarge' style={styles.overline}>
            Total progress
          </Text>
          <Text variant='displaySmall' style={styles.bigNumber}>
            {commaString(totalUnlocked)}
            <Text variant='titleMedium' style={styles.muted}>
              {' '}
              / {commaString(totalAvailable)}
            </Text>
          </Text>
          <Text variant='bodySmall' style={styles.muted}>
            puzzles unlocked
          </Text>
          <View style={styles.progressBarWrapper}>
            <ProgressBar progress={overallProgress} style={[styles.progressBar, { backgroundColor: theme.colors.background }]} />
          </View>
        </Card.Content>
      </Card>

      <Text variant='titleMedium' style={styles.sectionLabel}>
        Stats
      </Text>
      <Card style={styles.card} mode='contained'>
        <Card.Content>
          <View style={styles.statsGrid}>
            {soloStats.map((stat) => (
              <View key={stat.label} testID={`stat-${stat.label}`} style={styles.statTile}>
                <Text variant='titleLarge' style={styles.statValue}>
                  {commaString(stat.value)}
                  {stat.suffix ?? ''}
                </Text>
                <Text variant='bodySmall' style={styles.muted}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>

          <Text variant='labelLarge' style={styles.statsSubLabel}>
            Pass & play
          </Text>
          <View style={styles.statsGrid}>
            {pnpStats.map((stat) => (
              <View key={stat.label} testID={`stat-pnp-${stat.label}`} style={styles.statTile}>
                <Text variant='titleLarge' style={styles.statValue}>
                  {commaString(stat.value)}
                  {stat.suffix ?? ''}
                </Text>
                <Text variant='bodySmall' style={styles.muted}>
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
      {ACHIEVEMENT_DEFINITIONS.map((def) => {
        const unlocked = achievementStats.unlockedIds.includes(def.id)
        const count = achievementCounts[def.id]
        return (
          <Card key={def.id} style={styles.card} mode='contained'>
            <Card.Content style={styles.achievementRow}>
              <Avatar.Icon size={40} icon={def.icon} style={unlocked ? styles.achievementIconUnlocked : styles.achievementIconLocked} />
              <View style={styles.achievementText}>
                <View style={styles.achievementTitleRow}>
                  <Text variant='titleSmall' style={unlocked ? undefined : styles.muted}>
                    {def.title}
                  </Text>
                  {unlocked && count ? (
                    <Text variant='bodySmall' style={styles.muted}>
                      ×{commaString(count)}
                    </Text>
                  ) : null}
                </View>
                <Text variant='bodySmall' style={styles.muted}>
                  {def.description}
                </Text>
              </View>
            </Card.Content>
          </Card>
        )
      })}

      <Text variant='titleMedium' style={styles.sectionLabel}>
        Browse by pack
      </Text>
    </>
  )

  const listFooter = (
    <>
      <Text variant='titleMedium' style={styles.sectionLabel}>
        Progress backup
      </Text>
      <Button mode='contained-tonal' icon='export-variant' onPress={() => void handleExport()}>
        Export progress
      </Button>
      <Button mode='contained-tonal' icon='import' onPress={() => void handleImportFile()} style={styles.spaced}>
        Import progress
      </Button>
      <Text variant='bodySmall' style={styles.muted}>
        Imports merge with your existing progress.
      </Text>

      <Text variant='titleMedium' style={styles.sectionLabel}>
        Danger zone
      </Text>
      <Button mode='outlined' icon='delete-outline' textColor={theme.colors.danger} onPress={() => setConfirmResetVisible(true)}>
        Reset all progress
      </Button>
    </>
  )

  return (
    <>
      <Drawer open={visible} onClose={onDismiss} width={DRAWER_WIDTH} side='right' zIndex={DRAWER_BASE_Z_INDEX}>
        <View testID='achievements-drawer-panel' style={styles.panelContent} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? (detailPackKey ? () => setDetailPackKey(null) : onDismiss) : undefined}>
          <ScrollViewProvider>
            {/* Both the top-level close and the drilled-in back-arrow sit on the TRAILING (right)
                side — this drawer opens from the trophy icon at the top-right of the game screen, so
                its own exit action stays under the same thumb that opened it, same as every drawer
                in the Game Menu's lineage stays left-anchored to ITS opener (see PuzzleDrawer).
                trailingAction, not backAction — ScrollViewHeader's backAction always renders on the
                LEADING side, which would put this drawer's exit action on the wrong side; IconButton
                here is @rific/haptic-press's own wrapper (already fires haptics), unlike
                Appbar.BackAction, so no manual selection() call is needed the way backAction needs
                one elsewhere. The top-level exit is arrow-right, not X — mirrors PuzzleDrawer's
                arrow-left: the direction shows this panel moves off to the right (the way it slid
                in) when dismissed, and reads as its own thing rather than the top-right-corner-X
                convention. The drilled-in back-arrow stays arrow-left regardless — that's page-level
                "go back one level" navigation within this drawer, not the whole-panel dismiss
                direction, so it keeps the universal back-arrow meaning instead of following the
                panel's own side. */}
            <ScrollViewHeader title={detailPackKey ? detailPackLabel : 'Achievements'} trailingAction={detailPackKey ? <IconButton icon='arrow-left' onPress={() => setDetailPackKey(null)} accessibilityLabel='Back to achievements' /> : <IconButton icon='arrow-right' onPress={onDismiss} accessibilityLabel='Close' />} />

            {detailPackKey ? (
              <>
                <PackPuzzleList packKey={detailPackKey} initialFilter='all' onPlayPuzzle={handlePlayPuzzle} />
                <ScrollViewFooter style={styles.footer}>
                  <Button mode='contained' icon='play' onPress={handleRandom} contentStyle={styles.confirmContent} labelStyle={styles.confirmLabel}>
                    Random
                  </Button>
                </ScrollViewFooter>
              </>
            ) : (
              // Total progress/Stats/Achievements through Progress backup/Danger zone live in
              // listHeader/listFooter (see their own declarations above) — everything around the
              // pack list scrolls with it exactly as it did back when this was all one plain
              // ScrollView; only the pack list itself (the full 50-pack manifest) needed to
              // become a real FlatList.
              <FlatList data={manifest} keyExtractor={packRowKeyExtractor} renderItem={renderPackRow} ListHeaderComponent={listHeader} ListFooterComponent={listFooter} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} />
            )}
          </ScrollViewProvider>
        </View>
      </Drawer>

      <ConfirmDialog visible={confirmResetVisible} title='Reset progress?' message='This permanently clears every unlocked puzzle and achievement. This cannot be undone.' confirmLabel='Reset' destructive onConfirm={() => void handleConfirmReset()} onCancel={() => setConfirmResetVisible(false)} />
    </>
  )
}, areAchievementsDrawerPropsEqual)
AchievementsDrawer.displayName = 'AchievementsDrawer'

const styles = StyleSheet.create({
  achievementIconLocked: { opacity: 0.4 },
  achievementIconUnlocked: {},
  achievementRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  achievementText: { flex: 1, flexShrink: 1 },
  achievementTitleRow: { alignItems: 'baseline', flexDirection: 'row', gap: 6 },
  bigNumber: { fontWeight: '800', marginTop: 4 },
  card: { marginBottom: 4 },
  confirmContent: { height: 52 },
  confirmLabel: { fontSize: 16, fontWeight: '700' },
  // alignItems override matches every other migrated footer — see PuzzleDrawer's own footer
  // comment: Random stretches full width instead of shrinking to content and centering.
  footer: {
    alignItems: 'stretch',
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  muted: { opacity: 0.7 },
  overline: { letterSpacing: 1, opacity: 0.7, textTransform: 'uppercase' },
  panelContent: {
    boxShadow: [{ offsetX: 2, offsetY: 0, blurRadius: 8, color: SHADOW_COLOR }],
    elevation: 8,
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
    paddingBottom: 16,
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
