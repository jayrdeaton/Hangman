import AsyncStorage from '@react-native-async-storage/async-storage'

const PUZZLE_UNLOCKS_KEY = 'puzzle_unlocks_v1'

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

export const getPuzzleUnlockMap = async (): Promise<PuzzleUnlockMap> => {
  try {
    const raw = await AsyncStorage.getItem(PUZZLE_UNLOCKS_KEY)
    if (!raw) return {}
    return normalizeUnlockMap(JSON.parse(raw))
  } catch (_e) {
    return {}
  }
}

export const exportPuzzleUnlocks = async (): Promise<string> => {
  const unlocks = await getPuzzleUnlockMap()
  const payload: PuzzleUnlockExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    unlocks
  }

  return JSON.stringify(payload, null, 2)
}

export const importPuzzleUnlocks = async (raw: string): Promise<{ importedCount: number }> => {
  const parsed: unknown = JSON.parse(raw)

  let unlocks: PuzzleUnlockMap = {}

  if (parsed && typeof parsed === 'object' && 'unlocks' in (parsed as Record<string, unknown>)) {
    unlocks = normalizeUnlockMap((parsed as Record<string, unknown>).unlocks)
  } else {
    unlocks = normalizeUnlockMap(parsed)
  }

  await AsyncStorage.setItem(PUZZLE_UNLOCKS_KEY, JSON.stringify(unlocks))

  const importedCount = Object.values(unlocks).reduce((sum, ids) => sum + ids.length, 0)
  return { importedCount }
}

export const mergePuzzleUnlocks = async (raw: string): Promise<{ importedCount: number; addedCount: number }> => {
  const parsed: unknown = JSON.parse(raw)

  let incoming: PuzzleUnlockMap = {}

  if (parsed && typeof parsed === 'object' && 'unlocks' in (parsed as Record<string, unknown>)) {
    incoming = normalizeUnlockMap((parsed as Record<string, unknown>).unlocks)
  } else {
    incoming = normalizeUnlockMap(parsed)
  }

  const current = await getPuzzleUnlockMap()
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

  await AsyncStorage.setItem(PUZZLE_UNLOCKS_KEY, JSON.stringify(merged))

  const importedCount = Object.values(incoming).reduce((sum, ids) => sum + ids.length, 0)
  return { importedCount, addedCount }
}

export const clearPuzzleUnlocks = async (): Promise<void> => {
  await AsyncStorage.removeItem(PUZZLE_UNLOCKS_KEY)
}

export const markPuzzleUnlocked = async (packKey: string, puzzleId: string): Promise<boolean> => {
  if (!packKey || !puzzleId) return false

  try {
    const unlockMap = await getPuzzleUnlockMap()
    const existing = new Set(unlockMap[packKey] ?? [])

    if (existing.has(puzzleId)) return false

    existing.add(puzzleId)
    unlockMap[packKey] = [...existing]

    await AsyncStorage.setItem(PUZZLE_UNLOCKS_KEY, JSON.stringify(unlockMap))
    return true
  } catch (_e) {
    return false
  }
}

export const getUnlockedCountForPack = (unlockMap: PuzzleUnlockMap, packKey: string): number => {
  return unlockMap[packKey]?.length ?? 0
}

export const getTotalUnlockedCount = (unlockMap: PuzzleUnlockMap): number => {
  return Object.values(unlockMap).reduce((sum, ids) => sum + ids.length, 0)
}
