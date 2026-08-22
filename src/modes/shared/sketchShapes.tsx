import React, { useEffect, useId, useState } from 'react'
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Rect } from 'react-native-svg'

// Default duration for a single small shape (a line, a circle, a star point) drawing/fading itself
// on. Callers with a much longer path (see classicParts.tsx's own GALLOWS_DRAW_MS) or a group of
// shapes that should feel like one continuous gesture pass their own durationMs instead.
export const DRAW_MS = 380
export const DRAW_EASING = Easing.out(Easing.cubic)

const AnimatedLine = Animated.createAnimatedComponent(Line)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse)
const AnimatedRect = Animated.createAnimatedComponent(Rect)
const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedG = Animated.createAnimatedComponent(G)

// Shared timing/gating behind every Sketch* and FadeScaleIn component below: a shared value starts
// at `from` and animates to `to` once `start` is true, optionally delayed. `start` defaults to
// true, so a shape mounted without any of this wiring still draws/fades itself on the moment it
// mounts (see classicParts.tsx's own SketchLine doc comment for why "just mounted" already is "just
// revealed" for a part that only ever appears in reaction to a wrong guess). Passed `false`
// initially and flipped `true` later by a prop change (not a fresh mount) — see Game.tsx's own
// `gameReady`, threaded down as `started` — a shape that's already visible at mistakes=0 (a gallows,
// a full figure, a scattered field of stars) can hold its reveal until the screen itself has
// resolved instead of firing the instant it mounts, still hidden behind the curtain.
//
// `erased` is the reveal run backwards: once true, the value animates back to `from` — for a
// stroked Sketch* shape that retraces the exact same dash it drew in with (see hiddenOpacity below;
// a stroke offset climbing back toward its own length reads as the line being scrubbed away, not a
// flat pop or fade), for FadeScaleIn a plain fade/scale back out. Checked first in the one effect
// below (not a second, independent effect) — react-compiler's own immutability check flags writing
// the same shared value from two separate effects, and there's no real need for two here anyway:
// `start`/`erased` are never both relevant at once for a single shape (a shape either hasn't drawn
// in yet, or is being erased after it already has), so one branch always wins.
const useDrawProgress = (from: number, to: number, { start = true, erased = false, delayMs = 0, durationMs = DRAW_MS }: { start?: boolean; erased?: boolean; delayMs?: number; durationMs?: number }) => {
  const value = useSharedValue(from)
  useEffect(() => {
    if (erased) {
      value.value = withTiming(from, { duration: durationMs, easing: DRAW_EASING })
      return
    }
    if (!start) return
    value.value = withDelay(delayMs, withTiming(to, { duration: durationMs, easing: DRAW_EASING }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, erased])
  return value
}

type SketchTiming = { start?: boolean; erased?: boolean; delayMs?: number; durationMs?: number }

const lineLength = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1)
const circleLength = (r: number) => 2 * Math.PI * r
// Perimeter of a rounded rect: two full straight runs per axis (width/height, each shortened by the
// two corner radii it feeds into) plus the four corners' arcs, which together sweep one full circle.
const roundedRectLength = (width: number, height: number, rx: number) => 2 * (width - 2 * rx) + 2 * (height - 2 * rx) + 2 * Math.PI * rx

// No closed form for a bezier curve's arc length, and this is only ever used to time a decorative
// draw-on animation — a coarse polyline approximation (sample the curve, sum the straight-line hops
// between samples) is accurate enough for that, no need for real numerical integration.
const BEZIER_SAMPLES = 24

export const quadraticBezierLength = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): number => {
  let length = 0
  let prevX = x0
  let prevY = y0
  for (let i = 1; i <= BEZIER_SAMPLES; i++) {
    const t = i / BEZIER_SAMPLES
    const mt = 1 - t
    const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1
    const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1
    length += Math.hypot(x - prevX, y - prevY)
    prevX = x
    prevY = y
  }
  return length
}

