import React from 'react'
import Svg, { G, Line, Path, Rect } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { SCENE_START_DELAY_MS } from './shared/sceneReveal'
import { FadeScaleIn, polylineLength, SketchLine, SketchPath } from './shared/sketchShapes'

// A "frame" mode: one continuous scene whose numeric params (sand levels) shift with every wrong
// guess, rather than discrete parts appearing or disappearing — see candle.tsx's identical comment
// for why only the very first frame, at round start, gets an actual reveal. The stand's posts and
// the glass sketch themselves on (they're stroked outlines with real length to trace); the cap
// plates and the sand itself are solid fills with nothing to trace, so they fade in instead.
const SCENE_DRAW_MS = 500
const STAGGER_MS = 110

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
const GLASS_POINTS: [number, number][] = [
  [NECK_X - BULB_HALF_WIDTH, GLASS_TOP_Y],
  [NECK_X + BULB_HALF_WIDTH, GLASS_TOP_Y],
  [NECK_X, NECK_Y],
  [NECK_X + BULB_HALF_WIDTH, GLASS_BOTTOM_Y],
  [NECK_X - BULB_HALF_WIDTH, GLASS_BOTTOM_Y],
  [NECK_X, NECK_Y],
  [NECK_X - BULB_HALF_WIDTH, GLASS_TOP_Y] // closing segment back to the start ('Z')
]
const GLASS_PATH = GLASS_POINTS.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z'
const GLASS_LENGTH = polylineLength(GLASS_POINTS)

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
// with a touch of hand-drawn asymmetry (in the base shoulders only) so the pile doesn't read as
// too tidy. The peak stays pinned to NECK_X, not offset — it's directly under the falling stream,
// so any offset there reads as the pile missing the stream rather than as a hand-drawn touch.
function bottomMoundPath(level: number): string | null {
  if (level <= 0) return null
  const peakY = moundPeakY(level)
  const peakX = NECK_X
  const baseHalfW = 3 + 15 * level
  const bulge = (GLASS_BOTTOM_Y - peakY) * 0.3
  return [`M${NECK_X - baseHalfW * 1.05},${GLASS_BOTTOM_Y}`, `Q${peakX - baseHalfW * 0.3},${peakY + bulge} ${peakX},${peakY}`, `Q${peakX + baseHalfW * 0.25},${peakY + bulge} ${NECK_X + baseHalfW * 0.95},${GLASS_BOTTOM_Y}`, 'Z'].join(' ')
}

