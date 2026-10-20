import { type AutoPaperTheme, Provider as AutoPaperProvider, useAutoPaperTheme } from '@rific/auto-paper'
import { FeedbackPressProvider } from '@rific/feedback-press'
import { BURST_LIFETIME_MS, MAX_BURST_INTERVAL_MS } from '@tastic/sprites/fireworks'
import { act, cleanup, fireEvent, render as rtlRender } from '@testing-library/react-native'
import * as haptics from 'expo-haptics'
import { type ReactElement, type ReactNode, useEffect } from 'react'
import { Platform, StyleSheet, Text } from 'react-native'
import * as RNPaper from 'react-native-paper'
import { PaperProvider } from 'react-native-paper'

import { Game, WIN_DIALOG_DELAY_MS } from '@/components/Game'
import type { GameMode } from '@/types/gameModes'

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' }
}))

const mockNotificationAsync = jest.mocked(haptics.notificationAsync)

// RoundEndDialog's card (@tastic/hud's OverlayBackdrop and OverlayCard) always renders through
// react-native-paper's Portal, whatever the Blur setting, so it needs a Portal.Host ancestor:
// normally @rific/auto-paper's Provider at the app root. Wrapping with PaperProvider here supplies
// that same Portal.Host without pulling in the rest of the app's Redux/persist provider stack.
// FeedbackPressProvider paper={RNPaper} is required too - @rific/feedback-press no longer
// auto-detects react-native-paper (see Haptic.tsx's own comment on this), so without it every
// Button/IconButton Game.tsx renders (the keyboard, the hint/pack pill, RoundEndDialog's own
// buttons) falls back to a bare, unstyled Pressable that ignores the themed labelStyle/
// accessibilityLabel props those all rely on. It has to wrap PaperProvider, not nest inside it -
// PaperProvider's PortalHost mounts near its own root (same reasoning Providers.tsx gives for
// hoisting the real app's Haptic above Theme), so RoundEndDialog's Portal-rendered buttons only
// see FeedbackPressProvider's context if it's an ancestor of PaperProvider.
const Wrapper = ({ children }: { children: ReactNode }) => (
  <FeedbackPressProvider paper={RNPaper}>
    <PaperProvider>{children}</PaperProvider>
  </FeedbackPressProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

// danger/onDanger (Keyboard's own wrong-guess color, see Keyboard.tsx) only exist on a theme
// @rific/auto-paper's Provider actually computed - render's own bare PaperProvider fallback
// (MD3LightTheme) doesn't have them, same reasoning LoadoutScreen.test.tsx's own
// renderLoadoutWithTheme gives for its difficulty-color tests.
let capturedTheme: AutoPaperTheme | null = null
const ThemeCapture = () => {
  const theme = useAutoPaperTheme()
  useEffect(() => {
    capturedTheme = theme
  }, [theme])
  return null
}
const renderWithRealTheme = async (ui: ReactElement) => {
  capturedTheme = null
  const utils = await rtlRender(
    <FeedbackPressProvider paper={RNPaper}>
      <AutoPaperProvider initialValue={{ appearance: 'light' }}>
        <ThemeCapture />
        {ui}
      </AutoPaperProvider>
    </FeedbackPressProvider>
  )
  return { ...utils, theme: capturedTheme! }
}

// A mode with a tiny mistake budget so loss tests don't need six wrong guesses.
const shortMode: GameMode = {
  id: 'test-short',
  label: 'Test Short',
  description: 'A test mode with a low mistake limit',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 2,
  Visual: (() => null) as unknown as GameMode['Visual']
}

// Two more fixtures, used together to test a live mode swap mid-round (the player picking a new
// art style from the loadout while a round is already in progress - see LoadoutScreen's
// handleSelectMode, which moves the saved round onto the new art with roundActions.setRoundArt). Different maxMistakes from each other so a swap's effect on the mistake limit is
// unambiguous, and different hasVisual so the layout change itself is also observable.
const roomyVisualMode: GameMode = {
  id: 'test-roomy-visual',
  label: 'Test Roomy Visual',
  description: 'A test mode with a generous mistake limit and artwork',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 3,
  Visual: (() => null) as unknown as GameMode['Visual']
}
const tightNoVisualMode: GameMode = {
  id: 'test-tight-no-visual',
  label: 'Test Tight No Visual',
  description: 'A test mode with a tighter mistake limit and no artwork',
  category: 'minimal',
  behavior: 'none',
  maxMistakes: 1,
  hasVisual: false,
  Visual: (() => null) as unknown as GameMode['Visual']
}
// A no-artwork mode with room for more than one wrong guess - unlike tightNoVisualMode above
// (maxMistakes: 1, which the loss/round-swap tests need for a single fatal guess), this one needs
// to stay mechanically alive through a correct guess and a wrong one without ending the round.
const roomyNoVisualMode: GameMode = {
  id: 'test-roomy-no-visual',
  label: 'Test Roomy No Visual',
  description: 'A test mode with a generous mistake limit and no artwork',
  category: 'minimal',
  behavior: 'none',
  maxMistakes: 3,
  hasVisual: false,
  Visual: (() => null) as unknown as GameMode['Visual']
}

// Renders the exact `mistakes` value it was handed, queryable via testID - every real mode's
// Visual (classic.tsx, stars.tsx, etc.) independently clamps `mistakes` against its OWN stage
// count, so this fixture stands in for "some real mode's artwork" without depending on any one
// mode's specific stage math.
const RecordingVisual = (props: { mistakes: number; color: string }) => <Text testID='visual-mistakes'>{props.mistakes}</Text>
const roomyRecordingMode: GameMode = {
  id: 'test-roomy-recording',
  label: 'Test Roomy Recording',
  description: 'A test mode with a generous mistake limit whose artwork records what it was given',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 8,
  Visual: RecordingVisual
}
const tightRecordingMode: GameMode = {
  id: 'test-tight-recording',
  label: 'Test Tight Recording',
  description: 'A test mode with a tighter mistake limit whose artwork records what it was given',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: RecordingVisual
}
// A one-mistake mode with a recording Visual - a single wrong guess is both the fatal guess and
// the round's own maxMistakes, so it's the fastest way to observe the exact render where the round
// is decided but the (deliberately delayed) loss dialog hasn't appeared yet.
const tinyRecordingMode: GameMode = {
  id: 'test-tiny-recording',
  label: 'Test Tiny Recording',
  description: 'A test mode with a one-mistake limit whose artwork records what it was given',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 1,
  Visual: RecordingVisual
}
// GameVisual mounts unconditionally (see its own comment), and PuzzleStage no longer fades itself
// in (see its own onReadyChange comment - Game.tsx owns the one whole-screen curtain now instead),
// but a test asserting on visual-area's computed height still needs this fired first, since that
// height is derived from this measurement regardless of whether anything is currently visible.
const ART_AND_WORD_AREA_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } } }
// The width the word row is ALLOWED (an ordinary phone's screen width), not the width of the
// letters inside it - see the shrink-to-fit tests below for why that distinction is the whole bug.
const WORD_ROW_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 40 } } }
// What Keyboard.tsx's own onLayout reports for its outer container - feeds keyWidth, and (since
// Game.test.tsx) whether Game's own combined gameReady gate has this half of it yet.
const KEYBOARD_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 160 } } }

