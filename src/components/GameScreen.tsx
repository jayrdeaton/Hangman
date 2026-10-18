import { CornerActionButtons } from '@tastic/hud/chrome'
import { router, useFocusEffect, useIsFocused } from 'expo-router'
import { type ComponentProps, JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, Keyboard, StyleSheet, View } from 'react-native'
import { Portal, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector, useStore } from 'react-redux'

import { useActiveGame } from '@/hooks/useActiveGame'
import { useActivePlayer } from '@/hooks/useActivePlayer'
import { useAutoSaveCustom } from '@/hooks/useAutoSaveCustom'
import { useCatalogActions } from '@/hooks/useCatalog'
import { type PnpRoundUnlocks, useGameStats } from '@/hooks/useGameStats'
import { usePackSelection } from '@/hooks/usePackSelection'
import { useActiveProfile, useProfiles, useProfilesActions } from '@/hooks/useProfiles'
import { usePuzzleDefaults } from '@/hooks/usePuzzleDefaults'
import { usePuzzleUnlocks } from '@/hooks/usePuzzleUnlocks'
import { DEFAULT_PLAYER_SETTINGS } from '@/redux/playerSettingsSlice'
import { type PlayMode, roundActions, type RoundProgress, type SavedPuzzle, type SavedRound, selectSoloRound } from '@/redux/roundSlice'
import type { RootState } from '@/redux/store'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import type { UnlockedAchievement } from '@/types/stats'
import { alert } from '@/utils/alert'
import { addCustomPuzzle, PNP_QUICK_PACK_LABEL, scoreDifficulty } from '@/utils/customPacks'
import { loadoutHref } from '@/utils/navigation'
import { normalizePhrase } from '@/utils/normalizePhrase'
import { arePlayerColorsShown, getSeatPlayer, getSeatPlayerKey, getTurnPlayer, getTurnPlayerKey, isPackTurnUnderWay } from '@/utils/packTurns'
import { GUEST_PLAYER_KEY, type PlayerKey, playerKeyFor, type PlayerRef } from '@/utils/players'
import { getSeatIdentity, getStandingRows, packTurnRoundKey, pickNextTurn } from '@/utils/pnpSession'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { findMode } from '@/utils/puzzleLink'
import { type PuzzleConfig, resolvePuzzle } from '@/utils/puzzlePicker'
import { isRoundDecided, isRoundPlayable, toGamePayload, toSavedPuzzle } from '@/utils/roundState'
import { getCompletedBuiltInPackKeys, getPuzzleUnlockMap, getUnlockedCountForPack, markPuzzleUnlocked } from '@/utils/unlocks'
import { gameShell } from '@/utils/webLayout'

import { Game, type LossDetails, type SolveDetails } from './Game'
import { PnpHandoffDialog } from './PnpHandoffDialog'
import { PnpSessionEndDialog } from './PnpSessionEndDialog'
import { PnpWordPrompt } from './PnpWordPrompt'
import { type CategoryProgress, type PnpRoundSummary, type RoundUnlocks } from './RoundEndDialog'
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

const readPnpRound = (state: RootState): SavedRound => state.round.pnp

// Whether `player` is the one playing now (by key: a profile, a guest seat's guest, or Single Player's
// guest). Read from the store as an effect runs, so a switch made elsewhere a moment before counts.
const isActivePlayer = (state: RootState, player: PlayerRef): boolean => playerKeyFor(state.activePlayer.profileId, state.activePlayer.seatId) === playerKeyFor(player.profileId, player.seatId)

type BoardProps = Omit<ComponentProps<typeof Game>, 'initialGuessedLetters' | 'initialHintRevealed' | 'phrase' | 'mode' | 'hint' | 'packLabel' | 'difficultyTier'> & { readSaved: (state: RootState) => SavedRound; session: GameStartPayload }

// Game with the saved board it starts from, read from the store once per round: the caller keys this
// on the round (the solo one on its player too), so a new round remounts it and reads afresh, while
// guesses landing mid-round (saved back through onProgress) never re-render anything above Game.
const SavedBoard = ({ readSaved, session, ...gameProps }: BoardProps): JSX.Element => {
  const store = useStore<RootState>()
  const [initial] = useState(() => readSaved(store.getState()))
  return <Game {...gameProps} initialGuessedLetters={initial.guessedLetters} initialHintRevealed={initial.hintRevealed} phrase={session.phrase} mode={session.mode} hint={session.hint} packLabel={session.packLabel} difficultyTier={session.difficultyTier} />
}

