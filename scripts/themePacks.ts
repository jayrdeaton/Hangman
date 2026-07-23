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
  superheroes: [
    'Batman',
    'Superman',
    'Wonder Woman',
    'Spider-Man',
    'Iron Man',
    'Captain America',
    'Thor',
    'Hulk',
    'Black Panther',
    'Doctor Strange',
    'Scarlet Witch',
    'Loki',
    'Joker',
    'Harley Quinn',
    'Green Lantern',
    'The Flash',
    'Aquaman',
    'Black Widow',
    'Deadpool',
    'Wolverine'
  ],
  cartoons: [
    'Mickey Mouse',
    'Bugs Bunny',
    'SpongeBob SquarePants',
    'Scooby-Doo',
    'Homer Simpson',
    'Bart Simpson',
    'Tom Cat',
    'Jerry Mouse',
    'Daffy Duck',
    'Popeye',
    'Shaggy Rogers',
    'Velma Dinkley',
    'Fred Flintstone',
    'Yogi Bear',
    'Dexter',
    'Johnny Bravo'
  ],
  firstLadies: [
    'Martha Washington',
    'Abigail Adams',
    'Dolley Madison',
    'Eleanor Roosevelt',
    'Jacqueline Kennedy Onassis',
    'Lady Bird Johnson',
    'Rosalynn Carter',
    'Nancy Reagan',
    'Hillary Clinton',
    'Michelle Obama',
    'Jill Biden'
  ],
  actors: [
    'Meryl Streep',
    'Denzel Washington',
    'Tom Hanks',
    'Viola Davis',
    'Morgan Freeman',
    'Julia Roberts',
    'Leonardo DiCaprio',
    'Audrey Hepburn',
    'James Stewart',
    'Humphrey Bogart',
    'Katharine Hepburn',
    'Cary Grant'
  ],
  sportsTeams: [
    'Los Angeles Lakers',
    'Boston Celtics',
    'Golden State Warriors',
    'Kansas City Chiefs',
    'Green Bay Packers',
    'Dallas Cowboys',
    'New York Yankees',
    'Boston Red Sox',
    'Los Angeles Dodgers',
    'Montreal Canadiens',
    'Toronto Maple Leafs',
    'Detroit Red Wings'
  ],
  mythology: [
    'Zeus',
    'Hera',
    'Athena',
    'Apollo',
    'Artemis',
    'Ares',
    'Poseidon',
    'Hades',
    'Medusa',
    'Minotaur',
    'Cerberus',
    'Pegasus'
  ],
  planets: [
    'Mercury',
    'Venus',
    'Earth',
    'Mars',
    'Jupiter',
    'Saturn',
    'Uranus',
    'Neptune'
  ],
  missions: [
    'Apollo 11',
    'Apollo 13',
    'Voyager 1',
    'Voyager 2',
    'Cassini-Huygens',
    'New Horizons',
    'Mars Pathfinder',
    'Curiosity Rover',
    'Perseverance Rover',
    'International Space Station'
  ],
  brands: [
    'Coca-Cola',
    'Pepsi',
    'Kelloggs',
    'Oreos',
    'Nutella',
    'Kit Kat',
    'Pringles',
    'Doritos',
    'Heinz',
    'Ben and Jerrys'
  ],
  books: [
    'A Tale of Two Cities',
    'The Little Prince',
    'The Alchemist',
    'The Lord of the Rings',
    'Harry Potter and the Philosophers Stone',
    'The Hobbit',
    'Don Quixote',
    'The Da Vinci Code',
    'The Catcher in the Rye',
    'To Kill a Mockingbird'
  ],
  foodAndDrink: [
    'Chicken Parmesan',
    'Spaghetti Bolognese',
    'Caesar Salad',
    'Sushi Roll',
    'Chocolate Cake',
    'Apple Pie',
    'Iced Coffee',
    'Lemonade',
    'Margarita Pizza',
    'French Toast'
  ],
  travel: [
    'Eiffel Tower',
    'Great Wall of China',
    'Statue of Liberty',
    'Sydney Opera House',
    'Golden Gate Bridge',
    'Heathrow Airport',
    'JFK International Airport',
    'Tokyo Station',
    'Machu Picchu',
    'Times Square'
  ],
  vehicles: [
    'Ford Mustang',
    'Chevrolet Corvette',
    'Tesla Model S',
    'Honda Civic',
    'Boeing 747',
    'Airbus A320',
    'Harley-Davidson Sportster',
    'Yamaha R1',
    'Porsche 911',
    'Jeep Wrangler'
  ],
  videoGames: [
    'Super Mario Bros',
    'The Legend of Zelda',
    'Minecraft',
    'Fortnite',
    'Call of Duty',
    'Grand Theft Auto',
    'Final Fantasy',
    'Halo Infinite',
    'Street Fighter',
    'Animal Crossing'
  ],
  boardGamesToys: [
    'Monopoly',
    'Scrabble',
    'Chess',
    'Risk',
    'Clue',
    'Catan',
    'Barbie',
    'Lego',
    'Hot Wheels',
    'Rubiks Cube'
  ],
  technology: [
    'JavaScript',
    'TypeScript',
    'Python',
    'React Native',
    'Node.js',
    'PostgreSQL',
    'Android',
    'iOS',
    'Visual Studio Code',
    'Docker'
  ],
  companies: [
    'Apple',
    'Microsoft',
    'Google',
    'Amazon',
    'Netflix',
    'Disney',
    'Toyota',
    'Nike',
    'Samsung',
    'Coca-Cola'
  ],
  movieTitles: [
    'The Godfather',
    'The Dark Knight',
    'Titanic',
    'Jurassic Park',
    'Back to the Future',
    'The Matrix',
    'Star Wars',
    'The Lion King',
    'Inception',
    'Casablanca'
  ],
  tvShows: [
    'Breaking Bad',
    'Game of Thrones',
    'Friends',
    'The Office',
    'Seinfeld',
    'The Simpsons',
    'Stranger Things',
    'The X-Files',
    'The Mandalorian',
    'The Sopranos'
  ],
  musicByEra: [
    'Michael Jackson',
    'Madonna',
    'Prince',
    'Nirvana',
    'Backstreet Boys',
    'Britney Spears',
    'Linkin Park',
    'Taylor Swift',
    'Bruno Mars',
    'Billie Eilish'
  ],
  nature: [
    'African Elephant',
    'Bald Eagle',
    'Great White Shark',
    'Blue Whale',
    'Giant Sequoia',
    'Redwood Forest',
    'Amazon Rainforest',
    'Monarch Butterfly',
    'Polar Bear',
    'Komodo Dragon'
  ],
  history: [
    'French Revolution',
    'Industrial Revolution',
    'American Civil War',
    'World War One',
    'World War Two',
    'Renaissance',
    'Roman Empire',
    'Ottoman Empire',
    'Moon Landing',
    'Fall of the Berlin Wall'
  ],
  holidays: [
    'New Years Day',
    'Valentines Day',
    'Easter Sunday',
    'Halloween',
    'Thanksgiving',
    'Christmas Day',
    'Hanukkah',
    'Diwali',
    'Lunar New Year',
    'Independence Day'
  ],
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
    'Live Not on Evil'
  ]
} as const

