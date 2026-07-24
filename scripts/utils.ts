import 'dotenv/config'

import crypto from 'crypto'

export const normalize = (text: string) => {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const uniqueLetters = (text: string) => {
  return new Set(text.replace(/[^A-Z]/g, '')).size
}

export const difficulty = (text: string) => {
  const n = normalize(text)
  const letters = n.replace(/[^A-Z]/g, '')

  // Primary driver: in classic Hangman a "miss" only happens when a guessed
  // letter is NOT present anywhere in the answer. The mechanical risk of
  // losing is therefore governed almost entirely by how many of the 26
  // alphabet letters are ABSENT from the answer -- those are guaranteed
  // misses if a player ever guesses them. More alphabet coverage (more
  // unique letters present) can only ever reduce guaranteed misses, so it
  // must make a puzzle EASIER, never harder -- the opposite of the old
  // formula, which rewarded unique-letter count with a higher score.
  const absentLetterCount = 26 - uniqueLetters(n)
  const missRisk = absentLetterCount * 4 // 0 (pangram, 0 absent) .. 104 (no letters at all present)

  // Secondary, intentionally minor: very short answers give a player fewer
  // total letter-instances and less word-boundary context to reason from,
  // so nudge difficulty up slightly as length shrinks. This fully saturates
  // (contributes 0) once the answer has 15+ letters, so length can never
  // dominate the primary miss-risk term -- it can only break ties among
  // answers with similar alphabet coverage. Max contribution is 6 points,
  // ~5% of the formula's full 0-110 range.
  const lengthPenalty = Math.max(0, 15 - letters.length) * 0.4

  return Math.round((missRisk + lengthPenalty) * 10) / 10
}

export const difficultyTier = (score: number): 'easy' | 'medium' | 'hard' => {
  if (score < 65) return 'easy'
  if (score < 80) return 'medium'
  return 'hard'
}

export const id = (answer: string, category: string) => {
  return crypto.createHash('md5').update(`${answer}:${category}`).digest('hex')
}

export const capitalize = (text: string) => {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
