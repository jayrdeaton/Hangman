import { act, fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement } from 'react'
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

type GetByText = Awaited<ReturnType<typeof render>>['getByText']
type Root = Awaited<ReturnType<typeof render>>['root']

const guessLetter = async (getByText: GetByText, letter: string) => {
  await fireEvent.press(getByText(letter))
}

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
})