type RoundProps = {
  locked: boolean
  onLeave: () => void
  // True from the moment a round is decided until Next: the result card is coming (after the win's
  // celebration or the loss's short delay), and leaving before it shows would record the round's
  // unlocks with nothing on screen to show them.
  onRoundEnding: (ending: boolean) => void
  // Whether the screen is on its way out, or no longer the one showing (leave() has run, or it lost
  // focus, since it was last shown): nothing is drawn onto a board nobody will see. The Pass & Play
  // loadout makes its own focused seat the active player again the moment it's shown, which remounts
  // the solo board here for them while this screen is still on its way out.
  isLeaving: () => boolean
}

// A pack turn's part of the solo board (see PackTurnRound; off for any other solo round): the round
// counted for the turn's seat the moment it's decided, and the result card's session pieces, as a
// written word's card has them (who played it, the standings with their row in bold, who's up next,
// End Session and its standings card). The board remounts for every turn, so this starts over with it.
const usePackTurnCard = (enabled: boolean, onLeave: () => void, onRoundEnding: (ending: boolean) => void) => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const players = useSelector((state: RootState) => state.round.pnp.session.players)
  const standings = useSelector((state: RootState) => state.round.pnp.session.standings)
  const profiles = useProfiles()
  // The turn's seat as its round was decided: the card names them, and who's up next after them.
  const [decidedSeatId, setDecidedSeatId] = useState<string | null>(null)
  // End Session's standings card. Never saved: a relaunch with it up comes back to the session.
  const [sessionEndOpen, setSessionEndOpen] = useState(false)

  // Into the session's standings for the turn's seat, once (recordPackTurn ignores a turn already
  // counted). The stats are the solo round's own (SoloRound records it as the player's solo round, and
  // never as a Pass & Play one). Returns whether this very round was counted already: its end reported
  // again after a relaunch that came between the count and its last guess being saved, which records
  // nothing again, the stats included (a written word's round does the same).
  const recordTurn = useCallback(
    (playerKey: PlayerKey, roundId: number, result: 'win' | 'loss'): boolean => {
      const { turnId, recordedTurnRound } = store.getState().round.pnp.session
      if (!enabled || !turnId) return false
      setDecidedSeatId(turnId)
      if (recordedTurnRound === packTurnRoundKey(playerKey, roundId)) return true
      dispatch(roundActions.recordPackTurn({ playerKey, roundId, result }))
      return false
    },
    [enabled, store, dispatch]
  )
  const clearDecided = useCallback(() => setDecidedSeatId(null), [])

  const standingRows = useMemo(() => getStandingRows({ players, standings }, profiles), [players, standings, profiles])
  // The next turn is the fair pick after this one's seat, the same pick Next makes (startPackTurn).
  const summary = useMemo((): PnpRoundSummary | null => {
    if (!decidedSeatId) return null
    const played = getSeatIdentity(players, decidedSeatId, profiles)
    const next = getSeatIdentity(players, pickNextTurn({ players, standings, turnId: decidedSeatId }), profiles)
    return { playerId: decidedSeatId, playerName: played.name, playerProfile: played.profile, nextName: next.name, nextProfile: next.profile, standings: standingRows }
  }, [decidedSeatId, players, standings, profiles, standingRows])

  // End Session swaps the result card for the standings card, and Keep Playing (or Android back) swaps
  // them back; Done clears the standings and the turn (the table kept) and leaves for the Pass & Play
  // loadout, as a written word's card does.
  const openSessionEnd = useCallback(() => setSessionEndOpen(true), [])
  const keepPlaying = useCallback(() => setSessionEndOpen(false), [])
  const endSession = useCallback(() => {
    setSessionEndOpen(false)
    onRoundEnding(false)
    dispatch(roundActions.endPnpSession())
    onLeave()
  }, [dispatch, onLeave, onRoundEnding])

  return { recordTurn, clearDecided, summary, standingRows, sessionEndOpen, openSessionEnd, keepPlaying, endSession }
}

type SoloRoundProps = RoundProps & {
  // A pack turn at the Pass & Play table (see PackTurnRound): drawn from the player's whole pack
  // selection, counted for the turn's seat, with the session on its card, and Next starting the next
  // turn.
  packTurn?: boolean
}

