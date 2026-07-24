/* eslint-disable no-console */
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'

// Full raw dataset has ~28k categories, 86% of which already have <=10 clues —
// the bulk of the size comes from category count, not depth. So we pick the
// deepest categories (most established, recurring trivia topics) and cap each,
// rather than just capping depth across every category.
const CATEGORY_LIMIT = 500
const PER_CATEGORY_CAP = 20

const main = async () => {
  const raw = await fs.readFile('./data/raw/trivia.json', 'utf-8')
  const puzzles: Puzzle[] = JSON.parse(raw)

  const counts = new Map<string, number>()
  for (const puzzle of puzzles) {
    counts.set(puzzle.category, (counts.get(puzzle.category) ?? 0) + 1)
  }

  const topCategories = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CATEGORY_LIMIT)
    .map(([category]) => category)

  const selected = new Set(topCategories)
  const seenCount = new Map<string, number>()
  const curated: Puzzle[] = []

  for (const puzzle of puzzles) {
    if (!selected.has(puzzle.category)) continue
    const count = seenCount.get(puzzle.category) ?? 0
    if (count >= PER_CATEGORY_CAP) continue
    seenCount.set(puzzle.category, count + 1)
    curated.push(puzzle)
  }

  await fs.writeFile('./data/trivia.json', JSON.stringify(curated, null, 2))
  console.log(`curated ${curated.length} clues across ${selected.size} categories (raw: ${puzzles.length} clues across ${counts.size} categories)`)
}

main().catch(console.error)