type GetByText = Awaited<ReturnType<typeof render>>['getByText']
type Root = Awaited<ReturnType<typeof render>>['root']

const guessLetter = async (getByText: GetByText, letter: string) => {
  await fireEvent.press(getByText(letter))
}

// Letters render joined by non-breaking spaces, not regular ones (see Game.tsx's guessWords) - a
// plain ' '.join equivalent here would silently never match the rendered text.

const FIREWORKS_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 480 } } }

// Fireworks only starts its onComplete timer once it has received a real layout size (see
// src/effects/fireworks.tsx) - in the app this happens automatically once RN measures the
// view, but the test renderer never fires layout events on its own, so the win path would
// otherwise hang forever waiting for the celebration to finish. It's the only node in Game's
// tree styled with pointerEvents: 'none' (a bare `pointerEvents` prop there would trip the same
// "props.pointerEvents is deprecated" warning fireworks.tsx itself was just fixed to avoid), so
// that's how we find it. style is an array (StyleSheet.absoluteFill plus its own inert style),
// not a single object, so every entry needs checking rather than just the last one.
const isFireworksView = (node: { props: { style?: unknown } }): boolean => {
  const style = node.props.style
  const entries = Array.isArray(style) ? style : [style]
  return entries.some((entry) => Boolean(entry) && typeof entry === 'object' && (entry as { pointerEvents?: string }).pointerEvents === 'none')
}

const fireFireworksLayout = async (root: Root) => {
  const [fireworksView] = root!.queryAll(isFireworksView)
  await fireEvent(fireworksView, 'layout', FIREWORKS_LAYOUT_EVENT)
}

