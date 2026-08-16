import { useAudioPlayer } from 'expo-audio'
import { useCallback } from 'react'

import { useSoundSettings } from './useSoundSettings'

// Relative, not the @/ alias — see useSoundEffects.ts's own comment on why static asset
// requires in this codebase stick to plain relative paths.
const CLICK_SOUND = require('../../assets/sounds/click.wav')

// Scoped to its own hook, not folded into useSoundEffects.ts — Haptic.tsx (the only caller)
// would otherwise also instantiate the four unused correct/wrong/win/loss players Game.tsx
// already owns, since useAudioPlayer() allocates an independent native player per call site.
export const useClickSound = () => {
  const { settings } = useSoundSettings()
  const clickPlayer = useAudioPlayer(CLICK_SOUND)

  // Same deferral as useSoundEffects.ts's own play() — see its comment for why this waits a
  // macrotask on Android rather than calling play() inline from the press handler.
  const playClick = useCallback(() => {
    if (!settings.enabled) return
    setTimeout(() => {
      void clickPlayer.seekTo(0).then(() => clickPlayer.play())
    }, 0)
  }, [settings.enabled, clickPlayer])

  return { playClick }
}
