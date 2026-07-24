/* eslint-disable no-console */
import * as cheerio from 'cheerio'
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'
import { difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

type GeographySeed = {
  answer: string
  category: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

const cleanWikiText = (value: string) => {
  return value
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
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

const createPuzzle = (seed: GeographySeed): Puzzle => {
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

const fetchHtml = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'HangmanGame/1.0 (geography scraper)'
    }
  })

  if (!res.ok) {
    throw new Error(`Request failed ${res.status} for ${url}`)
  }

  return res.text()
}

const parseCountries = async (): Promise<GeographySeed[]> => {
  const url = 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population'
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const seeds: GeographySeed[] = []

  $('table.wikitable.sortable tbody tr').each((_, row) => {
    const cells = $(row)
      .find('th,td')
      .map((__, cell) => $(cell).text())
      .get()

    if (cells.length < 2) return

    const answer = sanitizeAnswer(cells[0])
    if (!answer) return
    if (normalize(answer) === 'WORLD') return
    if (normalize(answer) === 'LOCATION') return

    seeds.push({
      answer,
      category: 'Country',
      tags: ['geography', 'country'],
      metadata: { source: url }
    })
  })

  return seeds
}

const parseUSStates = async (): Promise<GeographySeed[]> => {
  const url = 'https://en.wikipedia.org/wiki/List_of_states_and_territories_of_the_United_States'
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const seeds: GeographySeed[] = []

  $('table.wikitable.sortable tbody tr').each((_, row) => {
    const cells = $(row).find('th,td')
    if (cells.length < 2) return

    const stateName = sanitizeAnswer($(cells[0]).text())
    const capitalName = sanitizeAnswer($(cells[2]).text())

    if (stateName) {
      seeds.push({
        answer: stateName,
        category: 'US State',
        tags: ['geography', 'us-state'],
        metadata: { source: url }
      })
    }

    if (capitalName) {
      seeds.push({
        answer: capitalName,
        category: 'US State Capital',
        tags: ['geography', 'capital', 'us'],
        metadata: { source: url }
      })
    }
  })

  return seeds
}

const parseWorldCities = async (): Promise<GeographySeed[]> => {
  const url = 'https://en.wikipedia.org/wiki/List_of_largest_cities'
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const seeds: GeographySeed[] = []

  $('table.wikitable.sortable tbody tr').each((_, row) => {
    const cells = $(row).find('th,td')
    if (cells.length < 2) return

    const cityName = sanitizeAnswer($(cells[0]).text())

    if (!cityName) return
    if (normalize(cityName) === 'CITY') return
    if (normalize(cityName) === 'DEFINITION') return

    seeds.push({
      answer: cityName,
      category: 'World City',
      tags: ['geography', 'city'],
      metadata: { source: url }
    })
  })

  return seeds
}

const dedupeSeeds = (seeds: GeographySeed[]) => {
  const seen = new Set<string>()
  const unique: GeographySeed[] = []

  for (const seed of seeds) {
    const key = `${normalize(seed.answer)}:${seed.category}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(seed)
  }

  return unique
}

async function main() {
  const [countries, states, cities] = await Promise.all([parseCountries(), parseUSStates(), parseWorldCities()])

  const countryPuzzles = dedupeSeeds(countries).map(createPuzzle)
  const statePuzzles = dedupeSeeds(states).map(createPuzzle)
  const cityPuzzles = dedupeSeeds(cities).map(createPuzzle)

  const all = dedupeSeeds([...countries, ...states, ...cities]).map(createPuzzle)

  await fs.mkdir('./data', { recursive: true })

  await Promise.all([fs.writeFile('./data/geographyCountries.json', JSON.stringify(countryPuzzles, null, 2)), fs.writeFile('./data/geographyUSStates.json', JSON.stringify(statePuzzles, null, 2)), fs.writeFile('./data/geographyCities.json', JSON.stringify(cityPuzzles, null, 2)), fs.writeFile('./data/geography.json', JSON.stringify(all, null, 2))])

  console.log(`saved countries: ${countryPuzzles.length}`)
  console.log(`saved us states/capitals: ${statePuzzles.length}`)
  console.log(`saved world cities: ${cityPuzzles.length}`)
  console.log(`saved total geography: ${all.length}`)
}

main().catch(console.error)
