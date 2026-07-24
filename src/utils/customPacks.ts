import AsyncStorage from '@react-native-async-storage/async-storage'

import type { Puzzle } from '@/types/puzzle'

import type { PuzzleManifestItem } from '../data/puzzleCatalog.generated'
import { normalizePhrase } from './normalizePhrase'

const CUSTOM_PACKS_KEY = 'custom_packs_v1'
const CUSTOM_KEY_PREFIX = 'custom:'
export const MAX_ENTRIES_PER_PACK = 100

export type CustomPackEntryInput = { answer: string; hint?: string }

export type CustomPack = {
  key: string
  label: string
  createdAt: string
  updatedAt: string
  puzzles: Puzzle[]
}

export type CustomPackExportPayload = {
  version: 1
  exportedAt: string
  pack: CustomPack
}

export const isCustomPackKey = (key: string): boolean => key.startsWith(CUSTOM_KEY_PREFIX)

const generateKey = (): string => `${CUSTOM_KEY_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

// Client-side port of scripts/utils.ts's difficulty/difficultyTier scoring — that version depends
// on Node's crypto/dotenv, so it can't run in the app bundle, but the scoring formula itself is
// plain math and is kept identical here so a custom-pack word lands in the same difficulty tier a
// scraped one with the same letters would.
//
// Primary driver: in classic Hangman a "miss" only happens when a guessed letter is NOT present
// anywhere in the answer, so mechanical risk is governed by how many of the 26 alphabet letters
// are ABSENT — more alphabet coverage can only ever reduce guaranteed misses, so it makes a puzzle
// EASIER, never harder. Length is folded in only as a small, saturating secondary nudge (zero once
// the answer has 15+ letters) so it can never dominate the primary miss-risk term.
const scoreDifficulty = (normalizedAnswer: string): { difficulty: number; difficultyTier: Puzzle['difficultyTier'] } => {
  const letters = normalizedAnswer.replace(/[^A-Z]/g, '')
  const uniqueLetterCount = new Set(letters).size
  const absentLetterCount = 26 - uniqueLetterCount
  const missRisk = absentLetterCount * 4
  const lengthPenalty = Math.max(0, 15 - letters.length) * 0.4
  const difficulty = Math.round((missRisk + lengthPenalty) * 10) / 10
  const difficultyTier = difficulty < 65 ? 'easy' : difficulty < 80 ? 'medium' : 'hard'
  return { difficulty, difficultyTier }
}

export const buildCustomPuzzle = (packKey: string, packLabel: string, entry: CustomPackEntryInput, index: number): Puzzle | null => {
  const answer = entry.answer.trim()
  const normalizedAnswer = normalizePhrase(answer)
  if (!normalizedAnswer || normalizedAnswer.replace(/ /g, '').length === 0) return null

  const letters = normalizedAnswer.replace(/[^A-Z]/g, '')
  const { difficulty, difficultyTier } = scoreDifficulty(normalizedAnswer)
  const hint = entry.hint?.replace(/\s+/g, ' ').trim()

  return {
    id: `${packKey}:${index}`,
    source: 'custom',
    type: 'phrase',
    answer,
    normalizedAnswer,
    category: packLabel,
    difficulty,
    difficultyTier,
    wordCount: normalizedAnswer.split(' ').filter(Boolean).length,
    letterCount: letters.length,
    uniqueLetterCount: new Set(letters).size,
    metadata: hint ? { hint } : undefined
  }
}

const normalizeStoredPacks = (raw: unknown): CustomPack[] => {
  if (!Array.isArray(raw)) return []
  return raw.filter((pack): pack is CustomPack => Boolean(pack) && typeof pack === 'object' && typeof (pack as CustomPack).key === 'string' && Array.isArray((pack as CustomPack).puzzles))
}

export const getStoredCustomPacks = async (): Promise<CustomPack[]> => {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_PACKS_KEY)
    if (!raw) return []
    return normalizeStoredPacks(JSON.parse(raw))
  } catch (_e) {
    return []
  }
}

const setStoredCustomPacks = async (packs: CustomPack[]): Promise<void> => {
  await AsyncStorage.setItem(CUSTOM_PACKS_KEY, JSON.stringify(packs))
}

// In-memory mirror of storage so the (synchronous) pack picker can read custom packs alongside the
// generated catalog without becoming async. Hydrated once at boot and kept in sync by every
// mutator below — see loadCustomPacksCache and getCustomPacksVersion.
let cache: CustomPack[] = []
let version = 0

export const getCustomPacksVersion = (): number => version

export const loadCustomPacksCache = async (): Promise<void> => {
  cache = await getStoredCustomPacks()
  version += 1
}

export const getCustomPacks = (): CustomPack[] => cache

export const getCustomPackSummaries = (): PuzzleManifestItem[] =>
  cache.map((pack) => ({
    key: pack.key,
    file: '',
    label: pack.label,
    count: pack.puzzles.length,
    difficultyTiers: [...new Set(pack.puzzles.map((puzzle) => puzzle.difficultyTier))],
    sources: ['custom'],
    categories: [pack.label]
  }))

export const getCustomPackPuzzles = (key: string): Puzzle[] => cache.find((pack) => pack.key === key)?.puzzles ?? []

export type SaveCustomPackInput = { key?: string; label: string; entries: CustomPackEntryInput[] }

export const saveCustomPack = async (input: SaveCustomPackInput): Promise<CustomPack> => {
  const key = input.key && isCustomPackKey(input.key) ? input.key : generateKey()
  const label = input.label.trim()
  const puzzles = input.entries
    .slice(0, MAX_ENTRIES_PER_PACK)
    .map((entry, index) => buildCustomPuzzle(key, label, entry, index))
    .filter((puzzle): puzzle is Puzzle => puzzle !== null)

  const now = new Date().toISOString()
  const existing = cache.find((pack) => pack.key === key)
  const pack: CustomPack = { key, label, createdAt: existing?.createdAt ?? now, updatedAt: now, puzzles }

  const stored = await getStoredCustomPacks()
  const next = [...stored.filter((p) => p.key !== key), pack]
  await setStoredCustomPacks(next)

  cache = next
  version += 1

  return pack
}

export const deleteCustomPack = async (key: string): Promise<void> => {
  const stored = await getStoredCustomPacks()
  const next = stored.filter((pack) => pack.key !== key)
  await setStoredCustomPacks(next)

  cache = next
  version += 1
}

export const exportCustomPack = async (key: string): Promise<string | null> => {
  const pack = cache.find((p) => p.key === key)
  if (!pack) return null

  const payload: CustomPackExportPayload = { version: 1, exportedAt: new Date().toISOString(), pack }
  return JSON.stringify(payload, null, 2)
}

// Always assigns a fresh key on import — otherwise re-importing a pack shared by someone else
// could silently collide with (and overwrite) a same-keyed pack already on this device.
export const importCustomPack = async (raw: string): Promise<CustomPack> => {
  const parsed: unknown = JSON.parse(raw)
  const rawPack = parsed && typeof parsed === 'object' && 'pack' in (parsed as Record<string, unknown>) ? (parsed as CustomPackExportPayload).pack : (parsed as CustomPack)

  if (!rawPack || typeof rawPack.label !== 'string' || !Array.isArray(rawPack.puzzles)) {
    throw new Error('Invalid custom pack backup.')
  }

  const entries: CustomPackEntryInput[] = rawPack.puzzles.map((puzzle) => ({ answer: puzzle.answer, hint: typeof puzzle.metadata?.hint === 'string' ? puzzle.metadata.hint : undefined }))

  return saveCustomPack({ label: rawPack.label, entries })
}
