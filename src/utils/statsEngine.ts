import { applyDayPlayed, applyResult, applyWinStreak, type RoundResult } from '@tastic/achievements'

import type { ProfileStats, StatsState } from '@/types/stats'
import { createDefaultProfileStats } from '@/utils/statsValidation'

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
      // Every built-in pack the winner has fully unlocked right now (see getCompletedBuiltInPackKeys,
      // over the winner's own unlocked puzzles), so a pack finished through a backup import is credited
      // on the next win too.
      completedPackKeys: string[]
    }
  | {
      result: 'loss'
      wrongGuesses: number
      guessCount: number
    }

// One finished Pass & Play round. The guesser played it, so the round is theirs (the Pass & Play
// record is kept from the guesser's side); the writer only played that day. Each is a profile's id,
// or null for a guest.
export type PnpRoundOutcome = {
  result: 'win' | 'loss'
  wrongGuesses: number
  guesserProfileId: string | null
  writerProfileId: string | null
}

// Every round lands in the device bucket (the whole device's record, and the guests', see
// types/stats.ts) and, when a profile played it, in that profile's own bucket too, through the same
// bump, so a profile's numbers mean exactly what the device's do. A guest (null) has no bucket.
const bumpProfile = (profiles: StatsState['profiles'], profileId: string | null, bump: (bucket: ProfileStats) => ProfileStats): StatsState['profiles'] => (profileId === null ? profiles : { ...profiles, [profileId]: bump(profiles[profileId] ?? createDefaultProfileStats()) })

const applyToOwner = (prev: StatsState, profileId: string | null, bump: <T extends ProfileStats>(bucket: T) => T): StatsState => ({ ...bump(prev), profiles: bumpProfile(prev.profiles, profileId, bump) })

// A bucket's first round sets its first-game fields once; later rounds leave them alone.
const firstGameFields = (prev: ProfileStats, result: RoundResult, flawless: boolean): Pick<ProfileStats, 'firstGameResult' | 'firstGameFlawless'> => {
  const firstEver = prev.solo.played + prev.pnp.played === 0
  return firstEver ? { firstGameResult: result, firstGameFlawless: flawless } : { firstGameResult: prev.firstGameResult, firstGameFlawless: prev.firstGameFlawless }
}

const union = (existing: string[], added: string[]): string[] => {
  const missing = added.filter((item) => !existing.includes(item))
  return missing.length > 0 ? [...existing, ...missing] : existing
}

const bumpSolo =
  (round: SoloRound, now: Date) =>
  <T extends ProfileStats>(prev: T): T => {
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

// A finished solo round, for the player whose round it was (null for the guest).
export const applySoloRound = (prev: StatsState, round: SoloRound, profileId: string | null, now: Date = new Date()): StatsState => applyToOwner(prev, profileId, bumpSolo(round, now))

// A finished Pass & Play round. Only the Pass & Play record, the day streak and (on a bucket's very
// first round) the first-game fields change, on the device bucket and the guesser's. The writer's
// bucket only marks the day played: writing a word is playing, but the round isn't theirs to win or
// lose, so it never reaches their record, their first game or their Pass & Play rounds.
export const applyPnpRound = (prev: StatsState, outcome: PnpRoundOutcome, now: Date = new Date()): StatsState => {
  const { result, wrongGuesses, guesserProfileId, writerProfileId } = outcome
  const bumpGuesser = <T extends ProfileStats>(bucket: T): T => ({ ...bucket, pnp: applyResult(bucket.pnp, result), ...firstGameFields(bucket, result, result === 'win' && wrongGuesses === 0), ...applyDayPlayed(bucket, now) })
  const guessed = applyToOwner(prev, guesserProfileId, bumpGuesser)
  return { ...guessed, profiles: bumpProfile(guessed.profiles, writerProfileId, (bucket) => ({ ...bucket, ...applyDayPlayed(bucket, now) })) }
}

// A newly created custom pack (not an edit, and not a Pass & Play word kept to its pack), for the player
// who made it.
export const applyCustomPackCreated = (prev: StatsState, profileId: string | null): StatsState => applyToOwner(prev, profileId, (bucket) => ({ ...bucket, customPacksCreated: bucket.customPacksCreated + 1 }))

// One profile's bucket as a whole StatsState, so the catalog's predicates read it exactly as they read
// the device's (the per-profile evaluation in useGameStats, and Stats' view of one profile).
export const getProfileStatsView = (profileStats: ProfileStats): StatsState => ({ ...profileStats, profiles: {} })

export const getTotalPlayed = (stats: ProfileStats): number => stats.solo.played + stats.pnp.played
export const getTotalWins = (stats: ProfileStats): number => stats.solo.wins + stats.pnp.wins
