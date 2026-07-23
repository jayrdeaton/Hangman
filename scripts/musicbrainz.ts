/* eslint-disable no-console */
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'
import { capitalize, difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

type MusicBrainzArtist = {
  name: string
  tags?: { name: string }[]
  'artist-type'?: string
}

async function fetchBands(offset = 0) {
  const params = new URLSearchParams({
    query: 'tag:rock',
    fmt: 'json',
    limit: '100',
    offset: String(offset)
  })

  const response = await fetch(`https://musicbrainz.org/ws/2/artist?${params}`, {
    headers: {
      'User-Agent': 'HangmanGame/1.0 (your@email.com)'
    }
  })

  if (!response.ok) {
    throw new Error(`MusicBrainz request failed: ${response.status}`)
  }

  const data = await response.json()

  return data.artists as MusicBrainzArtist[]
}

async function main() {
  const puzzles: Puzzle[] = []

  for (let offset = 0; offset < 1000; offset += 100) {
    console.log(`Fetching ${offset}`)

    const artists = await fetchBands(offset)

    for (const artist of artists) {
      // if (artist['artist-type'] !== 'Group') {
      //   continue
      // }

      const answer = artist.name

      const normalized = normalize(answer)

      const tags = artist.tags?.map((tag) => tag.name) || []

      const primaryGenre = tags[0] ? `${capitalize(tags[0])} Band` : 'Band'
      const score = difficulty(answer)

      puzzles.push({
        id: id(answer, primaryGenre),
        source: 'music-band',
        type: 'band',
        answer,
        normalizedAnswer: normalized,
        category: primaryGenre,
        difficulty: score,
        difficultyTier: difficultyTier(score),
        wordCount: normalized.split(' ').length,
        letterCount: normalized.replace(/ /g, '').length,
        uniqueLetterCount: uniqueLetters(normalized),
        tags
      })
    }

    // be nice to MusicBrainz
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  await fs.mkdir('./data', { recursive: true })

  await fs.writeFile('./data/bands.json', JSON.stringify(puzzles, null, 2))

  console.log(`Saved ${puzzles.length} bands`)
}

main().catch(console.error)
