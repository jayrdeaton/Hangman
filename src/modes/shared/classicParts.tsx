import React from 'react'
import { G } from 'react-native-svg'

import { SCENE_START_DELAY_MS } from './sceneReveal'
import { SketchCircle, SketchLine } from './sketchShapes'

const JOIN = 'round' as const

// All coordinates in a 100x100 viewBox.
// The figure hangs at x=62, gallows pole at x=22.
// Safe art area: x=5–95, y=5–93.

// The gallows itself draws slower than a body part (its lines are 2-6x longer) and in a staggered
// construction order — base, pole, beam, rope — rather than all at once, so it reads as a scene
// being sketched into place rather than a single quick flash.
const GALLOWS_DRAW_MS = 500
const GALLOWS_STAGGER_MS = 90

// Hidden until `started` (Game.tsx's own gameReady, threaded down via GameVisual — see
// gameModes.ts's own `started` comment) flips true, then sketches itself on in construction order:
// the base, the pole, the beam, and finally the rope drop. Defaults `started` to true so anything
// that mounts this without wiring the signal still gets a (simple, on-mount) draw-in rather than
// silently never appearing.
export const GallowsWithRope = ({ color, started = true }: { color: string; started?: boolean }) => (
  <G>
    <SketchLine x1={5} y1={93} x2={95} y2={93} color={color} start={started} delayMs={SCENE_START_DELAY_MS} durationMs={GALLOWS_DRAW_MS} />
    <SketchLine x1={22} y1={93} x2={22} y2={10} color={color} start={started} delayMs={SCENE_START_DELAY_MS + GALLOWS_STAGGER_MS} durationMs={GALLOWS_DRAW_MS} strokeLinejoin={JOIN} />
    <SketchLine x1={22} y1={10} x2={62} y2={10} color={color} start={started} delayMs={SCENE_START_DELAY_MS + GALLOWS_STAGGER_MS * 2} durationMs={GALLOWS_DRAW_MS} strokeLinejoin={JOIN} />
    <SketchLine x1={62} y1={10} x2={62} y2={25} color={color} start={started} delayMs={SCENE_START_DELAY_MS + GALLOWS_STAGGER_MS * 3} durationMs={GALLOWS_DRAW_MS} />
  </G>
)

// Head hangs from rope end (y=25). cx=62, cy=36, r=11 → top touches y=25.
export const Head = ({ color }: { color: string }) => <SketchCircle cx={62} cy={36} r={11} color={color} />

export const Body = ({ color }: { color: string }) => <SketchLine x1={62} y1={47} x2={62} y2={68} color={color} />

export const LeftArm = ({ color }: { color: string }) => <SketchLine x1={62} y1={53} x2={47} y2={63} color={color} />

export const RightArm = ({ color }: { color: string }) => <SketchLine x1={62} y1={53} x2={77} y2={63} color={color} />

export const LeftLeg = ({ color }: { color: string }) => <SketchLine x1={62} y1={68} x2={50} y2={83} color={color} />

export const RightLeg = ({ color }: { color: string }) => <SketchLine x1={62} y1={68} x2={74} y2={83} color={color} />

// Gallows-less variants, shifted -12 in x so the figure sits centered in the
// viewBox instead of offset to clear the (now-absent) gallows pole.
//
// Each takes the same `started`/`delayMs` pair for the same two reasons SketchLine's own parts do:
// appearing.tsx mounts these one at a time as a wrong guess reveals each (started stays at its
// default `true`, so mounting is already the "just revealed" signal, delayMs stays 0 — nothing to
// stagger against). disappearing.tsx mounts all six together at round start instead (see its own
// REMOVAL_ORDER comment), so it passes `started` down from its own Visual prop, gated exactly like
// GallowsWithRope, and a per-part delayMs so the group draws in a staggered construction order
// rather than all six snapping on as one flash. `erased` is disappearing.tsx's own — it flips true
// on whichever single part a wrong guess just removed, scrubbing that one part's own stroke back
// out (see sketchShapes.tsx's own useDrawProgress) instead of unmounting it.
type CenteredPartProps = { color: string; started?: boolean; erased?: boolean; delayMs?: number }

export const CenteredBody = ({ color, started, erased, delayMs }: CenteredPartProps) => <SketchLine x1={50} y1={47} x2={50} y2={68} color={color} start={started} erased={erased} delayMs={delayMs} />

export const CenteredLeftArm = ({ color, started, erased, delayMs }: CenteredPartProps) => <SketchLine x1={50} y1={53} x2={35} y2={63} color={color} start={started} erased={erased} delayMs={delayMs} />

export const CenteredRightArm = ({ color, started, erased, delayMs }: CenteredPartProps) => <SketchLine x1={50} y1={53} x2={65} y2={63} color={color} start={started} erased={erased} delayMs={delayMs} />

export const CenteredLeftLeg = ({ color, started, erased, delayMs }: CenteredPartProps) => <SketchLine x1={50} y1={68} x2={38} y2={83} color={color} start={started} erased={erased} delayMs={delayMs} />

export const CenteredRightLeg = ({ color, started, erased, delayMs }: CenteredPartProps) => <SketchLine x1={50} y1={68} x2={62} y2={83} color={color} start={started} erased={erased} delayMs={delayMs} />

// Head only, no rope stub — unlike classic.tsx's own gallows-and-rope Head, these gallows-less
// modes have no pole for a rope to hang from, so a floating rope segment above the head had
// nothing to attach to and just read as a stray mark.
export const CenteredHead = ({ color, started, erased, delayMs }: CenteredPartProps) => <SketchCircle cx={50} cy={36} r={11} color={color} start={started} erased={erased} delayMs={delayMs} />
