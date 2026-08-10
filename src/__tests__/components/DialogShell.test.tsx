import { Provider as AutoPaperProvider, type ReanimatedModule } from '@rific/auto-paper'
import { fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { Keyboard, StyleSheet, Text, View } from 'react-native'

import { DialogShell } from '@/components/DialogShell'

// A plain RN View stands in for Reanimated's real Animated.View here — jest.setup.ts's global
// react-native-reanimated mock already reduces useAnimatedStyle to "call the updater once and
// return whatever plain object it made", so there's nothing animated left for a fake module to
// special-case; it only needs to forward style/testID/children faithfully.
const fakeReanimated: ReanimatedModule = {
  View: ({ children, style, testID }) => (
    <View style={style} testID={testID}>
      {children}
    </View>
  )
}

// Mirrors auto-paper's own BlurView.test.tsx wrapper pattern (<Provider expoBlur={...}>) -- Dialog
// only reads the injected reanimated module through this same Provider's context, and Provider
// already sets up react-native-paper's own context/Portal host internally, so nothing else is
// needed on top of it.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: ({ children }) => <AutoPaperProvider reanimated={fakeReanimated}>{children}</AutoPaperProvider> })

// require(), not `import * as RN` -- Babel's ESM-interop namespace copy isn't the same object
// DialogShell.tsx's own `import { useWindowDimensions } from 'react-native'` reads from, so
// spying on that copy wouldn't be observed. require() returns the actual shared module object.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require('react-native')

const getWrapperTransform = (getByTestId: Awaited<ReturnType<typeof render>>['getByTestId']) => StyleSheet.flatten(getByTestId('dialog-animated-wrapper').props.style).transform

// DialogShell drives its shift off plain RN core Keyboard events (see DialogShell.tsx's own
// comment on why, not either reanimated's or keyboard-controller's dedicated keyboard hooks), so
// tests capture whatever callback it registers per event name and invoke it directly to simulate
// a show/hide, the same way RN itself would call it from a native event.
type KeyboardListener = (event: { duration?: number; endCoordinates: { height: number } }) => void
let listeners: Record<string, KeyboardListener>

const simulateKeyboardShow = (height: number) => listeners.keyboardWillShow?.({ duration: 250, endCoordinates: { height } })

describe('DialogShell', () => {
  beforeEach(() => {
    listeners = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName: string, callback: any) => {
      listeners[eventName] = callback
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>
    })
    // Deterministic frame so the shift-up math below has fixed numbers to check, regardless of
    // whatever jest-expo's own RN mock happens to default useWindowDimensions to.
    jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width: 400, height: 800, scale: 2, fontScale: 1 })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('never renders the animated wrapper when avoidKeyboard is not passed, no matter how tall the keyboard is', async () => {
    const { queryByTestId } = await render(
      <DialogShell visible onDismiss={jest.fn()} title='Test'>
        <Text>content</Text>
      </DialogShell>
    )

    expect(queryByTestId('dialog-animated-wrapper')).toBeNull()
  })

  it('shifts nothing when avoidKeyboard is on but the keyboard is closed', async () => {
    const { getByTestId } = await render(
      <DialogShell visible onDismiss={jest.fn()} title='Test' avoidKeyboard>
        <Text>content</Text>
      </DialogShell>
    )

    expect(getWrapperTransform(getByTestId)[0].translateY).toBeCloseTo(0)
  })

  it('shifts the card up by exactly enough to clear the keyboard, not the full keyboard height', async () => {
    const { getByTestId } = await render(
      <DialogShell visible onDismiss={jest.fn()} title='Test' avoidKeyboard>
        <Text>content</Text>
      </DialogShell>
    )

    // withTiming is mocked as an identity passthrough (see jest.setup.ts), so this lands
    // immediately -- the layout events below re-render the component, and that re-render is what
    // picks the new height up (useAnimatedStyle's mock only recomputes on an actual React render,
    // unlike the real library's UI-thread reactivity).
    simulateKeyboardShow(300)

    // windowHeight 800, insets 0 (globally mocked), DIALOG_MARGIN 32 -> availableHeight 736.
    // cardHeight 360 (60 header + 300 content) -> gap 188.
    // overlap = 300 - 0 - 32 - 188 + KEYBOARD_BREATHING_GAP (16) = 96.
    await fireEvent(getByTestId('dialog-shell-header'), 'layout', { nativeEvent: { layout: { height: 60 } } })
    await fireEvent(getByTestId('dialog-shell-content'), 'layout', { nativeEvent: { layout: { height: 300 } } })

    expect(getWrapperTransform(getByTestId)).toEqual([{ translateY: -96 }])
  })

  it('clamps the shift to the natural top clearance instead of overshooting off-screen', async () => {
    const { getByTestId } = await render(
      <DialogShell visible onDismiss={jest.fn()} title='Test' avoidKeyboard>
        <Text>content</Text>
      </DialogShell>
    )

    simulateKeyboardShow(700)

    // Same 188 gap as above, but overlap (700 - 32 - 188 + 16 = 496) now exceeds it -> clamped to 188.
    await fireEvent(getByTestId('dialog-shell-header'), 'layout', { nativeEvent: { layout: { height: 60 } } })
    await fireEvent(getByTestId('dialog-shell-content'), 'layout', { nativeEvent: { layout: { height: 300 } } })

    expect(getWrapperTransform(getByTestId)).toEqual([{ translateY: -188 }])
  })
})
