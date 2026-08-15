import { VISIBLE_MODES } from '@/modes/registry'
import { clearAchievements, DEFAULT_ACHIEVEMENT_STATS, getAchievementStats, recordCustomPackCreated, recordLoss, recordPnpLoss, recordPnpWin, recordSolve, type SolveResult } from '@/utils/achievements'

let mockStore: Record<string, string>

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(Object.prototype.hasOwnProperty.call(mockStore, key) ? mockStore[key] : null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStore[key] = value
    return Promise.resolve(null)
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStore[key]
    return Promise.resolve(null)
  })
}))

const ACHIEVEMENTS_KEY = 'achievements_v1'

// A minimal neutral solve payload — no hint, no pack, one wrong guess out of six total guesses —
// that on its own shouldn't unlock anything besides milestones/streaks.
const neutralSolve = (modeId = 'neutral-mode'): SolveResult => ({
  modeId,
  wrongGuesses: 1,
  guessCount: 6,
  hintWasAvailable: false,
  hintRevealed: false
})

beforeEach(() => {
  mockStore = {}
})

describe('getAchievementStats', () => {
  it('returns default values when storage is empty', async () => {
    const stats = await getAchievementStats()
    expect(stats).toEqual(DEFAULT_ACHIEVEMENT_STATS)
  })

  it('returns defaults (not a throw) when the stored value is corrupted JSON', async () => {
    mockStore[ACHIEVEMENTS_KEY] = '{not valid json'

    const stats = await getAchievementStats()
    expect(stats).toEqual(DEFAULT_ACHIEVEMENT_STATS)
  })

  it('normalizes away a valid-JSON but invalid shape (array instead of object) rather than crashing', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify(['not', 'an', 'object'])

    const stats = await getAchievementStats()
    expect(stats).toEqual(DEFAULT_ACHIEVEMENT_STATS)
  })

  it('defaults totalLost/letters/pnp counters to 0 when reading an older stored shape that predates them', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 2, bestStreak: 4, totalSolved: 9 })

    const stats = await getAchievementStats()
    expect(stats.totalLost).toBe(0)
    expect(stats.lettersGuessed).toBe(0)
    expect(stats.lettersCorrect).toBe(0)
    expect(stats.pnpWins).toBe(0)
    expect(stats.pnpLosses).toBe(0)
    expect(stats.flawlessWins).toBe(0)
    expect(stats.noHintWins).toBe(0)
    expect(stats.customPacksCreated).toBe(0)
    // Untouched fields from the older shape still come through.
    expect(stats.currentStreak).toBe(2)
    expect(stats.bestStreak).toBe(4)
    expect(stats.totalSolved).toBe(9)
  })
})

describe('recordSolve — streaks and totals', () => {
  it('increments totalSolved and currentStreak, and tracks bestStreak as the max ever seen', async () => {
    await recordSolve(neutralSolve())
    await recordSolve(neutralSolve())
    await recordSolve(neutralSolve())

    let stats = await getAchievementStats()
    expect(stats.totalSolved).toBe(3)
    expect(stats.currentStreak).toBe(3)
    expect(stats.bestStreak).toBe(3)

    await recordLoss({ wrongGuesses: 6, guessCount: 6 })
    await recordSolve(neutralSolve())

    stats = await getAchievementStats()
    expect(stats.totalSolved).toBe(4)
    expect(stats.currentStreak).toBe(1)
    // bestStreak stays at the higher earlier value since the new streak hasn't caught up yet.
    expect(stats.bestStreak).toBe(3)

    await recordSolve(neutralSolve())

    stats = await getAchievementStats()
    expect(stats.currentStreak).toBe(2)
    expect(stats.bestStreak).toBe(3)
  })
})

describe('recordSolve — letters guessed/correct', () => {
  it('accumulates lettersGuessed and lettersCorrect (guessCount minus wrongGuesses) across calls', async () => {
    await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: false, hintRevealed: false })
    await recordSolve({ modeId: 'm', wrongGuesses: 0, guessCount: 4, hintWasAvailable: false, hintRevealed: false })

    const stats = await getAchievementStats()
    expect(stats.lettersGuessed).toBe(10)
    expect(stats.lettersCorrect).toBe(9)
  })
})

