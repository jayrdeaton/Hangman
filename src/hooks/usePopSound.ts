import { useAudioPool } from '@rific/feedback-press/audio'
import { useCallback } from 'react'

import { useSoundSettings } from './useSoundSettings'

// Relative, not the @/ alias — see useSoundEffects.ts's own comment on why static asset
// requires in this codebase stick to plain relative paths.
const POP_SOUND = require('../../assets/sounds/pop.wav')

// Pooled (mirrors CashierFu-Utility's useSound.ts PLAYER_POOL_SIZE pattern) because fireworks.tsx
// spawns a burst every 180-420ms while each burst's own animation runs ~1200ms — pops routinely
// overlap themselves, unlike the single-shot correct/wrong/win/loss/click sounds. Pooling itself
// now comes from @rific/feedback-press/audio's useAudioPool rather than a hand-rolled round-robin.
export const usePopSound = () => {
  const { settings } = useSoundSettings()
  const rawPlay = useAudioPool(POP_SOUND, { poolSize: 4 })

  const playPop = useCallback(() => {
    if (!settings.enabled) return
    rawPlay()
  }, [settings.enabled, rawPlay])

  return { playPop }
}
