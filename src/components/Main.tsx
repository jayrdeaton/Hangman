import * as Linking from 'expo-linking'
import { JSX, useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Appbar, Snackbar } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { usePackSelection } from '@/hooks/usePackSelection'
import { DEFAULT_MODE } from '@/modes/registry'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { ACHIEVEMENT_DEFINITIONS_BY_ID, type AchievementId, recordLoss, recordSolve } from '@/utils/achievements'
import { loadCustomPacksCache } from '@/utils/customPacks'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { parseSharedPuzzle } from '@/utils/puzzleLink'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'
import { getPuzzleUnlockMap, getUnlockedCountForPack, markPuzzleUnlocked } from '@/utils/unlocks'
import { gameShell } from '@/utils/webLayout'

import { AchievementsDialog } from './AchievementsDialog'
import { Game, type SolveDetails } from './Game'
import { PuzzleDrawer } from './PuzzleDrawer'
import { type CategoryProgress } from './RoundEndDialog'
import { SettingsDialog } from './SettingsDialog'

const DEFAULT_CONFIG: PuzzleConfig = {
  sourceMode: 'random',
  difficulty: 'any',
  mode: DEFAULT_MODE,
  customPhrase: '',
  customHint: ''
}

export const Main = (): JSX.Element => {
  const insets = useSafeAreaInsets()
  // The persisted default pack selection (see usePackSelection) — read here, before the lazy
  // state initializers below, so it's already available (synchronously — see
  // PackSelectionProvider) the moment they run.
  const { selectedPackKeys } = usePackSelection()
  // Resolved synchronously (not via a hook side effect) on web and read from the native module's
  // cache on native — see expo-linking's getLinkingURL — so a cold-started shared-puzzle link is
  // already known by the time the lazy state initializers below run.
  const incomingUrl = Linking.useLinkingURL()
  // No setup screen — the app opens straight into a game, matching the "no fuss" goal. A puzzle
  // shared by a friend (opened cold) goes straight into that puzzle too, for the same reason;
  // everything else falls back to the default random puzzle. Both computed as lazy useState
  // initializers (not an effect) so the first paint already shows the right game.
  const [config, setConfig] = useState<PuzzleConfig>(() => {
    const shared = incomingUrl ? parseSharedPuzzle(incomingUrl) : null
    return shared ?? DEFAULT_CONFIG
  })
  const [session, setSession] = useState<GameStartPayload | null>(() => {
    const result = resolvePuzzle(config, selectedPackKeys)
    return result.ok ? result.payload : null
  })
  // Game is keyed on this counter (not session.phrase) so it always remounts on a new round —
  // two consecutive puzzles can land on the identical normalized phrase (a small pack, or two
  // different puzzles normalizing to the same text), and keying on the phrase text would then
  // reuse the same Game instance, carrying its outcome/celebrationCycle/guessedLetters state into the
  // "new" round instead of resetting it.
  const [roundKey, setRoundKey] = useState(0)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [achievementsVisible, setAchievementsVisible] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [unlockVersion, setUnlockVersion] = useState(0)
  const [customPacksVersion, setCustomPacksVersion] = useState(0)
  // A share link opened while the app is already running shouldn't silently replace whatever's in
  // progress — it prefills the drawer instead, same "explicit confirm" rule the drawer's own New
  // Puzzle button follows. Distinct from `config`, which only ever reflects the last CONFIRMED
  // puzzle, so dismissing without confirming leaves the active game untouched.
  const [pendingShare, setPendingShare] = useState<PuzzleConfig | null>(null)
  const [handledUrl, setHandledUrl] = useState(incomingUrl)
  const [snackbarQueue, setSnackbarQueue] = useState<AchievementId[]>([])
  const pendingAchievementsRef = useRef<AchievementId[]>([])
  // The category-completion stat shown on a win. Cleared synchronously at the top of
  // handleSolved (see below) so a fresh win never briefly shows the previous win's numbers
  // while the unlock-map lookup for the new one is still in flight.
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress | null>(null)

  // Native caches the cold-start URL in a singleton that only resets via this call (unlike web,
  // which always re-reads the live window location) — clearing it once consumed means a later
  // remount (Fast Refresh, a future error boundary) can't replay the same puzzle as if it were new.
  useEffect(() => {
    Linking.clearInitialURL()
  }, [])

  const refreshUnlocks = useCallback(() => setUnlockVersion((v) => v + 1), [])
  const refreshCustomPacks = useCallback(() => setCustomPacksVersion((v) => v + 1), [])

  // Custom packs live in AsyncStorage, so they aren't available for the very first (synchronous)
  // auto-started puzzle on cold boot — same "loads shortly after first paint" tradeoff the app
  // already accepts for unlocks/achievements. Bumping the version afterward makes them show up in
  // the pack picker and future random draws as soon as they're hydrated.
  useEffect(() => {
    void loadCustomPacksCache().then(refreshCustomPacks)
  }, [refreshCustomPacks])

  const handleConfirmPuzzle = useCallback((payload: GameStartPayload, nextConfig: PuzzleConfig) => {
    setSession(payload)
    setConfig(nextConfig)
    setDrawerVisible(false)
    setPendingShare(null)
    setRoundKey((k) => k + 1)
  }, [])

  const handleDismissDrawer = useCallback(() => {
    setDrawerVisible(false)
    setPendingShare(null)
  }, [])

  // Live, not staged behind the drawer's confirm button — an art style is purely cosmetic, so it
  // applies to the round already on screen the instant it's picked, not just future ones. Session
  // stays otherwise untouched (same phrase/hint/outcome/guessedLetters), so this never disturbs a
  // round in progress; Game.tsx separately freezes the mistake limit itself at round start so a
  // mode with a different maxMistakes (see modes/stars.tsx) can't shift the difficulty mid-round.
  const handleModeChange = useCallback((mode: GameMode) => {
    setConfig((c) => ({ ...c, mode }))
    setSession((s) => (s ? { ...s, mode } : s))
  }, [])

  // Also live, but deliberately left out of `session` — a difficulty filter only shapes which
  // puzzle gets drawn NEXT, so touching the config that startNextRound reads from is enough for it
  // to apply the moment the current round ends, without retroactively touching the puzzle already
  // on screen (which was already drawn under whatever filter was active at the time).
  const handleDifficultyChange = useCallback((difficulty: PuzzleConfig['difficulty']) => {
    setConfig((c) => ({ ...c, difficulty }))
  }, [])

  const handleSolved = useCallback(
    async (details: SolveDetails) => {
      // Cleared here (synchronously, before the first await below) so it's batched with the
      // Game's own setOutcome('win') and never paints the previous round's category stats
      // while this round's unlock-map lookup is still in flight.
      setCategoryProgress(null)

      let packUnlockedCount: number | undefined
      let packTotalCount: number | undefined

      if (session?.packKey && session.puzzleId) {
        const unlocked = await markPuzzleUnlocked(session.packKey, session.puzzleId)
        const unlockMap = await getPuzzleUnlockMap()
        packUnlockedCount = getUnlockedCountForPack(unlockMap, session.packKey)
        packTotalCount = getPuzzleManifest().find((item) => item.key === session.packKey)?.count
        if (unlocked) refreshUnlocks()
        if (session.packLabel && packTotalCount) setCategoryProgress({ label: session.packLabel, unlockedCount: packUnlockedCount, totalCount: packTotalCount })
      }

      const newlyUnlocked = await recordSolve({
        modeId: session?.mode.id ?? DEFAULT_MODE.id,
        wrongGuesses: details.wrongGuesses,
        hintWasAvailable: Boolean(session?.hint),
        hintRevealed: details.hintRevealed,
        packKey: session?.packKey,
        packUnlockedCount,
        packTotalCount
      })
      pendingAchievementsRef.current = newlyUnlocked
      refreshUnlocks()
    },
    [session, refreshUnlocks]
  )

  const handleLost = useCallback(() => {
    void recordLoss()
  }, [])

  const surfacePendingAchievements = useCallback(() => {
    if (pendingAchievementsRef.current.length > 0) {
      setSnackbarQueue(pendingAchievementsRef.current)
      pendingAchievementsRef.current = []
    }
  }, [])

  // Shared by "Next puzzle" (drawing from the player's full standing selection) and "Another in
  // category" (drawing from a one-off config narrowed to just the pack just won) — both leave a
  // round and want a puzzle pulled from *some* config, they just disagree on which one.
  const startNextRound = useCallback(
    (nextConfig: PuzzleConfig, packKeys: string[]) => {
      surfacePendingAchievements()
      const result = resolvePuzzle(nextConfig, packKeys)
      if (result.ok) {
        setSession(result.payload)
        setRoundKey((k) => k + 1)
      }
    },
    [surfacePendingAchievements]
  )

  const handleRoundEnd = useCallback(() => {
    // A custom word is one-off — there's no "next" word to auto-generate, so surface the drawer
    // to ask for a new one instead of silently replaying the same phrase.
    if (config.sourceMode === 'custom') {
      surfacePendingAchievements()
      setDrawerVisible(true)
      return
    }
    // The live selection, not whatever config.packKeys used to be — a pack toggled off in Choose
    // Packs and never confirmed via "New puzzle" should still apply to this automatic next round.
    startNextRound(config, selectedPackKeys)
  }, [config, selectedPackKeys, startNextRound, surfacePendingAchievements])

  // Only ever wired up while categoryProgress is set, which only happens for a pack-sourced win
  // (see handleSolved) — session.packKey is guaranteed non-null whenever this can be called.
  const handlePlayAnotherInCategory = useCallback(() => {
    if (!session?.packKey) return
    startNextRound(config, [session.packKey])
  }, [config, session, startNextRound])

  /* eslint-disable react-hooks/set-state-in-effect --
     Synchronizing with an external system (an OS-level deep link arriving after mount), not
     prop-mirroring — see the identical justification on PuzzleDrawer's animation effect. */
  useEffect(() => {
    if (!incomingUrl || incomingUrl === handledUrl) return
    setHandledUrl(incomingUrl)
    const shared = parseSharedPuzzle(incomingUrl)
    if (shared) {
      setPendingShare(shared)
      setDrawerVisible(true)
    }
  }, [incomingUrl, handledUrl])
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <View style={styles.flex}>
      <Appbar.Header elevated>
        <Appbar.Action icon='menu' onPress={() => setDrawerVisible(true)} accessibilityLabel='Game Menu' />
        <View style={styles.appbarSpacer} />
        <Appbar.Action icon='trophy-outline' onPress={() => setAchievementsVisible(true)} accessibilityLabel='Achievements' />
        <Appbar.Action icon='cog-outline' onPress={() => setSettingsVisible(true)} accessibilityLabel='Settings' />
      </Appbar.Header>

      <View style={[styles.flex, gameShell, { paddingBottom: insets.bottom }]}>{session ? <Game key={roundKey} onStop={handleRoundEnd} onSolved={handleSolved} onLost={handleLost} phrase={session.phrase} mode={session.mode} hint={session.hint} packLabel={session.packLabel} difficultyTier={session.difficultyTier} categoryProgress={categoryProgress} onAnotherInCategory={handlePlayAnotherInCategory} /> : null}</View>

      <PuzzleDrawer visible={drawerVisible} onDismiss={handleDismissDrawer} onRequestOpen={() => setDrawerVisible(true)} initialConfig={pendingShare ?? config} onConfirm={handleConfirmPuzzle} packsVersion={customPacksVersion} onPacksChanged={refreshCustomPacks} onModeChange={handleModeChange} onDifficultyChange={handleDifficultyChange} />
      <AchievementsDialog visible={achievementsVisible} onDismiss={() => setAchievementsVisible(false)} unlockVersion={unlockVersion} />
      <SettingsDialog visible={settingsVisible} onDismiss={() => setSettingsVisible(false)} onUnlocksChanged={refreshUnlocks} />
      <Snackbar visible={snackbarQueue.length > 0} onDismiss={() => setSnackbarQueue((q) => q.slice(1))} duration={3000} icon='trophy-outline'>
        {snackbarQueue[0] ? `Achievement unlocked: ${ACHIEVEMENT_DEFINITIONS_BY_ID[snackbarQueue[0]].title}` : ''}
      </Snackbar>
    </View>
  )
}

const styles = StyleSheet.create({
  appbarSpacer: { flex: 1 },
  flex: { flex: 1 }
})
