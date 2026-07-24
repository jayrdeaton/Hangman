/* eslint-disable no-console */
import * as cheerio from 'cheerio'
import fs from 'fs/promises'

import type { Puzzle } from '../src/types/puzzle'
import { difficulty, difficultyTier, id, normalize, uniqueLetters } from './utils'

type Seed = {
  answer: string
  category: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

const FALLBACK = {
  superheroes: ['Batman', 'Superman', 'Wonder Woman', 'Spider-Man', 'Iron Man', 'Captain America', 'Thor', 'Hulk', 'Black Panther', 'Doctor Strange', 'Scarlet Witch', 'Loki', 'Joker', 'Harley Quinn', 'Green Lantern', 'The Flash', 'Aquaman', 'Black Widow', 'Deadpool', 'Wolverine'],
  cartoons: ['Mickey Mouse', 'Bugs Bunny', 'SpongeBob SquarePants', 'Scooby-Doo', 'Homer Simpson', 'Bart Simpson', 'Tom Cat', 'Jerry Mouse', 'Daffy Duck', 'Popeye', 'Shaggy Rogers', 'Velma Dinkley', 'Fred Flintstone', 'Yogi Bear', 'Dexter', 'Johnny Bravo'],
  firstLadies: ['Martha Washington', 'Abigail Adams', 'Dolley Madison', 'Eleanor Roosevelt', 'Jacqueline Kennedy Onassis', 'Lady Bird Johnson', 'Rosalynn Carter', 'Nancy Reagan', 'Hillary Clinton', 'Michelle Obama', 'Jill Biden'],
  actors: ['Meryl Streep', 'Denzel Washington', 'Tom Hanks', 'Viola Davis', 'Morgan Freeman', 'Julia Roberts', 'Leonardo DiCaprio', 'Audrey Hepburn', 'James Stewart', 'Humphrey Bogart', 'Katharine Hepburn', 'Cary Grant'],
  sportsTeams: ['Los Angeles Lakers', 'Boston Celtics', 'Golden State Warriors', 'Kansas City Chiefs', 'Green Bay Packers', 'Dallas Cowboys', 'New York Yankees', 'Boston Red Sox', 'Los Angeles Dodgers', 'Montreal Canadiens', 'Toronto Maple Leafs', 'Detroit Red Wings'],
  mythology: ['Zeus', 'Hera', 'Athena', 'Apollo', 'Artemis', 'Ares', 'Poseidon', 'Hades', 'Medusa', 'Minotaur', 'Cerberus', 'Pegasus'],
  planets: ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
  missions: ['Apollo 11', 'Apollo 13', 'Voyager 1', 'Voyager 2', 'Cassini-Huygens', 'New Horizons', 'Mars Pathfinder', 'Curiosity Rover', 'Perseverance Rover', 'International Space Station'],
  brands: ['Coca-Cola', 'Pepsi', 'Kelloggs', 'Oreos', 'Nutella', 'Kit Kat', 'Pringles', 'Doritos', 'Heinz', 'Ben and Jerrys'],
  books: ['A Tale of Two Cities', 'The Little Prince', 'The Alchemist', 'The Lord of the Rings', 'Harry Potter and the Philosophers Stone', 'The Hobbit', 'Don Quixote', 'The Da Vinci Code', 'The Catcher in the Rye', 'To Kill a Mockingbird'],
  foodAndDrink: ['Chicken Parmesan', 'Spaghetti Bolognese', 'Caesar Salad', 'Sushi Roll', 'Chocolate Cake', 'Apple Pie', 'Iced Coffee', 'Lemonade', 'Margarita Pizza', 'French Toast'],
  travel: ['Eiffel Tower', 'Great Wall of China', 'Statue of Liberty', 'Sydney Opera House', 'Golden Gate Bridge', 'Heathrow Airport', 'JFK International Airport', 'Tokyo Station', 'Machu Picchu', 'Times Square'],
  vehicles: ['Ford Mustang', 'Chevrolet Corvette', 'Tesla Model S', 'Honda Civic', 'Boeing 747', 'Airbus A320', 'Harley-Davidson Sportster', 'Yamaha R1', 'Porsche 911', 'Jeep Wrangler'],
  videoGames: ['Super Mario Bros', 'The Legend of Zelda', 'Minecraft', 'Fortnite', 'Call of Duty', 'Grand Theft Auto', 'Final Fantasy', 'Halo Infinite', 'Street Fighter', 'Animal Crossing'],
  boardGamesToys: ['Monopoly', 'Scrabble', 'Chess', 'Risk', 'Clue', 'Catan', 'Barbie', 'Lego', 'Hot Wheels', 'Rubiks Cube'],
  programmingLanguages: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'Ruby', 'Rust', 'Go', 'Swift', 'Kotlin'],
  consumerTech: ['iPhone', 'iPad', 'MacBook', 'Android', 'Bluetooth', 'Wi-Fi', 'GPS', 'Xbox', 'PlayStation', 'Kindle'],
  companies: ['Apple', 'Microsoft', 'Google', 'Amazon', 'Netflix', 'Disney', 'Toyota', 'Nike', 'Samsung', 'Coca-Cola'],
  movieTitles: ['The Godfather', 'The Dark Knight', 'Titanic', 'Jurassic Park', 'Back to the Future', 'The Matrix', 'Star Wars', 'The Lion King', 'Inception', 'Casablanca'],
  tvShows: ['Breaking Bad', 'Game of Thrones', 'Friends', 'The Office', 'Seinfeld', 'The Simpsons', 'Stranger Things', 'The X-Files', 'The Mandalorian', 'The Sopranos'],
  musicByEra: ['Michael Jackson', 'Madonna', 'Prince', 'Nirvana', 'Backstreet Boys', 'Britney Spears', 'Linkin Park', 'Taylor Swift', 'Bruno Mars', 'Billie Eilish'],
  nature: ['African Elephant', 'Bald Eagle', 'Great White Shark', 'Blue Whale', 'Giant Sequoia', 'Redwood Forest', 'Amazon Rainforest', 'Monarch Butterfly', 'Polar Bear', 'Komodo Dragon'],
  history: ['French Revolution', 'Industrial Revolution', 'American Civil War', 'World War One', 'World War Two', 'Renaissance', 'Roman Empire', 'Ottoman Empire', 'Moon Landing', 'Fall of the Berlin Wall'],
  holidays: ['New Years Day', 'Valentines Day', 'Easter Sunday', 'Halloween', 'Thanksgiving', 'Christmas Day', 'Hanukkah', 'Diwali', 'Lunar New Year', 'Independence Day'],
  // No good Wikipedia list page for this one (palindrome/tongue-twister "lists" get
  // deleted as indiscriminate) so it stays hand-curated instead of scraped.
  wordplay: [
    'Never Odd or Even',
    'A Man A Plan A Canal Panama',
    'She Sells Seashells',
    'Peter Piper Picked a Peck',
    'Red Lorry Yellow Lorry',
    'Unique New York',
    'Toy Boat',
    'Madam Im Adam',
    'Step on No Pets',
    'Live Not on Evil',
    'Was It a Cat I Saw',
    'Race Car',
    'Level',
    'Rotator',
    'Kayak',
    'Deified',
    'Repaper',
    'Wow Such Amaze',
    'How Much Wood Would a Woodchuck Chuck',
    'Fuzzy Wuzzy Was a Bear',
    'Betty Botter Bought Some Butter',
    'Sally Sells Seashells by the Seashore',
    'Irish Wristwatch',
    'Six Slippery Snails',
    'A Proper Copper Coffee Pot',
    'Freshly Fried Flying Fish'
  ]
} as const

