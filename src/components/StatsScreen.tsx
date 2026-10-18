import { getAchievementCatalogRows } from '@tastic/achievements'
import { AchievementCatalogSection, ActivityStatSection, BaseStatsScreen, PressAwayOverlay, StatRow, StatSection, usePopoverHost } from '@tastic/hud/chrome'
import { type Profile, ProfilePicker } from '@tastic/profile'
import { JSX, useCallback, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTheme } from 'react-native-paper'
import { useSelector } from 'react-redux'

import { ACHIEVEMENT_CATALOG, VISIBLE_MODE_COUNT } from '@/constants/achievements'
import { useCatalogActions, useCatalogVersions } from '@/hooks/useCatalog'
import { useGameStats } from '@/hooks/useGameStats'
import { usePlayerData } from '@/hooks/usePlayerData'
import { useProfiles } from '@/hooks/useProfiles'
import { usePlayerPuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import type { RootState } from '@/redux/store'
import { commaString } from '@/utils/commaString'
import { playerKeyFor } from '@/utils/players'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { getProfileStatsView } from '@/utils/statsEngine'
import { createDefaultProfileStats } from '@/utils/statsValidation'
import { getManifestUnlockProgress, getUnlockedCountForPack } from '@/utils/unlocks'
import { gameShell } from '@/utils/webLayout'

export type StatsScreenProps = {
  onBack: () => void
  insets: { top: number; left: number; bottom: number; right: number }
  // Whose numbers to show first: a profile's id, or null/undefined for All Profiles, the device's (every
  // round played here, which is also the guests' record). The route leaves it out, so every visit opens
  // on All Profiles, as every fleet game's achievements screen does; the picker at the top changes it.
  initialProfileId?: string | null
}

// The picker's popover id is `${PICKER_ID_PREFIX}-profile` (@tastic/profile's ProfilePicker).
const PICKER_ID_PREFIX = 'stats'

// The fleet's "-" for a rate with nothing played yet, rather than a 0% that reads as a real result.
const winRate = (wins: number, played: number): string => (played > 0 ? `${Math.round((wins / played) * 100)}%` : '-')
const count = (n: number): string => commaString(n)

// The fleet's Stats & Achievements screen (@tastic/hud's BaseStatsScreen, the shell Snake, Pong and
// the other games' achievements screens use): the /achievements route, opened from Home's trophy.
//
// A profile picker at the top (Solitaire's and LightCycles'), there once a profile exists, picks whose
// numbers show: All Profiles (the device's, the null row), or one profile's own. Everything below
// follows it, the unlocked puzzles and the achievements included, and so does the reset at the bottom:
// one player's stats, achievements and unlocked puzzles while they're shown, everyone's on All
// Profiles.
//
// Transparent over the app's one board (see BoardBackground), so it reads as the same whiteboard as
// every other screen; text stays the fleet's high-contrast ink. Counts packs over the same
// packsVersion-keyed manifest the Single Player loadout and Choose Packs use, so all of them agree,
// custom packs included.
export const StatsScreen = ({ onBack, insets, initialProfileId = null }: StatsScreenProps): JSX.Element => {
  const theme = useTheme()
  const { stats: deviceStats, unlocked } = useSelector((state: RootState) => state.achievements)
  const { resetAll } = useGameStats()
  const { resetPlayer } = usePlayerData()
  const { packsVersion } = useCatalogVersions()
  const { refreshUnlocks } = useCatalogActions()
  const profiles = useProfiles()
  // This screen's own view, independent of who's playing. Back on All Profiles if the profile shown is
  // deleted (in another game, say) while the screen is open.
  const [selectedId, setSelectedId] = useState<string | null>(initialProfileId)
  const shown = selectedId ? (profiles.find((profile) => profile.id === selectedId) ?? null) : null
  const profileId = shown?.id ?? null
  const pickerHost = usePopoverHost()
  const handleSelect = useCallback((profile: Profile | null) => setSelectedId(profile?.id ?? null), [])
  // The fleet's ink, as the screen's text: the trigger, the menu's border and the selected row.
  const ink = theme.dark ? '#FFFFFF' : '#000000'
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const manifest = useMemo(() => getPuzzleManifest().filter((item) => item.count > 0), [packsVersion])
  // The profile's own bucket (empty until they finish a round), read exactly as the device's is.
  const profileBucket = profileId ? deviceStats.profiles[profileId] : undefined
  const stats = useMemo(() => (profileId ? getProfileStatsView(profileBucket ?? createDefaultProfileStats()) : deviceStats), [profileId, profileBucket, deviceStats])
  // The profile's own unlocked puzzles, or for All Profiles everyone's together.
  const { unlockMap } = usePlayerPuzzleUnlocks(profileId ? playerKeyFor(profileId) : null)

  const { totalUnlocked, totalAvailable } = useMemo(() => getManifestUnlockProgress(manifest, unlockMap), [manifest, unlockMap])
  const packsComplete = useMemo(() => manifest.filter((item) => getUnlockedCountForPack(unlockMap, item.key) >= item.count).length, [manifest, unlockMap])
  const achievementRows = useMemo(() => getAchievementCatalogRows(ACHIEVEMENT_CATALOG, deviceStats, stats, unlocked, profileId), [deviceStats, stats, unlocked, profileId])
  // Counted from the rows, so it's the shown player's own unlocks, and ids no longer in the catalog
  // don't count.
  const achievementsEarned = achievementRows.filter((row) => row.unlockedAt !== undefined).length

  // BaseStatsScreen calls this once its confirm is accepted. All Profiles clears every stat,
  // achievement and unlocked puzzle together (see useGameStats); a profile's clears just theirs (see
  // usePlayerData), and All Profiles keeps the rounds they played. Either way every screen then re-reads
  // its unlock map.
  const reset = shown ? { onReset: () => void resetPlayer(shown.id), label: `Reset ${shown.name}'s Stats`, title: `Reset ${shown.name}?`, body: `This permanently erases ${shown.name}'s stats, achievements and unlocked puzzles. All Profiles keeps the rounds they played. This cannot be undone.` } : { onReset: () => void resetAll().then(refreshUnlocks), label: 'Reset All Stats', title: 'Reset Everything?', body: 'This permanently erases every stat, achievement and unlocked puzzle. This cannot be undone.' }

  return (
    <View testID='stats-screen' style={styles.screen} onAccessibilityEscape={onBack}>
      {/* The game screen's own column on the web (gameShell), so the rows don't stretch across a wide
          window. Native ignores it. */}
      <View style={[styles.column, gameShell]}>
        <BaseStatsScreen title='Stats & Achievements' onBack={onBack} hitSlop={4} insets={insets} rotation={0} bg='transparent' onReset={reset.onReset} resetLabel={reset.label} resetConfirmTitle={reset.title} resetConfirmBody={reset.body}>
          {profiles.length > 0 ? (
            <>
              {/* First, under the picker: a tap anywhere else on the page closes its popover. Inside the
                  scrolling content, beside the picker, since on native zIndex only orders one parent's
                  children (see LoadoutShell's LoadoutPressAway). */}
              <PressAwayOverlay active={pickerHost.openId !== null} onPress={pickerHost.close} style={styles.pressAway} />
              <View style={styles.picker}>
                <ProfilePicker idPrefix={PICKER_ID_PREFIX} host={pickerHost} profiles={profiles} selectedId={profileId} color={ink} dark={theme.dark} guestLabel='All Profiles' nullLabel='All Profiles' nullIcon='account-group' onSelect={handleSelect} />
              </View>
            </>
          ) : null}

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
  // Above the press away catcher and the sections after it, which its popover hangs over.
  picker: { alignItems: 'flex-start', zIndex: 10 },
  pressAway: { zIndex: 5 },
  screen: { flex: 1 }
})