describe('recordSolve — mode_master', () => {
  // VISIBLE_MODES (what the picker actually offers), not ALL_MODES — a mode hidden from the
  // picker shouldn't hold this achievement hostage for anyone who could never select it to win
  // with in the first place. See registry.ts's own comment on VISIBLE_MODES.
  it('unlocks mode_master only after a distinct win has been recorded for every visible mode id', async () => {
    for (let i = 0; i < VISIBLE_MODES.length; i++) {
      const unlocked = await recordSolve(neutralSolve(VISIBLE_MODES[i].id))
      if (i < VISIBLE_MODES.length - 1) {
        expect(unlocked).not.toContain('mode_master')
      } else {
        expect(unlocked).toContain('mode_master')
      }
    }
  })
})

describe('recordSolve — flawless', () => {
  it('unlocks flawless when wrongGuesses is 0', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 0, guessCount: 5, hintWasAvailable: false, hintRevealed: false })
    expect(unlocked).toContain('flawless')
  })

  it('does not unlock flawless when wrongGuesses is greater than 0', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: false, hintRevealed: false })
    expect(unlocked).not.toContain('flawless')
  })

  it('tallies flawlessWins on every qualifying win, not just the first (unlike the unlockedIds badge)', async () => {
    await recordSolve({ modeId: 'm', wrongGuesses: 0, guessCount: 4, hintWasAvailable: false, hintRevealed: false })
    await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 5, hintWasAvailable: false, hintRevealed: false })
    await recordSolve({ modeId: 'm', wrongGuesses: 0, guessCount: 6, hintWasAvailable: false, hintRevealed: false })

    const stats = await getAchievementStats()
    expect(stats.flawlessWins).toBe(2)
    expect(stats.unlockedIds.filter((id) => id === 'flawless')).toHaveLength(1)
  })
})

describe('recordSolve — no_hints', () => {
  it('unlocks no_hints when hintWasAvailable is true and hintRevealed is false', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: true, hintRevealed: false })
    expect(unlocked).toContain('no_hints')
  })

  it('does not unlock no_hints when no hint existed at all', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: false, hintRevealed: false })
    expect(unlocked).not.toContain('no_hints')
  })

  it('does not unlock no_hints when the hint was revealed', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: true, hintRevealed: true })
    expect(unlocked).not.toContain('no_hints')
  })

  it('tallies noHintWins on every qualifying win, not just the first (unlike the unlockedIds badge)', async () => {
    await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: true, hintRevealed: false })
    await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: true, hintRevealed: true })
    await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: true, hintRevealed: false })

    const stats = await getAchievementStats()
    expect(stats.noHintWins).toBe(2)
    expect(stats.unlockedIds.filter((id) => id === 'no_hints')).toHaveLength(1)
  })
})

describe('recordSolve — pack_complete', () => {
  it('unlocks pack_complete when packUnlockedCount >= packTotalCount > 0', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: false, hintRevealed: false, packKey: 'animals', packUnlockedCount: 5, packTotalCount: 5 })
    expect(unlocked).toContain('pack_complete')
  })

  it('does not unlock pack_complete when packUnlockedCount < packTotalCount', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, guessCount: 6, hintWasAvailable: false, hintRevealed: false, packKey: 'animals', packUnlockedCount: 4, packTotalCount: 5 })
    expect(unlocked).not.toContain('pack_complete')
  })

  it('does not unlock pack_complete when packKey/packTotalCount are omitted', async () => {
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).not.toContain('pack_complete')
  })
})

describe('recordSolve — win_streak_5', () => {
  it('unlocks win_streak_5 after 5 consecutive recordSolve calls', async () => {
    let unlocked: string[] = []
    for (let i = 0; i < 5; i++) {
      unlocked = await recordSolve(neutralSolve())
    }
    expect(unlocked).toContain('win_streak_5')
  })

  it('a recordLoss in between resets progress toward win_streak_5', async () => {
    for (let i = 0; i < 4; i++) {
      await recordSolve(neutralSolve())
    }
    await recordLoss({ wrongGuesses: 6, guessCount: 6 })

    let unlocked: string[] = []
    for (let i = 0; i < 4; i++) {
      unlocked = await recordSolve(neutralSolve())
    }

    expect(unlocked).not.toContain('win_streak_5')
    const stats = await getAchievementStats()
    expect(stats.unlockedIds).not.toContain('win_streak_5')
  })
})

