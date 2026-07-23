/* eslint-disable no-console */
import * as cheerio from 'cheerio'
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'
import { difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

type LandmarkSeed = {
  answer: string
  category: 'National Park' | 'World Heritage Site' | 'World Wonder'
  tags?: string[]
  metadata?: Record<string, unknown>
}

const cleanWikiText = (value: string) => {
  return value
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\W+|\W+$/g, '')
    .trim()
}

const sanitizeAnswer = (value: string) => {
  const text = cleanWikiText(value)
  if (!text) return null
  if (/^\d+$/.test(text)) return null
  if (text.length < 3) return null

  const normalized = normalize(text)
  if (!normalized) return null
  if (uniqueLetters(normalized) < 2) return null

  return text
}

const fetchHtml = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'HangmanGame/1.0 (geography landmarks scraper)'
    }
  })

  if (!res.ok) {
    throw new Error(`Request failed ${res.status} for ${url}`)
  }

  return res.text()
}

const createPuzzle = (seed: LandmarkSeed): Puzzle => {
  const normalized = normalize(seed.answer)
  const score = difficulty(seed.answer)

  return {
    id: id(seed.answer, seed.category),
    source: 'geography',
    type: 'title',
    answer: seed.answer,
    normalizedAnswer: normalized,
    category: seed.category,
    difficulty: score,
    difficultyTier: difficultyTier(score),
    wordCount: normalized.split(' ').length,
    letterCount: normalized.replace(/ /g, '').length,
    uniqueLetterCount: uniqueLetters(normalized),
    tags: seed.tags,
    metadata: seed.metadata
  }
}

const dedupeSeeds = (seeds: LandmarkSeed[]) => {
  const seen = new Set<string>()
  const unique: LandmarkSeed[] = []

  for (const seed of seeds) {
    const key = `${normalize(seed.answer)}:${seed.category}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(seed)
  }

  return unique
}

const parseUSNationalParks = async (): Promise<LandmarkSeed[]> => {
  const url = 'https://en.wikipedia.org/wiki/List_of_national_parks_of_the_United_States'
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const seeds: LandmarkSeed[] = []

  $('table.wikitable tbody tr').each((_, row) => {
    const cells = $(row).find('th,td')
    if (cells.length < 2) return

    const answer = sanitizeAnswer($(cells[0]).text())
    if (!answer) return
    if (normalize(answer) === 'NAME') return

    seeds.push({
      answer,
      category: 'National Park',
      tags: ['geography', 'landmark', 'park', 'us'],
      metadata: { source: url, region: 'us' }
    })
  })

  return seeds
}

const parseWorldHeritageSites = async (): Promise<LandmarkSeed[]> => {
  const url = 'https://en.wikipedia.org/wiki/List_of_World_Heritage_Sites_by_year_of_inscription'
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const seeds: LandmarkSeed[] = []
  let currentCountry = ''

  $('table.wikitable tbody tr').each((_, row) => {
    const cells = $(row)
      .find('th,td')
      .map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      .get()

    if (cells.length < 3) return

    // Row variants:
    // [country, site, category, ref]
    // [site, category, ref] when country cell is omitted due to rowspan
    let siteText = ''

    if (cells.length >= 4) {
      currentCountry = cleanWikiText(cells[0])
      siteText = cells[1]
    } else {
      siteText = cells[0]
    }

    const answer = sanitizeAnswer(siteText)
    if (!answer) return
    if (normalize(answer) === 'SITE') return

    seeds.push({
      answer,
      category: 'World Heritage Site',
      tags: ['geography', 'landmark', 'unesco'],
      metadata: {
        source: url,
        country: currentCountry || undefined
      }
    })
  })

  return seeds
}

const parseNewWorldWonders = async (): Promise<LandmarkSeed[]> => {
  const url = 'https://en.wikipedia.org/wiki/New_7_Wonders_of_the_World'
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const seeds: LandmarkSeed[] = []

  $('table.wikitable tbody tr').each((_, row) => {
    const cells = $(row).find('th,td')
    if (cells.length < 2) return

    const answer = sanitizeAnswer($(cells[0]).text())
    if (!answer) return
    if (normalize(answer) === 'WONDER') return

    seeds.push({
      answer,
      category: 'World Wonder',
      tags: ['geography', 'landmark', 'wonder'],
      metadata: { source: url }
    })
  })

  return seeds
}

async function main() {
  const [parks, heritage, wonders] = await Promise.all([
    parseUSNationalParks(),
    parseWorldHeritageSites(),
    parseNewWorldWonders()
  ])

  const parkPuzzles = dedupeSeeds(parks).map(createPuzzle)
  const heritagePuzzles = dedupeSeeds(heritage).map(createPuzzle)
  const wonderPuzzles = dedupeSeeds(wonders).map(createPuzzle)

  const all = dedupeSeeds([...parks, ...heritage, ...wonders]).map(createPuzzle)

  await fs.mkdir('./data', { recursive: true })

  await Promise.all([
    fs.writeFile('./data/geographyNationalParks.json', JSON.stringify(parkPuzzles, null, 2)),
    fs.writeFile('./data/geographyLandmarksUNESCO.json', JSON.stringify(heritagePuzzles, null, 2)),
    fs.writeFile('./data/geographyWorldWonders.json', JSON.stringify(wonderPuzzles, null, 2)),
    fs.writeFile('./data/geographyLandmarks.json', JSON.stringify(all, null, 2))
  ])

  console.log(`saved national parks: ${parkPuzzles.length}`)
  console.log(`saved world heritage sites: ${heritagePuzzles.length}`)
  console.log(`saved world wonders: ${wonderPuzzles.length}`)
  console.log(`saved total landmarks: ${all.length}`)
}

main().catch(console.error)
