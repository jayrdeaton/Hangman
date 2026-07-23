import type { Puzzle } from '@/types/puzzle'

import { loadAllPuzzles, loadPuzzlesByKey, puzzleManifest, type PuzzleManifestItem } from '../data/puzzleCatalog.generated'

export type PuzzleDifficultyTier = 'easy' | 'medium' | 'hard'

export const getPuzzleManifest = (): PuzzleManifestItem[] => puzzleManifest

export const getPuzzlesForCategory = (key: string, difficultyTier?: PuzzleDifficultyTier): Puzzle[] => {
  const puzzles = loadPuzzlesByKey(key)

  if (!difficultyTier) return puzzles

  return puzzles.filter((p: Puzzle) => p.difficultyTier === difficultyTier)
}

export const getAllPuzzles = (difficultyTier?: PuzzleDifficultyTier): Puzzle[] => {
  const puzzles = loadAllPuzzles()

  if (!difficultyTier) return puzzles

  return puzzles.filter((p: Puzzle) => p.difficultyTier === difficultyTier)
}