describe('recordSolve — win_streak_10 / win_streak_20', () => {
  it('unlocks win_streak_10 at the 10th consecutive win and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 9, bestStreak: 9, totalSolved: 9 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('win_streak_10')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 7, bestStreak: 7, totalSolved: 7 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('win_streak_10')
  })

  it('unlocks win_streak_20 at the 20th consecutive win and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 19, bestStreak: 19, totalSolved: 19 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('win_streak_20')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 17, bestStreak: 17, totalSolved: 17 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('win_streak_20')
  })
})

describe('recordLoss', () => {
  it('resets currentStreak to 0 but leaves totalSolved, bestStreak, and unlockedIds untouched', async () => {
    await recordSolve({ modeId: 'm', wrongGuesses: 0, guessCount: 5, hintWasAvailable: false, hintRevealed: false })
    await recordSolve(neutralSolve())

    const before = await getAchievementStats()
    expect(before.currentStreak).toBe(2)

    await recordLoss({ wrongGuesses: 6, guessCount: 6 })

    const after = await getAchievementStats()
    expect(after.currentStreak).toBe(0)
    expect(after.totalSolved).toBe(before.totalSolved)
    expect(after.bestStreak).toBe(before.bestStreak)
    expect(after.unlockedIds).toEqual(before.unlockedIds)
  })

  it("increments totalLost, and adds this round's guesses to lettersGuessed/lettersCorrect, on every call — even when currentStreak is already 0", async () => {
    await recordLoss({ wrongGuesses: 6, guessCount: 6 })
    const first = await getAchievementStats()
    expect(first.totalLost).toBe(1)
    expect(first.lettersGuessed).toBe(6)
    expect(first.lettersCorrect).toBe(0)

    await recordLoss({ wrongGuesses: 6, guessCount: 9 })
    const second = await getAchievementStats()
    expect(second.totalLost).toBe(2)
    expect(second.lettersGuessed).toBe(15)
    expect(second.lettersCorrect).toBe(3)
  })
})

describe('recordPnpWin / recordPnpLoss', () => {
  it('increments pnpWins/pnpLosses independently of every solo stat', async () => {
    await recordSolve(neutralSolve())
    await recordPnpWin()
    await recordPnpWin()
    await recordPnpLoss()

    const stats = await getAchievementStats()
    expect(stats.pnpWins).toBe(2)
    expect(stats.pnpLosses).toBe(1)
    // A pnp result never touches the solo counters.
    expect(stats.totalSolved).toBe(1)
    expect(stats.totalLost).toBe(0)
    expect(stats.currentStreak).toBe(1)
    expect(stats.lettersGuessed).toBe(6)
  })

  it('unlocks pnp_played_5 off total games played (wins + losses combined), not wins alone', async () => {
    await recordPnpWin()
    await recordPnpLoss()
    await recordPnpLoss()
    const early = await recordPnpWin()
    expect(early).not.toContain('pnp_played_5')

    // The 5th game overall is a LOSS, not a win — still crosses the threshold, confirming the
    // ladder counts total games played rather than wins alone.
    const unlocked = await recordPnpLoss()
    expect(unlocked).toContain('pnp_played_5')
  })

  it('unlocks pnp_played_25 / pnp_played_100 / pnp_played_250 as total games played crosses each threshold', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, pnpWins: 12, pnpLosses: 12 })
    const at25 = await recordPnpWin()
    expect(at25).toContain('pnp_played_25')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, pnpWins: 50, pnpLosses: 49 })
    const at100 = await recordPnpWin()
    expect(at100).toContain('pnp_played_100')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, pnpWins: 125, pnpLosses: 124 })
    const at250 = await recordPnpWin()
    expect(at250).toContain('pnp_played_250')
  })

  it('only returns a newly-unlocked pnp_played_* id on the call that first crosses its threshold', async () => {
    for (let i = 0; i < 4; i++) await recordPnpWin()
    const first = await recordPnpWin()
    expect(first).toContain('pnp_played_5')

    const second = await recordPnpWin()
    expect(second).not.toContain('pnp_played_5')
  })
})

