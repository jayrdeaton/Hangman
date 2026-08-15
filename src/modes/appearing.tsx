import React from 'react'
import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { CenteredBody, CenteredHead, CenteredLeftArm, CenteredLeftLeg, CenteredRightArm, CenteredRightLeg } from './shared/classicParts'

// Same head-to-toe reveal order as classic.tsx's own PARTS, just without its gallows frame — so
// the figure is horizontally centered rather than offset to clear a gallows pole.
const PARTS = [CenteredHead, CenteredBody, CenteredLeftArm, CenteredRightArm, CenteredLeftLeg, CenteredRightLeg]

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
  description: 'The figure appears head to toe with each wrong guess',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: AppearingVisual
}
