import { createContext, useContext } from 'react'

export type SoundSettings = {
  enabled: boolean
}

export type SoundSettingsContextType = {
  settings: SoundSettings
  setEnabled: (enabled: boolean) => void
}

// Muted by default in dev/simulator builds (no SoundSettingsProvider ancestor to override this)
// so Claude/local testing doesn't blast audio; production builds still default to sound on.
// Mirrors @rific/feedback-press's own defaultSoundSettings fallback for the same reason.
export const SoundSettingsContext = createContext<SoundSettingsContextType>({
  settings: { enabled: !__DEV__ },
  setEnabled: () => {}
})

export const useSoundSettings = () => useContext(SoundSettingsContext)
