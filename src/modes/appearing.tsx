import React from 'react'
import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { Body, GallowsNoRope, LeftArm, LeftLeg, RightArm, RightLeg, RopeAndHead } from './shared/classicParts'

// Reverse psychology: figure builds bottom-up, head+rope last.
// Gallows shows but no rope until the final part appears.
const PARTS = [LeftLeg, RightLeg, Body, LeftArm, RightArm, RopeAndHead]

const AppearingVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const count = Math.min(Math.max(0, mistakes), PARTS.length)
  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      <GallowsNoRope color={color} />
      {PARTS.slice(0, count).map((Part, i) => (
        <Part key={i} color={color} />
      ))}
    </Svg>
  )
}

export const appearingMode: GameMode = {
  id: 'appearing',
  label: 'Appearing',
  description: 'The figure builds from the ground up — head appears last',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: AppearingVisual
}
