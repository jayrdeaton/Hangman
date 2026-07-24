import { JSX, useEffect, useMemo, useRef, useState } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedProps, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { Circle, Svg } from 'react-native-svg'

import type { CelebrationProps } from './registry'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const PARTICLES_PER_BURST = 14
const EXPAND_MS = 650
const FADE_MS = 550
// Exported (along with the interval bounds below) so tests can assert against the real values
// instead of hand-copied magic numbers.
export const BURST_LIFETIME_MS = EXPAND_MS + FADE_MS
// Random gap between bursts, re-rolled after every spawn — keeps the show continuous rather than
// landing in fixed, synchronized batches (which reads as a mechanical "shoot three, pause, shoot
// three" instead of an organic fireworks display).
export const MIN_BURST_INTERVAL_MS = 180
export const MAX_BURST_INTERVAL_MS = 420
// Particle fill colors come straight from the active theme (primary/secondary/tertiary), which can
// land close in luminance to the app's flat background for some theme colors (e.g. a light yellow
// in light mode) — a thin outline in the opposite luminance keeps every particle visible
// regardless of how its fill happens to contrast with the background behind it.
const LIGHT_MODE_OUTLINE = '#00000080'
const DARK_MODE_OUTLINE = '#FFFFFF80'

type BurstSpec = {
  id: number
  originX: number
  originY: number
  color: string
}

type ParticleSpec = {
  key: string
  angle: number
  distance: number
}

const Particle = ({ originX, originY, angle, distance, color, outline }: { originX: number; originY: number; angle: number; distance: number; color: string; outline: string }): JSX.Element => {
  const progress = useSharedValue(0)
  const opacity = useSharedValue(0)

  useEffect(() => {
    opacity.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: FADE_MS, easing: Easing.in(Easing.quad) }))
    progress.value = withTiming(1, { duration: EXPAND_MS, easing: Easing.out(Easing.cubic) })
    // Deliberately no cleanup — each Burst (and its Particles) is removed from state, and thus
    // unmounted, by its own cleanup timer in Fireworks below, well after these run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const animatedProps = useAnimatedProps(() => ({
    cx: originX + Math.cos(angle) * distance * progress.value,
    cy: originY + Math.sin(angle) * distance * progress.value,
    opacity: opacity.value
  }))

  return <AnimatedCircle animatedProps={animatedProps} r={3.5} fill={color} stroke={outline} strokeWidth={1} />
}

const Burst = ({ originX, originY, color, outline }: BurstSpec & { outline: string }): JSX.Element => {
  // Randomized once per mount (not per re-render) so a burst's particle spread doesn't reshuffle
  // mid-animation. Each burst is a fresh mount (see the id-keyed list in Fireworks), so this still
  // varies burst-to-burst even though it only runs once here. The Math.random() calls make this
  // factory intentionally impure — deliberate, since the point is a one-time-per-mount random
  // layout rather than a pure derivation of props.
  /* eslint-disable react-hooks/purity */
  const particles = useMemo<ParticleSpec[]>(() => {
    const specs: ParticleSpec[] = []
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      specs.push({
        key: `${i}`,
        angle: (i / PARTICLES_PER_BURST) * Math.PI * 2 + Math.random() * 0.3,
        distance: 60 + Math.random() * 40
      })
    }
    return specs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* eslint-enable react-hooks/purity */

  return (
    <>
      {particles.map((p) => (
        <Particle key={p.key} originX={originX} originY={originY} angle={p.angle} distance={p.distance} color={color} outline={outline} />
      ))}
    </>
  )
}

export const Fireworks = ({ colors, dark = false }: CelebrationProps): JSX.Element => {
  const outline = dark ? DARK_MODE_OUTLINE : LIGHT_MODE_OUTLINE
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [bursts, setBursts] = useState<BurstSpec[]>([])
  const nextIdRef = useRef(0)

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setSize({ width, height })
  }

  // Keeps spawning bursts at random intervals for as long as this component stays mounted, i.e.
  // for as long as Game.tsx keeps the win dialog open — there's no fixed-length "cycle" to
  // restart, the show just runs continuously until unmounted.
  useEffect(() => {
    if (size.width === 0 || colors.length === 0) return
    let cancelled = false
    let spawnTimer: ReturnType<typeof setTimeout>
    const cleanupTimers = new Set<ReturnType<typeof setTimeout>>()

    const spawnBurst = () => {
      const id = nextIdRef.current++
      // Spread across nearly the entire screen (Game.tsx now portals this to the app root, so
      // "the screen" really is the full viewport) rather than a small centered patch — small
      // margins keep a burst's outermost particles from getting clipped right at the edge.
      const originX = size.width * (0.05 + Math.random() * 0.9)
      const originY = size.height * (0.08 + Math.random() * 0.84)
      const color = colors[Math.floor(Math.random() * colors.length)]
      setBursts((prev) => [...prev, { id, originX, originY, color }])

      const cleanupTimer = setTimeout(() => {
        cleanupTimers.delete(cleanupTimer)
        setBursts((prev) => prev.filter((b) => b.id !== id))
      }, BURST_LIFETIME_MS)
      cleanupTimers.add(cleanupTimer)

      if (!cancelled) {
        spawnTimer = setTimeout(spawnBurst, MIN_BURST_INTERVAL_MS + Math.random() * (MAX_BURST_INTERVAL_MS - MIN_BURST_INTERVAL_MS))
      }
    }
    spawnBurst()

    return () => {
      cancelled = true
      clearTimeout(spawnTimer)
      cleanupTimers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height])

  return (
    <View style={StyleSheet.absoluteFill} onLayout={handleLayout} pointerEvents='none'>
      {size.width > 0 && (
        <Svg width={size.width} height={size.height}>
          {bursts.map((b) => (
            <Burst key={b.id} id={b.id} originX={b.originX} originY={b.originY} color={b.color} outline={outline} />
          ))}
        </Svg>
      )}
    </View>
  )
}
