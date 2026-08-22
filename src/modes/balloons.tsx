import React, { useState } from 'react'
import Svg, { Ellipse } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { randIn, shuffledIndices } from './shared/procedural'
import { SCENE_START_DELAY_MS } from './shared/sceneReveal'
import { DRAW_MS, quadraticBezierLength, SketchEllipse, SketchFill, SketchPath } from './shared/sketchShapes'

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
        const delayMs = SCENE_START_DELAY_MS + b.index * STAGGER_MS
        // Fill starts once the outline has had time to finish drawing (DRAW_MS, its own default
        // duration below) rather than racing it — same handoff hourglass.tsx's standDelay/glassDelay/
        // sandDelay stagger achieves with fixed offsets, since Sketch*/SketchFill have no
        // draw-finished callback to chain off of.
        const fillDelayMs = delayMs + DRAW_MS
        const stringD = `M${b.x},${b.y + b.ry} Q${stringMidX},${b.y + b.ry + 9} ${b.x},${stringEndY}`
        const stringLength = quadraticBezierLength(b.x, b.y + b.ry, stringMidX, b.y + b.ry + 9, b.x, stringEndY)
        return (
          // Every balloon mounts exactly once, already visible at mistakes=0 (this is a depletion
          // mode: a wrong guess pops one rather than revealing one), so `started`/`delayMs` gate and
          // stagger the whole bunch materializing in at round start rather than a per-guess reveal.
          // Fill paints first so the string, added last, sits visually in front of the balloon body
          // — same z-order the original combined fill+string group had. The outline stroke has no
          // fill of its own, so where it lands relative to the body fill underneath doesn't matter.
          <React.Fragment key={b.key}>
            <SketchFill bounds={{ x: b.x - b.rx, y: b.y - b.ry, width: b.rx * 2, height: b.ry * 2 }} clip={<Ellipse cx={b.x} cy={b.y} rx={b.rx - 1} ry={b.ry - 1} />} color={balloonColor} start={started} delayMs={fillDelayMs} />
            <SketchEllipse cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} color={balloonColor} strokeWidth={2.5} start={started} delayMs={delayMs} />
            <SketchPath d={stringD} length={stringLength} color={balloonColor} strokeWidth={2} start={started} delayMs={delayMs} />
          </React.Fragment>
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
