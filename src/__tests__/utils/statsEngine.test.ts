import type { StatsState } from '@/types/stats'
import { applyCustomPackCreated, applyPnpRound, applySoloRound, getTotalPlayed, getTotalWins, type SoloRound } from '@/utils/statsEngine'
import { createDefaultStats, DEFAULT_STATS } from '@/utils/statsValidation'

const DAY = new Date(2026, 9, 15, 12)

const win = (overrides: Partial<Extract<SoloRound, { result: 'win' }>> = {}): SoloRound => ({ result: 'win', modeId: 'classic', wrongGuesses: 1, guessCount: 5, hintAvailable: false, hintRevealed: false, completedPackKeys: [], ...overrides })
const loss = (overrides: Partial<Extract<SoloRound, { result: 'loss' }>> = {}): SoloRound => ({ result: 'loss', wrongGuesses: 6, guessCount: 8, ...overrides })
const solo = (prev: StatsState, round: SoloRound, now = DAY) => applySoloRound(prev, round, now)

describe('applySoloRound', () => {
  it('counts a win on the solo record and streak, with its letters', () => {
    const next = solo(createDefaultStats(), win({ wrongGuesses: 2, guessCount: 7 }))

    expect(next.solo).toEqual({ played: 1, wins: 1, losses: 0, draws: 0 })
    expect(next.soloStreak).toEqual({ currentWinStreak: 1, bestWinStreak: 1 })
    expect(next).toMatchObject({ lettersGuessed: 7, lettersCorrect: 5 })
  })

  it('counts a loss (an abandoned round included) and breaks the streak, keeping the best', () => {
    let next = solo(createDefaultStats(), win())
    next = solo(next, win())
    next = solo(next, loss({ wrongGuesses: 1, guessCount: 1 }))

    expect(next.solo).toEqual({ played: 3, wins: 2, losses: 1, draws: 0 })
    expect(next.soloStreak).toEqual({ currentWinStreak: 0, bestWinStreak: 2 })
    expect(next).toMatchObject({ lettersGuessed: 11, lettersCorrect: 8 })
  })

  it('counts a flawless win only with no wrong guess', () => {
    expect(solo(createDefaultStats(), win({ wrongGuesses: 0 })).flawlessWins).toBe(1)
    expect(solo(createDefaultStats(), win({ wrongGuesses: 1 })).flawlessWins).toBe(0)
  })

  it("counts a no-hint win only when a hint was there to reveal and wasn't", () => {
    expect(solo(createDefaultStats(), win({ hintAvailable: true, hintRevealed: false })).noHintWins).toBe(1)
    expect(solo(createDefaultStats(), win({ hintAvailable: true, hintRevealed: true })).noHintWins).toBe(0)
    expect(solo(createDefaultStats(), win({ hintAvailable: false })).noHintWins).toBe(0)
  })

  it('collects each mode won once, and ignores a win with no counted mode', () => {
    let next = solo(createDefaultStats(), win({ modeId: 'classic' }))
    next = solo(next, win({ modeId: 'classic' }))
    next = solo(next, win({ modeId: 'robot' }))
    next = solo(next, win({ modeId: undefined }))

    expect(next.wonModeIds).toEqual(['classic', 'robot'])
  })

  it('takes the completed packs a win reports, keeping ones already credited', () => {
    let next = solo(createDefaultStats(), win({ completedPackKeys: ['movies'] }))
    next = solo(next, win({ completedPackKeys: ['movies', 'tvShows'] }))
    next = solo(next, win({ completedPackKeys: [] }))

    expect(next.completedPackKeys).toEqual(['movies', 'tvShows'])
  })

  it('leaves the win-only counters alone on a loss', () => {
    const before = solo(createDefaultStats(), win({ wrongGuesses: 0, hintAvailable: true, modeId: 'classic', completedPackKeys: ['movies'] }))
    const after = solo(before, loss())

    expect(after).toMatchObject({ flawlessWins: 1, noHintWins: 1, wonModeIds: ['classic'], completedPackKeys: ['movies'] })
  })

  it('never touches the Pass & Play record or the custom pack count', () => {
    const next = solo(createDefaultStats(), win())

    expect(next.pnp).toEqual(DEFAULT_STATS.pnp)
    expect(next.customPacksCreated).toBe(0)
  })
})