export const cubicBezierLength = (x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number): number => {
  let length = 0
  let prevX = x0
  let prevY = y0
  for (let i = 1; i <= BEZIER_SAMPLES; i++) {
    const t = i / BEZIER_SAMPLES
    const mt = 1 - t
    const x = mt * mt * mt * x0 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * x1
    const y = mt * mt * mt * y0 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * y1
    length += Math.hypot(x - prevX, y - prevY)
    prevX = x
    prevY = y
  }
  return length
}

export const polylineLength = (points: [number, number][]): number => {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return length
}

// A held strokeDashoffset sitting right at (or near) a stroked shape's own length doesn't reliably
// render as fully invisible on react-native-svg — depending on the shape/platform this can leak
// through as a lingering round-cap dot, or a stuck sliver of a short path, for as long as the
// offset stays held there (only shapes that hold a hidden state for a while before `start` flips
// true actually show it — GallowsWithRope, a whole disappearing/robot scene, snowflakes, all gated
// on `started` — not ones that animate immediately on mount). Rather than chase the exact rendering
// quirk, every Sketch* component below also drives `opacity` off the same offset: forced to 0 for
// as long as the shape is still at-or-past its own full length (i.e. still genuinely hidden,
// whether held or merely delayed), 1 the instant real drawing begins. That's a categorical guarantee
// independent of whatever the dash math is doing underneath, not a numeric near-miss.
const hiddenOpacity = (offsetValue: number, length: number) => {
  'worklet'
  return offsetValue >= length ? 0 : 1
}

// Draws a Line on stroke-by-stroke (pen-sketch style), via the standard strokeDasharray/
// strokeDashoffset trick: a single dash exactly as long as the line itself, offset so none of it
// shows, then animated back to 0 to reveal it end to end. See useDrawProgress above for `start`/
// `delayMs`/`durationMs`.
export const SketchLine = ({ x1, y1, x2, y2, color, strokeWidth = 3.5, strokeLinecap = 'round', strokeLinejoin, ...timing }: { x1: number; y1: number; x2: number; y2: number; color: string; strokeWidth?: number; strokeLinecap?: 'round' | 'butt' | 'square'; strokeLinejoin?: 'round' } & SketchTiming) => {
  const length = lineLength(x1, y1, x2, y2)
  const offset = useDrawProgress(length, 0, timing)
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value, opacity: hiddenOpacity(offset.value, length) }))
  return <AnimatedLine x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeWidth} strokeLinecap={strokeLinecap} strokeLinejoin={strokeLinejoin} strokeDasharray={length} animatedProps={animatedProps} />
}

// Same trick as SketchLine, using the circle's circumference as the dash length. strokeLinecap
// defaults to 'round' (not SVG's own 'butt' default) for the same reason SketchLine/SketchPath
// below do — a circle has no true start/end, but the currently-revealed arc's leading edge, mid
// draw-in, very much does, and a flat cut there reads as a ruler-cut wire rather than a pen tip.
export const SketchCircle = ({ cx, cy, r, color, strokeWidth = 3.5, fill = 'none', strokeLinecap = 'round', ...timing }: { cx: number; cy: number; r: number; color: string; strokeWidth?: number; fill?: string; strokeLinecap?: 'round' | 'butt' | 'square' } & SketchTiming) => {
  const length = circleLength(r)
  const offset = useDrawProgress(length, 0, timing)
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value, opacity: hiddenOpacity(offset.value, length) }))
  return <AnimatedCircle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap={strokeLinecap} strokeDasharray={length} animatedProps={animatedProps} />
}

// Same trick again, using a rounded rect's perimeter as the dash length. Same strokeLinecap
// default as SketchCircle above, for the same reason.
export const SketchRect = ({ x, y, width, height, rx = 0, color, strokeWidth = 3.5, strokeLinecap = 'round', strokeLinejoin, ...timing }: { x: number; y: number; width: number; height: number; rx?: number; color: string; strokeWidth?: number; strokeLinecap?: 'round' | 'butt' | 'square'; strokeLinejoin?: 'round' } & SketchTiming) => {
  const length = roundedRectLength(width, height, rx)
  const offset = useDrawProgress(length, 0, timing)
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value, opacity: hiddenOpacity(offset.value, length) }))
  return <AnimatedRect x={x} y={y} width={width} height={height} rx={rx} stroke={color} strokeWidth={strokeWidth} fill='none' strokeLinecap={strokeLinecap} strokeLinejoin={strokeLinejoin} strokeDasharray={length} animatedProps={animatedProps} />
}

