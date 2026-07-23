import React from 'react'
import Svg, { Circle, G, Line, Rect } from 'react-native-svg'

import type { GameMode } from '@/types/gameModes'

// Robot centered at x=50, viewBox 0 0 100 100.
// Body: rect 37-63 x, 54-76 y
// Head: rect 35-65 x, 30-50 y
// Eyes fill the head, making it look alive. Removed last → dead robot.

const SW = 3.5
const CAP = 'round' as const
const JOIN = 'round' as const

const RobotCore = ({ color }: { color: string }) => (
  <G>
    {/* Torso */}
    <Rect x='37' y='54' width='26' height='22' rx='3' stroke={color} strokeWidth={SW} fill='none' strokeLinejoin={JOIN} />
    {/* Head */}
    <Rect x='35' y='30' width='30' height='20' rx='5' stroke={color} strokeWidth={SW} fill='none' strokeLinejoin={JOIN} />
    {/* Neck */}
    <Line x1='47' y1='50' x2='53' y2='50' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />
    <Line x1='50' y1='50' x2='50' y2='54' stroke={color} strokeWidth={2} strokeLinecap={CAP} />
  </G>
)

const Antenna = ({ color }: { color: string }) => (
  <G>
    <Line x1='50' y1='15' x2='50' y2='30' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />
    <Circle cx='50' cy='12' r='3.5' stroke={color} strokeWidth={2.5} fill='none' />
  </G>
)

const LeftArm = ({ color }: { color: string }) => <Line x1='37' y1='61' x2='25' y2='71' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

const RightArm = ({ color }: { color: string }) => <Line x1='63' y1='61' x2='75' y2='71' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

const LeftLeg = ({ color }: { color: string }) => <Line x1='44' y1='76' x2='39' y2='91' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

const RightLeg = ({ color }: { color: string }) => <Line x1='56' y1='76' x2='61' y2='91' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

const Eyes = ({ color }: { color: string }) => (
  <G>
    <Circle cx='43' cy='40' r='3.5' fill={color} />
    <Circle cx='57' cy='40' r='3.5' fill={color} />
  </G>
)

const XEyes = ({ color }: { color: string }) => (
  <G>
    <Line x1='40' y1='37' x2='46' y2='43' stroke={color} strokeWidth='2.5' strokeLinecap={CAP} />
    <Line x1='46' y1='37' x2='40' y2='43' stroke={color} strokeWidth='2.5' strokeLinecap={CAP} />
    <Line x1='54' y1='37' x2='60' y2='43' stroke={color} strokeWidth='2.5' strokeLinecap={CAP} />
    <Line x1='60' y1='37' x2='54' y2='43' stroke={color} strokeWidth='2.5' strokeLinecap={CAP} />
  </G>
)

// Parts in removal order (first in array = first to disappear)
const REMOVAL_ORDER = [Antenna, LeftArm, RightArm, LeftLeg, RightLeg, Eyes]

const RobotVisual = ({ mistakes, color, width, height }: { mistakes: number; color: string; width: number; height: number }) => {
  const removed = Math.min(Math.max(0, mistakes), REMOVAL_ORDER.length)
  const visible = REMOVAL_ORDER.slice(removed)
  const isDead = removed >= REMOVAL_ORDER.length

  return (
    <Svg width={width} height={height} viewBox='0 0 100 100'>
      <RobotCore color={color} />
      {visible.map((Part, i) => (
        <Part key={i} color={color} />
      ))}
      {isDead && <XEyes color={color} />}
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
