import AsyncStorage from '@react-native-async-storage/async-storage'

import { isGuestSeatKey, type PlayerKey } from '@/utils/players'
import type { PuzzleManifestItem } from '@/utils/puzzleCatalog'

import { puzzleManifest } from '../data/puzzleCatalog.generated'

// Every player's unlocked puzzles (the ones they've solved) under their own AsyncStorage key, so one
// player's solves never show as another's. The old single device-wide key (`puzzle_unlocks_v1` on its
// own) isn't read or adopted: the app hadn't shipped.
const PUZZLE_UNLOCKS_KEY_PREFIX = 'puzzle_unlocks_v1:'
const storageKey = (playerKey: PlayerKey): string => `${PUZZLE_UNLOCKS_KEY_PREFIX}${playerKey}`

export type PuzzleUnlockMap = Record<string, string[]>

export type PuzzleUnlockExportPayload = {
  version: 1
  exportedAt: string
  unlocks: PuzzleUnlockMap
}

const normalizeUnlockMap = (raw: unknown): PuzzleUnlockMap => {
  if (!raw || typeof raw !== 'object') return {}

  const input = raw as Record<string, unknown>
  const next: PuzzleUnlockMap = {}

  for (const [packKey, ids] of Object.entries(input)) {
    if (!Array.isArray(ids)) continue
    const valid = ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    if (valid.length > 0) next[packKey] = [...new Set(valid)]
  }

  return next
}

const parseStoredMap = (raw: string | null): PuzzleUnlockMap => {
  if (!raw) return {}
  try {
    return normalizeUnlockMap(JSON.parse(raw))
  } catch {
    return {}
  }
}

const writeMap = (playerKey: PlayerKey, unlockMap: PuzzleUnlockMap): Promise<void> => AsyncStorage.setItem(storageKey(playerKey), JSON.stringify(unlockMap))

export const getPuzzleUnlockMap = async (playerKey: PlayerKey): Promise<PuzzleUnlockMap> => {
  try {
    return parseStoredMap(await AsyncStorage.getItem(storageKey(playerKey)))
  } catch {
    return {}
  }
}

// Every player key with unlocked puzzles saved on this device.
const getStoredUnlockKeys = async (): Promise<string[]> => (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PUZZLE_UNLOCKS_KEY_PREFIX))

// Every player's unlocked puzzles together: a puzzle anyone on this device has solved. What Stats shows
// for All Profiles, the way its numbers there are every round played on the device.
export const getDevicePuzzleUnlockMap = async (): Promise<PuzzleUnlockMap> => {
  try {
    const keys = await getStoredUnlockKeys()
    const maps = await Promise.all(keys.map(async (key) => parseStoredMap(await AsyncStorage.getItem(key))))
    const device: PuzzleUnlockMap = {}
    for (const map of maps) {
      for (const [packKey, ids] of Object.entries(map)) device[packKey] = [...new Set([...(device[packKey] ?? []), ...ids])]
    }
    return device
  } catch {
    return {}
  }
}

// One player's unlocked puzzles, for their own progress backup (Settings' Export).
export const exportPuzzleUnlocks = async (playerKey: PlayerKey): Promise<string> => {
  const unlocks = await getPuzzleUnlockMap(playerKey)
  const payload: PuzzleUnlockExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    unlocks
  }

  return JSON.stringify(payload, null, 2)
}

// Stricter than importPuzzleUnlocks/mergePuzzleUnlocks below on purpose: those two accept a bare
// unlocks-map with no wrapper (a deliberate leniency for the old paste-a-blob flow, still relied on
// by their own tests), but this one is for disambiguating an incoming .hangman file from a custom
// pack file (see hangmanFile.ts) - requiring the `unlocks` key is what lets a caller tell "this is
// a progress backup" apart from "this is a pack" (which has a `pack` key instead) before deciding
// which import path to run.
export const parseProgressBackup = (raw: string): PuzzleUnlockMap => {
  const parsed: unknown = JSON.parse(raw)

  if (!parsed || typeof parsed !== 'object' || !('unlocks' in (parsed as Record<string, unknown>))) {
    throw new Error('Invalid progress backup.')
  }

  return normalizeUnlockMap((parsed as Record<string, unknown>).unlocks)
}

// Replaces one player's unlocked puzzles with a backup's.
export const importPuzzleUnlocks = async (playerKey: PlayerKey, raw: string): Promise<{ importedCount: number }> => {
  const parsed: unknown = JSON.parse(raw)

  let unlocks: PuzzleUnlockMap = {}

  if (parsed && typeof parsed === 'object' && 'unlocks' in (parsed as Record<string, unknown>)) {
    unlocks = normalizeUnlockMap((parsed as Record<string, unknown>).unlocks)
  } else {
    unlocks = normalizeUnlockMap(parsed)
  }

  await writeMap(playerKey, unlocks)

  const importedCount = Object.values(unlocks).reduce((sum, ids) => sum + ids.length, 0)
  return { importedCount }
}