// Wikipedia list items are often "Term – description" or "Term — citation ref" —
// keep only the term itself.
const cleanText = (value: string) => {
  return value
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s[-–—]\s/)[0]
    .replace(/\s+/g, ' ')
    .replace(/^\W+|\W+$/g, '')
    .trim()
}

// "Champions by year" / "winners by year" tables carry the occasional placeholder
// row for a strike, lockout, or cancelled season instead of a real winner —
// substring match since the wording varies ("Season cancelled due to...", "Not held", etc).
const isPlaceholderAnswer = (value: string) => /no award|vacant|tba|n\/a|^none$|cancell?ed|not held|no winner|discontinued|suspended/i.test(value.trim())

const sanitizeAnswer = (value: string) => {
  const text = cleanText(value)
  if (!text) return null
  if (text.length < 3) return null
  // Real single-entity answers (titles, names, places) top out well under this —
  // longer text is reliably a leaked description, footnote, or stray CSS/reflist
  // blob from a malformed table row, not a usable hangman answer.
  if (text.length > 50) return null
  if (/^\d+$/.test(text)) return null
  const normalized = normalize(text)
  if (!normalized) return null
  if (normalized.startsWith('LIST OF')) return null
  if (normalized.includes('WIKIPEDIA')) return null
  if (uniqueLetters(normalized) < 2) return null
  return text
}

const seedToPuzzle = (seed: Seed): Puzzle => {
  const normalized = normalize(seed.answer)
  const score = difficulty(seed.answer)
  return {
    id: id(seed.answer, seed.category),
    source: 'theme',
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

const dedupe = (seeds: Seed[]) => {
  const seen = new Set<string>()
  const unique: Seed[] = []
  for (const seed of seeds) {
    const key = `${normalize(seed.answer)}:${seed.category}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(seed)
  }
  return unique
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// All ~24 category parsers fire their Wikipedia fetches concurrently (see main()),
// which occasionally trips transient rate limiting (429s) or connection resets —
// a couple of retries with backoff clears that up instead of silently falling
// back to the (much smaller) static seed list.
const fetchHtml = async (url: string, attempt = 0): Promise<string | null> => {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'HangmanGame/1.0 (theme packs scraper)'
      }
    })

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 3) return null
      await sleep(500 * 2 ** attempt)
      return fetchHtml(url, attempt + 1)
    }

    if (!res.ok) return null

    return res.text()
  } catch {
    if (attempt >= 3) return null
    await sleep(500 * 2 ** attempt)
    return fetchHtml(url, attempt + 1)
  }
}

const fetchCategoryMembers = async (categoryTitle: string, maxItems = 250): Promise<string[]> => {
  const titles: string[] = []
  let continueToken: string | undefined

  while (titles.length < maxItems) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      list: 'categorymembers',
      cmlimit: '100',
      cmtype: 'page',
      cmnamespace: '0',
      cmtitle: categoryTitle
    })

    if (continueToken) {
      params.set('cmcontinue', continueToken)
    }

    const url = `https://en.wikipedia.org/w/api.php?${params.toString()}`

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'HangmanGame/1.0 (theme packs scraper)' }
      })

      if (!res.ok) break

      const text = await res.text()
      const data = JSON.parse(text)
      const members = data?.query?.categorymembers ?? []

      for (const member of members) {
        if (typeof member?.title === 'string') {
          titles.push(member.title)
          if (titles.length >= maxItems) break
        }
      }

      continueToken = data?.continue?.cmcontinue
      if (!continueToken || members.length === 0) break
    } catch {
      break
    }
  }

  return titles
}

