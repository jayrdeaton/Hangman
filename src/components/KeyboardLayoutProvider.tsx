import AsyncStorage from '@react-native-async-storage/async-storage'
import { JSX, ReactNode, useCallback, useEffect, useState } from 'react'

import { KeyboardLayout, KeyboardLayoutContext } from '@/hooks/useKeyboardLayout'
import { useSplashReady } from '@/utils/splashGate'

const STORAGE_KEY = 'keyboardLayout'

export type KeyboardLayoutProviderProps = { children: ReactNode }

export const KeyboardLayoutProvider = ({ children }: KeyboardLayoutProviderProps): JSX.Element => {
  const [layout, setLayoutState] = useState<KeyboardLayout>('qwerty')
  // Separate from `layout` itself: a saved 'qwerty' preference (the same as the default state
  // above) wouldn't change `layout` at all, so gating readiness on THAT changing would leave the
  // 'keyboardLayout' gate (see src/utils/splashGate.ts) permanently unsatisfied for anyone who'd
  // saved the default. This tracks "the read finished," not "the value changed."
  const [layoutLoaded, setLayoutLoaded] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'qwerty' || stored === 'abc') setLayoutState(stored)
      setLayoutLoaded(true)
    })
  }, [])
  useSplashReady('keyboardLayout', layoutLoaded)

  const setLayout = useCallback((next: KeyboardLayout) => {
    setLayoutState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next)
  }, [])

  return <KeyboardLayoutContext.Provider value={{ layout, setLayout }}>{children}</KeyboardLayoutContext.Provider>
}
