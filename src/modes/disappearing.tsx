import React from 'react'
import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { Body, GallowsWithRope, Head, LeftArm, LeftLeg, RightArm, RightLeg } from './shared/classicParts'

// Starts complete. Parts are removed in removal order on each wrong guess.
// Removal order: head first, legs last (psychological: "saving" the character).
const REMOVAL_ORDER = [Head, Body, LeftArm, RightArm, LeftLeg, RightLeg]

const DisappearingVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const removed = Math.min(Math.max(0, mistakes), REMOVAL_ORDER.length)
  const visible = REMOVAL_ORDER.slice(removed)
  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      <GallowsWithRope color={color} />
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
