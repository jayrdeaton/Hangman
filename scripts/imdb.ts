/* eslint-disable no-console */
import fs from 'fs/promises'
import { createInterface } from 'readline'
import { Readable } from 'stream'
import { createGunzip } from 'zlib'

import type { Puzzle } from '../src/types/puzzle'
import { difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

const BASICS_URL = 'https://datasets.imdbws.com/title.basics.tsv.gz'
const RATINGS_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz'

const MIN_MOVIE_VOTES = 10_000
const MIN_TV_VOTES = 5_000
const MIN_RATING = 6.0

const genreMap: Record<string, string> = {
  Action: 'Action',
  Adventure: 'Adventure',
  Animation: 'Animation',
  Biography: 'Biography',
  Comedy: 'Comedy',
  Crime: 'Crime',
  Documentary: 'Documentary',
  Drama: 'Drama',
  Family: 'Family',
  Fantasy: 'Fantasy',
  History: 'History',
  Horror: 'Horror',
  Music: 'Music',
  Musical: 'Musical',
  Mystery: 'Mystery',
  Romance: 'Romance',
  'Sci-Fi': 'Sci-Fi',
  Sport: 'Sport',
  Thriller: 'Thriller',
  War: 'War',
  Western: 'Western'
}

const streamLines = async (url: string, onLine: (cols: string[]) => void): Promise<void> => {
  console.log(`Downloading ${url}...`)
  const res = await fetch(url)

  if (!res.ok || !res.body) {
    throw new Error(`Fetch failed: ${res.status} ${url}`)
  }

  const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  const rl = createInterface({ input: nodeStream.pipe(createGunzip()), crlfDelay: Infinity })

  let header = true

  for await (const line of rl) {
    if (header) {
      header = false
      continue
    }
    onLine(line.split('\t'))
  }
}

const main = async () => {
  const allRatings = new Map<string, { rating: number; votes: number }>()

  await streamLines(RATINGS_URL, ([tconst, averageRating, numVotes]) => {
    const votes = parseInt(numVotes, 10)
    const rating = parseFloat(averageRating)

    if (!isNaN(votes) && !isNaN(rating)) {
      allRatings.set(tconst, { rating, votes })
    }
  })

  console.log(`Loaded ${allRatings.size} ratings`)

  const movies: Puzzle[] = []
  const tvShows: Puzzle[] = []

  await streamLines(BASICS_URL, ([tconst, titleType, primaryTitle, , isAdult, startYear, , , genres]) => {
    if (isAdult === '1') return
    if (!primaryTitle || primaryTitle === '\\N') return

    const isMovie = titleType === 'movie'
    const isTVShow = titleType === 'tvSeries' || titleType === 'tvMiniSeries'

    if (!isMovie && !isTVShow) return

    const r = allRatings.get(tconst)
    if (!r || r.rating < MIN_RATING) return

    const minVotes = isMovie ? MIN_MOVIE_VOTES : MIN_TV_VOTES
    if (r.votes < minVotes) return

    const answer = primaryTitle
    const normalized = normalize(answer)
    if (!normalized || normalized.length < 2) return

    const genreList = genres?.split(',') ?? []
    const source = isMovie ? ('movie' as const) : ('tv' as const)
    const defaultCategory = isMovie ? 'Movie' : 'TV Show'
    const category = genreList.map((g) => genreMap[g]).find(Boolean) ?? defaultCategory

    const score = difficulty(answer)

    const puzzle: Puzzle = {
      id: id(answer, category),
      source,
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
        year: startYear !== '\\N' ? startYear : undefined,
        rating: r.rating,
        votes: r.votes
      }
    }

    if (isMovie) movies.push(puzzle)
    else tvShows.push(puzzle)
  })

  await fs.mkdir('./data', { recursive: true })
  await fs.writeFile('./data/movies.json', JSON.stringify(movies, null, 2))
  console.log(`Saved ${movies.length} movies`)
  await fs.writeFile('./data/tvShows.json', JSON.stringify(tvShows, null, 2))
  console.log(`Saved ${tvShows.length} TV shows`)
}

main().catch(console.error)
