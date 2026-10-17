import { createContext, useContext } from 'react'

// The active player's pack selection (see PackSelectionProvider): each player has their own.
export type PackSelectionContextType = {
  selectedPackKeys: string[]
  setSelectedPackKeys: (keys: string[]) => void
  // Always true under PackSelectionProvider: the selection lives in redux, which has rehydrated by the
  // time anything renders (PersistGate). Only this fallback, with no provider, reads false.
  ready: boolean
}

export const PackSelectionContext = createContext<PackSelectionContextType>({
  selectedPackKeys: [],
  setSelectedPackKeys: () => {},
  ready: false
})

export const usePackSelection = () => useContext(PackSelectionContext)