// The active player's solo round. ActivePlayerSoloRound (or PackTurnRound) keys this on the player, so
// every hook below (and every stat and unlock it records) belongs to that one player for as long as
// it's mounted, and a change of player starts over with the new player's waiting round, judged as on
// arrival below.
const SoloRound = ({ locked, onLeave, onRoundEnding, isLeaving, packTurn = false }: SoloRoundProps): JSX.Element | null => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  // The round's owner: whose slot it is, whose stats it counts toward and whose puzzles it unlocks.
  const { key: playerKey, profileId } = useActivePlayer()
  // Their profile, so the result card can name whose unlocks it shows (null for the guest).
  const owner = useActiveProfile()
  const readSaved = useCallback((state: RootState) => selectSoloRound(state.round, playerKey), [playerKey])
  const puzzle = useSelector((state: RootState) => readSaved(state).puzzle)
  const roundId = useSelector((state: RootState) => readSaved(state).id)
  const { selectedPackKeys } = usePackSelection()
  const { mode: defaultMode, difficulty: defaultDifficulty } = usePuzzleDefaults()
  const { recordSoloRound } = useGameStats()
  const { refreshUnlocks } = useCatalogActions()
  const { unlockMap, loaded: unlocksLoaded } = usePuzzleUnlocks()
  // Mirrored into a ref: nothing renders off it, it just has to be current when the next puzzle is
  // drawn. A win also writes it directly (handleSolved), a beat before the re-read lands.
  const unlockMapRef = useRef(unlockMap)
  useEffect(() => {
    unlockMapRef.current = unlockMap
  }, [unlockMap])
  // What the round just unlocked, and the pack's progress on a win, shown on the round-end card.
  // Both cleared at the top of each solve and loss, so a fresh round never shows the previous one's.
  const [roundUnlocks, setRoundUnlocks] = useState<UnlockedAchievement[]>([])
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress | null>(null)
  const unlocks = useMemo((): RoundUnlocks[] => [{ owner, achievements: roundUnlocks }], [owner, roundUnlocks])
  const turn = usePackTurnCard(packTurn, onLeave, onRoundEnding)
  const { recordTurn, clearDecided } = turn

  // The next puzzle after `previous`: from the same pack when the player was playing one pack (a
  // pack's quick start, its own Random, a puzzle picked from its list), otherwise from the whole pack
  // selection, which is read live so a pack switched off in Choose Packs already applies. A pack turn
  // always draws from the whole selection: the turn is the player's packs, not one left over from a
  // round of their own.
  const drawNext = useCallback(
    (previous: SavedPuzzle | null): boolean => {
      const packKeys = !packTurn && previous?.sourceMode === 'random' && previous.packScope === 'single' && previous.packKey ? [previous.packKey] : selectedPackKeys
      const result = resolvePuzzle(randomConfig(defaultMode, defaultDifficulty), packKeys, unlockMapRef.current)
      if (!result.ok) {
        void alert('No Puzzles Available', result.error)
        return false
      }
      dispatch(roundActions.startSolo({ playerKey, puzzle: toSavedPuzzle(result.payload) }))
      return true
    },
    [packTurn, selectedPackKeys, defaultMode, defaultDifficulty, dispatch, playerKey]
  )

  // Once per mount: arriving with nothing to play (a round that ended while the app was closed, a web
  // reload of /game with nothing saved, or a player with no round waiting) draws the next puzzle, as
  // Next would have. Judged on the round as it was at mount, not when the player's unlocked puzzles
  // finish loading: a round that's playable at mount is the player's to finish, and one won in the
  // moments before that load must keep its result card. Never again after that, for the same reason.
  // Nor while the screen is leaving or out of sight (see isLeaving): the Pass & Play loadout making its
  // focused seat the active player as the player goes back to it remounts this for them, and they
  // shouldn't find a puzzle waiting there that they never saw.
  const [arrivedPlayable] = useState(() => isRoundPlayable(readSaved(store.getState())))
  const checkedRef = useRef(false)
  useEffect(() => {
    if (arrivedPlayable || checkedRef.current || !unlocksLoaded) return
    checkedRef.current = true
    if (isLeaving()) return
    if (!drawNext(readSaved(store.getState()).puzzle)) onLeave()
  }, [arrivedPlayable, unlocksLoaded, store, readSaved, drawNext, onLeave, isLeaving])

  const handleProgress = useCallback((progress: RoundProgress) => dispatch(roundActions.saveSoloProgress({ playerKey, ...progress })), [dispatch, playerKey])

  const handleSolved = useCallback(
    async (details: SolveDetails) => {
      onRoundEnding(true)
      // Cleared here (synchronously, before the first await below) so it's batched with the Game's own
      // setOutcome('win') and never paints the previous round's stats while this one's lookup runs.
      setCategoryProgress(null)
      setRoundUnlocks([])
      const { puzzle: solved, id: solvedId } = readSaved(store.getState())
      const counted = recordTurn(playerKey, solvedId, 'win')
      // Read after this puzzle is marked, so the pack totals (and the completed-pack count the
      // Collection Complete family reads) already include it. Both are the winner's own.
      if (solved?.packKey && solved.puzzleId) {
        const unlocked = await markPuzzleUnlocked(playerKey, solved.packKey, solved.puzzleId)
        if (unlocked) refreshUnlocks()
      }
      const unlockMap = await getPuzzleUnlockMap(playerKey)
      // So the very next round already knows this puzzle is no longer unsolved.
      unlockMapRef.current = unlockMap
      if (solved?.packKey && solved.packLabel) {
        const packTotalCount = getPuzzleManifest().find((item) => item.key === solved.packKey)?.count
        if (packTotalCount) setCategoryProgress({ label: solved.packLabel, unlockedCount: getUnlockedCountForPack(unlockMap, solved.packKey), totalCount: packTotalCount })
      }
      const solvedMode = solved ? findMode(solved.modeId) : null
      if (counted) return
      // Recording is synchronous and lands well within WIN_DIALOG_DELAY_MS (see Game.tsx), so the
      // unlocks are already there when the round-end card opens.
      setRoundUnlocks(
        recordSoloRound(
          {
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
          },
          profileId
        )
      )
    },
    [store, readSaved, playerKey, profileId, refreshUnlocks, recordSoloRound, onRoundEnding, recordTurn]
  )

  const handleLost = useCallback(
    (details: LossDetails) => {
      onRoundEnding(true)
      setRoundUnlocks([])
      if (recordTurn(playerKey, readSaved(store.getState()).id, 'loss')) return
      setRoundUnlocks(recordSoloRound({ result: 'loss', wrongGuesses: details.wrongGuesses, guessCount: details.guessCount }, profileId))
    },
    [store, readSaved, playerKey, recordSoloRound, profileId, onRoundEnding, recordTurn]
  )

  // Next. A shared-link puzzle is one-off, with no "next" word to draw, so it leaves for the loadout
  // to pick what's next instead of silently replaying the same phrase. A pack turn's Next starts the
  // next turn (the fair pick), never the same seat's, so always another player (each guest seat is a
  // player of its own), whose board PackTurnRound puts up, any puzzle included.
  const handleRoundEnd = useCallback(() => {
    onRoundEnding(false)
    const { puzzle: finished } = readSaved(store.getState())
    if (packTurn) {
      clearDecided()
      dispatch(roundActions.startPackTurn())
      return
    }
    if (finished?.sourceMode === 'custom') {
      dispatch(roundActions.clearSolo(playerKey))
      onLeave()
      return
    }
    if (!drawNext(finished)) onLeave()
  }, [store, readSaved, packTurn, clearDecided, dispatch, playerKey, drawNext, onLeave, onRoundEnding])

  if (!puzzle) return null
  // Keyed on the player as well as the round: round ids only differ within one player's slot.
  return (
    <>
      <SavedBoard key={`${playerKey}:${roundId}`} readSaved={readSaved} session={toGamePayload(puzzle)} onStop={handleRoundEnd} onSolved={handleSolved} onLost={handleLost} onProgress={handleProgress} categoryProgress={categoryProgress} unlocks={unlocks} passAndPlay={turn.summary} onEndSession={packTurn ? turn.openSessionEnd : undefined} roundCardHidden={turn.sessionEndOpen} locked={locked} />
      {packTurn ? <PnpSessionEndDialog visible={turn.sessionEndOpen} standings={turn.standingRows} onDone={turn.endSession} onKeepPlaying={turn.keepPlaying} /> : null}
    </>
  )
}

