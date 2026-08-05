import { act, fireEvent, render as rtlRender } from '@testing-library/react-native'
import * as haptics from 'expo-haptics'
import type { ReactElement } from 'react'
import { StyleSheet, Text } from 'react-native'
import { PaperProvider } from 'react-native-paper'

import { Game, WIN_DIALOG_DELAY_MS } from '@/components/Game'
import { BURST_LIFETIME_MS, MAX_BURST_INTERVAL_MS } from '@/effects/fireworks'
import type { GameMode } from '@/types/gameModes'

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' }
}))

const mockNotificationAsync = jest.mocked(haptics.notificationAsync)

// RoundEndDialog's Dialog defaults to the blurred/Portal-based rendering path (the app-wide
// blur setting defaults to true), which requires a react-native-paper Portal.Host ancestor —
// normally supplied by @rific/auto-paper's Provider at the app root. Wrapping with PaperProvider
// here supplies that same Portal.Host without pulling in the rest of the app's Redux/persist
// provider stack.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: PaperProvider })

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
// art style from the drawer while a round is already in progress — see PuzzleDrawer's
// onModeChange). Different maxMistakes from each other so a swap's effect on the mistake limit is
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

// Renders the exact `mistakes` value it was handed, queryable via testID — every real mode's
// Visual (classic.tsx, stars.tsx, etc.) independently clamps `mistakes` against its OWN stage
// count, so this fixture stands in for "some real mode's artwork" without depending on any one
// mode's specific stage math.
const RecordingVisual = (props: { mistakes: number; color: string; width: number; height: number }) => <Text testID='visual-mistakes'>{props.mistakes}</Text>
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
// A one-mistake mode with a recording Visual — a single wrong guess is both the fatal guess and
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
const VISUAL_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 200 } } }
// The width the word row is ALLOWED (an ordinary phone's screen width), not the width of the
// letters inside it — see the shrink-to-fit tests below for why that distinction is the whole bug.
const WORD_ROW_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 40 } } }

type GetByText = Awaited<ReturnType<typeof render>>['getByText']
type Root = Awaited<ReturnType<typeof render>>['root']

const guessLetter = async (getByText: GetByText, letter: string) => {
  await fireEvent.press(getByText(letter))
}

// Letters render joined by non-breaking spaces, not regular ones (see Game.tsx's guessWords) — a
// plain ' '.join equivalent here would silently never match the rendered text.
const nbWord = (letters: string) => letters.split('').join(' ')

const FIREWORKS_LAYOUT_EVENT = { nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 480 } } }

