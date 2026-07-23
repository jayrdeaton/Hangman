import React from 'react'
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

// Parts/subtractive mode: 7 stages indexed by mistakes (0=full bloom, 6=wilted).
// Stem grows from a fixed ground point and bends further over as stemBend
// grows, while petals drop away — the two change continuously together so
// the flower reads as one wilting motion rather than separate effects.

type Stage = {
  stemBend: number // degrees the stem droops from upright (0=straight, higher=collapsed over)
  petalsVisible: number // petals still attached, out of PETAL_COUNT
}

const STAGES: Stage[] = [
  { stemBend: 0, petalsVisible: 6 },
  { stemBend: 10, petalsVisible: 5 },
  { stemBend: 22, petalsVisible: 4 },
  { stemBend: 36, petalsVisible: 3 },
  { stemBend: 52, petalsVisible: 1 },
  { stemBend: 70, petalsVisible: 0 },
  { stemBend: 85, petalsVisible: 0 }
]

const GROUND_X = 50
const GROUND_Y = 92
const STEM_LEN = 44
const PETAL_COUNT = 6
const PETAL_ANGLE = 360 / PETAL_COUNT

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

// Flower center swings around the ground point like a hinge: upright at
// stemBend=0, arced down and to the side as stemBend grows.
function flowerCenter(stemBend: number): { cx: number; cy: number } {
  const rad = toRad(stemBend)
  return {
    cx: GROUND_X + STEM_LEN * Math.sin(rad),
    cy: GROUND_Y - STEM_LEN * Math.cos(rad)
  }
}

// Quadratic curve: vertical tangent leaving the ground, horizontal tangent
// arriving at the flower center — reads as a straight stem at low bend and
// a shepherd's-crook droop at high bend.
function stemPath(cx: number, cy: number): string {
  return `M${GROUND_X},${GROUND_Y} Q${GROUND_X},${cy} ${cx},${cy}`
}

// Point at parameter t (0..1) along the same quadratic curve, used to anchor
// leaves so they stay attached to the stem at every bend amount.
function pointOnStem(t: number, cx: number, cy: number): { x: number; y: number } {
  return {
    x: GROUND_X * (1 - t * t) + cx * t * t,
    y: GROUND_Y * (1 - t) * (1 - t) + cy * (2 * t - t * t)
  }
}

const Petal = ({ cx, cy, angle, color }: { cx: number; cy: number; angle: number; color: string }) => (
  <G rotation={angle} origin={`${cx},${cy}`}>
    <Ellipse cx={cx} cy={cy - 8.5} rx='4.5' ry='7.5' stroke={color} strokeWidth='2' fill='none' />
  </G>
)

const Leaf = ({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) => (
  <G rotation={angle} origin={`${x},${y}`}>
    <Ellipse cx={x + 6} cy={y} rx='6' ry='2.5' stroke={color} strokeWidth='2' fill='none' />
  </G>
)

const FlowerVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const s = STAGES[Math.min(Math.max(0, mistakes), STAGES.length - 1)]
  const { cx, cy } = flowerCenter(s.stemBend)
  // Kept close to the ground end of the stem (well short of the flower head at t=1) so the
  // leaves stay clear of the petals even at the highest droop, instead of swinging into them.
  const leaf1 = pointOnStem(0.22, cx, cy)
  const leaf2 = pointOnStem(0.4, cx, cy)
  const droop = s.stemBend * 0.15

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      {/* Stem */}
      <Path d={stemPath(cx, cy)} stroke={color} strokeWidth='3' fill='none' strokeLinecap='round' />
      {/* Leaves, drooping a little further as the stem bends */}
      <Leaf x={leaf1.x} y={leaf1.y} angle={200 - droop} color={color} />
      <Leaf x={leaf2.x} y={leaf2.y} angle={-20 + droop} color={color} />
      {/* Petals, radial around the flower center */}
      {Array.from({ length: s.petalsVisible }, (_, i) => (
        <Petal key={i} cx={cx} cy={cy} angle={i * PETAL_ANGLE} color={color} />
      ))}
      {/* Flower center with a few seed dots for a bit of character */}
      <Circle cx={cx} cy={cy} r='4.5' stroke={color} strokeWidth='2.5' fill='none' />
      <Circle cx={cx - 1.3} cy={cy - 0.6} r='0.9' fill={color} />
      <Circle cx={cx + 1.6} cy={cy + 0.7} r='0.9' fill={color} />
      <Circle cx={cx + 0.2} cy={cy + 2} r='0.9' fill={color} />
    </Svg>
  )
}

export const flowerMode: GameMode = {
  id: 'flower',
  label: 'Wilting Flower',
  description: 'A flower loses its petals and wilts with every wrong guess',
  category: 'parts',
  behavior: 'subtractive',
  maxMistakes: 6,
  Visual: FlowerVisual
}
