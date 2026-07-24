import { createContext, useContext } from 'react'

export type KeyboardLayout = 'qwerty' | 'abc'

export type KeyboardLayoutContextType = {
  layout: KeyboardLayout
  setLayout: (layout: KeyboardLayout) => void
}

export const KeyboardLayoutContext = createContext<KeyboardLayoutContextType>({
  layout: 'qwerty',
  setLayout: () => {}
})

export const useKeyboardLayout = () => useContext(KeyboardLayoutContext)