const fetchTableColumn = async (url: string, tableIndex: number, columnIndex: number, skipRows = 1): Promise<string[]> => {
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)
  const values: string[] = []

  $('table.wikitable')
    .eq(tableIndex)
    .find('tbody tr')
    .slice(skipRows)
    .each((_, row) => {
      const cells = $(row).find('th,td')
      if (cells.length <= columnIndex) return
      values.push($(cells[columnIndex]).text())
    })

  return values
}

const fetchAllTablesColumn = async (url: string, columnIndex: number): Promise<string[]> => {
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)
  const values: string[] = []

  $('table.wikitable').each((_, table) => {
    $(table)
      .find('tbody tr')
      .each((__, row) => {
        const cells = $(row).find('th,td')
        if (cells.length <= columnIndex) return
        values.push($(cells[columnIndex]).text())
      })
  })

  return values
}

// Many Wikipedia "List of X" pages render their bullet lists inside {{div col}}
// multi-column wrappers rather than as direct <ul> children, and each <li> can
// carry a nested sub-list (e.g. "See also" links) that .text() would otherwise
// flatten into the same string — so nested lists are stripped before reading text.
const fetchListItems = async (url: string): Promise<string[]> => {
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)

  return $('div.mw-parser-output .div-col li, div.mw-parser-output > ul > li')
    .filter((_, li) => $(li).parents('.navbox, .vertical-navbox, #toc, table').length === 0)
    .map((_, li) => {
      const clone = $(li).clone()
      clone.find('ul, ol').remove()
      return clone.text()
    })
    .get()
}

// "List of video games considered the best" uses rowspan on the Year column for
// years with multiple entries, which shifts the Game column: when a row still
// carries its own Year cell it's a <th> and Game sits at index 1; when Year was
// merged away by a prior row's rowspan, the row starts directly with Game (<td>, index 0).
const fetchBestGamesOfAllTime = async (url: string): Promise<string[]> => {
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)
  const values: string[] = []

  $('table.wikitable')
    .eq(0)
    .find('tbody tr')
    .slice(1)
    .each((_, row) => {
      const cells = $(row).find('th,td')
      if (cells.length === 0) return
      const titleIndex = $(cells[0]).is('th') ? 1 : 0
      if (cells.length <= titleIndex) return
      values.push($(cells[titleIndex]).text())
    })

  return values
}

// State flower table: the state-name column uses rowspan for the handful of states
// with two official flowers, so rows come in two shapes — a fresh state row has 5
// cells (name at index 1), a rowspan-continuation row has 4 (name shifts to index 0).
const fetchStateFlowerNames = async (url: string): Promise<string[]> => {
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)
  const values: string[] = []

  $('table.wikitable')
    .eq(0)
    .find('tbody tr')
    .slice(1)
    .each((_, row) => {
      const cells = $(row).find('th,td')
      if (cells.length < 4) return
      const nameIndex = cells.length >= 5 ? 1 : 0
      if (cells.length <= nameIndex) return
      values.push($(cells[nameIndex]).text().replace(/\s+(spp|ssp)\.?$/i, ''))
    })

  return values
}

// "List of culinary fruits" spreads its ~900 rows across a dozen same-shaped
// wikitables (one per letter/category range) — all share a [Common name, Species
// name] header, so every table is scraped the same way. A small fraction of rows
// have no real vernacular name and just repeat the species name in both columns
// (an editor's placeholder), so rows where the first word matches are dropped.
const fetchCulinaryFruitNames = async (url: string): Promise<string[]> => {
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)
  const values: string[] = []

  $('table.wikitable').each((_, table) => {
    $(table)
      .find('tbody tr')
      .slice(1)
      .each((__, row) => {
        const cells = $(row).find('th,td')
        if (cells.length < 2) return

        const commonName = $(cells[0]).text().trim()
        const speciesName = $(cells[1]).text().trim()
        const commonFirstWord = commonName.split(' ')[0]?.toLowerCase()
        const speciesFirstWord = speciesName.split(' ')[0]?.toLowerCase()
        if (commonFirstWord && commonFirstWord === speciesFirstWord) return

        values.push(commonName)
      })
  })

  return values
}

// Keeps a genuine subtitle ("Magic: The Gathering") but drops a leaked description
// ("G.I. Joe: the G.I. Joe brand overwhelmed the competition...") — the signal is
// whether what follows the comma/colon reads like a title continuation (short,
// capitalized) or prose (lowercase start).
const trimDescriptiveTail = (text: string): string => {
  const splitIndex = text.search(/[,:]/)
  if (splitIndex === -1) return text

  const before = text.slice(0, splitIndex).trim()
  const after = text.slice(splitIndex + 1).trim()

  if (after && /^[A-Z]/.test(after) && after.split(' ').length <= 4) {
    return `${before}: ${after}`
  }

  return before
}

// National Toy Hall of Fame inductees are grouped under a "Class of YYYY" heading
// per year, each wrapped in its own <section> — the lists aren't direct children of
// mw-parser-output (some are further wrapped in div-col, some aren't), so the
// reliable way in is per-heading rather than one flat page-wide selector.
const fetchToyHallOfFameNames = async (url: string): Promise<string[]> => {
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)
  const values: string[] = []

  $('h2, h3').each((_, heading) => {
    const headingText = $(heading).text().trim()
    if (!/^class of \d{4}/i.test(headingText) && !/^original inductees/i.test(headingText)) return

    const section = $(heading).closest('section')
    const scope = section.length ? section : $(heading)

    scope.find('ol > li, ul > li').each((__, li) => {
      const clone = $(li).clone()
      clone.find('ul, ol').remove()
      values.push(trimDescriptiveTail(clone.text()))
    })
  })

  return values
}

