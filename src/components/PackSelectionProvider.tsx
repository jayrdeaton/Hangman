import AsyncStorage from '@react-native-async-storage/async-storage'
import { JSX, ReactNode, useCallback, useEffect, useState } from 'react'

import { PackSelectionContext } from '@/hooks/usePackSelection'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

const STORAGE_KEY = 'selectedPackKeys'

// "Every pack" — the same fallback buildInitialConfig used before this existed, and still the
// right first-paint value: getPuzzleManifest() is synchronous (built-in packs are static,
// custom-pack summaries come from an in-memory cache), so this is available immediately. Only
// reading what was previously *persisted* is actually async.
const allPackKeys = (): string[] =>
  getPuzzleManifest()
    .filter((item) => item.count > 0)
    .map((item) => item.key)

export type PackSelectionProviderProps = { children: ReactNode }

export const PackSelectionProvider = ({ children }: PackSelectionProviderProps): JSX.Element => {
  const [selectedPackKeys, setSelectedPackKeysState] = useState<string[]>(allPackKeys)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!stored) return
      try {
        const parsed: unknown = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.every((key) => typeof key === 'string')) setSelectedPackKeysState(parsed)
      } catch {
        // Ignore a corrupted value — the synchronous "every pack" fallback already in state stands.
      }
    })
  }, [])

  const setSelectedPackKeys = useCallback((next: string[]) => {
    setSelectedPackKeysState(next)
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  return <PackSelectionContext.Provider value={{ selectedPackKeys, setSelectedPackKeys }}>{children}</PackSelectionContext.Provider>
}
