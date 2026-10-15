import { Provider } from '@rific/auto-paper'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { BackHandler, StyleSheet } from 'react-native'
import * as RNPaper from 'react-native-paper'

import { fitAnswerFontSize, RoundEndDialog, type RoundEndDialogProps } from '@/components/RoundEndDialog'
import { SketchWord, sketchWordWidth } from '@/components/SketchWord'

// SketchWord draws SVG strokes, so the answer is checked through the props each word is given.
jest.mock('@/components/SketchWord', () => ({
  ...jest.requireActual('@/components/SketchWord'),
  SketchWord: jest.fn(() => null)
}))
const mockSketchWord = jest.mocked(SketchWord)

// Paper's Icon too, to read which glyph and color the header gets.
jest.mock('react-native-paper', () => ({
  ...jest.requireActual('react-native-paper'),
  Icon: jest.fn(() => null)
}))
const mockIcon = jest.mocked(RNPaper.Icon)
// The header icon of the most recent render: the first Icon the card draws.
const headerIcon = () => mockIcon.mock.calls[0][0]

// The app's nesting (see Providers.tsx): FeedbackPressProvider outside auto-paper's Provider, whose
// Portal.Host the card renders into.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <FeedbackPressProvider paper={RNPaper}>
    <Provider initialValue={{ appearance: 'light' }}>{children}</Provider>
  </FeedbackPressProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

// Reports the live theme's colors, so the expected ink and error red match whatever the Provider made.
const mockOnThemeColors = jest.fn<void, [RNPaper.MD3Theme['colors']]>()
const ThemeProbe = () => {
  mockOnThemeColors(RNPaper.useTheme().colors)
  return null
}
const themeColors = () => mockOnThemeColors.mock.lastCall![0]

const baseProps: RoundEndDialogProps = { visible: true, outcome: 'win', phrase: 'CAT', guessedLetters: ['C', 'A', 'T'], onDismiss: jest.fn() }
const renderDialog = (props: Partial<RoundEndDialogProps> = {}) =>
  render(
    <>
      <ThemeProbe />
      <RoundEndDialog {...baseProps} {...props} />
    </>
  )

// The props of every SketchWord in the most recent render, one per answer word.
const answerWords = (wordCount: number) => mockSketchWord.mock.calls.slice(-wordCount).map(([props]) => props)

