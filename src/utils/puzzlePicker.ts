import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload, PuzzleSourceMode } from '@/types/gameSession'
import type { Puzzle } from '@/types/puzzle'
import { getPuzzleManifest, getPuzzlesForCategory, PuzzleDifficultyTier } from '@/utils/puzzleCatalog'
import type { PuzzleUnlockMap } from '@/utils/unlocks'

import type { PuzzleManifestItem } from '../data/puzzleCatalog.generated'
import { scoreDifficulty } from './customPacks'
import { normalizePhrase } from './normalizePhrase'

export { normalizePhrase }

// Category strings come straight from wildly different source datasets — some are ALL CAPS
// Trivia-style category names, some are lowercase kebab-slugs (the Phrases pack). Title-casing
// each letter run (and nothing else) cleans up both without touching hyphens/quotes/spacing
// that carry real meaning, e.g. Trivia's own hyphenated wordplay categories.
//
// A category that's mostly lowercase/mixed-case (e.g. "TV Show", "US President") was authored
// by hand rather than scraped as one uniform shouting case, so an all-caps run within it (TV,
// US) is almost certainly a real acronym — left alone rather than forced through the same
// lowercase-the-rest pass that turns Trivia's ALL-CAPS categories readable. Judged by the
// ratio of uppercase letters in the whole string, not just "any lowercase present", since a
// handful of Trivia categories ("THE 1980s", "20th CENTURY WOMEN") carry an incidental
// lowercase ordinal suffix while still being overwhelmingly shouted from an all-caps source.
const ORDINAL_SUFFIX = /^(st|nd|rd|th|s)$/i

const humanizeCategory = (category: string): string => {
  const letters = category.replace(/[^A-Za-z]/g, '')
  const upperRatio = letters.length === 0 ? 1 : [...letters].filter((c) => c === c.toUpperCase()).length / letters.length
  const isHandAuthored = upperRatio < 0.7

  return category.replace(/[A-Za-z]+/g, (word, offset: number, full: string) => {
    // A leading digit run (as in "20th" or "1980s") splits off its own letter-run match here
    // ("th", "s") since digits and letters don't share a \w-style class in this regex — left
    // lowercase rather than title-cased into a stray-looking "20Th"/"1980S".
    if (offset > 0 && /\d/.test(full[offset - 1]) && ORDINAL_SUFFIX.test(word)) return word.toLowerCase()
    if (isHandAuthored && word === word.toUpperCase()) return word
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })
}

