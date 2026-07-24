import AsyncStorage from '@react-native-async-storage/async-storage'
import { JSX, ReactNode, useCallback, useEffect, useState } from 'react'

import { KeyboardLayout, KeyboardLayoutContext } from '@/hooks/useKeyboardLayout'

const STORAGE_KEY = 'keyboardLayout'

export type KeyboardLayoutProviderProps = { children: ReactNode }

export const KeyboardLayoutProvider = ({ children }: KeyboardLayoutProviderProps): JSX.Element => {
  const [layout, setLayoutState] = useState<KeyboardLayout>('qwerty')

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'qwerty' || stored === 'abc') setLayoutState(stored)
    })
  }, [])

  const setLayout = useCallback((next: KeyboardLayout) => {
    setLayoutState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next)
  }, [])

  return <KeyboardLayoutContext.Provider value={{ layout, setLayout }}>{children}</KeyboardLayoutContext.Provider>
}
