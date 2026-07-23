import crypto from 'crypto'
import 'dotenv/config'

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
  const rare = (n.match(/[QZXJVK]/g) || []).length

  return n.length * 0.4 + uniqueLetters(n) * 1.5 + rare * 2.5
}

export const difficultyTier = (score: number): 'easy' | 'medium' | 'hard' => {
  if (score < 12) return 'easy'
  if (score < 20) return 'medium'
  return 'hard'
}

export const id = (answer: string, category: string) => {
  return crypto.createHash('md5').update(`${answer}:${category}`).digest('hex')
}

export const capitalize = (text: string) => {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
