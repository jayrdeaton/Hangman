import type { Puzzle } from '@/types/puzzle'
import { getCustomPackPuzzles, getCustomPackSummaries, isCustomPackKey } from '@/utils/customPacks'

import { loadPuzzlesByKey, puzzleManifest, type PuzzleManifestItem } from '../data/puzzleCatalog.generated'

export type PuzzleDifficultyTier = 'easy' | 'medium' | 'hard'

// Merges the build-time generated packs with whatever user-created packs are currently cached in
// memory (see customPacks.ts) so every caller — the pack picker, the drawer, unlock tracking —
// treats a custom pack exactly like a built-in one without knowing the difference.
export const getPuzzleManifest = (): PuzzleManifestItem[] => [...puzzleManifest, ...getCustomPackSummaries()]

export const getPuzzlesForCategory = (key: string, difficultyTier?: PuzzleDifficultyTier): Puzzle[] => {
  const puzzles = isCustomPackKey(key) ? getCustomPackPuzzles(key) : loadPuzzlesByKey(key)

  if (!difficultyTier) return puzzles

  return puzzles.filter((p: Puzzle) => p.difficultyTier === difficultyTier)
}
