import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ColorHarmony, ThemeSettings } from '@rific/auto-paper'

import { isPlayerKey, type PlayerKey } from '@/utils/players'

import { isRootRehydrate } from './rehydrate'

// Each player's colors: the palette picker's seed color (or explicit triad) and its harmony. The live
// theme (auto-paper's settings, the `theme` slice) always holds the active player's; Theme.tsx's
// PlayerThemeSync files every change under them here and puts a player's back when they become the
// active one. Appearance and Blur aren't in it: they stay the device's.
export type PlayerTheme = Pick<ThemeSettings, 'color' | 'harmony'>

// By player key (utils/players.ts). A player with no entry yet takes whatever colors are on screen.
// Persisted with the root blob (store.ts's whitelist).
export type PlayerThemeState = Record<PlayerKey, PlayerTheme>

const HARMONIES: ColorHarmony[] = ['triadic', 'split-complementary', 'analogous', 'square', 'complementary', 'double-split']

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isColor = (value: unknown): value is PlayerTheme['color'] => (typeof value === 'string' && value.length > 0) || (isRecord(value) && typeof value.primary === 'string' && typeof value.secondary === 'string' && typeof value.tertiary === 'string')

// Whether two entries would paint the same theme. An explicit triad is compared by its colors, since
// one that went through storage is never the same object as the one on screen.
export const isSamePlayerTheme = (a: PlayerTheme | undefined, b: PlayerTheme | undefined): boolean => {
  if (!a || !b) return a === b
  if (a.harmony !== b.harmony) return false
  if (typeof a.color === 'string' || typeof b.color === 'string') return a.color === b.color
  return a.color.primary === b.color.primary && a.color.secondary === b.color.secondary && a.color.tertiary === b.color.tertiary
}

// Checks what comes back from storage: an entry with a color or harmony that isn't one is dropped
// whole (its player then just takes the colors on screen), as is one under a key no player could have.
export const sanitizePlayerTheme = (value: unknown): PlayerThemeState => {
  const next: PlayerThemeState = {}
  if (!isRecord(value)) return next
  for (const [key, entry] of Object.entries(value)) {
    if (!isPlayerKey(key) || !isRecord(entry) || !isColor(entry.color) || !HARMONIES.includes(entry.harmony as ColorHarmony)) continue
    const color = typeof entry.color === 'string' ? entry.color : { primary: entry.color.primary, secondary: entry.color.secondary, tertiary: entry.color.tertiary }
    next[key] = { color, harmony: entry.harmony as ColorHarmony }
  }
  return next
}

const playerThemeSlice = createSlice({
  name: 'playerTheme',
  initialState: {} as PlayerThemeState,
  reducers: {
    setPlayerTheme: (state, action: PayloadAction<{ playerKey: PlayerKey; theme: PlayerTheme }>) => {
      state[action.payload.playerKey] = action.payload.theme
    },
    // A deleted profile's colors, for when profiles arrive.
    removePlayer: (state, action: PayloadAction<PlayerKey>) => {
      delete state[action.payload]
    },
    reset: () => ({})
  },
  extraReducers: (builder) => {
    builder.addMatcher(isRootRehydrate, (_state, action) => sanitizePlayerTheme(action.payload?.playerTheme))
  }
})

export const playerThemeActions = playerThemeSlice.actions
export default playerThemeSlice.reducer
