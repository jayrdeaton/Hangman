import { useCallback, useState } from 'react'
import { type LayoutChangeEvent, useWindowDimensions, type ViewStyle } from 'react-native'
import { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useKeyboard } from './useKeyboard'

// The card keeps 24 from the screen edges (the same as the confirms and the result card, plus the
// safe area top and bottom).
export const SCREEN_GUTTER = 24
// Breathing room between the card's bottom edge and the keyboard's top edge once the card has to
// rise to clear it; without this the card stops flush against the keyboard, touching it.
const KEYBOARD_BREATHING_GAP = 16

export type KeyboardLiftedCard = {
  // The backdrop's top and bottom padding: the safe area plus the gutter.
  overlayStyle: ViewStyle
  // The card's height cap: the room above the keyboard when it's up, inside the safe area always.
  cardMaxHeight: number
  // For the Animated.View around the card: how far it has risen, eased over the keyboard's own duration.
  liftStyle: ReturnType<typeof useAnimatedStyle>
  // For the same view's onLayout: the card's measured height, which the lift is worked out from.
  onCardLayout: (event: LayoutChangeEvent) => void
}

// A fleet card with a text field in it (the Pass & Play prompt), centered on
// @tastic/hud's OverlayBackdrop, that rises to clear the software keyboard (useKeyboard) and never
// grows past the room it has.
export const useKeyboardLiftedCard = (): KeyboardLiftedCard => {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()

  // The card's height cap and its lift both follow the keyboard, and the lift eases over the duration
  // the keyboard itself takes.
  const keyboard = useKeyboard()
  const [cardHeight, setCardHeight] = useState(0)
  const onCardLayout = useCallback((event: LayoutChangeEvent) => setCardHeight(event.nativeEvent.layout.height), [])

  // The backdrop centers the card between its safe-area-plus-gutter edges, regionTop and
  // regionBottom. With the keyboard up the card also has to end a breathing gap above the
  // keyboard's top edge: usableBottom (see useKeyboard's overlap).
  const regionTop = insets.top + SCREEN_GUTTER
  const regionBottom = windowHeight - insets.bottom - SCREEN_GUTTER
  const keyboardTop = windowHeight - keyboard.overlap
  const usableBottom = keyboard.height > 0 ? Math.min(regionBottom, keyboardTop - KEYBOARD_BREATHING_GAP) : regionBottom
  const cardMaxHeight = Math.max(0, usableBottom - regionTop)
  // Centered, the card's bottom sits at regionTop + gap + cardHeight. It rises by however far that
  // passes usableBottom, which the cap above keeps within gap: never past its own top clearance, and
  // otherwise as low as it can stay.
  const gap = Math.max(0, (regionBottom - regionTop - cardHeight) / 2)
  const lift = Math.min(gap, Math.max(0, regionTop + gap + cardHeight - usableBottom))
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: withTiming(-lift, { duration: keyboard.duration }) }] }), [lift, keyboard.duration])

  return { overlayStyle: { paddingBottom: insets.bottom + SCREEN_GUTTER, paddingTop: insets.top + SCREEN_GUTTER }, cardMaxHeight, liftStyle, onCardLayout }
}
