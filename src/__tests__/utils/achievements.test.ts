import { ALL_MODES } from '@/modes/registry'
import { clearAchievements, DEFAULT_ACHIEVEMENT_STATS, getAchievementStats, recordLoss, recordSolve, type SolveResult } from '@/utils/achievements'

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

// A minimal neutral solve payload — no hint, no pack, one wrong guess — that on its own
// shouldn't unlock anything besides milestones/streaks.
const neutralSolve = (modeId = 'neutral-mode'): SolveResult => ({
  modeId,
  wrongGuesses: 1,
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

    await recordLoss()
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

describe('recordSolve — mode_master', () => {
  it('unlocks mode_master only after a distinct win has been recorded for every mode id', async () => {
    for (let i = 0; i < ALL_MODES.length; i++) {
      const unlocked = await recordSolve(neutralSolve(ALL_MODES[i].id))
      if (i < ALL_MODES.length - 1) {
        expect(unlocked).not.toContain('mode_master')
      } else {
        expect(unlocked).toContain('mode_master')
      }
    }
  })
})

describe('recordSolve — flawless', () => {
  it('unlocks flawless when wrongGuesses is 0', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 0, hintWasAvailable: false, hintRevealed: false })
    expect(unlocked).toContain('flawless')
  })

  it('does not unlock flawless when wrongGuesses is greater than 0', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, hintWasAvailable: false, hintRevealed: false })
    expect(unlocked).not.toContain('flawless')
  })
})

describe('recordSolve — no_hints', () => {
  it('unlocks no_hints when hintWasAvailable is true and hintRevealed is false', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, hintWasAvailable: true, hintRevealed: false })
    expect(unlocked).toContain('no_hints')
  })

  it('does not unlock no_hints when no hint existed at all', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, hintWasAvailable: false, hintRevealed: false })
    expect(unlocked).not.toContain('no_hints')
  })

  it('does not unlock no_hints when the hint was revealed', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, hintWasAvailable: true, hintRevealed: true })
    expect(unlocked).not.toContain('no_hints')
  })
})

describe('recordSolve — pack_complete', () => {
  it('unlocks pack_complete when packUnlockedCount >= packTotalCount > 0', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, hintWasAvailable: false, hintRevealed: false, packKey: 'animals', packUnlockedCount: 5, packTotalCount: 5 })
    expect(unlocked).toContain('pack_complete')
  })

  it('does not unlock pack_complete when packUnlockedCount < packTotalCount', async () => {
    const unlocked = await recordSolve({ modeId: 'm', wrongGuesses: 1, hintWasAvailable: false, hintRevealed: false, packKey: 'animals', packUnlockedCount: 4, packTotalCount: 5 })
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
    await recordLoss()

    let unlocked: string[] = []
    for (let i = 0; i < 4; i++) {
      unlocked = await recordSolve(neutralSolve())
    }

    expect(unlocked).not.toContain('win_streak_5')
    const stats = await getAchievementStats()
    expect(stats.unlockedIds).not.toContain('win_streak_5')
  })
})

describe('recordLoss', () => {
  it('resets currentStreak to 0 but leaves totalSolved, bestStreak, and unlockedIds untouched', async () => {
    await recordSolve({ modeId: 'm', wrongGuesses: 0, hintWasAvailable: false, hintRevealed: false })
    await recordSolve(neutralSolve())

    const before = await getAchievementStats()
    expect(before.currentStreak).toBe(2)

    await recordLoss()

    const after = await getAchievementStats()
    expect(after.currentStreak).toBe(0)
    expect(after.totalSolved).toBe(before.totalSolved)
    expect(after.bestStreak).toBe(before.bestStreak)
    expect(after.unlockedIds).toEqual(before.unlockedIds)
  })

  it('is a no-op (does not write to storage) when currentStreak is already 0', async () => {
    await recordLoss()
    const first = await getAchievementStats()

    await recordLoss()
    const second = await getAchievementStats()

    expect(second).toEqual(first)
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
    const first = await recordSolve({ modeId: 'm', wrongGuesses: 0, hintWasAvailable: false, hintRevealed: false })
    expect(first).toContain('flawless')

    const second = await recordSolve({ modeId: 'm', wrongGuesses: 0, hintWasAvailable: false, hintRevealed: false })
    expect(second).not.toContain('flawless')

    const stats = await getAchievementStats()
    expect(stats.unlockedIds.filter((id) => id === 'flawless')).toHaveLength(1)
  })
})
