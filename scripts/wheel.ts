/* eslint-disable no-console */
import * as cheerio from 'cheerio'
import fs from 'fs/promises'
import * as puppeteer from 'puppeteer'

import type { Puzzle } from '../src/types/puzzle'
import {
  difficulty,
  difficultyTier,
  id,
  normalize,
  uniqueLetters
} from './utils'

const categories = [
  'phrase',
  'thing',
  'place',
  'what-are-you-doing',
  'people',
  'food-and-drink'
]

const MAX_PAGES = Number(process.env.WHEEL_MAX_PAGES ?? 1)

const NOISE_RE =
  /^(home|about|contact|privacy|terms|menu|search|read more|next|previous)$/i

const cleanAnswer = (value: string) => {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (NOISE_RE.test(text)) return null
  if (/wheel\s+of\s+fortune/i.test(text)) return null

  const normalized = normalize(text)
  if (!normalized) return null
  if (normalized.length < 3) return null
  if (uniqueLetters(normalized) < 2) return null

  return text
}

const toPuzzle = (
  answer: string,
  category: string,
  wordCount?: number,
  letterCount?: number
): Puzzle => {
  const normalized = normalize(answer)
  const score = difficulty(answer)

  return {
    id: id(answer, category),
    source: 'wheel',
    type: 'phrase',
    answer,
    normalizedAnswer: normalized,
    category,
    difficulty: score,
    difficultyTier: difficultyTier(score),
    wordCount:
      Number.isFinite(wordCount) && (wordCount as number) > 0
        ? (wordCount as number)
        : normalized.split(' ').length,
    letterCount:
      Number.isFinite(letterCount) && (letterCount as number) > 0
        ? (letterCount as number)
        : normalized.replace(/ /g, '').length,
    uniqueLetterCount: uniqueLetters(normalized)
  }
}

async function scrapeCategory(
  browser: puppeteer.Browser,
  category: string
) {
  const page = await browser.newPage()
  const seen = new Set<string>()
  const puzzles: Puzzle[] = []

  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  )

  await page.setViewport({
    width: 1440,
    height: 900
  })

  try {
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
      const url =
        pageNumber === 1
          ? `https://wheeloffortuneanswer.com/${category}/`
          : `https://wheeloffortuneanswer.com/${category}/page/${pageNumber}/`

      console.log('visiting', url)

      try {
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 60000
        })
      } catch (error) {
        // If pagination is blocked/times out, keep data from previous pages.
        if (pageNumber > 1) {
          console.warn(`stopping pagination for ${category}:`, error)
          break
        }

        throw error
      }

      await new Promise((r) => setTimeout(r, 1000))

      const html = await page.content()
      const $ = cheerio.load(html)

      const title = $('title').text().toLowerCase()
      const h1 = $('h1').first().text().toLowerCase()
      const blocked =
        title.includes('attention required') ||
        h1.includes('sorry, you have been blocked')

      if (blocked) {
        if (pageNumber > 1) {
          console.warn(`stopping pagination for ${category}: blocked on page ${pageNumber}`)
          break
        }

        console.warn(`blocked by cloudflare for ${category}`)
        return puzzles
      }

      let pageAdds = 0

      $('tr').each((_, row) => {
        const cells = $(row).find('td')

        if (cells.length < 2) return

        const answer = cleanAnswer($(cells[0]).text())
        if (!answer) return

        const puzzle = toPuzzle(
          answer,
          category,
          Number($(cells[2]).text().trim()),
          Number($(cells[3]).text().trim())
        )

        if (seen.has(puzzle.id)) return

        seen.add(puzzle.id)
        puzzles.push(puzzle)
        pageAdds++
      })

      $('article a, .entry-content a, .post a').each((_, link) => {
        const answer = cleanAnswer($(link).text())
        if (!answer) return

        const puzzle = toPuzzle(answer, category)

        if (seen.has(puzzle.id)) return

        seen.add(puzzle.id)
        puzzles.push(puzzle)
        pageAdds++
      })

      if (pageAdds === 0) break
    }

    return puzzles
  } finally {
    await page.close()
  }
}

async function main() {
  const all: Puzzle[] = []

  for (const category of categories) {
    console.log('wheel category:', category)

    let browser: puppeteer.Browser | null = null

    try {
      browser = await puppeteer.launch({
        headless: true
      })

      const puzzles = await scrapeCategory(
        browser,
        category
      )

      console.log(
        `found ${puzzles.length} puzzles`
      )

      all.push(...puzzles)
    } catch (err) {
      console.error(
        `failed category ${category}`,
        err
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }

    await new Promise((r) =>
      setTimeout(r, 1500)
    )
  }

  await fs.mkdir('./data', {
    recursive: true
  })

  await fs.writeFile(
    './data/wheel.json',
    JSON.stringify(all, null, 2)
  )

  console.log('saved', all.length)
}

main().catch(console.error)
