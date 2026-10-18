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

const baseProps: PnpWordPromptProps = { writerName: 'Player 1', guessers: [{ id: 'p2', name: 'Player 2' }], guesserId: 'p2', onGuesserChange: jest.fn(), answer: '', hint: '', onAnswerChange: jest.fn(), onHintChange: jest.fn(), promptVisible: true, onClose: jest.fn(), onSubmit: jest.fn() }
const renderPrompt = (props: Partial<PnpWordPromptProps> = {}) =>
  render(
    <Providers>
      <PnpWordPrompt {...baseProps} {...props} />
    </Providers>
  )

describe('PnpWordPrompt', () => {
  it('renders nothing while Settings has it stepped aside, and leaves the back button alone', async () => {
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener')
    const { queryByTestId } = await renderPrompt({ promptVisible: false })

    expect(queryByTestId('pnp-answer-input')).toBeNull()
    expect(addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress')).toHaveLength(0)
    addEventListener.mockRestore()
  })

  it("is the fleet card: the writer's name, the two fields, Keep This Word and Next, with nothing to tap beside it", async () => {
    const { getByText, getByTestId, getByLabelText, queryByTestId } = await renderPrompt()

    expect(getByText("Player 1's Word")).toBeTruthy()
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

  it("leads the title with the writer's chip, and each profile in the For row with theirs", async () => {
    const ann = { id: 'profile-a', name: 'Ann', color: '#9c27b0', tag: 'AN', createdAt: 1, updatedAt: 1 }
    const bo = { id: 'profile-b', name: 'Bo', color: '#4caf50', tag: 'BO', createdAt: 1, updatedAt: 1 }
    const { getByText, getByLabelText } = await renderPrompt({
      writerName: 'Ann',
      writerProfile: ann,
      guessers: [
        { id: 'p2', name: 'Bo', profile: bo },
        { id: 'p3', name: 'Player 3' }
      ],
      guesserId: 'p2'
    })

    expect(getByText("Ann's Word")).toBeTruthy()
    expect(getByText('AN')).toBeTruthy()
    expect(getByText('BO')).toBeTruthy()
    expect(getByLabelText('For Bo')).toBeSelected()
    expect(getByLabelText('For Player 3')).not.toBeSelected()
  })

  // With two players the word can only be for the other one.
  it('has no For row with only one player to guess', async () => {
    const { queryByText, queryByLabelText } = await renderPrompt()

    expect(queryByText('For')).toBeNull()
    expect(queryByLabelText('For Player 2')).toBeNull()
  })

  it('lists everyone else at the table to write for, with the current pick selected, and reports a new pick', async () => {
    const onGuesserChange = jest.fn()
    const guessers = [
      { id: 'p3', name: 'Cy' },
      { id: 'p1', name: 'Ann' }
    ]
    const { getByText, getByLabelText, getAllByLabelText } = await renderPrompt({ writerName: 'Bo', guessers, guesserId: 'p1', onGuesserChange })

    expect(getByText("Bo's Word")).toBeTruthy()
    expect(getByText('For')).toBeTruthy()
    // In the order given (seat order from the writer), and only the pick selected.
    expect(getAllByLabelText(/^For /).map((chip) => chip.props.accessibilityLabel)).toEqual(['For Cy', 'For Ann'])
    expect(getByLabelText('For Ann')).toBeSelected()
    expect(getByLabelText('For Cy')).not.toBeSelected()

    await fireEvent.press(getByLabelText('For Cy'))
    expect(onGuesserChange).toHaveBeenCalledWith('p3')
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

  it('closes from the close glyph and from Android back, never submitting the word, and lets go of back once hidden', async () => {
    const remove = jest.fn()
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove })
    const backListenerCount = () => addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress').length
    const onClose = jest.fn()
    const onSubmit = jest.fn()
    const props = { answer: 'CAT', onClose, onSubmit }
    const { getByLabelText, rerender } = await renderPrompt(props)

    await fireEvent.press(getByLabelText('Close'))
    const handler = addEventListener.mock.calls.find(([event]) => event === 'hardwareBackPress')![1] as () => boolean
    expect(handler()).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()

    // Hidden behind Settings, it holds no back listener: the one it had is removed, none added.
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
