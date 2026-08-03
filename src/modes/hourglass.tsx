import React from 'react'
import Svg, { G, Line, Path, Rect } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'

// Frame mode: 7 discrete stages (0=full, 6=empty), but rendered as a single continuous
// scene (one glass, one stand) rather than parts being added/removed. Sand drains from
// the top bulb into the bottom bulb; topSandLevel and bottomSandLevel always move in
// tandem so the total sand reads as conserved.

type Stage = {
  topSandLevel: number // 1 (full top bulb) .. 0 (empty)
  bottomSandLevel: number // 0 (empty bottom bulb) .. 1 (full, piled to the neck)
  streamVisible: boolean
}

const STAGES: Stage[] = [
  { topSandLevel: 1, bottomSandLevel: 0, streamVisible: true },
  { topSandLevel: 0.83, bottomSandLevel: 0.17, streamVisible: true },
  { topSandLevel: 0.67, bottomSandLevel: 0.33, streamVisible: true },
  { topSandLevel: 0.5, bottomSandLevel: 0.5, streamVisible: true },
  { topSandLevel: 0.33, bottomSandLevel: 0.67, streamVisible: true },
  { topSandLevel: 0.17, bottomSandLevel: 0.83, streamVisible: true },
  { topSandLevel: 0, bottomSandLevel: 1, streamVisible: false }
]

// Neck sits at the exact center of the viewBox; both bulbs are equal-height triangles.
const NECK_X = 50
const NECK_Y = 50
const GLASS_TOP_Y = 22
const GLASS_BOTTOM_Y = 78
const BULB_HALF_WIDTH = 20
const TRIANGLE_HEIGHT = NECK_Y - GLASS_TOP_Y // 28, same as GLASS_BOTTOM_Y - NECK_Y

// Outer stand: two flared cap plates connected by corner posts, sitting just outside the glass.
const CAP_LEFT_X = 22
const CAP_RIGHT_X = 78
const CAP_TOP_Y = 16
const CAP_BOTTOM_Y = 81
const CAP_H = 3
const POST_LEFT_X = 28
const POST_RIGHT_X = 72
const POST_TOP_Y = 19
const POST_BOTTOM_Y = 81

const TILT_DEG = -8

// The glass: a single bowtie outline, top-left -> top-right -> neck -> bottom-right ->
// bottom-left -> neck -> close. Visiting the neck point twice traces both diagonal pairs.
const GLASS_PATH = [`M${NECK_X - BULB_HALF_WIDTH},${GLASS_TOP_Y}`, `L${NECK_X + BULB_HALF_WIDTH},${GLASS_TOP_Y}`, `L${NECK_X},${NECK_Y}`, `L${NECK_X + BULB_HALF_WIDTH},${GLASS_BOTTOM_Y}`, `L${NECK_X - BULB_HALF_WIDTH},${GLASS_BOTTOM_Y}`, `L${NECK_X},${NECK_Y}`, 'Z'].join(' ')

// Sand remaining in the top bulb: a triangle whose apex is pinned to the neck (so it
// always drains from the top down, staying flush against the neck) and whose flat top
// edge rises toward the bulb's own top edge as level approaches 1.
function topSandPath(level: number): string | null {
  if (level <= 0) return null
  const sandTopY = NECK_Y - TRIANGLE_HEIGHT * level
  const halfW = BULB_HALF_WIDTH * level
  return `M${NECK_X - halfW},${sandTopY} L${NECK_X + halfW},${sandTopY} L${NECK_X},${NECK_Y} Z`
}

function moundPeakY(level: number): number {
  return GLASS_BOTTOM_Y - TRIANGLE_HEIGHT * level
}

// Sand piling up in the bottom bulb: a rounded dune rather than a flat-topped triangle,
// with a touch of hand-drawn asymmetry so the pile doesn't read as too tidy.
function bottomMoundPath(level: number): string | null {
  if (level <= 0) return null
  const peakY = moundPeakY(level)
  const peakX = NECK_X + 1
  const baseHalfW = 3 + 15 * level
  const bulge = (GLASS_BOTTOM_Y - peakY) * 0.3
  return [`M${NECK_X - baseHalfW * 1.05},${GLASS_BOTTOM_Y}`, `Q${peakX - baseHalfW * 0.3},${peakY + bulge} ${peakX},${peakY}`, `Q${peakX + baseHalfW * 0.25},${peakY + bulge} ${NECK_X + baseHalfW * 0.95},${GLASS_BOTTOM_Y}`, 'Z'].join(' ')
}

const HourglassVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const index = clampStage(mistakes, STAGES.length - 1)
  const s = STAGES[index]
  const finalStage = index === STAGES.length - 1
  const tilt = finalStage ? TILT_DEG : 0

  const topPath = topSandPath(s.topSandLevel)
  const moundPath = bottomMoundPath(s.bottomSandLevel)
  const streamY2 = s.bottomSandLevel > 0 ? moundPeakY(s.bottomSandLevel) : GLASS_BOTTOM_Y

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      {/* transform (not rotation+origin) — react-native-svg's web renderer sets origin as a raw
          `transform-origin` DOM attribute, which isn't a valid one (React warns about it); folding
          the pivot into the transform string itself avoids that path entirely, same result. */}
      <G transform={`rotate(${tilt}, ${NECK_X}, ${NECK_Y})`}>
        {/* Stand frame: top/bottom cap plates + corner posts */}
        <Rect x={CAP_LEFT_X} y={CAP_TOP_Y} width={CAP_RIGHT_X - CAP_LEFT_X} height={CAP_H} rx='1.5' stroke={color} strokeWidth='3' fill='none' strokeLinejoin='round' />
        <Rect x={CAP_LEFT_X} y={CAP_BOTTOM_Y} width={CAP_RIGHT_X - CAP_LEFT_X} height={CAP_H} rx='1.5' stroke={color} strokeWidth='3' fill='none' strokeLinejoin='round' />
        <Line x1={POST_LEFT_X} y1={POST_TOP_Y} x2={POST_LEFT_X} y2={POST_BOTTOM_Y} stroke={color} strokeWidth='3' strokeLinecap='round' />
        <Line x1={POST_RIGHT_X} y1={POST_TOP_Y} x2={POST_RIGHT_X} y2={POST_BOTTOM_Y} stroke={color} strokeWidth='3' strokeLinecap='round' />

        {/* Bottom sand: rising mound, drawn before the glass outline so the outline stays crisp on top */}
        {moundPath && <Path d={moundPath} fill={color} />}

        {/* Glass: two triangles meeting at the neck */}
        <Path d={GLASS_PATH} stroke={color} strokeWidth='2.5' fill='none' strokeLinejoin='round' />

        {/* Top sand: always adjacent to the neck, draining downward */}
        {topPath && <Path d={topPath} fill={color} />}

        {/* Falling stream through the neck */}
        {s.streamVisible && <Line x1={NECK_X} y1={NECK_Y} x2={NECK_X} y2={streamY2} stroke={color} strokeWidth='2' strokeLinecap='round' />}
      </G>
    </Svg>
  )
}

export const hourglassMode: GameMode = {
  id: 'hourglass',
  label: 'Hourglass',
  description: 'Sand drains from an hourglass until time runs out',
  category: 'frames',
  behavior: 'depletion',
  maxMistakes: 6,
  Visual: HourglassVisual
}
