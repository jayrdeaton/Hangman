import React from 'react'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

// Quantitative/accumulation: a windowpane takes a hit and cracks radiate a little further
// out from the same fixed impact point with every wrong guess. Unlike Jenga/Balloons
// (depletion — things disappear/shrink), Cracking Window is additive like Storm Cloud:
// the shatter pattern only ever grows. The frame and mullions are the constant "healthy"
// fixture (never change), the impact point is a fixed origin all cracks share, and the
// STAGES array simply reveals more radiating crack branches as mistakes pile up, ending
// in a couple of loose glass chips as this mode's whimsical "game over" flourish.

type Stage = {
  branchCount: number
}

const STAGES: Stage[] = [{ branchCount: 0 }, { branchCount: 2 }, { branchCount: 3 }, { branchCount: 4 }, { branchCount: 5 }, { branchCount: 6 }, { branchCount: 7 }]

// Fixed impact point the whole spiderweb radiates from. Nudged slightly off dead-center
// (true center would be 50,50) for a hand-drawn, less mechanically-perfect feel.
const IMPACT_X = 50
const IMPACT_Y = 46

// One entry per possible crack branch, spread around a full circle with a bit of
// hand-drawn irregularity rather than perfectly even spacing. `forked` marks the couple
// of longer, later branches that grow a small sub-crack partway along.
type CrackBranch = { angle: number; length: number; forked?: boolean }

const CRACK_BRANCHES: CrackBranch[] = [
  { angle: 12, length: 30 },
  { angle: 54, length: 26 },
  { angle: 118, length: 32 },
  { angle: 163, length: 27 },
  { angle: 214, length: 35, forked: true },
  { angle: 268, length: 29 },
  { angle: 322, length: 36, forked: true }
]

// Deterministic 0..1 pseudo-random value from a seed, so jitter stays stable across
// re-renders without needing component state (same spirit as Jenga's hand-jittered
// xOffsets, just generated procedurally instead of hand-written per branch).
function hash(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

// Jagged zig-zag crack radiating from (cx, cy) at angleDeg for length, broken into 3-5
// segments with small lateral jitter so it reads as a hand-drawn shatter line rather than
// a mechanically straight ray (similar spirit to stormCloud.tsx's boltPath helper).
function crackPath(cx: number, cy: number, angleDeg: number, length: number, seed: number): string {
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const px = -dy
  const py = dx
  const segments = 3 + Math.floor(hash(seed) * 3)
  const points = [`M${cx.toFixed(1)},${cy.toFixed(1)}`]
  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const alongX = cx + dx * length * t
    const alongY = cy + dy * length * t
    const jitter = i === segments ? 0 : (hash(seed * 3.1 + i) - 0.5) * 5
    points.push(`L${(alongX + px * jitter).toFixed(1)},${(alongY + py * jitter).toFixed(1)}`)
  }
  return points.join(' ')
}

// Small forking sub-crack that splits off partway along a main branch, at a different
// angle and a shorter length, for an authentic shattered-glass look.
function forkPath(cx: number, cy: number, angleDeg: number, length: number, seed: number): string {
  const rad = (angleDeg * Math.PI) / 180
  const startT = 0.55 + hash(seed) * 0.1
  const startX = cx + Math.cos(rad) * length * startT
  const startY = cy + Math.sin(rad) * length * startT
  const forkAngle = angleDeg + (hash(seed * 2.7) > 0.5 ? 1 : -1) * (26 + hash(seed * 5.3) * 12)
  const forkLength = length * (0.35 + hash(seed * 9.1) * 0.15)
  return crackPath(startX, startY, forkAngle, forkLength, seed * 4.4)
}

const CrackingWindowVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const s = STAGES[Math.min(Math.max(0, mistakes), STAGES.length - 1)]
  const branches = CRACK_BRANCHES.slice(0, s.branchCount)
  const shattered = mistakes >= 6

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      {/* Window frame: outer sash plus a cross-mullion dividing it into 4 panes */}
      <Rect x='15' y='15' width='70' height='70' stroke={color} strokeWidth='3' fill='none' strokeLinejoin='round' />
      <Line x1='50' y1='15' x2='50' y2='85' stroke={color} strokeWidth='2.5' strokeLinecap='round' />
      <Line x1='15' y1='50' x2='85' y2='50' stroke={color} strokeWidth='2.5' strokeLinecap='round' />

      {/* Impact point: the fixed origin every crack radiates from, once there's been a hit */}
      {branches.length > 0 && <Circle cx={IMPACT_X} cy={IMPACT_Y} r='1.4' fill={color} />}

      {/* Cracks: jagged branches radiating outward, one revealed per stage of accumulation */}
      {branches.map((b, i) => (
        <React.Fragment key={`crack${i}`}>
          <Path d={crackPath(IMPACT_X, IMPACT_Y, b.angle, b.length, i + 1)} stroke={color} strokeWidth='2' fill='none' strokeLinecap='round' strokeLinejoin='round' />
          {b.forked && <Path d={forkPath(IMPACT_X, IMPACT_Y, b.angle, b.length, i + 1)} stroke={color} strokeWidth='2' fill='none' strokeLinecap='round' strokeLinejoin='round' />}
        </React.Fragment>
      ))}

      {/* Shattered game-over flourish: a couple of small glass chips starting to fall away */}
      {shattered && (
        <>
          <Path d='M43,53 L48,55 L44,60 Z' fill={color} />
          <Path d='M58,48 L64,51 L59,55 Z' fill={color} />
        </>
      )}
    </Svg>
  )
}

export const crackingWindowMode: GameMode = {
  id: 'crackingWindow',
  label: 'Cracking Window',
  description: 'A windowpane cracks a little further with every wrong guess',
  category: 'quantitative',
  behavior: 'accumulation',
  maxMistakes: 6,
  Visual: CrackingWindowVisual
}
