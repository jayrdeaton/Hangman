/* eslint-disable no-console */
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'
import { difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

const API_KEY = process.env.LASTFM_API_KEY
const BASE = 'https://ws.audioscrobbler.com/2.0/'

type Track = {
  name: string
  artist: { name: string }
  playcount: string
  listeners: string
}

const fetchTopTracks = async (page: number): Promise<Track[]> => {
  if (!API_KEY) throw new Error('Missing LASTFM_API_KEY')

  const params = new URLSearchParams({
    method: 'chart.getTopTracks',
    api_key: API_KEY,
    format: 'json',
    limit: '200',
    page: String(page),
  })

  const res = await fetch(`${BASE}?${params}`)
  if (!res.ok) throw new Error(`Last.fm request failed: ${res.status}`)

  const data = await res.json()
  return data.tracks?.track ?? []
}

const main = async () => {
  const puzzles: Puzzle[] = []
  const seen = new Set<string>()

  for (let page = 1; page <= 10; page++) {
    console.log(`Fetching page ${page}...`)
    const tracks = await fetchTopTracks(page)

    for (const t of tracks) {
      const answer = t.name
      if (!answer) continue

      const normalized = normalize(answer)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)

      const score = difficulty(answer)

      puzzles.push({
        id: id(answer, 'Song'),
        source: 'music-song',
        type: 'song',
        answer,
        normalizedAnswer: normalized,
        category: 'Song',
        difficulty: score,
        difficultyTier: difficultyTier(score),
        wordCount: normalized.split(' ').length,
        letterCount: normalized.replace(/ /g, '').length,
        uniqueLetterCount: uniqueLetters(normalized),
        metadata: {
          artist: t.artist.name,
          listeners: parseInt(t.listeners, 10),
          playcount: parseInt(t.playcount, 10),
        },
      })
    }
  }

  await fs.mkdir('./data', { recursive: true })
  await fs.writeFile('./data/songs.json', JSON.stringify(puzzles, null, 2))
  console.log(`Saved ${puzzles.length} songs`)
}

main().catch(console.error)
