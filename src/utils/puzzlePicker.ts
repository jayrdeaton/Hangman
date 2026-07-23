import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload, PuzzleSourceMode } from '@/types/gameSession'
import { getPuzzleManifest, getPuzzlesForCategory, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

// Category strings come straight from wildly different source datasets — some are ALL CAPS
// Jeopardy-style category names, some are lowercase kebab-slugs (the Wheel pack). Title-casing
// each letter run (and nothing else) cleans up both without touching hyphens/quotes/spacing
// that carry real meaning, e.g. Jeopardy's own hyphenated wordplay categories.
const humanizeCategory = (category: string): string => category.replace(/[A-Za-z]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())

// Single-category packs ("Theme Technology", "Geography National Parks") have exactly one
// category value that just restates part of the pack's own label, so showing both reads as a
// stutter ("Theme Technology: Technology") — just show the label alone in that case.
const buildHint = (pack: { label: string; categories: string[] }, category: string): string => (pack.categories.length <= 1 ? pack.label : `${pack.label}: ${humanizeCategory(category)}`)

export const normalizePhrase = (value: string): string =>
  value
    .replace(/[^A-Za-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

export type PuzzleConfig = {
  sourceMode: PuzzleSourceMode
  difficulty: 'any' | PuzzleDifficultyTier
  packKey: string
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

const pickRandomPackPuzzle = (difficultyFilter?: PuzzleDifficultyTier) => {
  const manifest = getPuzzleManifest().filter((item) => item.count > 0)
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
export const resolvePuzzle = (config: PuzzleConfig): PuzzleResolution => {
  const difficultyFilter = config.difficulty === 'any' ? undefined : config.difficulty

  if (config.sourceMode === 'custom') {
    const normalized = normalizePhrase(config.customPhrase)
    if (!normalized || normalized.replace(/ /g, '').length === 0) {
      return { ok: false, error: 'Enter a secret word using letters A-Z (spaces allowed).' }
    }

    const hint = config.customHint.replace(/\s+/g, ' ').trim()
    return { ok: true, payload: { phrase: normalized, mode: config.mode, sourceMode: 'custom', hint: hint || undefined } }
  }

  if (config.sourceMode === 'category') {
    if (!config.packKey) return { ok: false, error: 'Choose a category pack to start.' }

    const pack = getPuzzleManifest().find((item) => item.key === config.packKey)
    const picked = pickPuzzleFromPack(config.packKey, difficultyFilter)

    if (!pack || !picked) return { ok: false, error: 'This category has no puzzles for the selected difficulty.' }

    return {
      ok: true,
      payload: {
        phrase: picked.normalizedAnswer,
        mode: config.mode,
        sourceMode: 'category',
        packKey: pack.key,
        packLabel: pack.label,
        puzzleId: picked.puzzle.id,
        difficultyTier: picked.puzzle.difficultyTier,
        hint: buildHint(pack, picked.puzzle.category)
      }
    }
  }

  const randomPick = pickRandomPackPuzzle(difficultyFilter)
  if (!randomPick) return { ok: false, error: 'Could not find a puzzle for the selected difficulty.' }

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
      hint: buildHint(randomPick.pack, randomPick.puzzle.category)
    }
  }
}
