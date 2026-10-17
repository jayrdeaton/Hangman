import { CornerActionButtons } from '@tastic/hud/chrome'
import { router, useFocusEffect, useIsFocused } from 'expo-router'
import { type ComponentProps, JSX, useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, Keyboard, StyleSheet, View } from 'react-native'
import { Portal, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector, useStore } from 'react-redux'

import { useActiveGame } from '@/hooks/useActiveGame'
import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { useCatalogActions, useCatalogVersions } from '@/hooks/useCatalog'
import { useGameStats } from '@/hooks/useGameStats'
import { usePackSelection } from '@/hooks/usePackSelection'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { type PlayMode, roundActions, type RoundProgress, type SavedPuzzle } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import type { UnlockedAchievement } from '@/types/stats'
import { alert } from '@/utils/alert'
import { addCustomPuzzle, PNP_QUICK_PACK_LABEL, scoreDifficulty } from '@/utils/customPacks'
import { loadoutHref } from '@/utils/navigation'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { findMode } from '@/utils/puzzleLink'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'
import { isRoundDecided, isRoundPlayable, toGamePayload, toSavedPuzzle } from '@/utils/roundState'
import { getCompletedBuiltInPackKeys, getPuzzleUnlockMap, getUnlockedCountForPack, markPuzzleUnlocked, type PuzzleUnlockMap } from '@/utils/unlocks'
import { gameShell } from '@/utils/webLayout'

import { Game, type LossDetails, type SolveDetails } from './Game'
import { PnpHandoffDialog } from './PnpHandoffDialog'
import { PnpWordPrompt } from './PnpWordPrompt'
import { type CategoryProgress } from './RoundEndDialog'
import { SettingsDialog } from './SettingsDialog'

const randomConfig = (mode: GameMode, difficulty: PuzzleConfig['difficulty']): PuzzleConfig => ({ sourceMode: 'random', difficulty, mode, customPhrase: '', customHint: '' })

// Always succeeds (unlike resolvePuzzle), even on a blank or unscoreable answer - Game needs a
// session to render as the composing screen's own board from the moment authoring starts, not
// just once the word is valid enough to hand off. difficultyTier defaults to 'easy' while blank,
// matching buildCustomPuzzle's own scoring (which returns null, not a real tier, for that case) -
// see PuzzleInfoRow's the-pill-shouldn't-pop-in reasoning, which applies here for the same reason.
const buildPnpDraftSession = (answer: string, mode: GameMode): GameStartPayload => {
  const phrase = normalizePhrase(answer)
  const difficultyTier = phrase.replace(/ /g, '').length > 0 ? scoreDifficulty(phrase).difficultyTier : 'easy'
  return { phrase, mode, sourceMode: 'custom', difficultyTier }
}

type BoardProps = Omit<ComponentProps<typeof Game>, 'initialGuessedLetters' | 'initialHintRevealed' | 'phrase' | 'mode' | 'hint' | 'packLabel' | 'difficultyTier'> & { slot: PlayMode; session: GameStartPayload }

// Game with the saved board it starts from, read from the store once per round: the caller keys this
// on the round id, so a new round remounts it and reads afresh, while guesses landing mid-round (saved
// back through onProgress) never re-render anything above Game.
const SavedBoard = ({ slot, session, ...gameProps }: BoardProps): JSX.Element => {
  const store = useStore<RootState>()
  const [initial] = useState(() => store.getState().round[slot])
  return <Game {...gameProps} initialGuessedLetters={initial.guessedLetters} initialHintRevealed={initial.hintRevealed} phrase={session.phrase} mode={session.mode} hint={session.hint} packLabel={session.packLabel} difficultyTier={session.difficultyTier} />
}

type RoundProps = {
  locked: boolean
  onLeave: () => void
  // True from the moment a round is decided until Next: the result card is coming (after the win's
  // celebration or the loss's short delay), and leaving before it shows would record the round's
  // unlocks with nothing on screen to show them.
  onRoundEnding: (ending: boolean) => void
}

