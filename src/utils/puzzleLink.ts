import * as Linking from 'expo-linking'
import { Platform } from 'react-native'

import { ALL_MODES, DEFAULT_MODE } from '@/modes/registry'
import type { GameStartPayload } from '@/types/gameSession'

import { normalizePhrase, type PuzzleConfig } from './puzzlePicker'

// Matches PnpWordPrompt's and PackEditorPage's TextInput maxLength props - a link claiming a
// longer phrase/hint than the UI could ever produce is malformed (or hostile), not a puzzle worth
// trying to resolve.
const MAX_PHRASE_LENGTH = 128
const MAX_HINT_LENGTH = 80

// Exported for PuzzleDefaultsProvider.tsx, which resolves a persisted mode id the same way a
// shared link's own mode query param resolves here.
export const findMode = (id: string | string[] | undefined) => {
  if (typeof id !== 'string') return DEFAULT_MODE
  return ALL_MODES.find((candidate) => candidate.id === id) ?? DEFAULT_MODE
}

// The /play route's path for Linking.createURL. On the web the game is served under a base URL
// (games.infinitetoken.com/hangman/, see app.config.ts), which createURL leaves out: it builds from the
// page's origin alone, so a bare 'play' would point at the hub's /play. Expo inlines the base URL as
// process.env.EXPO_BASE_URL in the web export; native links (hangman://play) never carry it.
const playPath = (): string => (Platform.OS === 'web' ? `${(process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '')}/play` : 'play')

// Built from an already-resolved payload (not raw draft state) so a shared link always carries a
// validated, normalized phrase - never whatever half-typed text was sitting in the input.
export const buildPuzzleLink = (payload: Pick<GameStartPayload, 'phrase' | 'hint' | 'mode'>): string => Linking.createURL(playPath(), { queryParams: { phrase: payload.phrase, hint: payload.hint ?? '', mode: payload.mode.id } })

export type SharedPuzzleParams = { phrase?: string | string[]; hint?: string | string[]; mode?: string | string[] }

// Returns null for anything that isn't a recognized, playable puzzle share - including the app's own
// default URL with no query params, a phrase that would normalize to nothing, or a phrase/hint longer
// than the input limits - so callers can always fall back safely instead of committing to a puzzle
// that would only fail to resolve two layers further down. Takes the query params themselves: the
// /play route reads them straight from the router (see src/app/play.tsx).
export const parseSharedPuzzleParams = (params: SharedPuzzleParams): PuzzleConfig | null => {
  const { phrase, hint } = params
  if (typeof phrase !== 'string' || phrase.length > MAX_PHRASE_LENGTH) return null
  if (normalizePhrase(phrase).replace(/ /g, '').length === 0) return null

  const customHint = typeof hint === 'string' ? hint : ''
  if (customHint.length > MAX_HINT_LENGTH) return null

  return {
    sourceMode: 'custom',
    difficulty: 'any',
    mode: findMode(params.mode),
    customPhrase: phrase,
    customHint
  }
}

// The same, from a whole link (an untrusted or hand-crafted URL Linking.parse can't decode is null too).
export const parseSharedPuzzle = (url: string): PuzzleConfig | null => {
  let queryParams: Linking.QueryParams | null
  try {
    ;({ queryParams } = Linking.parse(url))
  } catch {
    return null
  }
  return parseSharedPuzzleParams(queryParams ?? {})
}