describe('recordCustomPackCreated', () => {
  it('increments customPacksCreated on every call', async () => {
    await recordCustomPackCreated()
    await recordCustomPackCreated()

    const stats = await getAchievementStats()
    expect(stats.customPacksCreated).toBe(2)
  })

  it('unlocks packs_created_1 on the first call', async () => {
    const unlocked = await recordCustomPackCreated()
    expect(unlocked).toContain('packs_created_1')
  })

  it('unlocks packs_created_5 / packs_created_15 / packs_created_30 as the count crosses each threshold', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, customPacksCreated: 4 })
    const at5 = await recordCustomPackCreated()
    expect(at5).toContain('packs_created_5')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, customPacksCreated: 14 })
    const at15 = await recordCustomPackCreated()
    expect(at15).toContain('packs_created_15')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, customPacksCreated: 29 })
    const at30 = await recordCustomPackCreated()
    expect(at30).toContain('packs_created_30')
  })

  it('only returns packs_created_1 on the first call, not subsequent ones', async () => {
    const first = await recordCustomPackCreated()
    expect(first).toContain('packs_created_1')

    const second = await recordCustomPackCreated()
    expect(second).not.toContain('packs_created_1')
  })
})

describe('recordSolve — milestones', () => {
  it('unlocks milestone_10 at the 10th solve and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 9 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('milestone_10')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 7 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('milestone_10')
  })

  it('unlocks milestone_50 at the 50th solve and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 49 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('milestone_50')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 47 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('milestone_50')
  })

  it('unlocks milestone_100 at the 100th solve and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 99 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('milestone_100')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 97 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('milestone_100')
  })

  it('unlocks milestone_500 at the 500th solve and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 499 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('milestone_500')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 497 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('milestone_500')
  })

  it('unlocks milestone_1000 at the 1,000th solve and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 999 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('milestone_1000')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 997 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('milestone_1000')
  })

  it('unlocks milestone_2500 at the 2,500th solve and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 2499 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('milestone_2500')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 2497 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('milestone_2500')
  })

  it('unlocks milestone_5000 at the 5,000th solve and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 4999 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('milestone_5000')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 4997 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('milestone_5000')
  })

  it('unlocks milestone_10000 at the 10,000th solve and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 9999 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('milestone_10000')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 9997 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('milestone_10000')
  })

  it('unlocks milestone_20000 at the 20,000th solve and not before', async () => {
    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 19999 })
    const unlocked = await recordSolve(neutralSolve())
    expect(unlocked).toContain('milestone_20000')

    mockStore[ACHIEVEMENTS_KEY] = JSON.stringify({ unlockedIds: [], wonModeIds: [], currentStreak: 0, bestStreak: 0, totalSolved: 19997 })
    const early = await recordSolve(neutralSolve())
    expect(early).not.toContain('milestone_20000')
  })
})

describe('clearAchievements', () => {
  it('resets storage so getAchievementStats returns the default values again', async () => {
    await recordSolve(neutralSolve())

    await clearAchievements()

    const stats = await getAchievementStats()
    expect(stats).toEqual(DEFAULT_ACHIEVEMENT_STATS)
  })
})

describe('recordSolve — no re-adding already-unlocked ids', () => {
  it('only returns flawless in the returned array on the first of two qualifying calls', async () => {
    const first = await recordSolve({ modeId: 'm', wrongGuesses: 0, guessCount: 5, hintWasAvailable: false, hintRevealed: false })
    expect(first).toContain('flawless')

    const second = await recordSolve({ modeId: 'm', wrongGuesses: 0, guessCount: 5, hintWasAvailable: false, hintRevealed: false })
    expect(second).not.toContain('flawless')

    const stats = await getAchievementStats()
    expect(stats.unlockedIds.filter((id) => id === 'flawless')).toHaveLength(1)
  })
})
