import { useAutoPaperTheme } from '@rific/auto-paper'
import { Drawer } from '@rific/drawer'
import { Button, IconButton } from '@rific/haptic-press'
import { JSX, useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Avatar, Card, Icon, ProgressBar, Text } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { DRAWER_HEADER_ROW_STYLE, DRAWER_HEADER_TITLE_WRAP_STYLE } from '@/constants/drawerHeader'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { ACHIEVEMENT_DEFINITIONS, type AchievementId, type AchievementStats, clearAchievements, DEFAULT_ACHIEVEMENT_STATS, getAchievementStats } from '@/utils/achievements'
import { alert } from '@/utils/alert'
import { commaString } from '@/utils/commaString'
import { pickHangmanFile, shareProgressBackupFile } from '@/utils/hangmanFile'
import { getPuzzleManifest, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
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
export const AchievementsDrawer = ({ visible, onDismiss, unlockVersion, onUnlocksChanged, mode, difficulty, onConfirm }: AchievementsDrawerProps): JSX.Element => {
  const theme = useAutoPaperTheme()
  const insets = useSafeAreaInsets()
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [])
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})
  const [detailPackKey, setDetailPackKey] = useState<string | null>(null)
  const [achievementStats, setAchievementStats] = useState<AchievementStats>(DEFAULT_ACHIEVEMENT_STATS)
  const [confirmResetVisible, setConfirmResetVisible] = useState(false)

  // Always reopens on the overview, same as PacksScreen resetting its own step on open —
  // otherwise a drawer left mid-pack-detail on last close would silently resume there next time.
  /* eslint-disable react-hooks/set-state-in-effect -- resets local UI state on an external prop transition, not derived from other state */
  useEffect(() => {
    if (visible) setDetailPackKey(null)
  }, [visible])
  /* eslint-enable react-hooks/set-state-in-effect */

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

  return (
    <>
      <Drawer open={visible} onClose={onDismiss} width={DRAWER_WIDTH} side='right'>
        <View testID='achievements-drawer-panel' style={[styles.panelContent, { paddingTop: insets.top, paddingBottom: insets.bottom }]} accessibilityViewIsModal={visible} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'} onAccessibilityEscape={visible ? (detailPackKey ? () => setDetailPackKey(null) : onDismiss) : undefined}>
          {/* Both the top-level close and the drilled-in back-arrow sit on the TRAILING (right)
              side — this drawer opens from the trophy icon at the top-right of the game screen, so
              its own exit action stays under the same thumb that opened it, same as every drawer
              in the Game Menu's lineage stays left-anchored to ITS opener (see PuzzleDrawer).
              The top-level exit is arrow-right, not X — mirrors PuzzleDrawer's arrow-left: the
              direction shows this panel moves off to the right (the way it slid in) when
              dismissed, and reads as its own thing rather than the top-right-corner-X convention.
              The drilled-in back-arrow stays arrow-left regardless — that's page-level "go back one
              level" navigation within this drawer, not the whole-panel dismiss direction, so it
              keeps the universal back-arrow meaning instead of following the panel's own side. */}
          <View style={styles.headerRow}>
            <View style={styles.headerSpacer} />
            {/* Absolutely positioned (see DRAWER_HEADER_TITLE_WRAP_STYLE) so it centers on the
                row's true center rather than the leftover flex space. */}
            <View style={DRAWER_HEADER_TITLE_WRAP_STYLE}>
              <Text variant='titleLarge' numberOfLines={1} style={styles.headerTitleText}>
                {detailPackKey ? detailPackLabel : 'Achievements'}
              </Text>
            </View>
            {detailPackKey ? <IconButton icon='arrow-left' onPress={() => setDetailPackKey(null)} accessibilityLabel='Back to achievements' /> : <IconButton icon='arrow-right' onPress={onDismiss} accessibilityLabel='Close' />}
          </View>

          {detailPackKey ? (
            <View style={styles.flex}>
              <PackPuzzleList packKey={detailPackKey} initialFilter='all' onPlayPuzzle={handlePlayPuzzle} />
              <View style={styles.footer}>
                <Button mode='contained' icon='play' onPress={handleRandom} contentStyle={styles.confirmContent} labelStyle={styles.confirmLabel}>
                  Random
                </Button>
              </View>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={styles.flex} contentContainerStyle={styles.scrollContent}>
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
              {manifest.map((item) => {
                const unlocked = getUnlockedCountForPack(unlockMap, item.key)
                const complete = item.count > 0 && unlocked >= item.count
                const progress = item.count > 0 ? unlocked / item.count : 0
                return <PackRow key={item.key} label={item.label} group={item.group} subtitle={`${commaString(unlocked)} of ${commaString(item.count)} unlocked`} progress={progress} onPress={() => setDetailPackKey(item.key)} trailing={<Icon source={complete ? 'trophy' : 'chevron-right'} size={24} color={complete ? theme.colors.primary : theme.colors.onSurfaceVariant} />} />
              })}

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
            </ScrollView>
          )}
        </View>
      </Drawer>

      <ConfirmDialog visible={confirmResetVisible} title='Reset progress?' message='This permanently clears every unlocked puzzle and achievement. This cannot be undone.' confirmLabel='Reset' destructive onConfirm={() => void handleConfirmReset()} onCancel={() => setConfirmResetVisible(false)} />
    </>
  )
}

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
  flex: { flex: 1 },
  footer: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  headerRow: DRAWER_HEADER_ROW_STYLE,
  headerSpacer: { width: 40 },
  headerTitleText: { textAlign: 'center' },
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