const SoloRound = ({ locked, onLeave, onRoundEnding }: RoundProps): JSX.Element | null => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const puzzle = useSelector((state: RootState) => state.round.solo.puzzle)
  const roundId = useSelector((state: RootState) => state.round.solo.id)
  const { selectedPackKeys, ready: packSelectionReady } = usePackSelection()
  const { mode: defaultMode, difficulty: defaultDifficulty, ready: puzzleDefaultsReady } = usePuzzleDefaults()
  const { recordSoloRound } = useGameStats()
  const { refreshUnlocks } = useCatalogActions()
  const { unlockVersion } = useCatalogVersions()
  // A ref, not state: nothing renders off it, it just has to be current when the next puzzle is drawn.
  const unlockMapRef = useRef<PuzzleUnlockMap>({})
  const [unlocksLoaded, setUnlocksLoaded] = useState(false)
  // What the round just unlocked, and the pack's progress on a win, shown on the round-end card.
  // Both cleared at the top of each solve and loss, so a fresh round never shows the previous one's.
  const [roundUnlocks, setRoundUnlocks] = useState<UnlockedAchievement[]>([])
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress | null>(null)

  useEffect(() => {
    let mounted = true
    void getPuzzleUnlockMap().then((map) => {
      if (!mounted) return
      unlockMapRef.current = map
      setUnlocksLoaded(true)
    })
    return () => {
      mounted = false
    }
  }, [unlockVersion])

  // The next puzzle after `previous`: from the same pack when the player was playing one pack (a
  // pack's quick start, its own Random, a puzzle picked from its list), otherwise from the whole pack
  // selection, which is read live so a pack switched off in Choose Packs already applies.
  const drawNext = useCallback(
    (previous: SavedPuzzle | null): boolean => {
      const packKeys = previous?.sourceMode === 'random' && previous.packScope === 'single' && previous.packKey ? [previous.packKey] : selectedPackKeys
      const result = resolvePuzzle(randomConfig(defaultMode, defaultDifficulty), packKeys, unlockMapRef.current)
      if (!result.ok) {
        void alert('No Puzzles Available', result.error)
        return false
      }
      dispatch(roundActions.startSolo(toSavedPuzzle(result.payload)))
      return true
    },
    [selectedPackKeys, defaultMode, defaultDifficulty, dispatch]
  )

  // Once per mount: arriving with nothing to play (a round that ended while the app was closed, or a
  // web reload of /game with nothing saved) draws the next puzzle, as Next would have. Judged on the
  // round as it was at mount, not when the saved preferences finish loading: a round that's playable
  // at mount is the player's to finish, and one won in the moments before that load must keep its
  // result card. Never again after that, for the same reason.
  const [arrivedPlayable] = useState(() => isRoundPlayable(store.getState().round.solo))
  const checkedRef = useRef(false)
  useEffect(() => {
    if (arrivedPlayable || checkedRef.current || !packSelectionReady || !puzzleDefaultsReady || !unlocksLoaded) return
    checkedRef.current = true
    if (!drawNext(store.getState().round.solo.puzzle)) onLeave()
  }, [arrivedPlayable, packSelectionReady, puzzleDefaultsReady, unlocksLoaded, store, drawNext, onLeave])

  const handleProgress = useCallback((progress: RoundProgress) => dispatch(roundActions.saveSoloProgress(progress)), [dispatch])

  const handleSolved = useCallback(
    async (details: SolveDetails) => {
      onRoundEnding(true)
      // Cleared here (synchronously, before the first await below) so it's batched with the Game's own
      // setOutcome('win') and never paints the previous round's stats while this one's lookup runs.
      setCategoryProgress(null)
      setRoundUnlocks([])
      const solved = store.getState().round.solo.puzzle
      // Read after this puzzle is marked, so the pack totals (and the completed-pack count the
      // Collection Complete family reads) already include it.
      if (solved?.packKey && solved.puzzleId) {
        const unlocked = await markPuzzleUnlocked(solved.packKey, solved.puzzleId)
        if (unlocked) refreshUnlocks()
      }
      const unlockMap = await getPuzzleUnlockMap()
      // So the very next round already knows this puzzle is no longer unsolved.
      unlockMapRef.current = unlockMap
      if (solved?.packKey && solved.packLabel) {
        const packTotalCount = getPuzzleManifest().find((item) => item.key === solved.packKey)?.count
        if (packTotalCount) setCategoryProgress({ label: solved.packLabel, unlockedCount: getUnlockedCountForPack(unlockMap, solved.packKey), totalCount: packTotalCount })
      }
      const solvedMode = solved ? findMode(solved.modeId) : null
      // Recording is synchronous and lands well within WIN_DIALOG_DELAY_MS (see Game.tsx), so the
      // unlocks are already there when the round-end card opens.
      setRoundUnlocks(
        recordSoloRound({
          result: 'win',
          // A hidden mode (reachable only through a shared link) doesn't count toward the mode family.
          modeId: solvedMode && !solvedMode.hidden ? solvedMode.id : undefined,
          wrongGuesses: details.wrongGuesses,
          guessCount: details.guessCount,
          // The same rule as the board's Hint pill (PuzzleInfoRow's hasHintContent): offered whenever
          // there's a pack label or a hint behind it, so a win that never opened it counts.
          hintAvailable: Boolean(solved?.hint || solved?.packLabel),
          hintRevealed: details.hintRevealed,
          completedPackKeys: getCompletedBuiltInPackKeys(unlockMap)
        })
      )
    },
    [store, refreshUnlocks, recordSoloRound, onRoundEnding]
  )

  const handleLost = useCallback(
    (details: LossDetails) => {
      onRoundEnding(true)
      setRoundUnlocks([])
      setRoundUnlocks(recordSoloRound({ result: 'loss', wrongGuesses: details.wrongGuesses, guessCount: details.guessCount }))
    },
    [recordSoloRound, onRoundEnding]
  )

  // Next. A shared-link puzzle is one-off, with no "next" word to draw, so it leaves for the loadout
  // to pick what's next instead of silently replaying the same phrase.
  const handleRoundEnd = useCallback(() => {
    onRoundEnding(false)
    const { puzzle: finished } = store.getState().round.solo
    if (finished?.sourceMode === 'custom') {
      dispatch(roundActions.clearSolo())
      onLeave()
      return
    }
    if (!drawNext(finished)) onLeave()
  }, [store, dispatch, drawNext, onLeave, onRoundEnding])

  if (!puzzle) return null
  return <SavedBoard key={roundId} slot='solo' session={toGamePayload(puzzle)} onStop={handleRoundEnd} onSolved={handleSolved} onLost={handleLost} onProgress={handleProgress} categoryProgress={categoryProgress} unlockedAchievements={roundUnlocks} locked={locked} />
}

