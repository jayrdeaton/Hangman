import React, { useState } from 'react'
import Svg, { G, Line } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { randIn, shuffledIndices } from './shared/procedural'

// Quantitative/depletion: a flurry of snowflakes melts away one by one.
// maxMistakes=6, same baseline every mode uses.
// Positions/sizes/colors are re-rolled each round (generated once in useState initializer — see
// balloons.tsx's own doc comment for why that's safe: Main.tsx remounts Game per round).
// This file used to be the "Stars" mode — renamed once stars.tsx got a proper 5-pointed star
// shape, since this 4-pointed doodle reads more like a snowflake than a star.

type SnowflakeData = {
  key: string
  // Stable per-snowflake identity, independent of how many remain visible — see balloons.tsx's
  // own `index` field for why this needs to be fixed rather than derived from position in the
  // (shrinking) visible slice.
  index: number
  x: number
  y: number
  size: number
}

// Base slots covering the 100x100 canvas in a natural scattered layout — jittered per round below
// so snowflakes don't land in the exact same spot and size every game.
const BASE_SLOTS: { x: number; y: number; size: number }[] = [
  { x: 16, y: 20, size: 6 },
  { x: 74, y: 22, size: 5 },
  { x: 28, y: 46, size: 7 },
  { x: 62, y: 38, size: 6 },
  { x: 18, y: 68, size: 7 },
  { x: 52, y: 72, size: 8 }
]

const POSITION_JITTER = 6
const SIZE_VARIANCE = 0.2

function makeSnowflakes(): SnowflakeData[] {
  return BASE_SLOTS.map((slot, i) => ({
    key: `f${i}`,
    index: i,
    x: slot.x + randIn(-POSITION_JITTER, POSITION_JITTER),
    y: slot.y + randIn(-POSITION_JITTER, POSITION_JITTER),
    size: slot.size * randIn(1 - SIZE_VARIANCE, 1 + SIZE_VARIANCE)
  }))
}

// 4-pointed doodle snowflake: two crossed lines + two diagonal lines
const SnowflakeShape = ({ x, y, size, color }: { x: number; y: number; size: number; color: string }) => {
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

const SnowflakesVisual = ({ mistakes, color, colors }: { mistakes: number; color: string; colors?: string[] }) => {
  const [snowflakes] = useState<SnowflakeData[]>(makeSnowflakes)
  // Randomizes which snowflake gets which theme color each round, while still guaranteeing every
  // color gets used at least once (same guarantee the old fixed index % colors.length cycle had).
  const [colorOrder] = useState<number[]>(() => shuffledIndices(snowflakes.length))
  const visible = snowflakes.slice(clampStage(mistakes, snowflakes.length))

  return (
    <Svg viewBox='0 0 100 100'>
      {visible.map((s) => (
        <SnowflakeShape key={s.key} x={s.x} y={s.y} size={s.size} color={colors && colors.length > 0 ? colors[colorOrder[s.index] % colors.length] : color} />
      ))}
    </Svg>
  )
}

export const snowflakesMode: GameMode = {
  id: 'snowflakes',
  label: 'Snowflakes',
  description: 'A flurry of snowflakes melts away with each wrong guess',
  category: 'quantitative',
  behavior: 'depletion',
  maxMistakes: 6,
  Visual: SnowflakesVisual
}
