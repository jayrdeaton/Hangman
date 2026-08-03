import { fireEvent, render } from '@testing-library/react-native'

import { Main } from '@/components/Main'
import { Providers } from '@/components/Providers'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import { recordLoss } from '@/utils/achievements'
import * as puzzlePicker from '@/utils/puzzlePicker'

// Own file, own achievements mock — same reasoning PnpFlow.test.tsx's own comment gives: mocking
// '@/utils/achievements' here shouldn't perturb Main.test.tsx's unrelated assertions.
jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

jest.mock('@/utils/achievements', () => ({
  ...jest.requireActual('@/utils/achievements'),
  recordSolve: jest.fn().mockResolvedValue([]),
  recordLoss: jest.fn().mockResolvedValue(undefined)
}))

const mockResolvePuzzle = jest.mocked(puzzlePicker.resolvePuzzle)
const mockRecordLoss = jest.mocked(recordLoss)

const visualMode: GameMode = {
  id: 'test-abandon-visual',
  label: 'Test Abandon Visual',
  description: 'A test mode with artwork',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  Visual: (() => null) as unknown as GameMode['Visual']
}

// A single wrong guess ends the round — used for the "round already decided" scenario, where the
// loss needs to happen without a long guessing sequence first.
const oneMistakeMode: GameMode = {
  id: 'test-abandon-one-mistake',
  label: 'Test Abandon One Mistake',
  description: 'A test mode that loses on the first wrong guess',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 1,
  Visual: (() => null) as unknown as GameMode['Visual']
}

const payload = (overrides: Partial<GameStartPayload>): GameStartPayload => ({ phrase: 'DOG', mode: visualMode, sourceMode: 'random', packKey: 'pack-1', packLabel: 'Test Pack', puzzleId: 'puzzle-1', difficultyTier: 'easy', ...overrides })

const renderApp = () =>
  render(
    <Providers>
      <Main />
    </Providers>
  )

describe('Main — abandoning an in-progress puzzle counts as a loss', () => {
  beforeEach(() => {
    mockResolvePuzzle.mockReset()
    mockRecordLoss.mockClear()
  })

  it('asks for confirmation instead of switching immediately, once at least one letter has been guessed', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: payload({ puzzleId: 'puzzle-1' }) })
    const { getByLabelText, getByText } = await renderApp()

    // DOG has no Q — a wrong guess, but any guess (right or wrong) is what should trigger this.
    await fireEvent.press(getByText('Q'))

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Random'))

    expect(getByText('Abandon this puzzle?')).toBeTruthy()
    // resolvePuzzle has been asked twice by this point — once for the initial session on mount,
    // once more for Random's own candidate draw (PuzzleDrawer computes it up front, independent of
    // whether Main actually accepts it) — but that candidate is only HELD pending confirmation, not
    // applied: no loss recorded, nothing switched yet.
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(2)
    expect(mockRecordLoss).not.toHaveBeenCalled()
  })

  it('records a loss for the abandoned puzzle and switches once the abandon is confirmed', async () => {
    mockResolvePuzzle.mockReturnValueOnce({ ok: true, payload: payload({ puzzleId: 'puzzle-1' }) }).mockReturnValueOnce({ ok: true, payload: payload({ phrase: 'FISH', puzzleId: 'puzzle-2' }) })
    const { getByLabelText, getByText } = await renderApp()

    await fireEvent.press(getByText('Q'))
    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Random'))
    await fireEvent.press(getByText('Abandon'))

    expect(mockRecordLoss).toHaveBeenCalledTimes(1)
    expect(mockRecordLoss).toHaveBeenCalledWith({ wrongGuesses: 1, guessCount: 1 })
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(2)
  })

  it('stays on the current puzzle and records nothing when the abandon is declined', async () => {
    mockResolvePuzzle.mockReturnValueOnce({ ok: true, payload: payload({ puzzleId: 'puzzle-1' }) }).mockReturnValueOnce({ ok: true, payload: payload({ phrase: 'FISH', puzzleId: 'puzzle-2' }) })
    const { getByLabelText, getByText, queryByText } = await renderApp()

    await fireEvent.press(getByText('Q'))
    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Random'))
    await fireEvent.press(getByText('Cancel'))

    expect(queryByText('Abandon this puzzle?')).toBeNull()
    expect(mockRecordLoss).not.toHaveBeenCalled()
    // The candidate Random already drew (see the previous test) was discarded, not applied — no
    // THIRD resolvePuzzle call from cancelling, on top of the mount + Random-press pair.
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(2)
  })

  it('switches immediately, with no confirmation, when nothing has been guessed yet', async () => {
    mockResolvePuzzle.mockReturnValueOnce({ ok: true, payload: payload({ puzzleId: 'puzzle-1' }) }).mockReturnValueOnce({ ok: true, payload: payload({ phrase: 'FISH', puzzleId: 'puzzle-2' }) })
    const { getByLabelText, getByText, queryByText } = await renderApp()

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Random'))

    expect(queryByText('Abandon this puzzle?')).toBeNull()
    expect(mockRecordLoss).not.toHaveBeenCalled()
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(2)
  })

  it('switches immediately, with no confirmation, once the round has already been decided', async () => {
    mockResolvePuzzle.mockReturnValueOnce({ ok: true, payload: payload({ mode: oneMistakeMode, puzzleId: 'puzzle-1' }) }).mockReturnValueOnce({ ok: true, payload: payload({ mode: oneMistakeMode, phrase: 'FISH', puzzleId: 'puzzle-2' }) })
    const { getByLabelText, getByText, findByText, queryByText } = await renderApp()

    await fireEvent.press(getByText('Q'))
    expect(await findByText('You lost!')).toBeTruthy()
    // The real loss already recorded it — this is the ONE call, not a second one from abandoning.
    expect(mockRecordLoss).toHaveBeenCalledTimes(1)

    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Random'))

    expect(queryByText('Abandon this puzzle?')).toBeNull()
    expect(mockRecordLoss).toHaveBeenCalledTimes(1)
    expect(mockResolvePuzzle).toHaveBeenCalledTimes(2)
  })

  it('gates starting pass and play the same way as picking a puzzle does', async () => {
    mockResolvePuzzle.mockReturnValue({ ok: true, payload: payload({ puzzleId: 'puzzle-1' }) })
    const { getByLabelText, getByText, getByTestId } = await renderApp()

    await fireEvent.press(getByText('Q'))
    await fireEvent.press(getByLabelText('Game Menu'))
    await fireEvent.press(getByText('Pass & play'))

    expect(getByText('Abandon this puzzle?')).toBeTruthy()
    // Gating stops short of applying the switch — the menu (and its own now-hidden-behind-the-
    // dialog "Pass & play" button) hasn't been dismissed, and no composing screen exists yet.
    expect(getByTestId('puzzle-drawer-panel').props.accessibilityElementsHidden).toBe(false)

    await fireEvent.press(getByText('Abandon'))

    expect(mockRecordLoss).toHaveBeenCalledWith({ wrongGuesses: 1, guessCount: 1 })
    // The prompt's own title bar matches the button that launched it (see PnpFlow.test.tsx's own
    // "titles the prompt to match the button that launched it") — the drawer's OWN same-labeled
    // button is accessibility-hidden by now (the menu closed as part of applying the switch), so
    // this is the one remaining match.
    expect(getByText('Pass & play')).toBeTruthy()
  })
})
