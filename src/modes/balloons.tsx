import React, { useState } from 'react'
import Svg, { Ellipse, G, Path } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { randIn, shuffledIndices } from './shared/procedural'
import { SCENE_START_DELAY_MS } from './shared/sceneReveal'
import { FadeScaleIn } from './shared/sketchShapes'

// Quantitative/depletion: N balloons generated at game start, one popped per wrong guess.
// Positions, sizes and colors are re-rolled each round (generated once in useState initializer —
// Main.tsx remounts Game with a fresh `key` per round, so this isn't stuck reusing one game's roll).

type BalloonData = {
  key: string
  // Stable per-balloon identity, independent of how many balloons remain visible — used to pick a
  // fixed slot in `colorOrder` below so a specific balloon keeps its own color for the whole round
  // instead of appearing to recolor as its neighbors pop and `visible`'s slice shifts.
  index: number
  x: number
  y: number
  rx: number
  ry: number
  stringX: number // x offset for string curve
  // 0 (far back) .. 1 (right up front) — drives both the size scale-down below and the paint
  // order in the visual, so back balloons render smaller and get drawn under their neighbors.
  depth: number
}

// Base slots covering the 100x100 canvas in a natural scattered layout. Each round jitters these
// (and the size/depth below) so balloons don't land in the exact same spot and size every game.
const BASE_SLOTS: { x: number; y: number }[] = [
  { x: 20, y: 28 },
  { x: 52, y: 20 },
  { x: 82, y: 30 },
  { x: 30, y: 58 },
  { x: 68, y: 55 },
  { x: 50, y: 80 }
]

const POSITION_JITTER = 6
const BASE_RX = 11.5
const BASE_RY = 14.5
const SIZE_VARIANCE = 0.15 // random size wobble layered on top of the depth scaling below
const BACK_SCALE = 0.7 // how small a fully-back balloon shrinks to, relative to a fully-front one
// How much each balloon's one-time round-start float-in staggers behind the next.
const STAGGER_MS = 110

function makeBalloons(): BalloonData[] {
  return BASE_SLOTS.map((slot, i) => {
    const depth = Math.random()
    const scale = (BACK_SCALE + (1 - BACK_SCALE) * depth) * randIn(1 - SIZE_VARIANCE, 1 + SIZE_VARIANCE)
    return {
      key: `b${i}`,
      index: i,
      x: slot.x + randIn(-POSITION_JITTER, POSITION_JITTER),
      y: slot.y + randIn(-POSITION_JITTER, POSITION_JITTER),
      rx: BASE_RX * scale,
      ry: BASE_RY * scale,
      stringX: randIn(-4, 4),
      depth
    }
  })
}

const BalloonVisual = ({ mistakes, color, colors, started }: { mistakes: number; color: string; colors?: string[]; started?: boolean }) => {
  const [balloons] = useState<BalloonData[]>(makeBalloons)
  // Randomizes which balloon gets which theme color each round, while still guaranteeing every
  // color gets used at least once (same guarantee the old fixed index % colors.length cycle had).
  const [colorOrder] = useState<number[]>(() => shuffledIndices(balloons.length))
  const visible = balloons.slice(clampStage(mistakes, balloons.length))
  // Back-to-front paint order so nearer (larger) balloons overlap farther (smaller) ones, instead
  // of whichever happens to still be alive drawing on top.
  const painted = [...visible].sort((a, b) => a.depth - b.depth)

  return (
    <Svg viewBox='0 0 100 100'>
      {painted.map((b) => {
        const stringEndY = b.y + b.ry + 16
        const stringMidX = b.x + b.stringX
        const balloonColor = colors && colors.length > 0 ? colors[colorOrder[b.index] % colors.length] : color
        return (
          // A balloon's outline is mostly beside the point (it's a solid fill, and its string is a
          // thin curve not worth the arc-length math a true stroke-draw would need) — the whole
          // balloon+string fades and scales in together instead, around its own center, same as
          // stars.tsx. Every balloon mounts exactly once, already visible at mistakes=0 (this is a
          // depletion mode: a wrong guess pops one rather than revealing one), so `started`/
          // `delayMs` gate and stagger the whole bunch floating in at round start.
          <FadeScaleIn key={b.key} cx={b.x} cy={b.y} start={started} delayMs={SCENE_START_DELAY_MS + b.index * STAGGER_MS}>
            <G>
              {/* Opaque fill (was fill='none') — an unfilled balloon let an overlapping neighbor's
                  string, or body, show straight through it. */}
              <Ellipse cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} stroke={balloonColor} strokeWidth='2.5' fill={balloonColor} />
              <Path d={`M${b.x},${b.y + b.ry} Q${stringMidX},${b.y + b.ry + 9} ${b.x},${stringEndY}`} stroke={balloonColor} strokeWidth='2' fill='none' strokeLinecap='round' />
            </G>
          </FadeScaleIn>
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
