/* eslint-disable no-console */
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'
import { difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

const TOKEN = process.env.SPOTIFY_TOKEN

type Track = {
  name: string
  popularity: number
}

async function fetchTopTracks(): Promise<Track[]> {
  if (!TOKEN) {
    throw new Error('Missing SPOTIFY_TOKEN environment variable')
  }

  const res = await fetch(`https://api.spotify.com/v1/playlists/37i9dQZF1DXcBWIGoYBM5M/tracks`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`
    }
  })

  if (!res.ok) {
    throw new Error(`Spotify request failed: ${res.status}`)
  }

  const data = await res.json()

  if (!Array.isArray(data.items)) {
    throw new Error('Spotify response missing items array')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.items.map((i: any) => i.track)
}

async function main() {
  const tracks = await fetchTopTracks()

  const puzzles: Puzzle[] = tracks.map((t) => {
    const n = normalize(t.name)
    const score = difficulty(t.name)

    // const primaryGenre = tags[0] ? `${capitalize(tags[0])} Band` : 'Band'

    return {
      id: id(t.name, 'Song'),
      source: 'music-song',
      type: 'song',
      answer: t.name,
      normalizedAnswer: n,
      category: 'Song',
      difficulty: score,
      difficultyTier: difficultyTier(score),
      wordCount: n.split(' ').length,
      letterCount: n.replace(/ /g, '').length,
      uniqueLetterCount: uniqueLetters(n),
      metadata: {
        popularity: t.popularity
      }
    }
  })

  await fs.mkdir('./data', { recursive: true })
  await fs.writeFile('./data/songs.json', JSON.stringify(puzzles, null, 2))
  console.log('saved', puzzles.length)
}

main().catch(console.error)
