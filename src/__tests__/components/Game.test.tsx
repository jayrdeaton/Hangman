import { fireEvent, render, waitFor } from '@testing-library/react-native'

import { Game } from '@/components/Game'
import type { GameMode } from '@/types/gameModes'
import { alert } from '@/utils/alert'

jest.mock('@/utils/alert', () => ({
  alert: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn()
}))

const mockAlert = alert as jest.Mock

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

const guessLetter = async (getByText: GetByText, letter: string) => {
  await fireEvent.press(getByText(letter))
}

describe('Game', () => {
  beforeEach(() => {
    mockAlert.mockClear()
  })

  it('renders a short phrase with the correct number of blanks and 0 wrong guesses', async () => {
    const { getByLabelText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    const display = getByLabelText('Secret word display')
    expect(display.props.children).toBe('_ _ _')
    expect(getByLabelText(/Wrong guesses: 0/)).toBeTruthy()
  })

  it('reveals a correctly guessed letter without incrementing wrong guesses', async () => {
    const { getByLabelText, getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'A')

    const display = getByLabelText('Secret word display')
    expect(display.props.children).toBe('_ A _')
    expect(getByLabelText(/Wrong guesses: 0/)).toBeTruthy()
  })

  it('increments wrong guesses by one for a wrong letter, and ignores a repeated wrong guess', async () => {
    const { getByLabelText, getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} />)

    await guessLetter(getByText, 'Q')
    expect(getByLabelText(/Wrong guesses: 1/)).toBeTruthy()

    await guessLetter(getByText, 'Q')
    expect(getByLabelText(/Wrong guesses: 1/)).toBeTruthy()
  })

  it('triggers a loss once wrong guesses reach the mode maxMistakes', async () => {
    const onStop = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={onStop} mode={shortMode} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    await waitFor(() => expect(onStop).toHaveBeenCalled())

    expect(mockAlert).toHaveBeenCalledTimes(1)
    const [title] = mockAlert.mock.calls[0]
    expect(title.toLowerCase()).toContain('lost')
  })

  it('calls onLost once wrong guesses reach the mode maxMistakes', async () => {
    const onLost = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={jest.fn()} onLost={onLost} mode={shortMode} />)

    await guessLetter(getByText, 'Q')
    await guessLetter(getByText, 'W')

    expect(onLost).toHaveBeenCalledTimes(1)
  })

  it('triggers a win once every letter has been guessed', async () => {
    const onStop = jest.fn()
    const onSolved = jest.fn()
    const { getByText } = await render(<Game phrase='CAT' onStop={onStop} onSolved={onSolved} />)

    await guessLetter(getByText, 'C')
    await guessLetter(getByText, 'A')
    await guessLetter(getByText, 'T')

    expect(onSolved).toHaveBeenCalledWith({ wrongGuesses: 0, hintRevealed: false })

    await waitFor(() => expect(onStop).toHaveBeenCalled())

    expect(mockAlert).toHaveBeenCalledTimes(1)
    const [title] = mockAlert.mock.calls[0]
    expect(title.toLowerCase()).toContain('win')
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

    expect(queryByText(/Hint: A furry pet/)).toBeNull()

    await fireEvent.press(getByText('Show hint'))
    expect(getByText(/Hint: A furry pet/)).toBeTruthy()

    await rerender(<Game phrase='CAT' onStop={jest.fn()} />)

    expect(queryByText('Show hint')).toBeNull()
    expect(queryByText(/Hint:/)).toBeNull()
  })
})