type PnpRoundProps = RoundProps & { promptsVisible: boolean }

// Pass and play: the author types a word over the real board (drawn live from what's typed), hands
// the device over, and the guesser plays it. Then the guesser becomes the next author, for as long as
// they like. Game mounts once when composing begins and stays mounted, unchanged, all the way through
// play: the prompt and the hand-off card just float over it. A swap between two differently-built
// trees at Hand off is what caused the flicker this used to have.
const PnpRound = ({ locked, promptsVisible, onLeave, onRoundEnding }: PnpRoundProps): JSX.Element | null => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const phase = useSelector((state: RootState) => state.round.pnp.phase)
  const puzzle = useSelector((state: RootState) => state.round.pnp.puzzle)
  const roundId = useSelector((state: RootState) => state.round.pnp.id)
  const { mode: defaultMode } = usePuzzleDefaults()
  const { autoSave } = useAutoSaveCustom()
  const { recordPnpRound } = useGameStats()
  const { refreshCustomPacks } = useCatalogActions()
  // The word being typed, also saved as the round's draft (read back once here), so closing the prompt
  // or the app mid-composing doesn't throw it away.
  const [answer, setAnswer] = useState(() => store.getState().round.pnp.draft?.answer ?? '')
  const [hint, setHint] = useState(() => store.getState().round.pnp.draft?.hint ?? '')
  const handleAnswerChange = useCallback(
    (next: string) => {
      setAnswer(next)
      dispatch(roundActions.setPnpDraft({ answer: next, hint }))
    },
    [dispatch, hint]
  )
  const handleHintChange = useCallback(
    (next: string) => {
      setHint(next)
      dispatch(roundActions.setPnpDraft({ answer, hint: next }))
    },
    [dispatch, answer]
  )
  const [roundUnlocks, setRoundUnlocks] = useState<UnlockedAchievement[]>([])

  // Once per mount: nothing running yet, a round that ended while the app was closed, or a word that
  // went missing starts at a blank prompt. Otherwise the saved beat comes back: the hand-off card, or
  // the round mid-guess.
  useEffect(() => {
    const pnp = store.getState().round.pnp
    if (pnp.phase === null || (pnp.phase !== 'authoring' && (!pnp.puzzle || isRoundDecided(pnp)))) dispatch(roundActions.startPnpAuthoring())
  }, [store, dispatch])

  const handleProgress = useCallback((progress: RoundProgress) => dispatch(roundActions.savePnpProgress(progress)), [dispatch])

  // A pass-and-play round is a contest between two people on one device, not progress against the
  // catalog: no unlocks, and its own Pass & Play record, separate from every solo stat (see
  // statsEngine's applyPnpRound), so a friend's word can't inflate the solve count or break a streak.
  const handleSolved = useCallback(
    (details: SolveDetails) => {
      onRoundEnding(true)
      setRoundUnlocks([])
      setRoundUnlocks(recordPnpRound('win', details.wrongGuesses))
    },
    [recordPnpRound, onRoundEnding]
  )
  const handleLost = useCallback(
    (details: LossDetails) => {
      onRoundEnding(true)
      setRoundUnlocks([])
      setRoundUnlocks(recordPnpRound('loss', details.wrongGuesses))
    },
    [recordPnpRound, onRoundEnding]
  )

  const handleRoundEnd = useCallback(() => {
    onRoundEnding(false)
    setAnswer('')
    setHint('')
    dispatch(roundActions.startPnpAuthoring())
  }, [dispatch, onRoundEnding])

  const handlePnpAuthored = useCallback(() => {
    // Goes through the same resolver every other custom word uses, so normalization and what counts
    // as a valid word can't drift. The art is the player's current pick.
    const result = resolvePuzzle({ sourceMode: 'custom', difficulty: 'any', mode: defaultMode, customPhrase: answer, customHint: hint }, [])
    if (!result.ok) {
      void alert('Invalid Word', result.error)
      return
    }
    dispatch(roundActions.setPnpWord(toSavedPuzzle(result.payload)))
    // Opt-in, off by default (see useAutoSaveCustom). Fire-and-forget so handing over isn't blocked
    // on a storage write.
    if (autoSave) void addCustomPuzzle({ answer, hint: hint || undefined }, PNP_QUICK_PACK_LABEL).then(refreshCustomPacks)
  }, [defaultMode, answer, hint, autoSave, refreshCustomPacks, dispatch])

  const handleReady = useCallback(() => dispatch(roundActions.startPnpPlaying()), [dispatch])

  // The live draft while composing (so the board reflects the word as it's typed), the real word after.
  const session = phase === 'authoring' ? buildPnpDraftSession(answer, defaultMode) : puzzle ? toGamePayload(puzzle) : null

  return (
    <>
      {/* Locked while composing and during the hand-off, so nothing about the round can be touched by
          tap or physical keyboard before play actually starts. */}
      {session && phase ? <SavedBoard key={roundId} slot='pnp' session={session} onStop={handleRoundEnd} onSolved={handleSolved} onLost={handleLost} onProgress={handleProgress} unlockedAchievements={roundUnlocks} locked={locked || phase !== 'playing'} /> : null}
      {phase === 'authoring' ? <PnpWordPrompt answer={answer} hint={hint} onAnswerChange={handleAnswerChange} onHintChange={handleHintChange} promptVisible={promptsVisible} onClose={onLeave} onSubmit={handlePnpAuthored} /> : null}
      {phase === 'handoff' ? <PnpHandoffDialog visible={promptsVisible} onReady={handleReady} /> : null}
    </>
  )
}

