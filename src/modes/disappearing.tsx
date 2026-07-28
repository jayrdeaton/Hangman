import React from 'react'
import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { CenteredBody, CenteredLeftArm, CenteredLeftLeg, CenteredRightArm, CenteredRightLeg, CenteredRopeAndHead } from './shared/classicParts'

// Starts complete. Parts are removed in removal order on each wrong guess.
// Removal order: head first, legs last (psychological: "saving" the character). No gallows frame, so the
// figure is horizontally centered rather than offset to clear a gallows pole.
const REMOVAL_ORDER = [CenteredRopeAndHead, CenteredBody, CenteredLeftArm, CenteredRightArm, CenteredLeftLeg, CenteredRightLeg]

const DisappearingVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const removed = clampStage(mistakes, REMOVAL_ORDER.length)
  const visible = REMOVAL_ORDER.slice(removed)
  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      {visible.map((Part, i) => (
        <Part key={i} color={color} />
      ))}
    </Svg>
  )
}

export const disappearingMode: GameMode = {
  id: 'disappearing',
  label: 'Disappearing',
  description: 'The figure starts complete and fades away with each wrong guess',
  category: 'parts',
  behavior: 'subtractive',
  maxMistakes: 6,
  Visual: DisappearingVisual
}
