import { useSoundSettings } from '@rific/feedback-press'
import { useAudioPool } from '@rific/feedback-press/audio'
import { useCallback } from 'react'

// Relative, not the @/ alias — see useSoundEffects.ts's own comment on why static asset
// requires in this codebase stick to plain relative paths.
const CLICK_SOUND = require('../../assets/sounds/click.wav')

// Scoped to its own hook, not folded into useSoundEffects.ts — Haptic.tsx (the only caller)
// would otherwise also instantiate the four unused correct/wrong/win/loss players Game.tsx
// already owns, since useAudioPlayer() allocates an independent native player per call site.
export const useClickSound = () => {
  const { settings } = useSoundSettings()
  // No poolSize override — this fires as the app-wide press sound via Haptic.tsx's
  // FeedbackPressProvider, so a fast sequence of taps (e.g. typing on the on-screen keyboard)
  // can retrigger it quickly. The default pool already covers that; poolSize: 1 would collapse
  // back to a single shared player racing itself, the exact bug useAudioPool exists to prevent.
  const rawPlay = useAudioPool(CLICK_SOUND)

  const playClick = useCallback(() => {
    if (!settings.enabled) return
    rawPlay()
  }, [settings.enabled, rawPlay])

  return { playClick }
}
