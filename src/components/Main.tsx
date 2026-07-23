import * as Linking from 'expo-linking'
import { JSX, useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Appbar, Snackbar } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { DEFAULT_MODE } from '@/modes/registry'
import type { GameStartPayload } from '@/types/gameSession'
import { ACHIEVEMENT_DEFINITIONS_BY_ID, type AchievementId, recordLoss, recordSolve } from '@/utils/achievements'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { parseSharedPuzzle } from '@/utils/puzzleLink'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'
import { getPuzzleUnlockMap, getUnlockedCountForPack, markPuzzleUnlocked } from '@/utils/unlocks'
import { gameShell } from '@/utils/webLayout'

import { AchievementsDialog } from './AchievementsDialog'
import { Game, type SolveDetails } from './Game'
import { PuzzleDrawer } from './PuzzleDrawer'
import { SettingsDialog } from './SettingsDialog'

const DEFAULT_CONFIG: PuzzleConfig = {
  sourceMode: 'random',
  difficulty: 'any',
  packKey: '',
  mode: DEFAULT_MODE,
  customPhrase: '',
  customHint: ''
}

// First pack in the manifest — the initial config needs a real key to fall back on if the player
// switches to Category mode without picking one explicitly.
const buildInitialConfig = (): PuzzleConfig => ({ ...DEFAULT_CONFIG, packKey: getPuzzleManifest().filter((item) => item.count > 0)[0]?.key ?? '' })

export const Main = (): JSX.Element => {
  const insets = useSafeAreaInsets()
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
    return shared ?? buildInitialConfig()
  })
  const [session, setSession] = useState<GameStartPayload | null>(() => {
    const result = resolvePuzzle(config)
    return result.ok ? result.payload : null
  })
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [achievementsVisible, setAchievementsVisible] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [unlockVersion, setUnlockVersion] = useState(0)
  // A share link opened while the app is already running shouldn't silently replace whatever's in
  // progress — it prefills the drawer instead, same "explicit confirm" rule the drawer's own New
  // Puzzle button follows. Distinct from `config`, which only ever reflects the last CONFIRMED
  // puzzle, so dismissing without confirming leaves the active game untouched.
  const [pendingShare, setPendingShare] = useState<PuzzleConfig | null>(null)
  const [handledUrl, setHandledUrl] = useState(incomingUrl)
  const [snackbarQueue, setSnackbarQueue] = useState<AchievementId[]>([])
  const pendingAchievementsRef = useRef<AchievementId[]>([])

  // Native caches the cold-start URL in a singleton that only resets via this call (unlike web,
  // which always re-reads the live window location) — clearing it once consumed means a later
  // remount (Fast Refresh, a future error boundary) can't replay the same puzzle as if it were new.
  useEffect(() => {
    Linking.clearInitialURL()
  }, [])

  const refreshUnlocks = useCallback(() => setUnlockVersion((v) => v + 1), [])

  const handleConfirmPuzzle = useCallback((payload: GameStartPayload, nextConfig: PuzzleConfig) => {
    setSession(payload)
    setConfig(nextConfig)
    setDrawerVisible(false)
    setPendingShare(null)
  }, [])

  const handleDismissDrawer = useCallback(() => {
    setDrawerVisible(false)
    setPendingShare(null)
  }, [])

  const handleSolved = useCallback(
    async (details: SolveDetails) => {
      let packUnlockedCount: number | undefined
      let packTotalCount: number | undefined

      if (session?.packKey && session.puzzleId) {
        const unlocked = await markPuzzleUnlocked(session.packKey, session.puzzleId)
        const unlockMap = await getPuzzleUnlockMap()
        packUnlockedCount = getUnlockedCountForPack(unlockMap, session.packKey)
        packTotalCount = getPuzzleManifest().find((item) => item.key === session.packKey)?.count
        if (unlocked) refreshUnlocks()
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

  const handleRoundEnd = useCallback(() => {
    if (pendingAchievementsRef.current.length > 0) {
      setSnackbarQueue(pendingAchievementsRef.current)
      pendingAchievementsRef.current = []
    }
    // A custom word is one-off — there's no "next" word to auto-generate, so surface the drawer
    // to ask for a new one instead of silently replaying the same phrase.
    if (config.sourceMode === 'custom') {
      setDrawerVisible(true)
      return
    }
    const result = resolvePuzzle(config)
    if (result.ok) setSession(result.payload)
  }, [config])

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
        <Appbar.Action icon='menu' onPress={() => setDrawerVisible(true)} accessibilityLabel='Change puzzle' />
        <Appbar.Content title='Hangman' />
        <Appbar.Action icon='trophy-outline' onPress={() => setAchievementsVisible(true)} accessibilityLabel='Achievements' />
        <Appbar.Action icon='cog-outline' onPress={() => setSettingsVisible(true)} accessibilityLabel='Settings' />
      </Appbar.Header>

      <View style={[styles.flex, gameShell, { paddingBottom: insets.bottom }]}>{session ? <Game key={session.phrase} onStop={handleRoundEnd} onSolved={handleSolved} onLost={handleLost} phrase={session.phrase} mode={session.mode} hint={session.hint} /> : null}</View>

      <PuzzleDrawer visible={drawerVisible} onDismiss={handleDismissDrawer} onRequestOpen={() => setDrawerVisible(true)} initialConfig={pendingShare ?? config} onConfirm={handleConfirmPuzzle} />
      <AchievementsDialog visible={achievementsVisible} onDismiss={() => setAchievementsVisible(false)} unlockVersion={unlockVersion} />
      <SettingsDialog visible={settingsVisible} onDismiss={() => setSettingsVisible(false)} onUnlocksChanged={refreshUnlocks} />
      <Snackbar visible={snackbarQueue.length > 0} onDismiss={() => setSnackbarQueue((q) => q.slice(1))} duration={3000} icon='trophy-outline'>
        {snackbarQueue[0] ? `Achievement unlocked: ${ACHIEVEMENT_DEFINITIONS_BY_ID[snackbarQueue[0]].title}` : ''}
      </Snackbar>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 }
})