const parsePresidents = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_presidents_of_the_United_States'
  const html = await fetchHtml(url)
  const seeds: Seed[] = []

  if (!html) {
    return FALLBACK.firstLadies.map((name) => ({
      answer: name,
      category: 'US President',
      tags: ['theme', 'history', 'us-president'],
      metadata: { source: 'fallback' }
    }))
  }

  const $ = cheerio.load(html)

  $('table.wikitable.sortable tbody tr').each((_, row) => {
    const cells = $(row).find('th,td')
    if (cells.length < 3) return
    const name = sanitizeAnswer($(cells[2]).text())
    if (!name) return

    seeds.push({
      answer: name,
      category: 'US President',
      tags: ['theme', 'history', 'us-president'],
      metadata: { source: url }
    })
  })

  return seeds
}

const parseFirstLadies = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_first_ladies_of_the_United_States'
  const html = await fetchHtml(url)

  if (!html) {
    return FALLBACK.firstLadies.map((name) => ({
      answer: name,
      category: 'First Lady',
      tags: ['theme', 'history', 'first-lady'],
      metadata: { source: 'fallback' }
    }))
  }

  const $ = cheerio.load(html)
  const seeds: Seed[] = []

  $('table.wikitable.sortable tbody tr').each((_, row) => {
    const cells = $(row).find('th,td')
    if (cells.length < 3) return
    const name = sanitizeAnswer($(cells[2]).text())
    if (!name) return

    seeds.push({
      answer: name,
      category: 'First Lady',
      tags: ['theme', 'history', 'first-lady'],
      metadata: { source: url }
    })
  })

  return seeds
}

const parseActors = async () => {
  const url = 'https://en.wikipedia.org/wiki/AFI%27s_100_Years...100_Stars'
  const html = await fetchHtml(url)

  if (!html) {
    return FALLBACK.actors.map((name) => ({
      answer: name,
      category: 'Actor',
      tags: ['theme', 'actor'],
      metadata: { source: 'fallback' }
    }))
  }

  const $ = cheerio.load(html)
  const seeds: Seed[] = []

  $('table.wikitable.sortable tbody tr').each((_, row) => {
    const cells = $(row)
      .find('th,td')
      .map((__, c) => $(c).text())
      .get()

    if (cells.length < 4) return

    const female = sanitizeAnswer(cells[1] || '')
    const male = sanitizeAnswer(cells[3] || '')

    if (female) {
      seeds.push({
        answer: female,
        category: 'Actor',
        tags: ['theme', 'actor'],
        metadata: { source: url }
      })
    }

    if (male) {
      seeds.push({
        answer: male,
        category: 'Actor',
        tags: ['theme', 'actor'],
        metadata: { source: url }
      })
    }
  })

  return seeds
}

const parseSuperheroes = async () => {
  const [dc, marvel, villains] = await Promise.all([fetchCategoryMembers('Category:DC Comics superheroes', 200), fetchCategoryMembers('Category:Marvel Comics superheroes', 200), fetchCategoryMembers('Category:Supervillains', 120)])

  const seeds = [...dc, ...marvel, ...villains]
    .map((title) => sanitizeAnswer(title))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Superhero',
      tags: ['theme', 'superhero'],
      metadata: { source: 'wikipedia-category' }
    }))

  if (seeds.length > 20) return seeds

  return FALLBACK.superheroes.map((answer) => ({
    answer,
    category: 'Superhero',
    tags: ['theme', 'superhero'],
    metadata: { source: 'fallback' }
  }))
}

const parseCartoonCharacters = async () => {
  const animated = await fetchCategoryMembers('Category:Animated characters', 220)

  const seeds = animated
    .map((title) => sanitizeAnswer(title))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Cartoon Character',
      tags: ['theme', 'cartoon'],
      metadata: { source: 'wikipedia-category' }
    }))

  if (seeds.length > 20) return seeds

  return FALLBACK.cartoons.map((answer) => ({
    answer,
    category: 'Cartoon Character',
    tags: ['theme', 'cartoon'],
    metadata: { source: 'fallback' }
  }))
}

const parseSportsTeams = async () => {
  const pages = [
    ['https://en.wikipedia.org/wiki/List_of_Super_Bowl_champions', 2],
    ['https://en.wikipedia.org/wiki/List_of_World_Series_champions', 1],
    ['https://en.wikipedia.org/wiki/List_of_Stanley_Cup_champions', 1]
  ] as const

  const seeds: Seed[] = []

  for (const [url, winnerIndex] of pages) {
    const html = await fetchHtml(url)
    if (!html) continue
    const $ = cheerio.load(html)

    $('table.wikitable tbody tr').each((_, row) => {
      const cells = $(row).find('th,td')
      if (cells.length <= winnerIndex) return

      const cellText = $(cells[winnerIndex]).text()
      if (isPlaceholderAnswer(cellText)) return

      const answer = sanitizeAnswer(cellText)
      if (!answer) return

      seeds.push({
        answer,
        category: 'Sports Team',
        tags: ['theme', 'sports', 'team'],
        metadata: { source: url }
      })
    })
  }

  if (seeds.length > 30) return seeds

  return FALLBACK.sportsTeams.map((answer) => ({
    answer,
    category: 'Sports Team',
    tags: ['theme', 'sports', 'team'],
    metadata: { source: 'fallback' }
  }))
}

