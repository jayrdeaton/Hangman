import { Provider } from '@rific/auto-paper'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import { AccessibilityInfo, BackHandler, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
import * as RNPaper from 'react-native-paper'

import { fitAnswerFontSize, type PnpRoundSummary, RoundEndDialog, type RoundEndDialogProps } from '@/components/RoundEndDialog'
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

  it("lists new achievements with their own icon on their tier's color, and shows pack progress on wins only", async () => {
    const categoryProgress = { label: 'Animals', unlockedCount: 3, totalCount: 40 }
    const unlockedAchievements = [
      { id: 'first_ever_win', title: 'Solved It', icon: 'star', tier: 'bronze' as const },
      { id: 'flawless_debut', title: "Beginner's Luck", icon: 'star-circle', tier: 'gold' as const }
    ]
    const { getByText } = await renderDialog({ categoryProgress, unlockedAchievements })

    expect(getByText('Achievements Unlocked')).toBeTruthy()
    expect(getByText('Solved It')).toBeTruthy()
    expect(getByText("Beginner's Luck")).toBeTruthy()
    // Each badge is the achievement's icon in black on its tier's color (bronze, then gold).
    const badges = mockIcon.mock.calls.map(([props]) => props).filter((props) => props.source === 'star' || props.source === 'star-circle')
    expect(badges.map((props) => [props.source, props.color])).toEqual([
      ['star', '#000000'],
      ['star-circle', '#000000']
    ])
    // Each row is the badge (a View in the tier color) and then the title.
    const badgeColor = (title: string) => {
      const badge = getByText(title).parent!.children[0] as unknown as { props: { style: StyleProp<ViewStyle> } }
      return StyleSheet.flatten(badge.props.style)?.backgroundColor
    }
    expect(badgeColor('Solved It')).toBe('#CD7F32') // bronze
    expect(badgeColor("Beginner's Luck")).toBe('#FFD54F') // gold
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

  // Jest's window is 750 wide, so the card is at its 360 maximum: 360 less hud's 2 x 24 of padding
  // (and no border) leaves 312 for the answer.
  it('caps a short answer at the headline size and shrinks a long word until it fits the card', async () => {
    await renderDialog({ phrase: 'CAT' })
    expect(answerWords(1)[0].fontSize).toBe(40)

    mockSketchWord.mockClear()
    await renderDialog({ phrase: 'CONGRATULATIONS', guessedLetters: 'CONGRATULIS'.split('') })
    expect(answerWords(1)[0].fontSize).toBe(18)
    expect(sketchWordWidth(15, 18)).toBeLessThanOrEqual(312)
    expect(sketchWordWidth(15, 19)).toBeGreaterThan(312)
  })

  it('sizes a several-word answer by its longest word, not its total letters', async () => {
    await renderDialog({ phrase: 'ICE CREAM SANDWICH', guessedLetters: 'ICREAMSNDWH'.split('') })

    expect(answerWords(3).map((word) => word.fontSize)).toEqual([34, 34, 34])
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

describe('RoundEndDialog (Pass & Play)', () => {
  const standings = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, played: i === 1 ? 2 : 1, wins: i === 1 ? 1 : 0 }))
  const summary = (overrides: Partial<PnpRoundSummary> = {}): PnpRoundSummary => ({
    guesserId: 'p2',
    guesserName: 'Bo',
    writerName: 'Ann',
    nextWriterName: 'Bo',
    standings: [
      { id: 'p1', name: 'Ann', played: 0, wins: 0 },
      { id: 'p2', name: 'Bo', played: 2, wins: 1 }
    ],
    ...overrides
  })

  beforeEach(() => {
    mockSketchWord.mockClear()
    mockIcon.mockClear()
  })

  it('says who guessed whose word, shows the standings with the guesser in bold, and who writes next', async () => {
    const { getByText, getByLabelText } = await renderDialog({ passAndPlay: summary(), onEndSession: jest.fn() })

    expect(getByText('You Won!')).toBeTruthy()
    expect(getByText("Bo solved Ann's word.")).toBeTruthy()
    expect(getByText('Standings')).toBeTruthy()
    expect(getByLabelText('Bo: 1 of 2 solved')).toBeTruthy()
    expect(getByLabelText('Ann: no words guessed yet')).toBeTruthy()
    expect(StyleSheet.flatten(getByText('Bo').props.style).fontWeight).toBe('700')
    expect(StyleSheet.flatten(getByText('Ann').props.style).fontWeight).not.toBe('700')
    expect(getByText('Bo writes next')).toBeTruthy()
  })

  it('says the word was missed on a loss', async () => {
    const { getByText } = await renderDialog({ outcome: 'loss', guessedLetters: ['Q'], passAndPlay: summary() })

    expect(getByText('You Lost!')).toBeTruthy()
    expect(getByText("Bo missed Ann's word.")).toBeTruthy()
  })

  it('offers End Session beside Next, each doing only its own thing', async () => {
    const onEndSession = jest.fn()
    const onDismiss = jest.fn()
    const { getByText } = await renderDialog({ passAndPlay: summary(), onEndSession, onDismiss })

    await fireEvent.press(getByText('End Session'))
    expect(onEndSession).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()

    await fireEvent.press(getByText('Next'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onEndSession).toHaveBeenCalledTimes(1)
  })

  it('keeps the solo card to its own rows', async () => {
    const { queryByText } = await renderDialog()

    expect(queryByText('Standings')).toBeNull()
    expect(queryByText('End Session')).toBeNull()
    expect(queryByText(/writes next/)).toBeNull()
  })

  it('announces who guessed whose word and who writes next with the result', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    await renderDialog({ passAndPlay: summary() })

    expect(announce).toHaveBeenLastCalledWith("You won! Bo solved Ann's word. The answer was CAT. Bo writes next.")
    announce.mockRestore()
  })

  // The standings take room the answer would otherwise have, so a long answer has to shrink for them.
  // A phone's 667 of height, by way of the safe area (Jest's window is 1334 tall).
  describe('on a small phone', () => {
    const LONG = 'THE WOMAN IN THE HOUSE ACROSS THE STREET FROM THE GIRL IN THE WINDOW'
    const answerSize = () => answerWords(LONG.split(' ').length)[0].fontSize
    let insets: jest.SpyInstance
    beforeEach(() => {
      // The module object itself (the app's manual mock): a namespace import would only spy a copy.
      insets = jest.spyOn(require('react-native-safe-area-context'), 'useSafeAreaInsets').mockReturnValue({ top: 333, bottom: 334, left: 0, right: 0 })
    })
    afterEach(() => insets.mockRestore())

    it('gives a long answer less room the more players there are, down to the floor', async () => {
      await renderDialog({ phrase: LONG, guessedLetters: [] })
      const solo = answerSize()

      await renderDialog({ phrase: LONG, guessedLetters: [], passAndPlay: summary({ standings: standings(2) }), onEndSession: jest.fn() })
      const twoPlayers = answerSize()

      await renderDialog({ phrase: LONG, guessedLetters: [], passAndPlay: summary({ standings: standings(8) }), onEndSession: jest.fn() })
      const eightPlayers = answerSize()

      expect(twoPlayers).toBeLessThan(solo)
      expect(eightPlayers).toBeLessThan(twoPlayers)
      expect(eightPlayers).toBe(20)
    })

    it('keeps a short answer at the headline size with a full table', async () => {
      await renderDialog({ passAndPlay: summary({ standings: standings(8) }), onEndSession: jest.fn() })

      expect(answerWords(1)[0].fontSize).toBe(40)
    })
  })
})

describe('fitAnswerFontSize', () => {
  const words = (phrase: string) => phrase.split(' ').map((word) => word.length)
  // A 375 x 667 phone: the card's inside is 279 wide, and on a pack win (progress row, no unlocks)
  // 667 less the 48 gutter, the card's 240 of chrome and the progress block's 62 leaves 317.
  const longest = words('THE WOMAN IN THE HOUSE ACROSS THE STREET FROM THE GIRL IN THE WINDOW')

  it("shrinks the longest catalog answer to fit a small phone's card without scrolling", () => {
    const fontSize = fitAnswerFontSize(longest, 279, 317)
    const lines = (size: number) => {
      // The same greedy wrap the card's row does, at the 16 word gap.
      let count = 1
      let width = 0
      for (const letters of longest) {
        const wordWidth = sketchWordWidth(letters, size)
        if (width > 0 && width + 16 + wordWidth > 279) {
          count++
          width = wordWidth
        } else width += (width > 0 ? 16 : 0) + wordWidth
      }
      return count
    }
    const height = (size: number) => lines(size) * size + (lines(size) - 1) * size * 0.2

    expect(fontSize).toBeGreaterThan(20)
    expect(height(fontSize)).toBeLessThanOrEqual(317)
    // And it's the largest size that does.
    expect(height(fontSize + 1)).toBeGreaterThan(317)
  })

  it('stops shrinking for height at 20 and lets the card scroll instead', () => {
    expect(fitAnswerFontSize(longest, 279, 50)).toBe(20)
  })

  it('lets width win below that floor, so a very long word still fits whole', () => {
    const fontSize = fitAnswerFontSize([34], 279, 1000)

    expect(sketchWordWidth(34, fontSize)).toBeLessThanOrEqual(279)
    expect(sketchWordWidth(34, fontSize + 1)).toBeGreaterThan(279)
    expect(fontSize).toBeLessThan(20)
  })
})
