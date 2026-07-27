import { act, fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { StyleSheet } from 'react-native'
import { PaperProvider } from 'react-native-paper'

import { Game } from '@/components/Game'
import { BURST_LIFETIME_MS, MAX_BURST_INTERVAL_MS } from '@/effects/fireworks'
import type { GameMode } from '@/types/gameModes'

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn()
}))

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
// tree with pointerEvents='none', so that's how we find it.
const fireFireworksLayout = async (root: Root) => {
  const [fireworksView] = root!.queryAll((node) => node.props.pointerEvents === 'none')
  await fireEvent(fireworksView, 'layout', FIREWORKS_LAYOUT_EVENT)
}

describe('Game', () => {
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

  it('calls onLost once wrong guesses reach the mode maxMistakes', async () => {
    const onLost = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} onLost={onLost} mode={shortMode} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    expect(onLost).toHaveBeenCalledTimes(1)
  })

  it('triggers a win once every letter has been guessed, showing the dialog immediately alongside the celebration, and calls onStop when dismissed', async () => {
    const onStop = jest.fn()
    const onSolved = jest.fn()
    const { getByText, findByText, root } = await render(<Game phrase='CAT' onStop={onStop} onSolved={onSolved} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(onSolved).toHaveBeenCalledWith({ wrongGuesses: 0, hintRevealed: false })
    // The dialog no longer waits on the celebration to finish — both appear together.
    expect(await findByText('You win!')).toBeTruthy()
    const [fireworksView] = root!.queryAll((node) => node.props.pointerEvents === 'none')
    expect(fireworksView).toBeTruthy()

    await fireFireworksLayout(root)
    await fireEvent.press(getByText('Next puzzle'))

    expect(onStop).toHaveBeenCalledTimes(1)
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
    const { getByText, findByText } = await render(<Game phrase='CAT' onStop={jest.fn()} categoryProgress={{ label: 'Animals', unlockedCount: 4, totalCount: 10 }} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(await findByText('4 of 10 unlocked in Animals')).toBeTruthy()
  })

  it('omits category progress on a loss even when provided', async () => {
    const { getByText, findByText, queryByText } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={shortMode} categoryProgress={{ label: 'Animals', unlockedCount: 4, totalCount: 10 }} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    expect(await findByText('You lost!')).toBeTruthy()
    expect(queryByText(/unlocked in Animals/)).toBeNull()
  })

  it('shows an "Another" button on a win when both categoryProgress and the handler are provided, and calls it on press', async () => {
    const onAnotherInCategory = jest.fn()
    const { getByText, findByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} categoryProgress={{ label: 'Animals', unlockedCount: 4, totalCount: 10 }} onAnotherInCategory={onAnotherInCategory} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    await fireEvent.press(await findByLabelText('Another puzzle in this category'))

    expect(onAnotherInCategory).toHaveBeenCalledTimes(1)
  })

  it('omits the "Another" button when no handler is provided', async () => {
    const { getByText, findByText, queryByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} categoryProgress={{ label: 'Animals', unlockedCount: 4, totalCount: 10 }} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(await findByText('You win!')).toBeTruthy()
    expect(queryByLabelText('Another puzzle in this category')).toBeNull()
  })

  it('reports the wrong-guess count and hint-revealed state to onSolved', async () => {
    const onSolved = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} onSolved={onSolved} hint='A furry pet' />)

    await guessLetter(getByText, 'Q')
    await fireEvent.press(getByText('Show hint'))
    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(onSolved).toHaveBeenCalledWith({ wrongGuesses: 1, hintRevealed: true })
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

    expect(onSolved).toHaveBeenCalledWith({ wrongGuesses: 0, hintRevealed: false })
  })

  it('reveals the pack and hint together as their own pill, splitting a "<Group> <Specific>" pack label on "|"', async () => {
    const { getByText, queryByText, getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} hint='Wikipedia category' packLabel='Theme Superheroes' difficultyTier='easy' />)

    expect(queryByText(/Theme/)).toBeNull()

    await fireEvent.press(getByText('Show hint'))

    expect(getByText('Theme | Superheroes  |  Wikipedia category')).toBeTruthy()
    expect(getByLabelText('Theme | Superheroes. Wikipedia category')).toBeTruthy()
  })

  it('reveals just the difficulty badge when there is no pack label or derived hint to go with it', async () => {
    const { getByText, queryByText } = await render(<Game phrase='CAT' onStop={jest.fn()} difficultyTier='easy' />)

    expect(getByText('Easy')).toBeTruthy()
    expect(queryByText('Show hint')).toBeNull()
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
})
