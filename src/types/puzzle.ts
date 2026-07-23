export * from './gameModes'

export type PuzzleSource = 'wheel' | 'jeopardy' | 'movie' | 'tv' | 'music-band' | 'music-song' | 'geography' | 'theme'

export type Puzzle = {
  id: string
  source: PuzzleSource
  type: 'phrase' | 'trivia' | 'title' | 'band' | 'song'

  answer: string
  normalizedAnswer: string

  category: string

  difficulty: number
  difficultyTier: 'easy' | 'medium' | 'hard'

  wordCount: number
  letterCount: number
  uniqueLetterCount: number

  tags?: string[]
  metadata?: Record<string, unknown>
}
