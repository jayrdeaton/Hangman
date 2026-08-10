import React, { useState } from 'react'
import Svg, { G, Rect } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'

// Quantitative/depletion: a stack of 6 blocks, generated once at game start.
// Blocks are ordered bottom-to-top; wrong guesses pull a block from the top,
// and the shrinking remainder tilts a little further off-balance each time.

type BlockData = { key: string; y: number; width: number; xOffset: number }

const BLOCK_H = 10
const TOWER_ORIGIN = '50,85'

// Bottom-to-top. y is the rect's top edge; xOffset gives each block a tiny
// doodle-ish jitter off dead-center so the stack never reads as too tidy.
const BASE: Omit<BlockData, 'key'>[] = [
  { y: 75, width: 48, xOffset: 0 },
  { y: 63.5, width: 44, xOffset: 1.5 },
  { y: 52, width: 47, xOffset: -1.5 },
  { y: 40.5, width: 42, xOffset: 1 },
  { y: 29, width: 45, xOffset: -1 },
  { y: 17.5, width: 40, xOffset: 0.5 }
]

// Scattered pile once the tower has fully toppled: a handful of blocks lying near the base,
// each rotated around its own center. Kept to modest angles (well under 90deg) and spread
// across distinct x/y bands so the rotated rects don't cross through each other's interiors.
const TOPPLED: { key: string; x: number; y: number; width: number; rotation: number }[] = [
  { key: 't0', x: 8, y: 82, width: 24, rotation: 12 },
  { key: 't1', x: 62, y: 85, width: 24, rotation: -15 },
  { key: 't2', x: 34, y: 86, width: 22, rotation: 8 },
  { key: 't3', x: 40, y: 66, width: 20, rotation: -30 }
]

function makeBlocks(): BlockData[] {
  return BASE.map((b, i) => ({ ...b, key: `blk${i}` }))
}

const JengaVisual = ({ mistakes, color }: { mistakes: number; color: string }) => {
  const [blocks] = useState<BlockData[]>(makeBlocks)
  const removed = clampStage(mistakes, blocks.length)
  const visible = blocks.slice(0, blocks.length - removed)
  const toppled = removed >= blocks.length
  const tilt = removed * 3

  return (
    <Svg viewBox='0 0 100 100'>
      {/* transform (not rotation+origin) — react-native-svg's web renderer sets origin as a raw
          `transform-origin` DOM attribute, which isn't a valid one (React warns about it); folding
          the pivot into the transform string itself avoids that path entirely, same result. */}
      {!toppled && (
        <G transform={`rotate(${tilt}, ${TOWER_ORIGIN})`}>
          {visible.map((b) => (
            <Rect key={b.key} x={50 - b.width / 2 + b.xOffset} y={b.y} width={b.width} height={BLOCK_H} rx='1.5' stroke={color} strokeWidth='2.5' fill='none' strokeLinejoin='round' />
          ))}
        </G>
      )}
      {toppled &&
        TOPPLED.map((t) => (
          <G key={t.key} transform={`rotate(${t.rotation}, ${t.x + t.width / 2}, ${t.y + BLOCK_H / 2})`}>
            <Rect x={t.x} y={t.y} width={t.width} height={BLOCK_H} rx='1.5' stroke={color} strokeWidth='2.5' fill='none' strokeLinejoin='round' />
          </G>
        ))}
    </Svg>
  )
}

export const jengaMode: GameMode = {
  id: 'jenga',
  label: 'Jenga Tower',
  description: 'A wobbly block tower loses a piece with every wrong guess',
  category: 'quantitative',
  behavior: 'depletion',
  maxMistakes: 6,
  hidden: true,
  Visual: JengaVisual
}
