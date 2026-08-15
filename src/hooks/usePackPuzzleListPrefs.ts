import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'

import type { PuzzleDifficultyTier } from '@/utils/puzzleCatalog'

export type PackPuzzleStatusFilter = 'all' | 'unsolved' | 'solved'
export type PackPuzzleDifficultyFilter = 'all' | PuzzleDifficultyTier

export type PackPuzzleListPrefs = {
  statusFilter: PackPuzzleStatusFilter
  difficultyFilter: PackPuzzleDifficultyFilter
}

const STORAGE_KEY = 'packPuzzleListPrefs'

const DEFAULT_PREFS: PackPuzzleListPrefs = { statusFilter: 'all', difficultyFilter: 'all' }

const isValidPrefs = (value: unknown): value is PackPuzzleListPrefs => {
  if (typeof value !== 'object' || value === null) return false
  const prefs = value as Record<string, unknown>
  return (prefs.statusFilter === 'all' || prefs.statusFilter === 'unsolved' || prefs.statusFilter === 'solved') && (prefs.difficultyFilter === 'all' || prefs.difficultyFilter === 'easy' || prefs.difficultyFilter === 'medium' || prefs.difficultyFilter === 'hard')
}

// One shared preference across every pack's puzzle list (PackPuzzlesDrawer, AchievementsDrawer's
// own pack-detail step, PacksScreen's read-only "view contents"), not a per-pack setting — matches
// how every other player preference in this app persists (see PackSelectionProvider's own
// AsyncStorage read/write pattern). A player who sets "Unsolved, Hard" once expects every pack
// they open afterward to open the same way, not reset back to defaults each time — see
// PackPuzzleList's own doc comment on why it no longer resets on packKey change.
export const usePackPuzzleListPrefs = () => {
  const [prefs, setPrefsState] = useState<PackPuzzleListPrefs>(DEFAULT_PREFS)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!stored) return
      try {
        const parsed: unknown = JSON.parse(stored)
        if (isValidPrefs(parsed)) setPrefsState(parsed)
      } catch {
        // Ignore a corrupted value — the default already in state stands.
      }
    })
  }, [])

  const setPrefs = useCallback((patch: Partial<PackPuzzleListPrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch }
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { prefs, setPrefs }
}
