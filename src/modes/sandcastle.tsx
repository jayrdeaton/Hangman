import React from 'react'
import Svg, { Line, Path, Rect } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'

// Frame mode: 7 discrete stages (0=full castle, 6=eroded mound). A single scene morphs
// continuously through STAGES rather than parts being added/removed — towers shrink,
// decorations drop off, and the tide creeps higher up the base with every wrong guess.
// All coordinates in a 100x100 viewBox.

type Stage = {
  towerHeight: number
  hasFlag: boolean
  hasCrenellations: boolean
  hasDoor: boolean
  waterLevel: number // 0 (dry) .. 1 (tide washing over most of what remains)
}

const STAGES: Stage[] = [
  { towerHeight: 32, hasFlag: true, hasCrenellations: true, hasDoor: true, waterLevel: 0.02 },
  { towerHeight: 27, hasFlag: true, hasCrenellations: true, hasDoor: true, waterLevel: 0.14 },
  { towerHeight: 22, hasFlag: true, hasCrenellations: true, hasDoor: true, waterLevel: 0.28 },
  { towerHeight: 17, hasFlag: true, hasCrenellations: false, hasDoor: true, waterLevel: 0.42 },
  { towerHeight: 12, hasFlag: false, hasCrenellations: false, hasDoor: true, waterLevel: 0.58 },
  { towerHeight: 7, hasFlag: false, hasCrenellations: false, hasDoor: false, waterLevel: 0.74 },
  { towerHeight: 3, hasFlag: false, hasCrenellations: false, hasDoor: false, waterLevel: 0.92 }
]

// Base mound sits with a flat top between the turrets so the tide line reads as rising
// "into" the castle rather than floating past it. Left turret is deliberately a touch
// shorter than the right (which carries the flag) for a hand-drawn, not-quite-symmetric feel.
const BASE_TOP = 78
const BASE_BOTTOM = 92
const LEFT_CX = 36
const RIGHT_CX = 64
const TURRET_W = 15
const WATER_Y_LOW = 95
const WATER_Y_HIGH = 64

const MOUND_PATH = `M10,${BASE_BOTTOM} Q8,80 24,${BASE_TOP} L76,${BASE_TOP} Q92,80 90,${BASE_BOTTOM} Z`
const DOOR_PATH = `M46,${BASE_BOTTOM - 4} L46,${BASE_TOP - 4} Q50,${BASE_TOP - 8} 54,${BASE_TOP - 4} L54,${BASE_BOTTOM - 4}`

const CRENEL_OFFSETS = [-5, 0, 5]
const CRENEL_W = 3
const CRENEL_H = 5

const TIDE_X_POINTS = [4, 16, 28, 40, 52, 64, 76, 88, 100]

function crenellations(cx: number, turretTop: number, keyPrefix: string) {
  return CRENEL_OFFSETS.map((off, i) => ({ key: `${keyPrefix}${i}`, x: cx + off - CRENEL_W / 2, y: turretTop - 3.5 }))
}

// Gentle sine-like zigzag: alternating Q control points above/below the baseline
// produce a wavy tide line without needing a real sine function.
function tidePath(y: number): string {
  const amp = 2.4
  let d = `M${TIDE_X_POINTS[0]},${y.toFixed(1)}`
  for (let i = 1; i < TIDE_X_POINTS.length; i++) {
    const midX = (TIDE_X_POINTS[i - 1] + TIDE_X_POINTS[i]) / 2
    const sign = i % 2 === 1 ? -1 : 1
    d += ` Q${midX},${(y + sign * amp).toFixed(1)} ${TIDE_X_POINTS[i]},${y.toFixed(1)}`
  }
  return d
}

