import AsyncStorage from '@react-native-async-storage/async-storage'
import { JSX, ReactNode, useCallback, useEffect, useState } from 'react'

import { PackSelectionContext } from '@/hooks/usePackSelection'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'
import { useSplashReady } from '@/utils/splashGate'

const STORAGE_KEY = 'selectedPackKeys'

// "Every pack" - the same fallback buildInitialConfig used before this existed, and still the
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
  // Separate from selectedPackKeys itself (which happily starts from the "every pack" fallback
  // above and corrects in place once this resolves), so a reader can tell the saved selection from
  // that fallback: the game screen waits for it before drawing a puzzle (see SoloRound in
  // GameScreen.tsx), so a draw never comes from packs the player had switched off.
  // Also fed into the app's shared splash gate (see splashGate.ts), alongside puzzleDefaults, so on
  // a normal cold boot the saved selection is already in place by the time the splash lifts,
  // before the loadout's pack list or any draw can read it.
  const [ready, setReady] = useState(false)
  useSplashReady('packSelection', ready)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed: unknown = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.every((key) => typeof key === 'string')) setSelectedPackKeysState(parsed)
        } catch {
          // Ignore a corrupted value - the synchronous "every pack" fallback already in state stands.
        }
      }
      setReady(true)
    })
  }, [])

  const setSelectedPackKeys = useCallback((next: string[]) => {
    setSelectedPackKeysState(next)
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  return <PackSelectionContext.Provider value={{ selectedPackKeys, setSelectedPackKeys, ready }}>{children}</PackSelectionContext.Provider>
}