describe('Game', () => {
  beforeEach(() => {
    mockNotificationAsync.mockClear()
  })

  it('renders a short phrase with the correct number of blanks and 0 wrong guesses', async () => {
    const { getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    const display = getByLabelText('Secret word display')
    expect(display.props.children[0].props.letters).toEqual(['_', '_', '_'])
    expect(getByLabelText(/Wrong guesses: 0/)).toBeTruthy()
  })

  it('reveals a correctly guessed letter without incrementing wrong guesses', async () => {
    const { getByLabelText, getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'A')

    const display = getByLabelText('Secret word display')
    expect(display.props.children[0].props.letters).toEqual(['_', 'A', '_'])
    expect(getByLabelText(/Wrong guesses: 0/)).toBeTruthy()
  })

  it('increments wrong guesses by one for a wrong letter, and ignores a repeated wrong guess', async () => {
    const { getByLabelText, getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'Q')
    expect(getByLabelText(/Wrong guesses: 1/)).toBeTruthy()

    await guessLetter(getByText, 'Q')
    expect(getByLabelText(/Wrong guesses: 1/)).toBeTruthy()
  })

  it('gives a wrong guess a distinct error haptic, not the same feedback a correct guess gets', async () => {
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'Q')

    expect(mockNotificationAsync).toHaveBeenCalledWith(haptics.NotificationFeedbackType.Error)
  })

  // Otherwise a wrong letter is indistinguishable from a right one on the keyboard once
  // guessed - both just went disabled - so there was no way to look back and tell which specific
  // guesses were wrong (see Keyboard.tsx's own comment on why buttonColor/textColor alone can't
  // do this while disabled).
  // A single wrong guess gets the quieter dangerContainer/onDangerContainer tone, not the full
  // danger/onDanger one - that's reserved for the loss cascade once the whole round ends (see
  // Keyboard.tsx's own comment on the two-tier distinction).
  it("colors a wrong-guessed key's label with the theme's onDangerContainer role, leaving a correctly-guessed key's label unchanged", async () => {
    const { getByText, theme } = await renderWithRealTheme(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'Q')

    expect(StyleSheet.flatten(getByText('Q').props.style).color).toBe(theme.colors.onDangerContainer)
    expect(StyleSheet.flatten(getByText('C').props.style).color).not.toBe(theme.colors.onDangerContainer)
  })

  // Jay, 2026-10-20: Letters Only's own big lettered pips, in the artwork's slot, took the room its
  // letters needed. It has the same small pip row as every art now, and no artwork box at all, so the
  // word has the whole area.
  it('gives Letters Only the same pip row as every art, filling a dot per wrong guess, and no artwork box', async () => {
    const { getByText, getByTestId, queryByTestId } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={roomyNoVisualMode} />)
    const filled = (index: number) => getByTestId(`pip-${index}`).props.children.props.children[1] !== null

    expect(queryByTestId('visual-area')).toBeNull()
    expect(queryByTestId('pip-3')).toBeNull()

    await guessLetter(getByText, 'C')
    expect(filled(0)).toBe(false)

    await guessLetter(getByText, 'Q')
    expect([0, 1, 2].map(filled)).toEqual([true, false, false])
  })

  it('triggers a loss once wrong guesses reach the mode maxMistakes, showing a dialog that calls onStop when dismissed', async () => {
    const onStop = jest.fn()
    const { getByText, findByText } = await render(<Game phrase='CAT' onStop={onStop} mode={shortMode} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    expect(await findByText('You Lost!')).toBeTruthy()
    expect(onStop).not.toHaveBeenCalled()

    await fireEvent.press(getByText('Next'))

    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('calls onLost once wrong guesses reach the mode maxMistakes, reporting the final wrong-guess and total-guess counts', async () => {
    const onLost = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} onLost={onLost} mode={shortMode} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    expect(onLost).toHaveBeenCalledTimes(1)
    expect(onLost).toHaveBeenCalledWith({ wrongGuesses: 2, guessCount: 2 })
  })

  it('triggers a win once every letter has been guessed, starting the celebration immediately but holding RoundEndDialog back for WIN_DIALOG_DELAY_MS, and calls onStop when dismissed', async () => {
    jest.useFakeTimers()
    const onStop = jest.fn()
    const onSolved = jest.fn()
    const { getByText, queryByText, root } = await render(<Game phrase='CAT' onStop={onStop} onSolved={onSolved} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(onSolved).toHaveBeenCalledWith({ wrongGuesses: 0, hintRevealed: false, guessCount: 3 })
    // The celebration starts the instant the round is won...
    const [fireworksView] = root!.queryAll(isFireworksView)
    expect(fireworksView).toBeTruthy()
    // ...but the dialog itself waits (see Game.tsx's WIN_DIALOG_DELAY_MS), so it doesn't cut the
    // moment off the instant the last letter lands.
    expect(queryByText('You Won!')).toBeNull()

    await fireFireworksLayout(root)
    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    expect(getByText('You Won!')).toBeTruthy()

    await fireEvent.press(getByText('Next'))

    expect(onStop).toHaveBeenCalledTimes(1)

    jest.useRealTimers()
  })

  // A shared-link puzzle's Next leaves for the loadout instead of drawing a new round (GameScreen's
  // SoloRound), and the web keeps a left screen mounted, so nothing remounts this Game: the card and
  // the fireworks have to go away on their own.
  it('takes the card and the celebration down on Next even when the round is not replaced', async () => {
    jest.useFakeTimers()
    const onStop = jest.fn()
    const { getByText, queryByText, root } = await render(<Game phrase='CAT' onStop={onStop} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')
    await fireFireworksLayout(root)
    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })
    expect(getByText('You Won!')).toBeTruthy()

    await fireEvent.press(getByText('Next'))

    expect(onStop).toHaveBeenCalledTimes(1)
    expect(queryByText('You Won!')).toBeNull()
    expect(root!.queryAll(isFireworksView)).toHaveLength(0)

    jest.useRealTimers()
  })

  it('gives the winning guess a distinct success haptic, timed with the celebration starting rather than waiting on the dialog', async () => {
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    expect(mockNotificationAsync).not.toHaveBeenCalledWith(haptics.NotificationFeedbackType.Success)

    await guessLetter(getByText, 'T')

    expect(mockNotificationAsync).toHaveBeenCalledWith(haptics.NotificationFeedbackType.Success)
  })

  it('fires no haptic at all, for a wrong guess, a correct one or the win, while Vibrate is off', async () => {
    const VibrateOffWrapper = ({ children }: { children: ReactNode }) => (
      <FeedbackPressProvider paper={RNPaper} initialValue={{ vibrate: false }}>
        <PaperProvider>{children}</PaperProvider>
      </FeedbackPressProvider>
    )
    const mockImpactAsync = jest.mocked(haptics.impactAsync)
    mockImpactAsync.mockClear()
    const { getByText } = await rtlRender(<Game phrase='CAT' onStop={jest.fn()} />, { wrapper: VibrateOffWrapper })

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(mockNotificationAsync).not.toHaveBeenCalled()
    expect(mockImpactAsync).not.toHaveBeenCalled()
  })

  it('keeps the celebration effect spawning bursts for as long as the win dialog stays open', async () => {
    jest.useFakeTimers()
    const { getByText, root } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    await fireFireworksLayout(root)
    expect(root!.queryAll((node) => node.type === 'Circle').length).toBeGreaterThan(0)

    // Advance well past several burst spawn+fade cycles - the win dialog (verified in the sibling
    // win test above) is still open the whole time, so the celebration should keep producing new
    // bursts rather than dying out after the first one.
    await act(async () => {
      jest.advanceTimersByTime((MAX_BURST_INTERVAL_MS + BURST_LIFETIME_MS) * 4)
    })

    expect(root!.queryAll((node) => node.type === 'Circle').length).toBeGreaterThan(0)

    jest.useRealTimers()
  })

  it('shows the category progress on a win when provided', async () => {
    jest.useFakeTimers()
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} categoryProgress={{ label: 'Animals', unlockedCount: 4, totalCount: 10 }} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    expect(getByText('4 of 10 unlocked in Animals')).toBeTruthy()

    jest.useRealTimers()
  })

  it('omits category progress on a loss even when provided', async () => {
    const { getByText, findByText, queryByText } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={shortMode} categoryProgress={{ label: 'Animals', unlockedCount: 4, totalCount: 10 }} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    expect(await findByText('You Lost!')).toBeTruthy()
    expect(queryByText(/unlocked in Animals/)).toBeNull()
  })

  it('reports the wrong-guess count and hint-revealed state to onSolved', async () => {
    const onSolved = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} onSolved={onSolved} hint='A furry pet' />)

    await guessLetter(getByText, 'Q')
    await fireEvent.press(getByText('Hint'))
    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(onSolved).toHaveBeenCalledWith({ wrongGuesses: 1, hintRevealed: true, guessCount: 4 })
  })

  it('hides the hint behind a reveal button until pressed, and omits both when no hint is provided', async () => {
    const { getByText, queryByText, rerender } = await render(<Game phrase='CAT' onStop={jest.fn()} hint='A furry pet' />)

    expect(queryByText('A furry pet')).toBeNull()

    await fireEvent.press(getByText('Hint'))
    expect(getByText('A furry pet')).toBeTruthy()

    await rerender(<Game phrase='CAT' onStop={jest.fn()} />)

    expect(queryByText('Hint')).toBeNull()
    expect(queryByText('A furry pet')).toBeNull()
  })

  it('shows the difficulty badge immediately, side by side with the hint reveal control', async () => {
    const { getByText, getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} hint='Drama · 1994' packLabel='Movies' difficultyTier='hard' />)

    expect(getByText('Hard')).toBeTruthy()
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
    expect(getByText('Hint')).toBeTruthy()
  })

  it('does not count peeking at the always-visible difficulty badge as revealing the hint', async () => {
    const onSolved = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} onSolved={onSolved} hint='Drama · 1994' packLabel='Movies' difficultyTier='hard' />)

    // Difficulty is visible without any reveal action - glancing at it isn't "using a hint" for
    // achievement purposes (see achievements.ts's no_hints achievement), unlike pressing "Hint".
    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(onSolved).toHaveBeenCalledWith({ wrongGuesses: 0, hintRevealed: false, guessCount: 3 })
  })

  it('reveals the pack and hint together as their own pill, splitting a "<Group> <Specific>" pack label on "|"', async () => {
    const { getByText, queryByText, getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} hint='Wikipedia category' packLabel='Theme Superheroes' difficultyTier='easy' />)

    expect(queryByText(/Theme/)).toBeNull()

    await fireEvent.press(getByText('Hint'))

    expect(getByText('Theme | Superheroes  |  Wikipedia category')).toBeTruthy()
    expect(getByLabelText('Theme | Superheroes. Wikipedia category')).toBeTruthy()
  })

  it('fills the hint pill with tertiary and draws its label in onTertiary, so the text never sits tertiary-on-surface', async () => {
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} hint='A furry pet' />)

    const label = getByText('Hint')
    const labelColor = StyleSheet.flatten(label.props.style).color
    // tertiary is derived from the player's chosen accent, and at the pale end of that range
    // (yellows especially) tertiary text on the surface washes out. onTertiary is the palette's
    // guaranteed-legible partner for a tertiary fill, so the two must not be the same color here.
    const pill = label.parent!.parent!
    const pillBackground = StyleSheet.flatten(pill.props.style).backgroundColor
    expect(pillBackground).toBeTruthy()
    expect(labelColor).toBeTruthy()
    expect(labelColor).not.toBe(pillBackground)
  })

  it('reveals just the difficulty badge when there is no pack label or derived hint to go with it', async () => {
    const { getByText, queryByText } = await render(<Game phrase='CAT' onStop={jest.fn()} difficultyTier='easy' />)

    expect(getByText('Easy')).toBeTruthy()
    expect(queryByText('Hint')).toBeNull()
  })

  it('leaves a word that comfortably fits at its full size, and stretches the row so its own letters can never drive the measurement', async () => {
    const { getByLabelText } = await render(<Game phrase='DINOSAUR' onStop={jest.fn()} />)

    const display = getByLabelText('Secret word display')
    // Wider than WORD_ROW_LAYOUT_EVENT on purpose: 8 letters comfortably beats even a 390pt row's
    // width fit (see the shrink test below), so a 390pt row is no longer "nowhere near too wide"
    // once WORD_FONT_SIZE itself can grow past what that width allows - this uses a row wide enough
    // that the base size, not the width fit, is what ends up binding.
    await fireEvent(display, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 500, height: 40 } } })

    // Nowhere near too wide for a 500pt row, so nothing should shrink below the base size.
    expect(display.props.children[0].props.fontSize).toBe(42)
    // The structural half of the fix: the row spans its parent instead of hugging its letters.
    // Without this, onLayout reports the width of the text the fitted size just produced, and
    // because MONOSPACE_CHAR_WIDTH_RATIO overstates a real monospace advance to leave slack, each
    // layout pass measures ~3% narrower than the last - ratcheting even a short word all the way
    // down to MIN_WORD_FONT_SIZE. RN's layout doesn't run under the test renderer, so the loop
    // can't be driven here directly; asserting the style is what pins it.
    expect(StyleSheet.flatten(display.props.style).alignSelf).toBe('stretch')
  })

  it('shrinks only a word genuinely too wide for the row, measuring against the padded width so it stops short of the edges', async () => {
    const { getByLabelText, rerender } = await render(<Game phrase='HIPPOPOTAMUS' onStop={jest.fn()} />)

    const display = getByLabelText('Secret word display')
    await fireEvent(display, 'layout', WORD_ROW_LAYOUT_EVENT)

    // Every letter (or blank) renders in the same CELL_WIDTH cell (see SketchWord's own comment on
    // why cells are uniform rather than each letter's real width), so this is a plain character
    // count again - 12 letters occupy 12 cells and 11 gaps. That really is wider than a 390pt row
    // at the base 30pt, so it has to come down. PuzzleStage approximates glyphHeight ≈ fontSize *
    // 0.88 (see its own HERSHEY_HEIGHT_RATIO comment - not exported, so mirrored here) against the
    // row's PADDED inner width (390 - 2 * 12) rather than the raw measurement, which is what keeps
    // the longest line from grazing the screen edges.
    const fitted = display.props.children[0].props.fontSize
    const cellsWidthAt100 = 12 * 110 + 11 * 20
    expect(fitted).toBe(Math.floor((390 - 24) / ((cellsWidthAt100 / 100) * 0.88)))
    // Landing strictly between the floor and the base is what makes the assertion above meaningful:
    // a word long enough to clamp at MIN_WORD_FONT_SIZE would produce the same number whether or
    // not the padding were subtracted at all.
    expect(fitted).toBeGreaterThan(16)
    expect(fitted).toBeLessThan(30)

    // A word too long to fit even at the smallest usable size stops at the floor rather than
    // dwindling to something unreadable.
    await rerender(<Game phrase='ANTIDISESTABLISHMENTARIANISM' onStop={jest.fn()} />)
    const longDisplay = getByLabelText('Secret word display')
    await fireEvent(longDisplay, 'layout', WORD_ROW_LAYOUT_EVENT)
    expect(longDisplay.props.children[0].props.fontSize).toBe(16)
  })

  // Reported from a real device, twice, in two different shapes: first the word row rendered
  // immediately at whatever position art-and-word-area's own flex fallback implied, then visibly
  // snapped to its real position once art-and-word-area's own onLayout resolved (a fade wrapped
  // around the artwork alone never touched the word row, since it was never part of it). Then,
  // separately, every keyboard key rendered unconstrained until Keyboard's own onLayout resolved,
  // then all ~26 snapped to their final uniform width - on top of a screen where the artwork/word
  // area had *already* finished its own, independently-timed reveal, and the difficulty pill and
  // wrong-guess pips had been fully visible from the start. Fixing the artwork/word area alone (see
  // PuzzleStage's own stageReady comment) still left the keyboard popping in on its own schedule.
  // The real fix is one curtain over the whole screen (see Game.tsx's own gameReady comment) that
  // doesn't lift until EVERY measured piece - art-and-word-area's own box, the word row, and the
  // keyboard's own key width - has landed, so this checks that any two of the three measured
  // landing still isn't enough on its own to reveal anything. The fade itself is Reanimated-driven,
  // and (same reasoning as the keyboard ripple's own test) this project's react-native-reanimated
  // mock (see jest.setup.ts) resolves withTiming synchronously with no re-render to reflect it in
  // rendered output, so whether it actually fades smoothly on a real device is a visual/manual
  // check, not a unit-testable one - what's actually being protected here is that nothing shows up
  // at the wrong size or position first.
  it('keeps the whole game screen hidden until the artwork box, the word row, and the keyboard have all reported a real measurement', async () => {
    const { getByTestId, getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)
    const gameOpacity = () => StyleSheet.flatten(getByTestId('game-container').props.style).opacity

    expect(gameOpacity()).toBe(0)

    // Two of the three measured - the keyboard's own key width hasn't landed yet, so still hidden,
    // or the keyboard would already be visible at its pre-measurement, unconstrained key sizes.
    await fireEvent(getByTestId('art-and-word-area'), 'layout', ART_AND_WORD_AREA_LAYOUT_EVENT)
    await fireEvent(getByLabelText('Secret word display'), 'layout', WORD_ROW_LAYOUT_EVENT)
    expect(gameOpacity()).toBe(0)

    // And a different two of the three, on a fresh mount: the keyboard and the word row measured,
    // but art-and-word-area's own box still unknown.
    const { getByTestId: getByTestId2, getByLabelText: getByLabelText2 } = await render(<Game phrase='CAT' onStop={jest.fn()} />)
    await fireEvent(getByTestId2('keyboard'), 'layout', KEYBOARD_LAYOUT_EVENT)
    await fireEvent(getByLabelText2('Secret word display'), 'layout', WORD_ROW_LAYOUT_EVENT)
    expect(StyleSheet.flatten(getByTestId2('game-container').props.style).opacity).toBe(0)
  })

  it("reserves room for a multi-line word row instead of letting the artwork's square cap crowd it out", async () => {
    // Reported from a real device: a multi-word phrase wrapped onto several lines and visibly
    // overlapped the wrong-guess pips and artwork below it. Root cause - the artwork's height was
    // capped at min(combined width, combined height) alone, with no accounting for how tall the
    // word row itself actually needed to be; nothing clips an overflowing child in RN, so on a
    // device where the combined area isn't much taller than it is wide (a big keyboard, a small
    // screen), the artwork could claim nearly the whole thing and the wrapped word text spilled out
    // past its own box into whatever renders after it.
    const { getByLabelText, getByTestId } = await render(<Game phrase='A STITCH IN TIME SAVES NINE' onStop={jest.fn()} />)

    // A combined area that's roughly square - width and height close enough together that the old
    // min(width, height) formula would hand the artwork nearly the WHOLE thing, leaving the word
    // row almost nothing.
    await fireEvent(getByTestId('art-and-word-area'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } } })
    // What the word row's own onLayout reports once several wrapped lines are actually measured.
    await fireEvent(getByLabelText('Secret word display'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 150 } } })

    // The artwork must shrink to leave the word row's own measured height (plus its marginBottom)
    // available, not just whatever min(width, height) alone would have allowed.
    const visualAreaStyle = StyleSheet.flatten(getByTestId('visual-area').props.style)
    expect(visualAreaStyle.height).toBe(400 - (150 + 12))
  })

  it('switches art style immediately on a live mode prop change, without resetting guessed letters or wrong guesses', async () => {
    const { getByText, getByLabelText, rerender } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={roomyVisualMode} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'Q')

    const displayBefore = getByLabelText('Secret word display')
    expect(displayBefore.props.children[0].props.letters).toEqual(['C', '_', '_'])
    expect(getByLabelText('Wrong guesses: 1 of 3 (Q)')).toBeTruthy()
    // hasVisual defaults true, and the letter display uses the smaller of the two font sizes
    // reserved for it (see Game.tsx's WORD_FONT_SIZE) while there's still room for artwork.
    expect(displayBefore.props.children[0].props.fontSize).toBe(42)

    // Simulates an art pick from the loadout reaching the board mid-round (LoadoutScreen's
    // handleSelectMode saves it on the round, and GameScreen's SavedBoard passes it down) - the same
    // Game instance, just a new mode prop, not a remount.
    await rerender(<Game phrase='CAT' onStop={jest.fn()} mode={tightNoVisualMode} />)

    const displayAfter = getByLabelText('Secret word display')
    expect(displayAfter.props.children[0].props.letters).toEqual(['C', '_', '_'])
    expect(getByLabelText('Wrong guesses: 1 of 3 (Q)')).toBeTruthy()
    // The new mode has hasVisual: false, which enlarges the letter display to fill the space
    // artwork would have used (see Game.tsx's WORD_FONT_SIZE_LARGE) - reflected the instant the
    // mode prop changes, with no further interaction needed.
    expect(displayAfter.props.children[0].props.fontSize).toBe(80)
  })

  it("keeps the round's mistake limit fixed at whatever mode it started with, even after a live mode swap to a mode with a different maxMistakes", async () => {
    const { getByText, queryByText, findByText, rerender } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={roomyVisualMode} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    // 2 wrong guesses already - at or past tightNoVisualMode's own maxMistakes (1), but the round
    // started under roomyVisualMode (maxMistakes 3), so swapping mid-round must not retroactively
    // end it just because the new mode's limit would already have been exceeded.
    await rerender(<Game phrase='CAT' onStop={jest.fn()} mode={tightNoVisualMode} />)
    expect(queryByText('You Lost!')).toBeNull()

    // The round is still governed by the ORIGINAL mode's limit (3) - one more wrong guess reaches
    // it and the round ends now, not one guess ago and not never.
    await guessLetter(getByText, 'Z')
    expect(await findByText('You Lost!')).toBeTruthy()
  })

  it("caps the mistakes handed to the current mode's own artwork one stage short of its maximum while the round is still mechanically alive, even after a live mode swap crosses a maxMistakes boundary", async () => {
    const { getByText, getByTestId, queryByText, findByText, rerender } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={roomyRecordingMode} />)

    // 7 of roomyRecordingMode's 8 allowed mistakes - the round is still mechanically alive.
    for (const letter of ['Q', 'W', 'E', 'R', 'Y', 'U', 'I']) {
      await guessLetter(getByText, letter)
    }
    expect(getByTestId('visual-mistakes').props.children).toBe(7)

    // Live-swap to a mode with a SMALLER maxMistakes (6) than the round's frozen limit (8) - the
    // same interaction an art pick from the loadout drives (see LoadoutScreen's handleSelectMode).
    // Without a cap this would hand the new mode's artwork mistakes=7 - at or past ITS OWN
    // maxMistakes (6), which every real mode's Visual treats as its own fully-"lost" stage (see
    // e.g. classic.tsx's `Math.min(mistakes, PARTS.length)`) - even though the round hasn't
    // actually ended.
    await rerender(<Game phrase='CAT' onStop={jest.fn()} mode={tightRecordingMode} />)

    expect(getByTestId('visual-mistakes').props.children).toBe(5)
    expect(queryByText('You Lost!')).toBeNull()

    // One more wrong guess reaches the round's real, frozen limit (8) and the round actually ends
    // - the cap lifts, and the now-active mode's own true maximum (6) is what shows, appropriately,
    // since the round really is over at this point.
    await guessLetter(getByText, 'O')
    expect(await findByText('You Lost!')).toBeTruthy()
    expect(getByTestId('visual-mistakes').props.children).toBe(6)
  })

  it("shows the current mode's own full terminal stage the instant the fatal wrong guess lands, without waiting for the loss dialog's deliberate delay", async () => {
    const { getByText, getByTestId, queryByText } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={tinyRecordingMode} />)

    await guessLetter(getByText, 'Q')

    // The loss dialog is deliberately shown 450ms late (see Game.tsx's lossTimeoutRef, "so the
    // final stage has time to draw before the loss dialog interrupts") - the artwork itself must
    // not be the thing waiting on that delay, or the "final stage" it's supposed to have time to
    // draw would still be one stage short for the entire pause.
    expect(queryByText('You Lost!')).toBeNull()
    expect(getByTestId('visual-mistakes').props.children).toBe(1)
  })
})