// Fireworks only starts its onComplete timer once it has received a real layout size (see
// src/effects/fireworks.tsx) — in the app this happens automatically once RN measures the
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
    expect(display.props.children[0].props.children).toBe('_ _ _')
    expect(getByLabelText(/Wrong guesses: 0/)).toBeTruthy()
  })

  it('reveals a correctly guessed letter without incrementing wrong guesses', async () => {
    const { getByLabelText, getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'A')

    const display = getByLabelText('Secret word display')
    expect(display.props.children[0].props.children).toBe('_ A _')
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

  it('triggers a loss once wrong guesses reach the mode maxMistakes, showing a dialog that calls onStop when dismissed', async () => {
    const onStop = jest.fn()
    const { getByText, findByText } = await render(<Game phrase='CAT' onStop={onStop} mode={shortMode} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    expect(await findByText('You lost!')).toBeTruthy()
    expect(onStop).not.toHaveBeenCalled()

    await fireEvent.press(getByText('Next puzzle'))

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
    expect(queryByText('You win!')).toBeNull()

    await fireFireworksLayout(root)
    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    expect(getByText('You win!')).toBeTruthy()

    await fireEvent.press(getByText('Next puzzle'))

    expect(onStop).toHaveBeenCalledTimes(1)

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

  it('keeps the celebration effect spawning bursts for as long as the win dialog stays open', async () => {
    jest.useFakeTimers()
    const { getByText, root } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    await fireFireworksLayout(root)
    expect(root!.queryAll((node) => node.type === 'Circle').length).toBeGreaterThan(0)

    // Advance well past several burst spawn+fade cycles — the win dialog (verified in the sibling
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

    expect(await findByText('You lost!')).toBeTruthy()
    expect(queryByText(/unlocked in Animals/)).toBeNull()
  })

  it('reports the wrong-guess count and hint-revealed state to onSolved', async () => {
    const onSolved = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} onSolved={onSolved} hint='A furry pet' />)

    await guessLetter(getByText, 'Q')
    await fireEvent.press(getByText('Show hint'))
    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(onSolved).toHaveBeenCalledWith({ wrongGuesses: 1, hintRevealed: true, guessCount: 4 })
  })

  it('hides the hint behind a reveal button until pressed, and omits both when no hint is provided', async () => {
    const { getByText, queryByText, rerender } = await render(<Game phrase='CAT' onStop={jest.fn()} hint='A furry pet' />)

    expect(queryByText('A furry pet')).toBeNull()

    await fireEvent.press(getByText('Show hint'))
    expect(getByText('A furry pet')).toBeTruthy()

    await rerender(<Game phrase='CAT' onStop={jest.fn()} />)

    expect(queryByText('Show hint')).toBeNull()
    expect(queryByText('A furry pet')).toBeNull()
  })

  it('shows the difficulty badge immediately, side by side with the hint reveal control', async () => {
    const { getByText, getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} hint='Drama · 1994' packLabel='Movies' difficultyTier='hard' />)

    expect(getByText('Hard')).toBeTruthy()
    expect(getByLabelText('Difficulty: Hard')).toBeTruthy()
    expect(getByText('Show hint')).toBeTruthy()
  })

  it('does not count peeking at the always-visible difficulty badge as revealing the hint', async () => {
    const onSolved = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} onSolved={onSolved} hint='Drama · 1994' packLabel='Movies' difficultyTier='hard' />)

    // Difficulty is visible without any reveal action — glancing at it isn't "using a hint" for
    // achievement purposes (see achievements.ts's no_hints achievement), unlike pressing "Show hint".
    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(onSolved).toHaveBeenCalledWith({ wrongGuesses: 0, hintRevealed: false, guessCount: 3 })
  })

  it('reveals the pack and hint together as their own pill, splitting a "<Group> <Specific>" pack label on "|"', async () => {
    const { getByText, queryByText, getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} hint='Wikipedia category' packLabel='Theme Superheroes' difficultyTier='easy' />)

    expect(queryByText(/Theme/)).toBeNull()

    await fireEvent.press(getByText('Show hint'))

    expect(getByText('Theme | Superheroes  |  Wikipedia category')).toBeTruthy()
    expect(getByLabelText('Theme | Superheroes. Wikipedia category')).toBeTruthy()
  })

  it('fills the hint pill with tertiary and draws its label in onTertiary, so the text never sits tertiary-on-surface', async () => {
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} hint='A furry pet' />)

    const label = getByText('Show hint')
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
    expect(queryByText('Show hint')).toBeNull()
  })

  it('leaves a word that comfortably fits at its full size, and stretches the row so its own letters can never drive the measurement', async () => {
    const { getByLabelText } = await render(<Game phrase='DINOSAUR' onStop={jest.fn()} />)

    const display = getByLabelText('Secret word display')
    await fireEvent(display, 'layout', WORD_ROW_LAYOUT_EVENT)

    // 8 letters is nowhere near too wide for a 390pt row, so nothing should shrink.
    expect(StyleSheet.flatten(display.props.children[0].props.style).fontSize).toBe(30)
    // The structural half of the fix: the row spans its parent instead of hugging its letters.
    // Without this, onLayout reports the width of the text the fitted size just produced, and
    // because MONOSPACE_CHAR_WIDTH_RATIO overstates a real monospace advance to leave slack, each
    // layout pass measures ~3% narrower than the last — ratcheting even a short word all the way
    // down to MIN_WORD_FONT_SIZE. RN's layout doesn't run under the test renderer, so the loop
    // can't be driven here directly; asserting the style is what pins it.
    expect(StyleSheet.flatten(display.props.style).alignSelf).toBe('stretch')
  })

  it('shrinks only a word genuinely too wide for the row, measuring against the padded width so it stops short of the edges', async () => {
    const { getByLabelText, rerender } = await render(<Game phrase='HIPPOPOTAMUS' onStop={jest.fn()} />)

    const display = getByLabelText('Secret word display')
    await fireEvent(display, 'layout', WORD_ROW_LAYOUT_EVENT)

    // 12 letters render as 23 monospace cells, which really is wider than a 390pt row at the base
    // 30pt, so this one does have to come down. The fitted size is computed against the row's
    // PADDED inner width (390 - 2 * 12) rather than the raw measurement — the difference between
    // 25 and 27 here — which is what keeps the longest line from grazing the screen edges.
    const fitted = StyleSheet.flatten(display.props.children[0].props.style).fontSize
    expect(fitted).toBe(Math.floor((390 - 24) / (23 * 0.62)))
    // Landing strictly between the floor and the base is what makes the assertion above meaningful:
    // a word long enough to clamp at MIN_WORD_FONT_SIZE would produce the same number whether or
    // not the padding were subtracted at all.
    expect(fitted).toBeGreaterThan(16)
    expect(fitted).toBeLessThan(30)

    // A word too long to fit even at the smallest usable size stops at the floor rather than
    // dwindling to something unreadable.
    await rerender(<Game phrase='ELECTROENCEPHALOGRAPH' onStop={jest.fn()} />)
    const longDisplay = getByLabelText('Secret word display')
    await fireEvent(longDisplay, 'layout', WORD_ROW_LAYOUT_EVENT)
    expect(StyleSheet.flatten(longDisplay.props.children[0].props.style).fontSize).toBe(16)
  })

  it("reserves room for a multi-line word row instead of letting the artwork's square cap crowd it out", async () => {
    // Reported from a real device: a multi-word phrase wrapped onto several lines and visibly
    // overlapped the wrong-guess pips and artwork below it. Root cause — the artwork's height was
    // capped at min(combined width, combined height) alone, with no accounting for how tall the
    // word row itself actually needed to be; nothing clips an overflowing child in RN, so on a
    // device where the combined area isn't much taller than it is wide (a big keyboard, a small
    // screen), the artwork could claim nearly the whole thing and the wrapped word text spilled out
    // past its own box into whatever renders after it.
    const { getByLabelText, getByTestId } = await render(<Game phrase='A STITCH IN TIME SAVES NINE' onStop={jest.fn()} />)

    // A combined area that's roughly square — width and height close enough together that the old
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
    expect(displayBefore.props.children[0].props.children).toBe(nbWord('C__'))
    expect(getByLabelText('Wrong guesses: 1 of 3')).toBeTruthy()
    // hasVisual defaults true, and the letter display uses the smaller of the two font sizes
    // reserved for it (see Game.tsx's WORD_FONT_SIZE) while there's still room for artwork.
    expect(StyleSheet.flatten(displayBefore.props.children[0].props.style).fontSize).toBe(30)

    // Simulates PuzzleDrawer's onModeChange pushing a freshly picked art style straight into the
    // session mid-round (see Main.tsx's handleModeChange) — the same Game instance, just a new
    // mode prop, not a remount.
    await rerender(<Game phrase='CAT' onStop={jest.fn()} mode={tightNoVisualMode} />)

    const displayAfter = getByLabelText('Secret word display')
    expect(displayAfter.props.children[0].props.children).toBe(nbWord('C__'))
    expect(getByLabelText('Wrong guesses: 1 of 3')).toBeTruthy()
    // The new mode has hasVisual: false, which enlarges the letter display to fill the space
    // artwork would have used (see Game.tsx's WORD_FONT_SIZE_LARGE) — reflected the instant the
    // mode prop changes, with no further interaction needed.
    expect(StyleSheet.flatten(displayAfter.props.children[0].props.style).fontSize).toBe(56)
  })

  it("keeps the round's mistake limit fixed at whatever mode it started with, even after a live mode swap to a mode with a different maxMistakes", async () => {
    const { getByText, queryByText, findByText, rerender } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={roomyVisualMode} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    // 2 wrong guesses already — at or past tightNoVisualMode's own maxMistakes (1), but the round
    // started under roomyVisualMode (maxMistakes 3), so swapping mid-round must not retroactively
    // end it just because the new mode's limit would already have been exceeded.
    await rerender(<Game phrase='CAT' onStop={jest.fn()} mode={tightNoVisualMode} />)
    expect(queryByText('You lost!')).toBeNull()

    // The round is still governed by the ORIGINAL mode's limit (3) — one more wrong guess reaches
    // it and the round ends now, not one guess ago and not never.
    await guessLetter(getByText, 'Z')
    expect(await findByText('You lost!')).toBeTruthy()
  })

  it("caps the mistakes handed to the current mode's own artwork one stage short of its maximum while the round is still mechanically alive, even after a live mode swap crosses a maxMistakes boundary", async () => {
    const { getByText, getByTestId, queryByText, findByText, rerender } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={roomyRecordingMode} />)
    await fireEvent(getByTestId('game-visual-container'), 'layout', VISUAL_LAYOUT_EVENT)

    // 7 of roomyRecordingMode's 8 allowed mistakes — the round is still mechanically alive.
    for (const letter of ['Q', 'W', 'E', 'R', 'Y', 'U', 'I']) {
      await guessLetter(getByText, letter)
    }
    expect(getByTestId('visual-mistakes').props.children).toBe(7)

    // Live-swap to a mode with a SMALLER maxMistakes (6) than the round's frozen limit (8) — the
    // same interaction PuzzleDrawer's onModeChange drives (see Main.tsx's handleModeChange).
    // Without a cap this would hand the new mode's artwork mistakes=7 — at or past ITS OWN
    // maxMistakes (6), which every real mode's Visual treats as its own fully-"lost" stage (see
    // e.g. classic.tsx's `Math.min(mistakes, PARTS.length)`) — even though the round hasn't
    // actually ended.
    await rerender(<Game phrase='CAT' onStop={jest.fn()} mode={tightRecordingMode} />)
    await fireEvent(getByTestId('game-visual-container'), 'layout', VISUAL_LAYOUT_EVENT)

    expect(getByTestId('visual-mistakes').props.children).toBe(5)
    expect(queryByText('You lost!')).toBeNull()

    // One more wrong guess reaches the round's real, frozen limit (8) and the round actually ends
    // — the cap lifts, and the now-active mode's own true maximum (6) is what shows, appropriately,
    // since the round really is over at this point.
    await guessLetter(getByText, 'O')
    expect(await findByText('You lost!')).toBeTruthy()
    expect(getByTestId('visual-mistakes').props.children).toBe(6)
  })

  it("shows the current mode's own full terminal stage the instant the fatal wrong guess lands, without waiting for the loss dialog's deliberate delay", async () => {
    const { getByText, getByTestId, queryByText } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={tinyRecordingMode} />)
    await fireEvent(getByTestId('game-visual-container'), 'layout', VISUAL_LAYOUT_EVENT)

    await guessLetter(getByText, 'Q')

    // The loss dialog is deliberately shown 450ms late (see Game.tsx's lossTimeoutRef, "so the
    // final stage has time to draw before the loss dialog interrupts") — the artwork itself must
    // not be the thing waiting on that delay, or the "final stage" it's supposed to have time to
    // draw would still be one stage short for the entire pause.
    expect(queryByText('You lost!')).toBeNull()
    expect(getByTestId('visual-mistakes').props.children).toBe(1)
  })
})
