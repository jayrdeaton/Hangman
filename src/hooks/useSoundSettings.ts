import { createContext, useContext } from 'react'

export type SoundSettings = {
  enabled: boolean
}

export type SoundSettingsContextType = {
  settings: SoundSettings
  setEnabled: (enabled: boolean) => void
}

export const SoundSettingsContext = createContext<SoundSettingsContextType>({
  settings: { enabled: true },
  setEnabled: () => {}
})

export const useSoundSettings = () => useContext(SoundSettingsContext)
