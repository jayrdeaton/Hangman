import React from 'react'
import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { Body, GallowsWithRope, Head, LeftArm, LeftLeg, RightArm, RightLeg } from './shared/classicParts'

// Parts reveal order: head → body → arms → legs
const PARTS = [Head, Body, LeftArm, RightArm, LeftLeg, RightLeg]

const ClassicVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const count = Math.min(Math.max(0, mistakes), PARTS.length)
  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      <GallowsWithRope color={color} />
      {PARTS.slice(0, count).map((Part, i) => (
        <Part key={i} color={color} />
      ))}
    </Svg>
  )
}

export const classicMode: GameMode = {
  id: 'classic',
  label: 'Classic',
  description: 'The hangman appears piece by piece with each wrong guess',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: ClassicVisual
}