const SandcastleVisual = ({ mistakes, color, colors }: { mistakes: number; color: string; colors?: string[] }) => {
  const idx = clampStage(mistakes, STAGES.length - 1)
  const s = STAGES[idx]
  const isFinalStage = idx === STAGES.length - 1

  const leftHeight = s.towerHeight * 0.78
  const rightHeight = s.towerHeight
  const leftTop = BASE_TOP - leftHeight
  const rightTop = BASE_TOP - rightHeight
  const poleTopY = rightTop - 9
  const waterY = WATER_Y_LOW - s.waterLevel * (WATER_Y_LOW - WATER_Y_HIGH)
  // Towers are the focus (primary, what erodes down to nothing). Base mound is the constant
  // scaffold the towers shrink into — same role hourglass's stand plays — secondary. Door,
  // crenellations, flag and tide are smaller decorative details — tertiary, same role hourglass's
  // glass outline plays. Falls back to the plain `color` when no triad is given (e.g.
  // ModeSelector's card preview, which only passes `color`).
  const moundColor = colors?.[1] ?? color
  const detailColor = colors?.[2] ?? color

  return (
    <Svg viewBox='0 0 100 100'>
      {/* Base mound: always present, the towers shrink into it as the castle erodes */}
      <Path d={MOUND_PATH} stroke={moundColor} strokeWidth='3' fill='none' strokeLinecap='round' strokeLinejoin='round' />

      {/* Doorway arch, carved into the mound between the turrets */}
      {s.hasDoor && <Path d={DOOR_PATH} stroke={detailColor} strokeWidth='2.5' fill='none' strokeLinecap='round' strokeLinejoin='round' />}

      {/* Turrets: rounded-top rectangles whose height tracks towerHeight */}
      <Rect x={LEFT_CX - TURRET_W / 2} y={leftTop} width={TURRET_W} height={leftHeight} rx='3' stroke={color} strokeWidth='3' fill='none' strokeLinejoin='round' />
      <Rect x={RIGHT_CX - TURRET_W / 2} y={rightTop} width={TURRET_W} height={rightHeight} rx='3' stroke={color} strokeWidth='3' fill='none' strokeLinejoin='round' />

      {/* Crenellation notches along the top edge of each turret */}
      {s.hasCrenellations && crenellations(LEFT_CX, leftTop, 'lc').map((c) => <Rect key={c.key} x={c.x} y={c.y} width={CRENEL_W} height={CRENEL_H} stroke={detailColor} strokeWidth='2' fill='none' strokeLinejoin='round' />)}
      {s.hasCrenellations && crenellations(RIGHT_CX, rightTop, 'rc').map((c) => <Rect key={c.key} x={c.x} y={c.y} width={CRENEL_W} height={CRENEL_H} stroke={detailColor} strokeWidth='2' fill='none' strokeLinejoin='round' />)}

      {/* Flag on a thin pole above the tallest (right) turret */}
      {s.hasFlag && (
        <>
          <Line x1={RIGHT_CX} y1={rightTop} x2={RIGHT_CX} y2={poleTopY} stroke={detailColor} strokeWidth='2' strokeLinecap='round' />
          <Path d={`M${RIGHT_CX},${poleTopY} L${RIGHT_CX + 7},${poleTopY + 2.5} L${RIGHT_CX},${poleTopY + 5} Z`} stroke={detailColor} strokeWidth='2' fill='none' strokeLinejoin='round' />
        </>
      )}

      {/* Tide: a wavy line that creeps higher up the base with every wrong guess */}
      <Path d={tidePath(waterY)} stroke={detailColor} strokeWidth='2.5' fill='none' strokeLinecap='round' strokeLinejoin='round' />

      {/* Final-stage flourish: a couple of foam-splash squiggles as the tide washes over the mound */}
      {isFinalStage && (
        <>
          <Path d={`M27,${(waterY - 5).toFixed(1)} Q31,${(waterY - 9).toFixed(1)} 35,${(waterY - 5).toFixed(1)}`} stroke={detailColor} strokeWidth='2' fill='none' strokeLinecap='round' />
          <Path d={`M61,${(waterY - 6).toFixed(1)} Q65,${(waterY - 10).toFixed(1)} 69,${(waterY - 6).toFixed(1)}`} stroke={detailColor} strokeWidth='2' fill='none' strokeLinecap='round' />
        </>
      )}
    </Svg>
  )
}

export const sandcastleMode: GameMode = {
  id: 'sandcastle',
  label: 'Sandcastle',
  description: 'A sandcastle erodes wave by wave until only a flat mound remains',
  category: 'frames',
  behavior: 'depletion',
  maxMistakes: 6,
  hidden: true,
  Visual: SandcastleVisual
}