// Same dash trick again, for an arbitrary stroked Path — the caller supplies both `d` and its own
// `length` (see quadraticBezierLength/cubicBezierLength/polylineLength above), since unlike a line,
// circle, or rect there's no single formula that covers every path this app draws.
export const SketchPath = ({ d, length, color, strokeWidth = 2.5, fill = 'none', strokeLinecap = 'round', strokeLinejoin, ...timing }: { d: string; length: number; color: string; strokeWidth?: number; fill?: string; strokeLinecap?: 'round' | 'butt' | 'square'; strokeLinejoin?: 'round' } & SketchTiming) => {
  const offset = useDrawProgress(length, 0, timing)
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value, opacity: hiddenOpacity(offset.value, length) }))
  return <AnimatedPath d={d} stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap={strokeLinecap} strokeLinejoin={strokeLinejoin} strokeDasharray={length} animatedProps={animatedProps} />
}

// For filled shapes with no strokeable outline worth tracing (a solid dot, a filled star, a
// balloon) — same gating as the Sketch* shapes above, but fading/scaling the whole thing in around
// its own center instead of drawing a stroke, since there's no dash to reveal. `cx`/`cy` is the
// pivot the scale grows from (typically the shape's own center) — a plain CSS-style `transform`
// scale would instead grow from the SVG canvas's origin (0,0), which reads as the shape sliding in
// from the corner rather than blooming in place.
export const FadeScaleIn = ({ cx, cy, children, ...timing }: { cx: number; cy: number; children: React.ReactNode } & SketchTiming) => {
  const progress = useDrawProgress(0, 1, timing)
  const animatedProps = useAnimatedProps(() => ({
    opacity: progress.value,
    transform: `translate(${cx} ${cy}) scale(${progress.value}) translate(${-cx} ${-cy})`
  }))
  return <AnimatedG animatedProps={animatedProps}>{children}</AnimatedG>
}

// Same trick as SketchCircle, sized off Ramanujan's ellipse-circumference approximation — exact to
// well beyond what a decorative draw-on duration needs.
const ellipseCircumference = (rx: number, ry: number) => {
  const h = Math.pow((rx - ry) / (rx + ry), 2)
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
}

export const SketchEllipse = ({ cx, cy, rx, ry, color, strokeWidth = 3.5, fill = 'none', strokeLinecap = 'round', ...timing }: { cx: number; cy: number; rx: number; ry: number; color: string; strokeWidth?: number; fill?: string; strokeLinecap?: 'round' | 'butt' | 'square' } & SketchTiming) => {
  const length = ellipseCircumference(rx, ry)
  const offset = useDrawProgress(length, 0, timing)
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value, opacity: hiddenOpacity(offset.value, length) }))
  return <AnimatedEllipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={color} strokeWidth={strokeWidth} fill={fill} strokeLinecap={strokeLinecap} strokeDasharray={length} animatedProps={animatedProps} />
}

// Dense back-and-forth hatch across a bounding square — drawn once, in full, no animation of its
// own (see SketchFill below, which reveals it by masking rather than drawing it stroke-by-stroke).
// Close spacing relative to strokeWidth is what makes it read as a filled color instead of a wire
// grid; slight jitter keeps it from looking ruled/mechanical. Overshoots the square a little (a
// real pencil overshoots); SketchFill's own shape clip crops it back to a clean silhouette edge.
// Rolled once via useState's lazy initializer at the call site below, not reseeded — same
// one-time-per-mount randomness as Keyboard.tsx's own fallTrajectory, which is also why no two
// instances (two balloons, two keys) ever land on the same pattern without anyone having to hand
// out seeds for that.
const denseHatchPath = (x: number, y: number, size: number, spacing: number, jitter: number): string => {
  const rows = Math.max(2, Math.ceil(size / spacing))
  const points: [number, number][] = []
  for (let i = 0; i <= rows; i++) {
    const rowY = y + (i * size) / rows + (Math.random() - 0.5) * jitter * 0.4
    const overshootLeft = x - jitter * (0.4 + Math.random() * 0.4)
    const overshootRight = x + size + jitter * (0.4 + Math.random() * 0.4)
    const left: [number, number] = [overshootLeft, rowY]
    const right: [number, number] = [overshootRight, rowY]
    if (i % 2 === 0) points.push(left, right)
    else points.push(right, left)
  }
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')
}