const parseMythology = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_legendary_creatures_by_type'
  const items = await fetchListItems(url)

  const seeds = items
    .map((item) => sanitizeAnswer(item))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Mythology Figure',
      tags: ['theme', 'mythology'],
      metadata: { source: url }
    }))

  if (seeds.length > 20) return seeds

  return FALLBACK.mythology.map((answer) => ({
    answer,
    category: 'Mythology Figure',
    tags: ['theme', 'mythology'],
    metadata: { source: 'fallback' }
  }))
}

const parseScienceSpace = async () => {
  const planetUrl = 'https://en.wikipedia.org/wiki/List_of_Solar_System_objects_by_size'
  const html = await fetchHtml(planetUrl)
  const seeds: Seed[] = []

  if (html) {
    const $ = cheerio.load(html)
    $('table.wikitable.sortable tbody tr').each((_, row) => {
      const cells = $(row)
        .find('th,td')
        .map((__, c) => $(c).text().replace(/\s+/g, ' ').trim())
        .get()

      if (cells.length < 3) return

      const name = sanitizeAnswer(cells[0])
      if (!name) return

      const rowText = cells.join(' ').toLowerCase()
      if (!rowText.includes('planet')) return

      seeds.push({
        answer: name,
        category: 'Planet',
        tags: ['theme', 'science', 'space', 'planet'],
        metadata: { source: planetUrl }
      })
    })
  }

  const missionSeeds = FALLBACK.missions.map((answer) => ({
    answer,
    category: 'Space Mission',
    tags: ['theme', 'science', 'space', 'mission'],
    metadata: { source: 'fallback' }
  }))

  if (seeds.length === 0) {
    return [
      ...FALLBACK.planets.map((answer) => ({
        answer,
        category: 'Planet',
        tags: ['theme', 'science', 'space', 'planet'],
        metadata: { source: 'fallback' }
      })),
      ...missionSeeds
    ]
  }

  return [...seeds, ...missionSeeds]
}

const parseBrandsProducts = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_brand_name_food_products'
  const items = await fetchListItems(url)

  const seeds = items
    .map((item) => sanitizeAnswer(item))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Brand',
      tags: ['theme', 'brand', 'product'],
      metadata: { source: url }
    }))

  if (seeds.length > 15) return seeds

  return FALLBACK.brands.map((answer) => ({
    answer,
    category: 'Brand',
    tags: ['theme', 'brand', 'product'],
    metadata: { source: 'fallback' }
  }))
}

const parseLiterature = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_best-selling_books'
  const html = await fetchHtml(url)

  if (!html) {
    return FALLBACK.books.map((answer) => ({
      answer,
      category: 'Book Title',
      tags: ['theme', 'literature', 'book'],
      metadata: { source: 'fallback' }
    }))
  }

  const $ = cheerio.load(html)
  const seeds: Seed[] = []

  $('table.wikitable.sortable tbody tr').each((_, row) => {
    const cells = $(row).find('th,td')
    if (cells.length < 2) return

    const title = sanitizeAnswer($(cells[0]).text())
    if (!title) return

    seeds.push({
      answer: title,
      category: 'Book Title',
      tags: ['theme', 'literature', 'book'],
      metadata: { source: url }
    })
  })

  if (seeds.length > 20) return seeds

  return FALLBACK.books.map((answer) => ({
    answer,
    category: 'Book Title',
    tags: ['theme', 'literature', 'book'],
    metadata: { source: 'fallback' }
  }))
}

const fallbackSeeds = (answers: readonly string[], category: string, tags: string[]): Seed[] => {
  return answers.map((answer) => ({
    answer,
    category,
    tags,
    metadata: { source: 'fallback' }
  }))
}

const parseFoodAndDrink = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_foods'
  const items = await fetchListItems(url)

  const seeds = items
    .map((item) => sanitizeAnswer(item))
    .filter((value): value is string => !!value && !value.includes('→') && value.split(' ').length <= 6)
    .map((answer) => ({
      answer,
      category: 'Food and Drink',
      tags: ['theme', 'food'],
      metadata: { source: url }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.foodAndDrink, 'Food and Drink', ['theme', 'food'])
}

const parseTravel = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_busiest_airports_by_passenger_traffic'
  const names = await fetchTableColumn(url, 0, 1)

  const seeds = names
    .map((name) => sanitizeAnswer(name))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Travel',
      tags: ['theme', 'travel'],
      metadata: { source: url }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.travel, 'Travel', ['theme', 'travel'])
}

const parseVehicles = async () => {
  const url = 'https://en.wikipedia.org/wiki/Motor_Trend_Car_of_the_Year'
  const names = await fetchTableColumn(url, 1, 1)

  const seeds = names
    .filter((name) => !isPlaceholderAnswer(name))
    .map((name) => sanitizeAnswer(name.split('/')[0]))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Vehicle',
      tags: ['theme', 'vehicle'],
      metadata: { source: url }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.vehicles, 'Vehicle', ['theme', 'vehicle'])
}

