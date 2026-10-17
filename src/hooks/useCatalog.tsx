import { createContext, JSX, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { loadCustomPacksCache } from '@/utils/customPacks'

// Change counters for the two things the catalog's pure-looking getters can't see change: unlocked
// puzzles (a win, a backup import, a stats reset) and custom packs (created, edited, deleted,
// imported). Screens that show either re-read it when its counter moves. Lives above the navigator
// because every screen can change one: Settings' Backup, the loadout's pack editor, the game's wins,
// a .hangman file opened from another app.
export type CatalogVersions = { unlockVersion: number; packsVersion: number }
export type CatalogActions = { refreshUnlocks: () => void; refreshCustomPacks: () => void }

const CatalogVersionsContext = createContext<CatalogVersions>({ unlockVersion: 0, packsVersion: 0 })
const CatalogActionsContext = createContext<CatalogActions>({ refreshUnlocks: () => {}, refreshCustomPacks: () => {} })
// The unlock counter on its own too, for usePuzzleUnlocks: the memoized drawers read the unlocked
// puzzles through it, and a custom pack saved elsewhere shouldn't re-render them as well.
const UnlockVersionContext = createContext(0)

export const CatalogProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [unlockVersion, setUnlockVersion] = useState(0)
  const [packsVersion, setPacksVersion] = useState(0)
  const refreshUnlocks = useCallback(() => setUnlockVersion((v) => v + 1), [])
  const refreshCustomPacks = useCallback(() => setPacksVersion((v) => v + 1), [])

  // Custom packs live in AsyncStorage, so they load a moment after launch. Bumping the version
  // afterward makes them show up in the pack lists and random draws as soon as they're in memory.
  useEffect(() => {
    void loadCustomPacksCache().then(refreshCustomPacks)
  }, [refreshCustomPacks])

  // Separate contexts, so the game screen (which only ever calls these) doesn't re-render when a count moves.
  const actions = useMemo(() => ({ refreshUnlocks, refreshCustomPacks }), [refreshUnlocks, refreshCustomPacks])
  const versions = useMemo(() => ({ unlockVersion, packsVersion }), [unlockVersion, packsVersion])

  return (
    <CatalogActionsContext.Provider value={actions}>
      <CatalogVersionsContext.Provider value={versions}>
        <UnlockVersionContext.Provider value={unlockVersion}>{children}</UnlockVersionContext.Provider>
      </CatalogVersionsContext.Provider>
    </CatalogActionsContext.Provider>
  )
}

export const useCatalogVersions = (): CatalogVersions => useContext(CatalogVersionsContext)
export const useCatalogActions = (): CatalogActions => useContext(CatalogActionsContext)
export const useUnlockVersion = (): number => useContext(UnlockVersionContext)
