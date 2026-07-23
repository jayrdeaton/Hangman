/* eslint-disable no-console */
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'
import { difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

type JeopardyRow = {
  category: string
  answer: string
  question: string
  value?: string
  air_date?: string
  round?: string
  show_number?: string
}

const main = async () => {
  const raw = await fs.readFile('./JEOPARDY.json', 'utf-8')
  const rows: JeopardyRow[] = JSON.parse(raw)

  const puzzles: Puzzle[] = []

  for (const row of rows) {
    const answer = row.answer
    if (!answer) continue

    const n = normalize(answer)
    const category = row.category || 'Jeopardy'
    const score = difficulty(answer)

    puzzles.push({
      id: id(answer, category),
      source: 'jeopardy',
      type: 'trivia',
      answer,
      normalizedAnswer: n,
      category,
      difficulty: score,
      difficultyTier: difficultyTier(score),
      wordCount: n.split(' ').length,
      letterCount: n.replace(/ /g, '').length,
      uniqueLetterCount: uniqueLetters(n),
      metadata: {
        question: row.question,
        value: row.value,
        round: row.round,
        airDate: row.air_date,
      },
    })
  }

  await fs.mkdir('./data', { recursive: true })
  await fs.writeFile('./data/jeopardy.json', JSON.stringify(puzzles, null, 2))
  console.log('saved', puzzles.length)
}

main().catch(console.error)
