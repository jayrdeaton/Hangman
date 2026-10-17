import { getAchievementCatalogRows } from '@tastic/achievements'
import { AchievementCatalogSection, ActivityStatSection, BaseStatsScreen, StatRow, StatSection } from '@tastic/hud/chrome'
import { JSX, useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSelector } from 'react-redux'

import { ACHIEVEMENT_CATALOG, VISIBLE_MODE_COUNT } from '@/constants/achievements'
import { useCatalogActions, useCatalogVersions } from '@/hooks/useCatalog'
import { useGameStats } from '@/hooks/useGameStats'
import type { RootState } from '@/redux/store'
import { commaString } from '@/utils/commaString'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { getManifestUnlockProgress, getPuzzleUnlockMap, getUnlockedCountForPack, type PuzzleUnlockMap } from '@/utils/unlocks'
import { gameShell } from '@/utils/webLayout'

export type StatsScreenProps = {
  onBack: () => void
  insets: { top: number; left: number; bottom: number; right: number }
}

// The fleet's "-" for a rate with nothing played yet, rather than a 0% that reads as a real result.
const winRate = (wins: number, played: number): string => (played > 0 ? `${Math.round((wins / played) * 100)}%` : '-')
const count = (n: number): string => commaString(n)

// The fleet's Stats & Achievements screen (@tastic/hud's BaseStatsScreen, the shell Snake, Pong and
// the other games' achievements screens use): the /achievements route, opened from Home's trophy.
//
// Transparent over the app's one board (see BoardBackground), so it reads as the same whiteboard as
// every other screen; text stays the fleet's high-contrast ink. Counts packs over the same
// packsVersion-keyed manifest the Single Player loadout's All Packs and Pack Progress rows use, so all
// of them agree, custom packs included.
export const StatsScreen = ({ onBack, insets }: StatsScreenProps): JSX.Element => {
  const { stats, unlocked } = useSelector((state: RootState) => state.achievements)
  const { resetAll } = useGameStats()
  const { packsVersion, unlockVersion } = useCatalogVersions()
  const { refreshUnlocks } = useCatalogActions()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  const [unlockMap, setUnlockMap] = useState<PuzzleUnlockMap>({})

  useEffect(() => {
    let mounted = true
    void getPuzzleUnlockMap().then((map) => {
      if (mounted) setUnlockMap(map)
    })
    return () => {
      mounted = false
    }
  }, [unlockVersion])

  const { totalUnlocked, totalAvailable } = useMemo(() => getManifestUnlockProgress(manifest, unlockMap), [manifest, unlockMap])
  const packsComplete = useMemo(() => manifest.filter((item) => getUnlockedCountForPack(unlockMap, item.key) >= item.count).length, [manifest, unlockMap])
  // Ids no longer in the catalog don't count, the same rule as useUnlockedAchievementCount's count.
  const achievementsEarned = ACHIEVEMENT_CATALOG.filter((achievement) => achievement.id in unlocked).length
  const achievementRows = getAchievementCatalogRows(ACHIEVEMENT_CATALOG, stats, stats, unlocked, null)

  // BaseStatsScreen calls this once its confirm is accepted. Clears the stats, achievements and
  // unlocked puzzles together (see useGameStats), then has every screen re-read its unlock map.
  const handleReset = () => {
    void resetAll().then(refreshUnlocks)
  }

  return (
    <View testID='stats-screen' style={styles.screen} onAccessibilityEscape={onBack}>
      {/* The game screen's own column on the web (gameShell), so the rows don't stretch across a wide
          window. Native ignores it. */}
      <View style={[styles.column, gameShell]}>
        <BaseStatsScreen title='Stats & Achievements' onBack={onBack} hitSlop={4} insets={insets} rotation={0} bg='transparent' onReset={handleReset} resetConfirmBody='This permanently erases every stat, achievement and unlocked puzzle. This cannot be undone.'>
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

          {/* hud 0.20.0+ draws gold and silver check marks and progress bars darker in light mode, so
              they show on the board's light surface. */}
          <AchievementCatalogSection rows={achievementRows} />
        </BaseStatsScreen>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  screen: { flex: 1 }
})
