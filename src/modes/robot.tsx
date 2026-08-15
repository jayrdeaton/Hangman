import React from 'react'
import Svg, { Circle, G } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'
import { SCENE_START_DELAY_MS } from './shared/sceneReveal'
import { FadeScaleIn, SketchLine, SketchRect } from './shared/sketchShapes'

// Robot centered at x=50, viewBox 0 0 100 100.
// Body: rect 37-63 x, 54-76 y
// Head: rect 35-65 x, 30-50 y
// Eyes fill the head, making it look alive. Removed last → dead robot.

const JOIN = 'round' as const

// RobotCore (torso, neck, head) is a permanent scaffold, same role the gallows plays in
// classic.tsx — always present, never reacts to a wrong guess. It draws first, staggered
// bottom-to-top (torso, neck, head), and the removable parts below only start once it's roughly
// finished, so limbs/antenna/eyes read as attaching to an already-drawn body rather than every
// piece of the robot materializing at once.
const CORE_DRAW_MS = 500
const CORE_STAGGER_MS = 100
const CORE_END_MS = SCENE_START_DELAY_MS + CORE_STAGGER_MS * 2 + CORE_DRAW_MS

const RobotCore = ({ color, started = true }: { color: string; started?: boolean }) => (
  <G>
    {/* Torso */}
    <SketchRect x={37} y={54} width={26} height={22} rx={3} color={color} strokeLinejoin={JOIN} start={started} delayMs={SCENE_START_DELAY_MS} durationMs={CORE_DRAW_MS} />
    {/* Neck */}
    <SketchLine x1={47} y1={50} x2={53} y2={50} color={color} start={started} delayMs={SCENE_START_DELAY_MS + CORE_STAGGER_MS} durationMs={CORE_DRAW_MS} />
    <SketchLine x1={50} y1={50} x2={50} y2={54} color={color} strokeWidth={2} start={started} delayMs={SCENE_START_DELAY_MS + CORE_STAGGER_MS} durationMs={CORE_DRAW_MS} />
    {/* Head */}
    <SketchRect x={35} y={30} width={30} height={20} rx={5} color={color} strokeLinejoin={JOIN} start={started} delayMs={SCENE_START_DELAY_MS + CORE_STAGGER_MS * 2} durationMs={CORE_DRAW_MS} />
  </G>
)

// How much each surviving removable part's reveal staggers behind the next one drawn, once the
// core scaffold above has finished — see REMOVAL_ORDER's own comment for the resulting order.
const STAGGER_MS = 90

const Antenna = ({ color, started, delayMs }: { color: string; started?: boolean; delayMs?: number }) => (
  <G>
    <SketchLine x1={50} y1={20} x2={50} y2={30} color={color} strokeWidth={2} start={started} delayMs={delayMs} />
    <FadeScaleIn cx={50} cy={17} start={started} delayMs={delayMs}>
      <Circle cx='50' cy='17' r='2.8' fill={color} />
    </FadeScaleIn>
  </G>
)

const LeftArm = ({ color, started, delayMs }: { color: string; started?: boolean; delayMs?: number }) => <SketchLine x1={37} y1={61} x2={25} y2={71} color={color} start={started} delayMs={delayMs} />

const RightArm = ({ color, started, delayMs }: { color: string; started?: boolean; delayMs?: number }) => <SketchLine x1={63} y1={61} x2={75} y2={71} color={color} start={started} delayMs={delayMs} />

const LeftLeg = ({ color, started, delayMs }: { color: string; started?: boolean; delayMs?: number }) => <SketchLine x1={44} y1={76} x2={39} y2={91} color={color} start={started} delayMs={delayMs} />

const RightLeg = ({ color, started, delayMs }: { color: string; started?: boolean; delayMs?: number }) => <SketchLine x1={56} y1={76} x2={61} y2={91} color={color} start={started} delayMs={delayMs} />

const Eyes = ({ color, started, delayMs }: { color: string; started?: boolean; delayMs?: number }) => (
  <FadeScaleIn cx={50} cy={40} start={started} delayMs={delayMs}>
    <Circle cx='43' cy='40' r='3.5' fill={color} />
    <Circle cx='57' cy='40' r='3.5' fill={color} />
  </FadeScaleIn>
)

const XEyes = ({ color }: { color: string }) => (
  <G>
    <SketchLine x1={40} y1={37} x2={46} y2={43} color={color} strokeWidth={2.5} />
    <SketchLine x1={46} y1={37} x2={40} y2={43} color={color} strokeWidth={2.5} />
    <SketchLine x1={54} y1={37} x2={60} y2={43} color={color} strokeWidth={2.5} />
    <SketchLine x1={60} y1={37} x2={54} y2={43} color={color} strokeWidth={2.5} />
  </G>
)

// Parts in removal order (first in array = first to disappear). Reveal (see RobotVisual below)
// runs in reverse — eyes light up first, then legs, then arms, antenna last — so a fresh round
// reads as the robot booting up, the mirror image of it shutting down as mistakes land.
const REMOVAL_ORDER = [Antenna, LeftArm, RightArm, LeftLeg, RightLeg, Eyes]

const RobotVisual = ({ mistakes, color, colors, started }: { mistakes: number; color: string; colors?: string[]; started?: boolean }) => {
  const removed = clampStage(mistakes, REMOVAL_ORDER.length)
  const isDead = removed >= REMOVAL_ORDER.length
  // The removable parts (antenna/limbs) are the focus — primary — since they're what actually
  // tracks mistakes. The torso/head/neck never change, same permanent-scaffold role the gallows
  // plays in classic.tsx — secondary. Eyes/XEyes get their own tertiary accent, same role
  // hourglass's glass outline plays. Falls back to the plain `color` when no triad is given (e.g.
  // ModeSelector's card preview, which only passes `color`).
  const coreColor = colors?.[1] ?? color
  const eyeColor = colors?.[2] ?? color

  return (
    <Svg viewBox='0 0 100 100'>
      <RobotCore color={coreColor} started={started} />
      {/* Keyed by each part's own fixed position in REMOVAL_ORDER, not by its position in a
          post-slice array — see disappearing.tsx's identical comment for why a positional key
          would cause every surviving part to spuriously remount (and replay its reveal) on every
          wrong guess. */}
      {REMOVAL_ORDER.map((Part, index) => (index < removed ? null : <Part key={index} color={Part === Eyes ? eyeColor : color} started={started} delayMs={CORE_END_MS + (REMOVAL_ORDER.length - 1 - index) * STAGGER_MS} />))}
      {isDead && <XEyes color={eyeColor} />}
    </Svg>
  )
}

export const robotMode: GameMode = {
  id: 'robot',
  label: 'Robot',
  description: 'A little robot loses parts one by one until it shuts down',
  category: 'parts',
  behavior: 'subtractive',
  maxMistakes: 6,
  Visual: RobotVisual
}
