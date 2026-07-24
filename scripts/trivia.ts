/* eslint-disable no-console */
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'
import { difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

type TriviaRow = {
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
  const rows: TriviaRow[] = JSON.parse(raw)

  const puzzles: Puzzle[] = []

  for (const row of rows) {
    const answer = row.answer
    if (!answer) continue

    const n = normalize(answer)
    const category = row.category || 'Trivia'
    const score = difficulty(answer)

    puzzles.push({
      id: id(answer, category),
      source: 'trivia',
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
        airDate: row.air_date
      }
    })
  }

  await fs.mkdir('./data/raw', { recursive: true })
  await fs.writeFile('./data/raw/trivia.json', JSON.stringify(puzzles, null, 2))
  console.log('saved', puzzles.length, 'to data/raw/trivia.json — run scraper:trivia:curate to build the shipped pack')
}

main().catch(console.error)
