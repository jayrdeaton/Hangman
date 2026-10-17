import { JSX, ReactNode, useCallback, useMemo } from 'react'
import { useDispatch, useSelector, useStore } from 'react-redux'

import { useActivePlayer } from '@/hooks/useActivePlayer'
import { useCatalogVersions } from '@/hooks/useCatalog'
import { PackSelectionContext } from '@/hooks/usePackSelection'
import { playerSettingsActions } from '@/redux/playerSettingsSlice'
import type { RootState } from '@/redux/store'
import { getPuzzleManifest } from '@/utils/puzzleCatalog'

// Every pack with a puzzle in it, built-in and custom (custom-pack summaries come from customPacks.ts's
// in-memory cache, loaded a moment after launch: see useCatalog's packsVersion).
const allPackKeys = (): string[] =>
  getPuzzleManifest()
    .filter((item) => item.count > 0)
    .map((item) => item.key)

export type PackSelectionProviderProps = { children: ReactNode }

// The active player's pack selection, from their playerSettings entry. Stored as null while every pack
// is on (a player who never changed it, or who switched them all back on), so the custom packs that load
// after launch, and any made or imported later, are part of it without anyone switching them on; it's
// only stored as a list while some pack is off. Must render inside CatalogProvider, whose packsVersion
// rebuilds "every pack" when the custom packs change. Nothing to wait for: redux has rehydrated by the
// time this renders (PersistGate), so `ready` is always true.
export const PackSelectionProvider = ({ children }: PackSelectionProviderProps): JSX.Element => {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const { key: playerKey } = useActivePlayer()
  const { packsVersion } = useCatalogVersions()
  const storedPackKeys = useSelector((state: RootState) => state.playerSettings[playerKey]?.packKeys ?? null)
  // packsVersion isn't read here: it's a change counter bumped whenever a custom pack is created,
  // edited, deleted or imported (or the cache loads), since getPuzzleManifest() otherwise looks pure.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- packsVersion is an intentional external invalidation trigger, not a value the memo body reads
  const everyPack = useMemo(() => allPackKeys(), [packsVersion])
  const selectedPackKeys = storedPackKeys ?? everyPack

  // A selection that has every pack in it is stored as "every pack" (null), whatever order it came in.
  const setSelectedPackKeys = useCallback(
    (next: string[]) => {
      const chosen = new Set(next)
      const packKeys = allPackKeys().every((key) => chosen.has(key)) ? null : [...next]
      const current = store.getState().playerSettings[playerKey]?.packKeys ?? null
      if (packKeys === null && current === null) return
      dispatch(playerSettingsActions.setPackKeys({ playerKey, packKeys }))
    },
    [dispatch, store, playerKey]
  )

  // Memoized: the loadouts' memoized drawers take these values as props.
  const value = useMemo(() => ({ selectedPackKeys, setSelectedPackKeys, ready: true }), [selectedPackKeys, setSelectedPackKeys])

  return <PackSelectionContext.Provider value={value}>{children}</PackSelectionContext.Provider>
}
