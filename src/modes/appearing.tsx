import React from 'react'
import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { CenteredBody, CenteredLeftArm, CenteredLeftLeg, CenteredRightArm, CenteredRightLeg, CenteredRopeAndHead } from './shared/classicParts'

// Reverse psychology: figure builds bottom-up, head+rope last. No gallows frame, so the
// figure is horizontally centered rather than offset to clear a gallows pole.
const PARTS = [CenteredLeftLeg, CenteredRightLeg, CenteredBody, CenteredLeftArm, CenteredRightArm, CenteredRopeAndHead]

const AppearingVisual = ({ mistakes, color }: { mistakes: number; color: string }) => {
  const count = clampStage(mistakes, PARTS.length)
  return (
    <Svg viewBox='0 0 100 100'>
      {PARTS.slice(0, count).map((Part, i) => (
        <Part key={i} color={color} />
      ))}
    </Svg>
  )
}

export const appearingMode: GameMode = {
  id: 'appearing',
  label: 'Appearing',
  description: 'The figure builds from the ground up, head appears last',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: AppearingVisual
}
