import { act, fireEvent, render } from '@testing-library/react-native'

import { WIN_DIALOG_DELAY_MS } from '@/components/Game'
import { Main } from '@/components/Main'
import { Providers } from '@/components/Providers'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { recordSolve } from '@/utils/achievements'
import * as puzzlePicker from '@/utils/puzzlePicker'

// Own file, own achievements mock — same reasoning AbandonPuzzle.test.tsx's own comment gives:
// mocking '@/utils/achievements' here shouldn't perturb Main.test.tsx's unrelated assertions.
jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

jest.mock('@/utils/achievements', () => ({
  ...jest.requireActual('@/utils/achievements'),
  recordSolve: jest.fn().mockResolvedValue([])
}))

const mockResolvePuzzle = jest.mocked(puzzlePicker.resolvePuzzle)
const mockRecordSolve = jest.mocked(recordSolve)

const visualMode: GameMode = {
  id: 'test-achievement-snackbar-visual',
  label: 'Test Achievement Snackbar Visual',
  description: 'A test mode with artwork',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: (() => null) as unknown as GameMode['Visual']
}

// Deliberately no packKey/puzzleId — keeps handleSolved's unlock-map branch (see Main.tsx) out of
// the way, so this test doesn't also need to mock '@/utils/unlocks' to exercise a plain win.
const payload: GameStartPayload = { phrase: 'CAT', mode: visualMode, sourceMode: 'random', difficultyTier: 'easy' }

const renderApp = () =>
  render(
    <Providers>
      <Main />
    </Providers>
  )

describe('Main — achievement snackbar timing on a win', () => {
  beforeEach(() => {
    mockResolvePuzzle.mockReset()
    mockRecordSolve.mockReset()
    mockRecordSolve.mockResolvedValue([])
  })

  it('surfaces a newly unlocked achievement the moment the round is won, not after the round-end dialog is dismissed', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload })
    mockRecordSolve.mockResolvedValue(['flawless'])
    jest.useFakeTimers()
    const { getByText, findByText, queryByText } = await renderApp()

    await act(async () => {
      fireEvent.press(getByText('C'))
    })
    await act(async () => {
      fireEvent.press(getByText('A'))
    })
    await act(async () => {
      fireEvent.press(getByText('T'))
    })

    // The toast is already up — before the round-end dialog itself has even appeared (still
    // gated behind WIN_DIALOG_DELAY_MS), let alone before "Next puzzle" has been pressed.
    expect(await findByText('Achievement unlocked: Flawless Victory')).toBeTruthy()
    expect(queryByText('You win!')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    // Still showing once the dialog itself catches up — this is the "during the win dialog"
    // moment that was actually asked for, not just an earlier one.
    expect(getByText('You win!')).toBeTruthy()
    expect(getByText('Achievement unlocked: Flawless Victory')).toBeTruthy()

    jest.useRealTimers()
  })

  it('shows no achievement toast on an ordinary win that unlocks nothing new', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload })
    mockRecordSolve.mockResolvedValue([])
    const { getByText, queryByText } = await renderApp()

    await act(async () => {
      fireEvent.press(getByText('C'))
    })
    await act(async () => {
      fireEvent.press(getByText('A'))
    })
    await act(async () => {
      fireEvent.press(getByText('T'))
    })

    expect(queryByText(/Achievement unlocked/)).toBeNull()
  })
})
