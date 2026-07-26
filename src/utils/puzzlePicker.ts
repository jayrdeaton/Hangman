import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload, PuzzleSourceMode } from '@/types/gameSession'
import type { Puzzle, PuzzleSource } from '@/types/puzzle'
import { getPuzzleManifest, getPuzzlesForCategory, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

import { normalizePhrase } from './normalizePhrase'

export { normalizePhrase }

// Category strings come straight from wildly different source datasets — some are ALL CAPS
// Trivia-style category names, some are lowercase kebab-slugs (the Phrases pack). Title-casing
// each letter run (and nothing else) cleans up both without touching hyphens/quotes/spacing
// that carry real meaning, e.g. Trivia's own hyphenated wordplay categories.
//
// A category that's mostly lowercase/mixed-case (e.g. "TV Show", "US President") was authored
// by hand rather than scraped as one uniform shouting case, so an all-caps run within it (TV,
// US) is almost certainly a real acronym — left alone rather than forced through the same
// lowercase-the-rest pass that turns Trivia's ALL-CAPS categories readable. Judged by the
// ratio of uppercase letters in the whole string, not just "any lowercase present", since a
// handful of Trivia categories ("THE 1980s", "20th CENTURY WOMEN") carry an incidental
// lowercase ordinal suffix while still being overwhelmingly shouted from an all-caps source.
const ORDINAL_SUFFIX = /^(st|nd|rd|th|s)$/i

const humanizeCategory = (category: string): string => {
  const letters = category.replace(/[^A-Za-z]/g, '')
  const upperRatio = letters.length === 0 ? 1 : [...letters].filter((c) => c === c.toUpperCase()).length / letters.length
  const isHandAuthored = upperRatio < 0.7

  return category.replace(/[A-Za-z]+/g, (word, offset: number, full: string) => {
    // A leading digit run (as in "20th" or "1980s") splits off its own letter-run match here
    // ("th", "s") since digits and letters don't share a \w-style class in this regex — left
    // lowercase rather than title-cased into a stray-looking "20Th"/"1980S".
    if (offset > 0 && /\d/.test(full[offset - 1]) && ORDINAL_SUFFIX.test(word)) return word.toLowerCase()
    if (isHandAuthored && word === word.toUpperCase()) return word
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })
}

// Movie/TV genres ("Action", "Comedy") are scraped as bare genre words shared by both packs —
// alone they read as ambiguous (an "Action" hint could be anything), so the pack's own subject
// gets folded in as a suffix, e.g. "Action Movies". Skipped when the category is already the
// ungenred fallback bucket ("Movie", "TV Show") so it doesn't double up into "Movie Movies".
const SUBJECT_SUFFIX: Partial<Record<PuzzleSource, string>> = { movie: 'Movies', tv: 'Shows' }

const buildHint = (puzzle: Pick<Puzzle, 'category' | 'source' | 'metadata'>): string => {
  const explicitHint = puzzle.metadata?.hint
  if (typeof explicitHint === 'string' && explicitHint.trim().length > 0) return explicitHint.trim()

  const category = humanizeCategory(puzzle.category)
  const suffix = SUBJECT_SUFFIX[puzzle.source]
  if (!suffix || category.toLowerCase().includes(suffix.toLowerCase().slice(0, -1))) return category
  return `${category} ${suffix}`
}

export type PuzzleConfig = {
  sourceMode: PuzzleSourceMode
  difficulty: 'any' | PuzzleDifficultyTier
  mode: GameMode
  customPhrase: string
  customHint: string
}

export type PuzzleResolution = { ok: true; payload: GameStartPayload } | { ok: false; error: string }

const pickPuzzleFromPack = (packKey: string, difficultyFilter?: PuzzleDifficultyTier) => {
  const sourcePuzzles = getPuzzlesForCategory(packKey, difficultyFilter)
  const normalizedPuzzles = sourcePuzzles.map((puzzle) => ({ puzzle, normalized: normalizePhrase(puzzle.answer) })).filter((item) => item.normalized.length > 0)

  if (normalizedPuzzles.length === 0) return null

  const picked = normalizedPuzzles[Math.floor(Math.random() * normalizedPuzzles.length)]
  return { puzzle: picked.puzzle, normalizedAnswer: picked.normalized }
}

// A random draw, scoped to whichever packs the player has checked (defaults to all of them).
const pickRandomPackPuzzle = (allowedKeys: Set<string>, difficultyFilter?: PuzzleDifficultyTier) => {
  const manifest = getPuzzleManifest().filter((item) => item.count > 0 && allowedKeys.has(item.key))
  const candidatePacks = manifest.filter((item) => (difficultyFilter ? item.difficultyTiers.includes(difficultyFilter) : true))

  const shuffled = [...candidatePacks].sort(() => Math.random() - 0.5)
  for (const pack of shuffled) {
    const picked = pickPuzzleFromPack(pack.key, difficultyFilter)
    if (picked) return { ...picked, pack }
  }

  return null
}

// Shared by the initial auto-start (Main mounts straight into a game, no setup screen) and the
// drawer's "New Puzzle" confirm — one place picks the word so both stay in sync.
//
// packKeys is a separate argument, not a PuzzleConfig field: it's not something the caller stages
// and confirms like the rest of config — it's normally the live, persisted pack-selection default
// (see usePackSelection), except for the one deliberate override "Another in category" makes to
// narrow a single draw to just the pack just won. Keeping it explicit here makes that override
// visible at the call site instead of hidden inside a config object that's otherwise all-staged.
export const resolvePuzzle = (config: PuzzleConfig, packKeys: string[]): PuzzleResolution => {
  const difficultyFilter = config.difficulty === 'any' ? undefined : config.difficulty

  if (config.sourceMode === 'custom') {
    const normalized = normalizePhrase(config.customPhrase)
    if (!normalized || normalized.replace(/ /g, '').length === 0) {
      return { ok: false, error: 'Enter a secret word using letters A-Z (spaces allowed).' }
    }

    const hint = config.customHint.replace(/\s+/g, ' ').trim()
    return { ok: true, payload: { phrase: normalized, mode: config.mode, sourceMode: 'custom', hint: hint || undefined } }
  }

  if (packKeys.length === 0) return { ok: false, error: 'Choose at least one pack to start.' }

  const randomPick = pickRandomPackPuzzle(new Set(packKeys), difficultyFilter)
  if (!randomPick) return { ok: false, error: 'No puzzles available for the selected packs and difficulty.' }

  return {
    ok: true,
    payload: {
      phrase: randomPick.normalizedAnswer,
      mode: config.mode,
      sourceMode: 'random',
      packKey: randomPick.pack.key,
      packLabel: randomPick.pack.label,
      puzzleId: randomPick.puzzle.id,
      difficultyTier: randomPick.puzzle.difficultyTier,
      hint: buildHint(randomPick.puzzle)
    }
  }
}