// Game listens for physical letter keys on window, web only. The listener hears every keystroke on
// the page, so it has to skip shortcuts and anything typed into a text field. window's add/remove
// are swapped for stubs that capture the latest keydown listener (the effect re-subscribes on every
// render), and the captured listener is called with plain event-shaped objects.
describe('Game physical keyboard (web)', () => {
  type KeyEventInit = { key: string; target?: unknown; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }
  let keydown: ((event: KeyboardEvent) => void) | null = null
  const originalOS = Platform.OS
  const originalAdd = window.addEventListener
  const originalRemove = window.removeEventListener

  beforeEach(() => {
    keydown = null
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
    window.addEventListener = ((type: string, listener: (event: KeyboardEvent) => void) => {
      if (type === 'keydown') keydown = listener
    }) as typeof window.addEventListener
    window.removeEventListener = (() => {}) as typeof window.removeEventListener
  })

  afterEach(async () => {
    // Unmount now, while the stubs are still installed: RNTL's own automatic cleanup runs after this
    // hook, and the effect's teardown calls window.removeEventListener, which doesn't exist here.
    await cleanup()
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS })
    window.addEventListener = originalAdd
    window.removeEventListener = originalRemove
  })

  const pressKey = async (init: KeyEventInit) => {
    await act(async () => {
      keydown?.({ metaKey: false, ctrlKey: false, altKey: false, target: null, ...init } as unknown as KeyboardEvent)
    })
  }

  const revealedLetters = (getByLabelText: Awaited<ReturnType<typeof render>>['getByLabelText']): string[] => getByLabelText('Secret word display').props.children[0].props.letters

  it('guesses a letter pressed with nothing focused', async () => {
    const { getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await pressKey({ key: 'a' })

    expect(revealedLetters(getByLabelText)).toEqual(['_', 'A', '_'])
  })

  it('ignores a letter typed into a text field, or pressed as part of a Cmd, Ctrl or Alt shortcut', async () => {
    const { getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await pressKey({ key: 'a', target: { tagName: 'INPUT' } })
    await pressKey({ key: 'a', target: { tagName: 'TEXTAREA' } })
    await pressKey({ key: 'a', target: { tagName: 'DIV', isContentEditable: true } })
    await pressKey({ key: 'c', metaKey: true })
    await pressKey({ key: 'c', ctrlKey: true })
    await pressKey({ key: 't', altKey: true })

    expect(revealedLetters(getByLabelText)).toEqual(['_', '_', '_'])
    expect(getByLabelText(/Wrong guesses: 0/)).toBeTruthy()
  })

  it('ignores letter keys while locked (GameScreen locks Game behind Settings and while unfocused)', async () => {
    const { getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} locked />)

    await pressKey({ key: 'a' })
    await pressKey({ key: 'z' })

    expect(revealedLetters(getByLabelText)).toEqual(['_', '_', '_'])
    expect(getByLabelText(/Wrong guesses: 0/)).toBeTruthy()
  })
})
