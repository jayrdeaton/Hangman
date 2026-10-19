import { JSX, type ReactNode, useEffect } from 'react'
import { StyleSheet, useWindowDimensions } from 'react-native'
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated'

import { REFLOW_EASING } from '@/constants/loadoutMotion'

import { BoardBackground } from './BoardBackground'

// How long a layer takes to slide in or out.
export const LAYER_MS = 300

export type FullScreenLayerProps = {
  visible: boolean
  // Where it slides in from: the bottom for a whole-screen modal (Choose Packs), the right for a page
  // inside one (a pack's puzzles, the pack editor), the way a page pushes in.
  from: 'bottom' | 'right'
  children: ReactNode
}

// A whole screen that slides in over the one beneath, on the same board every screen draws on
// (BoardBackground), and slides back out when it's done (Jay, 2026-10-19: Choose Packs as a whole
// screen rather than a drawer). It stays mounted while away, off the screen's edge, so opening it
// costs nothing (its lists are long), and takes no taps there; whoever renders it keeps its own
// content out of a screen reader's way while it's away. No motion with the system's Reduce Motion
// on: it's just there, or gone.
export const FullScreenLayer = ({ visible, from, children }: FullScreenLayerProps): JSX.Element => {
  const { width, height } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const shown = useSharedValue(visible ? 1 : 0)
  useEffect(() => {
    shown.value = reduceMotion ? (visible ? 1 : 0) : withTiming(visible ? 1 : 0, { duration: LAYER_MS, easing: REFLOW_EASING })
  }, [shown, visible, reduceMotion])
  // How far off the edge it waits: the window's height or width, kept in a shared value so a resized
  // window moves it too (read from the render's closure, a page left waiting at a narrower window's
  // width peeked in from the right of a wider one, seen in the web preview).
  const distance = useSharedValue(from === 'bottom' ? height : width)
  useEffect(() => {
    distance.value = from === 'bottom' ? height : width
  }, [distance, from, width, height])
  // Invisible once all the way off, as well, so nothing of it can show while it waits.
  const slideStyle = useAnimatedStyle(() => {
    const offset = (1 - shown.value) * distance.value
    return { opacity: shown.value === 0 ? 0 : 1, transform: from === 'bottom' ? [{ translateY: offset }] : [{ translateX: offset }] }
  }, [from, shown, distance])
  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.layer, slideStyle]}>
      <BoardBackground />
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // Over the loadout's corners (zIndex 10), which it covers while it's up.
  layer: { zIndex: 20 }
})