const HourglassVisual = ({ mistakes, color, colors, started }: { mistakes: number; color: string; colors?: string[]; started?: boolean }) => {
  const index = clampStage(mistakes, STAGES.length - 1)
  const s = STAGES[index]
  const finalStage = index === STAGES.length - 1
  const tilt = finalStage ? TILT_DEG : 0
  // Sand is the focus (primary) — same role the keyboard now plays, so both read as "the active
  // thing" together. Stand is secondary, glass is tertiary (thin outline, barely shows). Falls back
  // to the plain `color` when no triad is given (e.g. ModeSelector's card preview, which only passes
  // `color`).
  const frameColor = colors?.[1] ?? color
  const glassColor = colors?.[2] ?? color

  const topPath = topSandPath(s.topSandLevel)
  const moundPath = bottomMoundPath(s.bottomSandLevel)
  const streamY2 = s.bottomSandLevel > 0 ? moundPeakY(s.bottomSandLevel) : GLASS_BOTTOM_Y

  const standDelay = SCENE_START_DELAY_MS
  const glassDelay = SCENE_START_DELAY_MS + STAGGER_MS
  const sandDelay = SCENE_START_DELAY_MS + STAGGER_MS * 2

  return (
    <Svg viewBox='0 0 100 100'>
      {/* transform (not rotation+origin) — react-native-svg's web renderer sets origin as a raw
          `transform-origin` DOM attribute, which isn't a valid one (React warns about it); folding
          the pivot into the transform string itself avoids that path entirely, same result. */}
      <G transform={`rotate(${tilt}, ${NECK_X}, ${NECK_Y})`}>
        {/* Stand frame: top/bottom cap plates + corner posts. Caps are filled (not stroked) — a
            stroked rect whose height equals its stroke width draws as two abutting edge-strokes,
            which leaves a hairline seam right where they meet — so they fade in as a block
            alongside the posts rather than sketch-draw like the rest of the stand. */}
        <FadeScaleIn cx={NECK_X} cy={CAP_TOP_Y} start={started} delayMs={standDelay} durationMs={SCENE_DRAW_MS}>
          <Rect x={CAP_LEFT_X} y={CAP_TOP_Y} width={CAP_RIGHT_X - CAP_LEFT_X} height={CAP_H} rx='1.5' fill={frameColor} />
        </FadeScaleIn>
        <FadeScaleIn cx={NECK_X} cy={CAP_BOTTOM_Y} start={started} delayMs={standDelay} durationMs={SCENE_DRAW_MS}>
          <Rect x={CAP_LEFT_X} y={CAP_BOTTOM_Y} width={CAP_RIGHT_X - CAP_LEFT_X} height={CAP_H} rx='1.5' fill={frameColor} />
        </FadeScaleIn>

        {/* Posts sketch on properly — they're a stroked outline with real length to trace. */}
        <SketchLine x1={POST_LEFT_X} y1={POST_TOP_Y} x2={POST_LEFT_X} y2={POST_BOTTOM_Y} color={frameColor} strokeWidth={3} start={started} delayMs={standDelay} durationMs={SCENE_DRAW_MS} />
        <SketchLine x1={POST_RIGHT_X} y1={POST_TOP_Y} x2={POST_RIGHT_X} y2={POST_BOTTOM_Y} color={frameColor} strokeWidth={3} start={started} delayMs={standDelay} durationMs={SCENE_DRAW_MS} />

        {/* Bottom sand: rising mound, drawn before the glass outline so the outline stays crisp on
            top. Filled, no outline worth tracing — fades in with the rest of the sand instead. */}
        {moundPath && (
          <FadeScaleIn cx={NECK_X} cy={GLASS_BOTTOM_Y} start={started} delayMs={sandDelay} durationMs={SCENE_DRAW_MS}>
            <Path d={moundPath} fill={color} />
          </FadeScaleIn>
        )}

        {/* Glass: two triangles meeting at the neck. A real outline made entirely of straight
            segments, so it sketches on cleanly. */}
        <SketchPath d={GLASS_PATH} length={GLASS_LENGTH} color={glassColor} strokeWidth={1} strokeLinejoin='round' start={started} delayMs={glassDelay} durationMs={SCENE_DRAW_MS} />

        {/* Top sand: always adjacent to the neck, draining downward. Filled, fades in with the mound. */}
        {topPath && (
          <FadeScaleIn cx={NECK_X} cy={GLASS_TOP_Y} start={started} delayMs={sandDelay} durationMs={SCENE_DRAW_MS}>
            <Path d={topPath} fill={color} />
          </FadeScaleIn>
        )}

        {/* Falling stream through the neck, drawn as fine dots rather than a solid line so it
            reads as individual grains of sand — its own strokeDasharray is already doing that
            dotted-line job, so it just fades in rather than sketch-drawing on top of it. */}
        {s.streamVisible && (
          <FadeScaleIn cx={NECK_X} cy={NECK_Y} start={started} delayMs={sandDelay} durationMs={SCENE_DRAW_MS}>
            <Line x1={NECK_X} y1={NECK_Y} x2={NECK_X} y2={streamY2} stroke={color} strokeWidth='1.4' strokeLinecap='round' strokeDasharray='0.1 2.4' />
          </FadeScaleIn>
        )}
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
