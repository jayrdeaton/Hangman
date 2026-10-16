import { getBlendedColor, useAutoPaperTheme } from '@rific/auto-paper'
import { getAchievementCatalogRows } from '@tastic/achievements'
import { AchievementRow, ActivityStatSection, BaseStatsScreen, LOCKED_BADGE_COLOR, MONO_FONT, StatRow, StatSection } from '@tastic/hud/chrome'
import { JSX, useEffect, useMemo } from 'react'
import { BackHandler, StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import { useSelector } from 'react-redux'

import { ACHIEVEMENT_CATALOG, VISIBLE_MODE_COUNT } from '@/constants/achievements'
import { STATS_SCREEN_Z_INDEX } from '@/constants/drawerStacking'
import { useGameStats } from '@/hooks/useGameStats'
import type { RootState } from '@/redux/store'
import { commaString } from '@/utils/commaString'
import type { PuzzleManifestItem } from '@/utils/puzzleCatalog'
import { getManifestUnlockProgress, getUnlockedCountForPack, type PuzzleUnlockMap } from '@/utils/unlocks'
import { gameShell } from '@/utils/webLayout'

export type StatsScreenProps = {
  onBack: () => void
  insets: { top: number; left: number; bottom: number; right: number }
  // The packs to count: the Game Menu passes its own manifest (custom packs included, rebuilt
  // whenever one is saved or imported), the same one its All Packs and Pack Progress rows and the
  // Pack Progress drawer use, so all of them agree, even after an import while this is open.
  manifest: PuzzleManifestItem[]
  // The caller's already-loaded unlock map (the Game Menu re-reads it on open and after every
  // unlockVersion bump), so the Progress rows are right from the first frame.
  unlockMap: PuzzleUnlockMap
  // Called after Reset, which clears the unlocked puzzles along with the stats.
  onUnlocksChanged: () => void
}

// The fleet's "-" for a rate with nothing played yet, rather than a 0% that reads as a real result.
const winRate = (wins: number, played: number): string => (played > 0 ? `${Math.round((wins / played) * 100)}%` : '-')
const count = (n: number): string => commaString(n)

// The fleet's Stats & Achievements screen (@tastic/hud's BaseStatsScreen, the shell Snake, Pong and
// the other games' achievements screens use), opened from the Game Menu's quick-look card. Hangman has
// no routes yet, so this is a full-screen layer over the open menu rather than a page: Back (the
// header arrow, or Android's back button) returns to the menu underneath. It knows nothing about where
// it's hosted beyond these props, so it can become a Home-screen page later as is.
//
// Mounted only while open, so it reads the stats store directly with no visibility gate (compare
// PackProgressDrawer, which stays mounted). The background is the board's own surface (the color
// Main paints behind the game), not the fleet's literal white or black, so it reads as the same
// whiteboard; text stays the fleet's high-contrast ink.
export const StatsScreen = ({ onBack, insets, manifest, unlockMap, onUnlocksChanged }: StatsScreenProps): JSX.Element => {
  const theme = useAutoPaperTheme()
  const { stats, unlocked } = useSelector((state: RootState) => state.achievements)
  const { resetAll } = useGameStats()

  const { totalUnlocked, totalAvailable } = useMemo(() => getManifestUnlockProgress(manifest, unlockMap), [manifest, unlockMap])
  const packsComplete = useMemo(() => manifest.filter((item) => getUnlockedCountForPack(unlockMap, item.key) >= item.count).length, [manifest, unlockMap])
  // Ids no longer in the catalog don't count, the same rule as the Game Menu card's count.
  const achievementsEarned = ACHIEVEMENT_CATALOG.filter((achievement) => achievement.id in unlocked).length
  const achievementRows = getAchievementCatalogRows(ACHIEVEMENT_CATALOG, stats, stats, unlocked, null)
  // Gold and silver progress bars and check marks barely show on light surfaces, so in light mode
  // they're drawn in the tier color darkened by half. The badges keep the real tier color, whose
  // black glyph reads fine on it. (That's why the list below is built from AchievementRow rather than
  // hud's AchievementCatalogSection, which always uses the raw tier color.)
  const tierAccent = (tierColor: string) => (theme.dark ? tierColor : getBlendedColor('#000000', tierColor, 0.5))
  const fgMuted = theme.dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'

  // The Game Menu has no Android back handling of its own, so without this, back here would leave the
  // app. It returns to the menu instead.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack()
      return true
    })
    return () => subscription.remove()
  }, [onBack])

  // BaseStatsScreen calls this once its confirm is accepted. Clears the stats, achievements and
  // unlocked puzzles together (see useGameStats), then tells the menu to re-read its unlock map.
  const handleReset = () => {
    void resetAll().then(onUnlocksChanged)
  }

  return (
    <View testID='stats-screen' style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: theme.colors.surface }]} accessibilityViewIsModal onAccessibilityEscape={onBack}>
      {/* The game screen's own column on the web (gameShell), so the rows don't stretch across a wide
          window. Native ignores it. */}
      <View style={[styles.column, gameShell]}>
        <BaseStatsScreen title='Stats & Achievements' onBack={onBack} insets={insets} rotation={0} bg={theme.colors.surface} onReset={handleReset} resetConfirmBody='This permanently erases every stat, achievement and unlocked puzzle. This cannot be undone.'>
          <StatSection label='PROGRESS'>
            <StatRow label='Puzzles Unlocked' value={`${count(totalUnlocked)} / ${count(totalAvailable)}`} />
            <StatRow label='Packs Completed' value={`${count(packsComplete)} / ${count(manifest.length)}`} />
            <StatRow label='Achievements Earned' value={`${achievementsEarned} / ${ACHIEVEMENT_CATALOG.length}`} />
            <StatRow label='Custom Packs Created' value={count(stats.customPacksCreated)} />
          </StatSection>

          {/* Solo and Pass & Play stay separate, as in the stats themselves (see statsEngine): a Pass &
              Play round is two people on one device, not the player's own record. */}
          <StatSection label='SOLO'>
            <StatRow label='Played' value={count(stats.solo.played)} />
            <StatRow label='Won' value={count(stats.solo.wins)} />
            <StatRow label='Lost' value={count(stats.solo.losses)} />
            <StatRow label='Win Rate' value={winRate(stats.solo.wins, stats.solo.played)} />
            <StatRow label='Current Streak' value={count(stats.soloStreak.currentWinStreak)} />
            <StatRow label='Best Streak' value={count(stats.soloStreak.bestWinStreak)} />
            <StatRow label='Flawless Wins' value={count(stats.flawlessWins)} />
            <StatRow label='Wins Without a Hint' value={count(stats.noHintWins)} />
            <StatRow label='Modes Won' value={`${stats.wonModeIds.length} / ${VISIBLE_MODE_COUNT}`} />
            <StatRow label='Letters Guessed' value={count(stats.lettersGuessed)} />
            <StatRow label='Letters Correct' value={count(stats.lettersCorrect)} />
          </StatSection>

          <StatSection label='PASS & PLAY'>
            <StatRow label='Rounds Played' value={count(stats.pnp.played)} />
            <StatRow label='Words Solved' value={count(stats.pnp.wins)} />
            <StatRow label='Words Missed' value={count(stats.pnp.losses)} />
            <StatRow label='Solve Rate' value={winRate(stats.pnp.wins, stats.pnp.played)} />
          </StatSection>

          <ActivityStatSection stats={stats} />

          <Text variant='labelMedium' style={[styles.listLabel, { color: fgMuted }]}>
            ALL ACHIEVEMENTS
          </Text>
          {achievementRows.map((row) => (
            <AchievementRow key={row.id} icon={row.icon} title={row.title} description={row.description} badgeColor={row.unlockedAt !== undefined ? row.tierColor : LOCKED_BADGE_COLOR} checkColor={tierAccent(row.tierColor)} unlockedLabel={row.unlockedLabel} progress={row.progress} />
          ))}
        </BaseStatsScreen>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  // hud's AchievementCatalogSection heading, copied so the rows above can take tierAccent.
  listLabel: { fontFamily: MONO_FONT, letterSpacing: 2, marginTop: 8 },
  screen: { zIndex: STATS_SCREEN_Z_INDEX }
})