describe('the first game', () => {
  it('records the very first round, flawless if it was won with no wrong guess', () => {
    expect(solo(createDefaultStats(), win({ wrongGuesses: 0 }))).toMatchObject({ firstGameResult: 'win', firstGameFlawless: true })
    expect(solo(createDefaultStats(), win({ wrongGuesses: 1 }))).toMatchObject({ firstGameResult: 'win', firstGameFlawless: false })
    expect(solo(createDefaultStats(), loss())).toMatchObject({ firstGameResult: 'loss', firstGameFlawless: false })
  })

  it('is never overwritten by a later round', () => {
    const next = solo(solo(createDefaultStats(), loss()), win({ wrongGuesses: 0 }))

    expect(next).toMatchObject({ firstGameResult: 'loss', firstGameFlawless: false })
  })

  it("can be a Pass & Play round, which a later solo round doesn't replace", () => {
    const next = solo(applyPnpRound(createDefaultStats(), 'win', 0, DAY), win({ wrongGuesses: 3 }))

    expect(next).toMatchObject({ firstGameResult: 'win', firstGameFlawless: true })
  })
})

describe('applyPnpRound', () => {
  it('only changes the Pass & Play record, never the solo record, streak or letters', () => {
    let next = applyPnpRound(createDefaultStats(), 'win', 0, DAY)
    next = applyPnpRound(next, 'loss', 6, DAY)

    expect(next.pnp).toEqual({ played: 2, wins: 1, losses: 1, draws: 0 })
    expect(next).toMatchObject({ solo: DEFAULT_STATS.solo, soloStreak: DEFAULT_STATS.soloStreak, flawlessWins: 0, noHintWins: 0, lettersGuessed: 0, wonModeIds: [] })
  })
})

describe('the day streak', () => {
  it('counts a day once however many rounds it holds, Pass & Play included', () => {
    let next = solo(createDefaultStats(), win(), new Date(2026, 9, 15, 9))
    next = applyPnpRound(next, 'loss', 6, new Date(2026, 9, 15, 22))

    expect(next).toMatchObject({ distinctDaysPlayed: 1, currentDayStreak: 1 })
  })

  it('extends on a consecutive day and restarts after a gap, keeping the best', () => {
    let next = solo(createDefaultStats(), win(), new Date(2026, 9, 1))
    next = solo(next, win(), new Date(2026, 9, 2))
    expect(next.currentDayStreak).toBe(2)

    next = solo(next, win(), new Date(2026, 9, 10))
    expect(next).toMatchObject({ currentDayStreak: 1, bestDayStreak: 2, distinctDaysPlayed: 3 })
  })
})

describe('applyCustomPackCreated', () => {
  it('counts a new pack and nothing else', () => {
    const next = applyCustomPackCreated(applyCustomPackCreated(createDefaultStats()))

    expect(next).toEqual({ ...createDefaultStats(), customPacksCreated: 2 })
  })
})

describe('totals', () => {
  it('add solo and Pass & Play rounds together', () => {
    const next = applyPnpRound(solo(solo(createDefaultStats(), win()), loss()), 'win', 1, DAY)

    expect(getTotalPlayed(next)).toBe(3)
    expect(getTotalWins(next)).toBe(2)
  })
})

describe('createDefaultStats', () => {
  it('hands out fresh nested objects, so a round never writes into the shared default', () => {
    const a = createDefaultStats()
    const b = createDefaultStats()

    expect(a).toEqual(b)
    expect(a.solo).not.toBe(b.solo)
    expect(a.wonModeIds).not.toBe(b.wonModeIds)
    solo(DEFAULT_STATS, win())
    expect(DEFAULT_STATS.solo.played).toBe(0)
  })
})
