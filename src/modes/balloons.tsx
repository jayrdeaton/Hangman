import React, { useState } from 'react'
import Svg, { Ellipse, G, Path } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'

// Quantitative/depletion: N balloons generated at game start, one popped per wrong guess.
// Positions are stable per game (generated once in useState initializer).

type BalloonData = {
  key: string
  x: number
  y: number
  rx: number
  ry: number
  stringX: number // x offset for string curve
}

// Base positions covering the 100x100 canvas in a natural scattered layout
const BASE: Omit<BalloonData, 'key'>[] = [
  { x: 20, y: 28, rx: 11, ry: 14, stringX: -3 },
  { x: 52, y: 20, rx: 13, ry: 16, stringX: 2 },
  { x: 82, y: 30, rx: 10, ry: 13, stringX: 3 },
  { x: 30, y: 58, rx: 12, ry: 15, stringX: -2 },
  { x: 68, y: 55, rx: 11, ry: 14, stringX: 4 },
  { x: 50, y: 80, rx: 10, ry: 12, stringX: -1 }
]

function makeBalloons(): BalloonData[] {
  return BASE.map((b, i) => ({ ...b, key: `b${i}` }))
}

const BalloonVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const [balloons] = useState<BalloonData[]>(makeBalloons)
  const visible = balloons.slice(clampStage(mistakes, balloons.length))

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      {visible.map((b) => {
        const stringEndY = b.y + b.ry + 16
        const stringMidX = b.x + b.stringX
        return (
          <G key={b.key}>
            <Ellipse cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} stroke={color} strokeWidth='2.5' fill='none' />
            <Path d={`M${b.x},${b.y + b.ry} Q${stringMidX},${b.y + b.ry + 9} ${b.x},${stringEndY}`} stroke={color} strokeWidth='2' fill='none' strokeLinecap='round' />
          </G>
        )
      })}
    </Svg>
  )
}

export const balloonsMode: GameMode = {
  id: 'balloons',
  label: 'Balloons',
  description: 'Balloons pop one by one with every wrong answer',
  category: 'quantitative',
  behavior: 'depletion',
  maxMistakes: 6,
  Visual: BalloonVisual
}
