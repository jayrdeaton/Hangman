import React, { useState } from 'react'
import Svg, { Path } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { randIn, shuffledIndices } from './shared/procedural'
import { SCENE_START_DELAY_MS } from './shared/sceneReveal'
import { FadeScaleIn } from './shared/sketchShapes'

// Quantitative/depletion: a night sky dims one proper 5-pointed star at a time.
// maxMistakes=6, same baseline every mode uses.
// Positions/sizes/colors are re-rolled each round (generated once in useState initializer — see
// balloons.tsx's own doc comment for why that's safe: Main.tsx remounts Game per round).

type StarData = {
  key: string
  // Stable per-star identity, independent of how many stars remain visible — see balloons.tsx's
  // own `index` field for why this needs to be fixed rather than derived from position in the
  // (shrinking) visible slice.
  index: number
  x: number
  y: number
  size: number
}

// Base slots covering the 100x100 canvas in a natural scattered layout — jittered per round below
// so stars don't land in the exact same spot and size every game.
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
// Outer-to-inner radius ratio. ~0.382 is the mathematically "regular" pentagram; going rounder
// (0.5) gives fatter, friendlier points closer to how someone doodles a star by hand.
const INNER_RATIO = 0.5
// How much each star's one-time round-start materialize-in staggers behind the next.
const STAGGER_MS = 110

// A proper 5-pointed star outline, one point straight up — 10 alternating outer/inner vertices —
// instead of the 4-pointed crossed-lines doodle this mode used to draw (see snowflakes.tsx, which
// kept that original doodle under its own name).
function starPath(cx: number, cy: number, outerR: number): string {
  const innerR = outerR * INNER_RATIO
  const points: string[] = []
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`)
  }
  return `M${points[0]} L${points.slice(1).join(' L')} Z`
}

function makeStars(): StarData[] {
  return BASE_SLOTS.map((slot, i) => ({
    key: `s${i}`,
    index: i,
    x: slot.x + randIn(-POSITION_JITTER, POSITION_JITTER),
    y: slot.y + randIn(-POSITION_JITTER, POSITION_JITTER),
    size: slot.size * randIn(1 - SIZE_VARIANCE, 1 + SIZE_VARIANCE)
  }))
}

// A star is mostly solid fill with only a hairline stroke, so tracing that stroke wouldn't read as
// "drawing" the star (the fill would already show solid underneath the whole time) — it fades and
// scales in around its own center instead, same as balloons.tsx. Every star mounts exactly once,
// already visible at mistakes=0 (this is a depletion mode: a wrong guess removes one rather than
// revealing one), so `started`/`delayMs` gate and stagger the whole sky materializing in at round
// start rather than a per-guess reveal.
const StarShape = ({ x, y, size, color, started, delayMs }: { x: number; y: number; size: number; color: string; started?: boolean; delayMs?: number }) => (
  <FadeScaleIn cx={x} cy={y} start={started} delayMs={delayMs}>
    <Path d={starPath(x, y, size)} fill={color} stroke={color} strokeWidth='1' />
  </FadeScaleIn>
)

const StarsVisual = ({ mistakes, color, colors, started }: { mistakes: number; color: string; colors?: string[]; started?: boolean }) => {
  const [stars] = useState<StarData[]>(makeStars)
  // Randomizes which star gets which theme color each round, while still guaranteeing every
  // color gets used at least once (same guarantee the old fixed index % colors.length cycle had).
  const [colorOrder] = useState<number[]>(() => shuffledIndices(stars.length))
  const visible = stars.slice(clampStage(mistakes, stars.length))

  return (
    <Svg viewBox='0 0 100 100'>
      {visible.map((s) => (
        <StarShape key={s.key} x={s.x} y={s.y} size={s.size} color={colors && colors.length > 0 ? colors[colorOrder[s.index] % colors.length] : color} started={started} delayMs={SCENE_START_DELAY_MS + s.index * STAGGER_MS} />
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
  maxMistakes: 6,
  Visual: StarsVisual
}
