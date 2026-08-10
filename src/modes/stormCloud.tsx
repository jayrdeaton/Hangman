import React from 'react'
import Svg, { Circle, G, Line, Path } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'

// Quantitative/accumulation: a clear sky clouds over and a storm builds with every wrong
// guess. Unlike Balloons/Stars (depletion — things disappear), Storm Cloud is the opposite:
// the cloud, rain, and lightning all grow/appear as mistakes pile up. The sun is a small
// fixed fixture near the top that never moves, but gets increasingly obscured (dimmed and
// covered) as the cloud grows over it, culminating in a full dark storm with lightning as
// this mode's whimsical "game over" flourish.

type Stage = {
  cloudCoverage: number // 0 (clear sky) .. 1 (sun fully hidden, dark storm)
  rainCount: number
  boltCount: number
}

const STAGES: Stage[] = [
  { cloudCoverage: 0.06, rainCount: 0, boltCount: 0 },
  { cloudCoverage: 0.18, rainCount: 0, boltCount: 0 },
  { cloudCoverage: 0.32, rainCount: 0, boltCount: 0 },
  { cloudCoverage: 0.48, rainCount: 2, boltCount: 0 },
  { cloudCoverage: 0.64, rainCount: 4, boltCount: 0 },
  { cloudCoverage: 0.8, rainCount: 5, boltCount: 1 },
  { cloudCoverage: 1, rainCount: 7, boltCount: 2 }
]

const SUN_X = 50
const SUN_Y = 24
const SUN_R = 9

// A single continuous cloud outline (three bumps + a flat-ish bottom) rather than several
// overlapping stroked circles — overlapping outlines cross through each other's interior and
// read as a tangled scribble instead of one soft puffy cloud. Local space, canonical scale=1,
// centered near the origin; positioned/sized per-stage via a translate+scale transform.
const CLOUD_PATH = 'M-19,3 A8,8 0 0 1 -7,3 A11,11 0 0 1 5,3 A9,9 0 0 1 19,3 Q0,9 -19,3 Z'
// The path's own lowest point (from the closing Q curve), used to derive cloudBottom below.
const CLOUD_LOCAL_BASELINE = 9

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]

function sunRays(cx: number, cy: number, rInner: number, rOuter: number) {
  return RAY_ANGLES.map((deg) => {
    const rad = (deg * Math.PI) / 180
    return {
      key: `ray${deg}`,
      x1: cx + rInner * Math.cos(rad),
      y1: cy + rInner * Math.sin(rad),
      x2: cx + rOuter * Math.cos(rad),
      y2: cy + rOuter * Math.sin(rad)
    }
  })
}

// Jagged zig-zag bolt anchored at (x, yTop), pointing down
function boltPath(x: number, yTop: number): string {
  return `M${x},${yTop} L${x - 4},${yTop + 9} L${x + 3},${yTop + 10} L${x - 5},${yTop + 20} L${x + 4},${yTop + 19} L${x - 2},${yTop + 28}`
}

const StormCloudVisual = ({ mistakes, color }: { mistakes: number; color: string }) => {
  const s = STAGES[clampStage(mistakes, STAGES.length - 1)]

  // Cloud drifts in as a tiny wisp off to the side, then grows and moves in to fully cover the sun.
  const scale = 0.25 + s.cloudCoverage * 0.75
  const cloudX = SUN_X + (1 - s.cloudCoverage) * 18
  const cloudY = SUN_Y + (1 - s.cloudCoverage) * 6
  const sunOpacity = Math.max(0.05, 1 - s.cloudCoverage * 0.95)

  const cloudBottom = cloudY + CLOUD_LOCAL_BASELINE * scale
  const rainSpread = 16 * Math.max(scale, 0.4)
  const rays = sunRays(SUN_X, SUN_Y, SUN_R + 2, SUN_R + 7)

  return (
    <Svg viewBox='0 0 100 100'>
      {/* Sun: always present, fades and gets covered as the storm builds */}
      <G opacity={sunOpacity}>
        <Circle cx={SUN_X} cy={SUN_Y} r={SUN_R} stroke={color} strokeWidth='2.5' fill='none' />
        {rays.map((r) => (
          <Line key={r.key} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={color} strokeWidth='2' strokeLinecap='round' />
        ))}
      </G>

      {/* Cloud: grows and drifts over the sun as mistakes pile up */}
      <G transform={`translate(${cloudX} ${cloudY}) scale(${scale})`}>
        <Path d={CLOUD_PATH} stroke={color} strokeWidth={2.5 / scale} fill='none' strokeLinejoin='round' />
      </G>

      {/* Rain: diagonal drops beneath the cloud, only once the storm has started */}
      {Array.from({ length: s.rainCount }).map((_, i) => {
        const t = s.rainCount > 1 ? i / (s.rainCount - 1) : 0.5
        const x = cloudX - rainSpread + t * 2 * rainSpread
        const yTop = cloudBottom + 2 + (i % 2 === 0 ? 0 : 3)
        return <Line key={`rain${i}`} x1={x} y1={yTop} x2={x - 3} y2={yTop + 8} stroke={color} strokeWidth='2' strokeLinecap='round' />
      })}

      {/* Lightning: jagged bolt(s), the storm's whimsical "game over" flourish */}
      {Array.from({ length: s.boltCount }).map((_, i) => {
        const t = s.boltCount > 1 ? i / (s.boltCount - 1) : 0.5
        const x = cloudX - 10 + t * 20
        const yTop = cloudBottom + 3
        return <Path key={`bolt${i}`} d={boltPath(x, yTop)} stroke={color} strokeWidth='2.5' fill='none' strokeLinecap='round' strokeLinejoin='round' />
      })}
    </Svg>
  )
}

export const stormCloudMode: GameMode = {
  id: 'stormCloud',
  label: 'Storm Cloud',
  description: 'A sunny sky clouds over and a storm builds with every wrong guess',
  category: 'quantitative',
  behavior: 'accumulation',
  maxMistakes: 6,
  hidden: true,
  Visual: StormCloudVisual
}
