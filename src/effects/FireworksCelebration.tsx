import { Fireworks } from '@tastic/sprites/fireworks'
import { JSX } from 'react'

import { useGameHaptics } from '@/hooks/useGameHaptics'
import { usePopSound } from '@/hooks/usePopSound'

import type { CelebrationProps } from './registry'

// Thin Hangman-specific wiring around @tastic/sprites' Fireworks. The package itself has no audio
// or haptics dependency (see FireworksProps' onBurst), so this is where Hangman's own pop sound and
// light haptic get reattached, each gated on its own setting (see usePopSound.ts and
// useGameHaptics.ts).
export const FireworksCelebration = ({ colors, dark }: CelebrationProps): JSX.Element => {
  const { playPop } = usePopSound()
  const { burst } = useGameHaptics()

  const handleBurst = () => {
    playPop()
    burst()
  }

  return <Fireworks colors={colors} dark={dark} onBurst={handleBurst} />
}