const readMetaString = (metadata: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

// This is the *extra* hint shown alongside the pack itself (see GameStartPayload.packLabel,
// always surfaced next to it in the UI) — so a category only earns a place here when it tells
// the player something the pack name doesn't already. Most theme/geography packs are scraped
// one-category-per-pack (every puzzle in "Theme Superheroes" has category "Superhero"), so
// repeating it would just parrot back the pack they already know they're in. Bands, movies, TV
// and the mixed Phrases pack are the packs where a category is actually informative on its own —
// no "Movies"/"Shows" suffix needed to disambiguate a bare genre like "Action" anymore, since the
// pack name sitting right next to it already supplies that context.
const buildHint = (puzzle: Pick<Puzzle, 'category' | 'metadata'>, pack: Pick<PuzzleManifestItem, 'categories'>): string | undefined => {
  const explicitHint = readMetaString(puzzle.metadata, 'hint')
  if (explicitHint) return explicitHint

  const parts: string[] = []

  if (pack.categories.length > 1) parts.push(humanizeCategory(puzzle.category))

  // Scraped per-item metadata that's more specific than any category — an artist name pins a
  // song down far more than the pack-wide "Song" category ever could, and a release year adds
  // real information on top of a genre that's shared by hundreds of other movies/shows.
  const artist = readMetaString(puzzle.metadata, 'artist')
  if (artist) parts.push(`by ${artist}`)
  const year = readMetaString(puzzle.metadata, 'year')
  if (year) parts.push(year)

  return parts.length > 0 ? parts.join(' · ') : undefined
}

export type PuzzleConfig = {
  sourceMode: PuzzleSourceMode
  difficulty: 'any' | PuzzleDifficultyTier
  mode: GameMode
  customPhrase: string
  customHint: string
}

export type PuzzleResolution = { ok: true; payload: GameStartPayload } | { ok: false; error: string }

// A random draw, scoped to whichever packs the player has checked (defaults to all of them),
// preferring a puzzle the player hasn't unlocked yet over one they have. Flattened across every
// eligible pack into one pool rather than picked per-pack — a puzzle in ANY eligible pack that's
// still unsolved beats a repeat, not just an unsolved puzzle in whichever pack happened to be
// tried first. Falls back to the full (repeats-allowed) pool only once every eligible puzzle
// across the whole selection is already unlocked — without this, a solved puzzle and an unsolved
// one were served with equal odds forever, so a player hitting Random could never actually work
// through and finish a pack.
const pickRandomPackPuzzle = (allowedKeys: Set<string>, unlockedByPack: PuzzleUnlockMap, difficultyFilter?: PuzzleDifficultyTier) => {
  const manifest = getPuzzleManifest().filter((item) => item.count > 0 && allowedKeys.has(item.key))
  const candidatePacks = manifest.filter((item) => (difficultyFilter ? item.difficultyTiers.includes(difficultyFilter) : true))

  const candidates = candidatePacks.flatMap((pack) => {
    const unlockedIds = new Set(unlockedByPack[pack.key] ?? [])
    return getPuzzlesForCategory(pack.key, difficultyFilter)
      .map((puzzle) => ({ puzzle, normalized: normalizePhrase(puzzle.answer), pack, unlocked: unlockedIds.has(puzzle.id) }))
      .filter((item) => item.normalized.length > 0)
  })

  if (candidates.length === 0) return null

  const unsolved = candidates.filter((item) => !item.unlocked)
  const pool = unsolved.length > 0 ? unsolved : candidates

  const picked = pool[Math.floor(Math.random() * pool.length)]
  return { puzzle: picked.puzzle, normalizedAnswer: picked.normalized, pack: picked.pack }
}

// Shared by the initial auto-start (Main mounts straight into a game, no setup screen) and the
// drawer's "New Puzzle" confirm — one place picks the word so both stay in sync.
//
// packKeys is a separate argument, not a PuzzleConfig field: it's not something the caller stages
// and confirms like the rest of config — it's normally the live, persisted pack-selection default
// (see usePackSelection), except for the one deliberate override Main's round-end handler makes to
// narrow a single draw to just the pack the player was already browsing (see
// GameStartPayload.packScope). Keeping it explicit here makes that override visible at the call
// site instead of hidden inside a config object that's otherwise all-staged.
//
// unlockedByPack defaults to {} (nothing unlocked) rather than being required — a caller that
// doesn't have it handy yet degrades to picking with no preference at all, same as before this
// existed, instead of failing outright.
export const resolvePuzzle = (config: PuzzleConfig, packKeys: string[], unlockedByPack: PuzzleUnlockMap = {}): PuzzleResolution => {
  const difficultyFilter = config.difficulty === 'any' ? undefined : config.difficulty

  if (config.sourceMode === 'custom') {
    const normalized = normalizePhrase(config.customPhrase)
    if (!normalized || normalized.replace(/ /g, '').length === 0) {
      return { ok: false, error: 'Enter a secret word using letters A-Z (spaces allowed).' }
    }

    const hint = config.customHint.replace(/\s+/g, ' ').trim()
    // Same scorer the drawer's custom form already previews live (see PuzzleDrawer's
    // customPreviewPuzzle) — without this, the difficulty pill a player watched update while
    // typing would vanish the instant the round actually starts, on both the drawer's own Custom
    // flow and pass-and-play's compose screen.
    const { difficultyTier } = scoreDifficulty(normalized)
    return { ok: true, payload: { phrase: normalized, mode: config.mode, sourceMode: 'custom', hint: hint || undefined, difficultyTier } }
  }

  if (packKeys.length === 0) return { ok: false, error: 'Choose at least one pack to start.' }

  const randomPick = pickRandomPackPuzzle(new Set(packKeys), unlockedByPack, difficultyFilter)
  if (!randomPick) return { ok: false, error: 'No puzzles available for the selected packs and difficulty.' }

  return {
    ok: true,
    payload: {
      phrase: randomPick.normalizedAnswer,
      mode: config.mode,
      sourceMode: 'random',
      packKey: randomPick.pack.key,
      packLabel: randomPick.pack.label,
      puzzleId: randomPick.puzzle.id,
      difficultyTier: randomPick.puzzle.difficultyTier,
      hint: buildHint(randomPick.puzzle, randomPick.pack),
      // A draw narrowed to exactly one pack (PackPuzzlesDrawer/AchievementsDrawer's own Random,
      // or a selection of exactly one pack) means the player was intentionally browsing that pack
      // — the round-end handler keeps drawing from just it. More than one means this came from the
      // player's whole standing selection (PuzzleDrawer's bottom Random), so the next round should
      // draw from that same selection again, not get pinned to whichever pack happened to win.
      packScope: packKeys.length === 1 ? 'single' : 'selection'
    }
  }
}

// A player-picked puzzle rather than a random draw — PackPuzzlesDrawer's own "browse and tap one"
// list. Deliberately narrow (just packKey/puzzleId/mode, not a whole PuzzleConfig): which exact
// puzzle to play is already decided by the caller, so difficulty/sourceMode/customPhrase have
// nothing left to contribute here the way they do for resolvePuzzle's random draw.
export const resolveChosenPuzzle = (packKey: string, puzzleId: string, mode: GameMode): PuzzleResolution => {
  const pack = getPuzzleManifest().find((item) => item.key === packKey)
  const puzzle = pack ? getPuzzlesForCategory(packKey).find((item) => item.id === puzzleId) : undefined

  if (!pack || !puzzle) return { ok: false, error: 'That puzzle is no longer available.' }

  const normalized = normalizePhrase(puzzle.answer)
  if (!normalized || normalized.replace(/ /g, '').length === 0) return { ok: false, error: 'That puzzle is no longer available.' }

  return {
    ok: true,
    payload: {
      phrase: normalized,
      mode,
      sourceMode: 'random',
      packKey: pack.key,
      packLabel: pack.label,
      puzzleId: puzzle.id,
      difficultyTier: puzzle.difficultyTier,
      hint: buildHint(puzzle, pack),
      // A player-picked puzzle is always from one specific pack the player was already browsing —
      // see GameStartPayload.packScope.
      packScope: 'single'
    }
  }
}