// A new SoloRound for every player: a change of player (a profile forgotten mid-round, which hands the
// device to the guest) remounts it with that player's round. Only the solo board reads the player.
const ActivePlayerSoloRound = (props: RoundProps): JSX.Element => {
  const { key } = useActivePlayer()
  return <SoloRound key={key} {...props} />
}

type PackTurnRoundProps = RoundProps & {
  // Whether this screen is the one showing: only then is the active player whoever's turn it is.
  focused: boolean
}

// The Pass & Play table on the packs (see utils/packTurns.ts): the solo board, its player whoever's
// pack turn it is. Each time the screen is shown with no turn under way (a relaunch onto a turn already
// decided, a web reload), the next turn starts, the fair pick. While the screen is the one showing, the
// turn's player is the active one, so the board is theirs (their waiting round, or a fresh draw from
// their own packs, difficulty and art, a guest seat's its own) in their colors, as are the Settings
// sheet's art and unlocks;
// the loadout puts its own focused seat back when it's shown again. The board waits for that switch (a
// turn just started, by Ready or Next, for someone else) and for their colors to be on screen, so
// nothing is drawn for the player before them and the keyboard (which keeps the colors it's first drawn
// in) is theirs; once up, it stays up, whatever the colors do (a harmony picked in Settings). It's
// remounted for every player, so a turn's hooks, stats and unlocks are its player's.
const PackTurnRound = ({ focused, ...props }: PackTurnRoundProps): JSX.Element | null => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const { selectPlayer } = useProfilesActions()
  const { key } = useActivePlayer()
  // The turn's player by key: a plain string, so this re-renders only when the turn's player changes.
  const turnKey = useSelector(getTurnPlayerKey)
  const turnColorsShown = useSelector((state: RootState) => {
    const turn = getTurnPlayer(state)
    return turn !== undefined && arePlayerColorsShown(state, turn)
  })
  // The player whose board is up, once it's been drawn for them (React's adjust-state-while-rendering
  // pattern: set the moment their board can first show, so it stays up from then on).
  const [boardKey, setBoardKey] = useState<PlayerKey | null>(null)
  const turnReady = turnKey !== undefined && turnKey === key && turnColorsShown
  if (turnReady && boardKey !== key) setBoardKey(key)

  useFocusEffect(
    useCallback(() => {
      if (!isPackTurnUnderWay(store.getState())) dispatch(roundActions.startPackTurn())
    }, [store, dispatch])
  )

  useEffect(() => {
    const state = store.getState()
    const turn = getTurnPlayer(state)
    if (!focused || !turn || isActivePlayer(state, turn)) return
    selectPlayer(turn.profileId, turn.seatId)
  }, [focused, turnKey, store, selectPlayer])

  // With no turn (End Session's Done, the screen on its way out) the last board stays drawn.
  if (focused && turnKey !== undefined && !turnReady && boardKey !== key) return null
  return <SoloRound key={key} {...props} packTurn />
}

