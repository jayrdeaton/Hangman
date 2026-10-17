import { useCallback, useEffect, useState } from 'react'
import { Keyboard, type KeyboardEvent, type LayoutChangeEvent, Platform, useWindowDimensions, type ViewStyle } from 'react-native'
import { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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

// A fleet card with a text field in it (the Pass & Play prompt, the player name dialog), centered on
// @tastic/hud's OverlayBackdrop, that rises to clear the software keyboard and never grows past the
// room it has. Neither reanimated's useAnimatedKeyboard nor react-native-keyboard-controller ever
// delivered a real keyboard height in this app's build (confirmed live: both stayed at 0 with the
// keyboard open), while React Native's own Keyboard events do, so those drive it.
export const useKeyboardLiftedCard = (): KeyboardLiftedCard => {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()

  // Show and hide are two discrete events, so plain state is enough: the card's height cap and its
  // lift both follow it, and the lift eases over the duration the keyboard itself takes.
  const [keyboard, setKeyboard] = useState({ height: 0, duration: 250 })
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, (event: KeyboardEvent) => setKeyboard({ height: event.endCoordinates.height, duration: event.duration || 250 }))
    const hideSub = Keyboard.addListener(hideEvent, (event: KeyboardEvent) => setKeyboard({ height: 0, duration: event.duration || 250 }))
    return () => {
      hideSub.remove()
      showSub.remove()
    }
  }, [])
  const [cardHeight, setCardHeight] = useState(0)
  const onCardLayout = useCallback((event: LayoutChangeEvent) => setCardHeight(event.nativeEvent.layout.height), [])

  // The backdrop centers the card between its safe-area-plus-gutter edges, regionTop and
  // regionBottom. With the keyboard up the card also has to end a breathing gap above the
  // keyboard's top edge: usableBottom. iOS reports a keyboard height that already covers the home
  // indicator's strip (the bottom inset); Android's leaves out the navigation bar under it, so the
  // keyboard's top edge sits that much higher there.
  const regionTop = insets.top + SCREEN_GUTTER
  const regionBottom = windowHeight - insets.bottom - SCREEN_GUTTER
  const keyboardTop = windowHeight - keyboard.height - (Platform.OS === 'ios' ? 0 : insets.bottom)
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
