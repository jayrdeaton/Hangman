import { applyDayPlayed, applyResult, applyWinStreak, type RoundResult } from '@tastic/achievements'

import type { StatsState } from '@/types/stats'

// One finished solo round: a catalog puzzle, a custom-pack puzzle or a shared link. Losses include an
// abandoned round.
export type SoloRound =
  | {
      result: 'win'
      // Only set for a visible mode: a hidden one (reachable through a shared link) doesn't count
      // toward the mode family.
      modeId?: string
      wrongGuesses: number
      guessCount: number
      hintAvailable: boolean
      hintRevealed: boolean
      // Every built-in pack fully unlocked right now (see getCompletedBuiltInPackKeys), so a pack
      // finished through a backup import is credited on the next win too.
      completedPackKeys: string[]
    }
  | {
      result: 'loss'
      wrongGuesses: number
      guessCount: number
    }

// The first round on this device sets the first-game fields once; later rounds leave them alone.
const firstGameFields = (prev: StatsState, result: RoundResult, flawless: boolean): Pick<StatsState, 'firstGameResult' | 'firstGameFlawless'> => {
  const firstEver = prev.solo.played + prev.pnp.played === 0
  return firstEver ? { firstGameResult: result, firstGameFlawless: flawless } : { firstGameResult: prev.firstGameResult, firstGameFlawless: prev.firstGameFlawless }
}

const union = (existing: string[], added: string[]): string[] => {
  const missing = added.filter((item) => !existing.includes(item))
  return missing.length > 0 ? [...existing, ...missing] : existing
}

export const applySoloRound = (prev: StatsState, round: SoloRound, now: Date = new Date()): StatsState => {
  const won = round.result === 'win'
  const flawless = won && round.wrongGuesses === 0
  return {
    ...prev,
    solo: applyResult(prev.solo, round.result),
    soloStreak: applyWinStreak(prev.soloStreak, round.result),
    lettersGuessed: prev.lettersGuessed + round.guessCount,
    lettersCorrect: prev.lettersCorrect + Math.max(0, round.guessCount - round.wrongGuesses),
    ...(round.result === 'win'
      ? {
          flawlessWins: flawless ? prev.flawlessWins + 1 : prev.flawlessWins,
          noHintWins: round.hintAvailable && !round.hintRevealed ? prev.noHintWins + 1 : prev.noHintWins,
          wonModeIds: round.modeId ? union(prev.wonModeIds, [round.modeId]) : prev.wonModeIds,
          completedPackKeys: union(prev.completedPackKeys, round.completedPackKeys)
        }
      : {}),
    ...firstGameFields(prev, round.result, flawless),
    ...applyDayPlayed(prev, now)
  }
}

// A finished Pass & Play round, from the guesser's side. Only the Pass & Play record, the day streak
// and (on the very first round) the first-game fields change.
export const applyPnpRound = (prev: StatsState, result: 'win' | 'loss', wrongGuesses: number, now: Date = new Date()): StatsState => ({
  ...prev,
  pnp: applyResult(prev.pnp, result),
  ...firstGameFields(prev, result, result === 'win' && wrongGuesses === 0),
  ...applyDayPlayed(prev, now)
})

// A newly created custom pack (not an edit, and not a Pass & Play word kept to its pack).
export const applyCustomPackCreated = (prev: StatsState): StatsState => ({ ...prev, customPacksCreated: prev.customPacksCreated + 1 })

export const getTotalPlayed = (stats: StatsState): number => stats.solo.played + stats.pnp.played
export const getTotalWins = (stats: StatsState): number => stats.solo.wins + stats.pnp.wins