type PnpRoundProps = Omit<RoundProps, 'isLeaving'> & {
  // Whether this screen is the one showing: only then is the active player whoever's turn it is.
  focused: boolean
  promptsVisible: boolean
}

const NO_PNP_UNLOCKS: PnpRoundUnlocks = { guesser: [], writer: [] }

// Who played the round just decided, as it ended: the session moves on to the next word's writer at
// Next (see roundSlice's startPnpAuthoring), and the result card names who played this one.
type DecidedPnpRound = { guesserId: string; writerId: string }

// Pass and play: the writer types a word over the real board (drawn live from what's typed), hands
// the device to the guesser, and the guesser plays it. Then the guesser writes the next word, for as
// long as the table likes. Game mounts once when composing begins and stays mounted, unchanged, all
// the way through play: the prompt and the hand-off card just float over it. A swap between two
// differently-built trees at Hand off is what caused the flicker this used to have.
//
// The table is the round's session (utils/pnpSession.ts): the players, their standings, and who writes and
// guesses. The prompt names the writer and, with three or more players, lets them change the fair pick
// of who it's for; the hand-off names the guesser; the result card names both, shows the standings and
// who writes next, and offers End Session, whose standings card ends the session and leaves for the
// loadout.
//
// The board is whoever's turn it is (Jay, 2026-10-18): the writer's while they write, the guesser's
// from the hand-off on, in their colors and their art. Each becomes the active player in turn, while
// this screen is the one showing; the loadout puts its own focused seat back when it's shown again.
const PnpRound = ({ locked, focused, promptsVisible, onLeave, onRoundEnding }: PnpRoundProps): JSX.Element | null => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const phase = useSelector((state: RootState) => state.round.pnp.phase)
  const puzzle = useSelector((state: RootState) => state.round.pnp.puzzle)
  const roundId = useSelector((state: RootState) => state.round.pnp.id)
  const players = useSelector((state: RootState) => state.round.pnp.session.players)
  const standings = useSelector((state: RootState) => state.round.pnp.session.standings)
  const writerId = useSelector((state: RootState) => state.round.pnp.session.writerId)
  const guesserId = useSelector((state: RootState) => state.round.pnp.session.guesserId)
  // The roster, for the seats holding profiles: their names and chips (getSeatIdentity).
  const profiles = useProfiles()
  const { selectPlayer } = useProfilesActions()
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
  const handleGuesserChange = useCallback((playerId: string) => dispatch(roundActions.setPnpGuesser(playerId)), [dispatch])
  const [roundUnlocks, setRoundUnlocks] = useState<PnpRoundUnlocks>(NO_PNP_UNLOCKS)
  const [decided, setDecided] = useState<DecidedPnpRound | null>(null)
  // End Session's standings card. Never saved: a relaunch with it up comes back to the session.
  const [sessionEndOpen, setSessionEndOpen] = useState(false)

  // Once per mount: nothing running yet, a round that ended while the app was closed, or a word that
  // went missing starts at a blank prompt. Otherwise the saved beat comes back: the hand-off card, or
  // the round mid-guess.
  useEffect(() => {
    const pnp = store.getState().round.pnp
    if (pnp.phase === null || (pnp.phase !== 'authoring' && (!pnp.puzzle || isRoundDecided(pnp)))) dispatch(roundActions.startPnpAuthoring())
  }, [store, dispatch])

  // Each seat as it's shown: a profile's by the roster's name for it and with its chip (getSeatIdentity).
  const writer = useMemo(() => getSeatIdentity(players, writerId, profiles), [players, writerId, profiles])
  const guesser = useMemo(() => getSeatIdentity(players, guesserId, profiles), [players, guesserId, profiles])

  // Whose turn it is becomes the active player: the writer while the word is written, the guesser from
  // the hand-off on, through the result card (whose Next has them write the next word anyway), a guest
  // seat as its own guest. Their colors follow (Theme's PlayerThemeSync); their art is on the word
  // itself (handlePnpAuthored).
  const turnSeatId = phase === 'authoring' ? writerId : guesserId
  const turnKey = useSelector((state: RootState) => getSeatPlayerKey(state, turnSeatId))
  useEffect(() => {
    const state = store.getState()
    const turn = getSeatPlayer(state, turnSeatId)
    if (!focused || phase === null || !turn || isActivePlayer(state, turn)) return
    selectPlayer(turn.profileId, turn.seatId)
  }, [focused, phase, turnSeatId, turnKey, store, selectPlayer])

  const handleProgress = useCallback((progress: RoundProgress) => dispatch(roundActions.savePnpProgress(progress)), [dispatch])

  // A pass-and-play round is a contest between people on one device, not progress against the
  // catalog: no unlocks, and its own Pass & Play record, separate from every solo stat (see
  // statsEngine's applyPnpRound), so a friend's word can't inflate the solve count or break a streak.
  // It counts into the session's standings (recordPnpResult) and the stats, each seat by its profile
  // (null for a guest, whose rounds land on the device's record only), once per round: a round already
  // counted (its end reported again after a relaunch mid-round, see recordPnpResult) records nothing.
  // The card shows what each of them unlocked: the guesser's (a guest's being the device's), then the
  // writer's own when the writer is a profile.
  const handleDecided = useCallback(
    (result: 'win' | 'loss', wrongGuesses: number) => {
      onRoundEnding(true)
      setRoundUnlocks(NO_PNP_UNLOCKS)
      const { pnp } = store.getState().round
      const { session } = pnp
      setDecided({ guesserId: session.guesserId, writerId: session.writerId })
      if (session.recordedRoundId === pnp.id) return
      dispatch(roundActions.recordPnpResult({ roundId: pnp.id, result }))
      const profileIdOf = (playerId: string) => session.players.find((player) => player.id === playerId)?.profileId ?? null
      setRoundUnlocks(recordPnpRound({ result, wrongGuesses, guesserProfileId: profileIdOf(session.guesserId), writerProfileId: profileIdOf(session.writerId) }))
    },
    [store, dispatch, recordPnpRound, onRoundEnding]
  )
  const handleSolved = useCallback((details: SolveDetails) => handleDecided('win', details.wrongGuesses), [handleDecided])
  const handleLost = useCallback((details: LossDetails) => handleDecided('loss', details.wrongGuesses), [handleDecided])

  // Next: a blank prompt, the guesser writing it.
  const handleRoundEnd = useCallback(() => {
    onRoundEnding(false)
    setDecided(null)
    setAnswer('')
    setHint('')
    dispatch(roundActions.startPnpAuthoring())
  }, [dispatch, onRoundEnding])

  // End Session swaps the result card for the standings card (Game hides its card while
  // roundCardHidden is set); Keep Playing, or Android back, swaps them back with nothing changed.
  const handleEndSession = useCallback(() => setSessionEndOpen(true), [])
  const handleKeepPlaying = useCallback(() => setSessionEndOpen(false), [])
  // Done on the standings card: the session's standings cleared (the table kept for next time), and
  // back to the loadout. The card goes too, since the web can keep a left screen mounted.
  const handleSessionDone = useCallback(() => {
    setSessionEndOpen(false)
    onRoundEnding(false)
    dispatch(roundActions.endPnpSession())
    onLeave()
  }, [dispatch, onLeave, onRoundEnding])

  const handlePnpAuthored = useCallback(() => {
    // Goes through the same resolver every other custom word uses, so normalization and what counts
    // as a valid word can't drift. The art is the guesser's own pick: from the hand-off on, the board
    // is theirs.
    const state = store.getState()
    const guesserKey = getSeatPlayerKey(state, state.round.pnp.session.guesserId) ?? GUEST_PLAYER_KEY
    const guesserArt = findMode(state.playerSettings[guesserKey]?.modeId ?? DEFAULT_PLAYER_SETTINGS.modeId)
    const result = resolvePuzzle({ sourceMode: 'custom', difficulty: 'any', mode: guesserArt, customPhrase: answer, customHint: hint }, [])
    if (!result.ok) {
      void alert('Invalid Word', result.error)
      return
    }
    dispatch(roundActions.setPnpWord(toSavedPuzzle(result.payload)))
    // Opt-in, off by default (see useAutoSaveCustom). Fire-and-forget so handing over isn't blocked
    // on a storage write.
    if (autoSave) void addCustomPuzzle({ answer, hint: hint || undefined }, PNP_QUICK_PACK_LABEL).then(refreshCustomPacks)
  }, [store, answer, hint, autoSave, refreshCustomPacks, dispatch])

  const handleReady = useCallback(() => dispatch(roundActions.startPnpPlaying()), [dispatch])

  // Everyone the word could be for, in seat order (the prompt's For row).
  const guessers = useMemo(() => players.filter((player) => player.id !== writerId).map((player) => ({ id: player.id, ...getSeatIdentity(players, player.id, profiles) })), [players, writerId, profiles])
  const standingRows = useMemo(() => getStandingRows({ players, standings }, profiles), [players, standings, profiles])
  const roundSummary = useMemo((): PnpRoundSummary | null => {
    if (!decided) return null
    const decidedGuesser = getSeatIdentity(players, decided.guesserId, profiles)
    const decidedWriter = getSeatIdentity(players, decided.writerId, profiles)
    return { playerId: decided.guesserId, playerName: decidedGuesser.name, playerProfile: decidedGuesser.profile, writerName: decidedWriter.name, nextName: decidedGuesser.name, nextProfile: decidedGuesser.profile, standings: standingRows }
  }, [decided, players, profiles, standingRows])
  // The guesser's unlocks, then the writer's: a guest writer's block is always empty (the device's
  // unlocks are the guesser's), so it never shows.
  const unlocks = useMemo((): RoundUnlocks[] => {
    if (!decided) return []
    return [
      { owner: getSeatIdentity(players, decided.guesserId, profiles).profile, achievements: roundUnlocks.guesser },
      { owner: getSeatIdentity(players, decided.writerId, profiles).profile, achievements: roundUnlocks.writer }
    ]
  }, [decided, players, profiles, roundUnlocks])

  // The live draft while composing (so the board reflects the word as it's typed, in the writer's own
  // art), the real word after. A finished round stays drawn once its session has ended (phase null)
  // while the screen leaves.
  const board = phase === 'authoring' ? buildPnpDraftSession(answer, defaultMode) : puzzle ? toGamePayload(puzzle) : null

  return (
    <>
      {/* Locked while composing and during the hand-off, so nothing about the round can be touched by
          tap or physical keyboard before play actually starts. */}
      {board ? <SavedBoard key={roundId} readSaved={readPnpRound} session={board} onStop={handleRoundEnd} onSolved={handleSolved} onLost={handleLost} onProgress={handleProgress} unlocks={unlocks} passAndPlay={roundSummary} onEndSession={handleEndSession} roundCardHidden={sessionEndOpen} locked={locked || phase !== 'playing'} /> : null}
      {phase === 'authoring' ? <PnpWordPrompt writerName={writer.name} writerProfile={writer.profile} guessers={guessers} guesserId={guesserId} onGuesserChange={handleGuesserChange} answer={answer} hint={hint} onAnswerChange={handleAnswerChange} onHintChange={handleHintChange} promptVisible={promptsVisible} onClose={onLeave} onSubmit={handlePnpAuthored} /> : null}
      {phase === 'handoff' ? <PnpHandoffDialog visible={promptsVisible} guesserName={guesser.name} guesserProfile={guesser.profile} writerName={writer.name} onReady={handleReady} /> : null}
      <PnpSessionEndDialog visible={sessionEndOpen} standings={standingRows} onDone={handleSessionDone} onKeepPlaying={handleKeepPlaying} />
    </>
  )
}