export type GameScreenProps = { mode: PlayMode }

// The /game route: the board for one play mode, with the fleet's corners (back to that mode's
// loadout top-left, the Settings cog top-right).
//
// Whatever is on the board lives in the round slice, saved on every guess, so leaving keeps the round
// for later: the loadout offers Continue, and a relaunch while this screen was open comes straight
// back here (see useActiveGame). Starting a different puzzle over a round with guesses on it is what
// counts as abandoning it (see useStartSolo).
export const GameScreen = ({ mode }: GameScreenProps): JSX.Element => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const focused = useIsFocused()
  const store = useStore<RootState>()
  const { markActive, clearActive } = useActiveGame()
  const { refreshUnlocks } = useCatalogActions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // See RoundProps' onRoundEnding. A ref: it only gates leave(), nothing renders off it.
  const roundEndingRef = useRef(false)
  const handleRoundEnding = useCallback((ending: boolean) => {
    roundEndingRef.current = ending
  }, [])

  // dismissTo pops back to the loadout already beneath this screen, or replaces this screen with it
  // when there's none (a resumed game, a share link opened cold). Held off between a round's end and
  // its result card (at most the win's 2s celebration), so the card and its unlocks are always seen.
  const leave = useCallback(() => {
    if (roundEndingRef.current) return
    Keyboard.dismiss()
    clearActive()
    router.dismissTo(loadoutHref(mode))
  }, [clearActive, mode])

  // Android's back button does what the back corner does, even with nothing beneath this screen in
  // the stack (where the navigator would otherwise close the app). The result card, the Pass & Play
  // prompt and the Settings sheet register their own handlers when they open, after this one, so
  // theirs run first. The one overlay that can already be up when this registers is a resumed Pass &
  // Play hand-off card, which swallows back on purpose (Ready is the only way on), so this steps aside
  // for it.
  //
  // Losing focus also clears the active game: however the player got off this screen (the back corner,
  // or the browser's own back button on the web, which never calls leave()), a later launch shouldn't
  // drop them back in. An app that's killed or backgrounded never blurs, so a real resume survives.
  useFocusEffect(
    useCallback(() => {
      markActive(mode)
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (mode === 'pnp' && store.getState().round.pnp.phase === 'handoff') return false
        leave()
        return true
      })
      return () => {
        subscription.remove()
        clearActive()
      }
    }, [markActive, clearActive, mode, leave, store])
  )

  // Dismisses the software keyboard first: the sheet covers the Pass & Play prompt's text field, which
  // would otherwise keep the keyboard up behind it.
  const handleOpenSettings = useCallback(() => {
    Keyboard.dismiss()
    setSettingsOpen(true)
  }, [])
  const handleDismissSettings = useCallback(() => setSettingsOpen(false), [])

  // Locked while Settings is up, and while this screen isn't the one showing: the web keeps a screen
  // mounted after it's left, and Game's keyboard listener is on the window, so a letter typed anywhere
  // else would otherwise guess in this round.
  const locked = !focused || settingsOpen

  return (
    // This screen's own Portal host, so the result card, the fireworks, the prompt and the hand-off
    // stay with this screen instead of floating over whichever screen is in front of it.
    <Portal.Host>
      <View style={styles.flex}>
        {/* paddingTop matches the floating corner buttons below rather than reserving a whole extra
            header row for them: the game's own top row (PuzzleInfoRow's pills) shares that band. */}
        <View style={[styles.flex, gameShell, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>{mode === 'pnp' ? <PnpRound locked={locked} promptsVisible={focused && !settingsOpen} onLeave={leave} onRoundEnding={handleRoundEnding} /> : <SoloRound locked={locked} onLeave={leave} onRoundEnding={handleRoundEnding} />}</View>

        {/* The fleet's plain-glyph corners, in the board's own onSurface ink like marker on the board.
            pointerEvents='box-none' lets taps in the empty middle fall through to PuzzleInfoRow's
            pills between them. hitSlop={4} makes each a 48pt target; the pills sit 8pt from the
            buttons' boxes, so 4pt of clearance is left (see hud's CLAUDE.md on CornerActionButtons). */}
        <View style={[StyleSheet.absoluteFill, styles.corners]} pointerEvents='box-none'>
          <CornerActionButtons onBack={leave} onSettings={handleOpenSettings} fg={theme.colors.onSurface} insets={insets} hitSlop={4} />
        </View>

        <SettingsDialog visible={settingsOpen} onDismiss={handleDismissSettings} onUnlocksChanged={refreshUnlocks} />
      </View>
    </Portal.Host>
  )
}

const styles = StyleSheet.create({
  corners: { zIndex: 10 },
  flex: { flex: 1 }
})
