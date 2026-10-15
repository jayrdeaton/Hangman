import { OverlayCard } from '@tastic/hud/chrome'
import { act, fireEvent, render } from '@testing-library/react-native'
import { BackHandler, Keyboard, Platform, StyleSheet } from 'react-native'

import { PnpWordPrompt, type PnpWordPromptProps } from '@/components/PnpWordPrompt'
import { Providers } from '@/components/Providers'

// Records the style the card is given: the app's expo-blur mock renders only its children, so the
// card's height cap never reaches the rendered tree.
jest.mock('@tastic/hud/chrome', () => {
  const actual = jest.requireActual('@tastic/hud/chrome')
  return { ...actual, OverlayCard: jest.fn(actual.OverlayCard) }
})
const mockOverlayCard = jest.mocked(OverlayCard)

const baseProps: PnpWordPromptProps = { answer: '', hint: '', onAnswerChange: jest.fn(), onHintChange: jest.fn(), promptVisible: true, onRequestMenu: jest.fn(), onSubmit: jest.fn() }
const renderPrompt = (props: Partial<PnpWordPromptProps> = {}) =>
  render(
    <Providers>
      <PnpWordPrompt {...baseProps} {...props} />
    </Providers>
  )

describe('PnpWordPrompt', () => {
  it('renders nothing while the menu has it stepped aside, and leaves the back button alone', async () => {
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener')
    const { queryByTestId } = await renderPrompt({ promptVisible: false })

    expect(queryByTestId('pnp-answer-input')).toBeNull()
    expect(addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress')).toHaveLength(0)
    addEventListener.mockRestore()
  })

  it('is the fleet card: a title, the two fields, Keep This Word and Next, with nothing to tap beside it', async () => {
    const { getByText, getByTestId, getByLabelText, queryByTestId } = await renderPrompt()

    expect(getByText('Pass & Play')).toBeTruthy()
    expect(getByTestId('pnp-answer-input')).toBeTruthy()
    expect(getByTestId('pnp-hint-input')).toBeTruthy()
    expect(getByLabelText('Keep this word')).toBeTruthy()
    expect(getByText('Next')).toBeTruthy()
    expect(queryByTestId('dialog-backdrop')).toBeNull()
    // The card is the backdrop's only child, and the backdrop itself takes no touches, so a tap
    // beside the card can't throw the prompt away.
    const backdrop = getByTestId('pnp-card').parent!
    expect(backdrop.children).toEqual([getByTestId('pnp-card')])
    expect(backdrop.props.onStartShouldSetResponder).toBeUndefined()
    expect(backdrop.props.onClick).toBeUndefined()
  })

  it('offers Next only once there is a word to play', async () => {
    const onSubmit = jest.fn()
    const blank = await renderPrompt({ onSubmit })
    expect(blank.getByRole('button', { name: 'Next' })).toBeDisabled()
    await fireEvent.press(blank.getByText('Next'))
    expect(onSubmit).not.toHaveBeenCalled()
    await blank.unmount()

    const typed = await renderPrompt({ answer: 'CAT', onSubmit })
    expect(typed.getByRole('button', { name: 'Next' })).not.toBeDisabled()
    await fireEvent.press(typed.getByText('Next'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('opens the menu from the close glyph and from Android back, never touching the round, and lets go of back once hidden', async () => {
    const remove = jest.fn()
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove })
    const backListenerCount = () => addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress').length
    const onRequestMenu = jest.fn()
    const onSubmit = jest.fn()
    const props = { answer: 'CAT', onRequestMenu, onSubmit }
    const { getByLabelText, rerender } = await renderPrompt(props)

    await fireEvent.press(getByLabelText('Close'))
    const handler = addEventListener.mock.calls.find(([event]) => event === 'hardwareBackPress')![1] as () => boolean
    expect(handler()).toBe(true)
    expect(onRequestMenu).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()

    // Hidden behind the menu, it holds no back listener: the one it had is removed, none added.
    await rerender(
      <Providers>
        <PnpWordPrompt {...baseProps} {...props} promptVisible={false} />
      </Providers>
    )
    expect(remove).toHaveBeenCalledTimes(1)
    expect(backListenerCount()).toBe(1)
    addEventListener.mockRestore()
  })

  describe('the keyboard', () => {
    type KeyboardListener = (event: { endCoordinates: { height: number }; duration: number }) => void
    const originalOS = Platform.OS
    let listeners: Record<string, KeyboardListener>
    let addListener: jest.SpyInstance

    beforeEach(() => {
      listeners = {}
      addListener = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
        listeners[event] = listener as KeyboardListener
        return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>
      })
    })

    afterEach(() => {
      addListener.mockRestore()
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS })
      jest.restoreAllMocks()
    })

    const setup = async () => {
      const utils = await renderPrompt()
      const card = () => utils.getByTestId('pnp-card')
      const lift = () => StyleSheet.flatten(card().props.style).transform?.[0]?.translateY ?? 0
      const maxHeight = () => StyleSheet.flatten(mockOverlayCard.mock.lastCall![0].style)?.maxHeight
      const layOut = (height: number) => fireEvent(card(), 'layout', { nativeEvent: { layout: { height } } })
      const keyboardEvent = async (event: string, height: number) => {
        await act(async () => {
          listeners[event]({ endCoordinates: { height }, duration: 0 })
        })
      }
      return { lift, maxHeight, layOut, keyboardEvent }
    }

    // Jest's window is 1334 tall with no insets: the card sits between 24 and 1310, so one measured
    // at 1000 has (1286 - 1000) / 2 = 143 of clearance above and below it.
    it('rises just far enough to clear it, and never past its own top clearance', async () => {
      const { lift, maxHeight, layOut, keyboardEvent } = await setup()
      await layOut(1000)
      expect(lift()).toBe(-0)
      expect(maxHeight()).toBe(1286)

      // A 200 keyboard's top is at 1134, so the card has to end by 1118: 49 higher than 1167.
      await keyboardEvent('keyboardWillShow', 200)
      expect(lift()).toBe(-49)

      // A 300 keyboard leaves 994 above it (24 to 1018), so the card is capped there and its fields
      // scroll; until it re-measures it rises only as far as its 143 of top clearance.
      await keyboardEvent('keyboardWillShow', 300)
      expect(maxHeight()).toBe(994)
      expect(lift()).toBe(-143)
      // Re-measured at its cap, it fills exactly the room above the keyboard.
      await layOut(994)
      expect(lift()).toBe(-146)

      await keyboardEvent('keyboardWillHide', 0)
      expect(lift()).toBe(-0)
      expect(maxHeight()).toBe(1286)
    })

    // Android reports the keyboard's height without the navigation bar under it, so the keyboard's
    // top is that much higher than on iOS. Insets 24 top and 48 bottom: the card sits between 48 and
    // 1262, and one measured at 800 has 207 of clearance.
    it("on Android, measures from the keyboard's real top edge, above the navigation bar", async () => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
      // The module object itself (the app's manual mock): a namespace import would only spy a copy.
      jest.spyOn(require('react-native-safe-area-context'), 'useSafeAreaInsets').mockReturnValue({ top: 24, bottom: 48, left: 0, right: 0 })
      const { lift, layOut, keyboardEvent } = await setup()
      await layOut(800)

      // The 290 keyboard's top is at 1334 - 48 - 290 = 996, so the card ends by 980: 75 higher than
      // 1055. Treating the height as iOS does would put it at 1044 and lift only 27.
      await keyboardEvent('keyboardDidShow', 290)
      expect(lift()).toBe(-75)
    })
  })
})
