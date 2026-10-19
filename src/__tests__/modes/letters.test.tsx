import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { sketchWordBlanksDrawnMs } from '@/components/SketchWord'
import { lettersMode } from '@/modes/registry'

// The word as text, '_' for a blank, so a test can read how far it's been filled in. The sizing and
// timing helpers stay real.
jest.mock('@/components/SketchWord', () => {
  const { createElement } = jest.requireActual('react')
  const { Text } = jest.requireActual('react-native')
  return {
    ...jest.requireActual('@/components/SketchWord'),
    SketchWord: ({ letters }: { letters: string[] }) => createElement(Text, { testID: 'letters-word' }, letters.join(''))
  }
})

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

describe('Letters Only preview', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // The same reveal as Home's title (SolvingWord): HANGMAN's blanks, then each gives way to its letter,
  // left to right, never letters drawn over blanks that stay.
  it('solves HANGMAN on its blanks, like the hero title', async () => {
    const { Visual } = lettersMode
    await render(<Visual mistakes={0} color='#000' />)
    // Nothing to size until the box is measured.
    expect(screen.queryByTestId('letters-word')).toBeNull()
    await fireEvent(screen.getByTestId('letters-preview'), 'layout', { nativeEvent: { layout: { width: 200, height: 200 } } })
    expect(screen.getByTestId('letters-word')).toHaveTextContent('_______')

    await advance(sketchWordBlanksDrawnMs(7))
    expect(screen.getByTestId('letters-word')).toHaveTextContent('_______')
    await advance(200)
    expect(screen.getByTestId('letters-word')).toHaveTextContent('H______')
    for (let i = 0; i < 6; i++) await advance(120)
    expect(screen.getByTestId('letters-word')).toHaveTextContent('HANGMAN')
  })
})