const cleanText = (value: string) => {
  return value
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\W+|\W+$/g, '')
    .trim()
}

const sanitizeAnswer = (value: string) => {
  const text = cleanText(value)
  if (!text) return null
  if (text.length < 3) return null
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

const fetchHtml = async (url: string) => {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'HangmanGame/1.0 (theme packs scraper)'
      }
    })

    if (!res.ok) return null

    return res.text()
  } catch {
    return null
  }
}

const fetchCategoryMembers = async (
  categoryTitle: string,
  maxItems = 250
): Promise<string[]> => {
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
  const [dc, marvel, villains] = await Promise.all([
    fetchCategoryMembers('Category:DC Comics superheroes', 200),
    fetchCategoryMembers('Category:Marvel Comics superheroes', 200),
    fetchCategoryMembers('Category:Supervillains', 120)
  ])

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

      const answer = sanitizeAnswer($(cells[winnerIndex]).text())
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
  const html = await fetchHtml(url)

  if (!html) {
    return FALLBACK.mythology.map((answer) => ({
      answer,
      category: 'Mythology Figure',
      tags: ['theme', 'mythology'],
      metadata: { source: 'fallback' }
    }))
  }

  const $ = cheerio.load(html)
  const seeds: Seed[] = []

  $('div.mw-parser-output > ul > li').each((_, li) => {
    const raw = $(li).text().split('–')[0]
    const answer = sanitizeAnswer(raw)
    if (!answer) return

    seeds.push({
      answer,
      category: 'Mythology Figure',
      tags: ['theme', 'mythology'],
      metadata: { source: url }
    })
  })

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
  const html = await fetchHtml(url)

  if (!html) {
    return FALLBACK.brands.map((answer) => ({
      answer,
      category: 'Brand',
      tags: ['theme', 'brand', 'product'],
      metadata: { source: 'fallback' }
    }))
  }

  const $ = cheerio.load(html)
  const seeds: Seed[] = []

  $('div.mw-parser-output > ul > li').each((_, li) => {
    const answer = sanitizeAnswer($(li).text())
    if (!answer) return

    seeds.push({
      answer,
      category: 'Brand',
      tags: ['theme', 'brand', 'product'],
      metadata: { source: url }
    })
  })

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

const fallbackSeeds = (
  answers: readonly string[],
  category: string,
  tags: string[]
): Seed[] => {
  return answers.map((answer) => ({
    answer,
    category,
    tags,
    metadata: { source: 'fallback' }
  }))
}

const parseFoodAndDrink = async () => {
  return fallbackSeeds(FALLBACK.foodAndDrink, 'Food and Drink', ['theme', 'food'])
}

const parseTravel = async () => {
  return fallbackSeeds(FALLBACK.travel, 'Travel', ['theme', 'travel'])
}

const parseVehicles = async () => {
  return fallbackSeeds(FALLBACK.vehicles, 'Vehicle', ['theme', 'vehicle'])
}

const parseVideoGames = async () => {
  return fallbackSeeds(FALLBACK.videoGames, 'Video Game', ['theme', 'video-game'])
}

const parseBoardGamesToys = async () => {
  return fallbackSeeds(FALLBACK.boardGamesToys, 'Board Game or Toy', ['theme', 'board-game', 'toy'])
}

const parseTechnology = async () => {
  return fallbackSeeds(FALLBACK.technology, 'Technology', ['theme', 'technology'])
}

const parseCompanies = async () => {
  return fallbackSeeds(FALLBACK.companies, 'Company', ['theme', 'company'])
}

const parseMovieTitles = async () => {
  return fallbackSeeds(FALLBACK.movieTitles, 'Movie Title', ['theme', 'movie'])
}

const parseTVShows = async () => {
  return fallbackSeeds(FALLBACK.tvShows, 'TV Show', ['theme', 'tv'])
}

const parseMusicByEra = async () => {
  return fallbackSeeds(FALLBACK.musicByEra, 'Music Artist by Era', ['theme', 'music', 'era'])
}

const parseNature = async () => {
  return fallbackSeeds(FALLBACK.nature, 'Nature', ['theme', 'nature'])
}

const parseHistory = async () => {
  return fallbackSeeds(FALLBACK.history, 'History', ['theme', 'history'])
}

const parseHolidays = async () => {
  return fallbackSeeds(FALLBACK.holidays, 'Holiday and Celebration', ['theme', 'holiday'])
}

const parseWordplay = async () => {
  return fallbackSeeds(FALLBACK.wordplay, 'Wordplay', ['theme', 'wordplay'])
}

async function main() {
  const [
    superheroes,
    cartoons,
    presidents,
    firstLadies,
    actors,
    sports,
    mythology,
    scienceSpace,
    brands,
    literature,
    foodAndDrink,
    travel,
    vehicles,
    videoGames,
    boardGamesToys,
    technology,
    companies,
    movieTitles,
    tvShows,
    musicByEra,
    nature,
    history,
    holidays,
    wordplay
  ] = await Promise.all([
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
    companies: dedupe(companies).map(seedToPuzzle),
    movieTitles: dedupe(movieTitles).map(seedToPuzzle),
    tvShows: dedupe(tvShows).map(seedToPuzzle),
    musicByEra: dedupe(musicByEra).map(seedToPuzzle),
    nature: dedupe(nature).map(seedToPuzzle),
    history: dedupe(history).map(seedToPuzzle),
    holidays: dedupe(holidays).map(seedToPuzzle),
    wordplay: dedupe(wordplay).map(seedToPuzzle)
  }

  const allSeeds = dedupe([
    ...superheroes,
    ...cartoons,
    ...presidents,
    ...firstLadies,
    ...actors,
    ...sports,
    ...mythology,
    ...scienceSpace,
    ...brands,
    ...literature,
    ...foodAndDrink,
    ...travel,
    ...vehicles,
    ...videoGames,
    ...boardGamesToys,
    ...technology,
    ...companies,
    ...movieTitles,
    ...tvShows,
    ...musicByEra,
    ...nature,
    ...history,
    ...holidays,
    ...wordplay
  ])

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
