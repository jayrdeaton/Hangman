import React from 'react'
import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { Body, GallowsWithRope, Head, LeftArm, LeftLeg, RightArm, RightLeg } from './shared/classicParts'

// Parts reveal order: head → body → arms → legs
const PARTS = [Head, Body, LeftArm, RightArm, LeftLeg, RightLeg]

const ClassicVisual = ({ mistakes, color, started }: { mistakes: number; color: string; started?: boolean }) => {
  const count = clampStage(mistakes, PARTS.length)
  return (
    <Svg viewBox='0 0 100 100'>
      <GallowsWithRope color={color} started={started} />
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
