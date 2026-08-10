import { fireEvent, render as rtlRender, within } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { PaperProvider } from 'react-native-paper'

import { findKeyPosition, Keyboard, LAYOUT_ROWS } from '@/components/Keyboard'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: PaperProvider })

describe('findKeyPosition', () => {
  it("finds a letter's row and column in the real qwerty layout", () => {
    // Q is the first letter of the first row; L is the last letter of the second row — one from
    // each end, not just the trivial first-row-first-letter case.
    expect(findKeyPosition(LAYOUT_ROWS.qwerty, 'Q')).toEqual({ row: 0, col: 0 })
    expect(findKeyPosition(LAYOUT_ROWS.qwerty, 'L')).toEqual({ row: 1, col: 8 })
  })

  it("finds a letter's row and column in the real abc layout, distinct from where the same letter sits in qwerty", () => {
    // A is qwerty's row 1 col 0, but abc's own row 0 col 0 — proves this reads the layout it's
    // actually given, not a hardcoded qwerty assumption.
    expect(findKeyPosition(LAYOUT_ROWS.abc, 'A')).toEqual({ row: 0, col: 0 })
  })

  it('returns null for a letter not present in the layout, and for a null/undefined/empty letter', () => {
    expect(findKeyPosition(LAYOUT_ROWS.qwerty, '1')).toBeNull()
    expect(findKeyPosition(LAYOUT_ROWS.qwerty, null)).toBeNull()
    expect(findKeyPosition(LAYOUT_ROWS.qwerty, undefined)).toBeNull()
    expect(findKeyPosition(LAYOUT_ROWS.qwerty, '')).toBeNull()
  })
})

describe('Keyboard', () => {
  it('renders every letter of the given layout, defaulting to qwerty', async () => {
    const { getByText } = await render(<Keyboard guessedLetters={[]} phrase='CAT' onGuess={jest.fn()} />)

    for (const row of LAYOUT_ROWS.qwerty) {
      for (const letter of row) expect(getByText(letter)).toBeTruthy()
    }
  })

  it('switches to the abc layout when asked, changing which row each letter falls in', async () => {
    // Both layouts cover the full alphabet, so a letter's mere presence proves nothing about which
    // one is showing — what actually differs is the row grouping (qwerty's row 1 is ASDFGHJKL, no
    // Q; abc's own row 1 is JKLMNOPQR, which does have Q).
    const { getByTestId: getByTestIdQwerty } = await render(<Keyboard guessedLetters={[]} phrase='CAT' layout='qwerty' onGuess={jest.fn()} />)
    expect(within(getByTestIdQwerty('keyboard-row-1')).queryByText('Q')).toBeNull()

    const { getByTestId: getByTestIdAbc } = await render(<Keyboard guessedLetters={[]} phrase='CAT' layout='abc' onGuess={jest.fn()} />)
    expect(within(getByTestIdAbc('keyboard-row-1')).getByText('Q')).toBeTruthy()
  })

  it('disables a guessed letter and calls onGuess for one that has not been guessed yet', async () => {
    const onGuess = jest.fn()
    const { getByText } = await render(<Keyboard guessedLetters={['C']} phrase='CAT' onGuess={onGuess} />)

    expect(getByText('C').parent?.parent?.props.accessibilityState.disabled).toBe(true)

    await fireEvent.press(getByText('A'))

    expect(onGuess).toHaveBeenCalledWith('A')
  })

  it('does not call onGuess again for an already-guessed letter, or when the whole keyboard is disabled', async () => {
    const onGuess = jest.fn()
    const { getByText, rerender } = await render(<Keyboard guessedLetters={['C']} phrase='CAT' onGuess={onGuess} />)

    await fireEvent.press(getByText('C'))
    expect(onGuess).not.toHaveBeenCalled()

    await rerender(
      <PaperProvider>
        <Keyboard guessedLetters={[]} phrase='CAT' disabled onGuess={onGuess} />
      </PaperProvider>
    )
    await fireEvent.press(getByText('A'))
    expect(onGuess).not.toHaveBeenCalled()
  })

  // The ripple itself (Keyboard.tsx's KeyboardKey/rippleDistance) is Reanimated-driven, and this
  // project's react-native-reanimated mock (see jest.setup.ts) resolves withSequence/withDelay
  // synchronously to their settled end value with no observable peak — same reason fireworks.tsx's
  // own tests check particle counts/timing/color rather than animated values. What's actually worth
  // protecting here is the plain (row, col) distance math above (findKeyPosition) and that handing
  // Keyboard a winningLetter doesn't blow up rendering, which this covers; the visual "does it
  // actually ripple" question is a manual/on-device check, not a unit-testable one.
  it('renders without error when a winningLetter is provided', async () => {
    const { getByText } = await render(<Keyboard guessedLetters={['C', 'A', 'T']} phrase='CAT' winningLetter='T' disabled onGuess={jest.fn()} />)

    expect(getByText('T')).toBeTruthy()
  })

  // Same reasoning as the winningLetter test above: the shake-then-fall itself (Keyboard.tsx's
  // own falling prop) is Reanimated-driven and this project's mock resolves it synchronously with
  // no observable intermediate motion, so all that's checkable here is that every key — including
  // already-guessed ones — still renders without error once falling flips true.
  it('renders without error when falling is true', async () => {
    const { getByText } = await render(<Keyboard guessedLetters={['C', 'A']} phrase='CAT' falling disabled onGuess={jest.fn()} />)

    expect(getByText('C')).toBeTruthy()
    expect(getByText('T')).toBeTruthy()
  })

  // Unlike falling/winningLetter, started defaults true (see its own prop comment) so a keyboard
  // mounted without wiring the real signal still gets a plain on-mount slide-in — every test above
  // already exercises that default branch implicitly. What's worth covering on its own is the other
  // branch: Game.tsx explicitly holds this false until gameReady resolves, and that should render
  // fine too (the slide-in itself is Reanimated-driven and, like the ripple/fall above, not
  // observable through this project's synchronous-resolve mock).
  it('renders without error when started is explicitly false', async () => {
    const { getByText } = await render(<Keyboard guessedLetters={[]} phrase='CAT' started={false} onGuess={jest.fn()} />)

    expect(getByText('C')).toBeTruthy()
  })
})
