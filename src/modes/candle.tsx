import React from 'react'
import Svg, { Line, Path, Rect } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

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

function flamePath(wickTop: number, flameH: number): string {
  const f = flameH / 2
  const top = wickTop - flameH * 1.1
  return [`M50,${wickTop}`, `C${50 - f},${wickTop - f * 0.8}`, `${50 - f * 0.6},${top + flameH * 0.3}`, `50,${top}`, `C${50 + f * 0.6},${top + flameH * 0.3}`, `${50 + f},${wickTop - f * 0.8}`, `50,${wickTop}`].join(' ')
}

const CandleVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const s = STAGES[Math.min(Math.max(0, mistakes), STAGES.length - 1)]
  const wickTop = s.bodyTop - s.wickLen

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      {/* Base plate */}
      <Rect x='30' y='82' width='40' height='8' rx='3' stroke={color} strokeWidth='3' fill='none' strokeLinejoin='round' />
      {/* Body */}
      <Rect x='36' y={s.bodyTop} width='28' height={s.bodyH} rx='3' stroke={color} strokeWidth='3' fill='none' strokeLinejoin='round' />
      {/* Wick */}
      {s.wickLen > 0 && <Line x1='50' y1={s.bodyTop} x2='50' y2={wickTop} stroke={color} strokeWidth='2.5' strokeLinecap='round' />}
      {/* Flame */}
      {s.flameH > 0 && <Path d={flamePath(wickTop, s.flameH)} stroke={color} strokeWidth='2.5' fill='none' strokeLinecap='round' strokeLinejoin='round' />}
      {/* Wax drip on left side */}
      {s.drip && <Path d={`M42,${s.bodyTop} Q39,${s.bodyTop + 7} 41,${s.bodyTop + 13}`} stroke={color} strokeWidth='2.5' fill='none' strokeLinecap='round' />}
      {/* Smoke curl when fully burned */}
      {s.smoke && <Path d={`M50,${s.bodyTop - 2} C44,${s.bodyTop - 10} 56,${s.bodyTop - 18} 50,${s.bodyTop - 26}`} stroke={color} strokeWidth='2.5' fill='none' strokeLinecap='round' />}
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
