import { evaluateUnlockedIds } from '@tastic/achievements'

import { ACHIEVEMENT_CATALOG, VISIBLE_MODE_COUNT } from '@/constants/achievements'
import { VISIBLE_MODES } from '@/modes/registry'
import type { StatsState } from '@/types/stats'
import { createDefaultStats } from '@/utils/statsValidation'

const stats = (overrides: Partial<StatsState>): StatsState => ({ ...createDefaultStats(), ...overrides })
const unlockedBy = (overrides: Partial<StatsState>) => evaluateUnlockedIds(ACHIEVEMENT_CATALOG, stats(overrides))
const record = (played: number, wins: number) => ({ played, wins, losses: played - wins, draws: 0 })

describe('ACHIEVEMENT_CATALOG', () => {
  it('has unique ids, none with a colon (the package keys per-profile unlocks with one)', () => {
    const ids = ACHIEVEMENT_CATALOG.map((achievement) => achievement.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => id.includes(':'))).toEqual([])
  })

  it('gives every entry a title, description, icon and tier, and no dashes in its copy', () => {
    for (const achievement of ACHIEVEMENT_CATALOG) {
      expect(achievement.title.length).toBeGreaterThan(0)
      expect(achievement.description.length).toBeGreaterThan(0)
      expect(achievement.icon.length).toBeGreaterThan(0)
      expect(['bronze', 'silver', 'gold']).toContain(achievement.tier)
      expect(`${achievement.title} ${achievement.description}`).not.toMatch(/[\u2013\u2014]/)
    }
  })

  // Ids are permanent once the app ships: this pins the whole list, so a rename shows up here.
  it('has exactly the agreed ids, in order', () => {
    const tiers = (id: string) => [`${id}_bronze`, `${id}_silver`, `${id}_gold`]
    expect(ACHIEVEMENT_CATALOG.map((achievement) => achievement.id)).toEqual(['first_game_played', 'first_ever_win', 'flawless_debut', ...tiers('puzzles_solved'), ...tiers('puzzles_solved_veteran'), ...tiers('win_streak'), ...tiers('flawless'), ...tiers('no_hints_needed'), ...tiers('mode_explorer'), ...tiers('packs_completed'), 'first_custom_pack', ...tiers('packs_created'), ...tiers('local_matches'), ...tiers('days_played')])
  })

  it("counts the Customize carousel's modes the same as the registry does", () => {
    expect(VISIBLE_MODE_COUNT).toBe(VISIBLE_MODES.length)
  })

  it('unlocks nothing on fresh stats', () => {
    expect(unlockedBy({}).size).toBe(0)
  })

  it('keeps every progress fraction within 0..1', () => {
    const rich = stats({ solo: record(3000, 2600), flawlessWins: 70, wonModeIds: ['a', 'b', 'c', 'd'], pnp: record(40, 20), bestDayStreak: 9 })
    for (const achievement of ACHIEVEMENT_CATALOG) {
      const progress = achievement.progress?.(rich)
      if (progress === undefined) continue
      expect(progress).toBeGreaterThanOrEqual(0)
      expect(progress).toBeLessThanOrEqual(1)
    }
  })
})

describe('the first-game trio', () => {
  it('unlocks First Word for any first round, Pass & Play included', () => {
    expect(unlockedBy({ pnp: record(1, 0) }).has('first_game_played')).toBe(true)
  })

  it('unlocks Solved It for any first win, Pass & Play included', () => {
    expect(unlockedBy({ solo: record(1, 0) }).has('first_ever_win')).toBe(false)
    expect(unlockedBy({ pnp: record(1, 1) }).has('first_ever_win')).toBe(true)
  })

  it("unlocks Beginner's Luck only for a first puzzle solved with no wrong guess", () => {
    expect(unlockedBy({ solo: record(1, 1), firstGameResult: 'win', firstGameFlawless: false }).has('flawless_debut')).toBe(false)
    expect(unlockedBy({ solo: record(1, 1), firstGameResult: 'win', firstGameFlawless: true }).has('flawless_debut')).toBe(true)
  })
})

describe('the ladders', () => {
  it('end the solve ladders at 2,500 (no 5,000 and up)', () => {
    expect(unlockedBy({ solo: record(2499, 2499) }).has('puzzles_solved_veteran_gold')).toBe(false)
    expect(unlockedBy({ solo: record(2500, 2500) }).has('puzzles_solved_veteran_gold')).toBe(true)
    expect(ACHIEVEMENT_CATALOG.some((achievement) => achievement.id.startsWith('puzzles_solved_legend'))).toBe(false)
  })

  it('count only solo wins toward solving, never Pass & Play', () => {
    expect(unlockedBy({ pnp: record(10, 10) }).has('puzzles_solved_bronze')).toBe(false)
    expect(unlockedBy({ solo: record(12, 10) }).has('puzzles_solved_bronze')).toBe(true)
  })

  it('run the Pass & Play rounds ladder 5 / 25 / 100, wins and losses alike', () => {
    const at = (played: number) => unlockedBy({ pnp: record(played, 0) })
    expect(at(4).has('local_matches_bronze')).toBe(false)
    expect(at(5).has('local_matches_bronze')).toBe(true)
    expect(at(25).has('local_matches_silver')).toBe(true)
    expect(at(99).has('local_matches_gold')).toBe(false)
    expect(at(100).has('local_matches_gold')).toBe(true)
  })

  it('read the best solo streak, the flawless and no-hint counts, modes, packs and days', () => {
    const ids = unlockedBy({
      soloStreak: { currentWinStreak: 0, bestWinStreak: 10 },
      flawlessWins: 10,
      noHintWins: 25,
      wonModeIds: Array.from({ length: VISIBLE_MODE_COUNT }, (_, i) => `mode-${i}`),
      completedPackKeys: ['a', 'b', 'c', 'd', 'e'],
      customPacksCreated: 15,
      bestDayStreak: 14
    })
    for (const id of ['win_streak_silver', 'flawless_silver', 'no_hints_needed_silver', 'mode_explorer_gold', 'packs_completed_silver', 'first_custom_pack', 'packs_created_silver', 'days_played_silver']) expect(ids.has(id)).toBe(true)
    for (const id of ['win_streak_gold', 'flawless_gold', 'no_hints_needed_gold', 'packs_completed_gold', 'packs_created_gold', 'days_played_gold']) expect(ids.has(id)).toBe(false)
  })
})
