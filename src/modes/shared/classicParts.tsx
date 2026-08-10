import React, { useEffect } from 'react'
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { Circle, G, Line } from 'react-native-svg'

const SW = 3.5
const CAP = 'round' as const
const JOIN = 'round' as const

// All coordinates in a 100x100 viewBox.
// The figure hangs at x=62, gallows pole at x=22.
// Safe art area: x=5–95, y=5–93.

// How long a classic-mode body part takes to sketch itself on when it's first revealed.
const DRAW_MS = 380
const DRAW_EASING = Easing.out(Easing.cubic)

// The gallows itself draws slower than a body part (its lines are 2-6x longer) and in a staggered
// construction order — base, pole, beam, rope — rather than all at once, so it reads as a scene
// being sketched into place rather than a single quick flash.
const GALLOWS_DRAW_MS = 500
const GALLOWS_STAGGER_MS = 90
// `started` flips true the same instant Game.tsx's own screen-opacity curtain starts its 220ms
// fade-in (see gameModes.ts's own `started` comment) — without this, the gallows would start
// sketching itself in while the screen is still fading up. This holds it back until the screen has
// had a moment to actually resolve and be looked at, so the construction reads as its own distinct
// beat rather than racing the curtain.
const GALLOWS_START_DELAY_MS = 400

const AnimatedLine = Animated.createAnimatedComponent(Line)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1)

// Draws a Line on stroke-by-stroke (pen-sketch style), via the standard strokeDasharray/
// strokeDashoffset trick: a single dash exactly as long as the line itself, offset so none of it
// shows, then animated back to 0 to reveal it end to end.
//
// `start` decides when: left at its default `true`, the line draws itself the moment it mounts —
// every classic-mode body part mounts for the first time exactly when a wrong guess reveals it (see
// PARTS.slice in classic.tsx), so "just mounted" already is the "just revealed" signal, same
// self-animate-on-mount shape as fireworks.tsx's Particle. Passed `false` initially (the gallows —
// see GallowsWithRope below), the line mounts already fully hidden and only draws once `start` is
// later flipped to `true` by a prop change, not a fresh mount.
const SketchLine = ({ x1, y1, x2, y2, color, start = true, delayMs = 0, durationMs = DRAW_MS, strokeLinejoin }: { x1: number; y1: number; x2: number; y2: number; color: string; start?: boolean; delayMs?: number; durationMs?: number; strokeLinejoin?: 'round' }) => {
  const length = dist(x1, y1, x2, y2)
  const offset = useSharedValue(length)

  useEffect(() => {
    if (!start) return
    offset.value = withDelay(delayMs, withTiming(0, { duration: durationMs, easing: DRAW_EASING }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  return <AnimatedLine x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={SW} strokeLinecap={CAP} strokeLinejoin={strokeLinejoin} strokeDasharray={length} animatedProps={animatedProps} />
}

// Same trick as SketchLine, using the circle's circumference as the dash length.
const SketchCircle = ({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }) => {
  const length = 2 * Math.PI * r
  const offset = useSharedValue(length)

  useEffect(() => {
    offset.value = withTiming(0, { duration: DRAW_MS, easing: DRAW_EASING })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  return <AnimatedCircle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={SW} fill='none' strokeDasharray={length} animatedProps={animatedProps} />
}

// Hidden until `started` (Game.tsx's own gameReady, threaded down via GameVisual — see
// gameModes.ts's own `started` comment) flips true, then sketches itself on in construction order:
// the base, the pole, the beam, and finally the rope drop. Defaults `started` to true so anything
// that mounts this without wiring the signal still gets a (simple, on-mount) draw-in rather than
// silently never appearing.
export const GallowsWithRope = ({ color, started = true }: { color: string; started?: boolean }) => (
  <G>
    <SketchLine x1={5} y1={93} x2={95} y2={93} color={color} start={started} delayMs={GALLOWS_START_DELAY_MS} durationMs={GALLOWS_DRAW_MS} />
    <SketchLine x1={22} y1={93} x2={22} y2={10} color={color} start={started} delayMs={GALLOWS_START_DELAY_MS + GALLOWS_STAGGER_MS} durationMs={GALLOWS_DRAW_MS} strokeLinejoin={JOIN} />
    <SketchLine x1={22} y1={10} x2={62} y2={10} color={color} start={started} delayMs={GALLOWS_START_DELAY_MS + GALLOWS_STAGGER_MS * 2} durationMs={GALLOWS_DRAW_MS} strokeLinejoin={JOIN} />
    <SketchLine x1={62} y1={10} x2={62} y2={25} color={color} start={started} delayMs={GALLOWS_START_DELAY_MS + GALLOWS_STAGGER_MS * 3} durationMs={GALLOWS_DRAW_MS} />
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
