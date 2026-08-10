import type { Puzzle } from '@/types/puzzle'
import { getCustomPackPuzzles, getCustomPackSummaries, isCustomPackKey } from '@/utils/customPacks'

import { loadPuzzlesByKey, puzzleManifest, type PuzzleManifestItem } from '../data/puzzleCatalog.generated'

export type { PuzzleManifestItem }

export type PuzzleDifficultyTier = 'easy' | 'medium' | 'hard'

// Primary sort by group (so related packs like Sports' NFL/NBA/MLB/... actually land together
// instead of scattered wherever their key happens to fall alphabetically), secondary by label
// within a group. A group-less pack (Bands' own decade packs, and every custom pack — neither has a
// `group`) sorts after every named group, not before: '￿' compares larger than any real group
// name, so those items collect at the end rather than jumping ahead of "Animals" etc. This ordering
// is what every caller that lists packs (PacksScreen, PuzzleDrawer, AchievementsDrawer) sees, since
// they all read through this one function rather than sorting independently.
const compareManifestItems = (a: PuzzleManifestItem, b: PuzzleManifestItem): number => {
  const groupCompare = (a.group ?? '￿').localeCompare(b.group ?? '￿', undefined, { numeric: true, sensitivity: 'base' })
  if (groupCompare !== 0) return groupCompare
  return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
}

// Merges the build-time generated packs with whatever user-created packs are currently cached in
// memory (see customPacks.ts) so every caller — the pack picker, the drawer, unlock tracking —
// treats a custom pack exactly like a built-in one without knowing the difference.
export const getPuzzleManifest = (): PuzzleManifestItem[] => [...puzzleManifest, ...getCustomPackSummaries()].sort(compareManifestItems)

export const getPuzzlesForCategory = (key: string, difficultyTier?: PuzzleDifficultyTier): Puzzle[] => {
  const puzzles = isCustomPackKey(key) ? getCustomPackPuzzles(key) : loadPuzzlesByKey(key)

  if (!difficultyTier) return puzzles

  return puzzles.filter((p: Puzzle) => p.difficultyTier === difficultyTier)
}
