import React from 'react'
import Svg, { Circle, G, Line, Path } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

// Parts/subtractive mode: 7 discrete stages (0=fresh flight, 6=torn loose).
// Kite tilt/tail/string all live in one STAGES entry per mistake count since a
// wrong guess should visibly shift all three together (more tilt, less tail,
// eventually a snapped string) rather than reveal/hide independent parts.
// All coordinates in a 100x100 viewBox.

type Stage = {
  tailSegmentsVisible: number
  kiteTilt: number
  stringFrayed: boolean
}

const STAGES: Stage[] = [
  { tailSegmentsVisible: 4, kiteTilt: 0, stringFrayed: false },
  { tailSegmentsVisible: 3, kiteTilt: 6, stringFrayed: false },
  { tailSegmentsVisible: 2, kiteTilt: 13, stringFrayed: false },
  { tailSegmentsVisible: 2, kiteTilt: 22, stringFrayed: false },
  { tailSegmentsVisible: 1, kiteTilt: 34, stringFrayed: false },
  { tailSegmentsVisible: 0, kiteTilt: 50, stringFrayed: true },
  { tailSegmentsVisible: 0, kiteTilt: 68, stringFrayed: true }
]

// Kite diamond, centered so the rotation transform reads as "tilting in place".
const KITE_CENTER: [number, number] = [50, 26]
const KITE_TOP: [number, number] = [50, 12]
const KITE_RIGHT: [number, number] = [60, 26]
const KITE_BOTTOM: [number, number] = [50, 42]
const KITE_LEFT: [number, number] = [40, 26]

// Tail is one quadratic curve off the bottom tip; it shortens (frays) as
// tailSegmentsVisible drops, rather than just losing its bow decorations. Stretched down to
// y=92 (rather than a shorter curve) so 4 bows have real breathing room between them —
// packed onto a short curve, even small bows crowd into an illegible tangle.
const TAIL_START: [number, number] = KITE_BOTTOM
const TAIL_CONTROL: [number, number] = [58, 65]
const TAIL_END: [number, number] = [50, 92]
const MAX_TAIL_SEGMENTS = 4

// Fixed ground anchor the string runs to while it's still intact.
const GROUND_ANCHOR: [number, number] = [50, 94]

function lerp(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function bezierPoint(t: number, p0: [number, number], p1: [number, number], p2: [number, number]): [number, number] {
  const mt = 1 - t
  return [mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0], mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]]
}

function bezierTangent(t: number, p0: [number, number], p1: [number, number], p2: [number, number]): [number, number] {
  const mt = 1 - t
  return [2 * mt * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), 2 * mt * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])]
}

// A small ribbon bow perpendicular to the tail's direction at that point, so it reads as a
// distinct decoration tied onto the tail instead of a zigzag overlapping the tail line itself.
// `scale` shrinks the wings as the tail curve itself shortens (frays) — without it, a fixed
// wing size overlaps the kite and the other bows once only a short stub of tail remains.
function bowPath(p: [number, number], tangent: [number, number], scale: number): string {
  const len = Math.hypot(tangent[0], tangent[1]) || 1
  const tx = tangent[0] / len
  const ty = tangent[1] / len
  const nx = -ty
  const ny = tx
  const wingLen = 3.2 * scale
  const wingWidth = 1.3 * scale
  const fmt = (v: [number, number]) => `${v[0].toFixed(1)},${v[1].toFixed(1)}`
  const leftTip: [number, number] = [p[0] + nx * wingLen, p[1] + ny * wingLen]
  const rightTip: [number, number] = [p[0] - nx * wingLen, p[1] - ny * wingLen]
  const leftBaseA: [number, number] = [leftTip[0] + tx * wingWidth, leftTip[1] + ty * wingWidth]
  const leftBaseB: [number, number] = [leftTip[0] - tx * wingWidth, leftTip[1] - ty * wingWidth]
  const rightBaseA: [number, number] = [rightTip[0] + tx * wingWidth, rightTip[1] + ty * wingWidth]
  const rightBaseB: [number, number] = [rightTip[0] - tx * wingWidth, rightTip[1] - ty * wingWidth]
  return `M${fmt(leftBaseA)} L${fmt(p)} L${fmt(leftBaseB)} M${fmt(rightBaseA)} L${fmt(p)} L${fmt(rightBaseB)}`
}

// Short jagged zig-zag that stops partway to the anchor, reading as a snapped string.
function frayedStringPath(from: [number, number], to: [number, number]): string {
  const frayFraction = 0.42
  const target = lerp(from, to, frayFraction)
  const segments = 4
  const points: [number, number][] = [from]
  for (let i = 1; i < segments; i++) {
    const base = lerp(from, target, i / segments)
    const offset = i % 2 === 0 ? 3.2 : -3.2
    points.push([base[0] + offset, base[1]])
  }
  points.push(target)
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
}

const KiteVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const idx = Math.min(Math.max(0, mistakes), STAGES.length - 1)
  const s = STAGES[idx]
  const isFinalStage = idx === STAGES.length - 1

  // Subdividing the tail's quadratic at tailT keeps the shrinking stub smoothly
  // attached to the kite instead of just clipping the full-length path.
  const tailT = s.tailSegmentsVisible / MAX_TAIL_SEGMENTS
  const tailControlPartial = lerp(TAIL_START, TAIL_CONTROL, tailT)
  const tailEndPartial = bezierPoint(tailT, TAIL_START, TAIL_CONTROL, TAIL_END)
  const tailPath = `M${TAIL_START[0]},${TAIL_START[1]} Q${tailControlPartial[0].toFixed(1)},${tailControlPartial[1].toFixed(1)} ${tailEndPartial[0].toFixed(1)},${tailEndPartial[1].toFixed(1)}`

  // Floored so bows never quite vanish, but still shrink well before the tail curve
  // gets short enough for full-size wings to collide with each other or the kite.
  const bowScale = Math.max(tailT, 0.4)
  const bows = Array.from({ length: s.tailSegmentsVisible }, (_, i) => {
    const t = (i + 1) / (s.tailSegmentsVisible + 1)
    return { point: bezierPoint(t, TAIL_START, tailControlPartial, tailEndPartial), tangent: bezierTangent(t, TAIL_START, tailControlPartial, tailEndPartial) }
  })

  // Where the string leaves the kite: the bottom tip, rotated by kiteTilt.
  const rad = (s.kiteTilt * Math.PI) / 180
  const dx = KITE_BOTTOM[0] - KITE_CENTER[0]
  const dy = KITE_BOTTOM[1] - KITE_CENTER[1]
  const stringStart: [number, number] = [KITE_CENTER[0] + dx * Math.cos(rad) - dy * Math.sin(rad), KITE_CENTER[1] + dx * Math.sin(rad) + dy * Math.cos(rad)]

  const midX = (stringStart[0] + GROUND_ANCHOR[0]) / 2
  const midY = (stringStart[1] + GROUND_ANCHOR[1]) / 2 + 3
  const stringPath = s.stringFrayed ? frayedStringPath(stringStart, GROUND_ANCHOR) : `M${stringStart[0].toFixed(1)},${stringStart[1].toFixed(1)} Q${midX.toFixed(1)},${midY.toFixed(1)} ${GROUND_ANCHOR[0]},${GROUND_ANCHOR[1]}`

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      {/* String: sags gently to a small ground knot while intact, snaps into a jagged stub once frayed */}
      <Path d={stringPath} stroke={color} strokeWidth='2' fill='none' strokeLinecap='round' strokeLinejoin='round' />
      {!s.stringFrayed && <Circle cx={GROUND_ANCHOR[0]} cy={GROUND_ANCHOR[1]} r='1.8' fill={color} stroke='none' />}

      <G transform={`rotate(${s.kiteTilt} ${KITE_CENTER[0]} ${KITE_CENTER[1]})`}>
        {/* Tail curve plus its evenly spaced bows, both shrinking together as it frays */}
        {s.tailSegmentsVisible > 0 && <Path d={tailPath} stroke={color} strokeWidth='2.5' fill='none' strokeLinecap='round' strokeLinejoin='round' />}
        {bows.map((b, i) => (
          <Path key={i} d={bowPath(b.point, b.tangent, bowScale)} stroke={color} strokeWidth='2' fill='none' strokeLinecap='round' strokeLinejoin='round' />
        ))}

        {/* Kite body: diamond outline + cross-brace */}
        <Path d={`M${KITE_TOP[0]},${KITE_TOP[1]} L${KITE_RIGHT[0]},${KITE_RIGHT[1]} L${KITE_BOTTOM[0]},${KITE_BOTTOM[1]} L${KITE_LEFT[0]},${KITE_LEFT[1]} Z`} stroke={color} strokeWidth='3' fill='none' strokeLinejoin='round' />
        <Line x1={KITE_TOP[0]} y1={KITE_TOP[1]} x2={KITE_BOTTOM[0]} y2={KITE_BOTTOM[1]} stroke={color} strokeWidth='2' strokeLinecap='round' />
        <Line x1={KITE_LEFT[0]} y1={KITE_LEFT[1]} x2={KITE_RIGHT[0]} y2={KITE_RIGHT[1]} stroke={color} strokeWidth='2' strokeLinecap='round' />
      </G>

      {/* Final-stage flourish: a couple of short motion dashes as the loose kite drifts off */}
      {isFinalStage && (
        <G>
          <Line x1='32' y1='16' x2='39' y2='20' stroke={color} strokeWidth='2' strokeLinecap='round' />
          <Line x1='27' y1='25' x2='34' y2='28' stroke={color} strokeWidth='2' strokeLinecap='round' />
        </G>
      )}
    </Svg>
  )
}

export const kiteMode: GameMode = {
  id: 'kite',
  label: 'Kite',
  description: 'A kite drifts further away and its tail frays with every wrong guess',
  category: 'parts',
  behavior: 'subtractive',
  maxMistakes: 6,
  Visual: KiteVisual
}
