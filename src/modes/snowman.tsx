import React from 'react'
import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

import { clampStage } from './shared/clampStage'

// Snowman centered at x=50, viewBox 0 0 100 100.
// Core: three stacked circles (bottom r19 cy78, middle r14 cy50, head r9.5 cy25)
// with a permanent cute face baked into the head — this face is part of the
// core and always shows whenever the (non-melted) snowman is rendered.
// Accessories melt away one by one until only a puddle remains.

const SW = 3
const CAP = 'round' as const
const JOIN = 'round' as const

const Face = ({ color }: { color: string }) => (
  <G>
    <Circle cx='47' cy='24' r='1.2' fill={color} />
    <Circle cx='53' cy='24' r='1.2' fill={color} />
    <Path d='M46,28 Q50,31 54,28' stroke={color} strokeWidth='2' fill='none' strokeLinecap={CAP} strokeLinejoin={JOIN} />
  </G>
)

const SnowmanCore = ({ color }: { color: string }) => (
  <G>
    <Circle cx='50' cy='78' r='19' stroke={color} strokeWidth={SW} fill='none' />
    <Circle cx='50' cy='50' r='14' stroke={color} strokeWidth={SW} fill='none' />
    <Circle cx='50' cy='25' r='9.5' stroke={color} strokeWidth={SW} fill='none' />
    <Face color={color} />
  </G>
)

const Hat = ({ color }: { color: string }) => (
  <G>
    <Line x1='40' y1='16' x2='60' y2='16' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />
    <Path d='M43,16 L43,5 Q43,3 45,3 L55,3 Q57,3 57,5 L57,16' stroke={color} strokeWidth={SW} fill='none' strokeLinecap={CAP} strokeLinejoin={JOIN} />
  </G>
)

const LeftArm = ({ color }: { color: string }) => (
  <G>
    <Line x1='36' y1='50' x2='21' y2='40' stroke={color} strokeWidth='2.5' strokeLinecap={CAP} />
    <Line x1='27' y1='45' x2='23' y2='38' stroke={color} strokeWidth='2' strokeLinecap={CAP} />
    <Line x1='29' y1='46' x2='24' y2='49' stroke={color} strokeWidth='2' strokeLinecap={CAP} />
  </G>
)

const RightArm = ({ color }: { color: string }) => (
  <G>
    <Line x1='64' y1='50' x2='79' y2='40' stroke={color} strokeWidth='2.5' strokeLinecap={CAP} />
    <Line x1='73' y1='45' x2='77' y2='38' stroke={color} strokeWidth='2' strokeLinecap={CAP} />
    <Line x1='71' y1='46' x2='76' y2='49' stroke={color} strokeWidth='2' strokeLinecap={CAP} />
  </G>
)

const Nose = ({ color }: { color: string }) => <Path d='M50,26 L59,28.5 L50,30 Z' fill={color} />

const Buttons = ({ color }: { color: string }) => (
  <G>
    <Circle cx='50' cy='44' r='1.3' fill={color} />
    <Circle cx='50' cy='50' r='1.3' fill={color} />
    <Circle cx='50' cy='56' r='1.3' fill={color} />
  </G>
)

const Scarf = ({ color }: { color: string }) => (
  <G>
    <Path d='M39,35 Q50,40 61,35' stroke={color} strokeWidth={SW} fill='none' strokeLinecap={CAP} />
    <Path d='M56,37 Q60,42 57,47' stroke={color} strokeWidth='2' fill='none' strokeLinecap={CAP} />
  </G>
)

// Removal order: floppy/outer accessories fall off first, buttons/scarf (closer
// to the body) go later — mirroring robot.tsx's convention of ordering the most
// "core to identity" part (there: Eyes) last.
const REMOVAL_ORDER = [Hat, LeftArm, RightArm, Nose, Buttons, Scarf]

const Puddle = ({ color }: { color: string }) => (
  <G>
    <Ellipse cx='50' cy='88' rx='26' ry='6' stroke={color} strokeWidth={SW} fill='none' />
    <Path d='M40,80 Q42,84 38,86' stroke={color} strokeWidth='2' fill='none' strokeLinecap={CAP} />
    <Circle cx='66' cy='83' r='2.5' stroke={color} strokeWidth='2' fill='none' />
    <Circle cx='30' cy='84' r='2' stroke={color} strokeWidth='2' fill='none' />
  </G>
)

const SnowmanVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const removed = clampStage(mistakes, REMOVAL_ORDER.length)
  const visible = REMOVAL_ORDER.slice(removed)
  const isDead = removed >= REMOVAL_ORDER.length

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      {isDead ? (
        <Puddle color={color} />
      ) : (
        <G>
          <SnowmanCore color={color} />
          {visible.map((Part, i) => (
            <Part key={i} color={color} />
          ))}
        </G>
      )}
    </Svg>
  )
}

export const snowmanMode: GameMode = {
  id: 'snowman',
  label: 'Snowman',
  description: 'A cheerful snowman melts away, one part at a time',
  category: 'parts',
  behavior: 'subtractive',
  maxMistakes: 6,
  hidden: true,
  Visual: SnowmanVisual
}
