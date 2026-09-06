import { Fireworks } from '@tastic/animations/fireworks'
import * as haptics from 'expo-haptics'
import { JSX } from 'react'

import { usePopSound } from '@/hooks/usePopSound'

import type { CelebrationProps } from './registry'

// Thin Hangman-specific wiring around @tastic/animations' Fireworks — the package itself has no
// audio/haptics dependency (see FireworksProps' onBurst), so this is where Hangman's own pop sound
// + light haptic get reattached, preserving the exact feel the pre-extraction inline version had.
export const FireworksCelebration = ({ colors, dark }: CelebrationProps): JSX.Element => {
  const { playPop } = usePopSound()

  const handleBurst = () => {
    playPop()
    void haptics.impactAsync(haptics.ImpactFeedbackStyle.Light)
  }

  return <Fireworks colors={colors} dark={dark} onBurst={handleBurst} />
}
