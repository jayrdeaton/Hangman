import * as Linking from 'expo-linking'

import { ALL_MODES, DEFAULT_MODE } from '@/modes/registry'
import type { GameStartPayload } from '@/types/gameSession'

import { normalizePhrase, type PuzzleConfig } from './puzzlePicker'

// Matches the drawer's own TextInput maxLength props — a link claiming a longer phrase/hint than
// the UI could ever produce is malformed (or hostile), not a puzzle worth trying to resolve.
const MAX_PHRASE_LENGTH = 128
const MAX_HINT_LENGTH = 80

const findMode = (id: string | string[] | undefined) => {
  if (typeof id !== 'string') return DEFAULT_MODE
  return ALL_MODES.find((candidate) => candidate.id === id) ?? DEFAULT_MODE
}

// Built from an already-resolved payload (not raw draft state) so a shared link always carries a
// validated, normalized phrase — never whatever half-typed text was sitting in the input.
export const buildPuzzleLink = (payload: Pick<GameStartPayload, 'phrase' | 'hint' | 'mode'>): string => Linking.createURL('play', { queryParams: { phrase: payload.phrase, hint: payload.hint ?? '', mode: payload.mode.id } })

// Returns null for any link that isn't a recognized, playable puzzle share — including the app's
// own default URL with no query params, an untrusted/hand-crafted URL Linking.parse can't decode,
// a phrase that would normalize to nothing, or a phrase/hint longer than the drawer's own input
// limits — so callers can always safely fall back to the normal auto-start puzzle instead of
// committing to a puzzle that would only fail to resolve two layers further down.
export const parseSharedPuzzle = (url: string): PuzzleConfig | null => {
  let queryParams: Linking.QueryParams | null
  try {
    ;({ queryParams } = Linking.parse(url))
  } catch {
    return null
  }

  const phrase = queryParams?.phrase
  if (typeof phrase !== 'string' || phrase.length > MAX_PHRASE_LENGTH) return null
  if (normalizePhrase(phrase).replace(/ /g, '').length === 0) return null

  const hint = queryParams?.hint
  const customHint = typeof hint === 'string' ? hint : ''
  if (customHint.length > MAX_HINT_LENGTH) return null

  return {
    sourceMode: 'custom',
    difficulty: 'any',
    packKey: '',
    mode: findMode(queryParams?.mode),
    customPhrase: phrase,
    customHint
  }
}