// Adds a backup's unlocked puzzles to one player's own (Settings' Import, a .hangman file opened from
// another app).
export const mergePuzzleUnlocks = async (playerKey: PlayerKey, raw: string): Promise<{ importedCount: number; addedCount: number }> => {
  const parsed: unknown = JSON.parse(raw)

  let incoming: PuzzleUnlockMap = {}

  if (parsed && typeof parsed === 'object' && 'unlocks' in (parsed as Record<string, unknown>)) {
    incoming = normalizeUnlockMap((parsed as Record<string, unknown>).unlocks)
  } else {
    incoming = normalizeUnlockMap(parsed)
  }

  const current = await getPuzzleUnlockMap(playerKey)
  const merged: PuzzleUnlockMap = { ...current }

  let addedCount = 0

  for (const [packKey, ids] of Object.entries(incoming)) {
    const existing = new Set(merged[packKey] ?? [])
    for (const id of ids) {
      if (!existing.has(id)) {
        existing.add(id)
        addedCount += 1
      }
    }
    if (existing.size > 0) merged[packKey] = [...existing]
  }

  await writeMap(playerKey, merged)

  const importedCount = Object.values(incoming).reduce((sum, ids) => sum + ids.length, 0)
  return { importedCount, addedCount }
}

// One player's unlocked puzzles, for when a profile is reset or deleted, or a guest seat leaves.
export const clearPuzzleUnlocks = async (playerKey: PlayerKey): Promise<void> => {
  await AsyncStorage.removeItem(storageKey(playerKey))
}

// Every guest seat's whose seat has left the table (`seated`: the guest seats' keys at the table now),
// at launch: a seat's unlocked puzzles go with the seat (usePlayerData's forgetGuestSeat), and this
// catches any left behind, so a new seat given a leaver's id starts with none.
export const clearLeftGuestSeatUnlocks = async (seated: ReadonlySet<PlayerKey>): Promise<void> => {
  const left = (await getStoredUnlockKeys()).filter((key) => {
    const playerKey = key.slice(PUZZLE_UNLOCKS_KEY_PREFIX.length)
    return isGuestSeatKey(playerKey) && !seated.has(playerKey)
  })
  await Promise.all(left.map((key) => AsyncStorage.removeItem(key)))
}

// Every player's, for Stats' Reset All Stats.
export const clearAllPuzzleUnlocks = async (): Promise<void> => {
  await Promise.all((await getStoredUnlockKeys()).map((key) => AsyncStorage.removeItem(key)))
}

// A puzzle the player just solved. Returns whether it was new for them.
export const markPuzzleUnlocked = async (playerKey: PlayerKey, packKey: string, puzzleId: string): Promise<boolean> => {
  if (!packKey || !puzzleId) return false

  try {
    const unlockMap = await getPuzzleUnlockMap(playerKey)
    const existing = new Set(unlockMap[packKey] ?? [])

    if (existing.has(puzzleId)) return false

    existing.add(puzzleId)
    unlockMap[packKey] = [...existing]

    await writeMap(playerKey, unlockMap)
    return true
  } catch {
    return false
  }
}

export const getUnlockedCountForPack = (unlockMap: PuzzleUnlockMap, packKey: string): number => {
  return unlockMap[packKey]?.length ?? 0
}

export const getTotalUnlockedCount = (unlockMap: PuzzleUnlockMap): number => {
  return Object.values(unlockMap).reduce((sum, ids) => sum + ids.length, 0)
}

// StatsScreen's Puzzles Unlocked row: the sum lives here rather than in the screen, beside the per-pack
// count it's built from. Caps each pack's contribution at its own
// item.count (a pack whose catalog shrank shouldn't let a stale unlock entry push a tile's count
// past 100%), summed only over packs the current manifest actually has puzzles for.
export const getManifestUnlockProgress = (manifest: PuzzleManifestItem[], unlockMap: PuzzleUnlockMap): { totalUnlocked: number; totalAvailable: number; overallProgress: number } => {
  const totalAvailable = manifest.reduce((sum, item) => sum + item.count, 0)
  const totalUnlocked = manifest.reduce((sum, item) => sum + Math.min(getUnlockedCountForPack(unlockMap, item.key), item.count), 0)
  return { totalUnlocked, totalAvailable, overallProgress: totalAvailable > 0 ? totalUnlocked / totalAvailable : 0 }
}

// Built-in packs (never custom ones) with every puzzle unlocked: the Collection Complete family's
// count, over the winner's own unlocked puzzles. Rescans the whole manifest rather than only the pack
// just played, so a pack finished through a backup import is credited on the next win too.
export const getCompletedBuiltInPackKeys = (unlockMap: PuzzleUnlockMap): string[] => puzzleManifest.filter((item) => item.count > 0 && getUnlockedCountForPack(unlockMap, item.key) >= item.count).map((item) => item.key)