const parseVideoGames = async () => {
  const flatTableSources = [
    { url: 'https://en.wikipedia.org/wiki/List_of_best-selling_video_games', columnIndex: 1 },
    { url: 'https://en.wikipedia.org/wiki/List_of_best-selling_PC_video_games', columnIndex: 0 },
    { url: 'https://en.wikipedia.org/wiki/List_of_best-selling_PlayStation_video_games', columnIndex: 0 },
    { url: 'https://en.wikipedia.org/wiki/List_of_best-selling_PlayStation_2_video_games', columnIndex: 0 },
    { url: 'https://en.wikipedia.org/wiki/List_of_best-selling_Nintendo_Switch_video_games', columnIndex: 0 }
  ]

  const [flatResults, bestOfAllTime] = await Promise.all([
    Promise.all(flatTableSources.map(({ url, columnIndex }) => fetchTableColumn(url, 0, columnIndex))),
    fetchBestGamesOfAllTime('https://en.wikipedia.org/wiki/List_of_video_games_considered_the_best')
  ])

  const seeds = [...flatResults.flat(), ...bestOfAllTime]
    .map((name) => sanitizeAnswer(name))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Video Game',
      tags: ['theme', 'video-game'],
      metadata: { source: 'wikipedia-bestsellers' }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.videoGames, 'Video Game', ['theme', 'video-game'])
}

const parseBoardGamesToys = async () => {
  const boardGamesUrl = 'https://en.wikipedia.org/wiki/List_of_board_games'
  const toysUrl = 'https://en.wikipedia.org/wiki/National_Toy_Hall_of_Fame'

  const [boardGames, toys] = await Promise.all([fetchListItems(boardGamesUrl), fetchToyHallOfFameNames(toysUrl)])

  const seeds = [...boardGames, ...toys]
    .map((item) => sanitizeAnswer(item))
    .filter((value): value is string => !!value && value.split(' ').length <= 6)
    .map((answer) => ({
      answer,
      category: 'Board Game or Toy',
      tags: ['theme', 'board-game', 'toy'],
      metadata: { source: 'wikipedia-boardgames-toyhalloffame' }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.boardGamesToys, 'Board Game or Toy', ['theme', 'board-game', 'toy'])
}

const parseProgrammingLanguages = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_programming_languages'
  const items = await fetchListItems(url)

  const seeds = items
    .map((item) => sanitizeAnswer(item))
    .filter((value): value is string => !!value && value.split(' ').length <= 4)
    .map((answer) => ({
      answer,
      category: 'Programming Language',
      tags: ['theme', 'programming'],
      metadata: { source: url }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.programmingLanguages, 'Programming Language', ['theme', 'programming'])
}

// "Technology" means recognizable consumer devices to most players, not developer
// tools — game consoles scrape cleanly (no rowspan on the Name column) and are
// combined with a hand-picked list of other iconic consumer tech products/brands
// that don't have a single clean Wikipedia list of their own to scrape.
const CONSUMER_TECH = [
  'iPhone',
  'iPad',
  'MacBook',
  'Apple Watch',
  'AirPods',
  'Kindle',
  'Chromebook',
  'Bluetooth',
  'Wi-Fi',
  'GPS',
  'Roomba',
  'GoPro',
  'Fitbit',
  'Amazon Echo',
  'Smartwatch',
  'Drone',
  'VR Headset',
  'Smart TV',
  'Webcam',
  'Router',
  'Flash Drive',
  'Wireless Charger',
  'Dash Cam',
  'Smart Speaker',
  'E-Reader'
]

const parseTechnology = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_home_video_game_consoles'
  const consoleNames = await fetchTableColumn(url, 0, 0)

  const seeds = [...consoleNames.map((name) => name.split('/')[0]), ...CONSUMER_TECH]
    .map((name) => sanitizeAnswer(name))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Technology',
      tags: ['theme', 'technology'],
      metadata: { source: 'wikipedia-consoles-plus-curated' }
    }))

  if (seeds.length > 15) return seeds

  return fallbackSeeds(FALLBACK.consumerTech, 'Technology', ['theme', 'technology'])
}

const parseCompanies = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_largest_companies_by_revenue'
  const names = await fetchTableColumn(url, 0, 1)

  const seeds = names
    .map((name) => sanitizeAnswer(name))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Company',
      tags: ['theme', 'company'],
      metadata: { source: url }
    }))

  if (seeds.length > 15) return seeds

  return fallbackSeeds(FALLBACK.companies, 'Company', ['theme', 'company'])
}

const parseMovieTitles = async () => {
  const url = "https://en.wikipedia.org/wiki/AFI%27s_100_Years...100_Movies"
  const names = await fetchTableColumn(url, 0, 0)

  const seeds = names
    .map((name) => sanitizeAnswer(name))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Movie Title',
      tags: ['theme', 'movie'],
      metadata: { source: url }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.movieTitles, 'Movie Title', ['theme', 'movie'])
}

const parseTVShows = async () => {
  // Emmy winners tables use rowspan on the Year column for tied/multi-nominee years,
  // which shifts later columns in those rows — this list is a flat one-row-per-show
  // table instead, so column indices stay reliable.
  const url = 'https://en.wikipedia.org/wiki/List_of_longest-running_scripted_American_primetime_television_series'
  const names = await fetchTableColumn(url, 0, 1)

  const seeds = names
    .map((name) => sanitizeAnswer(name))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'TV Show',
      tags: ['theme', 'tv'],
      metadata: { source: url }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.tvShows, 'TV Show', ['theme', 'tv'])
}

