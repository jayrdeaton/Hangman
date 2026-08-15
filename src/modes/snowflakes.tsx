import React, { useState } from 'react'
import Svg, { G } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { randIn, shuffledIndices } from './shared/procedural'
import { SCENE_START_DELAY_MS } from './shared/sceneReveal'
import { SketchLine } from './shared/sketchShapes'

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
// How much each snowflake's one-time round-start sketch-in staggers behind the next.
const STAGGER_MS = 110

function makeSnowflakes(): SnowflakeData[] {
  return BASE_SLOTS.map((slot, i) => ({
    key: `f${i}`,
    index: i,
    x: slot.x + randIn(-POSITION_JITTER, POSITION_JITTER),
    y: slot.y + randIn(-POSITION_JITTER, POSITION_JITTER),
    size: slot.size * randIn(1 - SIZE_VARIANCE, 1 + SIZE_VARIANCE)
  }))
}

// 4-pointed doodle snowflake: two crossed lines + two diagonal lines. Each snowflake mounts exactly
// once — every one is already visible at mistakes=0 (this is a depletion mode: a wrong guess
// removes one rather than revealing one), so `started`/`delayMs` gate and stagger the whole flurry
// materializing in at round start, the same "hidden until the screen has actually appeared" gating
// GallowsWithRope uses (see classicParts.tsx's own comment) — not a per-guess reveal.
const SnowflakeShape = ({ x, y, size, color, started, delayMs }: { x: number; y: number; size: number; color: string; started?: boolean; delayMs?: number }) => {
  const d = size * 0.65
  return (
    <G>
      <SketchLine x1={x - size} y1={y} x2={x + size} y2={y} color={color} strokeWidth={2.5} start={started} delayMs={delayMs} />
      <SketchLine x1={x} y1={y - size} x2={x} y2={y + size} color={color} strokeWidth={2.5} start={started} delayMs={delayMs} />
      <SketchLine x1={x - d} y1={y - d} x2={x + d} y2={y + d} color={color} strokeWidth={2} start={started} delayMs={delayMs} />
      <SketchLine x1={x + d} y1={y - d} x2={x - d} y2={y + d} color={color} strokeWidth={2} start={started} delayMs={delayMs} />
    </G>
  )
}

const SnowflakesVisual = ({ mistakes, color, colors, started }: { mistakes: number; color: string; colors?: string[]; started?: boolean }) => {
  const [snowflakes] = useState<SnowflakeData[]>(makeSnowflakes)
  // Randomizes which snowflake gets which theme color each round, while still guaranteeing every
  // color gets used at least once (same guarantee the old fixed index % colors.length cycle had).
  const [colorOrder] = useState<number[]>(() => shuffledIndices(snowflakes.length))
  const visible = snowflakes.slice(clampStage(mistakes, snowflakes.length))

  return (
    <Svg viewBox='0 0 100 100'>
      {visible.map((s) => (
        <SnowflakeShape key={s.key} x={s.x} y={s.y} size={s.size} color={colors && colors.length > 0 ? colors[colorOrder[s.index] % colors.length] : color} started={started} delayMs={SCENE_START_DELAY_MS + s.index * STAGGER_MS} />
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
