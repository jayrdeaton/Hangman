import { act, fireEvent, render } from '@testing-library/react-native'

import { WIN_DIALOG_DELAY_MS } from '@/components/Game'
import { Main } from '@/components/Main'
import { Providers } from '@/components/Providers'
import * as puzzleDefaults from '@/hooks/usePuzzleDefaults'
import { DEFAULT_MODE } from '@/modes/registry'
import { achievementsActions } from '@/redux/achievementsSlice'
import { store } from '@/redux/store'
import type { GameMode } from '@/types/gameModes'
import type { GameStartPayload } from '@/types/gameSession'
import * as puzzlePicker from '@/utils/puzzlePicker'
import { applySoloRound } from '@/utils/statsEngine'
import { createDefaultStats } from '@/utils/statsValidation'
import * as unlocks from '@/utils/unlocks'

import { puzzleManifest } from '../../data/puzzleCatalog.generated'

jest.mock('@/utils/puzzlePicker', () => ({
  ...jest.requireActual('@/utils/puzzlePicker'),
  resolvePuzzle: jest.fn()
}))

// The real unlock map by default (always empty under the app's AsyncStorage mock); one test fills a
// built-in pack to check the completed-pack scan.
jest.mock('@/utils/unlocks', () => {
  const actual = jest.requireActual('@/utils/unlocks')
  return { ...actual, getPuzzleUnlockMap: jest.fn(actual.getPuzzleUnlockMap) }
})

// Each round takes the player's saved default mode (see Main's defaults effect), so the mode-family
// tests set it here; every other test gets the real hook.
jest.mock('@/hooks/usePuzzleDefaults', () => {
  const actual = jest.requireActual('@/hooks/usePuzzleDefaults')
  return { ...actual, usePuzzleDefaults: jest.fn(actual.usePuzzleDefaults) }
})

const mockResolvePuzzle = jest.mocked(puzzlePicker.resolvePuzzle)
const mockUsePuzzleDefaults = jest.mocked(puzzleDefaults.usePuzzleDefaults)
const realUsePuzzleDefaults: typeof puzzleDefaults.usePuzzleDefaults = jest.requireActual('@/hooks/usePuzzleDefaults').usePuzzleDefaults
const playInMode = (mode: GameMode) => mockUsePuzzleDefaults.mockReturnValue({ mode, setMode: jest.fn(), difficulty: 'any', setDifficulty: jest.fn(), ready: true })
const mockGetPuzzleUnlockMap = jest.mocked(unlocks.getPuzzleUnlockMap)
const realGetPuzzleUnlockMap: typeof unlocks.getPuzzleUnlockMap = jest.requireActual('@/utils/unlocks').getPuzzleUnlockMap
const stats = () => store.getState().achievements.stats

// The puzzle's own mode is replaced by the player's saved default as the round starts (Classic
// here), so this one only matters for the mode-family tests below.
const visualMode: GameMode = {
  id: 'test-round-end-achievements-visual',
  label: 'Test Round End Achievements Visual',
  description: 'A test mode with artwork',
  category: 'parts',
  behavior: 'additive',
  maxMistakes: 6,
  hidden: true,
  Visual: (() => null) as unknown as GameMode['Visual']
}

// No packKey/puzzleId and no hint: a plain win, with nothing to unlock in the puzzle catalog and no
// hint to leave unrevealed.
const payload: GameStartPayload = { phrase: 'CAT', mode: visualMode, sourceMode: 'random', difficultyTier: 'easy' }

const renderApp = () =>
  render(
    <Providers>
      <Main />
    </Providers>
  )

type GetByText = Awaited<ReturnType<typeof renderApp>>['getByText']

const guess = async (getByText: GetByText, letters: string[]) => {
  for (const letter of letters) {
    await act(async () => {
      await fireEvent.press(getByText(letter))
    })
  }
}

const openRoundEndCard = async () => {
  await act(async () => {
    jest.advanceTimersByTime(WIN_DIALOG_DELAY_MS)
  })
}

