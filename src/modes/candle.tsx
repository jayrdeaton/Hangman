import React from 'react'
import Svg from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { SCENE_START_DELAY_MS } from './shared/sceneReveal'
import { cubicBezierLength, SketchLine, SketchPath, SketchRect } from './shared/sketchShapes'

// A "frame" mode: one continuous scene whose numeric params (body height, wick/flame length) shift
// with every wrong guess, rather than discrete parts appearing or disappearing. Only the very first
// frame, at round start, gets an actual reveal — the whole candle sketches itself on, base to body
// to wick to flame, once the screen itself has resolved (see classicParts.tsx's own GallowsWithRope
// comment for why `started` gates that rather than mount).
const SCENE_DRAW_MS = 420
const STAGGER_MS = 90

// Frame mode: 7 discrete stages (0=healthy, 6=dead).
// Base plate always at y=82 so the candle "sits" in place as it shrinks.
// All coordinates in 100x100 viewBox.

type Stage = {
  bodyTop: number
  bodyH: number
  wickLen: number
  flameH: number
  drip: boolean
  smoke: boolean
}

const STAGES: Stage[] = [
  { bodyTop: 30, bodyH: 52, wickLen: 8, flameH: 14, drip: false, smoke: false },
  { bodyTop: 36, bodyH: 46, wickLen: 7, flameH: 13, drip: false, smoke: false },
  { bodyTop: 42, bodyH: 40, wickLen: 6, flameH: 11, drip: true, smoke: false },
  { bodyTop: 50, bodyH: 32, wickLen: 5, flameH: 9, drip: true, smoke: false },
  { bodyTop: 58, bodyH: 24, wickLen: 4, flameH: 7, drip: true, smoke: false },
  { bodyTop: 66, bodyH: 16, wickLen: 3, flameH: 5, drip: false, smoke: false },
  { bodyTop: 74, bodyH: 8, wickLen: 0, flameH: 0, drip: false, smoke: true }
]

// A proper teardrop — a sharp apex at the top, where it's still attached to the body and hasn't
// yet pulled away from it, flaring out via two straight "shoulders" into a true semicircular bulge
// at the bottom where gravity has pulled the mass of the wax. Built from an explicit arc rather
// than a second pair of bezier control points mirroring the top ones — two curves that both close
// back to a single point at each end are geometrically a lens/leaf shape (a cusp at BOTH ends), not
// a drop, no matter how those control points are tuned. An arc is the only way to get a true round
// end on one side while keeping a sharp point on the other. `cx` is kept well inside the body's
// x=36..64 span (with margin for its rounded corners) so the drip always reads as wax running down
// the visible face of the candle, never spilling outside its silhouette. Drawn as an outline (not
// filled) so it sketches on the same way as the rest of the candle, rather than fading/scaling in
// as a solid blob.
function dripPath(cx: number, topY: number, len: number): { d: string; length: number } {
  const r = len * 0.28
  // The circle's own center — its bottom edge (cy + r) lands at topY + len, so the whole shape's
  // total height still matches the `len` the caller asked for.
  const cy = topY + len - r
  const shoulderLength = Math.hypot(r, cy - topY)
  const d = `M${cx},${topY} L${cx + r},${cy} A${r},${r} 0 0 1 ${cx - r},${cy} Z`
  const length = shoulderLength * 2 + Math.PI * r
  return { d, length }
}

function flamePath(wickTop: number, flameH: number): { d: string; length: number } {
  const f = flameH / 2
  const top = wickTop - flameH * 1.1
  const midX1 = 50 - f
  const midY1 = wickTop - f * 0.8
  const midX2 = 50 - f * 0.6
  const midY2 = top + flameH * 0.3
  const midX3 = 50 + f * 0.6
  const midX4 = 50 + f
  const d = [`M50,${wickTop}`, `C${midX1},${midY1}`, `${midX2},${midY2}`, `50,${top}`, `C${midX3},${midY2}`, `${midX4},${midY1}`, `50,${wickTop}`].join(' ')
  const length = cubicBezierLength(50, wickTop, midX1, midY1, midX2, midY2, 50, top) + cubicBezierLength(50, top, midX3, midY2, midX4, midY1, 50, wickTop)
  return { d, length }
}

