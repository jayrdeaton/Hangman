import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { PuzzleSourceMode } from '@/types/gameSession'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

// The two game screens a player can be in (see src/app/game.tsx). Each keeps its own round, so a
// Pass & Play session never touches the solo round left waiting on the Single Player loadout.
export type PlayMode = 'solo' | 'pnp'

// Pass and play is a three-beat loop, so it needs no more state than which beat it's on. There are
// deliberately no players and no score: any number of people can be passing the device around.
export type PnpPhase = 'authoring' | 'handoff' | 'playing'

// A GameStartPayload with its art saved by id: GameMode carries a React component, so it can't be
// persisted itself. Resolved back with findMode (see utils/roundState.ts).
export type SavedPuzzle = {
  phrase: string
  modeId: string
  sourceMode: PuzzleSourceMode
  hint?: string
  packKey?: string
  packLabel?: string
  puzzleId?: string
  difficultyTier?: PuzzleDifficultyTier
  packScope?: 'single' | 'selection'
}

export type SavedRound = {
  // Bumped for every new round. Game is keyed on it, so a new round always remounts it: two puzzles
  // in a row can normalize to the same phrase, and keying on the phrase would carry one round's
  // guesses, outcome and celebration into the next.
  id: number
  puzzle: SavedPuzzle | null
  guessedLetters: string[]
  hintRevealed: boolean
}

// `draft` is the word and hint being typed while composing, kept so leaving the prompt (or the app)
// doesn't throw them away. Only present while there's something typed.
export type PnpDraft = { answer: string; hint: string }
export type PnpRound = SavedRound & { phase: PnpPhase | null; draft?: PnpDraft }

export type RoundState = {
  solo: SavedRound
  pnp: PnpRound
  // The game screen that was open when the app last went away. Read once at a cold launch to skip
  // Home and go straight back into that game (see useActiveGame), the way Solitaire resumes.
  activeMode: PlayMode | null
}

export type RoundProgress = { guessedLetters: string[]; hintRevealed: boolean }

const emptyRound = (id: number): SavedRound => ({ id, puzzle: null, guessedLetters: [], hintRevealed: false })

export const initialRoundState: RoundState = {
  solo: emptyRound(0),
  pnp: { ...emptyRound(0), phase: null },
  activeMode: null
}

const roundSlice = createSlice({
  name: 'round',
  initialState: initialRoundState,
  reducers: {
    startSolo: (state, action: PayloadAction<SavedPuzzle>) => {
      state.solo = { ...emptyRound(state.solo.id + 1), puzzle: action.payload }
    },
    clearSolo: (state) => {
      state.solo = emptyRound(state.solo.id + 1)
    },
    saveSoloProgress: (state, action: PayloadAction<RoundProgress>) => {
      state.solo.guessedLetters = action.payload.guessedLetters
      state.solo.hintRevealed = action.payload.hintRevealed
    },
    // A fresh, blank board for the next word. Bumps the id: whatever was on screen before (the round
    // just finished, its outcome and celebration) shouldn't carry into the composing screen.
    startPnpAuthoring: (state) => {
      state.pnp = { ...emptyRound(state.pnp.id + 1), phase: 'authoring' }
    },
    // No id bump: Game has been mounted (and locked) since composing began, already drawing this
    // exact word live, so finalizing it remounts nothing and there's nothing left to flicker.
    setPnpDraft: (state, action: PayloadAction<PnpDraft>) => {
      if (action.payload.answer || action.payload.hint) state.pnp.draft = action.payload
      else delete state.pnp.draft
    },
    setPnpWord: (state, action: PayloadAction<SavedPuzzle>) => {
      delete state.pnp.draft
      state.pnp.puzzle = action.payload
      state.pnp.guessedLetters = []
      state.pnp.hintRevealed = false
      state.pnp.phase = 'handoff'
    },
    startPnpPlaying: (state) => {
      state.pnp.phase = 'playing'
    },
    savePnpProgress: (state, action: PayloadAction<RoundProgress>) => {
      state.pnp.guessedLetters = action.payload.guessedLetters
      state.pnp.hintRevealed = action.payload.hintRevealed
    },
    endPnp: (state) => {
      state.pnp = { ...emptyRound(state.pnp.id + 1), phase: null }
    },
    // The art is purely cosmetic, so a new pick applies to both waiting rounds as well as future ones.
    setRoundArt: (state, action: PayloadAction<string>) => {
      if (state.solo.puzzle) state.solo.puzzle.modeId = action.payload
      if (state.pnp.puzzle) state.pnp.puzzle.modeId = action.payload
    },
    setActiveMode: (state, action: PayloadAction<PlayMode | null>) => {
      state.activeMode = action.payload
    },
    reset: () => initialRoundState
  }
})

export const roundActions = roundSlice.actions
export default roundSlice.reducer