const parseMusicByEra = async () => {
  const url = 'https://en.wikipedia.org/wiki/Grammy_Award_for_Best_New_Artist'
  const names = await fetchAllTablesColumn(url, 1)

  const seeds = names
    .map((name) => sanitizeAnswer(name))
    .filter((value): value is string => !!value && value.split(' ').length <= 6)
    .map((answer) => ({
      answer,
      category: 'Music Artist by Era',
      tags: ['theme', 'music', 'era'],
      metadata: { source: url }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.musicByEra, 'Music Artist by Era', ['theme', 'music', 'era'])
}

const parseNature = async () => {
  const animalUrl = 'https://en.wikipedia.org/wiki/List_of_animal_names'
  const flowerUrl = 'https://en.wikipedia.org/wiki/List_of_U.S._state_flowers'
  const fruitUrl = 'https://en.wikipedia.org/wiki/List_of_culinary_fruits'

  const [rawAnimals, flowers, fruits] = await Promise.all([fetchTableColumn(animalUrl, 1, 0), fetchStateFlowerNames(flowerUrl), fetchCulinaryFruitNames(fruitUrl)])

  // The animal-names table cross-references synonyms inline in the same cell,
  // e.g. "Duck Also see Mallard" — keep just the primary name.
  const animals = rawAnimals.map((name) => name.replace(/\s*(also see|see also)\s+.*/i, ''))

  const seeds = [...animals, ...flowers, ...fruits]
    .map((name) => sanitizeAnswer(name))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'Nature',
      tags: ['theme', 'nature'],
      metadata: { source: 'wikipedia-fauna-and-flora' }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.nature, 'Nature', ['theme', 'nature'])
}

const parseHistory = async () => {
  const url = 'https://en.wikipedia.org/wiki/List_of_largest_empires'
  const names = await fetchTableColumn(url, 0, 0, 2)

  const seeds = names
    .filter((name) => !/^(million|thousand|%|year)/i.test(name.trim()))
    .map((name) => sanitizeAnswer(name))
    .filter((value): value is string => !!value)
    .map((answer) => ({
      answer,
      category: 'History',
      tags: ['theme', 'history'],
      metadata: { source: url }
    }))

  if (seeds.length > 20) return seeds

  return fallbackSeeds(FALLBACK.history, 'History', ['theme', 'history'])
}

const parseHolidays = async () => {
  const url = 'https://en.wikipedia.org/wiki/Lists_of_holidays'
  const items = await fetchListItems(url)

  const seeds = items
    .map((item) => sanitizeAnswer(item))
    .filter((value): value is string => !!value && !value.includes('→') && value.split(' ').length <= 5)
    .map((answer) => ({
      answer,
      category: 'Holiday and Celebration',
      tags: ['theme', 'holiday'],
      metadata: { source: url }
    }))

  if (seeds.length > 15) return seeds

  return fallbackSeeds(FALLBACK.holidays, 'Holiday and Celebration', ['theme', 'holiday'])
}

const parseWordplay = async () => {
  return fallbackSeeds(FALLBACK.wordplay, 'Wordplay', ['theme', 'wordplay'])
}

async function main() {
  const [superheroes, cartoons, presidents, firstLadies, actors, sports, mythology, scienceSpace, brands, literature, foodAndDrink, travel, vehicles, videoGames, boardGamesToys, technology, programmingLanguages, companies, movieTitles, tvShows, musicByEra, nature, history, holidays, wordplay] = await Promise.all([
    parseSuperheroes(),
    parseCartoonCharacters(),
    parsePresidents(),
    parseFirstLadies(),
    parseActors(),
    parseSportsTeams(),
    parseMythology(),
    parseScienceSpace(),
    parseBrandsProducts(),
    parseLiterature(),
    parseFoodAndDrink(),
    parseTravel(),
    parseVehicles(),
    parseVideoGames(),
    parseBoardGamesToys(),
    parseTechnology(),
    parseProgrammingLanguages(),
    parseCompanies(),
    parseMovieTitles(),
    parseTVShows(),
    parseMusicByEra(),
    parseNature(),
    parseHistory(),
    parseHolidays(),
    parseWordplay()
  ])

  const grouped = {
    superheroes: dedupe(superheroes).map(seedToPuzzle),
    cartoons: dedupe(cartoons).map(seedToPuzzle),
    usPresidents: dedupe(presidents).map(seedToPuzzle),
    firstLadies: dedupe(firstLadies).map(seedToPuzzle),
    actors: dedupe(actors).map(seedToPuzzle),
    sports: dedupe(sports).map(seedToPuzzle),
    mythology: dedupe(mythology).map(seedToPuzzle),
    scienceSpace: dedupe(scienceSpace).map(seedToPuzzle),
    brands: dedupe(brands).map(seedToPuzzle),
    literature: dedupe(literature).map(seedToPuzzle),
    foodAndDrink: dedupe(foodAndDrink).map(seedToPuzzle),
    travel: dedupe(travel).map(seedToPuzzle),
    vehicles: dedupe(vehicles).map(seedToPuzzle),
    videoGames: dedupe(videoGames).map(seedToPuzzle),
    boardGamesToys: dedupe(boardGamesToys).map(seedToPuzzle),
    technology: dedupe(technology).map(seedToPuzzle),
    programmingLanguages: dedupe(programmingLanguages).map(seedToPuzzle),
    companies: dedupe(companies).map(seedToPuzzle),
    movieTitles: dedupe(movieTitles).map(seedToPuzzle),
    tvShows: dedupe(tvShows).map(seedToPuzzle),
    musicByEra: dedupe(musicByEra).map(seedToPuzzle),
    nature: dedupe(nature).map(seedToPuzzle),
    history: dedupe(history).map(seedToPuzzle),
    holidays: dedupe(holidays).map(seedToPuzzle),
    wordplay: dedupe(wordplay).map(seedToPuzzle)
  }

  const allSeeds = dedupe([...superheroes, ...cartoons, ...presidents, ...firstLadies, ...actors, ...sports, ...mythology, ...scienceSpace, ...brands, ...literature, ...foodAndDrink, ...travel, ...vehicles, ...videoGames, ...boardGamesToys, ...technology, ...programmingLanguages, ...companies, ...movieTitles, ...tvShows, ...musicByEra, ...nature, ...history, ...holidays, ...wordplay])

  const all = allSeeds.map(seedToPuzzle)

  await fs.mkdir('./data', { recursive: true })

  await Promise.all([
    fs.writeFile('./data/themeSuperheroes.json', JSON.stringify(grouped.superheroes, null, 2)),
    fs.writeFile('./data/themeCartoons.json', JSON.stringify(grouped.cartoons, null, 2)),
    fs.writeFile('./data/themeUSPresidents.json', JSON.stringify(grouped.usPresidents, null, 2)),
    fs.writeFile('./data/themeFirstLadies.json', JSON.stringify(grouped.firstLadies, null, 2)),
    fs.writeFile('./data/themeActors.json', JSON.stringify(grouped.actors, null, 2)),
    fs.writeFile('./data/themeSportsTeams.json', JSON.stringify(grouped.sports, null, 2)),
    fs.writeFile('./data/themeMythology.json', JSON.stringify(grouped.mythology, null, 2)),
    fs.writeFile('./data/themeScienceSpace.json', JSON.stringify(grouped.scienceSpace, null, 2)),
    fs.writeFile('./data/themeBrandsProducts.json', JSON.stringify(grouped.brands, null, 2)),
    fs.writeFile('./data/themeLiterature.json', JSON.stringify(grouped.literature, null, 2)),
    fs.writeFile('./data/themeFoodAndDrink.json', JSON.stringify(grouped.foodAndDrink, null, 2)),
    fs.writeFile('./data/themeTravel.json', JSON.stringify(grouped.travel, null, 2)),
    fs.writeFile('./data/themeVehicles.json', JSON.stringify(grouped.vehicles, null, 2)),
    fs.writeFile('./data/themeVideoGames.json', JSON.stringify(grouped.videoGames, null, 2)),
    fs.writeFile('./data/themeBoardGamesToys.json', JSON.stringify(grouped.boardGamesToys, null, 2)),
    fs.writeFile('./data/themeTechnology.json', JSON.stringify(grouped.technology, null, 2)),
    fs.writeFile('./data/themeProgrammingLanguages.json', JSON.stringify(grouped.programmingLanguages, null, 2)),
    fs.writeFile('./data/themeCompanies.json', JSON.stringify(grouped.companies, null, 2)),
    fs.writeFile('./data/themeMovieTitles.json', JSON.stringify(grouped.movieTitles, null, 2)),
    fs.writeFile('./data/themeTVShows.json', JSON.stringify(grouped.tvShows, null, 2)),
    fs.writeFile('./data/themeMusicByEra.json', JSON.stringify(grouped.musicByEra, null, 2)),
    fs.writeFile('./data/themeNature.json', JSON.stringify(grouped.nature, null, 2)),
    fs.writeFile('./data/themeHistory.json', JSON.stringify(grouped.history, null, 2)),
    fs.writeFile('./data/themeHolidaysCelebrations.json', JSON.stringify(grouped.holidays, null, 2)),
    fs.writeFile('./data/themeWordplay.json', JSON.stringify(grouped.wordplay, null, 2)),
    fs.writeFile('./data/themePacks.json', JSON.stringify(all, null, 2))
  ])

  console.log(`saved superheroes: ${grouped.superheroes.length}`)
  console.log(`saved cartoons: ${grouped.cartoons.length}`)
  console.log(`saved us presidents: ${grouped.usPresidents.length}`)
  console.log(`saved first ladies: ${grouped.firstLadies.length}`)
  console.log(`saved actors: ${grouped.actors.length}`)
  console.log(`saved sports teams: ${grouped.sports.length}`)
  console.log(`saved mythology: ${grouped.mythology.length}`)
  console.log(`saved science/space: ${grouped.scienceSpace.length}`)
  console.log(`saved brands/products: ${grouped.brands.length}`)
  console.log(`saved literature: ${grouped.literature.length}`)
  console.log(`saved food and drink: ${grouped.foodAndDrink.length}`)
  console.log(`saved travel: ${grouped.travel.length}`)
  console.log(`saved vehicles: ${grouped.vehicles.length}`)
  console.log(`saved video games: ${grouped.videoGames.length}`)
  console.log(`saved board games/toys: ${grouped.boardGamesToys.length}`)
  console.log(`saved technology: ${grouped.technology.length}`)
  console.log(`saved programming languages: ${grouped.programmingLanguages.length}`)
  console.log(`saved companies: ${grouped.companies.length}`)
  console.log(`saved movie titles: ${grouped.movieTitles.length}`)
  console.log(`saved tv shows: ${grouped.tvShows.length}`)
  console.log(`saved music by era: ${grouped.musicByEra.length}`)
  console.log(`saved nature: ${grouped.nature.length}`)
  console.log(`saved history: ${grouped.history.length}`)
  console.log(`saved holidays: ${grouped.holidays.length}`)
  console.log(`saved wordplay: ${grouped.wordplay.length}`)
  console.log(`saved total theme packs: ${all.length}`)
}

main().catch(console.error)
