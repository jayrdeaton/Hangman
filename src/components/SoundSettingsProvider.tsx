import AsyncStorage from '@react-native-async-storage/async-storage'
import { JSX, ReactNode, useCallback, useEffect, useState } from 'react'

import { SoundSettingsContext } from '@/hooks/useSoundSettings'

const STORAGE_KEY = 'soundEnabled'

export type SoundSettingsProviderProps = { children: ReactNode }

// No splash gate here, unlike KeyboardLayoutProvider's own keyboardLayout gate (see
// src/utils/splashGate.ts) — that one blocks the splash screen because a wrong initial guess
// would visibly relabel the keyboard a moment after launch. This setting only affects whether a
// future guess plays a sound, and no guess can happen before the very first frame renders, so
// there's nothing for the splash screen to wait on; the saved value just loads in the background.
export const SoundSettingsProvider = ({ children }: SoundSettingsProviderProps): JSX.Element => {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'true' || stored === 'false') setEnabledState(stored === 'true')
    })
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    void AsyncStorage.setItem(STORAGE_KEY, String(next))
  }, [])

  return <SoundSettingsContext.Provider value={{ settings: { enabled }, setEnabled }}>{children}</SoundSettingsContext.Provider>
}
