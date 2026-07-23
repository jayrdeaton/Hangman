/* eslint-disable no-console */
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'
import { difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

const API_KEY = process.env.TMDB_API_KEY

type TVShow = {
  id: number
  name: string
  genre_ids: number[]
  first_air_date?: string
  popularity: number
  vote_average: number
}

const genres: Record<number, string> = {
  28: 'Action',
  35: 'Comedy',
  18: 'Drama',
  27: 'Horror',
  878: 'Sci-Fi',
  10749: 'Romance'
}

const fetchTVShows = async (page: number): Promise<TVShow[]> => {
  if (!API_KEY) {
    throw new Error('Missing TMDB_API_KEY environment variable')
  }

  const res = await fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${API_KEY}&page=${page}`)

  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status}`)
  }

  const data = await res.json()

  if (!Array.isArray(data.results)) {
    throw new Error(`TMDB response missing results for page ${page}`)
  }

  return data.results ?? []
}

const main = async () => {
  const puzzles: Puzzle[] = []

  for (let page = 1; page <= 10; page++) {
    console.log('tv shows page', page)

    const tvShows = await fetchTVShows(page)

    for (const m of tvShows) {
      const answer = m.name
      if (!answer) continue

      const normalized = normalize(answer)
      const score = difficulty(answer)

      const category = genres[m.genre_ids?.[0]] ?? 'TV Show'

      puzzles.push({
        id: id(answer, category),
        source: 'tv',
        type: 'title',
        answer,
        normalizedAnswer: normalized,
        category,
        difficulty: score,
        difficultyTier: difficultyTier(score),
        wordCount: normalized.split(' ').length,
        letterCount: normalized.replace(/ /g, '').length,
        uniqueLetterCount: uniqueLetters(normalized),
        metadata: {
          year: m.first_air_date?.slice(0, 4),
          popularity: m.popularity,
          rating: m.vote_average
        }
      })
    }
  }

  await fs.mkdir('./data', { recursive: true })
  await fs.writeFile('./data/tvShows.json', JSON.stringify(puzzles, null, 2))
  console.log('saved', puzzles.length)
}

main().catch(console.error)