const CandleVisual = ({ mistakes, color, colors, started }: { mistakes: number; color: string; colors?: string[]; started?: boolean }) => {
  const stageIndex = clampStage(mistakes, STAGES.length - 1)
  const s = STAGES[stageIndex]
  const wickTop = s.bodyTop - s.wickLen
  // Wax body is the focus (primary, it's what shrinks). Base plate is scaffold, same role
  // hourglass's stand plays — secondary. Wick/flame/drip/smoke are thin details on top of the
  // body — tertiary, same role hourglass's glass outline plays. Falls back to the plain `color`
  // when no triad is given (e.g. ModeSelector's card preview, which only passes `color`).
  const baseColor = colors?.[1] ?? color
  const detailColor = colors?.[2] ?? color

  const flame = s.flameH > 0 ? flamePath(wickTop, s.flameH) : null
  // Two drips (one left-of-center, one right) once the candle's deep enough into melting — reads
  // as more wax actively flowing, not just a single trickle — one drip at the earlier drip stages.
  const drip1 = s.drip ? dripPath(44, s.bodyTop + 4, 13) : null
  const drip2 = stageIndex >= 4 ? dripPath(57, s.bodyTop + 6, 10) : null
  const smokeD = `M50,${s.bodyTop - 2} C44,${s.bodyTop - 10} 56,${s.bodyTop - 18} 50,${s.bodyTop - 26}`
  const smokeLength = cubicBezierLength(50, s.bodyTop - 2, 44, s.bodyTop - 10, 56, s.bodyTop - 18, 50, s.bodyTop - 26)

  return (
    <Svg viewBox='0 0 100 100'>
      {/* Base plate */}
      <SketchRect x={30} y={82} width={40} height={8} rx={3} color={baseColor} strokeWidth={3} strokeLinejoin='round' start={started} delayMs={SCENE_START_DELAY_MS} durationMs={SCENE_DRAW_MS} />
      {/* Body */}
      <SketchRect x={36} y={s.bodyTop} width={28} height={s.bodyH} rx={3} color={color} strokeWidth={3} strokeLinejoin='round' start={started} delayMs={SCENE_START_DELAY_MS + STAGGER_MS} durationMs={SCENE_DRAW_MS} />
      {/* Wick */}
      {s.wickLen > 0 && <SketchLine x1={50} y1={s.bodyTop} x2={50} y2={wickTop} color={detailColor} strokeWidth={2.5} start={started} delayMs={SCENE_START_DELAY_MS + STAGGER_MS * 2} durationMs={SCENE_DRAW_MS} />}
      {/* Flame */}
      {flame && <SketchPath d={flame.d} length={flame.length} color={detailColor} strokeWidth={2.5} strokeLinejoin='round' start={started} delayMs={SCENE_START_DELAY_MS + STAGGER_MS * 3} durationMs={SCENE_DRAW_MS} />}
      {/* Wax drips, running down the body's own face — same material as the body, so they're
          primary (`color`), not the tertiary `detailColor` the thin wick/flame/smoke details use. */}
      {drip1 && <SketchPath d={drip1.d} length={drip1.length} color={color} strokeWidth={2} start={started} delayMs={SCENE_START_DELAY_MS + STAGGER_MS * 4} durationMs={SCENE_DRAW_MS} />}
      {drip2 && <SketchPath d={drip2.d} length={drip2.length} color={color} strokeWidth={2} start={started} delayMs={SCENE_START_DELAY_MS + STAGGER_MS * 4 + 60} durationMs={SCENE_DRAW_MS} />}
      {/* Smoke curl when fully burned */}
      {s.smoke && <SketchPath d={smokeD} length={smokeLength} color={detailColor} strokeWidth={2.5} start={started} delayMs={SCENE_START_DELAY_MS + STAGGER_MS * 4} durationMs={SCENE_DRAW_MS} />}
    </Svg>
  )
}

export const candleMode: GameMode = {
  id: 'candle',
  label: 'Candle',
  description: 'A candle burns shorter and shorter until only smoke remains',
  category: 'frames',
  behavior: 'depletion',
  maxMistakes: 6,
  Visual: CandleVisual
}
