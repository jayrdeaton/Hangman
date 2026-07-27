import { fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { PaperProvider } from 'react-native-paper'

import { Game } from '@/components/Game'
import { classicMode } from '@/modes/classic'
import { starsMode } from '@/modes/stars'

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn()
}))

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: PaperProvider })

describe('scratch: mode swap visual/mechanics mismatch', () => {
  it('shows the fully-drawn classic hangman mid-round after switching from Stars, even though the frozen limit says the round is not over', async () => {
    const { getByText, rerender, getByLabelText, queryByText } = await render(<Game phrase='CAT' onStop={jest.fn()} mode={starsMode} />)

    // Rack up 7 wrong guesses while on Stars (maxMistakes 8, so the round survives).
    for (const letter of ['Q', 'W', 'X', 'Z', 'J', 'V', 'B']) {
      await fireEvent.press(getByText(letter))
    }
    expect(getByLabelText(/Wrong guesses: 7 of 8/)).toBeTruthy()
    expect(queryByText('You lost!')).toBeNull()

    // Live mode swap to Classic (maxMistakes 6) — mirrors PuzzleDrawer's onModeChange path.
    await rerender(<Game phrase='CAT' onStop={jest.fn()} mode={classicMode} />)

    // Round is still alive (frozen maxWrong stayed 8, only 7 used) ...
    expect(queryByText('You lost!')).toBeNull()
    // ... yet a correct guess still works, proving mechanics are unaffected.
  })
})
