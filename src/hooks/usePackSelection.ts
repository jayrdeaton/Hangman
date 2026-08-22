import { createContext, useContext } from 'react'

export type PackSelectionContextType = {
  selectedPackKeys: string[]
  setSelectedPackKeys: (keys: string[]) => void
  // Whether the persisted selection has been read back from AsyncStorage yet — see
  // PackSelectionProvider's own comment on why selectedPackKeys itself starts from an "every
  // pack" fallback instead of waiting on this.
  ready: boolean
}

export const PackSelectionContext = createContext<PackSelectionContextType>({
  selectedPackKeys: [],
  setSelectedPackKeys: () => {},
  ready: false
})

export const usePackSelection = () => useContext(PackSelectionContext)