export type GameScreenProps = {
  mode: PlayMode
  // The door whose loadout this goes back to: the game's own unless it's said (see gameHref).
  door?: PlayMode
}

type LeaveHref = Parameters<typeof router.dismissTo>[0]

// The /game route: the board for one game, with the fleet's corners (Home top-left, the Settings cog
// top-right).
//
// Whatever is on the board lives in the round slice, saved on every guess, so leaving keeps the round
// for later: the loadout's Ready picks it back up, and a relaunch while this screen was open comes
// straight back here (see useActiveGame), a pack turn included. Starting a different puzzle over a
// round with guesses on it is what counts as abandoning it (see useStartSolo).
export const GameScreen = ({ mode, door = mode }: GameScreenProps): JSX.Element => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const focused = useIsFocused()
  const store = useStore<RootState>()
  const { markActive, clearActive } = useActiveGame()
  const { refreshUnlocks } = useCatalogActions()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // See RoundProps' onRoundEnding. A ref: it only gates leaving, nothing renders off it.
  const roundEndingRef = useRef(false)
  const handleRoundEnding = useCallback((ending: boolean) => {
    roundEndingRef.current = ending
  }, [])
  // See RoundProps' isLeaving: set as the screen leaves or loses focus, cleared whenever it's shown
  // again.
  const leavingRef = useRef(false)
  const isLeaving = useCallback(() => leavingRef.current, [])

  // dismissTo pops back to the screen already beneath this one, or replaces this screen with it when
  // there's none (a resumed game, a share link opened cold). Held off between a round's end and its
  // result card (at most the win's 2s celebration), so the card and its unlocks are always seen.
  const leaveFor = useCallback(
    (href: LeaveHref) => {
      if (roundEndingRef.current) return
      leavingRef.current = true
      Keyboard.dismiss()
      clearActive()
      router.dismissTo(href)
    },
    [clearActive]
  )
  // A step back to the door's loadout: Android's back button, the prompt's close glyph, a shared
  // puzzle's Next.
  const leave = useCallback(() => leaveFor(loadoutHref(door)), [leaveFor, door])
  // The corner is Home, as in Solitaire, not a back arrow: a launch can open straight into this screen,
  // with nothing the player came from to go back to.
  const goHome = useCallback(() => leaveFor('/'), [leaveFor])

  // Android's back button steps back to the loadout, even with nothing beneath this screen in the
  // stack (where the navigator would otherwise close the app). The result card, the Pass & Play
  // prompt, End Session's standings card and the Settings sheet register their own handlers when they
  // open, after this one, so theirs run first. The one overlay that can already be up when this
  // registers is a resumed Pass & Play hand-off card, which swallows back on purpose (Ready is the only
  // way on), so this steps aside for it.
  //
  // Losing focus also clears the active game: however the player got off this screen (the Home corner,
  // or the browser's own back button on the web, which never calls leave()), a later launch shouldn't
  // drop them back in. An app that's killed or backgrounded never blurs, so a real resume survives.
  useFocusEffect(
    useCallback(() => {
      leavingRef.current = false
      markActive(mode, door)
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (mode === 'pnp' && store.getState().round.pnp.phase === 'handoff') return false
        leave()
        return true
      })
      return () => {
        leavingRef.current = true
        subscription.remove()
        clearActive()
      }
    }, [markActive, clearActive, mode, door, leave, store])
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
        {/* The written words' game, the solo game played from the Pass & Play door (the table's pack
            turns), or a player's own. paddingTop matches the floating corner buttons below rather
            than reserving a whole extra header row for them: the game's own top row (PuzzleInfoRow's
            pills) shares that band. */}
        <View style={[styles.flex, gameShell, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>{mode === 'pnp' ? <PnpRound locked={locked} focused={focused} promptsVisible={focused && !settingsOpen} onLeave={leave} onRoundEnding={handleRoundEnding} /> : door === 'pnp' ? <PackTurnRound locked={locked} focused={focused} onLeave={leave} onRoundEnding={handleRoundEnding} isLeaving={isLeaving} /> : <ActivePlayerSoloRound locked={locked} onLeave={leave} onRoundEnding={handleRoundEnding} isLeaving={isLeaving} />}</View>

        {/* The fleet's plain-glyph corners, in the board's own onSurface ink like marker on the board.
            pointerEvents='box-none' lets taps in the empty middle fall through to PuzzleInfoRow's
            pills between them. hitSlop={4} makes each a 48pt target; the pills sit 8pt from the
            buttons' boxes, so 4pt of clearance is left (see hud's CLAUDE.md on CornerActionButtons). */}
        <View style={[StyleSheet.absoluteFill, styles.corners]} pointerEvents='box-none'>
          <CornerActionButtons backIcon='home' backLabel='Home' onBack={goHome} onSettings={handleOpenSettings} fg={theme.colors.onSurface} insets={insets} hitSlop={4} />
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
