import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ColorHarmony, ThemeSettings } from '@rific/auto-paper'

import { isPlayerKey, type PlayerKey } from '@/utils/players'

import { isRootRehydrate } from './rehydrate'

// Each player's colors: the palette picker's seed color (or explicit triad) and its harmony. The live
// theme (auto-paper's settings, the `theme` slice) always holds the active player's; Theme.tsx's
// PlayerThemeSync files every change under them here and puts a player's back when they become the
// active one. Appearance and Blur aren't in it: they stay the device's.
export type PlayerTheme = Pick<ThemeSettings, 'color' | 'harmony'>

// What's kept for a player: their colors, plus, for a profile, the profile's own color when they were
// picked. A profile's Hangman colors only hold while the profile keeps that color: give the profile a
// new one (on the Profiles screen here, or in another game) and their pick lapses, the way
// @tastic/profile's profileSeatColor drops a seat's pick, so the new color shows (see
// resolvePlayerTheme). The guest has no profile color.
export type PlayerThemeEntry = PlayerTheme & { profileColor?: string }

// By player key (utils/players.ts). A guest with no entry yet takes whatever colors are on screen; a
// profile with none takes its own color. Persisted with the root blob (store.ts's whitelist).
export type PlayerThemeState = Record<PlayerKey, PlayerThemeEntry>

// The harmony a profile plays with until its player picks one (Settings' HARMONY): auto-paper's own
// default (its defaultThemeSettings.harmony, pinned by playerThemeSlice.test.ts), the one the app
// starts on. A literal, so this module never needs auto-paper's runtime.
export const DEFAULT_HARMONY: ColorHarmony = 'split-complementary'

const HARMONIES: ColorHarmony[] = ['triadic', 'split-complementary', 'analogous', 'square', 'complementary', 'double-split']

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const isColor = (value: unknown): value is PlayerTheme['color'] => (typeof value === 'string' && value.length > 0) || (isRecord(value) && typeof value.primary === 'string' && typeof value.secondary === 'string' && typeof value.tertiary === 'string')

export const sameColor = (a: string | null | undefined, b: string | null | undefined): boolean => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

// Whether two entries would paint the same theme. An explicit triad is compared by its colors, since
// one that went through storage is never the same object as the one on screen.
export const isSamePlayerTheme = (a: PlayerTheme | undefined, b: PlayerTheme | undefined): boolean => {
  if (!a || !b) return a === b
  if (a.harmony !== b.harmony) return false
  if (typeof a.color === 'string' || typeof b.color === 'string') return a.color === b.color
  return a.color.primary === b.color.primary && a.color.secondary === b.color.secondary && a.color.tertiary === b.color.tertiary
}

// The same, and picked against the same profile color: whether storing `b` over `a` would change anything.
export const isSamePlayerThemeEntry = (a: PlayerThemeEntry | undefined, b: PlayerThemeEntry | undefined): boolean => isSamePlayerTheme(a, b) && (!a || !b || sameColor(a.profileColor, b.profileColor))

// The colors a player should be shown, from what's kept for them and, for a profile, the profile's own
// color as it is now (null for the guest, or a profile the roster doesn't have). A profile's pick holds
// while the profile still has the color it was picked against; otherwise they get the profile's color,
// keeping the harmony they picked (or the default, with nothing kept). The guest gets their entry, or
// null for none, which leaves the colors on screen.
export const resolvePlayerTheme = (entry: PlayerThemeEntry | undefined, profileColor: string | null): PlayerTheme | null => {
  if (profileColor === null) return entry ? { color: entry.color, harmony: entry.harmony } : null
  if (entry && sameColor(entry.profileColor, profileColor)) return { color: entry.color, harmony: entry.harmony }
  return { color: profileColor, harmony: entry?.harmony ?? DEFAULT_HARMONY }
}

// Checks what comes back from storage: an entry with a color or harmony that isn't one is dropped
// whole (its player then just takes the colors on screen, or their profile's), as is one under a key no
// player could have. A profile color that isn't a string is left off, so that pick lapses.
export const sanitizePlayerTheme = (value: unknown): PlayerThemeState => {
  const next: PlayerThemeState = {}
  if (!isRecord(value)) return next
  for (const [key, entry] of Object.entries(value)) {
    if (!isPlayerKey(key) || !isRecord(entry) || !isColor(entry.color) || !HARMONIES.includes(entry.harmony as ColorHarmony)) continue
    const color = typeof entry.color === 'string' ? entry.color : { primary: entry.color.primary, secondary: entry.color.secondary, tertiary: entry.color.tertiary }
    next[key] = { color, harmony: entry.harmony as ColorHarmony, ...(typeof entry.profileColor === 'string' && entry.profileColor.length > 0 ? { profileColor: entry.profileColor } : {}) }
  }
  return next
}

const playerThemeSlice = createSlice({
  name: 'playerTheme',
  initialState: {} as PlayerThemeState,
  reducers: {
    setPlayerTheme: (state, action: PayloadAction<{ playerKey: PlayerKey; theme: PlayerThemeEntry }>) => {
      state[action.payload.playerKey] = action.payload.theme
    },
    // A forgotten profile's colors (see usePlayerData's forgetPlayer).
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
