import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { DEFAULT_MODE } from '@/modes/registry'
import { isPlayerKey, type PlayerKey } from '@/utils/players'
import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

import { isRootRehydrate } from './rehydrate'

export type DifficultyFilter = 'any' | PuzzleDifficultyTier

// What a player has picked for their puzzles: the art, the difficulty filter and the packs. Read for the
// active player through usePuzzleDefaults and usePackSelection, whose shapes predate this, so nothing
// that reads them knows it's per player. packKeys null is every pack, so a custom pack loaded or made
// later is in without anyone switching it on.
export type PlayerSettings = {
  modeId: string
  difficulty: DifficultyFilter
  packKeys: string[] | null
}

// By player key (utils/players.ts). A player with nothing picked yet has no entry and plays with the
// defaults below. Persisted with the root blob (store.ts's whitelist).
export type PlayerSettingsState = Record<PlayerKey, PlayerSettings>

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = { modeId: DEFAULT_MODE.id, difficulty: 'any', packKeys: null }

const DIFFICULTIES: DifficultyFilter[] = ['any', 'easy', 'medium', 'hard']

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isDifficulty = (value: unknown): value is DifficultyFilter => DIFFICULTIES.includes(value as DifficultyFilter)
const isKeyList = (value: unknown): value is string[] => Array.isArray(value) && value.every((key) => typeof key === 'string')

// Checks what comes back from storage, field by field: a field that isn't valid takes its default, and
// an entry that isn't an object at all (or sits under a key no player could have) is dropped. An unknown
// art id is kept, since findMode resolves it to the default art anyway.
export const sanitizePlayerSettings = (value: unknown): PlayerSettingsState => {
  const next: PlayerSettingsState = {}
  if (!isRecord(value)) return next
  for (const [key, entry] of Object.entries(value)) {
    if (!isPlayerKey(key) || !isRecord(entry)) continue
    next[key] = {
      modeId: typeof entry.modeId === 'string' && entry.modeId.length > 0 ? entry.modeId : DEFAULT_PLAYER_SETTINGS.modeId,
      difficulty: isDifficulty(entry.difficulty) ? entry.difficulty : DEFAULT_PLAYER_SETTINGS.difficulty,
      packKeys: isKeyList(entry.packKeys) ? [...entry.packKeys] : null
    }
  }
  return next
}

type PlayerPayload<T> = PayloadAction<{ playerKey: PlayerKey } & T>

const entryFor = (state: PlayerSettingsState, playerKey: PlayerKey): PlayerSettings => {
  state[playerKey] ??= { ...DEFAULT_PLAYER_SETTINGS }
  return state[playerKey]
}

const playerSettingsSlice = createSlice({
  name: 'playerSettings',
  initialState: {} as PlayerSettingsState,
  reducers: {
    setMode: (state, action: PlayerPayload<{ modeId: string }>) => {
      entryFor(state, action.payload.playerKey).modeId = action.payload.modeId
    },
    setDifficulty: (state, action: PlayerPayload<{ difficulty: DifficultyFilter }>) => {
      entryFor(state, action.payload.playerKey).difficulty = action.payload.difficulty
    },
    setPackKeys: (state, action: PlayerPayload<{ packKeys: string[] | null }>) => {
      entryFor(state, action.payload.playerKey).packKeys = action.payload.packKeys
    },
    // A deleted profile's picks, for when profiles arrive.
    removePlayer: (state, action: PayloadAction<PlayerKey>) => {
      delete state[action.payload]
    },
    reset: () => ({})
  },
  extraReducers: (builder) => {
    builder.addMatcher(isRootRehydrate, (_state, action) => sanitizePlayerSettings(action.payload?.playerSettings))
  }
})

export const playerSettingsActions = playerSettingsSlice.actions
export default playerSettingsSlice.reducer
