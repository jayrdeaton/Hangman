import { useEffect, useState } from 'react'
import { Keyboard, type KeyboardEvent, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type KeyboardState = {
  // The keyboard's own reported height, 0 while it's down.
  height: number
  // How far up from the screen's bottom edge it reaches: iOS reports a height that already covers the
  // home indicator's strip (the bottom inset); Android's leaves out the navigation bar under it, so the
  // keyboard's top edge sits that much higher there.
  overlap: number
  // How long the keyboard takes to move, for easing whatever follows it.
  duration: number
}

// The software keyboard, from React Native's own Keyboard events. Neither reanimated's
// useAnimatedKeyboard nor react-native-keyboard-controller ever delivered a real keyboard height in this
// app's build (confirmed live: both stayed at 0 with the keyboard open), while these do. Show and hide
// are two discrete events, so plain state is enough.
export const useKeyboard = (): KeyboardState => {
  const insets = useSafeAreaInsets()
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
  const overlap = keyboard.height > 0 ? keyboard.height + (Platform.OS === 'ios' ? 0 : insets.bottom) : 0
  return { height: keyboard.height, overlap, duration: keyboard.duration }
}