describe('RoundEndDialog', () => {
  beforeEach(() => {
    mockSketchWord.mockClear()
    mockIcon.mockClear()
  })

  it('renders nothing while hidden, and leaves the back button alone', async () => {
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener')
    const { queryByText } = await renderDialog({ visible: false })

    expect(queryByText('You Won!')).toBeNull()
    expect(mockSketchWord).not.toHaveBeenCalled()
    expect(addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress')).toHaveLength(0)
    addEventListener.mockRestore()
  })

  it('writes the whole answer in sketch letters under a primary-colored trophy and "You Won!", every letter in the ink color', async () => {
    const { getByText, getByLabelText } = await renderDialog()

    expect(getByText('You Won!')).toBeTruthy()
    expect(StyleSheet.flatten(getByText('You Won!').props.style).color).toBe(themeColors().primary)
    expect(headerIcon()).toMatchObject({ source: 'trophy', color: themeColors().primary })
    expect(getByLabelText('The answer was CAT')).toBeTruthy()
    const [word] = answerWords(1)
    expect(word.letters).toEqual(['C', 'A', 'T'])
    expect(word.letterColors).toEqual([themeColors().onSurface, themeColors().onSurface, themeColors().onSurface])
  })

  it('on a loss, shows a muted skull and "You Lost!" in ink, and draws the letters the player never found in the error red', async () => {
    const { getByText } = await renderDialog({ outcome: 'loss', phrase: 'HOT DOG', guessedLetters: ['O', 'X', 'G', 'Q'] })

    expect(getByText('You Lost!')).toBeTruthy()
    expect(StyleSheet.flatten(getByText('You Lost!').props.style).color).toBe(themeColors().onSurface)
    expect(headerIcon()).toMatchObject({ source: 'skull-outline', color: themeColors().onSurfaceVariant })
    const [hot, dog] = answerWords(2)
    expect(hot.letters).toEqual(['H', 'O', 'T'])
    expect(hot.letterColors).toEqual([themeColors().error, themeColors().onSurface, themeColors().error])
    expect(dog.letterColors).toEqual([themeColors().error, themeColors().onSurface, themeColors().onSurface])
  })

  it("draws missed letters a true red in dark mode, not the theme's pale dark-mode error pink", async () => {
    const DarkWrapper = ({ children }: { children: ReactNode }) => (
      <FeedbackPressProvider paper={RNPaper}>
        <Provider initialValue={{ appearance: 'dark' }}>{children}</Provider>
      </FeedbackPressProvider>
    )
    await rtlRender(
      <>
        <ThemeProbe />
        <RoundEndDialog {...baseProps} outcome='loss' phrase='HOT' guessedLetters={['O', 'Q']} />
      </>,
      { wrapper: DarkWrapper }
    )

    expect(answerWords(1)[0].letterColors).toEqual(['#DC362E', themeColors().onSurface, '#DC362E'])
    expect(themeColors().error).not.toBe('#DC362E')
  })

  it('lists new achievements under a medal, and shows pack progress on wins only', async () => {
    const categoryProgress = { label: 'Animals', unlockedCount: 3, totalCount: 40 }
    const { getByText } = await renderDialog({ categoryProgress, unlockedAchievementTitles: ['First Win', 'Flawless Victory'] })

    expect(getByText('Achievements Unlocked')).toBeTruthy()
    expect(getByText('First Win')).toBeTruthy()
    expect(getByText('Flawless Victory')).toBeTruthy()
    expect(mockIcon.mock.calls.map(([props]) => props.source)).toContain('medal')
    expect(getByText('3 of 40 unlocked in Animals')).toBeTruthy()

    const loss = await renderDialog({ outcome: 'loss', guessedLetters: ['Q'], categoryProgress })
    expect(loss.queryByText('3 of 40 unlocked in Animals')).toBeNull()
  })

  it('writes left to right across the whole answer, word breaks included', async () => {
    await renderDialog({ phrase: 'HOT DOG', guessedLetters: ['H', 'O', 'T', 'D', 'G'] })

    const delays = answerWords(2).flatMap((word) => word.letterDelaysMs!)
    expect(delays).toHaveLength(6)
    delays.slice(1).forEach((delay, i) => expect(delay).toBeGreaterThan(delays[i]))
  })

  // Jest's window is 750 wide, so the card is at its 360 maximum: 360 less 2 x 32 padding and 2 x 1
  // border leaves 294 for the answer.
  it('caps a short answer at the headline size and shrinks a long word until it fits the card', async () => {
    await renderDialog({ phrase: 'CAT' })
    expect(answerWords(1)[0].fontSize).toBe(40)

    mockSketchWord.mockClear()
    await renderDialog({ phrase: 'CONGRATULATIONS', guessedLetters: 'CONGRATULIS'.split('') })
    expect(answerWords(1)[0].fontSize).toBe(17)
    expect(sketchWordWidth(15, 17)).toBeLessThanOrEqual(294)
    expect(sketchWordWidth(15, 18)).toBeGreaterThan(294)
  })

  it('sizes a several-word answer by its longest word, not its total letters', async () => {
    await renderDialog({ phrase: 'ICE CREAM SANDWICH', guessedLetters: 'ICREAMSNDWH'.split('') })

    expect(answerWords(3).map((word) => word.fontSize)).toEqual([32, 32, 32])
  })

  it('moves on only from Next: no backdrop to tap, and the card itself does nothing', async () => {
    const onDismiss = jest.fn()
    const { getByText, getByLabelText, queryByTestId } = await renderDialog({ onDismiss })

    expect(queryByTestId('dialog-backdrop')).toBeNull()
    await fireEvent.press(getByText('You Won!'))
    await fireEvent.press(getByLabelText('The answer was CAT'))
    expect(onDismiss).not.toHaveBeenCalled()

    await fireEvent.press(getByText('Next'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("treats Android's back button as Next while open, and lets go of it once hidden", async () => {
    const remove = jest.fn()
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove })
    const backListenerCount = () => addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress').length
    const onDismiss = jest.fn()
    const { rerender } = await renderDialog({ onDismiss })

    const handler = addEventListener.mock.calls.find(([event]) => event === 'hardwareBackPress')![1] as () => boolean
    expect(handler()).toBe(true)
    expect(onDismiss).toHaveBeenCalledTimes(1)

    await rerender(
      <>
        <ThemeProbe />
        <RoundEndDialog {...baseProps} onDismiss={onDismiss} visible={false} />
      </>
    )
    expect(remove).toHaveBeenCalled()
    // Hidden, it holds no listener at all: one registered while open, none added since.
    expect(backListenerCount()).toBe(1)
    expect(remove).toHaveBeenCalledTimes(1)
    addEventListener.mockRestore()
  })
})

describe('fitAnswerFontSize', () => {
  const words = (phrase: string) => phrase.split(' ').map((word) => word.length)
  // A 375 x 667 phone: the card's inside is 261 wide, and on a pack win (progress row, no unlocks)
  // 667 less the 48 gutter, the card's 258 of chrome and the progress block's 62 leaves 299.
  const longest = words('THE WOMAN IN THE HOUSE ACROSS THE STREET FROM THE GIRL IN THE WINDOW')

  it("shrinks the longest catalog answer to fit a small phone's card without scrolling", () => {
    const fontSize = fitAnswerFontSize(longest, 261, 299)

    expect(fontSize).toBe(25)
    // Ten lines at 25 with the 0.2 line gap: 250 + 45 = 295, inside 299.
    expect(10 * fontSize + 9 * fontSize * 0.2).toBeLessThanOrEqual(299)
  })

  it('stops shrinking for height at 20 and lets the card scroll instead', () => {
    expect(fitAnswerFontSize(longest, 261, 50)).toBe(20)
  })

  it('lets width win below that floor, so a very long word still fits whole', () => {
    const fontSize = fitAnswerFontSize([34], 261, 1000)

    expect(fontSize).toBe(8)
    expect(sketchWordWidth(34, fontSize)).toBeLessThanOrEqual(261)
  })
})
