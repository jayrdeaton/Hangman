import { createContext, useContext } from 'react'

export type PackSelectionContextType = {
  selectedPackKeys: string[]
  setSelectedPackKeys: (keys: string[]) => void
}

export const PackSelectionContext = createContext<PackSelectionContextType>({
  selectedPackKeys: [],
  setSelectedPackKeys: () => {}
})

export const usePackSelection = () => useContext(PackSelectionContext)
