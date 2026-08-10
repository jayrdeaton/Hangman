import { Dialog } from '@rific/auto-paper'
import { IconButton } from '@rific/haptic-press'
import { JSX, ReactNode, useEffect, useState } from 'react'
import { Keyboard, type KeyboardEvent, LayoutChangeEvent, Platform, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Text } from 'react-native-paper'
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export type DialogShellProps = {
  visible: boolean
  onDismiss: () => void
  title: string
  children: ReactNode
  // Shifts the card up to clear the native keyboard as it opens/closes, instead of letting it sit
  // centered and get covered — see PnpWordPrompt, the one dialog whose fields need the keyboard
  // open to be usable at all. Opt-in: every other DialogShell stays exactly as it was, and doesn't
  // pay for the extra keyboard/layout subscriptions this pulls in (see KeyboardAvoidingDialogShell).
  avoidKeyboard?: boolean
}

type DialogChromeProps = {
  title: string
  onDismiss: () => void
  children: ReactNode
  onHeaderLayout?: (event: LayoutChangeEvent) => void
  onContentLayout?: (event: LayoutChangeEvent) => void
}

const DialogChrome = ({ title, onDismiss, children, onHeaderLayout, onContentLayout }: DialogChromeProps): JSX.Element => (
  <>
    <View style={styles.headerRow} onLayout={onHeaderLayout} testID='dialog-shell-header'>
      <Text variant='titleLarge'>{title}</Text>
      <IconButton icon='close' onPress={onDismiss} accessibilityLabel='Close' />
    </View>

    <Dialog.Content style={styles.content} onLayout={onContentLayout} testID='dialog-shell-content'>
      {children}
    </Dialog.Content>
  </>
)

type BaseDialogShellProps = Omit<DialogShellProps, 'avoidKeyboard'>

const PlainDialogShell = ({ visible, onDismiss, title, children }: BaseDialogShellProps): JSX.Element => (
  <Dialog visible={visible} onDismiss={onDismiss}>
    <DialogChrome title={title} onDismiss={onDismiss}>
      {children}
    </DialogChrome>
  </Dialog>
)

// Mirrors @rific/auto-paper's private Dialog.tsx constant (DIALOG_MARGIN) — not exported, so this
// has to be kept in sync by hand if that value ever changes.
const DIALOG_MARGIN = 32

// Breathing room between the card's bottom edge and the keyboard's top edge once the card actually
// has to shift to clear it — without this the card stops flush against the keyboard, touching it.
const KEYBOARD_BREATHING_GAP = 16

const KeyboardAvoidingDialogShell = ({ visible, onDismiss, title, children }: BaseDialogShellProps): JSX.Element => {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  // Neither reanimated's own useAnimatedKeyboard nor react-native-keyboard-controller's
  // useReanimatedKeyboardAnimation ever deliver a real height in this app's build (confirmed live:
  // both shared values sit stuck at 0 even with the keyboard visibly open) -- something about how
  // either library's native module registers for keyboard-frame notifications doesn't work here,
  // for reasons that need native-level investigation this fix doesn't depend on. Plain RN core's
  // Keyboard module DOES fire correctly (confirmed live: keyboardWillShow delivered a real height),
  // so this drives a shared value from that instead. Assigning through withTiming (rather than a
  // bare height value) keeps the transition smooth on the UI thread even though the *input* only
  // arrives as two discrete events (will-show/will-hide) rather than a continuous per-frame stream
  // -- animating between those two points, over the same duration the OS reports for its own
  // keyboard animation, is indistinguishable from frame-accurate tracking for this purpose. Requires
  // <Provider reanimated={...}> to be injected (see Theme.tsx) for the resulting animatedStyle to
  // actually reach the card; see Dialog's own animatedStyle prop for why.
  const height = useSharedValue(0)
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      height.value = withTiming(event.endCoordinates.height, { duration: event.duration || 250 })
    })
    const hideSub = Keyboard.addListener(hideEvent, (event: KeyboardEvent) => {
      height.value = withTiming(0, { duration: event.duration || 250 })
    })
    return () => {
      hideSub.remove()
      showSub.remove()
    }
  }, [height])
  const [headerHeight, setHeaderHeight] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)

  // auto-paper centers the card in a box that's already inset by safe-area top/bottom plus
  // DIALOG_MARGIN on each side — `gap` is how much clearance the card naturally has above and
  // below it today. The keyboard eats the bottom `height` of the screen, but
  // `insets.bottom + DIALOG_MARGIN` of that was already unused clearance, so `overlap` is how far
  // the keyboard actually reaches into the card's space. Shifting up by exactly that (clamped to
  // `gap`, so the card never gets pushed above its own natural top clearance) clears the keyboard
  // while staying as low as possible instead of overshooting.
  const availableHeight = windowHeight - insets.top - insets.bottom - DIALOG_MARGIN * 2
  const gap = Math.max(0, (availableHeight - (headerHeight + contentHeight)) / 2)

  const animatedStyle = useAnimatedStyle(() => {
    const overlap = Math.max(0, height.value - insets.bottom - DIALOG_MARGIN - gap + KEYBOARD_BREATHING_GAP)
    const shiftUp = Math.min(gap, overlap)
    return { transform: [{ translateY: -shiftUp }] }
  }, [gap, insets.bottom])

  return (
    <Dialog visible={visible} onDismiss={onDismiss} animatedStyle={animatedStyle}>
      <DialogChrome title={title} onDismiss={onDismiss} onHeaderLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)} onContentLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}>
        {children}
      </DialogChrome>
    </Dialog>
  )
}

export const DialogShell = ({ avoidKeyboard, ...rest }: DialogShellProps): JSX.Element => (avoidKeyboard ? <KeyboardAvoidingDialogShell {...rest} /> : <PlainDialogShell {...rest} />)

const styles = StyleSheet.create({
  content: { maxHeight: 480 },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16
  }
})
