import type { AchievementDefinition as BaseAchievementDefinition, DayStreakState, OutcomeRecord, RoundResult, WinStreakState } from '@tastic/achievements'

export type { AchievementTier, UnlockedAchievementsState } from '@tastic/achievements'

// Everything the achievements catalog reads, kept by @tastic/achievements' slice (see
// src/redux/achievementsSlice.ts) and changed only through the pure funnel in src/utils/statsEngine.ts.
// There are no profiles: the whole device is one player.
export interface StatsState extends DayStreakState {
  // Solo rounds: catalog puzzles, custom packs and shared links. An abandoned round counts as a loss.
  solo: OutcomeRecord
  soloStreak: WinStreakState
  // Pass & Play rounds, from the guesser's side. They never touch the solo record or its streak.
  pnp: OutcomeRecord
  // Solo wins with no wrong guess, and solo wins whose hint was available but never revealed.
  flawlessWins: number
  noHintWins: number
  // Every visible mode a solo puzzle has been won in.
  wonModeIds: string[]
  // Built-in packs with every puzzle unlocked, as of the last solo win.
  completedPackKeys: string[]
  customPacksCreated: number
  // Solo letters guessed, and how many of them were in the answer.
  lettersGuessed: number
  lettersCorrect: number
  // The very first round on this device (solo or Pass & Play), and whether it was won without a
  // wrong guess (Flawless Debut).
  firstGameResult: RoundResult | null
  firstGameFlawless: boolean
}

export type AchievementDefinition = BaseAchievementDefinition<StatsState>

// What the round-end card needs to show a fresh unlock. An AchievementDefinition fits it.
export type UnlockedAchievement = Pick<AchievementDefinition, 'id' | 'icon' | 'title' | 'tier'>
