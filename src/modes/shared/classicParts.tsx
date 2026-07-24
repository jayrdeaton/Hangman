import React from 'react'
import { Circle, G, Line } from 'react-native-svg'

const SW = 3.5
const CAP = 'round' as const
const JOIN = 'round' as const

// All coordinates in a 100x100 viewBox.
// The figure hangs at x=62, gallows pole at x=22.
// Safe art area: x=5–95, y=5–93.

export const GallowsWithRope = ({ color }: { color: string }) => (
  <G>
    <Line x1='5' y1='93' x2='95' y2='93' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />
    <Line x1='22' y1='93' x2='22' y2='10' stroke={color} strokeWidth={SW} strokeLinecap={CAP} strokeLinejoin={JOIN} />
    <Line x1='22' y1='10' x2='62' y2='10' stroke={color} strokeWidth={SW} strokeLinecap={CAP} strokeLinejoin={JOIN} />
    <Line x1='62' y1='10' x2='62' y2='25' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />
  </G>
)

export const GallowsNoRope = ({ color }: { color: string }) => (
  <G>
    <Line x1='5' y1='93' x2='95' y2='93' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />
    <Line x1='22' y1='93' x2='22' y2='10' stroke={color} strokeWidth={SW} strokeLinecap={CAP} strokeLinejoin={JOIN} />
    <Line x1='22' y1='10' x2='62' y2='10' stroke={color} strokeWidth={SW} strokeLinecap={CAP} strokeLinejoin={JOIN} />
  </G>
)

// Head hangs from rope end (y=25). cx=62, cy=36, r=11 → top touches y=25.
export const Head = ({ color }: { color: string }) => <Circle cx='62' cy='36' r='11' stroke={color} strokeWidth={SW} fill='none' />

export const Body = ({ color }: { color: string }) => <Line x1='62' y1='47' x2='62' y2='68' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

export const LeftArm = ({ color }: { color: string }) => <Line x1='62' y1='53' x2='47' y2='63' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

export const RightArm = ({ color }: { color: string }) => <Line x1='62' y1='53' x2='77' y2='63' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

export const LeftLeg = ({ color }: { color: string }) => <Line x1='62' y1='68' x2='50' y2='83' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

export const RightLeg = ({ color }: { color: string }) => <Line x1='62' y1='68' x2='74' y2='83' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

// Combined rope + head for Appearing mode (revealed last together)
export const RopeAndHead = ({ color }: { color: string }) => (
  <G>
    <Line x1='62' y1='10' x2='62' y2='25' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />
    <Circle cx='62' cy='36' r='11' stroke={color} strokeWidth={SW} fill='none' />
  </G>
)

// Gallows-less variants, shifted -12 in x so the figure sits centered in the
// viewBox instead of offset to clear the (now-absent) gallows pole.
export const CenteredHead = ({ color }: { color: string }) => <Circle cx='50' cy='36' r='11' stroke={color} strokeWidth={SW} fill='none' />

export const CenteredBody = ({ color }: { color: string }) => <Line x1='50' y1='47' x2='50' y2='68' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

export const CenteredLeftArm = ({ color }: { color: string }) => <Line x1='50' y1='53' x2='35' y2='63' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

export const CenteredRightArm = ({ color }: { color: string }) => <Line x1='50' y1='53' x2='65' y2='63' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

export const CenteredLeftLeg = ({ color }: { color: string }) => <Line x1='50' y1='68' x2='38' y2='83' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

export const CenteredRightLeg = ({ color }: { color: string }) => <Line x1='50' y1='68' x2='62' y2='83' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />

export const CenteredRopeAndHead = ({ color }: { color: string }) => (
  <G>
    <Line x1='50' y1='10' x2='50' y2='25' stroke={color} strokeWidth={SW} strokeLinecap={CAP} />
    <Circle cx='50' cy='36' r='11' stroke={color} strokeWidth={SW} fill='none' />
  </G>
)