// The real app store and provider: the round records through useGameStats and the card shows what
// came back. Every test starts from fresh stats.
describe('Main: achievement unlocks on the round-end card', () => {
  beforeEach(() => {
    mockResolvePuzzle.mockReset()
    mockResolvePuzzle.mockReturnValue({ ok: true, payload })
    mockGetPuzzleUnlockMap.mockReset().mockImplementation(realGetPuzzleUnlockMap)
    mockUsePuzzleDefaults.mockReset().mockImplementation(realUsePuzzleDefaults)
    store.dispatch(achievementsActions.reset())
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("lists a first flawless win's unlocks together, in catalog order, once the card opens and not before", async () => {
    const { getByText, getAllByText, queryByText } = await renderApp()

    await guess(getByText, ['C', 'A', 'T'])
    // Already recorded, but the card itself waits WIN_DIALOG_DELAY_MS (see Game.tsx).
    expect(queryByText('You Won!')).toBeNull()
    expect(queryByText('Flawless Victory')).toBeNull()

    await openRoundEndCard()
    expect(getByText('You Won!')).toBeTruthy()
    expect(getByText('Achievements Unlocked')).toBeTruthy()
    expect(getAllByText(/^(First Word|Solved It|Beginner's Luck|Flawless Victory)$/).map((node) => node.props.children)).toEqual(['First Word', 'Solved It', "Beginner's Luck", 'Flawless Victory'])
    expect(store.getState().achievements.stats.solo).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 })
  })

  it('shows no achievement callout on an ordinary win that unlocks nothing new', async () => {
    // One flawless win already behind the player, its unlocks already earned (the provider's mount
    // sweep records them).
    const afterFirstWin = applySoloRound(createDefaultStats(), { result: 'win', wrongGuesses: 0, guessCount: 3, hintAvailable: false, hintRevealed: false, completedPackKeys: [] })
    store.dispatch(achievementsActions.update({ stats: afterFirstWin }))
    const { getByText, queryByText } = await renderApp()

    // A wrong guess first, so this win isn't another flawless one.
    await guess(getByText, ['Z', 'C', 'A', 'T'])
    await openRoundEndCard()

    expect(getByText('You Won!')).toBeTruthy()
    expect(queryByText(/Achievements? Unlocked/)).toBeNull()
    expect(store.getState().achievements.stats.solo.wins).toBe(2)
  })

  it("shows a loss's unlock too: the very first puzzle played, lost", async () => {
    const { getByText, findByText, queryByText } = await renderApp()

    await guess(getByText, ['Q', 'W', 'E', 'R', 'Y', 'U'])
    await openRoundEndCard()

    expect(await findByText('You Lost!')).toBeTruthy()
    expect(getByText('Achievement Unlocked')).toBeTruthy()
    expect(getByText('First Word')).toBeTruthy()
    expect(queryByText("Beginner's Luck")).toBeNull()
    expect(store.getState().achievements.stats).toMatchObject({ solo: { played: 1, wins: 0, losses: 1, draws: 0 }, firstGameResult: 'loss', firstGameFlawless: false })
  })

  describe('what a win records', () => {
    const winCat = async (overrides: Partial<GameStartPayload>) => {
      mockResolvePuzzle.mockReturnValue({ ok: true, payload: { ...payload, ...overrides } })
      const { getByText } = await renderApp()
      await guess(getByText, ['C', 'A', 'T'])
      await openRoundEndCard()
    }

    it('counts the mode on screen toward the mode family', async () => {
      await winCat({})
      expect(stats().wonModeIds).toEqual([DEFAULT_MODE.id])
    })

    it('never counts a hidden mode (reachable only through a shared link)', async () => {
      playInMode(visualMode)
      await winCat({})
      expect(stats().wonModeIds).toEqual([])
    })

    // The board offers its Hint pill whenever there's a pack label or a hint behind it
    // (PuzzleInfoRow), so a win that never opened it counts even with no hint text.
    it('counts a no-hint win on a puzzle whose only hint is its pack label', async () => {
      await winCat({ packLabel: 'Animals' })
      expect(stats().noHintWins).toBe(1)
    })

    it("counts no no-hint win when there's no Hint pill at all", async () => {
      await winCat({})
      expect(stats().noHintWins).toBe(0)
    })

    it('credits every built-in pack the unlock map shows complete', async () => {
      const [pack] = puzzleManifest
      mockGetPuzzleUnlockMap.mockResolvedValue({ [pack.key]: Array.from({ length: pack.count }, (_, i) => `id-${i}`) })
      await winCat({})

      expect(stats().completedPackKeys).toEqual([pack.key])
    })
  })
})