// Reveals an area fill — a balloon's body, a star, a mound of hourglass sand — by wiping a mask
// across it instead of FadeScaleIn's flat opacity/scale pop, so it reads as being colored in rather
// than switched on. `clip` is the shape's own true silhouette (an Ellipse/Path/Rect — stroke/fill on
// it are irrelevant, only its outline is used) that the fill is cropped to; `bounds` is that same
// shape's bounding box, used to size the wipe mask.
//
// The mask itself is a square oversized to `bounds`' own diagonal — big enough that a rotated copy
// of it still has no gaps at the shape's corners at any angle — rotated once via a static
// `transform` (never animated) around the shape's own center, then revealed by animating only its
// `width` from 0 up to the square's full side. angle=0 sweeps left→right, 90 top→bottom; any other
// value is a diagonal sweep along that same code path, not a special case.
//
// Default angle (not 0) came out of prototyping this against the real modes: a dead-horizontal
// wipe read as a mechanical progress bar, where a shallow diagonal read as a hand doing the
// coloring. Every caller shares this default rather than each picking its own, the same way every
// caller shares DRAW_MS above, so the whole app's fills read as one consistent hand rather than a
// different tilt per mode. Exported so Keyboard.tsx's own plain-View wipe (a key's background isn't
// SVG, so it can't use SketchFill directly) still shares the same house angle.
export const DEFAULT_FILL_ANGLE_DEG = 28

export const SketchFill = ({
  bounds,
  clip,
  mode = 'hatch',
  color,
  angle = DEFAULT_FILL_ANGLE_DEG,
  spacing = 2.4,
  jitter = 3,
  strokeWidth = 2.2,
  ...timing
}: {
  bounds: { x: number; y: number; width: number; height: number }
  clip: React.ReactElement
  mode?: 'hatch' | 'solid'
  color: string
  angle?: number
  spacing?: number
  jitter?: number
  strokeWidth?: number
} & SketchTiming) => {
  // Stripped of everything but alphanumerics — useId()'s own colons are valid SVG id characters in
  // principle, but nothing else in this app has fed a colon-bearing id through a url(#...) clip-path
  // reference before, and there's no upside to being the first.
  const rawId = useId()
  const id = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const shapeClipId = `${id}shape`
  const wipeClipId = `${id}wipe`

  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const side = Math.hypot(bounds.width, bounds.height) * 1.08
  const localX = cx - side / 2
  const localY = cy - side / 2
  const rotation = `rotate(${angle} ${cx} ${cy})`

  const [hatchD] = useState<string | null>(() => (mode === 'hatch' ? denseHatchPath(localX, localY, side, spacing, jitter) : null))

  const width = useDrawProgress(0, side, timing)
  const maskAnimatedProps = useAnimatedProps(() => ({ width: width.value }))

  return (
    <>
      <Defs>
        <ClipPath id={shapeClipId}>{clip}</ClipPath>
        <ClipPath id={wipeClipId}>
          <AnimatedRect x={localX} y={localY} height={side} transform={rotation} animatedProps={maskAnimatedProps} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${shapeClipId})`}>
        <G clipPath={`url(#${wipeClipId})`}>{mode === 'solid' ? <Rect x={localX} y={localY} width={side} height={side} fill={color} transform={rotation} /> : <Path d={hatchD ?? ''} fill='none' stroke={color} strokeWidth={strokeWidth} strokeLinecap='round' transform={rotation} />}</G>
      </G>
    </>
  )
}
