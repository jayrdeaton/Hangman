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
  id: 'test-round-end-achievements-visual',
  label: 'Test Round End Achievements Visual',
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

type GetByText = Awaited<ReturnType<typeof renderApp>>['getByText']

// Guesses the whole phrase ('CAT'), letter by letter, to win — same three-press sequence every
// test here needs before it can assert on the round-end dialog.
const winByGuessingCat = async (getByText: GetByText) => {
  for (const letter of ['C', 'A', 'T']) {
    await act(async () => {
      fireEvent.press(getByText(letter))
    })
  }
}

// Achievement unlocks now surface as part of RoundEndDialog itself (see its own
// unlockedAchievementTitles prop) rather than a separate Snackbar that fired independently on its
// own timer — so unlike the old toast, there's nothing to see until the dialog itself opens.
describe('Main — achievement unlocks inside the round-end dialog', () => {
  beforeEach(() => {
    mockResolvePuzzle.mockReset()
    mockRecordSolve.mockReset()
    mockRecordSolve.mockResolvedValue([])
  })

  it('shows a newly unlocked achievement inside the dialog once it opens, not before', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload })
    mockRecordSolve.mockResolvedValue(['flawless'])
    jest.useFakeTimers()
    const { getByText, queryByText } = await renderApp()

    await winByGuessingCat(getByText)

    // recordSolve has already resolved by now (it's an immediately-resolved mock), but the dialog
    // itself is still gated behind WIN_DIALOG_DELAY_MS (see Game.tsx) — nothing to see yet.
    expect(queryByText('You win!')).toBeNull()
    expect(queryByText('Flawless Victory')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    expect(getByText('You win!')).toBeTruthy()
    expect(getByText('Achievement unlocked')).toBeTruthy()
    expect(getByText('Flawless Victory')).toBeTruthy()

    jest.useRealTimers()
  })

  it('shows no achievement callout on an ordinary win that unlocks nothing new', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload })
    mockRecordSolve.mockResolvedValue([])
    jest.useFakeTimers()
    const { getByText, queryByText } = await renderApp()

    await winByGuessingCat(getByText)
    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    expect(getByText('You win!')).toBeTruthy()
    expect(queryByText('Achievement unlocked')).toBeNull()
    expect(queryByText(/Achievements unlocked/)).toBeNull()

    jest.useRealTimers()
  })

  it('lists every newly unlocked achievement at once, pluralizing the heading, instead of the old toast queuing one at a time', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload })
    mockRecordSolve.mockResolvedValue(['flawless', 'no_hints'])
    jest.useFakeTimers()
    const { getByText } = await renderApp()

    await winByGuessingCat(getByText)
    await act(async () => {
      jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
    })

    expect(getByText('Achievements unlocked')).toBeTruthy()
    expect(getByText('Flawless Victory')).toBeTruthy()
    expect(getByText('No Hints Needed')).toBeTruthy()

    jest.useRealTimers()
  })
})
