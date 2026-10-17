import { initialRoundState, type PnpPhase, type PnpRound, type RoundState, type SavedPuzzle, type SavedRound } from '@/redux/roundSlice'
import type { GameStartPayload } from '@/types/gameSession'

import { isPlayerKey } from './players'
import { getStanding, sanitizePnpSession } from './pnpSession'
import { findMode } from './puzzleLink'

export const toSavedPuzzle = (payload: GameStartPayload): SavedPuzzle => {
  const { mode, ...rest } = payload
  return { ...rest, modeId: mode.id }
}

export const toGamePayload = (puzzle: SavedPuzzle): GameStartPayload => {
  const { modeId, ...rest } = puzzle
  return { ...rest, mode: findMode(modeId) }
}

export const countWrongGuesses = (phrase: string, guessedLetters: string[]): number => guessedLetters.filter((letter) => !phrase.includes(letter)).length

// Whether a saved round already ended: every letter found, or the art's mistake limit reached. A
// decided round was recorded the moment it ended (see GameScreen), so it never counts again.
export const isRoundDecided = (round: Pick<SavedRound, 'puzzle' | 'guessedLetters'>): boolean => {
  const { puzzle, guessedLetters } = round
  if (!puzzle) return false
  if (countWrongGuesses(puzzle.phrase, guessedLetters) >= findMode(puzzle.modeId).maxMistakes) return true
  return puzzle.phrase.split('').every((c) => c === ' ' || guessedLetters.includes(c))
}

// A round that would have to be abandoned (and counted as a loss) to start a different puzzle: it has
// a guess on it and hasn't ended. A fresh round or one already decided costs nothing to leave.
export const hasUnfinishedGuesses = (round: Pick<SavedRound, 'puzzle' | 'guessedLetters'>): boolean => round.puzzle !== null && round.guessedLetters.length > 0 && !isRoundDecided(round)

// A round worth going back to from the loadout: a word on the board that hasn't ended yet.
export const isRoundPlayable = (round: Pick<SavedRound, 'puzzle' | 'guessedLetters'>): boolean => round.puzzle !== null && !isRoundDecided(round)

// What a Pass & Play player leaving the table would take with them (see roundSlice's
// removePnpPlayer), for the loadout to confirm first: their standing this session, and the word on the
// board when it can't go on without them (theirs being written with something typed, or a word written
// by them or for them that's handed off or in play and not yet decided).
export const getPnpRemovalLoss = (pnp: PnpRound, playerId: string): { standing: boolean; word: boolean } => {
  const { session } = pnp
  const standing = getStanding(session, playerId).played > 0
  const isWriter = session.writerId === playerId
  const word = session.recordedRoundId !== pnp.id && ((pnp.phase === 'authoring' && isWriter && Boolean(pnp.draft)) || ((pnp.phase === 'handoff' || pnp.phase === 'playing') && (isWriter || session.guesserId === playerId) && isRoundPlayable(pnp)))
  return { standing, word }
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isOptionalString = (value: unknown): boolean => value === undefined || typeof value === 'string'
const isLetterList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string' && /^[A-Z]$/.test(item))
const PHASES: (PnpPhase | null)[] = ['authoring', 'handoff', 'playing', null]

const isSavedPuzzle = (value: unknown): value is SavedPuzzle => isRecord(value) && typeof value.phrase === 'string' && /^[A-Z ]*[A-Z][A-Z ]*$/.test(value.phrase) && typeof value.modeId === 'string' && (value.sourceMode === 'random' || value.sourceMode === 'custom') && isOptionalString(value.hint) && isOptionalString(value.packKey) && isOptionalString(value.packLabel) && isOptionalString(value.puzzleId) && (value.difficultyTier === undefined || value.difficultyTier === 'easy' || value.difficultyTier === 'medium' || value.difficultyTier === 'hard') && (value.packScope === undefined || value.packScope === 'single' || value.packScope === 'selection')

const sanitizeRound = (value: unknown): SavedRound | null => {
  if (!isRecord(value) || typeof value.id !== 'number' || !Number.isFinite(value.id)) return null
  if (value.puzzle !== null && !isSavedPuzzle(value.puzzle)) return null
  if (!isLetterList(value.guessedLetters) || typeof value.hintRevealed !== 'boolean') return null
  return { id: value.id, puzzle: value.puzzle, guessedLetters: value.guessedLetters, hintRevealed: value.hintRevealed }
}

// Each player's solo round that passes, under a key a player could have. Anything else is dropped, a
// solo round saved before rounds were kept per player (a single round, not a map of them) included:
// there's no carrying it over (the app hadn't shipped).
const sanitizeSoloRounds = (value: unknown): RoundState['solo'] => {
  const solo: RoundState['solo'] = {}
  if (!isRecord(value)) return solo
  for (const [playerKey, round] of Object.entries(value)) {
    const saved = isPlayerKey(playerKey) ? sanitizeRound(round) : null
    if (saved) solo[playerKey] = saved
  }
  return solo
}

// Checks the persisted round blob (its own redux-persist key, see store.ts) before it's trusted. A
// slot that fails falls back to an empty round instead of putting a broken board on screen at launch.
// The Pass & Play session is checked on its own (sanitizePnpSession): a broken round slot keeps the
// table and its standings, and a broken or missing session (one saved before sessions existed
// included, with no carrying anything over: the app hadn't shipped) starts a fresh one.
export const sanitizeRoundState = (value: unknown): RoundState => {
  if (!isRecord(value)) return initialRoundState
  const solo = sanitizeSoloRounds(value.solo)
  const pnpRound = sanitizeRound(value.pnp)
  const phase = isRecord(value.pnp) && PHASES.includes(value.pnp.phase as PnpPhase | null) ? (value.pnp.phase as PnpPhase | null) : null
  const draft = isRecord(value.pnp) && isRecord(value.pnp.draft) && typeof value.pnp.draft.answer === 'string' && /^[A-Za-z ]*$/.test(value.pnp.draft.answer) && typeof value.pnp.draft.hint === 'string' ? { answer: value.pnp.draft.answer, hint: value.pnp.draft.hint } : undefined
  // Only a count of the round kept with it means anything, so a slot that falls back takes none.
  const session = sanitizePnpSession(isRecord(value.pnp) ? value.pnp.session : undefined, pnpRound ? pnpRound.id : null)
  const pnp = pnpRound ? { ...pnpRound, phase, ...(draft && phase === 'authoring' ? { draft } : {}), session } : { ...initialRoundState.pnp, session }
  const activeMode = value.activeMode === 'solo' || value.activeMode === 'pnp' ? value.activeMode : null
  return { solo, pnp, activeMode }
}
