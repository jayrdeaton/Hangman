import React, { useState } from 'react'
import Svg, { G, Line } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'

// Quantitative/depletion: night sky fades star by star.
// maxMistakes=8 so the sky starts fuller. Stars are 4-pointed doodle style.

type StarData = { key: string; x: number; y: number; size: number }

const BASE: Omit<StarData, 'key'>[] = [
  { x: 16, y: 20, size: 6 },
  { x: 42, y: 13, size: 8 },
  { x: 74, y: 22, size: 5 },
  { x: 28, y: 46, size: 7 },
  { x: 62, y: 38, size: 6 },
  { x: 84, y: 55, size: 5 },
  { x: 18, y: 68, size: 7 },
  { x: 52, y: 72, size: 8 }
]

function makeStars(): StarData[] {
  return BASE.map((s, i) => ({ ...s, key: `s${i}` }))
}

// 4-pointed doodle star: two crossed lines + two diagonal lines
const StarShape = ({ x, y, size, color }: { x: number; y: number; size: number; color: string }) => {
  const d = size * 0.65
  return (
    <G>
      <Line x1={x - size} y1={y} x2={x + size} y2={y} stroke={color} strokeWidth='2.5' strokeLinecap='round' />
      <Line x1={x} y1={y - size} x2={x} y2={y + size} stroke={color} strokeWidth='2.5' strokeLinecap='round' />
      <Line x1={x - d} y1={y - d} x2={x + d} y2={y + d} stroke={color} strokeWidth='2' strokeLinecap='round' />
      <Line x1={x + d} y1={y - d} x2={x - d} y2={y + d} stroke={color} strokeWidth='2' strokeLinecap='round' />
    </G>
  )
}

const StarsVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const [stars] = useState<StarData[]>(makeStars)
  const visible = stars.slice(clampStage(mistakes, stars.length))

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      {visible.map((s) => (
        <StarShape key={s.key} x={s.x} y={s.y} size={s.size} color={color} />
      ))}
    </Svg>
  )
}

export const starsMode: GameMode = {
  id: 'stars',
  label: 'Stars',
  description: 'A night sky dims star by star with each wrong guess',
  category: 'quantitative',
  behavior: 'depletion',
  maxMistakes: 8,
  Visual: StarsVisual
}
