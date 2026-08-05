import { useCallback, useEffect, useRef } from 'react'
import { Platform } from 'react-native'

type WheelLikeEvent = {
  currentTarget: { scrollLeft: number }
  deltaX: number
  deltaY: number
  preventDefault: () => void
}

// How long the page must have gone without any wheel activity before entering this element counts
// as a deliberate hover, rather than the carousel scrolling into a stationary cursor mid page-scroll
// (see the doc comment below).
const GESTURE_IDLE_MS = 150

let lastPageWheelAt = 0
let pageWheelListenerAttached = false

// A real browser wires this to a page-wide `wheel` listener (see ensurePageWheelListener below);
// exported separately so tests can call it directly — react-native's own jest environment stubs
// `window` without real DOM event APIs to dispatch a wheel event through.
export const recordPageWheelActivity = () => {
  lastPageWheelAt = Date.now()
}

const ensurePageWheelListener = () => {
  // typeof window.addEventListener, not just typeof window — react-native's own test/jsdom-lite
  // environment defines a bare `window` global with no real DOM event APIs on it, so this would
  // otherwise throw the moment a test mocks Platform.OS to 'web' without actually running in a
  // browser.
  if (pageWheelListenerAttached || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  pageWheelListenerAttached = true
  window.addEventListener('wheel', recordPageWheelActivity, { passive: true })
}

// react-native-web forwards unrecognized DOM event props like onWheel/onMouseEnter/onMouseLeave
// straight through to the rendered element, so a horizontal FlatList can accept these directly;
// native silently ignores them. Redirects vertical mouse-wheel input into horizontal scroll — on
// web there's no visible scrollbar and no native drag-to-scroll affordance for a hidden-indicator
// carousel.
//
// Gated on a genuine hover, not just "a wheel event landed on this element" — this carousel lives
// inside a vertically-scrolling drawer, so as the page scrolls, the carousel's own DOM node passes
// under wherever the cursor happens to be resting (the cursor doesn't move during a trackpad/wheel
// scroll gesture), and the SAME page-scroll gesture's wheel events land on it too. Those pass-
// through events are indistinguishable from "the user parked their cursor here to browse the
// carousel with their wheel" by deltaX/deltaY alone — both are deltaY-dominant — so redirecting
// unconditionally stole the page scroll out from under the user mid-gesture, and the carousel
// visibly scrolled horizontally in response to a vertical scroll happening somewhere else on the
// page entirely. Arming only on mouseenter, and only once the page has gone quiet for
// GESTURE_IDLE_MS first, distinguishes "I moved my mouse here on purpose" from "the page scrolled
// this element under my mouse."
export const useHorizontalWheelScrollProps = () => {
  const armedRef = useRef(false)

  useEffect(() => {
    if (Platform.OS === 'web') ensurePageWheelListener()
  }, [])

  const onMouseEnter = useCallback(() => {
    armedRef.current = Date.now() - lastPageWheelAt > GESTURE_IDLE_MS
  }, [])

  const onMouseLeave = useCallback(() => {
    armedRef.current = false
  }, [])

  const onWheel = useCallback((e: WheelLikeEvent) => {
    if (!armedRef.current) return
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.currentTarget.scrollLeft += e.deltaY
    e.preventDefault()
  }, [])

  if (Platform.OS !== 'web') return {}
  return { onMouseEnter, onMouseLeave, onWheel }
}
