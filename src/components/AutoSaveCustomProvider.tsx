import AsyncStorage from '@react-native-async-storage/async-storage'
import { JSX, ReactNode, useCallback, useEffect, useState } from 'react'

import { AutoSaveCustomContext } from '@/hooks/useAutoSaveCustom'

const STORAGE_KEY = 'autoSaveCustom'

// Stored as an explicit 'on'/'off' string rather than JSON, matching KeyboardLayoutProvider: the
// validating read below then treats anything unrecognized (absent key, corrupt value, a shape from
// some future version) as "use the default" instead of throwing or coercing it to a boolean.
const STORED_ON = 'on'
const STORED_OFF = 'off'

export type AutoSaveCustomProviderProps = { children: ReactNode }

export const AutoSaveCustomProvider = ({ children }: AutoSaveCustomProviderProps): JSX.Element => {
  const [autoSave, setAutoSaveState] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === STORED_ON) setAutoSaveState(true)
      else if (stored === STORED_OFF) setAutoSaveState(false)
    })
  }, [])

  const setAutoSave = useCallback((next: boolean) => {
    setAutoSaveState(next)
    void AsyncStorage.setItem(STORAGE_KEY, next ? STORED_ON : STORED_OFF)
  }, [])

  return <AutoSaveCustomContext.Provider value={{ autoSave, setAutoSave }}>{children}</AutoSaveCustomContext.Provider>
}
